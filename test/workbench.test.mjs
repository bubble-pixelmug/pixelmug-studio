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
  const calls = [], state = { devices: [{ id: 'cup-one', name: '测试杯', sn: 'S001', online: 'ONLINE' }], expired: false, slots: [], bots: [{ id: 'bot-one', name: 'Test Bot' }] };
  const fetchImpl = async (url, options) => {
    calls.push({ url, ...options, body: options.body ? JSON.parse(options.body) : undefined });
    if (state.expired) return Response.json({ code: 401 }, { status: 401 });
    if (url.endsWith('/login')) return Response.json({ code: 200, result: { id: 'user-one', name: '测试开发者', token: 'private-creator-token' } });
    if (url.endsWith('/creator/bots')) { assert.equal(options.headers.token, 'private-creator-token'); return Response.json({ code: 200, result: state.bots }); }
    if (url.endsWith('/devices')) { if(state.deviceWait) await state.deviceWait; assert.equal(options.headers.token, 'private-creator-token'); return Response.json({ code: 200, result: state.devices }); }
    if (url.includes('/creator/bot/slot-details?')) {
      assert.equal(options.headers.token, 'private-creator-token');
      if (state.slotWait) await state.slotWait;
      return Response.json({ code: 200, result: { list: state.slots } });
    }
    if (url.endsWith('/creator/bot/slot/device/bind')) {
      assert.equal(options.headers.token, 'private-creator-token');
      const body=JSON.parse(options.body);
      const slot=state.slots.find(slot=>slot.id===body.slotId);
      slot.device=state.devices.find(device=>device.id===body.deviceId);
    }
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
  await f.api('auth/login', login); await f.api('bots/token', {botId:'bot-one',token:'private-bot-token'}); await f.api('bots/select',{botId:'bot-one'});
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
  await f.api('auth/login', login); await f.api('bots/token', {botId:'bot-one',token:'private-bot-token'}); await f.api('bots/select',{botId:'bot-one'}); await f.api('devices/refresh', {});
  const before = (await f.api('state')).data;
  assert.equal(before.devices[0].id, 'cup-one'); assert.ok(!JSON.stringify(before).includes('private-creator-token'));
  assert.equal((await f.api('project/open', { path: f.root })).data.bot, 'bot/index.js');
  const args = { bot: 'bot/index.js', webRoot: 'webapp', botId: 'bot-one' };
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
  await f.api('auth/login', login); await f.api('bots/token', {botId:'bot-one',token:'private-bot-token'}); await f.api('bots/select',{botId:'bot-one'});
  await f.api('project/open', { path: f.root });
  const args = { bot: 'bot/index.js', autoRunMpy: true, botId: 'bot-one', botApiBaseUrl: 'https://bot.example.test/im' };
  assert.equal((await f.api('run/start', args)).status, 200);
  const state = (await f.api('state')).data;
  assert.equal(state.runtimeConfig.hasBotToken, true);
  assert.equal(state.runtimeConfig.botApiBaseUrl, args.botApiBaseUrl);
  assert.equal(state.runtimeConfig.autoRunMpy, true);
  assert.ok(!JSON.stringify(state).includes('private-bot-token'));
  assert.equal((await f.api('run/start', { ...args, botId: 'bot-one', botApiBaseUrl: state.runtimeConfig.botApiBaseUrl })).status, 200);
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
  const waitFor=async expression=>{for(let i=0;i<100;i++){if(await evaluate('Boolean('+expression+')'))return;await sleep(100);}throw new Error('UI timed out: '+expression);};
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
    await f.api('auth/login',login); await f.api('bots/token', {botId:'bot-one',token:'private-bot-token'}); await f.api('bots/select',{botId:'bot-one'});
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

test('Creator preserves avatar and talId in local device state and refreshes them', async () => {
  const mock = upstream(), client = new CreatorClient({ fetchImpl: mock.fetchImpl });
  Object.assign(mock.state.devices[0], { avatar: 'https://images.example.test/s1.png', talId: 'PixelMugS1' });
  await client.login(login);
  await client.refresh();
  assert.equal(client.devices[0].avatar, 'https://images.example.test/s1.png');
  assert.equal(client.devices[0].talId, 'PixelMugS1');
  mock.state.devices[0].avatar = 'https://images.example.test/p1.png';
  mock.state.devices[0].talId = 'PixelMug';
  await client.refresh();
  assert.equal(client.devices[0].avatar, mock.state.devices[0].avatar);
  assert.equal(client.devices[0].talId, 'PixelMug');
  delete mock.state.devices[0].avatar;
  delete mock.state.devices[0].talId;
  await client.refresh();
  assert.equal(client.devices[0].avatar, '');
  assert.equal(client.devices[0].talId, '');
});

test('workbench allows HTTPS device avatars while keeping scripts same-origin', async t => {
  const f = await fixture(t);
  const response = await fetch(f.origin);
  const policy = response.headers.get('content-security-policy');
  assert.match(policy, /img-src 'self' data: https:;/);
  assert.match(policy, /script-src 'self';/);
  assert.match(policy, /connect-src 'self';/);
});


test('Bot slot contract: encoded token, normalized fields, compatible devices and ownership checks', async () => {
  const mock=upstream(), client=new CreatorClient({fetchImpl:mock.fetchImpl});
  await client.login(login);
  const botToken='bot+secret/&?';
  mock.state.slots=[{id:'slot-one',talId:'PixelMugS1',compatible:['PixelMug'],device:null}];
  mock.state.devices=[
    {id:'primary',talId:'PixelMugS1',name:'Primary',online:'ONLINE'},
    {id:'compatible',talId:'PixelMug',name:'Compatible',online:'OFFLINE',avatar:'https://example.test/cup.png'},
    {id:'wrong',talId:'Other'}, {id:'missing-type'}
  ];
  assert.deepEqual(await client.botSlots(botToken),mock.state.slots);
  assert.equal(new URL(mock.calls.at(-1).url).searchParams.get('botToken'),botToken);
  assert.equal(mock.calls.at(-1).method,'GET');
  for(const id of ['wrong','missing-type','not-owned']) await assert.rejects(client.bindBotSlot(botToken,'slot-one',id));
  await assert.rejects(client.bindBotSlot(botToken,'unknown','primary'));
  assert.equal(mock.calls.filter(call=>call.url.endsWith('/bind')).length,0);
  await client.bindBotSlot(botToken,'slot-one','primary');
  assert.deepEqual(mock.calls.at(-1).body,{slotId:'slot-one',deviceId:'primary'});
  await client.bindBotSlot(botToken,'slot-one','compatible');
  const slots=await client.botSlots(botToken);
  assert.equal(slots[0].device.id,'compatible');
  assert.equal(slots[0].device.online,'OFFLINE');
  assert.equal(slots[0].device.avatar,'https://example.test/cup.png');
  client.fetch=async()=>Response.json({code:200,result:mock.state.slots});
  assert.equal((await client.botSlots(botToken)).length,1);
  client.fetch=async()=>{throw new Error(botToken)};
  await assert.rejects(client.botSlots(botToken),error=>!error.message.includes(botToken));
  client.fetch=async()=>Response.json({code:500,result:{list:[]}});
  await assert.rejects(client.botSlots(botToken));
});

test('workbench queries slots on start, refreshes after bind, rejects stale runs and clears on stop', async t => {
  const f=await fixture(t);
  f.mock.state.slots=[{id:'slot-one',talId:'PixelMugS1',compatible:[]}];
  f.mock.state.devices[0].talId='PixelMugS1';
  await f.api('auth/login',login); await f.api('bots/token', {botId:'bot-one',token:'private-bot-token'}); await f.api('bots/select',{botId:'bot-one'});
  await f.api('project/open',{path:f.root});
  const started=await f.api('run/start',{bot:'bot/index.js',botId: 'bot-one'});
  assert.equal(started.status,200);
  const runId=started.data.runId;
  await f.api('run/slots/refresh',{runId});
  let state=(await f.api('state')).data;
  assert.equal(state.botSlots.list[0].id,'slot-one');
  assert.ok(!JSON.stringify(state).includes('test-bot-token'));
  assert.equal((await f.api('run/slots/bind',{runId:'old',slotId:'slot-one',deviceId:'cup-one'})).status,400);
  const bound=await f.api('run/slots/bind',{runId,slotId:'slot-one',deviceId:'cup-one'});
  assert.equal(bound.status,200);
  assert.equal(bound.data.list[0].device.id,'cup-one');
  const bindIndex=f.mock.calls.findIndex(call=>call.url.endsWith('/bind'));
  assert.ok(f.mock.calls.slice(bindIndex+1).some(call=>call.url.includes('/slot-details?')));
  await f.api('run/stop',{});
  state=(await f.api('state')).data;
  assert.deepEqual(state.botSlots.list,[]);
  assert.equal(state.botSlots.loading,false);
  assert.equal((await f.api('run/slots/bind',{runId,slotId:'slot-one',deviceId:'cup-one'})).status,400);
});

test('late slot responses cannot repopulate stopped run state', async t => {
  const f=await fixture(t);
  let release;
  f.mock.state.slotWait=new Promise(resolve=>{release=resolve});
  t.after(()=>release());
  f.mock.state.slots=[{id:'late',talId:'PixelMug',compatible:[]}];
  await f.api('auth/login',login); await f.api('bots/token', {botId:'bot-one',token:'private-bot-token'}); await f.api('bots/select',{botId:'bot-one'});
  await f.api('project/open',{path:f.root});
  assert.equal((await f.api('run/start',{bot:'bot/index.js',botId: 'bot-one'})).status,200);
  await f.api('run/stop',{});
  release();
  await sleep(30);
  assert.deepEqual((await f.api('state')).data.botSlots.list,[]);
});


test('real browser: slot cards filter candidates, bind and disappear on stop', { skip: !process.env.STUDIO_TEST_BROWSER, timeout:40000 }, async t => {
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
  const waitFor=async expression=>{for(let i=0;i<100;i++){if(await evaluate('Boolean('+expression+')'))return;await sleep(100);}throw new Error('UI timed out: '+expression);};

  f.mock.state.slots=[{id:'slot-one',talId:'Primary',compatible:['Compatible'],device:null}];
  f.mock.state.devices=[
    {id:'primary',name:'Primary device',talId:'Primary',online:'ONLINE',sn:'SN1'},
    {id:'compatible',name:'Compatible device',talId:'Compatible',online:'OFFLINE',sn:'SN2'},
    {id:'wrong',name:'Wrong device',talId:'Other',online:'ONLINE'},
  ];
  await f.api('auth/login',login); await f.api('bots/token', {botId:'bot-one',token:'private-bot-token'}); await f.api('bots/select',{botId:'bot-one'});
  await f.api('project/open',{path:f.root});
  await f.api('run/start',{bot:'bot/index.js',botId: 'bot-one'});
  await send('Page.navigate',{url:f.app.studioUrl});
  await waitFor('document.querySelectorAll(".section-tabs > button").length === 4');
  await evaluate('document.querySelectorAll(".section-tabs > button")[3].click()');
  await waitFor('document.querySelectorAll(".slot-card").length === 1');
  await evaluate('document.querySelector(".slot-action button").click()');
  await waitFor('document.querySelector(".slot-picker").open && document.querySelectorAll(".picker-device").length === 2 && !document.querySelector(".picker-device").disabled');
  assert.equal(await evaluate('document.querySelector(".picker-devices").textContent.includes("Wrong device")'),false);
  await evaluate('document.querySelectorAll(".picker-device")[1].click()');
  await waitFor('document.querySelector(".slot-device")?.textContent.includes("Compatible device")');
  assert.equal(await evaluate('document.querySelector(".slot-picker").open'),false);
  assert.equal(f.mock.calls.filter(call=>call.url.endsWith('/bind')).length,1);
  assert.equal(f.mock.calls.find(call=>call.url.endsWith('/bind')).body.deviceId,'compatible');
  await evaluate('document.querySelector("#stop").click()');
  await waitFor('!document.querySelector(".bot-slots")');
});


test('real browser: file explorer edits and saves', {skip:!process.env.STUDIO_TEST_BROWSER,timeout:40000},async t=>{
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
  const waitFor=async expression=>{for(let i=0;i<100;i++){if(await evaluate('Boolean('+expression+')'))return;await sleep(100);}throw new Error('UI timed out: '+expression);};

 await f.api('auth/login',login); await f.api('bots/token', {botId:'bot-one',token:'private-bot-token'}); await f.api('bots/select',{botId:'bot-one'});await f.api('project/open',{path:f.root});
 await send('Page.navigate',{url:f.app.studioUrl});
 await waitFor('document.querySelector(".file-root") && !document.querySelector(".file-root").disabled');
 await evaluate('document.querySelector(".file-root").click()');
 await waitFor('document.querySelector(".file-root").getAttribute("aria-expanded") === "false"');
 assert.equal(await evaluate('document.querySelectorAll(".tree-entry").length'),0);
 assert.equal(await evaluate('document.querySelector(".file-workspace").style.display'),'none');
 await evaluate('document.querySelector(".file-root").click()');
 await waitFor('document.querySelector(".tree-entry[title=bot]") && !document.querySelector(".tree-entry[title=bot]").disabled');

 await evaluate('document.querySelector(".tree-entry[title=bot]").click()');
 await waitFor('Array.from(document.querySelectorAll(".tree-entry")).find(e=>e.title===`bot/index.js`)');
 assert.equal(await evaluate('parseInt(getComputedStyle(Array.from(document.querySelectorAll(".tree-entry")).find(e=>e.title===`bot/index.js`)).paddingLeft)-parseInt(getComputedStyle(document.querySelector(".tree-entry[title=bot]")).paddingLeft)'),20);
 await evaluate('Array.from(document.querySelectorAll(".tree-entry")).find(e=>e.title===`bot/index.js`).click()');
 await waitFor('document.querySelector(".cm-content")');
 assert.equal(await evaluate('getComputedStyle(document.querySelector(".cm-editor")).position'),'relative');
 await evaluate('document.querySelector(".cm-content").focus()');
 await send('Input.dispatchKeyEvent',{type:'keyDown',key:'End',code:'End',modifiers:2});
 await send('Input.dispatchKeyEvent',{type:'keyUp',key:'End',code:'End',modifiers:2});
 await send('Input.insertText',{text:'\n// explorer-needle'});
 await waitFor('!document.querySelector(".editor-heading .primary").disabled');
 await evaluate('document.querySelector(".editor-heading .primary").click()');
 await waitFor('!document.querySelector(".editor-heading h2 small")');
 assert.ok((await readFile(join(f.root,'bot/index.js'),'utf8')).includes('explorer-needle'));
 assert.equal(await evaluate('document.querySelectorAll(".file-search,.new-file-dialog,.file-results").length'),0);
});


test('background device refresh does not block files or project operations; concurrent saves detect conflicts', async t => {
  const f=await fixture(t);
  await f.api('auth/login',login); await f.api('bots/token', {botId:'bot-one',token:'private-bot-token'}); await f.api('bots/select',{botId:'bot-one'});
  await f.api('project/open',{path:f.root});
  let release;
  f.mock.state.deviceWait=new Promise(resolve=>{release=resolve});
  t.after(()=>release());
  const refreshing=f.api('devices/refresh',{});
  while(!f.mock.calls.some(call=>call.url.endsWith('/devices'))) await sleep(10);
  try {
    assert.equal((await f.api('state')).data.busy,false);
    const read=await f.api('files/read',{project:f.root,path:'bot/index.js'});
    assert.equal(read.status,200);
    assert.equal((await f.api('project/open',{path:f.root})).status,200);
    const body={project:f.root,path:'bot/index.js',content:'// concurrent save',revision:read.data.revision};
    const saves=await Promise.all([f.api('files/save',body),f.api('files/save',body)]);
    assert.deepEqual(saves.map(result=>result.status).sort(),[200,400]);
    assert.equal((await f.api('files/list',{project:f.root,path:''})).status,200);
    assert.equal((await f.api('files/create',{project:f.root,path:'created.txt'})).status,404);
    assert.equal((await f.api('files/search',{project:f.root,query:'test'})).status,404);
  } finally { release(); }
  assert.equal((await refreshing).status,200);
});


test('real browser: documentation navigation embeds the configured documentation site', {skip:!process.env.STUDIO_TEST_DOCS,timeout:40000},async t=>{
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
  const waitFor=async expression=>{for(let i=0;i<100;i++){if(await evaluate('Boolean('+expression+')'))return;await sleep(100);}throw new Error('UI timed out: '+expression);};

 await f.api('auth/login',login); await f.api('bots/token', {botId:'bot-one',token:'private-bot-token'}); await f.api('bots/select',{botId:'bot-one'});
 const state=(await f.api('state')).data;
 assert.equal(state.docsUrl,'https://bubble-pixelmug.github.io/pixelmug-docs/en/');
 const response=await fetch(f.origin);
 assert.ok(response.headers.get('content-security-policy').includes('frame-src https://bubble-pixelmug.github.io'));
 await send('Page.navigate',{url:f.app.studioUrl});
 await waitFor('document.querySelectorAll(".section-tabs > button").length === 4');
 await evaluate('document.querySelectorAll(".section-tabs > button")[2].click()');
 await waitFor('document.querySelector(".documentation-page iframe")');
 assert.equal(await evaluate('document.querySelector(".docs-open").href'),state.docsUrl);
 let frame;
 for(let i=0;i<100;i++){
  const tree=await send('Page.getFrameTree');
  frame=tree.frameTree.childFrames?.find(item=>item.frame.url.startsWith(state.docsUrl))?.frame;
  if(frame)break;await sleep(100);
 }
 assert.ok(frame,'documentation iframe loaded');
 const context=await send('Page.createIsolatedWorld',{frameId:frame.id,worldName:'docs-check'});
 let content;
 for(let i=0;i<100;i++) {
   content=await send('Runtime.evaluate',{contextId:context.executionContextId,expression:'document.body?.textContent || ""',returnByValue:true});
   if(content.result.value.includes('Bot SDK'))break;
   await sleep(100);
 }
 assert.ok(content.result.value.includes('Bot SDK'));
 assert.ok(content.result.value.includes('WebApp SDK'));
});

test('switching projects retires the old WebApp and serves the new project URL', async t => {
  const f = await fixture(t);
  const other = join(f.root, 'second-project');
  await mkdir(join(other, 'bot'), { recursive: true });
  await mkdir(join(other, 'webapp'));
  await writeFile(join(other, 'bot', 'index.js'), 'setInterval(() => {}, 1000)');
  await writeFile(join(other, 'webapp', 'index.html'), '<title>Second project</title><script type="module" src="./main.js"></script>');
  await writeFile(join(other, 'webapp', 'main.js'), 'globalThis.project = "second";');
  await f.api('auth/login', login); await f.api('bots/token', {botId:'bot-one',token:'private-bot-token'}); await f.api('bots/select',{botId:'bot-one'});
  const start = async path => {
    assert.equal((await f.api('project/open', { path })).status, 200);
    const result = await f.api('run/start', { bot: 'bot/index.js', botId: 'bot-one' });
    assert.equal(result.status, 200);
    return result.data.webAppUrl;
  };
  const first = await start(f.root);
  assert.match(await (await fetch(first)).text(), /Test project/);
  assert.equal((await f.api('run/stop', {})).status, 200);
  assert.equal((await fetch(first)).status, 503);
  const second = await start(other);
  assert.notEqual(second, first);
  assert.equal(new URL(second).origin, new URL(first).origin);
  assert.equal((await fetch(first)).status, 503);
  const page = await fetch(second);
  assert.equal(page.status, 200);
  const html = await page.text();
  assert.match(html, /Second project/);
  const script = html.match(/type="module"[^>]*src="([^"]+)"/)[1];
  assert.match(await (await fetch(new URL(script, second))).text(), /second/);
  assert.equal((await f.api('run/stop', {})).status, 200);
  assert.equal(await start(f.root), first);
  assert.match(await (await fetch(first)).text(), /Test project/);
  assert.equal((await fetch(second)).status, 503);
});
test('WebApp address configuration validates local choices and reaches the Bot on launch', async t => {
  const f = await fixture(t);
  await writeFile(join(f.root, 'bot/index.js'), 'console.log("address=" + new URL(process.env.STUDIO_WEBAPP_URL).hostname); setInterval(() => {}, 1000);');
  await f.api('auth/login', login); await f.api('bots/token', {botId:'bot-one',token:'private-bot-token'}); await f.api('bots/select',{botId:'bot-one'});
  await f.api('project/open', { path: f.root });
  const initial = (await f.api('state')).data;
  assert.equal((await f.api('webapp/address', { host: 'https://evil.example/' })).status, 400);
  assert.equal((await f.api('state')).data.webAppHostname, initial.webAppHostname);
  const host = initial.webAppAddresses.find(item => item.host !== initial.webAppHostname)?.host || initial.webAppHostname;
  assert.equal((await f.api('webapp/address', { host })).status, 200);
  await f.api('project/open', { path: f.root });
  assert.equal((await f.api('state')).data.webAppHostname, host);
  const started = await f.api('run/start', { bot: 'bot/index.js' });
  assert.equal(started.status, 200);
  assert.equal(new URL(started.data.webAppUrl).hostname, host);
  const url = new URL(started.data.webAppUrl); url.hostname = '127.0.0.1';
  assert.equal((await fetch(url)).status, 200);
  let state;
  for (let i=0; i<50; i++) {
    state = (await f.api('state')).data;
    if (state.events.records.some(item => item.message.includes('address=' + host))) break;
    await sleep(100);
  }
  assert.ok(state.events.records.some(item => item.message.includes('address=' + host)));
  assert.equal((await f.api('webapp/address', { host: initial.webAppHostname })).status, 400);
  await f.api('run/stop', {});
  assert.equal((await f.api('webapp/address', { host: initial.webAppHostname })).status, 200);
  const next = await f.api('run/start', { bot: 'bot/index.js' });
  const nextUrl = new URL(next.data.webAppUrl);
  assert.equal(nextUrl.hostname, initial.webAppHostname);
  assert.equal(nextUrl.pathname, url.pathname);
  assert.equal((await fetch(nextUrl)).status, 200);
});

