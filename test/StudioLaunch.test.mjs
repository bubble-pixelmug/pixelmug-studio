import { installWebAppAdapter } from "../runtime/WebAppAdapter.js";
installWebAppAdapter(BubbleWebApp);
import { installBotAdapter } from "../runtime/BotAdapter.js";
import { createMpsHooks } from "../devices/pixelmug.js";
installBotAdapter(BubbleBot);
import test from "node:test";
import assert from "node:assert/strict";
import { BubbleWebApp } from "../../../mps/jeejio-bubble/sdk/WebApp.js";
import { BubbleBot } from "../../../mps/jeejio-bubble/sdk/BubbleBot.js";
import { installStudioLaunch } from "../runtime/StudioLaunch.js";
const device = { deviceId: "mug-1", slotId: "slot-1", slot: 1 };
const rpc = { method: "talMpyExecOneScript", params: { id: "", version: "" } };
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

test("WebApp redirects only launch, ignores id/version, and delivers existing device events", async () => {
  const calls = []; let ownerId, sentEvent = false;
  const dispose = installStudioLaunch({ enabled: true, runId: "run-test" }, async message => {
    calls.push(message);
    if (message.op === "launch") { ownerId = message.ownerId; return { code: 200, result: { value: 262 } }; }
    if (message.op === "poll" && !sentEvent) { sentEvent = true; return { events: [{ seq: 1, ownerId, value: "MPS_IS_RUNNING", state: "running" }], commands: [] }; }
    return { events: [], commands: [] };
  });
  const forwarded = [];
  const web = new BubbleWebApp({ autoStart: false, ble: false, bridge: {
    sendTAL(message, callback) { forwarded.push(message); callback({ code: 200, result: { value: "native" } }); },
  } });
  try {
    web.request = async type => { assert.equal(type, "system.studio.prepareMps"); return {result:{contextId:"bot-context"}}; };
    const events = []; web.onDeviceEvent(event => events.push(event));
    assert.equal((await web.callDevice(device, rpc)).result.value, 262);
    assert.equal(forwarded.length, 0);
    assert.equal(calls[0].device.deviceId, "mug-1");
    assert.equal(calls[0].rpc, undefined);
    assert.equal((await web.callDevice(device, { method: "talGetWifiInfo" })).result.value, "native");
    await sleep(500);
    assert.equal(events[0].payload.events[0].params.value, "MPS_IS_RUNNING");
    assert.equal(forwarded.length, 1);
  } finally { dispose(); }
  await web.callDevice(device, rpc);
  assert.equal(forwarded.length, 2, "formal mode uses original bridge");
});

test("Studio launch failure never falls back to the original bridge", async () => {
  const dispose = installStudioLaunch({ enabled: true, runId: "run-test" }, async () => { throw new Error("Studio offline"); });
  const web = new BubbleWebApp({ autoStart: false, ble: false, bridge: { sendTAL() { assert.fail("cloud fallback"); } } });
  web.request = async () => ({result:{contextId:"bot-context"}});
  try { await assert.rejects(web.callDevice(device, rpc), /Studio offline/); }
  finally { dispose(); }
});

test("bot synchronous and asynchronous launch retain normal response context and ACK/task contract", async () => {
  const calls = [];
  const dispose = installStudioLaunch({ enabled: true, runId: "run-test" }, async message => {
    calls.push(message);
    return message.op === "launch" ? { code: 200, result: { value: 262 } } : { events: [], commands: [] };
  });
  const bot = new BubbleBot("test-token", { api: { sendDeviceRpc() { assert.fail("launch sent to cloud"); } } });
  try {
    const result = await bot.callDevice({ id: "chat" }, device, rpc);
    assert.equal(result.tal.ok, true); assert.equal(result.tal.result, 262);
    const events = []; bot.dispatchDeviceCallEvent = async (kind, task, extra) => events.push({ kind, task, extra });
    const task = await bot.callDeviceAsync({ id: "chat" }, device, rpc);
    assert.equal(task.ackCode, 201); assert.equal(task.status, "accepted");
    await sleep(20);
    assert.equal(events[0].kind, "sent");
    assert.equal(events[1].kind, "response");
    assert.equal(events[1].extra.result, 262);
    assert.equal(calls.filter(c => c.op === "launch").length, 2);
  } finally { dispose(); }
});



