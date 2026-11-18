import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtempSync, rmSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { LaunchManager } from '../src/launch.mjs';
import { displayBotSlots, bindingsForDisplayedSlots } from '../src/slot-display.mjs';
import { BubbleBot } from '@jeejio-bubble/bot/sdk';
import { installBotAdapter } from '../src/runtime/BotAdapter.js';
import { installStudioLaunch } from '../src/runtime/StudioLaunch.js';

const scope=id=>({botKey:'a'.repeat(64),contactId:id,chat:{id,type:'group'},to:{id:'developer'}});
const device=(id,slot=1)=>({ownerId:`owner-${id}`,device:{deviceId:id,slotId:`slot-${id}`,slot,online:true,name:id,sn:`SN-${id}`,avatar:'https://example.com/mug.png'}});
function fixture() {
  const project=mkdtempSync(join(tmpdir(),'studio-test-chat-'));
  const debugDir=join(project,'debug','run');mkdirSync(debugDir,{recursive:true});
  const manager=new LaunchManager({project,debugDir,runId:'run',log(){},requireTestChat:true,studioUserId:'developer',prepareOnBinding:true,
    authorizeDevice:function(ref,options){return this.authorizeBoundDevice(ref,options);}});
  const control=(op,body={})=>manager.handle('bot',{runId:'run',clientId:'local',op,...body});
  return {project,manager,control,close:async()=>{await manager.close();rmSync(project,{recursive:true,force:true});}};
}

test('history is preview only and cannot reboot or deploy before explicit selection',async()=>{
  const f=fixture();
  try {
    f.manager.bindings.select(scope('last-chat'));
    // A new Studio run restores a single preview scope, never active authority.
    const next=new LaunchManager({project:f.project,debugDir:f.manager.debugDir,runId:'next',log(){},requireTestChat:true,studioUserId:'developer',prepareOnBinding:true});
    let rpcCount=0;next.rpc=async()=>{rpcCount++;return true;};
    assert.deepEqual(next.bindings.restore('a'.repeat(64)).scopes,[scope('last-chat')]);
    assert.equal(next.bindings.activeScope,null);
    next.bindings.sync('bot:local',scope('last-chat'),[device('red-heart')]);
    next.bindings.sync('bot:local',scope('other-chat'),[device('horse')],true,true);
    await new Promise(resolve=>setImmediate(resolve));
    assert.equal(rpcCount,0);
    assert.equal(next.bindings.displayedChat().id,'last-chat');
    assert.equal(next.bindings.records.size,1);
    assert.throws(()=>next.authorizeBoundDevice(device('red-heart').device),/test-in-this-chat/);
    await next.close();
  } finally {await f.close();}
});

test('only the Studio account can select a chat; background traffic cannot switch it',async()=>{
  const f=fixture();
  try {
    await assert.rejects(f.control('selectTestChat',{scope:scope('a'),senderId:'other-user'}),/signed in/);
    assert.equal(f.manager.bindings.activeScope,null);
    await f.control('selectTestChat',{scope:scope('a'),senderId:'developer'});
    let rpcCount=0;f.manager.rpc=async()=>{rpcCount++;return true;};
    f.manager.bindings.sync('bot:local',scope('a'),[device('horse')]);
    await new Promise(resolve=>setImmediate(resolve));
    assert.equal(rpcCount,1);
    f.manager.bindings.sync('bot:local',scope('b'),[device('red-heart')],true,true);
    assert.equal(f.manager.bindings.displayedChat().id,'a');
    await assert.rejects(f.control('assertTestChat',{scope:scope('b')}),/test-in-this-chat/);
    assert.deepEqual(await f.control('assertTestChat',{scope:scope('a')}),{allowed:true});
    const slots=displayBotSlots([{id:'registered-slot'}],f.manager.bindings.list(),[],f.manager.bindings.displayedChat());
    assert.equal(slots[0].device.id,'horse');
    assert.equal(slots[0].device.sn,'SN-horse');
    assert.equal(bindingsForDisplayedSlots(slots,f.manager.bindings.list())[0].device.deviceId,'horse');
  } finally {await f.close();}
});

