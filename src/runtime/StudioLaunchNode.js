import { installStudioLaunch, httpStudioControl } from "./StudioLaunch.js";
export function installNodeLaunch(options) {
  if (options.transport !== "ipc") return installStudioLaunch(options, httpStudioControl(options));
  const pending = new Map();
  let serial = 0;
  const receive = message => {
    if (message?.type !== "pixelmug:control:response") return;
    const waiter = pending.get(message.id);
    if (!waiter) return;
    pending.delete(message.id); clearTimeout(waiter.timer);
    if (message.error) { const error = new Error(message.error.message); error.code = message.error.code; waiter.reject(error); }
    else waiter.resolve(message.result);
  };
  const disconnect = () => {
    for (const waiter of pending.values()) { clearTimeout(waiter.timer); waiter.reject(new Error("Studio disconnected")); }
    pending.clear();
  };
  process.on("message", receive);
  process.on("disconnect", disconnect);
  process.channel?.unref();
  const dispose = installStudioLaunch(options, (payload, timeoutMillis) => new Promise((resolve, reject) => {
    if (!process.connected || !process.send) return reject(new Error("Studio IPC unavailable"));
    const id = "ctl-" + (++serial);
    const timer = setTimeout(() => { pending.delete(id); reject(new Error("Studio control timed out")); }, timeoutMillis);
    pending.set(id, { resolve, reject, timer });
    process.send({ type: "pixelmug:control", id, payload }, error => {
      if (error) { clearTimeout(timer); pending.delete(id); reject(error); }
    });
  }));
  return () => { dispose(); disconnect(); process.off("message", receive); process.off("disconnect", disconnect); };
}

