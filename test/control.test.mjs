import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile, rm, readFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { EventEmitter, once } from "node:events";
import { startStudio } from "../src/receiver.mjs";
import { installStudioLaunch, studioLaunchMps, httpStudioControl } from "../src/runtime/StudioLaunch.js";
const device = { deviceId:"mug-test",slotId:"slot-test",slot:1 };
class DeviceProtocolFixture extends EventEmitter {
  async connect() { return this; }
  async exec(code) {
    if (!code.startsWith("exec") && code.includes("os.stat")) return String(this.files.get(JSON.parse(/os.stat\(("[^"]+")\)/.exec(code)[1]).slice(1)).length);
    return "";
  }
  files = new Map();
  async putFile(name,data) { this.files.set(name,data); }
  async start(code) {
    const [launchId,nonce] = [...code.matchAll(/"([^"]+)"/g)].map(m=>m[1]);
    this.emit("output","\x1eSTUDIO:"+nonce+":"+JSON.stringify({launchId,state:"running"})+"\ntransport verified\n");
  }
  async probe() { return true; }
  close() { this.emit("disconnect"); }
}
async function setup(t,botSource) {
  const project=await mkdtemp(join(tmpdir(),"studio-control-test-"));
  await mkdir(join(project,"mpy")); await writeFile(join(project,"mpy","__main__.py"),'print("test")');
  if(botSource) await writeFile(join(project,"bot.mjs"),botSource);
  const studio=await startStudio({project,port:0,bind:"127.0.0.1",devices:[device],mirrorBotOutput:false,
    ...(botSource?{bot:"bot.mjs"}:{}),launchOptions:{createRepl:()=>new DeviceProtocolFixture(),timings:{rebootWait:0,retry:1,startTimeout:3000}}});
  t.after(async()=>{await studio.close();await rm(project,{recursive:true,force:true});});
  return studio;
}
test("WebApp launch and PC rerun execute all auxiliary RPCs in bot after the page disconnects", {timeout:15000}, async t=>{
  const sdk=import.meta.resolve("@jeejio-bubble/bot/sdk/BubbleBot.js");
  const launchSDK=new URL("../src/runtime/StudioLaunch.js",import.meta.url).href;
  const source=`import { createMpsHooks } from ${JSON.stringify(new URL("../src/devices/pixelmug.js",import.meta.url).href)};
import { BubbleBot } from ${JSON.stringify(sdk)};
import { studioPrepareMps } from ${JSON.stringify(launchSDK)};
const keepAlive=setInterval(()=>{},1000);
let bootRequest;
const bot=new BubbleBot("test",{api:{async sendDeviceRpc({traceId,rpc}){
  if(rpc.method==="talMpyExecOneScript")throw new Error("Unexpected cloud install");
  console.log("BOT_AUX",rpc.method);
  if(rpc.method==="talMpyRebootStartREPL") { if(!rpc.params.requestId)throw new Error("Missing boot request ID");bootRequest=rpc.params.requestId; }
  const value=rpc.method==="talMpyGetStudioState"?JSON.stringify({protocol:1,mode:"MpyReplMode",requestId:bootRequest,wifiConnected:true,maopaoConnected:true,replReady:true,ip:"127.0.0.1"}):true;
  setTimeout(()=>bot.processDeviceUpdate({type:"rpc",code:200,result:{value},extend:{traceId}}),0);
  return {code:201};
}}});
bot.getBoundDevices=async()=>[${JSON.stringify(device)}];
process.on("message",async msg=>{if(msg.type!=="test:prepare")return;
const result=await studioPrepareMps(${JSON.stringify(device)},createMpsHooks.call(bot, {id:"chat"},{id:"user"},${JSON.stringify(device)},1));
process.send({type:"test:context",...result});});
process.send({type:"test:ready"});
`;
  const s=await setup(t,source);
  const contextPromise=new Promise(resolve=>s.child.on("message",m=>{if(m.type==="test:context")resolve(m.contextId);}));
  // Wait until the application has installed its handler, without relying on timing.
  s.child.on("message",m=>{if(m.type==="test:ready")s.child.send({type:"test:prepare"});});
  const contextId=await contextPromise;
  const config={enabled:true,runId:s.runId,endpoint:s.baseUrl+"/api/logs",token:s.token};
  const transport=httpStudioControl(config);
  const dispose=installStudioLaunch(config,transport); t.after(dispose);
  const response=await studioLaunchMps({...device,contextId},{onEvent:()=>{}});
  dispose(); // Phone page is gone; no more HTTP polls, RPC handlers or replies.
  assert.equal(response.result.value,262);
  async function ready(){for(let i=0;i<100;i++){if(s.launches.list()[0]?.state==="running")return;await new Promise(r=>setTimeout(r,40));}assert.fail(JSON.stringify(s.launches.list()));}
  await ready();
  const again=await s.launches.rerun(response.launchId); assert.notEqual(again.launchId,response.launchId);
  await ready();
  const log=await readFile(join(s.debugDir,"bot.stdout.log"),"utf8");
  for(const method of ["talMpyRebootStartREPL","talMpyGetStudioState"])assert.equal(log.split("BOT_AUX "+method).length-1,2);
  const rejected=await fetch(s.baseUrl+"/api/launch",{method:"POST",headers:{"Content-Type":"application/json",Authorization:"Bearer "+s.token},body:JSON.stringify({op:"register",runId:s.runId,clientId:"intruder",ownerId:"owner",device})});
  assert.equal(rejected.status,400);
  const stopped = await s.close({rebootDevices:true});
  assert.equal(stopped.unconfirmed,0);
  assert.equal(stopped.devices[0].status,"rebootAccepted");
  assert.match(await readFile(join(s.debugDir,"bot.stdout.log"),"utf8"),/BOT_AUX talRebootDevice/);
  assert.equal(JSON.parse(await readFile(join(s.debugDir,"stop.json"),"utf8")).unconfirmed,0);
  assert.ok(s.child.exitCode !== null || s.child.signalCode !== null, "bot closes after reboot reply");
});

test("Node preload drives a bot launch through real parent/child IPC without forwarding the launch RPC to cloud", {timeout:15000}, async t=>{
  const sdk=import.meta.resolve("@jeejio-bubble/bot/sdk/BubbleBot.js");
  const source=`import { BubbleBot } from ${JSON.stringify(sdk)};
const timer=setTimeout(()=>{throw new Error("IPC test timed out");},10000);
let bootRequest;
const bot=new BubbleBot("test",{api:{async sendDeviceRpc({traceId,rpc}){
  if(rpc.method==="talMpyExecOneScript")throw new Error("Unexpected cloud install");
  if(rpc.method==="talMpyRebootStartREPL") { if(!rpc.params.requestId)throw new Error("Missing boot request ID");bootRequest=rpc.params.requestId; }
  const value=rpc.method==="talMpyGetStudioState"?JSON.stringify({protocol:1,mode:"MpyReplMode",requestId:bootRequest,wifiConnected:true,maopaoConnected:true,replReady:true,ip:"127.0.0.1"}):true;
  setTimeout(()=>bot.processDeviceUpdate({type:"rpc",code:200,result:{value},extend:{traceId}}),0);
  return {code:201};
}}});
bot.getBoundDevices=async()=>[${JSON.stringify(device)}];
bot.on("device_notify",ctx=>{if(ctx.tal.notify.some(e=>e.params.value==="MPS_IS_RUNNING")){console.log("IPC_LAUNCH_RUNNING");clearTimeout(timer);}});
const response=await bot.callDevice({id:"chat"},${JSON.stringify(device)},{method:"talMpyExecOneScript"});
console.log("IPC_LAUNCH_ACCEPTED",response.tal.result);
`;
  const s=await setup(t,source);
  const [code]=await once(s.child,"close");
  const stderr=await readFile(join(s.debugDir,"bot.stderr.log"),"utf8").catch(()=>"");
  assert.equal(code,0,stderr);
  const stdout=await readFile(join(s.debugDir,"bot.stdout.log"),"utf8");
  assert.match(stdout,/IPC_LAUNCH_ACCEPTED 262/);assert.match(stdout,/IPC_LAUNCH_RUNNING/);
});



test("PC runs a discovered binding through bot without any talMpyExecOneScript call", {timeout:20000}, async t=>{
  const sdk=import.meta.resolve("@jeejio-bubble/bot/sdk/BubbleBot.js");
  const source=`import { bindingsFor } from ${JSON.stringify(new URL("../src/runtime/BotAdapter.js",import.meta.url).href)};
import { BubbleBot } from ${JSON.stringify(sdk)};
setInterval(()=>{},1000);
let bootRequest;
const bot=new BubbleBot("binding-test",{api:{async sendDeviceRpc({traceId,rpc}){
  if(rpc.method==="talMpyExecOneScript")throw new Error("Launch RPC must not be required");
  console.log("DISCOVERY_AUX",rpc.method);
  if(rpc.method==="talMpyRebootStartREPL")bootRequest=rpc.params.requestId;
  const value=rpc.method==="talMpyGetStudioState"?JSON.stringify({protocol:1,mode:"MpyReplMode",requestId:bootRequest,wifiConnected:true,maopaoConnected:true,replReady:true,ip:"127.0.0.1"}):true;
  setTimeout(()=>bot.processDeviceUpdate({type:"rpc",code:200,result:{value},extend:{traceId}}),0);
  return {code:201};
}}});
bot.getBoundDevices=async()=>[${JSON.stringify(device)}];
await bindingsFor(bot).observe({event:"message",chat:{id:"chat",type:"private"},from:{id:"user"}});
`;
  const s=await setup(t,source);
  for(let i=0;i<200&&!s.launches.bindings.list().length;i++)await new Promise(r=>setTimeout(r,40));
  const [binding]=s.launches.bindings.list();assert.ok(binding);assert.equal(s.launches.list().length,0);
  const request={op:"runBinding",runId:s.runId,clientId:"web-client",bindingId:binding.bindingId};
  const rejected=await fetch(s.baseUrl+"/api/launch",{method:"POST",headers:{"Content-Type":"application/json",Authorization:"Bearer "+s.token},body:JSON.stringify(request)});
  assert.equal(rejected.status,400);
  const response=await fetch(s.baseUrl+"/api/launch",{method:"POST",headers:{"Content-Type":"application/json",Authorization:"Bearer "+s.studioToken},body:JSON.stringify(request)});
  assert.equal(response.status,200);assert.equal((await response.json()).result.value,262);
  for(let i=0;i<200&&s.launches.list()[0]?.state!=="running";i++)await new Promise(r=>setTimeout(r,40));
  assert.equal(s.launches.list()[0]?.state,"running",JSON.stringify(s.launches.list()));
  const log=await readFile(join(s.debugDir,"bot.stdout.log"),"utf8");
  assert.match(log,/DISCOVERY_AUX talMpyRebootStartREPL/);assert.match(log,/DISCOVERY_AUX talMpyGetStudioState/);
});


test("agent restart enters Python Dev and waits for an explicit launch without a second reboot", {timeout:20000}, async t => {
  const sdk=import.meta.resolve("@jeejio-bubble/bot/sdk/BubbleBot.js");
  const adapter=new URL("../src/runtime/BotAdapter.js",import.meta.url).href;
  const source=`import {BubbleBot} from ${JSON.stringify(sdk)};
import {bindingsFor} from ${JSON.stringify(adapter)};
import {readFileSync,writeFileSync,appendFileSync} from "node:fs";
setInterval(()=>{},1000);
const bot=new BubbleBot("restart-test",{api:{async sendDeviceRpc({traceId,rpc}){
  appendFileSync("rpc-calls.txt",process.pid+" "+rpc.method+"\\n");
  if(rpc.method==="talMpyRebootStartREPL")writeFileSync("boot-id.txt",rpc.params.requestId);
  const value=rpc.method==="talMpyGetStudioState"?JSON.stringify({protocol:1,mode:"MpyReplMode",requestId:readFileSync("boot-id.txt","utf8"),wifiConnected:true,maopaoConnected:true,replReady:true,ip:"127.0.0.1"}):true;
  setTimeout(()=>bot.processDeviceUpdate({type:"rpc",code:200,result:{value},extend:{traceId}}),0);
  return {code:201};
}}});
bot.getBoundDevices=async()=>[${JSON.stringify(device)}];
await bindingsFor(bot).observe({event:"message",chat:{id:"chat",type:"private"},from:{id:"user"}});
`;
  const first=await setup(t,source);
  async function waitFor(check) { for(let i=0;i<250;i++){if(check())return;await new Promise(r=>setTimeout(r,30));}assert.fail("restart timed out"); }
  await waitFor(()=>first.launches.bindings.list().length);
  await first.launches.bindings.run(first.launches.bindings.list()[0].bindingId);
  await waitFor(()=>first.launches.list()[0]?.state==="running");
  const prepared=await first.launches.stopDevices({enterRepl:true});
  assert.equal(prepared.unconfirmed,0);
  const bootId=prepared.devices[0].requestId;
  const project=first.launches.project;
  await first.close();
  const second=await startStudio({project,bot:"bot.mjs",port:0,bind:"127.0.0.1",devices:[device],mirrorBotOutput:false,
    launchOptions:{restartDevices:prepared.devices,createRepl:()=>new DeviceProtocolFixture(),timings:{rebootWait:0,retry:1,startTimeout:3000}}});
  try {
    await waitFor(()=>second.launches.bindings.list().length && second.launches.restartList()[0]?.state==="waiting");
    assert.equal(second.launches.list().length,0,"restart must not upload MPY automatically");
    await second.launches.bindings.run(second.launches.bindings.list()[0].bindingId);
    await waitFor(()=>second.launches.list()[0]?.state==="running");
    assert.equal(second.launches.list()[0].launchId,bootId);
    assert.equal(second.launches.restartList()[0].state,"running");
    const log=await readFile(join(project,"rpc-calls.txt"),"utf8");
    assert.equal(log.split("talMpyRebootStartREPL").length-1,2,"initial boot plus old bot preparation only");
    assert.ok(!log.includes(second.child.pid+" talMpyRebootStartREPL"));
    assert.ok(log.includes(second.child.pid+" talMpyGetStudioState"));
  } finally { await second.close(); }
});
