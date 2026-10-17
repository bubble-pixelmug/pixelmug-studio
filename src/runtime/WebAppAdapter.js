import { studioLaunchEnabled, studioLaunchMps, studioDeviceRef } from "./StudioLaunch.js";
const installed = new WeakSet();

export function createWebAppDeviceHook() {
  return ({ app, device, rpc, options = {} }) => {
    if (!studioLaunchEnabled(rpc)) return app.callDevice(device, rpc, options);
    if (!device) return Promise.reject(new Error("callDevice requires a device from getDevices()"));
    if (!app.bridge || typeof app.bridge.sendTAL !== "function") return Promise.reject(new Error("JeeWeb.sendTAL is not available"));
    const timeoutMillis = options.timeoutMillis || options.timeout || app.timeoutMillis;
    const route = studioDeviceRef(device, options);
    return app.request("system.studio.prepareMps", { device: route }, { timeoutMillis }).then(context => {
      const contextId = context?.contextId || context?.result?.contextId;
      if (!contextId) throw new Error("Bot did not provide a Studio execution context");
      return studioLaunchMps({ ...route, contextId }, {
        onEvent: event => {
          if (event.value) app.emit("system.deviceEvent", { payload: {
            device, events: [{ method: "mpyVmEvent", params: { value: event.value } }],
            launchId: event.launchId, state: event.state, message: event.message,
          } });
          app.emit("studio.launch", { payload: { ...event, device } });
        },
      }, timeoutMillis);
    });
  };
}

export function installWebAppAdapter(BubbleWebApp) {
  const proto = BubbleWebApp.prototype;
  if (installed.has(proto)) return;
  const original = proto.callDevice;
  if (typeof original !== "function") throw new Error("Unsupported Bubble WebApp SDK: callDevice");
  installed.add(proto);
  const hook = createWebAppDeviceHook();
  proto.callDevice = function (device, rpc, options = {}) {
    if (!studioLaunchEnabled(rpc)) return original.call(this, device, rpc, options);
    return hook({ app: this, device, rpc, options });
  };
}
