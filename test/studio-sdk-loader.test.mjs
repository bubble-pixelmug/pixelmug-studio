import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { execFile } from "node:child_process";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const preload = pathToFileURL(fileURLToPath(new URL("../src/runtime/studio-preload.js", import.meta.url))).href;

test("Studio child resolves the bundled Bot SDK even when its project has another copy", async () => {
  const project = await mkdtemp(join(tmpdir(), "pixelmug-studio-sdk-loader-"));
  try {
    const sdk = join(project, "node_modules/@jeejio-bubble/bot/sdk");
    await mkdir(sdk, { recursive: true });
    await writeFile(join(project, "package.json"), '{"type":"module"}\n');
    await writeFile(join(project, "node_modules/@jeejio-bubble/bot/package.json"), JSON.stringify({
      type: "module", exports: { "./sdk/BubbleBot.js": "./sdk/BubbleBot.js" },
    }));
    await writeFile(join(sdk, "BubbleBot.js"), 'export class BubbleBot { static source = "external"; }\n');
    const entry = join(project, "bot.mjs");
    await writeFile(entry, 'import { BubbleBot } from "@jeejio-bubble/bot/sdk/BubbleBot.js"; process.stdout.write(BubbleBot.source || "studio");\n');

    const { stdout } = await execFileAsync(process.execPath, ["--import", preload, entry], { cwd: project });
    assert.equal(stdout, "studio");
  } finally {
    await rm(project, { recursive: true, force: true });
  }
});
