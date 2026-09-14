// Runtime-neutral launch adapter. Only talMpyExecOneScript is redirected.
import { DeviceRpcError } from "./sdk-web.js";
const KEY = Symbol.for("jeejio.studioLaunch");
const AUX = new Set(["talMpyRebootStartREPL", "talMpyGetStudioState", "talGetWifiInfo", "talRebootDevice"]);
const id = () => globalThis.crypto?.randomUUID?.() || "c-" + Date.now().toString(36) + Math.random().toString(36).slice(2);
export function studioLaunchEnabled(rpc) {
  return rpc?.method === "talMpyExecOneScript" && Boolean(globalThis[KEY]);
}
export function studioLaunchMps(route, hooks, timeoutMillis) {
  const client = globalThis[KEY];
  if (!client) throw new Error("Studio launch adapter is not initialized");
  return client.launch(route, hooks, timeoutMillis);
}
export function studioPrepareMps(route, hooks, timeoutMillis) {
  const client = globalThis[KEY];
  if (!client) throw new Error("Studio launch adapter is not initialized");
  return client.prepare(route, hooks, timeoutMillis);
}
// Internal Studio integration; applications keep using message:bind_device.
export function studioBindingControl(op, payload = {}) {
  return globalThis[KEY]?.bindingControl(op, payload);
}
export function studioSyncBindingScope(scope, devices, makeHooks) {
  return globalThis[KEY]?.syncBindings(scope, devices, makeHooks);
}
export function installStudioLaunch(options, request) {
  if (!options.enabled) return () => {};
  if (globalThis[KEY]) return () => {};
  const clientId = options.clientId || id(), owners = new Map(), commands = new Map(), bindingOwners = new Map();
  let after = 0, timer, disposed = false, polling = false;
  async function call(op, payload, timeout = 10000) {
    try { return await request({ op, runId: options.runId, clientId, ...payload }, timeout); }
    catch (error) {
      throw new DeviceRpcError(error.message || "Studio unavailable", { code: error.code || "STUDIO_UNAVAILABLE", method: "talMpyExecOneScript" });
    }
  }
  async function poll() {
    if (disposed || polling || !owners.size) return;
    polling = true;
    try {
      const data = await call("poll", { after });
      for (const command of data.commands || []) {
        const owner = owners.get(command.ownerId);
        if (!commands.has(command.id)) {
          commands.set(command.id, Promise.resolve().then(async () => {
            if (!owner?.executeRpc || !AUX.has(command.method)) throw new Error("Unknown Studio control command");
            const params = command.method === "talMpyRebootStartREPL" ? { requestId: command.params?.requestId } : {};
            if (command.method === "talMpyRebootStartREPL" && !/^[\w-]{1,100}$/.test(params.requestId || ""))
              throw new Error("Invalid Studio boot request ID");
            return owner.executeRpc({ method: command.method, params }, command.timeoutMillis);
          }).then(value => ({ value }), error => ({ error: { message: error.message, code: error.code } })));
        }
        // Do not block polling on a device RPC; re-send its cached reply if HTTP was interrupted.
        void commands.get(command.id).then(result => call("reply", { commandId: command.id, ...result }))
          .then(() => { if (commands.size > 2048) commands.delete(commands.keys().next().value); }).catch(() => {});
      }
      for (const event of data.events || []) {
        if (event.seq <= after) continue;
        const owner = owners.get(event.ownerId);
        try { await owner?.onEvent(event); }
        catch (error) { console.error("[Studio] device event handler failed", error); }
        after = event.seq;
        // Retain event subscriptions; only bot owners have an RPC executor.
      }
    } catch (error) {
      // Keep owners for reconnect/replay. Auth/session errors cannot recover within this run.
      if (error.code === 401 || error.code === 403) {
        for (const [ownerId, owner] of owners) {
          try { await owner.onEvent({ ownerId, state: "unknown", value: "RUNNING_FAIL", message: error.message, terminal: true }); } catch {}
        }
        owners.clear();
      }
    } finally { polling = false; }
  }
  function subscribe(hooks) {
    if (owners.size >= 128) throw new Error("Too many active Studio launch subscriptions");
    const ownerId = id(); owners.set(ownerId, hooks);
    if (!timer) { timer = setInterval(() => { void poll(); }, 400); timer.unref?.(); }
    return ownerId;
  }
  const client = {
    bindingControl: call,
    async syncBindings(scope, devices, makeHooks) {
      const scopeKey = JSON.stringify([scope.botKey, scope.contactId, scope.chat.id, scope.to?.id]);
      const previous = bindingOwners.get(scopeKey) || new Map(), next = new Map();
      const bindings = [];
      try {
        for (const device of devices) {
          const ref = studioDeviceRef(device), key = ref.slotId + ":" + ref.deviceId;
          const ownerId = previous.get(key) || subscribe(makeHooks(device));
          owners.set(ownerId, makeHooks(device)); next.set(key, ownerId);
          bindings.push({ ownerId, device: {...ref, name:device.name, online:device.online} });
        }
        const result = await call("syncBindings", {scope, bindings});
        for (const [key, ownerId] of previous) if (!next.has(key)) owners.delete(ownerId);
        bindingOwners.set(scopeKey, next);
        return result;
      } catch (error) {
        for (const [key, ownerId] of next) if (!previous.has(key)) owners.delete(ownerId);
        throw error;
      }
    },
    async prepare(route, hooks, timeoutMillis) {
      if (!hooks.executeRpc) throw new Error("Bot RPC executor required");
      const ownerId = subscribe(hooks);
      try { return await call("register", { ownerId, device: route }, timeoutMillis || 15000); }
      catch (error) { owners.delete(ownerId); throw error; }
    },
    async launch(route, hooks, timeoutMillis) {
      const ownerId = subscribe(hooks);
      try {
        let contextId = route.contextId;
        if (hooks.executeRpc) {
          const registered = await call("register", { ownerId, device: route }, timeoutMillis || 15000);
          contextId = registered.contextId;
        }
        return await call("launch", { ownerId, device: { ...route, contextId } }, timeoutMillis || 15000);
      } catch (error) { owners.delete(ownerId); throw error; }
    },
  };
  globalThis[KEY] = client;
  return () => {
    disposed = true; clearInterval(timer); owners.clear(); commands.clear(); bindingOwners.clear();
    if (globalThis[KEY] === client) delete globalThis[KEY];
  };
}
export function httpStudioControl(options, fetchImpl = globalThis.fetch) {
  return async (message, timeoutMillis) => {
    if (!options.endpoint || !options.token) throw new Error("Studio control endpoint/token missing");
    const url = new URL(options.controlEndpoint || "./launch", new URL(options.endpoint, globalThis.location?.href));
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMillis);
    try {
      const response = await fetchImpl(url, { method: "POST",
        headers: { "Content-Type": "application/json", Authorization: "Bearer " + options.token },
        body: JSON.stringify(message), signal: controller.signal });
      const data = await response.json();
      if (!response.ok || data.error) { const error = new Error(data.error?.message || data.error || "Studio control failed"); error.code = data.error?.code || response.status; throw error; }
      return data;
    } finally { clearTimeout(timer); }
  };
}
export function studioDeviceRef(device, options = {}) {
  return {
    deviceId: String(options.deviceId || device.deviceId || device.raw?.device?.id || device.id || ""),
    slotId: String(options.slotId || device.slotId || device.raw?.slot?.id || ""),
    slot: options.slot ?? device.slot ?? device.raw?.slot?.slot,
  };
}

