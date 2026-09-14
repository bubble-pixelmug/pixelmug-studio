import { browserSdkFiles } from "./sdk-assets.mjs";
import { LaunchManager } from "./launch.mjs";
import { createServer } from "node:http";
import { randomUUID, randomBytes, timingSafeEqual } from "node:crypto";
import { mkdirSync, appendFileSync, writeFileSync, readFileSync, realpathSync, statSync } from "node:fs";
import { resolve, relative, extname, isAbsolute, join } from "node:path";
import { fileURLToPath } from "node:url";
import { fork } from "node:child_process";
import { StringDecoder } from "node:string_decoder";

const sdkRoot = fileURLToPath(new URL("./", import.meta.resolve("@jeejio-bubble/bot/sdk/WebApp.js")));
const browserSDK = browserSdkFiles;
const runtimeRoot = fileURLToPath(new URL("./runtime/", import.meta.url));
const browserRuntime = new Set(["StudioDebug.js", "StudioDebugWeb.js", "StudioLaunch.js", "WebAppAdapter.js"]);
const MAX_BODY = 256 * 1024;
const levels = new Set(["log", "info", "warn", "error", "debug"]);
const mime = { ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8", ".svg": "image/svg+xml", ".png": "image/png", ".ico": "image/x-icon" };

export async function startStudio(options = {}) {
  const { redactText, serializeStudioValue } = await import(new URL("./runtime/StudioDebug.js", import.meta.url));
  const project = realpathSync(resolve(options.project || "."));
  const webRoot = options.webRoot ? realpathSync(resolve(project, options.webRoot)) : null;
  if (webRoot === project) throw new Error("webRoot must be a dedicated public directory, not the project root");
  const runId = "run-" + new Date().toISOString().replace(/[:.]/g, "-") + "-" + randomBytes(3).toString("hex");
  const token = randomBytes(24).toString("hex");
  const studioToken = randomBytes(24).toString("hex");
  const secrets = [token, studioToken, options.botToken, process.env.BOT_TOKEN].filter(Boolean);
  const debugDir = join(project, "debug", runId);
  mkdirSync(debugDir, { recursive: true });
  const recordsFile = join(debugDir, "events.jsonl");
  const textFile = join(debugDir, "events.log");
  writeFileSync(recordsFile, "");
  writeFileSync(textFile, "");
  writeFileSync(join(debugDir, "run.json"), JSON.stringify({
    schemaVersion: 1, runId, startedAt: new Date().toISOString(), project,
    bot: options.bot || null, webRoot, buildId: options.buildId || null,
  }, null, 2));
  const recent = [], seen = new Set();
  let cursor = 0, child, closing, childClosed = false;
  function ingest(records, expectedSource) {
    if (!Array.isArray(records) || records.length > 20) throw new Error("Expected at most 20 records");
    // Validate the whole batch before accepting any records.
    for (const r of records) {
      if (!r || r.schemaVersion !== 1 || r.runId !== runId ||
        !["bot", "webapp", "mpy"].includes(r.source) || (expectedSource && r.source !== expectedSource) ||
        typeof r.clientId !== "string" || !/^[\w-]{1,100}$/.test(r.clientId) ||
        !Number.isSafeInteger(r.seq) || r.seq < 1 || !levels.has(r.level) ||
        typeof r.message !== "string" || typeof r.timestamp !== "string" ||
        Buffer.byteLength(JSON.stringify(r)) > 8192) throw new Error("Invalid log record");
    }
    let accepted = 0;
    for (const r of records) {
      const key = r.source + ":" + r.clientId + ":" + r.seq;
      if (seen.has(key)) continue;
      // Redact again at the persistence boundary; do not trust custom clients.
      const safe = serializeStudioValue(r, secrets);
      const record = { ...safe, cursor: cursor + 1, receivedAt: new Date().toISOString() };
      appendFileSync(recordsFile, JSON.stringify(record) + "\n");
      appendFileSync(textFile, "[" + record.receivedAt + "][" + r.source + "][" + r.level + "][" +
        r.clientId + ":" + r.seq + "] " + redactText(r.message, secrets) + "\n");
      cursor++;
      seen.add(key);
      if (seen.size > 10000) seen.delete(seen.values().next().value);
      recent.push(record);
      if (recent.length > 1000) recent.shift();
      accepted++;
    }
    return accepted;
  }
  const deviceConfig = Array.isArray(options.devices) ? options.devices
    : options.devices ? JSON.parse(readFileSync(resolve(project, options.devices), "utf8")) : [];
  let mpySeq = 0;
  const launches = new LaunchManager({
    project, debugDir, runId, devices: deviceConfig, ...(options.launchOptions || {}),
    log: (job, level, message, kind) => {
      const safe = redactText(String(message), [...secrets, "pixelmug"]);
      appendFileSync(join(job.dir, kind === "console" ? "mpy.log" : "deploy.log"), safe + "\n");
      ingest([{ schemaVersion: 1, runId, source: "mpy", clientId: job.id, seq: ++mpySeq,
        timestamp: new Date().toISOString(), level, kind, message: safe.slice(0,1800),
        deviceId: job.device.deviceId, slotId: job.device.slotId, launchId: job.id }], "mpy");
    },
  });
  function reply(res, status, body, type = "application/json; charset=utf-8") {
    res.writeHead(status, { "Content-Type": type, "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff", "Referrer-Policy": "no-referrer" });
    res.end(type.startsWith("application/json") ? JSON.stringify(body) : body);
  }
  function authorized(req, credential) {
    const value = Buffer.from(req.headers.authorization || "");
    const expected = Buffer.from("Bearer " + credential);
    return value.length === expected.length && timingSafeEqual(value, expected);
  }
  const server = createServer(async (req, res) => {
    try {
      const url = new URL(req.url, "http://localhost");
      // Same-origin WebApp traffic only; no permissive CORS / arbitrary Origin reflection.
      if (req.headers.origin && !allowedOrigins.has(req.headers.origin)) return reply(res, 403, { error: "Origin rejected" });
      if (!allowedHosts.has(req.headers.host)) return reply(res, 403, { error: "Host rejected" });
      if (url.pathname.startsWith("/api/")) {
        const canRead = authorized(req, studioToken);
        const canSend = authorized(req, token);
        if (!canRead && !canSend) return reply(res, 401, { error: "Studio session token required" });
        if (url.pathname === "/api/launch" && req.method === "POST") {
          if (!String(req.headers["content-type"]).startsWith("application/json")) return reply(res,415,{error:"JSON required"});
          const chunks = []; let length = 0;
          for await (const chunk of req) {
            length += chunk.length;
            if (length > 65536) return reply(res,413,{error:"Control request too large"});
            chunks.push(chunk);
          }
          try {
            const body = JSON.parse(Buffer.concat(chunks).toString("utf8"));
            const result = canRead && body.op === "rerun"
              ? await launches.rerun(body.launchId)
              : canRead && body.op === "runBinding" ? await launches.bindings.run(body.bindingId)
              : await launches.handle(canSend ? "webapp" : "bot", body);
            return reply(res,200,result);
          } catch (error) { return reply(res,Number.isInteger(error.code) ? error.code : 400,
            { error: { message: error.message, code: error.code || "STUDIO_LAUNCH_FAILED" } }); }
        }
        if (url.pathname === "/api/logs" && req.method === "POST") {
          if (!String(req.headers["content-type"]).startsWith("application/json")) return reply(res, 415, { error: "JSON required" });
          const chunks = [];
          let bytes = 0;
          for await (const chunk of req) {
            bytes += chunk.length;
            if (bytes > MAX_BODY) { reply(res, 413, { error: "Batch too large" }); return; }
            chunks.push(chunk);
          }
          const body = JSON.parse(Buffer.concat(chunks).toString("utf8"));
          return reply(res, 200, { accepted: ingest(body.records, canSend ? "webapp" : "bot") });
        }
        if (url.pathname === "/api/events" && req.method === "GET") {
          if (!canRead) return reply(res, 403, { error: "Read permission required" });
          const after = Number(url.searchParams.get("after")) || 0;
          return reply(res, 200, { runId, debugDir, cursor, launches: launches.list(), restarts: launches.restartList(), bindings: launches.bindings.list(), devices: launches.devices, bot: child ? { pid: child.pid, exitCode: child.exitCode, signal: child.signalCode } : null,
            truncated: recent.length > 0 && after > 0 && after < recent[0].cursor - 1,
            records: recent.filter(r => r.cursor > after) });
        }
        return reply(res, 404, { error: "Not found" });
      }
      if (req.method !== "GET" && req.method !== "HEAD") return reply(res, 405, { error: "Method not allowed" });
      if (url.pathname === "/") {
        return reply(res, 200, readFileSync(new URL("./ui.html", import.meta.url), "utf8"), mime[".html"]);
      }
      if (url.pathname === "/studio-debug-config.js") {
        // Session token originates in Studio's launch fragment and never enters access logs.
        const config = { enabled: true, runId, buildId: options.buildId || null, endpoint: "/api/logs", token: null };
        const script = "const key = 'pixelmug-studio-token:' + (location.pathname.startsWith('/app/') ? 'webapp' : 'studio');\n" +
          "const params = new URLSearchParams(location.hash.slice(1));\n" +
          "const token = params.get('studioToken') || sessionStorage.getItem(key);\n" +
          "if (params.has('studioToken')) { sessionStorage.setItem(key, token); params.delete('studioToken'); history.replaceState(null, '', location.pathname + location.search + (params.size ? '#' + params : '')); }\n" +
          "globalThis.__PIXELMUG_STUDIO_DEBUG__ = token ? { ..." + JSON.stringify(config) + ", token } : { enabled: false };\n";
        return reply(res, 200, script, mime[".js"]);
      }
      let path;
      if (url.pathname === "/studio-runtime/sdk-web.js") {
        // Resolve to the exact module instance used by the hosted application.
        return reply(res, 200, 'export { BubbleWebApp } from "/sdk/WebApp.js"; export { DeviceRpcError } from "/sdk/errors.js";', mime[".js"]);
      }
      if (url.pathname.startsWith("/studio-runtime/")) {
        const name = url.pathname.slice("/studio-runtime/".length);
        if (!browserRuntime.has(name)) return reply(res, 404, { error: "Not found" });
        path = join(runtimeRoot, name);
      } else if (url.pathname.startsWith("/sdk/")) {
        const name = url.pathname.slice(5);
        if (!browserSDK.has(name)) return reply(res, 404, { error: "Not found" });
        path = join(sdkRoot, name);
      } else if (webRoot && url.pathname.startsWith("/app/")) {
        const name = decodeURIComponent(url.pathname.slice(5) || "index.html");
        // Only serve a dedicated WebApp directory; reject hidden files and symlink escapes.
        if (name.split(/[\\/]/).some(part => part.startsWith("."))) return reply(res, 403, { error: "Forbidden" });
        path = realpathSync(resolve(webRoot, name));
        const rel = relative(webRoot, path);
        if (rel.startsWith("..") || isAbsolute(rel) || !statSync(path).isFile()) return reply(res, 403, { error: "Forbidden" });
      } else return reply(res, 404, { error: "Not found" });
      return reply(res, 200, readFileSync(path), mime[extname(path)] || "application/octet-stream");
    } catch (error) {
      if (!res.headersSent) reply(res, error.code === "ENOENT" ? 404 : 400, { error: "Request rejected" });
      else res.destroy();
    }
  });
  server.requestTimeout = 10000;
  server.headersTimeout = 10000;
  const allowedOrigins = new Set(), allowedHosts = new Set();
  await new Promise((resolveListen, reject) => {
    server.once("error", reject);
    server.listen(options.port ?? 8787, options.bind || "0.0.0.0", resolveListen);
  });
  const port = server.address().port;
  const host = options.host || "127.0.0.1";
  for (const hostname of new Set([host, "127.0.0.1", "localhost"])) {
    const origin = new URL("http://" + hostname + ":" + port);
    allowedOrigins.add(origin.origin);
    allowedHosts.add(origin.host);
  }
  const baseUrl = "http://" + host + ":" + port;
  const localWebAppUrl = webRoot ? baseUrl + "/app/#studioToken=" + token : null;
  const webAppUrl = webRoot ? (options.publicWebAppUrl || localWebAppUrl) : null;
  const studioUrl = "http://127.0.0.1:" + port + "/#studioToken=" + studioToken;

  let processSeq = 0;
  function processLog(message, level = "info") {
    if (!options.captureProcessLogs) return;
    ingest([{ schemaVersion: 1, runId, source: "bot", clientId: "studio-process", seq: ++processSeq,
      timestamp: new Date().toISOString(), level, kind: "process", message: String(message).slice(0, 1800) }], "bot");
  }
  function captureStream(stream, name) {
    const decoder = new StringDecoder("utf8");
    let pending = "";
    const file = join(debugDir, "bot." + name + ".log");
    const write = line => {
      const safe = redactText(line, secrets);
      appendFileSync(file, safe);
      if (name === "stderr") processLog(safe, "error");
      if (options.mirrorBotOutput !== false) process[name].write(safe);
    };
    stream.on("data", chunk => {
      pending += decoder.write(chunk);
      let split;
      while ((split = pending.indexOf("\n")) >= 0) {
        write(pending.slice(0, split + 1));
        pending = pending.slice(split + 1);
      }
      if (pending.length > 65536) { write(pending.slice(0, 65536) + "\n[Long line truncated]\n"); pending = ""; }
    });
    stream.on("end", () => { pending += decoder.end(); if (pending) write(pending); });
  }
  if (options.bot) {
    try {
      child = fork(resolve(project, options.bot), options.botArgs || [], {
        cwd: project, silent: true,
        execArgv: ["--import", new URL("./runtime/studio-preload.js", import.meta.url).href],
        env: { ...process.env, ...(options.botToken ? { BOT_TOKEN: options.botToken } : {}), ...(options.botApiBaseUrl ? { BOT_API_BASE_URL: options.botApiBaseUrl } : {}), STUDIO_WEBAPP_URL: webAppUrl || "",
          PIXELMUG_STUDIO_DEBUG: JSON.stringify({ enabled: true, runId, buildId: options.buildId || null, transport: "ipc", token }) },
      });
      captureStream(child.stdout, "stdout");
      captureStream(child.stderr, "stderr");
      child.once("close", () => { childClosed = true; });
      child.on("message", message => {
        if (message?.type === "pixelmug:control") {
          void launches.handle("bot", message.payload).then(result => {
            if (child.connected) child.send({ type: "pixelmug:control:response", id: message.id, result }, () => {});
          }).catch(error => {
            if (child.connected) child.send({ type: "pixelmug:control:response", id: message.id, error: { message: error.message, code: error.code } }, () => {});
          });
          return;
        }
        if (message?.type !== "pixelmug:logs") return;
        try { ingest(message.records, "bot"); }
        catch { appendFileSync(join(debugDir, "receiver.log"), "Rejected bot log batch\n"); }
      });
      child.on("error", error => appendFileSync(join(debugDir, "receiver.log"), redactText(error.stack, secrets) + "\n"));
      child.on("exit", (code, signal) => { processLog("bot 已退出：code=" + code + ", signal=" + signal, code === 0 ? "info" : "error"); });
      child.on("exit", (code, signal) => writeFileSync(join(debugDir, "bot-exit.json"),
        JSON.stringify({ code, signal, exitedAt: new Date().toISOString() }, null, 2)));
    } catch (error) { await new Promise(resolveClose => server.close(resolveClose)); throw error; }
  }

  async function close({ rebootDevices = false } = {}) {
    if (closing) return closing;
    closing = (async () => {
      let stopResult;
      try { if (rebootDevices) stopResult = await launches.stopDevices(); }
      catch (error) {
        stopResult = { devices: launches.list().map(job => ({ deviceId: job.device.deviceId, status: "unconfirmed", message: error.message })), unconfirmed: launches.list().length };
      }
      await launches.close();
      if (child && !childClosed) {
        await new Promise(done => {
          const timeout = setTimeout(() => { child.kill("SIGKILL"); }, 1500);
          child.once("close", () => { clearTimeout(timeout); done(); });
          child.kill("SIGTERM");
        });
      }
      server.closeIdleConnections();
      await new Promise(done => { server.close(done); server.closeAllConnections(); });
      return stopResult;
    })();
    return closing;
  }
  return { server, runId, token, studioToken, port, baseUrl, webAppUrl, studioUrl, debugDir, child, launches, close };
}