test('account bots: optional metadata, authenticated list, memory-only credentials and expiry', async () => {
  const mock=upstream(), client=new CreatorClient({fetchImpl:mock.fetchImpl});
  mock.state.bots=[{id:'a',avatar:' https://example.test/avatar.png ',description:'Hello'}, {}, {id:'b',name:'Second'}];
  await client.login(login);
  const request=mock.calls.find(call=>call.url.endsWith('/creator/bots'));
  assert.equal(request.method,'GET');
  assert.equal(request.headers.token,'private-creator-token');
  assert.equal(client.publicBots().length,3);
  assert.equal(client.publicBots()[0].avatar,'https://example.test/avatar.png');
  assert.equal(client.publicBots()[1].id,'');
  assert.throws(()=>client.setBotToken('', 'secret'));
  client.setBotToken('a','alpha-secret'); client.setBotToken('b','beta-secret');
  await client.refreshBots();
  assert.equal(client.getBotToken('a'),'alpha-secret');
  assert.equal(client.getBotToken('b'),'beta-secret');
  assert.ok(!JSON.stringify(client.publicBots()).includes('secret'));
  mock.state.expired=true;
  await assert.rejects(client.refreshBots());
  assert.equal(client.botTokens.size,0);
  assert.deepEqual(client.publicBots(),[]);
});

