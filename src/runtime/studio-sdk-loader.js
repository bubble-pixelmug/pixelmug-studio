import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";

const sdkPrefix = "@jeejio-bubble/bot";
let studioRequire;

export function initialize({ studioPackageUrl }) {
  studioRequire = createRequire(studioPackageUrl);
}

export async function resolve(specifier, context, nextResolve) {
  try {
    return await nextResolve(specifier, context);
  } catch (error) {
    const isStudioSdk = specifier === sdkPrefix || specifier.startsWith(`${sdkPrefix}/`);
    if (!isStudioSdk || error?.code !== "ERR_MODULE_NOT_FOUND") throw error;
    return { url: pathToFileURL(studioRequire.resolve(specifier)).href, shortCircuit: true };
  }
}