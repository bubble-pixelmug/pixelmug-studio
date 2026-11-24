import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { LaunchManager } from '../src/launch.mjs';
import { createMpsHooks } from '../src/devices/pixelmug.js';
import { StudioBindings } from '../src/runtime/StudioBindings.js';
import { installStudioLaunch, studioPrepareMps, studioLaunchMps } from '../src/runtime/StudioLaunch.js';

const tick = () => new Promise(resolve => setImmediate(resolve));
const scope = id => ({botKey:'a'.repeat(64),contactId:id,chat:{id,type:'group'},to:{id:'developer'}});
const bound = id => ({ownerId:'owner-'+id,device:{deviceId:id,slotId:'slot',slot:1,online:true}});
function fixture() {
  const project=mkdtempSync(join(tmpdir(),'studio-sessions-'));
  const debugDir=join(project,'debug','run');mkdirSync(debugDir,{recursive:true});
  mkdirSync(join(project,'mpy'));writeFileSync(join(project,'mpy','__main__.py'),'print("test")');
  const manager=new LaunchManager({project,debugDir,runId:'run',log(){},requireTestChat:true,
    studioUserId:'developer',prepareOnBinding:true,timings:{rebootWait:1,retry:1,onlineTimeout:100},
    authorizeDevice:function(ref,options){return this.authorizeBoundDevice(ref,options);}});
  manager.rpc=async()=>true;
  const control=(op,payload={})=>manager.handle('bot',{runId:'run',clientId:'local',op,...payload});
  const select=id=>control('selectTestChat',{scope:scope(id),senderId:'developer'});
  const sync=async(id,device)=>{await control('syncBindings',{scope:scope(id),bindings:device?[bound(device)]:[]});await tick();};
  return {manager,control,select,sync,close:async()=>{await manager.close();rmSync(project,{recursive:true,force:true});}};
}
function running(manager,id,repl) {
  const session=manager.sessions.devices.get(id), dir=join(manager.debugDir,'fake-'+id);
  mkdirSync(dir,{recursive:true});
  const job={id:'fake-'+id,dir,device:session.record.device,executor:session.record.executor,
    session,repl,abort:new AbortController(),owners:new Map(),state:'running',work:Promise.resolve()};
  manager.jobs.set(id,job);session.job=job;
  return job;
}

test('multiple replacements stop each original VM through its original socket and never target its replacement',async()=>{
  const f=fixture();const resets=[],rpcs=[];
  try {
    f.manager.rpc=async(job,method)=>{
      rpcs.push([job.device.deviceId,method]);
      if(method==='talRebootDevice')throw new Error('Device binding changed');
      return true;
    };
    await f.select('a');
    for(const id of ['one','two','three']) {
      await f.sync('a',id);
      running(f.manager,id,{closed:false,cancelOperations(){},async reboot(){resets.push(id);},close(){this.closed=true;}});
    }
    assert.deepEqual(resets,['one','two']);
    await f.select('b');
    assert.deepEqual(resets,['one','two','three']);
    assert.deepEqual(rpcs.filter(([,method])=>method==='talRebootDevice').map(([id])=>id),['one','two','three']);
    assert.equal(f.manager.sessions.warnings().length,0);
    assert.equal(f.manager.jobs.size,0);
  } finally {await f.close();}
});

test('unreachable former devices remain visible as cleanup warnings after further chat switches',async()=>{
  const f=fixture();
  try {
    await f.select('a');await f.sync('a','one');
    f.manager.rpc=async(job,method)=>{if(method==='talRebootDevice')throw new Error('Original binding is gone');return true;};
    await f.sync('a','two');
    assert.equal(f.manager.sessions.warnings()[0].deviceId,'one');
    await f.select('b');await f.select('c');
    assert.deepEqual(f.manager.sessions.warnings().map(d=>d.deviceId),['one','two']);
    const persisted=JSON.parse(readFileSync(join(f.manager.debugDir,'device-cleanup.json'),'utf8'));
    assert.equal(persisted.filter(d=>d.status==='unconfirmed').length,2);
  } finally {await f.close();}
});

