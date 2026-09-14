import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, rm, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawn } from 'node:child_process';
import WebSocket from 'ws';
import { CreatorClient } from '../src/creator.mjs';
import { startWorkbench } from '../src/workbench.mjs';
const sleep = ms => new Promise(r => setTimeout(r, ms));
function upstream() {
  const calls = [], state = { devices: [{ id: 'cup-one', name: '测试杯', sn: 'S001', online: 'ONLINE' }], expired: false };
  const fetchImpl = async (url, options) => {
    calls.push({ url, ...options, body: options.body ? JSON.parse(options.body) : undefined });
    if (state.expired) return Response.json({ code: 401 }, { status: 401 });
    if (url.endsWith('/login')) return Response.json({ code: 200, result: { id: 'user-one', name: '测试开发者', token: 'private-creator-token' } });
    if (url.endsWith('/devices')) { assert.equal(options.headers.token, 'private-creator-token'); return Response.json({ code: 200, result: state.devices }); }
    return Response.json({ code: 200 });
  };
  return { fetchImpl, calls, state };
}
const login = { baseUrl: 'https://creator.example.test', accountType: 'EMAIL', account: 'dev@example.test', code: '123456' };
async function fixture(t) {
  const root = await mkdtemp(join(tmpdir(), 'studio-workbench-'));
  await mkdir(join(root, 'bot')); await mkdir(join(root, 'webapp')); await mkdir(join(root, 'mpy'));
  await writeFile(join(root, 'webapp', 'index.html'), '<!doctype html><title>Test project</title>');
  await writeFile(join(root, 'mpy', '__main__.py'), 'print("test")');
  await writeFile(join(root, 'mpy', 'mps.json'), '{}');
  await writeFile(join(root, 'bot/index.js'), 'console.log("workbench bot ready"); setInterval(() => {}, 1000);');
  const mock = upstream();
  const app = await startWorkbench({ port: 0, initialDirectory: root, fetchImpl: mock.fetchImpl, webAppHostname: '127.0.0.1', mdns: false });
  const url = new URL(app.studioUrl), token = new URLSearchParams(url.hash.slice(1)).get('studioToken');
  async function api(path, body, credential = token, extras = {}) {
    const response = await fetch(url.origin + '/api/' + path, { method: body === undefined ? 'GET' : 'POST', headers: { Authorization: 'Bearer ' + credential, 'Content-Type': 'application/json', ...extras }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
    return { status: response.status, data: await response.json() };
  }
  const cleanup = {};
  t.after(async () => { await cleanup.browser?.(); await app.close(); await rm(root, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 }); });
  return { root, app, api, mock, token, origin: url.origin, cleanup };
}
test('Creator contract: CODE login, token header, fresh ownership/online checks and logout', async () => {
  const mock = upstream(), client = new CreatorClient({ fetchImpl: mock.fetchImpl });
  await client.sendCode(login); await client.login(login);
  assert.deepEqual(mock.calls[0].body, { accountType: 'EMAIL', email: login.account });
  assert.equal(mock.calls[1].body.loginType, 'CODE');
  assert.equal(mock.calls[1].body.code, '123456');
  assert.ok(!JSON.stringify(client.publicSession()).includes('private-creator-token'));
  assert.deepEqual(await client.authorize({ deviceId: 'cup-one', slotId: 'dynamic-slot' }), { deviceId: 'cup-one', slotId: 'dynamic-slot' });
  mock.state.devices[0].online = 'OFFLINE';
  await assert.rejects(client.authorize({ deviceId: 'cup-one', slotId: 'dynamic-slot' }), /离线/);
  assert.deepEqual(await client.authorize({ deviceId: 'cup-one', slotId: 'dynamic-slot' }, { allowOffline: true }), { deviceId: 'cup-one', slotId: 'dynamic-slot' });
  mock.state.devices = [];
  await assert.rejects(client.authorize({ deviceId: 'cup-one', slotId: 'dynamic-slot' }), /未绑定/);
  await client.logout(); assert.equal(client.session, null); assert.equal(mock.calls.at(-1).headers.token, 'private-creator-token');
});
test('expired Creator credentials clear identity and device list', async () => {
  const mock = upstream(), client = new CreatorClient({ fetchImpl: mock.fetchImpl });
  await client.login(login); await client.refresh(); mock.state.expired = true;
  await assert.rejects(client.refresh(), /过期/); assert.equal(client.session, null); assert.deepEqual(client.devices, []);
});
test('workbench rejects unauthenticated and foreign origin management access', async t => {
  const f = await fixture(t);
  assert.equal((await f.api('state', undefined, 'bad')).status, 401);
  assert.equal((await f.api('state', undefined, f.token, { Origin: 'https://evil.example' })).status, 403);
  assert.equal((await f.api('run/start', {})).status, 400);
  assert.equal((await f.api('directories')).data.path, f.root);
});
test('project validation requires bot/ and complete optional MPY files', async t => {
  const f = await fixture(t);
  await f.api('auth/login', login);
  await rm(join(f.root, 'bot'), { recursive:true, force:true });
  let result = await f.api('project/open', { path:f.root });
  assert.equal(result.status, 400); assert.match(JSON.stringify(result.data), /bot\/ 文件夹/);
  await mkdir(join(f.root, 'bot')); await writeFile(join(f.root, 'bot', 'custom.mjs'), 'setInterval(() => {}, 1000)');
  await rm(join(f.root, 'mpy', 'mps.json'));
  result = await f.api('project/open', { path:f.root });
  assert.equal(result.status, 400); assert.match(JSON.stringify(result.data), /mpy\/mps.json/);
  await writeFile(join(f.root, 'mpy', 'mps.json'), '{invalid');
  result = await f.api('project/open', { path:f.root });
  assert.equal(result.status, 400); assert.match(JSON.stringify(result.data), /合法的 JSON/);
  await writeFile(join(f.root, 'mpy', 'mps.json'), '{}');
  result = await f.api('project/open', { path:f.root });
  assert.equal(result.status, 200); assert.equal(result.data.bot, '');
  assert.equal((await f.api('run/start', {bot:''})).status, 400);
  assert.equal((await f.api('run/start', {bot:'webapp/index.html'})).status, 400);
  assert.equal((await f.api('run/start', {bot:'bot/custom.mjs'})).status, 200);
});
test('project run lifecycle, separate WebApp credentials, logs, restart cursor and logout', async t => {
  const f = await fixture(t);
  await f.api('auth/login', login); await f.api('devices/refresh', {});
  const before = (await f.api('state')).data;
  assert.equal(before.devices[0].id, 'cup-one'); assert.ok(!JSON.stringify(before).includes('private-creator-token'));
  assert.equal((await f.api('project/open', { path: f.root })).data.bot, 'bot/index.js');
  const args = { bot: 'bot/index.js', webRoot: 'webapp', botToken: 'private-bot-token' };
  assert.equal((await f.api('run/start', { ...args, bot: 'webapp/index.html' })).status, 400);
  const first = await f.api('run/start', args); assert.equal(first.status, 200);
  assert.equal((await f.api('project/open', { path: f.root })).status, 400);
  let snapshot;
  for (let i=0;i<50;i++) { snapshot = (await f.api('state')).data; if(snapshot.events.records.some(r=>r.message.includes('workbench bot ready'))) break; await sleep(100); }
  assert.ok(snapshot.events.records.some(r=>r.message.includes('workbench bot ready')));
  const appURL = new URL(snapshot.run.webAppUrl), appToken = new URLSearchParams(appURL.hash.slice(1)).get('studioToken');
  const stableWebAppUrl = snapshot.run.webAppUrl;
  assert.equal((await f.api('state', undefined, appToken)).status, 401);
  const submit = ref => fetch(appURL.origin + '/api/launch', { method:'POST', headers:{Authorization:'Bearer '+appToken,'Content-Type':'application/json'}, body:JSON.stringify({op:'launch',runId:snapshot.run.runId,clientId:'test-web',ownerId:'owner',device:ref}) });
  const denied = await submit({deviceId:'not-mine',slotId:'any'}); assert.equal(denied.status,400); assert.match(JSON.stringify(await denied.json()),/未绑定/);
  f.mock.state.devices[0].online = 'OFFLINE';
  const offline = await submit({deviceId:'cup-one',slotId:'any'}); assert.equal(offline.status,400); assert.match(JSON.stringify(await offline.json()),/离线/);
  f.mock.state.devices[0].online = 'ONLINE';
  const second = await f.api('run/start', args); assert.equal(second.status, 200); assert.notEqual(second.data.runId, first.data.runId);
  const restartedState = (await f.api('state')).data; assert.equal(restartedState.run.webAppUrl, stableWebAppUrl);
  let next;
  for(let i=0;i<50;i++){ next = (await f.api('state?after=99999&runId='+first.data.runId)).data; if(next.events.records.length) break; await sleep(100); }
  assert.ok(next.events.records.length > 0, 'new run does not inherit old cursor');
  const logs = await readFile(join(second.data.debugDir,'events.jsonl'),'utf8'); assert.ok(!logs.includes('private-bot-token'));
  await f.api('auth/logout', {}); const end = (await f.api('state')).data; assert.equal(end.user,null); assert.equal(end.run,null);
  const stoppedPage = await fetch(stableWebAppUrl); assert.equal(stoppedPage.status, 503); assert.match(await stoppedPage.text(), /智能体尚未运行/);
});

test('restarting after page reload retains bot credentials and exposes only non-secret configuration', async t => {
  const f = await fixture(t);
  await writeFile(join(f.root, 'bot/index.js'), 'console.log("configured", process.env.BOT_TOKEN === "private-bot-token", process.env.BOT_API_BASE_URL); setInterval(() => {}, 1000);');
  await f.api('auth/login', login);
  await f.api('project/open', { path: f.root });
  const args = { bot: 'bot/index.js', autoRunMpy: true, botToken: 'private-bot-token', botApiBaseUrl: 'https://bot.example.test/im' };
  assert.equal((await f.api('run/start', args)).status, 200);
  const state = (await f.api('state')).data;
  assert.equal(state.runtimeConfig.hasBotToken, true);
  assert.equal(state.runtimeConfig.botApiBaseUrl, args.botApiBaseUrl);
  assert.equal(state.runtimeConfig.autoRunMpy, true);
  assert.ok(!JSON.stringify(state).includes('private-bot-token'));
  assert.equal((await f.api('run/start', { ...args, botToken: '', botApiBaseUrl: state.runtimeConfig.botApiBaseUrl })).status, 200);
  let next;
  for (let i=0;i<50;i++) { next = (await f.api('state')).data; if(next.events.records.some(r => r.message.includes('configured true'))) break; await sleep(100); }
  assert.ok(next.events.records.some(r => r.message.includes('configured true https://bot.example.test/im')));
  await f.api('auth/logout', {});
  assert.equal((await f.api('state')).data.runtimeConfig.botApiBaseUrl, '');
});

test('real browser: login, directory picker, debug run and log filters', { skip: !process.env.STUDIO_TEST_BROWSER, timeout: 40000 }, async t => {
  const f = await fixture(t), profile = join(f.root, 'chrome-profile');
  const child = spawn(process.env.STUDIO_TEST_BROWSER, ['--headless','--disable-gpu','--no-first-run','--no-default-browser-check','--disable-background-networking','--disable-component-update','--disable-sync','--remote-debugging-port=0','--user-data-dir='+profile,'--window-size=1440,1050','about:blank'], { windowsHide:true, stdio:'ignore' });
  f.cleanup.browser = async () => { child.kill(); await sleep(500); };
  let port;
  for(let i=0;i<100;i++){ try { port=Number((await readFile(join(profile,'DevToolsActivePort'),'utf8')).split('\n')[0]); break; } catch { await sleep(100); } }
  assert.ok(port,'Chrome started');
  const pages = await (await fetch('http://127.0.0.1:'+port+'/json/list')).json();
  const ws = new WebSocket(pages.find(p=>p.type==='page').webSocketDebuggerUrl);
  await new Promise((r,j)=>{ws.once('open',r);ws.once('error',j);}); t.after(()=>ws.close());
  let serial=0; const pending = new Map();
  ws.on('message',raw=>{const msg=JSON.parse(raw);if(msg.id){const p=pending.get(msg.id);pending.delete(msg.id);msg.error?p.reject(new Error(msg.error.message)):p.resolve(msg.result);}});
  const send=(method,params={})=>new Promise((resolve,reject)=>{const id=++serial;pending.set(id,{resolve,reject});ws.send(JSON.stringify({id,method,params}));});
  const evaluate=async expression=>{const r=await send('Runtime.evaluate',{expression,awaitPromise:true,returnByValue:true});if(r.exceptionDetails)throw new Error(JSON.stringify(r.exceptionDetails));return r.result.value;};
  const waitFor=async expression=>{for(let i=0;i<100;i++){if(await evaluate(expression))return;await sleep(100);}throw new Error('UI timed out: '+expression);};
  await send('Page.navigate',{url:f.app.studioUrl});
  await waitFor('document.querySelector("#login-form") && document.querySelector("#creator-url")');
  assert.equal(await evaluate('location.hash'), '');
  await evaluate(`document.querySelector('#creator-url').value=${JSON.stringify(login.baseUrl)};document.querySelector('#account-type').value='EMAIL';document.querySelector('#account').value=${JSON.stringify(login.account)};document.querySelector('#code').value='123456';document.querySelector('#login').click();`);
  await waitFor('!document.querySelector("#workspace").hidden && document.querySelector("#devices").textContent.includes("测试杯")');
  await evaluate('document.querySelector("#browse").click()');
  await waitFor('document.querySelector("#directory-dialog").open');
  await evaluate('document.querySelector("#choose-directory").click()');
  await waitFor('!document.querySelector("#start").disabled');
  assert.equal(await evaluate('document.querySelector("#guide-title").textContent'), '准备好后，启动智能体');
  assert.equal(await evaluate('document.querySelector("#restart").disabled'), true);
  await evaluate('document.querySelector("#start").click()');
  await waitFor('document.querySelector("#logs").textContent.includes("workbench bot ready")');
  assert.equal(await evaluate('document.querySelector("#start").disabled'), true);
  assert.equal(await evaluate('document.querySelector("#restart").disabled'), false);
  assert.equal(await evaluate('document.querySelector("#restart").textContent'), '重启智能体');
  assert.equal(await evaluate('document.querySelector(".diagnostics").open'), false);
  await evaluate('document.querySelector("#restart").click()');
  await waitFor('!document.querySelector("#restart").disabled && document.querySelector("#logs").textContent.includes("workbench bot ready")');
  await evaluate('document.querySelector("#source").value="mpy";document.querySelector("#source").dispatchEvent(new Event("input"))');
  assert.match(await evaluate('document.querySelector("#logs").textContent'), /没有匹配/);
  await evaluate('document.querySelector("#source").value="";document.querySelector("#source").dispatchEvent(new Event("input"))');
  const screenshot=await send('Page.captureScreenshot',{format:'png'});
  if(process.env.STUDIO_UI_SCREENSHOT)await writeFile(process.env.STUDIO_UI_SCREENSHOT,Buffer.from(screenshot.data,'base64'));
  assert.equal(await evaluate('document.querySelector("#devices input") === null'),true,'device list has no selection controls');
  await evaluate('document.querySelector("#stop").click()');
  await waitFor('document.querySelector("#run-status").textContent === "尚未启动"');
  await evaluate('document.querySelector("#logout").click()');
  await waitFor('!document.querySelector("#login-view").hidden');
});

for (const [web, mpy] of [[false,false],[true,false],[false,true],[true,true]]) {
  test(`project composition: bot${web ? '+webapp' : ''}${mpy ? '+mpy' : ''}`, async t => {
    const f = await fixture(t);
    if (!web) await rm(join(f.root,'webapp'), {recursive:true});
    if (!mpy) await rm(join(f.root,'mpy'), {recursive:true});
    await writeFile(join(f.root,'bot/index.js'), 'console.log("webapp-enabled", Boolean(process.env.STUDIO_WEBAPP_URL)); setInterval(() => {}, 1000);');
    await f.api('auth/login',login);
    const opened = (await f.api('project/open',{path:f.root})).data;
    assert.equal(opened.mpy,mpy); assert.equal(Boolean(opened.webRoot),web);
    assert.equal((await f.api('run/start',{bot:'',webRoot:web?'webapp':''})).status,400);
    const started = await f.api('run/start',{bot:'bot/index.js',webRoot:web?'webapp':''});
    assert.equal(started.status,200); assert.equal(Boolean(started.data.webAppUrl),web);
    let state;
    for(let i=0;i<50;i++){state=(await f.api('state')).data;if(state.events.records.some(r=>r.message.includes('webapp-enabled')))break;await sleep(100);}
    assert.ok(state.events.records.some(r=>r.message.includes('webapp-enabled '+web)));
    assert.equal(state.events.launches.length,0,'starting an environment never deploys MPY');
    const restarted = await f.api('run/start',{bot:'bot/index.js',webRoot:web?'webapp':''});
    assert.equal(restarted.status,200); assert.notEqual(restarted.data.runId,started.data.runId);
  });
}
