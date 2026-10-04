import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, mkdtemp, cp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import vm from 'node:vm';
import { BubbleBot, InlineKeyboard } from '@jeejio-bubble/bot/sdk';
import PixelMug from '@jeejio-bubble/bot/devices/pixelmug/ext';
import PixelMugS1 from '@jeejio-bubble/bot/devices/pixelmug-s1';
import { inspectProject, validateProjectRun } from '../src/project.mjs';
import { startStudio } from '../src/receiver.mjs';

const root = new URL('../getting-started/', import.meta.url);
const path = (name) => fileURLToPath(new URL(name, root));
async function execute(name, globals) {
  const source = (await readFile(path(name), 'utf8')).replace(/^import .*;\r?\n/gm, '');
  return vm.runInNewContext(`(async () => { ${source}\n })()`, globals, { filename: name });
}
async function botFor(name) {
  let bot;
  class LocalBot extends BubbleBot { async setCommands(commands) { this.commands = commands; } async start() { bot = this; return this; } }
  await execute(`${name}/bot/index.js`, {
    BubbleBot: LocalBot, InlineKeyboard, PixelMug, PixelMugS1, console,
    process: { env: { BOT_TOKEN: 'test-only', STUDIO_WEBAPP_URL: 'http://studio.test/app/' } },
  });
  return bot;
}
function ui() {
  const elements = Object.fromEntries(
    ['text', 'font-size', 'color', 'scroll', 'direction', 'speed', 'speed-value',
      'send', 'status', 'connect', 'pad', 'dot'].map(id => [id, { style: {}, disabled: id === 'send' }])
  );
  elements.text.value = 'Hello PixelMug';
  elements['font-size'].value = 'MEDIUM';
  elements.color.value = '#00ff00';
  elements.scroll.checked = true;
  elements.direction.value = '1';
  elements.speed.value = '80';
  elements.pad.getBoundingClientRect = () => ({ left: 0, top: 0, width: 320, height: 160 });
  elements.pad.setPointerCapture = () => {};
  return { elements, document: { querySelector: selector => elements[selector.slice(1)] } };
}

test('getting-started projects pass Studio validation and serve their WebApp/SDK assets', async () => {
  for (const [name, hasWeb, hasMpy] of [['01-chat', false, false], ['02-pixel-text', true, false], ['03-ble-play', true, true]]) {
    const project = await inspectProject(path(name));
    assert.equal(project.bot, 'bot/index.js');
    assert.equal(Boolean(project.webRoot), hasWeb);
    assert.equal(project.mpy, hasMpy);
    await validateProjectRun(project.path, { bot: project.bot });
    const bot = await botFor(name);
    assert.equal(bot.devices.slotList().length, 1);
    if (!hasWeb) continue;
    const fixture = await mkdtemp(join(tmpdir(), 'studio-getting-started-'));
    await cp(join(project.path, 'webapp'), join(fixture, 'webapp'), { recursive: true });
    const studio = await startStudio({ project: fixture, webRoot: 'webapp', port: 0, bind: '127.0.0.1' });
    try {
      const html = await (await fetch(studio.baseUrl + '/app/')).text();
      const assets = [...html.matchAll(/(?:src|href)="(\.\/assets\/[^" ]+)"/g)].map(match => '/app/' + match[1].slice(2));
      assert.ok(assets.some(asset => asset.endsWith('.js')));
      for (const asset of ['/app/', ...assets]) {
        assert.equal((await fetch(studio.baseUrl + asset)).status, 200, `${name}: ${asset}`);
      }
    } finally { await studio.close(); await rm(fixture, { recursive: true, force: true }); }
  }
});

