import PixelMugS1 from "@jeejio-bubble/bot/devices/PixelMugS1_1.0.js";
import { studioDeviceRef } from "../runtime/StudioLaunch.js";

export function createMpsHooks(chat, to, bound, slot, studioOptions = {}) {
  const pixelMug = new PixelMugS1();
  const route = studioDeviceRef(bound);
  return {
    executeRpc: async (command, timeout) => {
      const current = await this.getBoundDevices({ chat: typeof chat === "string" ? {id: chat} : chat, to }, {contactId: studioOptions.contactId});
      const target = current.find(d => String(d.deviceId) === route.deviceId && String(d.slotId) === route.slotId && Number(d.slot) === Number(slot));
      if (!target) throw new Error("Device binding changed; refusing auxiliary RPC to a different device");
      // Studio commands are internal messages; build the device RPC via its SDK.
      let rpc;
      switch (command.method) {
        case "talMpyRebootStartREPL":
          rpc = pixelMug.rpc.talMpyRebootStartREPL({ requestId: command.params?.requestId });
          break;
        case "talRebootDevice":
          rpc = pixelMug.rpc.call("talRebootDevice", {});
          break;
        case "talGetWifiInfo":
          rpc = pixelMug.rpc.talGetWifiInfo();
          break;
        case "talMpyGetStudioState":
          rpc = pixelMug.rpc.talMpyGetStudioState();
          break;
        default:
          throw new Error("Unknown Studio control command");
      }
      const result = await this.callDevice(chat, target, rpc, {
        ...studioOptions, slot, to, traceId: undefined, requireOnline: false, timeout,
      });
      return result.tal.result;
    },
    onEvent: async event => {
      if (event.value) await this.processDeviceUpdate({
        id: "studio-" + event.launchId + "-" + event.seq, type: "rpc", method: "onReceive",
        extend: { chat, from: { id: route.deviceId }, to },
        params: { mpyVmEvent: { value: event.value } },
      });
    },
  };
}