test('switching chats reboots prepared old devices normally before preparing new devices',async()=>{
  const f=fixture();
  try {
    const calls=[];f.manager.rpc=async(job,method)=>{calls.push([job.device.deviceId,method]);return true;};
    await f.control('selectTestChat',{scope:scope('a'),senderId:'developer'});
    f.manager.bindings.sync('bot:local',scope('a'),[device('red-heart')]);
    await new Promise(resolve=>setImmediate(resolve));
    const result=await f.control('selectTestChat',{scope:scope('b'),senderId:'developer'});
    assert.equal(result.unconfirmed,0);
    f.manager.bindings.sync('bot:local',scope('b'),[device('horse')]);
    await new Promise(resolve=>setImmediate(resolve));
    assert.deepEqual(calls,[['red-heart','talMpyRebootStartREPL'],['red-heart','talRebootDevice'],['horse','talMpyRebootStartREPL']]);
    assert.equal(f.manager.bindings.displayedChat().id,'b');
    assert.equal(f.manager.stopping,false);
    assert.equal(f.manager.jobs.size,0);
    assert.equal(f.manager.bindings.records.size,1);
    await f.control('selectTestChat',{scope:scope('b'),senderId:'developer'});
    assert.equal(calls.length,3);
  } finally {await f.close();}
});

test('first run shows empty registered slots instead of account devices',()=>{
  const slots=displayBotSlots([{id:'one',device:{id:'red-heart'}}]);
  assert.equal(slots.length,1);assert.equal(slots[0].device,null);
});

test('a failed old-device reboot is returned while the new chat remains selectable',async()=>{
  const f=fixture();
  try {
    f.manager.rpc=async()=>true;
    await f.control('selectTestChat',{scope:scope('a'),senderId:'developer'});
    f.manager.bindings.sync('bot:local',scope('a'),[device('old-device')]);
    await new Promise(resolve=>setImmediate(resolve));
    f.manager.rpc=async()=>{throw new Error('Device RPC timed out');};
    const result=await f.control('selectTestChat',{scope:scope('b'),senderId:'developer'});
    assert.equal(result.unconfirmed,1);
    assert.match(result.devices[0].message,/timed out/);
    assert.equal(f.manager.bindings.displayedChat().id,'b');
    assert.equal(f.manager.stopping,false);
  } finally {await f.close();}
});

test('Studio command passes group filtering, is intercepted before application handlers, and checks sender',async()=>{
  const f=fixture();f.manager.prepareOnBinding=false;
  const dispose=installStudioLaunch({enabled:true,runId:'run',clientId:'local'},payload=>f.manager.handle('bot',payload));
  try {
    installBotAdapter(BubbleBot);
    const bot=new BubbleBot('test-token',{api:{baseUrl:'https://example.com',getBotDetail:async()=>({botSlotList:[
      {id:'slot-horse',slot:1,talId:'PixelMugS1',device:{id:'horse',name:'Horse',online:1}},
    ]})}});
    const update={type:'im',method:'groupMessage',params:{message:{content:'/test-in-this-chat'}},extend:{chat:{id:'a',type:'group'},mentionedMe:false}};
    assert.equal(bot.shouldEnqueueMessengerUpdate(update),true);
    const replies=[];let applicationCalls=0;
    const ctx={event:'message',events:['message:text'],message:{content:'/test-in-this-chat'},chat:{id:'a',type:'group'},
      from:{id:'unauthorized'},resolveBotDetailContactId:()=> 'a',sendText:async text=>replies.push(text)};
    await bot.handleWebAppSystemMiddleware(ctx,async()=>{applicationCalls++;});
    assert.equal(f.manager.bindings.activeScope,null);
    assert.match(replies[0],/signed in/);
    ctx.from={id:'developer'};
    await bot.handleWebAppSystemMiddleware(ctx,async()=>{applicationCalls++;});
    assert.equal(applicationCalls,0);
    assert.equal(f.manager.bindings.displayedChat().id,'a');
    assert.equal(f.manager.bindings.list()[0].device.deviceId,'horse');
    ctx.message.content='ordinary application message';
    await bot.handleWebAppSystemMiddleware(ctx,async()=>{applicationCalls++;});
    assert.equal(applicationCalls,1);
  } finally {dispose();await f.close();}
});
