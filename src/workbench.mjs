import { createServer } from 'node:http';
import { randomBytes, timingSafeEqual } from 'node:crypto';
import { readFile, readdir, realpath, stat } from 'node:fs/promises';
import { resolve, dirname, relative, isAbsolute, join } from 'node:path';
import { homedir } from 'node:os';
import { CreatorClient } from './creator.mjs';
import { startStudio } from './receiver.mjs';
import { inspectProject, validateProjectRun } from './project.mjs';
import { startWebAppGateway } from './gateway.mjs';

export async function startWorkbench(options = {}) {
  const creator = new CreatorClient({ baseUrl: options.creatorUrl || 'https://connector.devjeejio.com:5443', fetchImpl: options.fetchImpl });
  const credential = randomBytes(24).toString('hex');
  const webAppHostname = options.webAppHostname || 'pixelmug-studio.local';
  const gateway = await startWebAppGateway({ port: options.gatewayPort ?? (options.port === 0 ? 0 : 7979),
    hostname: webAppHostname, mdns: options.mdns !== false, mdnsPort: options.mdnsPort ?? 5353 });
  let run = null, project = null, busy = false, stopped = false;
  let runtimeConfig = {};
  const inspect = inspectProject;
  async function stopRun(rebootDevices = false) {
    if (!run) return { devices: [], unconfirmed: 0 };
    const current = run;
    const result = await current.close({ rebootDevices });
    gateway.deactivate(current);
    run = null;
    return result || { devices: [], unconfirmed: 0 };
  }
  async function events(after) {
    if (!run) return null;
    const response = await fetch('http://127.0.0.1:' + run.port + '/api/events?after=' + (Number(after) || 0), { headers: { Authorization: 'Bearer ' + run.studioToken }, signal: AbortSignal.timeout(5000) });
    if (!response.ok) throw new Error('运行日志接收端不可用');
    return response.json();
  }
  async function launch(body) {
    if (!creator.session) throw new Error('请先登录冒泡账号');
    if (!project) throw new Error('请先打开项目目录');
    const selectedProject = await validateProjectRun(project.path, { bot: body.bot });
    const root = selectedProject.path;
    const bot = selectedProject.bot;
    const webRoot = selectedProject.webRoot;
    // Validate inputs before preparing device reboots or replacing the existing run.
    await creator.refresh();
    const botToken = String(body.botToken || '').trim() || runtimeConfig.botToken || process.env.BOT_TOKEN;
    const botApiBaseUrl = body.botApiBaseUrl === undefined ? runtimeConfig.botApiBaseUrl : String(body.botApiBaseUrl || '').trim();
    const autoRunMpy = selectedProject.mpy && (body.autoRunMpy === undefined ? runtimeConfig.autoRunMpy === true : body.autoRunMpy === true);
    const prepared = run ? await run.launches.stopDevices({ enterRepl: true }) : { devices: [] };
    await stopRun();
    const publicWebAppUrl = webRoot ? gateway.webAppUrl(root, webAppHostname) : null;
    run = await startStudio({ project: root, bot, webRoot, host: "127.0.0.1", bind: "127.0.0.1", port: 0, publicWebAppUrl,
      captureProcessLogs: true,
      botToken, botApiBaseUrl: botApiBaseUrl || process.env.BOT_API_BASE_URL,
      launchOptions: { authorizeDevice: (ref, options) => creator.authorize(ref, options), restartDevices: prepared.devices,
        prepareOnBinding: selectedProject.mpy, autoRunOnBinding: autoRunMpy },
    });
    if (webRoot) gateway.activate(root, run);
    runtimeConfig = { botToken, botApiBaseUrl, autoRunMpy };
    project = { ...selectedProject, bot, webRoot };
    return { runId: run.runId, webAppUrl: run.webAppUrl, debugDir: run.debugDir };
  }
  function reply(res, code, value, type = 'application/json; charset=utf-8') {
    res.writeHead(code, { 'Content-Type': type, 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'no-referrer', 'Content-Security-Policy': "default-src 'self'; style-src 'self'; script-src 'self'; connect-src 'self'; img-src 'self' data:; frame-ancestors 'none'" });
    res.end(type.startsWith('application/json') ? JSON.stringify(value) : value);
  }
  async function bodyOf(req) {
    if (!String(req.headers['content-type']).startsWith('application/json')) throw new Error('JSON required');
    let size = 0; const chunks = [];
    for await (const chunk of req) { size += chunk.length; if (size > 16384) throw new Error('Request too large'); chunks.push(chunk); }
    return JSON.parse(Buffer.concat(chunks).toString('utf8'));
  }
  const server = createServer(async (req, res) => {
    try {
      if (!allowed.has(req.headers.host) || (req.headers.origin && !origins.has(req.headers.origin))) return reply(res, 403, { error: 'Origin / Host rejected' });
      const url = new URL(req.url, 'http://localhost');
      if (url.pathname.startsWith('/api/')) {
        const actual = Buffer.from(req.headers.authorization || ''), expected = Buffer.from('Bearer ' + credential);
        if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) return reply(res, 401, { error: '请使用启动终端提供的完整 Studio 地址' });
        if (req.method === 'GET' && url.pathname === '/api/state') return reply(res, 200, {
          user: creator.publicSession(), creatorUrl: creator.baseUrl, devices: creator.devices, devicesUpdatedAt: creator.updatedAt,
          project, runtimeConfig: { botApiBaseUrl: runtimeConfig.botApiBaseUrl || '', autoRunMpy: runtimeConfig.autoRunMpy === true, hasBotToken: Boolean(runtimeConfig.botToken || process.env.BOT_TOKEN) }, webAppHostname, webAppPort: gateway.port, busy,
          run: run ? { runId: run.runId, webAppUrl: run.webAppUrl, debugDir: run.debugDir } : null,
          events: await events(url.searchParams.get('runId') === run?.runId ? url.searchParams.get('after') : 0),
        });
        if (req.method === 'GET' && url.pathname === '/api/directories') {
          const path = await realpath(resolve(url.searchParams.get('path') || project?.path || options.initialDirectory || homedir()));
          const entries = await readdir(path, { withFileTypes: true });
          const directories = entries.filter(d => d.isDirectory() && !d.name.startsWith('.') && d.name !== 'node_modules').map(d => ({ name: d.name, path: join(path, d.name) })).sort((a,b) => a.name.localeCompare(b.name));
          const drives = [];
          if (process.platform === 'win32') for (const letter of 'ABCDEFGHIJKLMNOPQRSTUVWXYZ') { try { await stat(letter + ':\\'); drives.push(letter + ':\\'); } catch {} }
          return reply(res, 200, { path, parent: dirname(path), directories, drives });
        }
        if (req.method !== 'POST') return reply(res, 404, { error: 'Not found' });
        const body = await bodyOf(req);
        if (busy || stopped) return reply(res, 409, { error: '正在处理上一项操作，请稍后重试' });
        busy = true;
        try {
          let result = { ok: true };
          switch (url.pathname) {
            case '/api/auth/code': await creator.sendCode(body); break;
            case '/api/auth/login': result = await creator.login(body); break;
            case '/api/auth/logout': await stopRun(); runtimeConfig = {}; await creator.logout(); break;
            case '/api/devices/refresh': result = await creator.refresh(); break;
            case '/api/project/open': {
              const next = await inspect(String(body.path || ''));
              if (!body.path) throw new Error('请选择项目目录');
              if (run) throw new Error('切换项目之前请先停止当前调试');
              if (project?.path !== next.path) runtimeConfig = {};
              project = next; result = project; break;
            }
            case '/api/run/start': result = await launch(body); break;
            case '/api/run/stop': result = await stopRun(true); break;
            case '/api/run/device':
              if (!run) throw new Error('尚未开始调试');
              result = await run.launches.bindings.run(body.bindingId); break;
            case '/api/run/rerun':
              if (!run) throw new Error('尚未开始调试');
              result = await run.launches.rerun(body.launchId); break;
            default: return reply(res, 404, { error: 'Not found' });
          }
          return reply(res, 200, result);
        } finally { busy = false; }
      }
      if (req.method !== 'GET') return reply(res, 405, { error: 'Method not allowed' });
      if (url.pathname === '/') return reply(res, 200, await readFile(new URL('../ui-dist/index.html', import.meta.url)), 'text/html; charset=utf-8');
      if (!/^\/assets\/[A-Za-z0-9._-]+$/.test(url.pathname)) return reply(res, 404, { error: 'Not found' });
      const type = url.pathname.endsWith('.js') ? 'text/javascript; charset=utf-8'
        : url.pathname.endsWith('.css') ? 'text/css; charset=utf-8'
        : url.pathname.endsWith('.png') ? 'image/png' : 'application/octet-stream';
      return reply(res, 200, await readFile(new URL('../ui-dist' + url.pathname, import.meta.url)), type);
    } catch (error) {
      const message = String(error.message || '操作失败');
      const safe = creator.session?.token ? message.replaceAll(creator.session.token, '[REDACTED]') : message;
      if (!res.headersSent) reply(res, 400, { error: safe }); else res.destroy();
    }
  });
  const allowed = new Set(), origins = new Set();
  server.requestTimeout = 20000;
  await new Promise((done, reject) => { server.once('error', reject); server.listen(options.port ?? 8787, '127.0.0.1', done); });
  const port = server.address().port;
  for (const host of ['127.0.0.1', 'localhost']) { allowed.add(host + ':' + port); origins.add('http://' + host + ':' + port); }
  async function close() { stopped = true; await stopRun(); creator.session = null; await gateway.close(); await new Promise(done => { server.close(done); server.closeAllConnections(); }); }
  return { server, port, gatewayPort: gateway.port, studioUrl: 'http://127.0.0.1:' + port + '/#studioToken=' + credential, close };
}
