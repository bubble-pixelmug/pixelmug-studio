// node --import ./tools/studio/runtime/studio-preload.js bot.js
// Studio sets this only for the child process it launches.
import { enableStudioDebug } from "./StudioDebugNode.js";
if (process.env.PIXELMUG_STUDIO_DEBUG) {
  const config = JSON.parse(process.env.PIXELMUG_STUDIO_DEBUG);
  enableStudioDebug({
    ...config,
    secrets: [...(config.secrets || []), process.env.BOT_TOKEN].filter(Boolean),
  });
}
