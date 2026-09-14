import test from "node:test";
import assert from "node:assert/strict";
import {mkdtemp,rm,readFile} from "node:fs/promises";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {LaunchManager} from "../launch.mjs";
const scope={botKey:"a".repeat(64),contactId:"chat-1",chat:{id:"chat-1",type:"private"},to:{id:"user-1"}};
const device={deviceId:"mug-1",slotId:"slot-1",slot:1,online:true};
const msg=(op,extra={})=>({op,clientId:"bot-1",runId:"r",...extra});
async function fixture(t){
 const project=await mkdtemp(join(tmpdir(),"studio-bindings-"));
 const options={project,debugDir:join(project,"debug","r"),runId:"r",log:()=>{}};
 const manager=new LaunchManager(options);
 t.after(async()=>{await manager.close();await rm(project,{recursive:true,force:true});});
 return {manager,options,project};
}
test("binding discovery creates a runnable context without a launch, keeps stable IDs, removes unbound devices",async t=>{
 const {manager}=await fixture(t);
 const sync=bindings=>manager.handle("bot",msg("syncBindings",{scope,bindings}));
 await sync([{ownerId:"owner-1",device}]);assert.equal(manager.list().length,0);
 const first=manager.bindings.list()[0];assert.equal(first.available,true);
 let call;manager.launch=async(...args)=>(call=args,{result:{value:262}});
 await manager.bindings.run(first.bindingId);assert.equal(call[2].deviceId,"mug-1");assert.equal(call[3],true);
 const contextId=call[2].contextId;
 await sync([{ownerId:"owner-1",device}]);await manager.bindings.run(first.bindingId);
 assert.equal(call[2].contextId,contextId);
 await sync([]);assert.equal(manager.bindings.list().length,0);assert.equal(manager.contexts.has(contextId),false);
 await assert.rejects(manager.bindings.run(first.bindingId));
});
test("restart restores only query hints for the same bot, never cached execution authority",async t=>{
 const {manager,options,project}=await fixture(t);
 await manager.handle("bot",msg("syncBindings",{scope,bindings:[{ownerId:"owner-1",device}]}));
 const bytes=await readFile(join(project,"debug","studio-binding-scopes.json"),"utf8");
 assert.ok(!bytes.includes("mug-1"));assert.ok(!bytes.includes("owner-1"));
 const next=new LaunchManager(options);t.after(()=>next.close());
 assert.equal(next.bindings.list().length,0);assert.equal(next.contexts.size,0);
 assert.deepEqual((await next.handle("bot",msg("bindingScopes",{botKey:scope.botKey}))).scopes,[scope]);
 assert.deepEqual((await next.handle("bot",msg("bindingScopes",{botKey:"b".repeat(64)}))).scopes,[]);
});
test("browser cannot restore/synchronize bindings; invalid updates leave current bindings intact",async t=>{
 const {manager}=await fixture(t);
 for(const op of ["bindingScopes","syncBindings"])await assert.rejects(manager.handle("webapp",msg(op,{scope,botKey:scope.botKey,bindings:[]})),/Only bot/);
 await manager.handle("bot",msg("syncBindings",{scope,bindings:[{ownerId:"owner-1",device}]}));
 await assert.rejects(manager.handle("bot",msg("syncBindings",{scope,bindings:[{ownerId:"owner-1",device:{...device,slot:0}}]})));
 assert.equal(manager.bindings.list().length,1);
 manager.clients.get("bot:bot-1").lastPollAt=0;assert.equal(manager.bindings.list()[0].available,false);
});
