import { BubbleBot } from "@jeejio-bubble/bot/sdk/BubbleBot.js";
import { installBotAdapter } from "./BotAdapter.js";
import { installNodeLaunch } from "./StudioLaunchNode.js";
import { createStudioDebug } from "./StudioDebug.js";

const INSTALL = Symbol.for("jeejio.studioDebug.node");

export function enableStudioDebug(options = {}) {
  if (options.enabled !== true) return createStudioDebug();
  if (globalThis[INSTALL]) return globalThis[INSTALL];
  const sendBatch = options.transport === "ipc" ? records => new Promise((resolve, reject) => {
    if (!process.connected || !process.send) return reject(new Error("Studio IPC disconnected"));
    process.send({ type: "pixelmug:logs", records }, error => error ? reject(error) : resolve());
  }) : undefined;
  installBotAdapter(BubbleBot);
  const debug = createStudioDebug({ ...options, source: "bot", sendBatch });
  const disposeLaunch = installNodeLaunch({ ...options, clientId: debug.clientId });
  const onException = (error, origin) => {
    debug.capture("error", [error], origin === "unhandledRejection" ? origin : "uncaughtException");
    void debug.flush();
  };
  const onBeforeExit = () => {
    process.off("beforeExit", onBeforeExit);
    if (debug.pendingCount) void debug.flush();
  };
  // Monitor only: do not install uncaughtException/unhandledRejection handlers that swallow crashes.
  process.on("uncaughtExceptionMonitor", onException);
  process.on("beforeExit", onBeforeExit);
  const dispose = debug.dispose.bind(debug);
  debug.dispose = async () => {
    disposeLaunch();
    process.off("uncaughtExceptionMonitor", onException);
    process.off("beforeExit", onBeforeExit);
    delete globalThis[INSTALL];
    await dispose();
  };
  globalThis[INSTALL] = debug;
  return debug;
}
