import { DeviceSessions } from "./device-sessions.mjs";
import { BindingRegistry } from "./bindings.mjs";
import { randomUUID, randomBytes } from "node:crypto";
import { mkdirSync, writeFileSync, appendFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { isIP } from "node:net";
import { WebRepl } from "./webrepl.mjs";
import { snapshotProject, deploy } from "./deploy.mjs";

const terminal = new Set(["failed", "completed", "stopped", "unknown", "superseded"]);
const active = job => !terminal.has(job.state) && job.state !== "running";
export function reconcileRestartPlan(plans, device) {
  const plan = plans.get(device.deviceId);
  if (!plan || plan.slotId === device.slotId) return plan;
  // The reboot is tied to the physical device, while the Bot assigns slot IDs.
  if (plan.state === "waiting") { plan.slotId = device.slotId; return plan; }
  plans.delete(device.deviceId);
  return null;
}
const delay = (ms, signal) => new Promise((resolve, reject) => {
  if (signal.aborted) return reject(new Error("Launch cancelled"));
  const timer = setTimeout(done, ms);
  const cancel = () => { clearTimeout(timer); signal.removeEventListener("abort", cancel); reject(new Error("Launch cancelled")); };
  function done() { signal.removeEventListener("abort", cancel); resolve(); }
  signal.addEventListener("abort", cancel, { once: true });
});
export class LaunchManager {
  constructor({ project, debugDir, runId, devices = [], log, createRepl = () => new WebRepl(), timings = {}, authorizeDevice, restartDevices = [], prepareOnBinding = false, autoRunOnBinding = false, requireTestChat = false, studioUserId = '' }) {
    this.requireTestChat=requireTestChat;this.studioUserId=String(studioUserId);this.switchingChat=false;
    this.authorizeDevice = authorizeDevice;
    this.project = project; this.debugDir = debugDir; this.runId = runId; this.log = log;
    this.devices = devices.map(device => {
      if (!device.deviceId || !device.slotId) throw new Error("Each Studio device requires deviceId and slotId");
      return { deviceId: String(device.deviceId), slotId: String(device.slotId) };
    });
    if (new Set(this.devices.map(d => d.deviceId)).size !== this.devices.length) throw new Error("Duplicate deviceId in Studio config");
    this.createRepl = createRepl; this.clients = new Map(); this.jobs = new Map(); this.commands = new Map();
    this.contexts = new Map();
    this.bindings = new BindingRegistry(this, project);
    this.sessions = new DeviceSessions(this);
    this.locks = new Map(); this.stopped = false;
    this.prepareOnBinding = prepareOnBinding === true;
    this.autoRunOnBinding = autoRunOnBinding === true;
    this.autoRunDevices = new Set();
    this.restartPlans = new Map(restartDevices.map(d => [d.deviceId, { ...d,
      state: d.status === "rebootAccepted" ? "waiting" : "failed",
      message: d.status === "rebootAccepted" ? "已请求进入 Python Dev，等待在冒泡 App 中启动应用" : d.message }]));
    this.timings = { rebootWait: 3000, onlineTimeout: 90000, connectTimeout: 60000, retry: 1500, rpcTimeout: 10000, startTimeout: 20000, ...timings };
  }
  wait(ms, signal) { return delay(ms, signal); }
  client(key) {
    if (!this.clients.has(key)) {
      if (this.clients.size >= 128) throw new Error("Too many Studio clients");
      this.clients.set(key, { serial: 0, events: [], latest: new Map(), lastPollAt: 0 });
    }
    return this.clients.get(key);
  }
  push(key, message) {
    const client = this.client(key);
    const event = { ...message, seq: ++client.serial };
    client.events.push(event); client.latest.set(message.ownerId, event);
    if (client.events.length > 2048) client.events.shift();
  }
  event(job, owner, override) {
    if (job.session?.revoked) return;
    const state = override || job.state;
    const value = state === "running" ? "MPS_IS_RUNNING" : state === "uploaded" ? "INSTALL_SUCCESS"
      : state === "failed" ? ((job.started || job.executing) ? "RUNNING_FAIL" : "INSTALL_FAIL")
      : ["accepted", "rebooting", "connecting", "uploading"].includes(state) ? "INSTALL_START" : undefined;
    this.push(owner.key, { type: "event", ownerId: owner.ownerId, launchId: job.id,
      device: job.device, state, value, message: job.error || "", terminal: terminal.has(state) });
  }
  deviceEvent(job, value) {
    if (job.session?.revoked) return false;
    if (typeof value !== "string" || !value || Buffer.byteLength(value, "utf8") > 512) return false;
    const sent = new Set();
    for (const owner of job.owners.values()) {
      const key = owner.key + ":" + owner.ownerId;
      if (sent.has(key)) continue;
      sent.add(key);
      this.push(owner.key, { type: "event", ownerId: owner.ownerId, launchId: job.id,
        device: job.device, state: job.state, value, message: "", terminal: false });
    }
    this.log(job, "info", "Studio MPY event forwarded to " + sent.size + " subscriber(s): " + value, "studio");
    return true;
  }
  state(job, state, error) {
    if (terminal.has(state)) clearInterval(job.healthTimer);
    if (state === "running" && job.repl && !job.abort.signal.aborted) {
      clearInterval(job.healthTimer);
      job.healthTimer = setInterval(() => { void this.checkRunning(job); }, 10000);
      job.healthTimer.unref?.();
    }
    if (state !== "rerunning") { clearTimeout(job.rerunTimer); job.rerunTimer = null; }
    const plan = this.restartPlans.get(job.device.deviceId);
    if (plan && job.id === plan.requestId) {
      plan.state = state; plan.message = error ? String(error.message || error) : state;
      writeFileSync(join(this.debugDir, "restart.json"), JSON.stringify(this.restartList(), null, 2));
    }
    job.state = state; job.updatedAt = new Date().toISOString();
    if (state === "running") job.started = true;
    if (error) job.error = String(error.message || error);
    writeFileSync(join(job.dir, "launch.json"), JSON.stringify(this.view(job), null, 2));
    this.log(job, state === "failed" ? "error" : state === "unknown" ? "warn" : "info",
      state + (job.error ? ": " + job.error : ""), "studio",
      { lifecycle: job.started && ["running", "completed", "stopped", "failed", "unknown"].includes(state) ? state : undefined });
    for (const owner of job.owners.values()) this.event(job, owner);
  }
  view(job) {
    return { launchId: job.id, device: job.device, network: job.network || null, state: job.state, fingerprint: job.fingerprint,
      startedAt: job.startedAt, updatedAt: job.updatedAt, error: job.error || null, canRerun: this.contexts.has(job.contextId),
      canRunMpyAgain: Boolean(job.deployed && job.repl && !job.repl.closed && ["completed", "failed"].includes(job.state)),
      connectionWarning: job.connectionWarning || null };
  }
  list() { return [...this.jobs.values()].map(job => this.view(job)); }
  restartList() { return [...this.restartPlans.values()].map(({deviceId, state, message}) => ({deviceId, state, message})); }
  bindingsChanged(records) {
    if (!this.prepareOnBinding || this.stopping || this.stopped) return;
    if(this.requireTestChat && (!this.bindings.activeScope || this.switchingChat))return;
    if(this.requireTestChat)records=records.filter(record=>this.bindings.matches(record.scope));
    queueMicrotask(() => { void this.handleBindingsChanged(records).catch(error => console.warn("[Studio] device preparation:", error.message)); });
  }
  async handleBindingsChanged(records) {
    await this.prepareBoundDevices(records);
    if (this.autoRunOnBinding) await this.autoRunBoundDevices(records);
  }
  async prepareBoundDevices(records) {
    const works = [];
    for (const record of records) {
      if (this.stopping || this.stopped) return;
      if(this.requireTestChat && (this.switchingChat || !this.bindings.matches(record.scope)))continue;
      if (this.requireTestChat && this.bindings.records.get(record.bindingId)?.contextId !== record.contextId) continue;
      const device = record.device;
      const session = this.requireTestChat ? this.sessions.forBinding(record) : undefined;
      if (session?.revoked) continue;
      if (session) {
        try { await this.sessions.ready(session); }
        catch { continue; }
      }
      const previousPlan = this.restartPlans.get(device.deviceId);
      if (device.online === false || this.jobs.has(device.deviceId) ||
          (previousPlan && previousPlan.state !== "failed")) continue;
      const requestId = previousPlan?.requestId || "launch-" + randomUUID();
      const dir = join(this.debugDir, "prepare-" + requestId);
      mkdirSync(dir, { recursive: true });
      const plan = { deviceId: device.deviceId, slotId: device.slotId, requestId,
        session, state: "preparing", message: "正在让设备进入 Python Dev" };
      this.restartPlans.set(device.deviceId, plan);
      const commandJob = { session, id: requestId, dir, device, executor: record.executor,
        owners: new Map(), abort: new AbortController(), startedAt: new Date().toISOString() };
      if (session) session.preparation = commandJob;
      plan.work = (async () => {
        try {
          if (this.authorizeDevice) await this.authorizeDevice({ ...device, contextId: record.contextId }); else this.target(device);
          if (session) await this.sessions.recover(session, commandJob);
          this.sessions.assert(session);
          // A failed request may have rebooted despite a lost reply. Reuse its boot ID.
          let value;
          if (previousPlan?.state === 'failed') {
            let status = await this.rpc(commandJob, 'talMpyGetStudioState', 5000);
            this.sessions.assert(session);
            if (typeof status === 'string') status = JSON.parse(status);
            if (status?.requestId === previousPlan.requestId && status.mode === 'MpyReplMode') {
              plan.requestId = previousPlan.requestId;
              value = true;
            } else if (status?.mode !== 'normal') {
              throw new Error('Previous REPL request remains unconfirmed; waiting for a known device state');
            }
          }
          try {
            if (value !== true) value = await this.rpc(commandJob, "talMpyRebootStartREPL", this.timings.rpcTimeout, { requestId });
          } catch (error) {
            if (error.code === "STUDIO_EXECUTOR_UNAVAILABLE" || !/timed out|timeout|disconnected|network|abort/i.test(error.message)) throw error;
            value = true;
            plan.message = "重启回包未确认；等待应用启动时核验设备状态";
          }
          this.sessions.assert(session);
          if (value !== true) throw new Error("设备未确认接受 Python Dev 重启请求");
          plan.state = "waiting";
          if (plan.message === "正在让设备进入 Python Dev") plan.message = "设备已进入 Python Dev，等待在冒泡 App 中启动应用";
        } catch (error) {
          plan.state = "failed"; plan.message = error.message || String(error);
        } finally {
          writeFileSync(join(this.debugDir, "restart.json"), JSON.stringify(this.restartList(), null, 2));
        }
      })();
      if (session) session.preparationWork = plan.work;
      works.push(plan.work);
    }
    await Promise.all(works);
  }
  async autoRunBoundDevices(records) {
    const seen = new Set();
    for (const record of records) {
      const deviceId = record.device.deviceId;
      const plan = this.restartPlans.get(deviceId);
      const prepared = plan?.state === "preparing" || plan?.state === "waiting";
      if (seen.has(deviceId) || (record.device.online === false && !prepared) || this.jobs.has(deviceId) || this.autoRunDevices.has(deviceId)) continue;
      seen.add(deviceId);
      if (plan?.work) await plan.work;
      if (this.stopping || this.stopped || this.jobs.has(deviceId) || plan?.state !== "waiting") continue;
      try {
        this.sessions.assert(plan.session);
        this.autoRunDevices.add(deviceId);
        await this.bindings.run(record.bindingId, false);
      } catch (error) {
        this.autoRunDevices.delete(deviceId);
        plan.state = "failed"; plan.message = "自动运行失败：" + (error.message || String(error));
        writeFileSync(join(this.debugDir, "restart.json"), JSON.stringify(this.restartList(), null, 2));
      }
    }
  }
  target(ref) {
    const match = this.devices.find(d => d.deviceId === String(ref?.deviceId) && d.slotId === String(ref?.slotId));
    if (!match) throw new Error("Device is not authorized: add its deviceId and slotId to the local --devices file");
    return match;
  }
  authorizeBoundDevice(ref, { allowOffline = false } = {}) {
    const deviceId = String(ref?.deviceId || "");
    const slotId = String(ref?.slotId || "");
    if(this.requireTestChat && !this.bindings.activeScope)throw new Error('Send /test-in-this-chat from the Studio account in the chat you want to test first.');
    const records = [...this.bindings.records.values()].filter(item =>
      item.device.deviceId === deviceId && item.device.slotId === slotId &&
      (!this.requireTestChat || this.bindings.matches(item.scope)));
    // A binding context identifies one chat. SDK-registered launch contexts are
    // separate, so those still use the current bound-device snapshot.
    const bindingContext = ref?.contextId && [...this.bindings.records.values()].some(item => item.contextId === ref.contextId);
    const record = bindingContext
      ? records.find(item => item.contextId === ref.contextId)
      : records.find(item => item.device.online !== false) || records[0];
    if (!record) throw new Error("Device is not bound to a slot of the current Bot run");
    if (!allowOffline && record.device.online === false) throw new Error("Bound device is not online");
    return { deviceId, slotId };
  }
  async handle(source, message) {
    if (this.stopped) throw new Error("Studio is closing");
    if (message?.runId !== this.runId) { const error = new Error("Studio run expired"); error.code = 401; throw error; }
    if (!/^[\w-]{1,100}$/.test(message.clientId || "")) throw new Error("Invalid Studio client ID");
    const key = source + ":" + message.clientId, client = this.client(key);
    if(message.op === 'selectTestChat') {
      if(source!=='bot')throw new Error('Only the Bot can select a test chat');
      if(this.stopping)throw new Error('Studio is stopping; start a new debug run first.');
      if(!this.studioUserId || String(message.senderId)!==this.studioUserId)throw new Error('Only the account signed in to Studio can select the test chat.');
      if(this.switchingChat)throw new Error('Studio is switching test chats; please try again shortly.');
      // Validate the scope before touching devices.
      const scope=this.bindings.validate(message.scope);
      this.switchingChat=true;
      try {
        let stopped={devices:[],unconfirmed:0};
        if(this.bindings.activeScope && !this.bindings.matches(message.scope)) {
          stopped=await this.stopDevices();
          this.jobs.clear();this.restartPlans.clear();this.autoRunDevices.clear();
          this.contexts.clear();this.bindings.records.clear();
          this.stopPromise=null;this.stopping=false;
        }
        this.bindings.select(scope);
        this.testChatSwitchResult=stopped;
        return {chat:this.bindings.displayedChat(),...stopped};
      } finally {this.switchingChat=false;}
    }
    if(message.op === 'assertTestChat') {
      if(source!=='bot')throw new Error('Only the Bot can verify a test chat');
      if(this.requireTestChat && (this.switchingChat || !this.bindings.matches(message.scope)))
        throw new Error('Send /test-in-this-chat from the Studio account in this chat before loading MPY.');
      return {allowed:true};
    }
    if (message.op === "bindingScopes" || message.op === "syncBindings") {
      if (source !== "bot") throw new Error("Only bot can synchronize bindings");
      if (message.op === "bindingScopes") return this.bindings.restore(message.botKey);
      const result = this.bindings.sync(key, message.scope, message.bindings);
      // Keep old executor subscriptions alive until their cleanup has settled.
      await Promise.all([...this.sessions.pending.values()]);
      return result;
    }
    if (message.op === "register") {
      if (source !== "bot") throw new Error("Only bot can register an RPC executor");
      if (this.requireTestChat && (this.switchingChat || !this.bindings.matches({
        botKey:this.bindings.activeScope?.botKey, chat:message.chat,
      }))) throw new Error('The launch executor belongs to an inactive Studio test chat');
      if (!/^[\w-]{1,100}$/.test(message.ownerId || "")) throw new Error("Invalid executor owner");
      if (!message.device?.deviceId || !message.device?.slotId) throw new Error("Device binding required");
      if (this.contexts.size >= 1024) throw new Error("Too many Studio execution contexts; restart the environment");
      const contextId = randomUUID();
      this.contexts.set(contextId, { executor: { key, ownerId: message.ownerId }, device: message.device });
      client.lastPollAt = Date.now();
      return { contextId };
    }
    if (message.op === "launch") {
      if (!/^[\w-]{1,100}$/.test(message.ownerId || "")) throw new Error("Invalid launch owner");
      return this.launch(key, message.ownerId, message.device);
    }
    if (message.op === "poll") {
      client.lastPollAt = Date.now();
      for (const command of this.commands.values()) {
        if (command.key === key && !command.delivered) {
          command.delivered = true;
          this.log(command.job, "info", "RPC delivered to " + source + " SDK: " + command.method, "studio");
        }
      }
      const after = Number(message.after) || 0;
      const old = client.events[0]?.seq;
      const events = old && after < old - 1 ? [...client.latest.values()].filter(e => e.seq > after).sort((a,b) => a.seq-b.seq)
        : client.events.filter(e => e.seq > after).slice(0, 100);
      return { events, commands: [...this.commands.values()].filter(c => c.key === key).map(c => ({
        id: c.id, ownerId: c.ownerId, method: c.method, params: c.params, timeoutMillis: c.timeoutMillis,
      })) };
    }
    if (message.op === "assertCommand") {
      const command = this.commands.get(message.commandId);
      if (!command || command.key !== key) throw new Error('Studio RPC expired or cancelled');
      if (!command.job.cleanup) this.sessions.assert(command.job.session);
      return {allowed:true};
    }
    if (message.op === "reply") {
      const command = this.commands.get(message.commandId);
      if (!command) return { accepted: false };
      if (command.key !== key) throw new Error("Command belongs to another client");
      this.commands.delete(command.id); clearTimeout(command.timer);
      this.log(command.job, message.error ? "warn" : "info", "RPC " + command.method + (message.error ? " executor returned error" : " executor returned response"), "studio");
      if (message.error) { const error = new Error(message.error.message || "Device RPC failed"); error.code = message.error.code; command.reject(error); }
      else command.resolve(message.value);
      return { accepted: true };
    }
    throw new Error("Unsupported Studio control operation");
  }
  async rerun(launchId) {
    const job = [...this.jobs.values()].find(j => j.id === launchId);
    if (!job) throw new Error("Launch no longer exists");
    if (active(job)) throw new Error("Device is still deploying");
    const client = this.clients.get(job.executor.key);
    if (!client?.lastPollAt || Date.now() - client.lastPollAt > 10000) {
      throw new Error("本地 bot 执行器未连接，请检查 bot 进程后重新发起启动");
    }
    return this.launch(job.executor.key, job.executor.ownerId, { ...job.device, contextId: job.contextId }, true);
  }
  async runMpyAgain(launchId) {
    const job = [...this.jobs.values()].find(item => item.id === launchId);
    if (!job) throw new Error("Launch no longer exists");
    if (this.authorizeDevice) await this.authorizeDevice({ ...job.device, contextId: job.contextId });
    else this.target(job.device);
    this.sessions.assert(job.session);
    while (this.locks.has(job.device.deviceId)) await this.locks.get(job.device.deviceId);
    this.sessions.assert(job.session);
    let releaseLock;
    const lock = new Promise(resolve => { releaseLock = resolve; });
    this.locks.set(job.device.deviceId, lock);
    try {
      if (!job.deployed || !job.repl || job.repl.closed || !["completed", "failed"].includes(job.state)) {
        throw new Error("MPY 尚未完成首次加载，或设备执行会话已不可用");
      }
      job.error = "";
      job.connectionWarning = null;
      this.state(job, "rerunning");
      const attempt = (job.executionAttempt || 0) + 1;
      job.executionAttempt = attempt;
      job.rerunTimer = setTimeout(() => {
        if (job.executionAttempt === attempt && job.state === "rerunning" && !job.abort.signal.aborted) {
          this.state(job, "failed", "Application start confirmation timed out");
        }
      }, this.timings.startTimeout);
      job.rerunTimer.unref?.();
      await job.repl.restart("import __studio_bootstrap__; __studio_bootstrap__.run(" + JSON.stringify(job.id) + ", " + JSON.stringify(job.nonce) + ")");
      return this.view(job);
    } catch (error) {
      if (!job.abort.signal.aborted && job.state === "rerunning") this.state(job, "failed", error);
      throw error;
    } finally {
      if (this.locks.get(job.device.deviceId) === lock) this.locks.delete(job.device.deviceId);
      releaseLock();
    }
  }
  async launch(key, ownerId, ref, force = false) {
    if(this.switchingChat)throw new Error('Studio is switching test chats');
    if (this.stopping || this.stopped) throw new Error("Studio is stopping");
    const epoch = this.sessions.epoch;
    const authorizationPlan = this.restartPlans.get(String(ref?.deviceId));
    const allowOffline = authorizationPlan && authorizationPlan.slotId === String(ref?.slotId) &&
      ["preparing", "waiting", "deploying"].includes(authorizationPlan.state);
    const device = this.authorizeDevice ? await this.authorizeDevice(ref, { allowOffline: Boolean(allowOffline) }) : this.target(ref);
    if (epoch !== this.sessions.epoch) throw new Error("Studio chat changed during launch authorization");
    const context = this.contexts.get(ref?.contextId);
    if (!context || String(context.device.deviceId) !== device.deviceId || String(context.device.slotId) !== device.slotId) throw new Error("Missing or mismatched bot execution context");
    const executorClient = this.clients.get(context.executor.key);
    if (!executorClient?.lastPollAt || Date.now() - executorClient.lastPollAt > 10000) throw new Error("本地 bot 执行器未连接，请检查 bot 进程后重新发起启动");
    const session = this.requireTestChat ? this.sessions.forRef(ref, context) : undefined;
    this.sessions.assert(session);
    while (this.locks.has(device.deviceId)) await this.locks.get(device.deviceId);
    let releaseLock;
    const lock = new Promise(resolve => { releaseLock = resolve; });
    this.locks.set(device.deviceId, lock);
    try {
      if (session) await this.sessions.ready(session);
      this.sessions.assert(session);
      const snapshot = await snapshotProject(this.project);
      this.sessions.assert(session);
      if (this.stopping || this.stopped) throw new Error("Studio is closing");
      const previous = this.jobs.get(device.deviceId);
      const owner = { key, ownerId };
      if (!force && previous?.state === "running" && !await this.checkRunning(previous)
          && previous.state === "running") {
        this.state(previous, "unknown", "原 WebREPL 连接无法确认；本次启动将重新部署");
      }
      this.sessions.assert(session);
      if (this.stopping || this.stopped) throw new Error("Studio is stopping");
      if (!force && previous && previous.device.slotId === device.slotId && previous.fingerprint === snapshot.fingerprint && !terminal.has(previous.state)) {
        previous.owners.set(key + ":" + ownerId, owner); this.event(previous, owner);
        previous.executor = context.executor; previous.contextId = ref.contextId;
        previous.owners.set(context.executor.key + ":" + context.executor.ownerId, context.executor);
        return { code: 200, result: { value: previous.state === "running" ? 264 : 262 }, launchId: previous.id };
      }
      if (previous && active(previous)) throw new Error("A different build is deploying to this device; wait for completion");
      if (previous) { this.state(previous, "superseded"); previous.abort.abort(); previous.repl?.close(); }
      let prepared = this.restartPlans.get(device.deviceId);
      if (session && prepared?.state === "failed") {
        await this.prepareBoundDevices([session.record]);
        this.sessions.assert(session);
        prepared = this.restartPlans.get(device.deviceId);
      }
      if (prepared?.state === "preparing") await prepared.work;
      this.sessions.assert(session);
      prepared = reconcileRestartPlan(this.restartPlans, device);
      if (prepared?.state === "failed" && !previous) throw new Error(prepared.message || "设备重启准备失败");
      const reuseBoot = prepared?.state === "waiting";
      const id = reuseBoot ? prepared.requestId : "launch-" + randomUUID(), dir = join(this.debugDir, id);
      mkdirSync(dir, { recursive: true });
      for (const directory of snapshot.directories || []) mkdirSync(join(dir, "source", directory), { recursive: true });
      for (const file of snapshot.files) {
        const path = join(dir, "source", file.name); mkdirSync(dirname(path), { recursive: true }); writeFileSync(path, file.bytes);
      }
      const job = { session, id, dir, device, fingerprint: snapshot.fingerprint, state: "accepted",
        startedAt: new Date().toISOString(), owners: new Map([[key + ":" + ownerId, owner]]),
        executor: context.executor, contextId: ref.contextId, abort: new AbortController(), nonce: randomBytes(16).toString("hex"), started: false, reuseBoot };
      if (reuseBoot) { prepared.state = "deploying"; prepared.message = "绑定已确认，正在连接设备并上传代码"; }
      job.owners.set(context.executor.key + ":" + context.executor.ownerId, context.executor);
      if (session) session.job = job;
      this.jobs.set(device.deviceId, job); this.state(job, "accepted");
      // Return the RPC preparation status first; continue deployment in the background.
      job.work = Promise.resolve().then(() => this.run(job, snapshot)).catch(error => {
        if (!job.abort.signal.aborted && !terminal.has(job.state)) { this.state(job, "failed", error); job.repl?.close(); }
      });
      return { code: 200, result: { value: 262 }, launchId: id };
    } finally {
      if (this.locks.get(device.deviceId) === lock) this.locks.delete(device.deviceId);
      releaseLock();
    }
  }
  rpc(job, method, timeoutMillis = this.timings.rpcTimeout, params = {}) {
    if (!job.cleanup) this.sessions?.assert(job.session);
    if (job.abort.signal.aborted) return Promise.reject(new Error("Launch cancelled"));
    return new Promise((resolve, reject) => {
      const id = randomUUID(), { key, ownerId } = job.executor;
      const command = { id, key, ownerId, method, params, timeoutMillis, resolve, reject, job, delivered: false };
      this.log(job, "info", "RPC queued for " + key.split(":")[0] + " SDK: " + method, "studio");
      command.timer = setTimeout(() => {
        this.commands.delete(id);
        const error = new Error(command.delivered ? method + " timed out after delivery to SDK; device execution is unconfirmed"
          : "本地 bot 未领取 " + method + "：请检查本地 bot 进程与 Studio IPC 连接");
        if (!command.delivered) error.code = "STUDIO_EXECUTOR_UNAVAILABLE";
        reject(error);
      }, timeoutMillis + 2000);
      this.commands.set(id, command);
    });
  }
  async retry(job, timeout, operation) {
    const deadline = Date.now() + timeout; let error;
    do {
      this.sessions?.assert(job.session);
      if (job.abort.signal.aborted) throw new Error("Launch cancelled");
      try { return await operation(); } catch (caught) { if (["WEBREPL_AUTH", "STUDIO_BOOT_FAILED", "STUDIO_EXECUTOR_UNAVAILABLE", "STUDIO_SESSION_EXPIRED"].includes(caught.code)) throw caught; error = caught; }
      await delay(this.timings.retry, job.abort.signal);
    } while (Date.now() < deadline);
    throw error || new Error("Device operation timed out");
  }
  async run(job, snapshot) {
    if (job.abort.signal.aborted) return;
    this.sessions?.assert(job.session);
    if (job.session && !job.reuseBoot) await this.sessions.recover(job.session, job);
    this.state(job, "rebooting");
    // The response can be lost while rebooting. Do not repeat the destructive reboot command.
    let rebootResult;
    if (!job.reuseBoot) {
    try { rebootResult = await this.rpc(job, "talMpyRebootStartREPL", this.timings.rpcTimeout, { requestId: job.id }); }
    catch (error) {
      if (error.code === "STUDIO_EXECUTOR_UNAVAILABLE" || !/timed out|timeout|disconnected|network|abort/i.test(error.message)) throw error;
      this.log(job, "warn", "Reboot response unavailable; checking recovery: " + error.message, "studio");
    }
    if (rebootResult === false) throw new Error("设备拒绝 Studio 专用重启请求；请确认固件支持 Studio REPL 模式");
    }
    if (!job.reuseBoot) await delay(this.timings.rebootWait, job.abort.signal);
    const readyIP = async () => {
      let status = await this.rpc(job, "talMpyGetStudioState", 5000);
      this.sessions?.assert(job.session);
      if (typeof status === "string") {
        try { status = JSON.parse(status); } catch { throw new Error("设备未返回有效 Studio 状态；请更新固件"); }
      }
      if (status?.requestId !== job.id || status?.mode !== "MpyReplMode")
        throw new Error("等待设备进入本次 Studio REPL 启动");
      job.network = { ...job.network, ip: typeof status.ip === "string" ? status.ip : "",
        wifiConnected: status.wifiConnected === true, updatedAt: new Date().toISOString() };
      if (status.error) { const error = new Error("Studio REPL 启动失败: " + status.error); error.code = "STUDIO_BOOT_FAILED"; throw error; }
      if (status.protocol !== 1) throw new Error("不支持的 Studio 设备协议版本");
      if (!status.wifiConnected || !status.maopaoConnected || status.replReady !== true)
        throw new Error("等待设备网络和 WebREPL 就绪");
      if (typeof status.ip !== "string" || isIP(status.ip) !== 4 || status.ip === "0.0.0.0")
        throw new Error("Device Wi-Fi IP not available");
      return status.ip;
    };
    let ip = await this.retry(job, this.timings.onlineTimeout, readyIP);
    try {
      const info = await this.rpc(job, "talGetWifiInfo", 5000);
      const match = typeof info === "string" && /^SSID: ([\s\S]*), IP: ([^,]+)$/.exec(info);
      if (match) job.network = { ...job.network, ssid: match[1], updatedAt: new Date().toISOString() };
    } catch (error) {
      this.log(job, "warn", "Wi-Fi name unavailable: " + error.message, "studio");
    }
    this.state(job, "connecting");
    let attempt = 0;
    job.repl = await this.retry(job, this.timings.connectTimeout, async () => {
      if (attempt++ > 0) ip = await readyIP();
      const repl = this.createRepl(); job.connectingRepl = repl;
      this.log(job, "info", "WebREPL connecting to " + ip + ":8266 (attempt " + attempt + ")", "studio");
      try {
        await repl.connect(ip);
        this.sessions?.assert(job.session);
        job.connectingRepl = null;
        job.repl = repl;
        this.log(job, "info", "WebREPL authenticated and REPL probe passed: " + ip + ":8266", "studio");
        return repl;
      } catch (error) {
        this.log(job, "warn", "WebREPL attempt " + attempt + " failed: " + error.message, "studio");
        repl.close(); throw error;
      }
    });
    if (job.abort.signal.aborted) { job.repl.close(); return; }
    this.state(job, "uploading");
    await deploy(job.repl, snapshot, progress => this.log(job, "info", "Upload " + progress.index + "/" + progress.total + " " + progress.file, "studio"));
    this.sessions?.assert(job.session);
    job.deployed = true;
    this.state(job, "uploaded");
    let pending = "", readyResolve, readyReject;
    const ready = new Promise((resolve, reject) => { readyResolve = resolve; readyReject = reject; });
    const cancelStartup = () => readyReject(new Error("Launch cancelled"));
    job.abort.signal.addEventListener("abort", cancelStartup, { once: true });
    // Observe rejection immediately, including if start() itself fails.
    ready.catch(() => {});
    const readyTimer = setTimeout(() => readyReject(new Error("Application start confirmation timed out")), this.timings.startTimeout);
    const prefix = "\x1eSTUDIO:" + job.nonce + ":";
    const line = value => {
      if (job.abort.signal.aborted) return;
      const i = value.indexOf(prefix);
      if (i >= 0) {
        try {
          const event = JSON.parse(value.slice(i + prefix.length));
          if (event.launchId !== job.id) return;
          if (event.type === "mpyVmEvent") {
            this.deviceEvent(job, event.value);
            return;
          }
          if (event.type === "exception" && typeof event.message === "string") {
            this.log(job, "error", event.message, "console");
            return;
          }
          if (!["running","completed","stopped","failed"].includes(event.state)) return;
          this.state(job, event.state, event.message || undefined);
          if (event.state === "running") readyResolve();
          else if (!job.started) readyReject(new Error(event.message || "Application exited before starting"));
          return;
        } catch {}
      }
      const clean = value.replace(/[\x00-\x08\x0b-\x1f]/g, "");
      if (clean) this.log(job, "log", clean, "console");
    };
    job.repl.on("output", text => {
      // Preserve raw stream except private control frames (nonce isn't a user log).
      pending += text.replace(/\r\n/g, "\n");
      let i;
      while ((i = pending.indexOf("\n")) >= 0) { const value = pending.slice(0,i); pending = pending.slice(i+1); line(value); }
      if (pending.length > 16384) { line(pending.slice(0,16384)); pending = pending.slice(16384); }
    });
    job.repl.on("disconnect", () => {
      if (pending) { line(pending); pending = ""; }
      if (!terminal.has(job.state) && !job.abort.signal.aborted) this.state(job, "unknown", "WebREPL disconnected; application state unknown");
      readyReject(new Error("WebREPL disconnected before startup"));
    });
    try {
      job.executing = true;
      await job.repl.start("import __studio_bootstrap__; __studio_bootstrap__.run(" + JSON.stringify(job.id) + ", " + JSON.stringify(job.nonce) + ")");
      await ready;
    } finally { clearTimeout(readyTimer); job.abort.signal.removeEventListener("abort", cancelStartup); }
  }
  async checkRunning(job) {
    if (job.state !== "running" || job.abort.signal.aborted) return false;
    let alive = false;
    try { alive = await job.repl?.probe(); } catch {}
    if (job.state !== "running" || job.abort.signal.aborted) return false;
    const warning = alive ? null : "WebREPL 存活探测超时，应用状态待确认；保留连接继续接收日志";
    if ((job.connectionWarning || null) !== warning) {
      job.connectionWarning = warning;
      job.updatedAt = new Date().toISOString();
      writeFileSync(join(job.dir, "launch.json"), JSON.stringify(this.view(job), null, 2));
      this.log(job, warning ? "warn" : "info", warning || "WebREPL 存活探测已恢复", "studio");
    }
    return alive;
  }
  stopDevices({ enterRepl = false } = {}) {
    if (this.stopPromise) return this.stopPromise;
    this.stopping = true;
    if (this.requireTestChat) {
      this.sessions.invalidateAll();
      this.stopPromise = this.sessions.stopAll().then(result => {
        writeFileSync(join(this.debugDir, "stop.json"), JSON.stringify({ ...result, stoppedAt: new Date().toISOString() }, null, 2));
        return result;
      });
    } else this.stopPromise = this.stopDevicesOnce(enterRepl);
    return this.stopPromise;
  }
  async stopDevicesOnce(enterRepl = false) {
    // Include devices handed over from the old run even if the new bot is not ready yet.
    for (const plan of this.restartPlans.values()) {
      if (this.jobs.has(plan.deviceId)) continue;
      const binding = [...this.bindings.records.values()].find(r => r.device.deviceId === plan.deviceId && r.device.slotId === plan.slotId);
      const id = plan.requestId || "launch-" + randomUUID(), dir = join(this.debugDir, id);
      mkdirSync(dir, {recursive:true});
      this.jobs.set(plan.deviceId, {id, dir, device:{deviceId:plan.deviceId, slotId:plan.slotId},
        contextId:binding?.contextId, executor:binding?.executor, owners:new Map(), abort:new AbortController(),
        state:"unknown", startedAt:new Date().toISOString(), work:plan.work});
    }
    // jobs contains one latest deployment per device, not all account bindings.
    const jobs = [...this.jobs.values()];
    for (const job of jobs) {
      job.abort.abort();
      clearInterval(job.healthTimer);
      job.repl?.close(); job.connectingRepl?.close();
    }
    // Withdraw commands not yet delivered. Let in-flight RPCs settle before reboot.
    for (const [id, command] of this.commands) {
      if (!command.delivered) {
        clearTimeout(command.timer); this.commands.delete(id);
        command.reject(new Error("Deployment cancelled by stop"));
      }
    }
    await Promise.allSettled(jobs.map(job => job.work));
    const devices = await Promise.all(jobs.map(async job => {
      const result = { deviceId: job.device.deviceId, slotId: job.device.slotId, status: "unconfirmed", ...(enterRepl ? {requestId: "launch-" + randomUUID()} : {}) };
      try {
        if (this.authorizeDevice) await this.authorizeDevice({ ...job.device, contextId: job.contextId });
        else this.target(job.device);
        const context = this.contexts.get(job.contextId);
        if (!context || String(context.device.deviceId) !== job.device.deviceId ||
            String(context.device.slotId) !== job.device.slotId) throw new Error("设备绑定上下文已失效，未发送重启");
        const client = this.clients.get(context.executor.key);
        if (!client?.lastPollAt || Date.now() - client.lastPollAt > 10000) throw new Error("Bot 执行器未连接，未发送重启");
        this.log(job, "info", enterRepl ? "重启智能体：请求设备进入 Python Dev" : "停止智能体：请求设备普通重启", "studio");
        // Separate cancellation token: deployment has stopped, bot transport stays alive.
        const commandJob = { ...job, executor: context.executor, abort: new AbortController() };
        let value;
        try {
          value = await this.rpc(commandJob, enterRepl ? "talMpyRebootStartREPL" : "talRebootDevice", this.timings.rpcTimeout, enterRepl ? {requestId:result.requestId} : {});
        } catch (error) {
          // A delivered reboot may lose its reply. The new bot verifies this exact boot ID.
          if (!enterRepl || error.code === "STUDIO_EXECUTOR_UNAVAILABLE" || !/timed out|timeout|disconnected|network|abort/i.test(error.message)) throw error;
          value = true;
          result.message = "重启回包未确认，等待新 Bot 核验本次启动标识";
        }
        if (value !== true) throw new Error("设备未确认接受重启请求");
        result.status = "rebootAccepted";
        result.message ||= enterRepl ? "设备已应答 Python Dev 重启请求" : "设备已应答普通重启请求";
        job.error = null;
        this.state(job, "stopped");
        this.log(job, "info", result.message, "studio");
      } catch (error) {
        result.message = error.message || String(error);
        this.state(job, "unknown", "停止未确认：" + result.message);
      }
      return result;
    }));
    const result = { devices, unconfirmed: devices.filter(device => device.status !== "rebootAccepted").length };
    writeFileSync(join(this.debugDir, enterRepl ? "restart-prepare.json" : "stop.json"), JSON.stringify({ ...result, stoppedAt: new Date().toISOString() }, null, 2));
    return result;
  }
  async close() {
    this.stopped = true;
    this.sessions.invalidateAll();
    for (const job of this.jobs.values()) {
      if (!terminal.has(job.state)) this.state(job, "unknown", "Studio closed; device may still be running");
      job.abort.abort(); job.repl?.close(); job.connectingRepl?.close();
    }
    for (const command of this.commands.values()) { clearTimeout(command.timer); command.reject(new Error("Studio closed")); }
    this.commands.clear();
    await Promise.allSettled([...this.jobs.values()].map(job => job.work));
    await Promise.allSettled([...this.sessions.pending.values()]);
  }
}

