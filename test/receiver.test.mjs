import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { once } from "node:events";
import { startStudio } from "../receiver.mjs";
import { createStudioDebug } from "../runtime/StudioDebug.js";

async function fixture(t, extra = {}) {
  const project = await mkdtemp(join(tmpdir(), "pixelmug-studio-test-"));
  await mkdir(join(project, "webapp"));
  await writeFile(join(project, "webapp", "index.html"), "<h1>Test WebApp</h1>");
  await writeFile(join(project, "private.txt"), "DO NOT SERVE");
  if (extra.code) await writeFile(join(project, "bot.mjs"), extra.code);
  const studio = await startStudio({ project, webRoot: "webapp", port: 0, bind: "127.0.0.1", mirrorBotOutput: false, ...(extra.code ? { bot: "bot.mjs" } : {}) });
  t.after(async () => { await studio.close(); await rm(project, { recursive: true, force: true }); });
  return studio;
}
function event(studio, seq = 1) {
  return { schemaVersion: 1, runId: studio.runId, source: "webapp", clientId: "test-client", seq,
    timestamp: new Date().toISOString(), level: "log", kind: "console", message: "hello", args: ["hello"] };
}
function post(studio, records, headers = {}) {
  return fetch(studio.baseUrl + "/api/logs", { method: "POST",
    headers: { "Content-Type": "application/json", Authorization: "Bearer " + studio.token, ...headers },
    body: JSON.stringify({ records }) });
}

test("HTTP receiver authenticates, validates source/session, rejects other origins, and deduplicates retries", async t => {
  const s = await fixture(t);
  assert.equal((await post(s, [event(s)], { Authorization: "" })).status, 401);
  assert.equal((await post(s, [event(s)], { Origin: "http://other.example" })).status, 403);
  assert.equal((await post(s, [{ ...event(s), runId: "other" }])).status, 400);
  assert.equal((await post(s, [{ ...event(s), source: "bot" }])).status, 400);
  assert.deepEqual(await (await post(s, [event(s)])).json(), { accepted: 1 });
  assert.deepEqual(await (await post(s, [event(s)])).json(), { accepted: 0 });
  assert.equal((await fetch(s.baseUrl + "/api/events", { headers: { Authorization: "Bearer " + s.token } })).status, 403);
  const response = await fetch(s.baseUrl + "/api/events", { headers: { Authorization: "Bearer " + s.studioToken } });
  const data = await response.json();
  assert.equal(data.records.length, 1);
  assert.equal(data.records[0].source, "webapp");
  assert.equal((await readFile(join(s.debugDir, "events.jsonl"), "utf8")).trim().split("\n").length, 1);
  assert.match(await readFile(join(s.debugDir, "events.log"), "utf8"), /\[webapp\]\[log\]/);
});

test("real HTTP SDK transport persists structured arguments with secret redaction", async t => {
  const s = await fixture(t);
  const rt = { console: { log() {} }, fetch };
  const debug = createStudioDebug({ enabled: true, runId: s.runId, source: "webapp",
    endpoint: s.baseUrl + "/api/logs", token: s.token, flushInterval: 60000 }, rt);
  t.after(() => debug.dispose());
  rt.console.log("test", { token: "secret-value", amount: 123n, error: new Error("actual stack") });
  await debug.flush();
  const persisted = JSON.parse((await readFile(join(s.debugDir, "events.jsonl"), "utf8")).trim());
  assert.equal(persisted.args[1].token, "[REDACTED]");
  assert.equal(persisted.args[1].amount, "123n");
  assert.match(persisted.message, /actual stack/);
});

test("static routes expose only dedicated web content and browser SDK modules, without session credentials", async t => {
  const s = await fixture(t);
  assert.equal((await fetch(s.baseUrl + "/app/")).status, 200);
  for (const path of ["/private.txt", "/app/../private.txt", "/app/%2e%2e%5cprivate.txt",
    "/sdk/CloudLog.js", "/sdk/StudioDebugNode.js", "/sdk/../package.json", "/app/.env"]) {
    assert.ok((await fetch(s.baseUrl + path)).status >= 400, path);
  }
  for (const name of ["StudioDebugWeb.js", "StudioDebug.js", "StudioLaunch.js", "WebAppAdapter.js", "sdk-web.js"]) {
    assert.equal((await fetch(s.baseUrl + "/studio-runtime/" + name)).status, 200, name);
  }
  for (const name of ["StudioDebugNode.js", "BotAdapter.js", "studio-preload.js", "../devices/pixelmug.js"]) {
    assert.ok((await fetch(s.baseUrl + "/studio-runtime/" + name)).status >= 400, name);
  }
  const script = await (await fetch(s.baseUrl + "/studio-debug-config.js")).text();
  assert.ok(!script.includes(s.token));
  for (const name of ["WebApp.js", "BleManager.js", "errors.js", "constants.js"]) {
    assert.equal((await fetch(s.baseUrl + "/sdk/" + name)).status, 200, name);
  }
});

test("receiver limits request bytes and validates a batch before writing", async t => {
  const s = await fixture(t);
  assert.equal((await post(s, [event(s), { ...event(s, 2), level: "bad" }])).status, 400);
  assert.equal(await readFile(join(s.debugDir, "events.jsonl"), "utf8"), "");
  assert.equal((await post(s, [{ ...event(s), message: "x".repeat(300000) }])).status, 413);
});

for (const [name, code] of [
  ["normal exit", 'for (let i = 0; i < 50; i++) console.log("plain application console", { value: i });'],
  ["uncaught exception", 'console.log("before crash"); setTimeout(() => { throw new Error("fatal test error"); }, 40);'],
  ["unhandled rejection", 'console.log("before rejection"); setTimeout(() => { Promise.reject(new Error("fatal test rejection")); }, 40);'],
]) test("Node preload and IPC preserve " + name, { timeout: 10000 }, async t => {
  const s = await fixture(t, { code });
  const [exitCode] = await once(s.child, "close");
  assert.equal(exitCode, name === "normal exit" ? 0 : 1);
  const stdout = await readFile(join(s.debugDir, "bot.stdout.log"), "utf8");
  assert.match(stdout, /plain application console|before crash|before rejection/);
  if (name === "normal exit") {
    const records = (await readFile(join(s.debugDir, "events.jsonl"), "utf8")).trim().split("\n").map(JSON.parse);
    assert.equal(records.length, 50);
    assert.equal(records[0].source, "bot");
    assert.match(records[0].message, /plain application console/);
  } else {
    assert.match(await readFile(join(s.debugDir, "bot.stderr.log"), "utf8"), /fatal test/);
  }
});

test("bot HTTP initializer requires the PC credential, not the WebApp credential", async t => {
  const s = await fixture(t);
  const record = { ...event(s), source: "bot" };
  assert.equal((await post(s, [record])).status, 400);
  const response = await post(s, [record], { Authorization: "Bearer " + s.studioToken });
  assert.deepEqual(await response.json(), { accepted: 1 });
});

test("stopping Studio closes the active bot and its output streams", { timeout: 10000 }, async t => {
  const s = await fixture(t, { code: 'setInterval(() => console.log("running"), 100);' });
  await s.close();
  assert.ok(s.child.exitCode !== null || s.child.signalCode !== null);
});