test("WebApp preparation uses bot-verified binding and retains RPC context without the page", async () => {
  const calls = [];
  const dispose = installStudioLaunch({enabled:true,runId:"test"}, async message => {
    calls.push(message);
    return message.op === "register" ? {contextId:"registered-bot-context"} : {events:[],commands:[]};
  });
  const bot = new BubbleBot("test", {api:{}});
  let devices = [device]; bot.getBoundDevices = async () => devices;
  const replies = [];
  const ctx = {chat:{id:"group",type:"group"},from:{id:"player"},replyWebApp:async (...args)=>replies.push(args)};
  try {
    await bot.handleSystemWebAppRequest(ctx,{type:"system.studio.prepareMps",payload:{device}});
    assert.equal(replies[0][0].contextId,"registered-bot-context");
    assert.equal(calls[0].op,"register");
    const rpcCalls=[];
    bot.callDevice=async (...args)=>{rpcCalls.push(args);return {tal:{result:true}};};
    const hooks=createMpsHooks.call(bot,ctx.chat,ctx.from,device,1);
    await hooks.executeRpc({method:"talMpyRebootStartREPL",params:{requestId:"launch-test"}},1000);
    assert.equal(rpcCalls[0][0],ctx.chat);assert.equal(rpcCalls[0][3].to,ctx.from);
    assert.deepEqual(rpcCalls[0][2], {method:"talMpyRebootStartREPL",params:{requestId:"launch-test"}});
    await hooks.executeRpc({method:"talMpyGetStudioState",params:{ignored:true}},1000);
    assert.deepEqual(rpcCalls[1][2], {method:"talMpyGetStudioState",params:{}});
    await assert.rejects(hooks.executeRpc({method:"unknownDeviceCommand"},1000),/Unknown Studio/);
    devices=[{...device,deviceId:"another-cup"}];
    await assert.rejects(hooks.executeRpc({method:"talMpyGetStudioState"},1000),/binding changed/);
    assert.equal(rpcCalls.length,2);
    await bot.handleSystemWebAppRequest(ctx,{type:"system.studio.prepareMps",payload:{device}});
    assert.equal(replies[1][1].success,false);
    assert.equal(calls.filter(c=>c.op==="register").length,1);
  } finally { dispose(); }
});


test("concurrent chats preserve devices, contact IDs and async traces through the external adapter", async t => {
  const calls = [], queries = [];
  const dispose = installStudioLaunch({enabled:true,runId:"concurrent"}, async message => {
    if (message.op === "launch") {
      calls.push(message.device);
      await sleep(message.device.deviceId === "cup-a" ? 20 : 1);
      return {code:200,result:{value:message.device.deviceId}};
    }
    return {commands:[],events:[]};
  });
  t.after(dispose);
  const bot = new BubbleBot("test", {api:{sendDeviceRpc() { assert.fail("cloud launch"); }}});
  bot.getBoundDevices = async (ctx, options) => {
    queries.push([ctx.chat.id,options.contactId]);
    await sleep(ctx.chat.id === "a" ? 30 : 1);
    return [{deviceId:"cup-"+ctx.chat.id,slotId:"slot-"+ctx.chat.id,slot:1}];
  };
  const results = [];
  bot.dispatchDeviceCallEvent = async (kind,task,extra) => { if(kind === "response") results.push([task.traceId,extra.result]); };
  const [a,b] = await Promise.all([
    bot.callDevice({id:"a"},{slot:1},rpc,{slot:1,contactId:"contact-a",traceId:"trace-a"}),
    bot.callDeviceAsync({id:"b"},{slot:1},rpc,{slot:1,contactId:"contact-b",traceId:"trace-b"}),
  ]);
  await sleep(30);
  assert.equal(a.tal.result,"cup-a"); assert.equal(b.traceId,"trace-b");
  assert.deepEqual(results,[["trace-b","cup-b"]]);
  assert.deepEqual(queries,[["a","contact-a"],["b","contact-b"]]);
  assert.deepEqual(calls.map(d=>[d.deviceId,d.slotId]).sort(),[["cup-a","slot-a"],["cup-b","slot-b"]]);
});

test("bot ordinary RPC and formal launch retain the original transport after adapter installation", async () => {
  const forwarded=[];
  const api={sendDeviceRpc(request) {
    assert.equal(this,api); forwarded.push(request);
    setTimeout(()=>bot.processDeviceUpdate({type:"rpc",code:200,result:{value:123},extend:{traceId:request.traceId}}),0);
    return {code:201};
  }};
  const bot=new BubbleBot("test",{api});
  const dispose=installStudioLaunch({enabled:true,runId:"formal"},async message=>message.op==="launch"?{code:200,result:{value:262}}:{events:[],commands:[]});
  try {
    await bot.callDevice({id:"chat"},device,rpc);
    assert.equal((await bot.callDevice({id:"chat"},device,{method:"otherDeviceRpc"})).tal.result,123);
  } finally { dispose(); }
  assert.equal((await bot.callDevice({id:"chat"},device,rpc)).tal.result,123);
  assert.deepEqual(forwarded.map(r=>r.rpc.method),["otherDeviceRpc","talMpyExecOneScript"]);
});
