import { createHash, randomUUID } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync, renameSync } from "node:fs";
import { join } from "node:path";
const hash = value => createHash("sha256").update(JSON.stringify(value)).digest("hex");
const str = value => typeof value === "string" && value.length > 0 && value.length <= 256;
function scopeOf(value) {
  if (!/^[a-f0-9]{64}$/.test(value?.botKey || "") || !str(value.contactId) || !str(value.chat?.id) || !str(value.to?.id))
    throw new Error("Invalid Studio binding scope");
  return {botKey:value.botKey,contactId:value.contactId,
    chat:{id:value.chat.id,...(str(value.chat.type)?{type:value.chat.type}:{})},to:{id:value.to.id}};
}
const scopeId = s => hash([s.botKey,s.contactId,s.chat.id,s.to.id]);

// Persist query hints only. No device binding or execution authority survives a run.
export class BindingRegistry {
  constructor(manager, project) {
    this.manager=manager;this.records=new Map();this.scopes=new Map();this.lastScope=null;this.activeScope=null;
    this.directory=join(project,"debug");this.path=join(this.directory,"studio-binding-scopes.json");
    try {
      const bytes=readFileSync(this.path,"utf8");
      if(bytes.length>262144)throw new Error("Binding scope cache too large");
      const cached=JSON.parse(bytes), scopes=cached.scopes;
      if(!Array.isArray(scopes)||scopes.length>128)throw new Error("Invalid binding scope cache");
      for(const value of scopes){const s=scopeOf(value);this.scopes.set(scopeId(s),s);}
      if(cached.lastScope)this.lastScope=scopeOf(cached.lastScope);
    } catch(error) {
      this.scopes.clear();
      if(error.code!=="ENOENT") console.warn("[Studio] binding scope cache unavailable:",error.message);
    }
  }
  restore(botKey) {
    if(!/^[a-f0-9]{64}$/.test(botKey||""))throw new Error("Invalid bot identity");
    if(this.lastScope && this.lastScope.botKey!==botKey && !this.activeScope)this.lastScope=null;
    return {scopes:this.lastScope?.botKey===botKey?[this.lastScope]:[], requiresTestChat:this.manager.requireTestChat===true};
  }
  matches(scope, target=this.activeScope) {
    return Boolean(target && scope && scope.botKey===target.botKey && scope.chat?.id===target.chat.id && scope.chat?.type===target.chat.type);
  }
  validate(value) { return scopeOf(value); }
  select(value) {
    const scope=scopeOf(value);
    this.activeScope=scope;this.lastScope=scope;this.scopes=new Map([[scopeId(scope),scope]]);
    this.save();
    return scope;
  }
  save() {
    mkdirSync(this.directory,{recursive:true});
    writeFileSync(this.path+'.tmp',JSON.stringify({version:2,scopes:[...this.scopes.values()],lastScope:this.lastScope},null,2),{mode:0o600});
    renameSync(this.path+'.tmp',this.path);
  }
  sync(key, value, bindings) {
    const scope=scopeOf(value), sid=scopeId(scope);
    if(this.manager.switchingChat || (this.manager.requireTestChat && !this.matches(scope,this.activeScope || this.lastScope)))return {count:0};
    if(!Array.isArray(bindings)||bindings.length>64)throw new Error("Invalid binding list");
    const next=new Map();
    for(const item of bindings){
      const d=item.device;
      if(!/^[\w-]{1,100}$/.test(item.ownerId||"")||!str(d?.deviceId)||!str(d?.slotId)||!Number.isInteger(Number(d.slot))||Number(d.slot)<1)
        throw new Error("Invalid bound device");
      const bindingId=hash([sid,d.slotId,d.deviceId]);
      if(next.has(bindingId))throw new Error("Duplicate bound device");
      const old=this.records.get(bindingId);
      next.set(bindingId,{bindingId,scopeId:sid,scope,contextId:old?.contextId||randomUUID(),
        executor:{key,ownerId:item.ownerId},device:{deviceId:d.deviceId,slotId:d.slotId,slot:Number(d.slot),
          ...Object.fromEntries(['avatar','sn','talId'].filter(field=>typeof d[field]==='string' && d[field].length<=2048).map(field=>[field,d[field]])),
          ...(str(d.name)?{name:d.name}:{}),...(typeof d.online==="boolean"?{online:d.online}:{})},
        updatedAt:new Date().toISOString()});
    }
    const retained=[...this.records.values()].filter(r=>r.scopeId!==sid);
    if(retained.length+next.size>512||(!this.scopes.has(sid)&&this.scopes.size>=128))throw new Error("Too many Studio bindings");
    const added=[...next.values()].filter(r=>!this.manager.contexts.has(r.contextId)).length;
    const removed=[...this.records.values()].filter(r=>r.scopeId===sid&&!next.has(r.bindingId)).length;
    if(this.manager.contexts.size+added-removed>1024)throw new Error("Too many Studio execution contexts");
    const scopes=new Map(this.scopes);scopes.set(sid,scope);
    this.scopes=scopes;this.save();
    for(const [id,record] of this.records) if(record.scopeId===sid&&!next.has(id)) {
      this.manager.contexts.delete(record.contextId);this.records.delete(id);
    }
    for(const [id,record] of next){
      this.records.set(id,record);
      this.manager.contexts.set(record.contextId,{executor:record.executor,device:record.device});
    }
    this.manager.client(key).lastPollAt=Date.now();
    if(!this.manager.requireTestChat || this.matches(scope))this.manager.bindingsChanged([...next.values()]);
    return {count:next.size};
  }
  list() {
    return [...this.records.values()].map(r=>({bindingId:r.bindingId,device:r.device,
      chat:r.scope.chat,updatedAt:r.updatedAt,
      available:r.device.online!==false && Date.now()-(this.manager.clients.get(r.executor.key)?.lastPollAt||0)<=10000}));
  }
  displayedChat() { return (this.activeScope || this.lastScope)?.chat || null; }
  async run(bindingId, force = true) {
    const record=this.records.get(bindingId);
    if(!record)throw new Error("应用设备绑定已失效，请等待 bot 重新查询");
    return this.manager.launch(record.executor.key,record.executor.ownerId,{...record.device,contextId:record.contextId},force);
  }
}