test('failed bot list can be retried without blocking account devices; accepts results envelope', async () => {
  const mock=upstream(); let fail=true;
  const client=new CreatorClient({fetchImpl:async(url,options)=>{
    if(url.endsWith('/creator/bots')) {
      if(fail) throw new Error('upstream-secret');
      return Response.json({code:200,results:[{id:'a'}]});
    }
    return mock.fetchImpl(url,options);
  }});
  await client.login(login);
  assert.ok(client.publicSession());
  assert.ok(client.botsError);
  assert.ok(!client.botsError.includes('upstream-secret'));
  assert.equal((await client.refresh()).length,1);
  fail=false; await client.refreshBots();
  assert.equal(client.publicBots()[0].id,'a');
  assert.equal(client.botsError,'');
});

test('selected Bot owns launch credentials across restart and project changes; logout clears them', async t => {
  const f=await fixture(t);
  f.mock.state.bots=[{id:'a',name:'Alpha'},{id:'b',name:'Beta'}];
  await f.api('auth/login',login);
  await f.api('project/open',{path:f.root});
  assert.equal((await f.api('run/start',{bot:'bot/index.js',botToken:'legacy-secret'})).status,400);
  assert.equal((await f.api('bots/token',{botId:'unknown',token:'secret'})).status,400);
  assert.equal((await f.api('bots/token',{botId:'a',token:'alpha-secret'})).status,200);
  assert.equal((await f.api('bots/select',{botId:'b'})).status,200);
  assert.equal((await f.api('run/start',{bot:'bot/index.js'})).status,400,'never reuse another Bot token');
  await f.api('bots/token',{botId:'b',token:'beta-secret'});
  await writeFile(join(f.root,'bot/index.js'),'console.log("selected-beta",process.env.BOT_TOKEN === "beta-secret");setInterval(()=>{},1000)');
  assert.equal((await f.api('run/start',{bot:'bot/index.js'})).status,200);
  assert.equal((await f.api('bots/select',{botId:'a'})).status,400);
  assert.equal((await f.api('bots/token',{botId:'b',token:'replacement'})).status,400);
  let state;
  for(let i=0;i<50;i++) {
    state=(await f.api('state')).data;
    if(state.events.records.some(r=>r.message.includes('selected-beta true'))) break;
    await sleep(100);
  }
  assert.ok(state.events.records.some(r=>r.message.includes('selected-beta true')));
  assert.ok(!JSON.stringify(state).includes('beta-secret'));
  assert.ok(!JSON.stringify(state).includes('alpha-secret'));
  assert.equal(state.runtimeConfig.botId,'b');
  assert.equal((await f.api('run/start',{bot:'bot/index.js'})).status,200);
  await f.api('run/stop',{});
  const second=join(f.root,'second'); await mkdir(join(second,'bot'),{recursive:true});
  await writeFile(join(second,'bot/index.js'),'setInterval(()=>{},1000)');
  await f.api('project/open',{path:second});
  state=(await f.api('state')).data;
  assert.equal(state.runtimeConfig.botId,'b');
  assert.ok(state.bots.every(bot=>bot.hasToken));
  await f.api('bots/refresh',{});
  assert.ok((await f.api('state')).data.bots.every(bot=>bot.hasToken));
  await f.api('auth/logout',{});
  assert.deepEqual((await f.api('state')).data.bots,[]);
  await f.api('auth/login',login);
  assert.ok((await f.api('state')).data.bots.every(bot=>!bot.hasToken));
  assert.equal((await f.api('state')).data.runtimeConfig.botId,'');
});

