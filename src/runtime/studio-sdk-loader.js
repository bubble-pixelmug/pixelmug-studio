import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";

const sdkPrefix = "@jeejio-bubble/bot";
let studioRequire;

export function initialize({ studioPackageUrl }) {
  studioRequire = createRequire(studioPackageUrl);
}

export async function resolve(specifier, context, nextResolve) {
  const isStudioSdk = specifier === sdkPrefix || specifier.startsWith(`${sdkPrefix}/`);
  // The Studio adapter patches BubbleBot before the project entry point loads. If
  // an external project resolves its own copy of the SDK, it creates a different
  // BubbleBot class and bypasses those patches. Always use Studio's copy so the
  // project Bot and the adapter share the same runtime class.
  if (isStudioSdk) {
    return { url: pathToFileURL(studioRequire.resolve(specifier)).href, shortCircuit: true };
  }
  return nextResolve(specifier, context);
}