test('a removed binding without a usable WebREPL reports that stopping the previous device cannot be confirmed',async()=>{
  const f=fixture();
  try {
    await f.select('a');await f.sync('a','one');
    f.manager.rpc=async(job,method)=>{
      if(method==='talRebootDevice') {
        const error=new Error('Device binding changed; refusing auxiliary RPC to a different device');
        error.code='STUDIO_BINDING_CHANGED';throw error;
      }
      return true;
    };
    await f.sync('a','two');
    const warning=f.manager.sessions.warnings().find(item=>item.deviceId==='one');
    assert.equal(warning.code,'STUDIO_CLEANUP_UNREACHABLE');
    assert.match(warning.message,/WebREPL/);
    assert.doesNotMatch(warning.message,/refusing auxiliary RPC/);
    assert.equal(f.manager.restartPlans.get('two').state,'waiting');
  } finally {await f.close();}
});

test('overlapping devices wait for normal reboot recovery before a new REPL request',async()=>{
  const f=fixture();const calls=[];let probes=0;
  try {
    f.manager.rpc=async(job,method)=>{
      calls.push(method);
      if(method==='talMpyGetStudioState')return {protocol:1,mode:++probes<3?'MpyReplMode':'normal',wifiConnected:true,maopaoConnected:true};
      return true;
    };
    await f.select('a');await f.sync('a','one');
    await f.select('b');await f.sync('b','one');
    await f.manager.restartPlans.get('one').work;
    assert.deepEqual(calls,['talMpyRebootStartREPL','talRebootDevice',
      'talMpyGetStudioState','talMpyGetStudioState','talMpyGetStudioState','talMpyRebootStartREPL']);
    assert.equal(f.manager.restartPlans.get('one').state,'waiting');
  } finally {await f.close();}
});

test('an old launch waiting for the physical device lock cannot cross a chat switch',async()=>{
  const f=fixture();let release;
  try {
    await f.select('a');await f.sync('a','one');
    const record=[...f.manager.bindings.records.values()][0];
    f.manager.locks.set('one',new Promise(resolve=>{release=resolve;}));
    const launch=f.manager.launch('bot:local','viewer',{...record.device,contextId:record.contextId});
    const rejection=assert.rejects(launch,/session expired/);
    await tick();await f.select('b');
    f.manager.locks.delete('one');release();
    await rejection;
    assert.equal(f.manager.jobs.size,0);
  } finally {release?.();await f.close();}
});

test('a failed preparation checks the original boot ID and resumes without a second reboot',async()=>{
  const f=fixture();let requests=0,bootId;
  try {
    f.manager.rpc=async(job,method,timeout,params)=>{
      if(method==='talMpyRebootStartREPL') {requests++;bootId=params.requestId;throw new Error('RPC rejected');}
      return {protocol:1,mode:'MpyReplMode',requestId:bootId};
    };
    await f.select('a');await f.sync('a','one');
    assert.equal(f.manager.restartPlans.get('one').state,'failed');
    await f.sync('a','one');await f.manager.restartPlans.get('one').work;
    assert.equal(f.manager.restartPlans.get('one').state,'waiting');
    assert.equal(f.manager.restartPlans.get('one').requestId,bootId);
    assert.equal(requests,1);
  } finally {await f.close();}
});

test('a definitively failed preparation can retry after verifying normal mode',async()=>{
  const f=fixture();let requests=0;
  try {
    f.manager.rpc=async(job,method)=>{
      if(method==='talMpyRebootStartREPL') {if(++requests===1)throw new Error('RPC rejected');return true;}
      return {protocol:1,mode:'normal'};
    };
    await f.select('a');await f.sync('a','one');
    await f.sync('a','one');await f.manager.restartPlans.get('one').work;
    assert.equal(requests,2);assert.equal(f.manager.restartPlans.get('one').state,'waiting');
  } finally {await f.close();}
});

test('RPC revalidates its session after an asynchronous binding lookup and before transport',async()=>{
  let resolveLookup,transports=0;
  const target={deviceId:'one',slotId:'slot',slot:1};
  const hooks=createMpsHooks.call({getBoundDevices:()=>new Promise(resolve=>{resolveLookup=resolve;}),
    callDevice:async()=>{transports++;}},scope('a').chat,{id:'developer'},target,1);
  const request=hooks.executeRpc({method:'talRebootDevice',assertActive:async()=>{throw new Error('session expired');}},100);
  resolveLookup([target]);
  await assert.rejects(request,/session expired/);assert.equal(transports,0);
});

