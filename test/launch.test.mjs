import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile, rm, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { EventEmitter } from "node:events";
import { LaunchManager } from "../src/launch.mjs";
import { snapshotProject, CLEAN } from "../src/deploy.mjs";
const contextIds = new Map();
const device = { deviceId: "mug-1", slotId: "slot-1" };
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

async function fixture(t, failUpload = false) {
  const root = await mkdtemp(join(tmpdir(), "studio-launch-test-"));
  await mkdir(join(root,"mpy","dist"), { recursive: true });
  await mkdir(join(root,"debug"));
  await writeFile(join(root,"mpy","__main__.py"), 'print("test")');
  await writeFile(join(root,"mpy","dist","ignored"), "ignored");
  const operations = [], uploads = new Map(), logs = [];
  class Repl extends EventEmitter {
    async connect(ip) { operations.push("connect:" + ip); return this; }
    async exec(code) {
      operations.push(code);
      if (code.includes("os.stat(") && !code.startsWith("exec")) {
        const name = JSON.parse(/os.stat\(("[^"]+")\)/.exec(code)[1]).slice(1);
        return String(uploads.get(name)?.length);
      }
      return "";
    }
    async putFile(name, bytes) { if (failUpload) throw new Error("disk full"); uploads.set(name, bytes); }
    async start(code) {
      operations.push("start");
      const [id,nonce] = [...code.matchAll(/"([^"]+)"/g)].map(m => m[1]);
      this.emit("output", "\x1eSTUDIO:" + nonce + ":" + JSON.stringify({ launchId:id,state:"running" }) + "\nhello mpy\n");
    }
    async restart(code) { operations.push("restart"); return this.start(code); }
    async probe() { return true; }
    close() { this.emit("disconnect"); }
  }
  const manager = new LaunchManager({ project:root, debugDir:join(root,"debug"), runId:"test-run",
    devices:[device, {deviceId:"mug-2",slotId:"slot-2"}], createRepl:()=>new Repl(), log:(...args)=>logs.push(args),
    timings:{rebootWait:0,retry:1,rpcTimeout:100,startTimeout:1000} });
  for (const ref of [device, {deviceId:"mug-2",slotId:"slot-2"}]) {
    const registration = await manager.handle("bot", {op:"register",runId:"test-run",clientId:"client-1",ownerId:"executor-"+ref.deviceId,device:ref});
    contextIds.set(ref.deviceId, registration.contextId);
  }
  t.after(async()=>{await manager.close();await rm(root,{recursive:true,force:true});});
  return {root,manager,operations,uploads,logs};
}
const message = (op, rest={}) => ({op,runId:"test-run",clientId:"client-1",...rest, ...(op === "launch" ? {device:{...rest.device,contextId:contextIds.get(rest.device?.deviceId)}} : {})});
async function drive(manager, ownerId="owner-1") {
  let after=0;const rpc=[];
  for(let i=0;i<200;i++){
    const data=await manager.handle("bot",message("poll",{after}));
    for(const event of data.events) after=event.seq;
    for(const command of data.commands){
      rpc.push(command.method);
      await manager.handle("bot",message("reply",{commandId:command.id,value:command.method==="talMpyGetStudioState"?JSON.stringify({protocol:1,mode:"MpyReplMode",requestId:manager.commands.get(command.id).job.id,wifiConnected:true,maopaoConnected:true,replReady:true,ip:"192.168.1.2"}):command.method==="talGetWifiInfo"?"SSID: Test WiFi, IP: 192.168.1.2":true}));
    }
    if(manager.list().every(j=>["running","failed"].includes(j.state))) return rpc;
    await sleep(5);
  }
  throw new Error("Launch did not complete");
}
test("launch deploys a source snapshot, ignores MPS metadata, runs through ordinary RPCs and deduplicates",async t=>{
  const {root,manager,operations,uploads,logs}=await fixture(t);
  const first=await manager.handle("webapp",message("launch",{ownerId:"owner-1",device,params:{id:"unused",version:"ignored"}}));
  assert.equal(first.result.value,262);
  assert.deepEqual(await drive(manager),["talMpyRebootStartREPL","talMpyGetStudioState","talGetWifiInfo"]);
  assert.equal(manager.list()[0].state,"running");
  assert.ok(uploads.has("__main__.py"));assert.ok(uploads.has("__studio_bootstrap__.py"));assert.ok(!uploads.has("ignored"));
  assert.ok(operations.some(op=>op.includes("boot.py")&&op.includes("webrepl_cfg.py")));
  assert.ok(logs.some(args=>args[2]==="hello mpy"));
  const again=await manager.handle("bot",message("launch",{ownerId:"owner-2",device}));
  assert.equal(again.result.value,264);assert.equal(again.launchId,first.launchId);
  await manager.rerun(first.launchId);await drive(manager);
  assert.notEqual(manager.list()[0].launchId,first.launchId);
});
test("upload failure never starts the application",async t=>{
  const {manager,operations}=await fixture(t,true);
  await manager.handle("webapp",message("launch",{ownerId:"owner-1",device}));
  await drive(manager);assert.equal(manager.list()[0].state,"failed");assert.ok(!operations.includes("start"));
});
test("runMpyAgain executes the deployed entry without rebooting or uploading",async t=>{
  const {manager,operations,uploads}=await fixture(t);
  const first=await manager.handle("webapp",message("launch",{ownerId:"owner-1",device}));
  await drive(manager);
  const job=[...manager.jobs.values()][0];
  job.repl.emit("output", "\x1eSTUDIO:"+job.nonce+":"+JSON.stringify({launchId:job.id,state:"completed"})+"\n");
  assert.equal(manager.view(job).canRunMpyAgain,true);
  const beforeUploads=uploads.size;
  const beforeOperations=operations.length;
  await manager.runMpyAgain(first.launchId);
  assert.equal(uploads.size,beforeUploads);
  assert.deepEqual(operations.slice(beforeOperations),["restart","start"]);
  assert.equal(job.state,"running");
});
test("unauthorized device, wrong run and reserved startup files fail before any reboot",async t=>{
  const {root,manager,operations}=await fixture(t);
  await assert.rejects(manager.handle("webapp",message("launch",{ownerId:"owner-1",device:{...device,slotId:"wrong"}})),/authorized/);
  await assert.rejects(manager.handle("webapp",{...message("poll"),runId:"wrong"}),/expired/);
  await writeFile(join(root,"mpy","BOOT.PY"),"bad");
  await assert.rejects(manager.handle("webapp",message("launch",{ownerId:"owner-1",device})),/Reserved/);
  assert.equal(operations.length,0);
});
test("source changes create a new fingerprint and bootstrap cleaning protects only root startup files",async t=>{
  const {root}=await fixture(t);
  const first=await snapshotProject(root);
  await writeFile(join(root,"mpy","__main__.py"),'print("changed")');
  assert.notEqual((await snapshotProject(root)).fingerprint,first.fingerprint);
  assert.match(CLEAN,/name not in \("boot.py", "webrepl_cfg.py"\)/);
});


test("two devices deploy independently and foreign clients cannot answer another client's RPC", async t=>{
  const {manager}=await fixture(t);
  await Promise.all([
    manager.handle("webapp",message("launch",{ownerId:"owner-1",device})),
    manager.handle("webapp",message("launch",{ownerId:"owner-2",device:{deviceId:"mug-2",slotId:"slot-2"}})),
  ]);
  await sleep(5);
  const poll=await manager.handle("bot",message("poll"));
  assert.equal(poll.commands.length,2);
  await assert.rejects(manager.handle("webapp",message("reply",{commandId:poll.commands[0].id,value:true})),/another client/);
  await drive(manager);
  assert.equal(manager.list().length,2);
  assert.ok(manager.list().every(job=>job.state==="running"));
  assert.notEqual(manager.list()[0].launchId,manager.list()[1].launchId);
});
test("empty directories participate in the deployment snapshot",async t=>{
  const {root}=await fixture(t);
  const before=await snapshotProject(root);
  await mkdir(join(root,"mpy","empty"));
  const after=await snapshotProject(root);
  assert.ok(after.directories.includes("empty"));
  assert.notEqual(before.fingerprint,after.fingerprint);
});


test("rerun rejects a stale originating SDK before creating a task or touching the device", async t => {
  const {manager, operations} = await fixture(t);
  const first = await manager.handle("webapp", message("launch", {ownerId:"owner-1",device}));
  await drive(manager);
  const before = operations.length;
  manager.clients.get("bot:client-1").lastPollAt = Date.now() - 15000;
  await assert.rejects(manager.rerun(first.launchId), /本地 bot 执行器未连接/);
  assert.equal(manager.list()[0].launchId, first.launchId);
  assert.equal(manager.list()[0].state, "running");
  assert.equal(operations.length, before);
});

test("an uncollected reboot is an executor failure, not assumed device reboot", async t => {
  const {manager, operations} = await fixture(t);
  await manager.handle("webapp", message("launch", {ownerId:"owner-1",device}));
  const job = [...manager.jobs.values()][0];
  const deadline = Date.now() + 4000;
  while (job.state !== "failed" && Date.now() < deadline) await sleep(10);
  assert.equal(job.state, "failed");
  assert.match(job.error, /未领取 talMpyRebootStartREPL/);
  assert.equal(operations.length, 0);
  assert.equal(manager.commands.size, 0, "no Wi-Fi recovery probes queued");
});


test("stale running connection cannot return 264 after a forced device restart", async t => {
  const {manager} = await fixture(t);
  const first = await manager.handle("webapp", message("launch", {ownerId:"owner-1",device}));
  await drive(manager);
  const old = [...manager.jobs.values()][0];
  old.repl.probe = async () => false; // TCP never delivered a close event.
  const next = await manager.handle("bot", message("launch", {ownerId:"owner-2",device}));
  assert.equal(next.result.value, 262);
  assert.notEqual(next.launchId, first.launchId);
  assert.equal([...manager.jobs.values()][0].executor.key, "bot:client-1");
  const events = manager.clients.get("bot:client-1").events;
  assert.ok(!events.some(e => e.launchId === next.launchId && e.value === "MPS_IS_RUNNING"));
});


test("periodic probe timeout preserves logging and recovery; disconnect is not application failure", async t => {
  const {manager, logs} = await fixture(t);
  await manager.handle("webapp", message("launch", {ownerId:"owner-1",device}));
  await drive(manager);
  const job = [...manager.jobs.values()][0];
  let closed = 0;
  job.repl.close = () => { closed++; };
  job.repl.probe = async () => false;
  assert.equal(await manager.checkRunning(job), false);
  assert.equal(job.state, "running");
  assert.ok(manager.list()[0].connectionWarning);
  assert.equal(closed, 0);
  job.repl.emit("output", "still counting\n");
  assert.ok(logs.some(args => args[2] === "still counting"));
  const count = logs.length;
  await manager.checkRunning(job);
  assert.equal(logs.length, count, "unchanged warnings do not flood logs");
  job.repl.probe = async () => true;
  assert.equal(await manager.checkRunning(job), true);
  assert.equal(manager.list()[0].connectionWarning, null);
  job.repl.emit("disconnect");
  assert.equal(job.state, "unknown");
  const events = manager.clients.get("bot:client-1").events;
  assert.ok(!events.some(e => e.value === "RUNNING_FAIL"));
  manager.state(job, "failed", "actual application exception");
  assert.ok(events.some(e => e.value === "RUNNING_FAIL"));
});


test("Studio waits for this boot ID and actual listener readiness before connecting", async t => {
  const {manager, operations} = await fixture(t);
  const calls = []; let polls = 0;
  manager.rpc = async (job, method, timeout, params) => {
    calls.push(method);
    if (method === "talMpyRebootStartREPL") { assert.equal(params.requestId, job.id); return true; }
    if (method === "talGetWifiInfo") return "SSID: Office, guest, IP: 192.168.1.2";
    assert.equal(method, "talMpyGetStudioState");
    assert.ok(!operations.some(x => x.startsWith("connect:")));
    polls++;
    return JSON.stringify({protocol:1, mode:"MpyReplMode", requestId: polls === 1 ? "previous-boot" : job.id,
      wifiConnected:true, maopaoConnected:true, replReady:polls !== 2, ip:"192.168.1.2"});
  };
  await manager.handle("webapp", message("launch", {ownerId:"owner-1",device}));
  const job = [...manager.jobs.values()][0]; await job.work;
  assert.equal(job.state, "running"); assert.equal(polls, 3);
  assert.equal(manager.view(job).network.ssid, "Office, guest");
  assert.equal(manager.view(job).network.ip, "192.168.1.2");
  assert.equal(calls.filter(x => x === "talMpyRebootStartREPL").length, 1);
});

for (const failure of ["boot-error", "stale-boot", "lost-reboot-ack"]) {
  test("Studio boot handshake: " + failure, async t => {
    const {manager, operations} = await fixture(t);
    manager.timings.onlineTimeout = 25;
    let reboots = 0, polls = 0;
    manager.rpc = async (job, method) => {
      if (method === "talMpyRebootStartREPL") {
        reboots++;
        if (failure === "lost-reboot-ack") throw new Error("network disconnected");
        return true;
      }
      polls++;
      return {protocol:1, mode:"MpyReplMode", requestId:failure === "stale-boot" ? "old" : job.id,
        wifiConnected:true,maopaoConnected:true,replReady:true,ip:"192.168.1.2",
        error:failure === "boot-error" ? "WebREPL boot failed" : ""};
    };
    await manager.handle("bot", message("launch", {ownerId:"owner-1",device}));
    const job = [...manager.jobs.values()][0]; await job.work;
    assert.equal(reboots, 1);
    assert.equal(job.state, failure === "lost-reboot-ack" ? "running" : "failed");
    if (failure !== "lost-reboot-ack") assert.equal(operations.length, 0);
    if (failure === "boot-error") assert.equal(polls, 1);
  });
}


async function finishStop(manager, resultFor = () => ({value:true})) {
  const stopping = manager.stopDevices();
  assert.equal(manager.stopDevices(), stopping, "stop is idempotent");
  let done=false; stopping.finally(()=>done=true);
  const sent=[];
  while(!done) {
    const {commands}=await manager.handle("bot",message("poll"));
    for(const command of commands) {
      sent.push(command.method);
      await manager.handle("bot",message("reply",{commandId:command.id,...resultFor(command)}));
    }
    await sleep(5);
  }
  return {result:await stopping,sent};
}
test("stop reboots only deployed devices once, preserves result and rejects new launches",async t=>{
  const {manager,root}=await fixture(t);
  await manager.handle("bot",message("launch",{ownerId:"owner",device}));await drive(manager);
  const {result,sent}=await finishStop(manager);
  assert.deepEqual(sent,["talRebootDevice"]);
  assert.deepEqual(result.devices.map(d=>d.deviceId),["mug-1"]);
  assert.equal(result.unconfirmed,0);assert.equal(manager.list()[0].state,"stopped");
  assert.equal(JSON.parse(await readFile(join(root,"debug","stop.json"),"utf8")).devices.length,1);
  await assert.rejects(manager.handle("bot",message("launch",{ownerId:"owner",device})),/stopping/);
});
test("stop continues across devices and reports a failed reboot instead of claiming success",async t=>{
  const {manager}=await fixture(t);
  for(const ref of [device,{deviceId:"mug-2",slotId:"slot-2"}]) await manager.handle("bot",message("launch",{ownerId:"owner-"+ref.deviceId,device:ref}));
  await drive(manager);
  const {result,sent}=await finishStop(manager,c=>c.ownerId.endsWith("mug-1")?{value:true}:{error:{message:"device offline"}});
  assert.equal(sent.length,2);assert.equal(result.unconfirmed,1);
  assert.equal(result.devices.find(d=>d.deviceId==="mug-2").status,"unconfirmed");
});
test("stop cancels an undelivered deployment before sending a normal reboot",async t=>{
  const {manager,operations}=await fixture(t);
  await manager.handle("bot",message("launch",{ownerId:"owner",device}));
  const {result,sent}=await finishStop(manager);
  assert.deepEqual(sent,["talRebootDevice"]);assert.equal(result.unconfirmed,0);
  assert.ok(!operations.includes("start"));
});
test("stop refuses stale or unauthorized device contexts and still completes locally",async t=>{
  const {manager}=await fixture(t);
  await manager.handle("bot",message("launch",{ownerId:"owner",device}));await drive(manager);
  manager.authorizeDevice=async()=>{throw new Error("binding removed");};
  const {result,sent}=await finishStop(manager);
  assert.deepEqual(sent,[]);assert.equal(result.unconfirmed,1);
});
test("stop times out without reboot response and does not retry",async t=>{
  const {manager}=await fixture(t);
  await manager.handle("bot",message("launch",{ownerId:"owner",device}));await drive(manager);
  const stopping=manager.stopDevices();await sleep(10);
  const poll=await manager.handle("bot",message("poll"));
  assert.equal(poll.commands.length,1);assert.equal(poll.commands[0].method,"talRebootDevice");
  const result=await stopping;assert.equal(result.unconfirmed,1);assert.equal(manager.commands.size,0);
});


test("binding preparation enters Python Dev but waits for an explicit application launch",async t=>{
  const {manager}=await fixture(t);
  manager.prepareOnBinding=true;
  manager.bindings.sync("bot:client-1",{
    botKey:"a".repeat(64),contactId:"user-1",chat:{id:"chat-1",type:"private"},to:{id:"bot-1"}
  },[{ownerId:"executor-mug-1",device:{...device,slot:1,online:true}}]);
  await sleep(0);
  const preparation=manager.restartPlans.get(device.deviceId);
  assert.equal(preparation.state,"preparing");
  const poll=await manager.handle("bot",message("poll"));
  assert.equal(poll.commands.length,1);
  assert.equal(poll.commands[0].method,"talMpyRebootStartREPL");
  assert.equal(poll.commands[0].params.requestId,preparation.requestId);
  await manager.handle("bot",message("reply",{commandId:poll.commands[0].id,value:true}));
  await preparation.work;
  assert.equal(manager.restartList()[0].state,"waiting");
  assert.equal(manager.jobs.size,0,"preparing Python Dev must not upload MPY");

  const binding=manager.bindings.list()[0];
  await manager.bindings.run(binding.bindingId);
  const calls=await drive(manager);
  assert.ok(!calls.includes("talMpyRebootStartREPL"),"the application launch must reuse the prepared boot");
  assert.equal(manager.list()[0].state,"running");
  assert.equal(manager.list()[0].launchId,preparation.requestId);
});


test("automatic mode deploys each bound device once after Python Dev is ready",async t=>{
  const {manager}=await fixture(t);
  manager.prepareOnBinding=true; manager.autoRunOnBinding=true;
  manager.bindings.sync("bot:client-1",{
    botKey:"b".repeat(64),contactId:"user-1",chat:{id:"chat-1",type:"private"},to:{id:"bot-1"}
  },[{ownerId:"executor-mug-1",device:{...device,slot:1,online:true}}]);
  const calls=[]; let after=0;
  for(let i=0;i<300 && manager.list()[0]?.state!=="running";i++){
    const poll=await manager.handle("bot",message("poll",{after}));
    for(const event of poll.events) after=event.seq;
    for(const command of poll.commands){
      calls.push(command.method);
      const job=manager.commands.get(command.id).job;
      const value=command.method==="talMpyGetStudioState"
        ? JSON.stringify({protocol:1,mode:"MpyReplMode",requestId:job.id,wifiConnected:true,maopaoConnected:true,replReady:true,ip:"192.168.1.2"})
        : command.method==="talGetWifiInfo" ? "SSID: Test WiFi, IP: 192.168.1.2" : true;
      await manager.handle("bot",message("reply",{commandId:command.id,value}));
    }
    await sleep(5);
  }
  assert.equal(manager.list()[0]?.state,"running");
  assert.equal(calls.filter(method=>method==="talMpyRebootStartREPL").length,1);
  assert.equal(manager.autoRunDevices.size,1);
  const bindingRecord=[...manager.bindings.records.values()][0];
  manager.bindingsChanged([bindingRecord]);
  await sleep(10);
  assert.equal(manager.jobs.size,1,"repeated binding sync must not redeploy the same device");
});

test("restart handover stays waiting without a binding or application launch",async t=>{
  const {manager}=await fixture(t);
  manager.restartPlans.set("mug-1",{deviceId:"mug-1",slotId:"slot-1",requestId:"launch-restart",state:"waiting"});
  await sleep(10);
  assert.equal(manager.restartList()[0].state,"waiting");
  assert.equal(manager.jobs.size,0);assert.equal(manager.commands.size,0);
});

test("stop during restart handover reports an unresolved device rather than forgetting it",async t=>{
  const {manager}=await fixture(t);
  manager.restartPlans.set("mug-1",{deviceId:"mug-1",slotId:"slot-1",requestId:"launch-handover",state:"waiting",deadline:Date.now()+90000});
  const result=await manager.stopDevices();
  assert.equal(result.devices.length,1);assert.equal(result.devices[0].deviceId,"mug-1");assert.equal(result.unconfirmed,1);
});

test("automatic prepared deployment starts while the rebooting device is temporarily reported offline",async t=>{
  const {manager}=await fixture(t);
  manager.prepareOnBinding=true; manager.autoRunOnBinding=true; manager.timings.rebootWait=1000;
  manager.authorizeDevice=async(ref, options)=>{
    assert.equal(options?.allowOffline,true,"only a matching Studio-prepared restart may bypass transient online state");
    return {deviceId:String(ref.deviceId),slotId:String(ref.slotId)};
  };
  manager.restartPlans.set(device.deviceId,{deviceId:device.deviceId,slotId:device.slotId,
    requestId:"launch-prepared-offline",state:"waiting",message:"waiting"});
  manager.bindings.sync("bot:client-1",{
    botKey:"c".repeat(64),contactId:"user-1",chat:{id:"chat-1",type:"private"},to:{id:"bot-1"}
  },[{ownerId:"executor-mug-1",device:{...device,slot:1,online:false}}]);
  let command;
  for(let i=0;i<30&&!command;i++){
    command=(await manager.handle("bot",message("poll"))).commands[0];
    if(!command)await sleep(5);
  }
  assert.equal(command?.method,"talMpyGetStudioState","prepared deployment must not wait for the 15-second online refresh or reboot delay");
  const job=manager.commands.get(command.id).job;
  await manager.handle("bot",message("reply",{commandId:command.id,value:JSON.stringify({protocol:1,mode:"MpyReplMode",
    requestId:job.id,wifiConnected:true,maopaoConnected:true,replReady:true,ip:"192.168.1.2"})}));
  assert.deepEqual(await drive(manager),["talGetWifiInfo"]);
  assert.equal(manager.list()[0]?.state,"running");
});

test("simultaneous automatic and app launch requests share one deployment",async t=>{
  const {manager}=await fixture(t);
  const [automatic,fromApp]=await Promise.all([
    manager.launch("bot:client-1","automatic",{...device,contextId:contextIds.get(device.deviceId)},false),
    manager.handle("webapp",message("launch",{ownerId:"from-app",device}))
  ]);
  assert.equal(automatic.launchId,fromApp.launchId);
  const calls=await drive(manager);
  assert.equal(calls.filter(method=>method==="talMpyRebootStartREPL").length,1);
  assert.equal(manager.jobs.size,1);
});
test('device logs carry origin, lifecycle boundaries and structured exception lines',async t=>{
  const {manager,logs}=await fixture(t);
  await manager.handle('webapp',message('launch',{ownerId:'owner-1',device}));
  await drive(manager);
  assert.ok(logs.some(args=>args[3]==='studio'&&args[4]?.lifecycle==='running'));
  assert.ok(logs.some(args=>args[2]==='hello mpy'&&args[3]==='console'&&args[1]==='log'));
  const job=[...manager.jobs.values()][0];
  const frame=event=>'\x1eSTUDIO:'+job.nonce+':'+JSON.stringify({launchId:job.id,...event})+'\n';
  job.repl.emit('output',frame({type:'exception',message:'Traceback (most recent call last):'}));
  job.repl.emit('output',frame({type:'exception',message:'ValueError: example'}));
  job.repl.emit('output',frame({state:'failed',message:'example'}));
  assert.ok(logs.some(args=>args[1]==='error'&&args[3]==='console'&&args[2]==='ValueError: example'));
  assert.ok(logs.some(args=>args[1]==='error'&&args[3]==='studio'&&args[4]?.lifecycle==='failed'));
  assert.ok(!logs.some(args=>String(args[2]).includes(job.nonce)));
});