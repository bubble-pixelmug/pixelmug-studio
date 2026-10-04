import { readFileSync, realpathSync } from "node:fs";
import { relative, isAbsolute } from "node:path";
import { fileURLToPath } from "node:url";
import { init, parse } from "es-module-lexer/minimal";

// Follow browser entry dependencies instead of exposing every SDK chunk.
await init();
const root = new URL("./", import.meta.resolve("@jeejio-bubble/bot/sdk/WebApp.js"));
const rootPath = realpathSync(fileURLToPath(root));
export const browserSdkFiles = new Set();
export const browserDeviceFiles = new Map();
function visit(url) {
  const file = realpathSync(fileURLToPath(url));
  const name = relative(rootPath, file).replaceAll("\\", "/");
  if (name.startsWith("../") || isAbsolute(name) || !name.endsWith(".js")) {
    throw new Error("Browser SDK dependency escapes SDK directory");
  }
  if (browserSdkFiles.has(name)) return;
  browserSdkFiles.add(name);
  const [imports] = parse(readFileSync(file, "utf8"));
  for (const entry of imports) {
    if (entry.d === -2) continue; // import.meta
    if (!entry.n || !entry.n.startsWith(".")) {
      throw new Error("Browser SDK contains an unsupported dependency");
    }
    visit(new URL(entry.n, url));
  }
}
for (const name of ["WebApp.js", "BleManager.js", "BleAppClient.js", "BleAppSession.js", "constants.js", "errors.js", "utils.js"]) {
  visit(new URL(name, root));
}

const packageRoot = new URL("./", import.meta.resolve("@jeejio-bubble/bot/package.json"));
const packageRootPath = realpathSync(fileURLToPath(packageRoot));
function visitDevice(url) {
  const file = realpathSync(fileURLToPath(url));
  const name = relative(packageRootPath, file).split(String.fromCharCode(92)).join("/");
  if (name.startsWith("../") || isAbsolute(name) || !name.endsWith(".js")) {
    throw new Error("Browser device SDK dependency escapes package directory");
  }
  if (browserDeviceFiles.has(name)) return;
  browserDeviceFiles.set(name, file);
  const [imports] = parse(readFileSync(file, "utf8"));
  for (const entry of imports) {
    if (entry.d !== -1) continue;
    if (!entry.n || !entry.n.startsWith(".")) {
      throw new Error("Browser device SDK contains an unsupported dependency");
    }
    visitDevice(new URL(entry.n, url));
  }
}
visitDevice(new URL(import.meta.resolve("@jeejio-bubble/bot/devices/pixelmug/ext")));
