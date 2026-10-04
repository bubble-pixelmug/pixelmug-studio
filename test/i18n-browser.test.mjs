import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawn } from 'node:child_process';
import WebSocket from 'ws';
import { startWorkbench } from '../src/workbench.mjs';
const sleep = ms => new Promise(resolve=>setTimeout(resolve,ms));

test('real browser: language switching preserves login, drafts, running agent and raw logs', {
  skip: !process.env.STUDIO_TEST_BROWSER, timeout:60000,
}, async () => {
  const root = await mkdtemp(join(tmpdir(),'studio-i18n-'));
  let app, child, ws;
  try {
    await mkdir(join(root,'bot'));
    await writeFile(join(root,'bot/index.js'), 'console.log("用户日志：原文保留"); setInterval(()=>{},1000);');
    const fetchImpl = async url => {
      if(url.endsWith('/login')) return Response.json({code:200,result:{id:'user-one',name:'中文开发者',token:'test-creator-token'}});
      if(url.endsWith('/creator/bots')) return Response.json({code:200,result:[{id:'bot-one',name:'中文 Bot',description:'用户介绍'}]});
      if(url.endsWith('/devices')) return Response.json({code:200,result:[{id:'cup-one',name:'中文设备',sn:'S001',online:'ONLINE'}]});
      if(url.includes('/slot-details?')) return Response.json({code:200,result:{list:[]}});
      return Response.json({code:200});
    };
    app = await startWorkbench({port:0,initialDirectory:root,fetchImpl,mdns:false,webAppHostname:'127.0.0.1'});
    const url = new URL(app.studioUrl), token = new URLSearchParams(url.hash.slice(1)).get('studioToken');
    const api = async (path,body) => {
      const response = await fetch(url.origin+'/api/'+path,{method:body===undefined?'GET':'POST',headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},...(body===undefined?{}:{body:JSON.stringify(body)})});
      const result = await response.json();
      assert.ok(response.ok, JSON.stringify(result));
      return result;
    };
    const profile = join(root,'chrome-profile');
    child = spawn(process.env.STUDIO_TEST_BROWSER,['--headless','--disable-gpu','--no-first-run','--no-default-browser-check','--disable-background-networking','--disable-component-update','--disable-sync','--remote-debugging-port=0','--user-data-dir='+profile,'--window-size=1440,1050','about:blank'],{windowsHide:true,stdio:'ignore'});
    let port;
    for(let i=0;i<100;i++){try{port=Number((await readFile(join(profile,'DevToolsActivePort'),'utf8')).split('\n')[0]);break;}catch{await sleep(100);}}
    assert.ok(port,'browser started');
    const pages = await (await fetch('http://127.0.0.1:'+port+'/json/list')).json();
    ws = new WebSocket(pages.find(page=>page.type==='page').webSocketDebuggerUrl);
    await new Promise((resolve,reject)=>{ws.once('open',resolve);ws.once('error',reject);});
    let serial=0;
    const pending=new Map();
    ws.on('message',raw=>{const msg=JSON.parse(raw);if(msg.id){const p=pending.get(msg.id);pending.delete(msg.id);msg.error?p.reject(new Error(msg.error.message)):p.resolve(msg.result);}});
    const send=(method,params={})=>new Promise((resolve,reject)=>{const id=++serial;pending.set(id,{resolve,reject});ws.send(JSON.stringify({id,method,params}));});
    const evaluate=async expression=>{const result=await send('Runtime.evaluate',{expression,awaitPromise:true,returnByValue:true});if(result.exceptionDetails)throw new Error(JSON.stringify(result.exceptionDetails));return result.result.value;};
    const waitFor=async expression=>{for(let i=0;i<100;i++){if(await evaluate('Boolean('+expression+')'))return;await sleep(100);}throw new Error('UI timeout: '+expression);};
    const switchLanguage=async (id,value)=>{
      await evaluate(`document.getElementById(${JSON.stringify(id)}).value=${JSON.stringify(value)};document.getElementById(${JSON.stringify(id)}).dispatchEvent(new Event('change',{bubbles:true}));`);
      await waitFor(`document.documentElement.lang===${JSON.stringify(value)}`);
    };
    const input=async (id,value)=>evaluate(`document.getElementById(${JSON.stringify(id)}).value=${JSON.stringify(value)};document.getElementById(${JSON.stringify(id)}).dispatchEvent(new Event('input',{bubbles:true}));`);
    await send('Page.navigate',{url:app.studioUrl});
    await waitFor('document.querySelector("#login-language")');
    assert.equal(await evaluate('document.documentElement.lang'),'zh-CN');
    assert.equal(await evaluate('document.querySelector(".bubble-login-button").textContent'),'用冒泡账号登录');
    assert.equal(await evaluate('document.querySelector("#login-language").getBoundingClientRect().width>0'),true);
    await switchLanguage('login-language','en');
    assert.equal(await evaluate('document.querySelector(".bubble-login-button").textContent'),'Sign in with Bubble');
    await evaluate('document.querySelector(".bubble-login-button").click()');
    await input('account','dev@example.test');
    await input('code','123456');
    await evaluate('document.querySelector("#account-type").value="EMAIL";document.querySelector("#account-type").dispatchEvent(new Event("change"))');
    await switchLanguage('login-language','zh-CN');
    assert.equal(await evaluate('document.querySelector("#account").value'),'dev@example.test');
    await switchLanguage('login-language','en');
    await evaluate('document.querySelector("#login").click()');
    await waitFor('!document.querySelector("#workspace").hidden');
    assert.equal(await evaluate('document.querySelector("#user-name").textContent'),'中文开发者');
    await api('bots/token',{botId:'bot-one',token:'test-bot-token'});
    await api('bots/select',{botId:'bot-one'});
    await api('project/open',{path:root});
    await waitFor('document.querySelector("#bot-entry")?.value==="bot/index.js"');
    await input('bot-entry','bot/draft.mjs');
    await switchLanguage('studio-language','zh-CN');
    assert.equal(await evaluate('document.querySelector("#bot-entry").value'),'bot/draft.mjs');
    assert.equal(await evaluate('document.querySelector("#logout").textContent'),'退出登录');
    await switchLanguage('studio-language','en');
    assert.equal(await evaluate('document.querySelectorAll(".section-tabs strong")[0].textContent'),'Documentation');
    await input('bot-entry','bot/index.js');
    await waitFor('document.querySelector(".tree-entry[title=bot]") && !document.querySelector(".tree-entry[title=bot]").disabled');
    await evaluate('document.querySelector(".tree-entry[title=bot]").click()');
    await waitFor('Array.from(document.querySelectorAll(".tree-entry")).find(e=>e.title===`bot/index.js`)');
    await evaluate('Array.from(document.querySelectorAll(".tree-entry")).find(e=>e.title===`bot/index.js`).click()');
    await waitFor('document.querySelector(".cm-content")');
    await evaluate('document.querySelector(".cm-content").focus()');
    await send('Input.dispatchKeyEvent',{type:'keyDown',key:'End',code:'End',modifiers:2});
    await send('Input.dispatchKeyEvent',{type:'keyUp',key:'End',code:'End',modifiers:2});
    await send('Input.insertText',{text:'\n// 未保存的内容'});
    await waitFor('document.querySelector(".editor-heading h2 small")');
    await switchLanguage('studio-language','zh-CN');
    assert.ok((await evaluate('document.querySelector(".cm-content").textContent')).includes('未保存的内容'));
    assert.equal(await evaluate('document.querySelector(".editor-heading h2 small").textContent'),' · 未保存');
    await switchLanguage('studio-language','en');
    assert.equal(await evaluate('document.querySelector(".editor-heading h2 small").textContent'),' · Unsaved');
    await evaluate('document.querySelector(".editor-heading .primary").click()');
    await waitFor('!document.querySelector(".editor-heading h2 small")');
    await api('run/start',{bot:'bot/index.js',botId:'bot-one'});
    await evaluate('document.querySelectorAll(".section-tabs > button")[3].click()');
    await waitFor('document.querySelector("#run-id")?.textContent!=="—" && document.querySelector("#logs")?.textContent.includes("用户日志：原文保留")');
    const runId = (await api('state')).run.runId;
    await switchLanguage('studio-language','zh-CN');
    assert.equal(await evaluate('document.querySelector("#restart").textContent'),'重启智能体');
    await switchLanguage('studio-language','en');
    assert.equal(await evaluate('document.querySelector("#restart").textContent'),'Restart agent');
    assert.equal((await api('state')).run.runId,runId);
    assert.ok((await evaluate('document.querySelector("#logs").textContent')).includes('用户日志：原文保留'));
    await send('Page.reload');
    await waitFor('document.querySelector("#studio-language") && document.documentElement.lang==="en" && !document.querySelector("#workspace").hidden');
    assert.equal((await api('state')).run.runId,runId);
    assert.equal(await evaluate('document.querySelector("#user-name").textContent'),'中文开发者');
  } finally {
    ws?.close();
    if(child){child.kill();await sleep(500);}
    await app?.close();
    await rm(root,{recursive:true,force:true,maxRetries:10,retryDelay:200});
  }
});