test('chat guides binding, displays text, and reports final RPC failure', async () => {
  const bot = await botFor('01-chat');
  assert.deepEqual(JSON.parse(JSON.stringify(bot.commands)), [
    { command: 'help', description: '了解这个 Bot 的使用方法' },
    { command: 'bindPixelMug', description: '关联你的 PixelMug' },
  ]);
  const messages = [];
  const ctx = { event: 'message', events: ['message:text'], message: { text: ' hello ' }, chat: { id: 'chat' },
    sendText: async text => messages.push(text),
    sendBindDevice: async options => messages.push({ bind: options }) };
  bot.isDeviceBound = async () => false;
  await bot.dispatcher.dispatch(ctx);
  assert.match(messages.pop().bind.content, /关联/);
  ctx.message.text = '/help';
  await bot.dispatcher.dispatch(ctx);
  assert.match(messages.pop(), /bindPixelMug/);
  ctx.message.text = '/bindPixelMug';
  await bot.dispatcher.dispatch(ctx);
  assert.equal(messages.pop().bind.actionButtonTitle, '关联 PixelMug');
  bot.isDeviceBound = async () => true;
  ctx.message.text = ' hello ';
  bot.devices.list()[0].rpc.talPrintText = async params => { assert.equal(params.text, 'hello'); return { method: 'print', params }; };
  bot.callDevice = async () => ({});
  await bot.dispatcher.dispatch(ctx);
  assert.match(messages.pop(), /hello/);
  bot.callDevice = async () => { throw new Error('offline'); };
  await bot.dispatcher.dispatch(ctx);
  assert.match(messages.pop(), /offline/);
});

