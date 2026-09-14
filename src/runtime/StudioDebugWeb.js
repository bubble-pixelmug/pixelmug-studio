import { BubbleWebApp } from "./sdk-web.js";
import { installWebAppAdapter } from "./WebAppAdapter.js";
import { installStudioLaunch, httpStudioControl } from "./StudioLaunch.js";
import { createStudioDebug } from "./StudioDebug.js";

const INSTALL = Symbol.for("jeejio.studioDebug.web");

/** Explicit browser initialization. Call before importing the business entry module. */
export function enableStudioDebug(options = {}) {
  if (options.enabled !== true) return createStudioDebug();
  if (globalThis[INSTALL]) return globalThis[INSTALL];
  installWebAppAdapter(BubbleWebApp);
  const debug = createStudioDebug({ ...options, source: "webapp" });
  const disposeLaunch = installStudioLaunch({ ...options, clientId: debug.clientId }, httpStudioControl(options));
  const onError = event => debug.capture("error", [event.error || event.message || "Resource loading error"], "uncaughtException", {
    filename: event.filename, line: event.lineno, column: event.colno,
  });
  const onRejection = event => debug.capture("error", [event.reason], "unhandledRejection");
  const onPageHide = () => { void debug.flush(); };
  globalThis.addEventListener("error", onError);
  globalThis.addEventListener("unhandledrejection", onRejection);
  globalThis.addEventListener("pagehide", onPageHide);
  const dispose = debug.dispose.bind(debug);
  debug.dispose = async () => {
    disposeLaunch();
    globalThis.removeEventListener("error", onError);
    globalThis.removeEventListener("unhandledrejection", onRejection);
    globalThis.removeEventListener("pagehide", onPageHide);
    delete globalThis[INSTALL];
    await dispose();
  };
  globalThis[INSTALL] = debug;
  return debug;
}

/** Studio dev server supplies a session-scoped config. Production returns no config. */
export function enableStudioDebugFromPage() {
  return enableStudioDebug(globalThis.__PIXELMUG_STUDIO_DEBUG__ || {});
}
