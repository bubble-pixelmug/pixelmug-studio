import test from "node:test";
import assert from "node:assert/strict";
import { createStudioDebug, serializeStudioValue } from "../runtime/StudioDebug.js";

function runtime() {
  const printed = [];
  const console = Object.fromEntries(["log", "info", "warn", "error", "debug"].map(level => [level, (...args) => { printed.push([level, ...args]); }]));
  return { console, printed };
}
const config = { enabled: true, runId: "run-test", source: "webapp", clientId: "client-test", flushInterval: 60000 };

test("disabled logging neither wraps console nor sends; enabled is idempotent and restores console", async () => {
  const rt = runtime(), original = rt.console.log, batches = [];
  createStudioDebug({ enabled: false }, rt);
  assert.equal(rt.console.log, original);
  const debug = createStudioDebug({ ...config, sendBatch: async batch => batches.push(batch) }, rt);
  assert.equal(createStudioDebug(config, rt), debug);
  const arg = { value: 1 };
  rt.console.log("hello", arg);
  assert.equal(rt.printed[0][2], arg);
  await debug.flush();
  assert.equal(batches[0][0].message, 'hello {"value":1}');
  assert.equal(batches[0][0].source, "webapp");
  await debug.dispose();
  assert.equal(rt.console.log, original);
});

test("safe serialization redacts secrets, preserves Error and BigInt, avoids getters and circular recursion", () => {
  let reads = 0;
  const value = { botToken: "hidden", authorization: "hidden", number: 1n, error: new Error("failed") };
  Object.defineProperty(value, "danger", { enumerable: true, get() { reads++; throw new Error("getter"); } });
  value.self = value;
  const result = serializeStudioValue(value);
  assert.equal(result.botToken, "[REDACTED]");
  assert.equal(result.authorization, "[REDACTED]");
  assert.equal(result.number, "1n");
  assert.equal(result.self, "[Circular]");
  assert.equal(reads, 0);
  assert.match(result.error.stack, /Error: failed/);
  assert.equal(serializeStudioValue("http://host/?token=abc&ok=1"), "http://host/?token=[REDACTED]&ok=1");
  assert.equal(serializeStudioValue("Bearer abc"), "Bearer [REDACTED]");
});

test("failed batches retry identical IDs, queues are bounded, and overflow is reported after recovery", async () => {
  const rt = runtime(), sent = [];
  let fail = true;
  const debug = createStudioDebug({ ...config, maxQueue: 20, sendBatch: async batch => {
    sent.push(structuredClone(batch));
    if (fail) throw new Error("offline");
  } }, rt);
  for (let i = 0; i < 25; i++) rt.console.info("record", i);
  assert.equal(debug.pendingCount, 20);
  await debug.flush();
  assert.equal(debug.pendingCount, 20);
  fail = false;
  await debug.flush();
  assert.deepEqual(sent[0], sent[1]);
  await debug.flush();
  assert.match(sent[2][0].message, /dropped 5 records/);
  assert.equal(rt.printed.length, 25);
  await debug.dispose();
});

test("oversized records stay within receiver byte limit", async () => {
  const rt = runtime(), records = [];
  const debug = createStudioDebug({ ...config, sendBatch: async batch => records.push(...batch) }, rt);
  rt.console.log(Array.from({ length: 30 }, () => "汉".repeat(4000)));
  await debug.dispose();
  assert.ok(Buffer.byteLength(JSON.stringify(records[0])) <= 8192);
  assert.equal(records[0].truncated, true);
});

test("WebApp global errors are collected without cancelling default events; dispose removes listeners", async () => {
  const { enableStudioDebug } = await import("../runtime/StudioDebugWeb.js");
  const target = new EventTarget();
  const oldAdd = globalThis.addEventListener, oldRemove = globalThis.removeEventListener;
  globalThis.addEventListener = target.addEventListener.bind(target);
  globalThis.removeEventListener = target.removeEventListener.bind(target);
  const records = [];
  const debug = enableStudioDebug({ ...config, sendBatch: async batch => records.push(...batch) });
  try {
    assert.equal(enableStudioDebug(config), debug);
    const error = new Event("error", { cancelable: true });
    error.error = new Error("browser crash");
    target.dispatchEvent(error);
    const rejection = new Event("unhandledrejection", { cancelable: true });
    rejection.reason = new Error("browser rejection");
    target.dispatchEvent(rejection);
    await debug.flush();
    assert.equal(error.defaultPrevented, false);
    assert.equal(rejection.defaultPrevented, false);
    assert.deepEqual(records.map(r => r.kind), ["uncaughtException", "unhandledRejection"]);
    await debug.dispose();
    target.dispatchEvent(error);
    assert.equal(debug.pendingCount, 0);
  } finally {
    await debug.dispose();
    if (oldAdd) globalThis.addEventListener = oldAdd; else delete globalThis.addEventListener;
    if (oldRemove) globalThis.removeEventListener = oldRemove; else delete globalThis.removeEventListener;
  }
});
