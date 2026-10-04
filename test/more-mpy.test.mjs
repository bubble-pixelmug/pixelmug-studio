import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import vm from 'node:vm';
import { BubbleBot } from '@jeejio-bubble/bot/sdk';
import PixelMugS1 from '@jeejio-bubble/bot/devices/pixelmug-s1';
import { inspectProject, validateProjectRun } from '../src/project.mjs';

const root = new URL('../getting-started/04-more-mpy/', import.meta.url);

test('more MPY project validates and default program matches the Bitcoin example', async () => {
  const project = await inspectProject(fileURLToPath(root));
  assert.equal(project.mpy, true);
  assert.equal(project.webRoot, '');
  await validateProjectRun(project.path, { bot: 'bot/index.js' });
  for (const name of ['__main__.py', 'mps.json']) {
    assert.equal(await readFile(new URL('mpy/' + name, root), 'utf8'),
      await readFile(new URL('exampleMPY/bitCoin/' + name, root), 'utf8'));
  }
});

test('more MPY Bot registers commands and installs only on explicit request', async () => {
  let bot;
  let timeout;
  class LocalBot extends BubbleBot {
    async setCommands(commands) { this.commands = commands; }
    async start() { bot = this; }
  }
  const source = (await readFile(new URL('bot/index.js', root), 'utf8')).replace(/^import .*;\r?\n/gm, '');
  await vm.runInNewContext('(async () => {' + source + '\n})()', {
    BubbleBot: LocalBot, PixelMugS1, console,
    setTimeout: fn => { timeout = fn; return 1; }, clearTimeout: () => {},
    process: { env: { BOT_TOKEN: 'test-only' } },
  });
  assert.deepEqual(Array.from(bot.commands, item => item.command), ['help', 'bindPixelMug', 'installMPY']);
  assert.equal(bot.devices.slotList().length, 1);
  const messages = [];
  let calls = 0;
  const ctx = { event: 'message', events: ['message:text'], message: { text: 'hello' },
    chat: { id: 'chat' }, sendText: async value => messages.push(value),
    sendBindDevice: async value => messages.push({ bind: value }) };
  bot.getBoundDevices = async () => [];
  bot.callDevice = async (chat, device, command) => {
    calls++;
    assert.equal(chat, ctx.chat);
    assert.equal(device.deviceId, 'mug-1');
    assert.deepEqual(JSON.parse(JSON.stringify(command)), {
      method: 'talMpyExecOneScript', params: { id: '', version: '' },
    });
    return { tal: { result: { value: 262 } } };
  };
  const send = async text => { ctx.message.text = text; await bot.dispatcher.dispatch(ctx); };
  await send('hello');
  assert.equal(messages.length, 0);
  await send('/help');
  assert.match(messages.pop(), /installMPY/);
  await send('/bindPixelMug');
  assert.equal(messages.pop().bind.actionButtonTitle, '关联 PixelMug');
  await send('/installMPY');
  assert.match(messages.pop().bind.content, /关联/);
  assert.equal(calls, 0);
  bot.getBoundDevices = async () => [{ deviceId: 'mug-1', slotId: 'slot-1' }];
  const notify = async (value, deviceId = 'mug-1', method = 'mpyVmEvent') => {
    await bot.dispatcher.dispatch({ event: 'device_notify', events: ['device_notify'],
      from: { id: deviceId }, tal: { notify: [{ method, params: { value } }] } });
  };
  await send('/installMPY');
  assert.equal(calls, 1);
  assert.match(messages.pop(), /已受理/);
  await send('/installMPY');
  assert.equal(calls, 1);
  assert.match(messages.pop(), /请等待/);
  const count = messages.length;
  await notify('MPS_IS_RUNNING', 'another-device');
  await notify('INSTALL_SUCCESS');
  assert.equal(messages.length, count);
  await notify('MPS_IS_RUNNING');
  assert.match(messages.pop(), /已在 PixelMug 上运行/);
  await notify('MPS_IS_RUNNING');
  assert.equal(messages.length, count);
  for (const [value, method, expected] of [
    ['INSTALL_FAIL', 'mpyVmEvent', /安装失败/],
    ['RUNNING_FAIL', 'mpyVmEvent', /运行失败/],
    ['bad script', 'mpyVmError', /bad script/],
  ]) {
    await send('/installMPY');
    await notify(value, 'mug-1', method);
    assert.match(messages.pop(), expected);
  }
  await send('/installMPY');
  timeout();
  await new Promise(resolve => setImmediate(resolve));
  assert.match(messages.pop(), /超时/);
  bot.callDevice = async () => ({ tal: { result: { return: 264 } } });
  await send('/installMPY');
  assert.match(messages.pop(), /已经在 PixelMug 上运行/);
  bot.callDevice = async () => {
    await notify('MPS_IS_RUNNING');
    return { tal: { result: { value: 262 } } };
  };
  await send('/installMPY');
  assert.match(messages.pop(), /已在 PixelMug 上运行/);
  bot.callDevice = async () => ({ tal: { result: { value: 999 } } });
  await send('/installMPY');
  assert.match(messages.pop(), /未接受.*999/);
  bot.callDevice = async () => { throw new Error('offline'); };
  await send('/installMPY');
  assert.match(messages.pop(), /安装失败：offline/);
});

test('Bitcoin MPY subscribes, renders ticker prices and releases resources on error', () => {
  const python = String.raw`
import asyncio, json, runpy, sys, types
frames, subscriptions, closed, destroyed = [], [], [], []
proxies = []
pyxel = types.ModuleType("micropyxel")
pyxel.init = lambda **kw: None
pyxel.cls = lambda color: None
pyxel.text = lambda x, y, text, color: frames.append((text, color))
pyxel.render_graphics = lambda: None
pyxel.destroy = lambda: destroyed.append(True)
sys.modules["micropyxel"] = pyxel
payloads = [
    {"method": "subscribe", "success": True},
    {"channel": "heartbeat"},
    {"channel": "ticker", "data": [{"symbol": "BTC/USD", "last": 12345.67}]},
    {"channel": "ticker", "data": [{"symbol": "BTC/USD", "last": 123456.78}]},
]
class Connection:
    async def __aenter__(self): return self
    async def __aexit__(self, *args): closed.append(True)
    async def send_json(self, value): subscriptions.append(value)
    def __aiter__(self): return self
    async def __anext__(self):
        if not payloads: raise StopAsyncIteration
        return types.SimpleNamespace(type=1, data=json.dumps(payloads.pop(0)))
def ws_connect(url, **options):
    assert url == "wss://ws.kraken.com/v2"
    proxies.append(options.get("proxy"))
    return Connection()
module = types.ModuleType("mps_websocket")
module.ws_connect = ws_connect
sys.modules["mps_websocket"] = module
namespace = runpy.run_path(sys.argv[1])
assert subscriptions[0]["params"]["symbol"] == ["BTC/USD"]
assert subscriptions[0]["params"]["snapshot"] is True
assert ("12345.67", 11) in frames
assert ("123457", 11) in frames
assert len(closed) == len(destroyed) == 1
assert proxies == [None]
asyncio.run(namespace["main"](proxy="http://192.0.2.1:7890"))
assert proxies[-1] == "http://192.0.2.1:7890"
payloads.append({"method": "subscribe", "success": False})
try:
    runpy.run_path(sys.argv[1])
    raise AssertionError("subscription failure should propagate")
except RuntimeError:
    pass
assert len(closed) == len(destroyed) == 3
`;
  const result = spawnSync('python', ['-c', python, fileURLToPath(new URL('exampleMPY/bitCoin/__main__.py', root))], { encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr || result.stdout);
});
