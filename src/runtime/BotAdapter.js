import { AsyncLocalStorage } from "node:async_hooks";
import { NeedBindDeviceError } from "@jeejio-bubble/bot/sdk/errors.js";
import { StudioBindings } from "./StudioBindings.js";
import { studioLaunchEnabled, studioLaunchMps, studioDeviceRef, studioPrepareMps } from "./StudioLaunch.js";
import { createMpsHooks } from "../devices/pixelmug.js";

// All instrumentation lives in Studio. No second bot/poller is created.
const installed = new WeakSet();
const bindings = new WeakMap();
const transports = new WeakMap();
const calls = new AsyncLocalStorage();
export function bindingsFor(bot) {
  if (!bindings.has(bot)) bindings.set(bot, new StudioBindings(bot));
  return bindings.get(bot);
}
function attachTransport(api) {
  if (transports.get(api) === api.sendDeviceRpc) return;
  const original = api.sendDeviceRpc;
  if (typeof original !== "function") throw new Error("Studio adapter requires api.sendDeviceRpc");
  const wrapped = function (request, ...rest) {
    const context = calls.getStore();
    if (!context || context.bot.api !== this || !studioLaunchEnabled(request.rpc)) {
      return original.call(this, request, ...rest);
    }
    return sendLaunch.call(context.bot, { ...request, device: context.device, studioOptions: context.options });
  };
  api.sendDeviceRpc = wrapped;
  transports.set(api, wrapped);
}
export function installBotAdapter(BubbleBot) {
  const proto = BubbleBot.prototype;
  if (installed.has(proto)) return;
  const names = ["start", "stop", "callDevice", "callDeviceAsync", "handleWebAppSystemMiddleware", "handleSystemWebAppRequest"];
  for (const name of names) if (typeof proto[name] !== "function") throw new Error("Unsupported Bubble SDK: " + name);
  installed.add(proto);
  for (const name of ["callDevice", "callDeviceAsync"]) {
    const original = proto[name];
    proto[name] = async function (chat, device, rpc, options = {}) {
      if (!studioLaunchEnabled(rpc)) return original.call(this, chat, device, rpc, options);
      attachTransport(this.api);
      // Keep concurrent chat/device calls isolated, including async ACK handling.
      return calls.run({ bot: this, device, options }, () => original.call(this, chat, device, rpc, options));
    };
  }
  const start = proto.start, stop = proto.stop;
  proto.start = async function (...args) {
    const result = await start.apply(this, args);
    await bindingsFor(this).start();
    return result;
  };
  proto.stop = function (...args) {
    bindings.get(this)?.stop();
    return stop.apply(this, args);
  };
  const middleware = proto.handleWebAppSystemMiddleware;
  proto.handleWebAppSystemMiddleware = async function (ctx, next) {
    if (ctx.event === "message" || ctx.event === "web_app_data" || ctx.event === "notify" ||
        (ctx.events || []).includes("message:bind_device")) await bindingsFor(this).observe(ctx);
    return middleware.call(this, ctx, next);
  };
  const systemRequest = proto.handleSystemWebAppRequest;
  proto.handleSystemWebAppRequest = async function (ctx, data) {
    if (data.type === "system.studio.prepareMps") {
      try {
        if (!studioLaunchEnabled({ method: "talMpyExecOneScript" })) throw new Error("Bot is not running in Studio debug mode");
        const target = data.payload?.device;
        const devices = await this.getBoundDevices(ctx);
        const bound = devices.find(d => String(d.deviceId) === String(target?.deviceId) && String(d.slotId) === String(target?.slotId));
        if (!bound) throw new Error("Requested device does not match the current bot binding");
        const result = await studioPrepareMps(studioDeviceRef(bound), createMpsHooks.call(this, ctx.chat, ctx.from, bound, bound.slot));
        await ctx.replyWebApp(result);
      } catch (error) {
        await ctx.replyWebApp({}, { code: 400, success: false, message: error.message });
      }
      return;
    }

    return systemRequest.call(this, ctx, data);
  };
}

async function sendLaunch({ chat, to, slot, traceId, rpc, device, studioOptions = {} }) {
  let bound = device;
  let route = studioDeviceRef(bound);
  if (!route.deviceId || !route.slotId) {
    const devices = await this.getBoundDevices({ chat: typeof chat === "string" ? { id: chat } : chat, to },
      { contactId: studioOptions.contactId });
    bound = devices.find(item => Number(item.slot) === Number(slot));
    if (!bound) throw new NeedBindDeviceError("No bound device for Studio launch", undefined, { chat, slot });
    route = studioDeviceRef(bound);
  }
  const response = await studioLaunchMps(route, createMpsHooks.call(this, chat, to, bound, slot, studioOptions), studioOptions.timeout);
  // Preserve ACK=201 followed by the normal final response dispatcher.
  // Defer until callDeviceAsync has registered its task.
  setTimeout(() => { this.processDeviceUpdate({
    id: "studio-" + traceId, type: "rpc", code: response.code, message: "OK",
    result: response.result, extend: { traceId, chat, from: { id: route.deviceId }, to },
  }).catch(error => this.emitError(error)); }, 0);
  return { code: 201, message: "Accepted" };
}

