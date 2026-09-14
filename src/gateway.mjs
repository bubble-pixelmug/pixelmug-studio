import { createServer, request as httpRequest } from "node:http";
import { randomBytes, timingSafeEqual } from "node:crypto";
import { startMdnsResponder } from "./mdns.mjs";

const html = message => `<!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>PixelMug Studio</title><style>body{font:16px system-ui;margin:0;min-height:100vh;display:grid;place-items:center;background:#eef3f7;color:#203143}.card{max-width:28rem;margin:1rem;padding:2rem;border-radius:18px;background:white;box-shadow:0 12px 40px #17324d1f}h2{margin-top:0}</style><div class="card"><h2>PixelMug Studio</h2><p>${message}</p></div></html>`;
const reply = (res, status, body, type = "text/plain; charset=utf-8") => {
  res.writeHead(status, { "Content-Type": type, "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff", "Referrer-Policy": "no-referrer" });
  res.end(body);
};
const authorized = (req, credential) => {
  const actual = Buffer.from(req.headers.authorization || "");
  const expected = Buffer.from("Bearer " + credential);
  return actual.length === expected.length && timingSafeEqual(actual, expected);
};

export async function startWebAppGateway({ port = 7979, bind = "0.0.0.0", hostname = "pixelmug-studio.local", mdns = true, mdnsPort = 5353 } = {}) {
  const projects = new Map();
  let active = null;
  function access(project) {
    if (!projects.has(project)) projects.set(project, {
      key: randomBytes(12).toString("hex"), credential: randomBytes(24).toString("hex"), project,
    });
    return projects.get(project);
  }
  function webAppUrl(project, host) {
    const entry = access(project);
    return `http://${host}:${server.address().port}/app/${entry.key}/#studioToken=${entry.credential}`;
  }
  function activate(project, run) { active = { ...access(project), run }; }
  function deactivate(run) { if (!run || active?.run === run) active = null; }

  const server = createServer((req, res) => {
    try {
      const url = new URL(req.url, "http://localhost");
      const match = /^\/app\/([a-f0-9]{24})(?:\/(.*))?$/.exec(url.pathname);
      let upstreamPath = url.pathname + url.search;
      if (match) {
        const known = [...projects.values()].find(item => item.key === match[1]);
        if (!known) return reply(res, 404, html("这个 WebApp 入口无效。"), "text/html; charset=utf-8");
        if (!active || active.key !== known.key) return reply(res, 503, html("智能体尚未运行，请在 Studio 中启动后重新打开本页面。"), "text/html; charset=utf-8");
        upstreamPath = "/app/" + (match[2] || "") + url.search;
      } else if (!active) {
        return reply(res, 503, html("智能体尚未运行，请在 Studio 中启动后重新打开本页面。"), "text/html; charset=utf-8");
      }
      if (!match && !url.pathname.startsWith("/api/") && url.pathname !== "/studio-debug-config.js" &&
          !url.pathname.startsWith("/studio-runtime/") && !url.pathname.startsWith("/sdk/")) {
        return reply(res, 404, "Not found");
      }
      if (url.pathname.startsWith("/api/") && !authorized(req, active.credential)) return reply(res, 401, "WebApp access denied");
      const headers = { ...req.headers, host: "127.0.0.1:" + active.run.port };
      if (url.pathname.startsWith("/api/")) headers.authorization = "Bearer " + active.run.token;
      if (headers.origin) headers.origin = "http://127.0.0.1:" + active.run.port;
      delete headers.connection;
      const proxy = httpRequest({ hostname: "127.0.0.1", port: active.run.port, method: req.method, path: upstreamPath, headers }, upstream => {
        res.writeHead(upstream.statusCode || 502, upstream.headers);
        upstream.pipe(res);
      });
      proxy.on("error", () => { if (!res.headersSent) reply(res, 502, "当前智能体运行不可用"); else res.destroy(); });
      req.pipe(proxy);
    } catch { if (!res.headersSent) reply(res, 400, "Request rejected"); else res.destroy(); }
  });
  server.requestTimeout = 15000;
  server.headersTimeout = 10000;
  const responder = mdns ? await startMdnsResponder({ hostname, port: mdnsPort }) : null;
  try {
    await new Promise((done, reject) => { server.once("error", reject); server.listen(port, bind, done); });
  } catch (error) { await responder?.close(); throw error; }
  async function close() { active = null; await responder?.close(); await new Promise(done => { server.close(done); server.closeAllConnections(); }); }
  return { server, port: server.address().port, hostname, responder, access, webAppUrl, activate, deactivate, close };
}