test('real browser: account Bot cards, token setup, selection and reload', { skip: !process.env.STUDIO_TEST_BROWSER, timeout: 40000 }, async t => {
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
  const waitFor=async expression=>{for(let i=0;i<100;i++){if(await evaluate('Boolean('+expression+')'))return;await sleep(100);}throw new Error('UI timed out: '+expression);};

  f.mock.state.bots=[{id:'a',name:'Alpha',description:'My first Bot',avatar:'https://invalid.example/avatar.png'},{}];
  await send('Page.navigate',{url:f.app.studioUrl});
  await waitFor('document.querySelector(".bubble-login-button")');
  await evaluate('document.querySelector(".bubble-login-button").click()');
  await waitFor('document.querySelector("#login-form")');
  await evaluate(`document.querySelector('#creator-url').value=${JSON.stringify(login.baseUrl)};document.querySelector('#account-type').value='EMAIL';document.querySelector('#account').value=${JSON.stringify(login.account)};document.querySelector('#code').value='123456';document.querySelector('#login').click();`);
  await waitFor('document.querySelectorAll(".account-bot-card").length===2');
  await evaluate(`Array.from(document.querySelectorAll('.section-tabs>button')).find(b=>b.textContent.includes('我的冒泡')).click()`);
  assert.match(await evaluate('document.querySelector(".section-tabs").textContent'),/1 台设备 · 2 个 Bot/);
  assert.equal(await evaluate('document.querySelectorAll(".account-bot-card input:disabled").length'),1);
  await evaluate(`const input=document.querySelector('#token-a');input.value='browser-secret';input.dispatchEvent(new Event('input',{bubbles:true}));`);
  await evaluate('document.querySelector(".account-bot-card form").requestSubmit()');
  await waitFor('document.querySelector("#token-a").placeholder.includes("已设置")');
  assert.equal(await evaluate('document.querySelector("#token-a").value'),'');
  await evaluate(`Array.from(document.querySelectorAll('.section-tabs>button')).find(b=>b.textContent.includes('选择应用')).click()`);
  await evaluate('document.querySelector("#browse").click()');
  await waitFor('document.querySelector("#directory-dialog").open');
  await evaluate('document.querySelector("#choose-directory").click()');
  await waitFor('document.querySelector("#bot-select")');
  await evaluate(`Array.from(document.querySelectorAll('.section-tabs>button')).find(b=>b.textContent.includes('选择应用')).click()`);
  await evaluate(`const select=document.querySelector('#bot-select');select.value='a';select.dispatchEvent(new Event('change',{bubbles:true}));`);
  await waitFor('document.querySelector("#bot-select").value==="a" && !document.querySelector("#bot-select").disabled');
  assert.equal((await f.api('state')).data.runtimeConfig.botId,'a');
  await send('Page.reload');
  await waitFor('document.querySelector("#bot-select")?.value==="a"');
  assert.equal((await f.api('state')).data.bots[0].hasToken,true);
  await evaluate(`Array.from(document.querySelectorAll('.section-tabs>button')).find(b=>b.textContent.includes('我的冒泡')).click()`);
  assert.equal(await evaluate('document.documentElement.scrollWidth<=innerWidth'),true);
  const screenshot=await send('Page.captureScreenshot',{format:'png'});
  if(process.env.STUDIO_UI_SCREENSHOT) await writeFile(process.env.STUDIO_UI_SCREENSHOT,Buffer.from(screenshot.data,'base64'));
});
