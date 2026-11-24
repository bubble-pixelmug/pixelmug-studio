import { createMpsHooks } from "../devices/pixelmug.js";
import { studioLaunchEnabled, studioBindingControl, studioSyncBindingScope } from "./StudioLaunch.js";

const participant = value => typeof value === "string" ? {id:value} : value?.id ? {id:String(value.id), ...(value.type ? {type:value.type} : {})} : undefined;
const enabled = () => studioLaunchEnabled({method:"talMpyExecOneScript"});

// Studio-only discovery. Server binding queries remain the source of truth.
export class StudioBindings {
  constructor(bot) { this.bot=bot; this.scopes=new Map(); this.pending=new Map(); this.last=new Map(); this.stopped=false; this.generation=0; }
  async identity() {
    if (!this.key) this.key = globalThis.crypto.subtle.digest("SHA-256", new TextEncoder().encode(
      String(this.bot.api.baseUrl || "") + "\n" + this.bot.token
    )).then(bytes => Array.from(new Uint8Array(bytes), b=>b.toString(16).padStart(2,"0")).join(""));
    return this.key;
  }
  async start() {
    if (!enabled()) return;
    this.stopped=false;
    try {
      const result=await studioBindingControl("bindingScopes", {botKey:await this.identity()});
      for (const scope of result?.scopes || []) {
        try { await this.refresh(scope, true); } catch (error) { this.report(error); }
      }
    } catch (error) { this.report(error); }
    if (!this.stopped && !this.timer) {
      this.timer=setInterval(()=>{
        for (const scope of this.scopes.values()) void this.refresh(scope, true).catch(e=>this.report(e));
      },15000);
      this.timer.unref?.();
    }
  }
  stop() { this.generation++; this.stopped=true; clearInterval(this.timer); this.timer=null; }
  async observe(ctx) {
    if (!enabled() || this.stopped || !ctx.chat?.id) return;
    const contactId=ctx.resolveBotDetailContactId?.() || ctx.chat.id;
    const to=participant(ctx.from || ctx.to);
    if (!to) return;
    const scope={botKey:await this.identity(), contactId:String(contactId), chat:participant(ctx.chat), to};
    const force=(ctx.events || []).includes("message:bind_device");
    const known=[...this.scopes.values()].find(item=>item.chat.id===scope.chat.id && item.chat.type===scope.chat.type);
    if(!known)return;
    try { await this.refresh(known, force); } catch (error) { this.report(error); }
  }
  async activate(chat, to, contactId) {
    chat=participant(chat);to=participant(to);
    if (!enabled() || this.stopped) return;
    if(!chat?.id)throw new Error('Studio needs the test chat ID before loading MPY.');
    const scope={botKey:await this.identity(), contactId:String(contactId || chat.id), chat, to};
    await studioBindingControl('assertTestChat',{scope});
    const known=[...this.scopes.values()].find(item=>item.chat.id===chat.id && item.chat.type===chat.type);
    // Keep one query scope for the selected chat, regardless of which player opens the WebApp.
    if(known)await this.refresh(known,true);
    else if(to)await this.refresh(scope,true);
  }
  async select(ctx) {
    const scope={botKey:await this.identity(),contactId:String(ctx.resolveBotDetailContactId?.() || ctx.chat.id),chat:participant(ctx.chat),to:participant(ctx.from)};
    this.generation++;
    this.selecting=true;
    let result;
    try {
      result=await studioBindingControl('selectTestChat',{scope,senderId:String(ctx.from?.id || '')});
      this.scopes.clear();this.last.clear();
    } finally { this.selecting=false; }
    await this.refresh(scope,true);
    return result;
  }
  async refresh(scope, force=false) {
    if (this.stopped || this.selecting || !enabled()) return;
    const generation=this.generation;
    const key=JSON.stringify([scope.contactId,scope.chat.id,scope.to?.id]);
    if (!this.scopes.has(key) && this.scopes.size >= 128) throw new Error("Too many Studio binding scopes");
    this.scopes.set(key,scope);
    const previous=this.pending.get(key);
    if (previous) {
      if (!force) return previous;
      await previous.catch(()=>{});
      if (this.stopped || generation!==this.generation) return;
      return this.refresh(scope,true);
    }
    if (!force && Date.now()-(this.last.get(key)||0)<10000) return;
    const query=(async()=>{
      const devices=await this.bot.getBoundDevices({chat:scope.chat,to:scope.to}, {contactId:scope.contactId});
      if (this.stopped || generation!==this.generation) return;
      await studioSyncBindingScope(scope, devices, device=>createMpsHooks.call(this.bot, 
        scope.chat,scope.to,device,device.slot,{contactId:scope.contactId}
      ));
      if (!this.stopped && generation===this.generation) this.last.set(key,Date.now());
    })();
    this.pending.set(key,query);
    try { await query; } finally { if(this.pending.get(key)===query)this.pending.delete(key); }
  }
  report(error) { console.warn("[Studio] binding sync failed; previous binding retained:", error.message); }
}