test('pixel text WebApp gets its device and calls talPrintText directly', async () => {
  const bot = await botFor('02-pixel-text');
  assert.equal(bot.webAppRequestHandlers.size, 0);
  assert.deepEqual(JSON.parse(JSON.stringify(bot.commands)), [
    { command: 'help', description: '了解这个 Bot 的使用方法' },
    { command: 'bindPixelMug', description: '关联你的 PixelMug' },
    { command: 'webApp', description: '打开 PixelMug 文字控制器' },
  ]);

  const messages = [];
  const ctx = { event: 'message', events: ['message:text'], message: { text: 'hello' },
    sendText: async text => messages.push(text),
    sendBindDevice: async options => messages.push({ bind: options }),
    sendKeyboard: async (text, keyboard) => messages.push({ text, keyboard }) };
  await bot.dispatcher.dispatch(ctx);
  assert.equal(messages.length, 0);
  ctx.message.text = '/help';
  await bot.dispatcher.dispatch(ctx);
  assert.match(messages.pop(), /bindPixelMug.*webApp/s);
  ctx.message.text = '/bindPixelMug';
  await bot.dispatcher.dispatch(ctx);
  assert.equal(messages.pop().bind.actionButtonTitle, '关联 PixelMug');
  ctx.message.text = '/webApp';
  await bot.dispatcher.dispatch(ctx);
  assert.match(JSON.stringify(messages.pop()), /http:\/\/studio.test\/app\//);

  const { elements, document } = ui();
  let printParams;
  let calledDevice;
  let calledRpc;
  const rpc = { method: 'talPrintWithRemoteFont', params: { text: 'Hello PixelMug' } };
  class PixelMugSdk {
    rpc = {
      talPrintText: async params => {
        printParams = params;
        return rpc;
      },
    };
  }
  class WebApp {
    async getDevices() {
      return [{ slotId: 'slot', talId: 'PixelMugS1', name: 'Mug' }];
    }
    async callDevice(device, value) {
      calledDevice = device;
      calledRpc = value;
    }
  }

  await execute('02-pixel-text/webapp/main.js', {
    BubbleWebApp: WebApp,
    rpc: new PixelMugSdk().rpc,
    document,
  });
  await elements.send.onclick();

  assert.equal(calledDevice.slotId, 'slot');
  assert.equal(calledRpc, rpc);
  assert.deepEqual(JSON.parse(JSON.stringify(printParams)), {
    text: 'Hello PixelMug',
    specifications: 'MEDIUM',
    color: '#00ff00',
    direction: 1,
    speed: 80,
  });

  elements.scroll.checked = false;
  elements.scroll.onchange();
  await elements.send.onclick();
  assert.equal(printParams.direction, 0);
  assert.equal(elements.direction.disabled, true);
  assert.equal(elements.speed.disabled, true);
  assert.equal(elements.send.disabled, false);
});

test('BLE touchpad sends bounded movement and tap packets and cleans up', async () => {
  const { elements, document } = ui();
  let tick, leave, client, stopped = false, cleared = false, failConnect = false;
  const packets = [];
  class WebApp { ble = {}; async getDevices() { return [{ slotId: 'slot' }]; } stop() { stopped = true; } }
  class Client {
    constructor(ble, options) { assert.equal(options.appId, 'GettingStartedLight'); client = this; }
    on(type, handler) { this.stateHandler = handler; }
    async connect() {
      assert.equal(elements.connect.textContent, '连接中');
      assert.equal(elements.connect.disabled, true);
      if (failConnect) throw new Error('BLE connect timed out');
      this.ready = true;
    }
    async sendSimpleRaw(packet) { packets.push(Array.from(packet)); }
    close() { this.ready = false; }
  }
  await execute('03-ble-play/webapp/main.js', { BubbleWebApp: WebApp, BleAppClient: Client, document,
    setInterval: fn => { tick = fn; return 1; }, clearInterval: () => { cleared = true; },
    window: { addEventListener: (type, fn) => { leave = fn; } }, Uint8Array });
  assert.equal(elements.connect.textContent, '蓝牙连接 PixelMug');
  await elements.connect.onclick();
  assert.equal(elements.connect.textContent, '已连接BLE，可以开始体验');
  assert.equal(elements.connect.className, 'primary connected');
  elements.pad.onpointerdown({ pointerId: 1, clientX: 500, clientY: -10 });
  await tick();
  assert.deepEqual(packets[0], [1, 31, 0]);
  elements.pad.onpointerup({ clientX: 500, clientY: -10 });
  await tick();
  assert.deepEqual(packets[1], [2, 31, 0]);
  client.stateHandler({ connection: 'disconnected' });
  assert.equal(elements.connect.disabled, false);
  assert.equal(elements.connect.textContent, '蓝牙连接 PixelMug');
  assert.equal(elements.connect.className, 'primary');
  failConnect = true;
  await elements.connect.onclick();
  assert.equal(elements.connect.textContent, '蓝牙连接 PixelMug');
  assert.equal(elements.connect.disabled, false);
  leave();
  assert.equal(stopped && cleared, true);
});

test('MPY consumes the same packet format and renders/cleans up using component contracts', () => {
  const python = String.raw`
import runpy, sys, types
pyxel = types.ModuleType('micropyxel')
pyxel.init = lambda **kw: None
pyxel.cls = lambda color: None
pyxel.rect = lambda *args: None
points = []
pyxel.pset = lambda *args: points.append(args)
pyxel.destroy = lambda: None
pyxel.run = lambda update, draw, **kw: None
sys.modules['micropyxel'] = pyxel
module = types.ModuleType('maopaoBleApp')
class Service:
    def __init__(self, app_id): assert app_id == 'GettingStartedLight'
    def on_simple(self, callback): self.callback = callback
    def start(self): pass
    def poll(self): pass
    def deinit(self): pass
module.BleAppService = Service
module.DATA_TYPE_RAW = 0
sys.modules['maopaoBleApp'] = module
app = runpy.run_path(sys.argv[1])
receive = app['receive']
receive(0, bytes([1, 7, 9]), {})
state = receive.__globals__
assert (state['x'], state['y']) == (7, 9)
receive(0, bytes([2, 16, 8]), {})
assert state['spark'] == 12
app['update'](None)
app['draw'](None)
assert len(points) == 8
app['close'](None, None, None)
`;
  const result = spawnSync('python', ['-c', python, path('03-ble-play/mpy/__main__.py')], { encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr);
});
