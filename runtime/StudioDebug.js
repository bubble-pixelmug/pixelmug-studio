// Browser-safe Studio logging. Importing this module has no side effects.
const INSTALL = Symbol.for("jeejio.studioDebug");
const LEVELS = ["log", "info", "warn", "error", "debug"];
const SECRET_KEY = /(?:token|password|passwd|secret|authorization|cookie|api[_-]?key)$/i;

export function redactText(value, secrets = []) {
  let text = String(value);
  for (const secret of secrets) {
    if (typeof secret === "string" && secret.length >= 4) text = text.split(secret).join("[REDACTED]");
  }
  return text
    .replace(/(Bearer\s+)[^\s"',;]+/gi, "$1[REDACTED]")
    .replace(/((?:[?&]|\b)(?:[\w-]*token|password|secret|api[_-]?key|authorization)=)[^&\s"'<>]+/gi, "$1[REDACTED]")
    .replace(/("(?:[\w-]*token|password|secret|authorization|cookie|api[_-]?key)"\s*:\s*")[^"]*"/gi, '$1[REDACTED]"');
}

export function serializeStudioValue(value, secrets = []) {
  const seen = new WeakSet();
  let budget = 150;
  function visit(item, depth) {
    if (--budget < 0) return "[Truncated]";
    if (typeof item === "string") return redactText(item, secrets).slice(0, 4000);
    if (item === null || typeof item === "boolean" || typeof item === "number") return item;
    if (typeof item === "bigint") return item.toString() + "n";
    if (typeof item !== "object") return String(item);
    if (seen.has(item)) return "[Circular]";
    if (depth >= 5) return "[MaxDepth]";
    seen.add(item);
    try {
      if (item instanceof Error) return {
        name: visit(item.name, depth + 1), message: visit(item.message, depth + 1),
        stack: visit(item.stack, depth + 1), cause: visit(item.cause, depth + 1),
      };
      if (Array.isArray(item)) return item.slice(0, 30).map(v => visit(v, depth + 1));
      const result = Object.create(null);
      for (const key of Object.keys(item).slice(0, 40)) {
        const descriptor = Object.getOwnPropertyDescriptor(item, key);
        result[redactText(key, secrets)] = SECRET_KEY.test(key) ? "[REDACTED]"
          : descriptor && "value" in descriptor ? visit(descriptor.value, depth + 1) : "[Getter]";
      }
      return result;
    } catch { return "[Unserializable]"; }
  }
  try { return visit(value, 0); } catch { return "[Unserializable]"; }
}

/**
 * Enable explicitly before loading application code. debug (SDK verbosity) is unrelated.
 * sendBatch is used by the Node IPC adapter; WebApps use authenticated HTTP batches.
 */
export function createStudioDebug(options = {}, runtime = globalThis) {
  if (options.enabled !== true) return { enabled: false, flush: async () => {}, dispose: async () => {}, capture() {} };
  if (runtime[INSTALL]) return runtime[INSTALL];
  const { endpoint, token, runId, source, sendBatch } = options;
  if (!runId || !["bot", "webapp"].includes(source) || (!sendBatch && (!endpoint || !token))) {
    throw new TypeError("Studio debug requires runId, source and endpoint/token (or sendBatch)");
  }
  const clientId = options.clientId || runtime.crypto?.randomUUID?.() || Date.now().toString(36) + Math.random().toString(36).slice(2);
  const secrets = [token, ...(options.secrets || [])].filter(Boolean);
  const queue = [];
  const originals = new Map();
  const wrappers = new Map();
  let seq = 0, dropped = 0, inFlight, disposed = false, capturing = false;
  const maxQueue = Math.max(20, Math.min(2000, options.maxQueue || 500));
  const transport = sendBatch || (async records => {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 3000);
    try {
      const response = await runtime.fetch(endpoint, {
        method: "POST", headers: { "Content-Type": "application/json", Authorization: "Bearer " + token },
        body: JSON.stringify({ records }), signal: controller.signal,
      });
      if (!response.ok) throw new Error("Studio receiver HTTP " + response.status);
    } finally { clearTimeout(timeout); }
  });

  function capture(level, args, kind = "console", context = {}) {
    if (disposed || capturing) return;
    capturing = true;
    try {
      const data = serializeStudioValue(args, secrets);
      const record = {
        schemaVersion: 1, runId, buildId: options.buildId || null, source, clientId,
        seq: ++seq, timestamp: new Date().toISOString(), level, kind,
        context: serializeStudioValue(context, secrets),
        message: data.map(v => typeof v === "string" ? v : JSON.stringify(v)).join(" "),
        args: data,
      };
      if (new TextEncoder().encode(JSON.stringify(record)).length > 8192) {
        record.message = record.message.slice(0, 1200);
        record.args = ["[Record exceeded 8 KB; see message]"];
        record.context = {};
        record.truncated = true;
      }
      if (queue.length >= maxQueue) { dropped++; return; }
      queue.push(record);
    } catch { dropped++; } finally { capturing = false; }
  }

  async function drain() {
    // One bounded batch per flush. A failure retains the same sequence numbers for retry.
    const batch = queue.slice(0, 20);
    if (!batch.length) return;
    try {
      await transport(batch);
      queue.splice(0, batch.length);
      if (dropped) {
        const count = dropped;
        dropped = 0;
        capture("warn", ["Studio logging dropped " + count + " records (queue/serialization limit)"], "diagnostic");
      }
      return true;
    } catch { return false; /* Retry on the next timer; never recurse through console. */ }
  }
  function flush() {
    if (!inFlight) inFlight = (async () => {
      const count = Math.ceil(queue.length / 20);
      for (let i = 0; i < count; i++) { if (!(await drain())) break; }
    })().finally(() => { inFlight = undefined; });
    return inFlight;
  }
  for (const level of LEVELS) {
    if (typeof runtime.console?.[level] !== "function") continue;
    const original = runtime.console[level];
    const wrapper = function (...args) {
      const result = Reflect.apply(original, this, args);
      capture(level, args);
      return result;
    };
    originals.set(level, original);
    wrappers.set(level, wrapper);
    runtime.console[level] = wrapper;
  }
  const timer = setInterval(() => { void flush(); }, Math.max(50, options.flushInterval || 250));
  timer.unref?.();
  const api = {
    enabled: true, clientId, capture, flush,
    get pendingCount() { return queue.length; },
    async dispose() {
      if (disposed) return;
      disposed = true;
      clearInterval(timer);
      for (const [level, original] of originals) {
        if (runtime.console[level] === wrappers.get(level)) runtime.console[level] = original;
      }
      delete runtime[INSTALL];
      await flush();
    },
  };
  runtime[INSTALL] = api;
  return api;
}