test('a binding query started in the old chat cannot repopulate runtime scopes after switching',async()=>{
  let resolveLookup;const synced=[];
  const dispose=installStudioLaunch({enabled:true,runId:'run'},async message=>{
    if(message.op==='syncBindings')synced.push(message.scope.chat.id);
    return {};
  });
  try {
    const runtime=new StudioBindings({getBoundDevices:()=>new Promise(resolve=>{resolveLookup=resolve;})});
    const old=runtime.refresh(scope('a'),true);
    runtime.generation++;runtime.scopes.clear();
    resolveLookup([]);await old;
    assert.deepEqual(synced,[]);assert.equal(runtime.scopes.size,0);
    runtime.stop();
  } finally {dispose();}
});

test('moving the same physical device to a new slot waits for cleanup and prepares without another poll',async()=>{
  const f=fixture();const calls=[];
  try {
    f.manager.rpc=async(job,method)=>{
      calls.push([job.device.slotId,method]);
      return method==='talMpyGetStudioState'?{protocol:1,mode:'normal',wifiConnected:true,maopaoConnected:true}:true;
    };
    await f.select('a');await f.sync('a','one');
    const moved=bound('one');moved.device.slotId='new-slot';
    await f.control('syncBindings',{scope:scope('a'),bindings:[moved]});
    await tick();
    await f.manager.restartPlans.get('one').work;
    assert.deepEqual(calls,[['slot','talMpyRebootStartREPL'],['slot','talRebootDevice'],
      ['new-slot','talMpyGetStudioState'],['new-slot','talMpyRebootStartREPL']]);
    assert.equal(f.manager.restartPlans.get('one').slotId,'new-slot');
  } finally {await f.close();}
});

test('switching during preparation authorization cancels before RPC delivery without a cleanup deadlock',async()=>{
  const f=fixture();let release,entered;
  const authorized=new Promise(resolve=>{entered=resolve;});
  const gate=new Promise(resolve=>{release=resolve;});
  try {
    f.manager.authorizeDevice=async()=>{entered();await gate;return {deviceId:'one',slotId:'slot'};};
    await f.select('a');
    f.manager.bindings.sync('bot:local',scope('a'),[bound('one')]);
    await authorized;
    const switching=f.select('b');
    release();
    const result=await switching;
    assert.equal(f.manager.bindings.displayedChat().id,'b');
    assert.equal(result.unconfirmed,0);
    assert.equal(f.manager.commands.size,0);
  } finally {release?.();await f.close();}
});

test('an executor from an old chat cannot register after a switch even for a reused physical device',async()=>{
  const f=fixture();
  try {
    await f.select('a');await f.sync('a','one');await f.select('b');
    await assert.rejects(f.control('register',{ownerId:'old-owner',device:bound('one').device,chat:scope('a').chat}),/inactive/);
    const registered=await f.control('register',{ownerId:'new-owner',device:bound('one').device,chat:scope('b').chat});
    assert.ok(registered.contextId);
  } finally {await f.close();}
});

test('Bot registration and WebApp context launch still share the selected device session',async()=>{
  const f=fixture();
  const dispose=installStudioLaunch({enabled:true,runId:'run',clientId:'local'},payload=>f.manager.handle('bot',payload));
  try {
    await f.select('a');await f.sync('a','one');
    const hooks=createMpsHooks.call({},scope('a').chat,{id:'developer'},bound('one').device,1);
    const prepared=await studioPrepareMps(bound('one').device,hooks);
    f.manager.run=async job=>{f.manager.sessions.assert(job.session);job.state='running';};
    const result=await studioLaunchMps({...bound('one').device,contextId:prepared.contextId},{onEvent(){}});
    await f.manager.jobs.get('one').work;
    assert.equal(result.result.value,262);
    assert.equal(f.manager.jobs.get('one').state,'running');
    assert.equal(f.manager.jobs.get('one').session,f.manager.sessions.devices.get('one'));
  } finally {dispose();await f.close();}
});
