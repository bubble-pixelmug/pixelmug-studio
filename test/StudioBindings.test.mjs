import { installBotAdapter, bindingsFor } from "../runtime/BotAdapter.js";
installBotAdapter(BubbleBot);
import test from "node:test";
import assert from "node:assert/strict";
import { BubbleBot } from "../../../mps/jeejio-bubble/sdk/BubbleBot.js";
import { BubbleContext } from "../../../mps/jeejio-bubble/sdk/Context.js";
import { installStudioLaunch } from "../runtime/StudioLaunch.js";

const slot={id:"slot-1",slot:1,device:{id:"mug-1",online:1,name:"Test mug"}};
const context=bot=>new BubbleContext(bot,{event:"message",events:["message:text"],chat:{id:"chat-1",type:"private"},from:{id:"user-1"}});
function setup(t) {
  let slots=[slot], failure=false, saved=[];const calls=[],queries=[];
  const dispose=installStudioLaunch({enabled:true,runId:"r"},async message=>{
    calls.push(message);
    if(message.op==="bindingScopes")return {scopes:saved.filter(s=>s.botKey===message.botKey)};
    if(message.op==="syncBindings")return {count:message.bindings.length};
    if(message.op==="poll")return {events:[],commands:[]};
    throw new Error("Unexpected operation "+message.op);
  });
  const bot=new BubbleBot("test-token",{api:{baseUrl:"https://example.test",async getBotDetail(id){
    queries.push(id);if(failure)throw new Error("query failed");return {result:{botSlotList:slots}};
  }}});
  t.after(()=>{bindingsFor(bot).stop();dispose();});
  return {bot,calls,queries,setSlots:v=>slots=v,setFailure:v=>failure=v,setSaved:v=>saved=v};
}
test("existing server binding is discovered from an ordinary message without bind card or launch",async t=>{
  const {bot,calls,queries}=setup(t);let seen=0;bot.on("message",()=>{seen++;});
  await bot.dispatch(context(bot));
  assert.equal(seen,1);assert.deepEqual(queries,["chat-1"]);
  const sync=calls.find(c=>c.op==="syncBindings");
  assert.equal(sync.scope.to.id,"user-1");assert.equal(sync.bindings[0].device.deviceId,"mug-1");
  assert.ok(!calls.some(c=>c.op==="launch"));
});
test("empty binding waits, bind event refreshes and still reaches application listener; unbind removes it",async t=>{
  const {bot,calls,setSlots}=setup(t);setSlots([]);
  await bindingsFor(bot).observe(context(bot));
  assert.equal(calls.at(-1).bindings.length,0);
  let seen=0;bot.on("message:bind_device",()=>{seen++;});setSlots([slot]);
  const ctx=context(bot);ctx.events=["message:bind_device"];
  await bot.dispatch(ctx);
  assert.equal(seen,1);assert.equal(calls.filter(c=>c.op==="syncBindings").at(-1).bindings.length,1);
  setSlots([]);await bot.dispatch(ctx);
  assert.equal(calls.filter(c=>c.op==="syncBindings").at(-1).bindings.length,0);
});
test("startup restores query scopes, confirms server binding; failed refresh does not publish empty binding",async t=>{
  const {bot,calls,queries,setSaved,setFailure}=setup(t);
  setSaved([{botKey:await bindingsFor(bot).identity(),contactId:"chat-1",chat:{id:"chat-1",type:"private"},to:{id:"user-1"}}]);
  await bindingsFor(bot).start();assert.deepEqual(queries,["chat-1"]);
  const before=calls.filter(c=>c.op==="syncBindings").length;
  setFailure(true);const ctx=context(bot);ctx.events=["message:bind_device"];
  await bindingsFor(bot).observe(ctx);
  assert.equal(calls.filter(c=>c.op==="syncBindings").length,before);
});
