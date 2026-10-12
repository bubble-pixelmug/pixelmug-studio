// node --import ./tools/studio/runtime/studio-preload.js bot.js
// Studio sets this only for the child process it launches.
import { register } from "node:module";
import { enableStudioDebug } from "./StudioDebugNode.js";

register(new URL("./studio-sdk-loader.js", import.meta.url), import.meta.url, {
  data: { studioPackageUrl: new URL("../../package.json", import.meta.url).href },
});
if (process.env.PIXELMUG_STUDIO_DEBUG) {
  const config = JSON.parse(process.env.PIXELMUG_STUDIO_DEBUG);
  enableStudioDebug({
    ...config,
    secrets: [...(config.secrets || []), process.env.BOT_TOKEN].filter(Boolean),
  });
}
