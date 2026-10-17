import { webAppAddresses } from './webapp-addresses.mjs';
import { ProjectFiles } from './project-files.mjs';
import { createServer } from 'node:http';
import { randomBytes, timingSafeEqual } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { readFile, readdir, realpath, stat } from 'node:fs/promises';
import { resolve, dirname, relative, isAbsolute, join } from 'node:path';
import { homedir } from 'node:os';
import { CreatorClient } from './creator.mjs';
import { startStudio } from './receiver.mjs';
import { inspectProject, validateProjectRun } from './project.mjs';
import { startWebAppGateway } from './gateway.mjs';
import { createProjectArchive, readMpsMetadata } from './cloud-deployment.mjs';

const DEFAULT_CREATOR_API_URL = 'https://us-connector.jeejio.com';
const DEFAULT_BOT_API_URL = 'https://us.jeejio.com/im';

export async function startWorkbench(options = {}) {
  const deploymentServiceUrl = String(options.deploymentServiceUrl || process.env.STUDIO_DEPLOYMENT_SERVICE_URL || 'http://127.0.0.1:8788').replace(/\/$/, '');
  const creator = new CreatorClient({ baseUrl: options.creatorUrl || DEFAULT_CREATOR_API_URL, fetchImpl: options.fetchImpl });
  const docsUrl = new URL(options.docsUrl || process.env.STUDIO_DOCS_URL || 'https://bubble-pixelmug.github.io/pixelmug-docs/en/');
  if (!['http:', 'https:'].includes(docsUrl.protocol) || docsUrl.username || docsUrl.password) throw new Error('Invalid documentation URL');
  const credential = randomBytes(24).toString('hex');
  const defaultWebAppHostname = options.webAppHostname || 'pixelmug-studio.local';
  let webAppHostname = defaultWebAppHostname;
  const addressChoices = () => webAppAddresses(defaultWebAppHostname);
  function validateWebAppHostname(host) {
    if (!addressChoices().some(item => item.host === host)) throw new Error('所选访问地址已不可用，请重新选择当前电脑的局域网 IP 或 .local 地址');
    return host;
  }
  const gateway = await startWebAppGateway({ port: options.gatewayPort ?? (options.port === 0 ? 0 : 7979),
    hostname: webAppHostname, mdns: options.mdns !== false, mdnsPort: options.mdnsPort ?? 5353 });
  let run = null, project = null, busy = false, stopped = false;
  let runtimeConfig = {};
  let fileQueue = Promise.resolve();
  let deviceRefresh;
  let slotState = { list: [], loading: false, error: '', updatedAt: null };
  let slotTimer, slotGeneration = 0, slotPending;
  function clearSlots() {
    clearTimeout(slotTimer);
    slotGeneration++;
    slotPending = null;
    slotState = { list: [], loading: false, error: '', updatedAt: null };
  }
  async function refreshSlots() {
    if (!run || stopped || !creator.session) return;
    if (slotPending) return slotPending;
    clearTimeout(slotTimer);
    const generation = slotGeneration;
    slotState = { ...slotState, loading: true };
    const pending = (async () => {
      try {
        const list = await creator.botSlots(runtimeConfig.botToken);
        if (generation === slotGeneration) slotState = { list, loading: false, error: '', updatedAt: new Date().toISOString() };
      } catch (error) {
        if (generation === slotGeneration) slotState = { ...slotState, loading: false, error: error.message };
      } finally {
        if (generation === slotGeneration) {
          slotPending = null;
          if (run && !stopped && creator.session) {
            slotTimer = setTimeout(() => void refreshSlots(), slotState.list.length ? 10000 : 2000);
            slotTimer.unref?.();
          }
        }
      }
    })();
    slotPending = pending;
    return pending;
  }
  const inspect = inspectProject;
  async function stopRun(rebootDevices = false) {
    clearSlots();
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
    const botId = String(body.botId ?? runtimeConfig.botId ?? '');
    const botToken = creator.getBotToken(botId);
    const configuredBotApiBaseUrl = body.botApiBaseUrl === undefined ? runtimeConfig.botApiBaseUrl : String(body.botApiBaseUrl || '').trim();
    const botApiBaseUrl = configuredBotApiBaseUrl || DEFAULT_BOT_API_URL;
    const mps = selectedProject.mpy ? await readMpsMetadata(root) : null;
    const autoRunMpy = selectedProject.mpy && (body.autoRunMpy === undefined ? runtimeConfig.autoRunMpy === true : body.autoRunMpy === true);
    if (webRoot) validateWebAppHostname(webAppHostname);
    const prepared = run ? await run.launches.stopDevices({ enterRepl: true }) : { devices: [] };
    await stopRun();
    const publicWebAppUrl = webRoot ? gateway.webAppUrl(root, webAppHostname) : null;
    run = await startStudio({ project: root, bot, webRoot, mpsId: 'local-debug', mpsVersion: mps?.version || 'local', host: "127.0.0.1", bind: "127.0.0.1", port: 0, publicWebAppUrl,
      captureProcessLogs: true,
      botToken, botApiBaseUrl: botApiBaseUrl || process.env.BOT_API_BASE_URL,
      launchOptions: { authorizeDevice: (ref, options) => creator.authorize(ref, options), restartDevices: prepared.devices,
        prepareOnBinding: selectedProject.mpy, autoRunOnBinding: autoRunMpy },
    });
    if (webRoot) gateway.activate(root, run);
    runtimeConfig = { botId, botToken, botApiBaseUrl, autoRunMpy };
    project = { ...selectedProject, bot, webRoot };
    void refreshSlots();
    return { runId: run.runId, webAppUrl: run.webAppUrl, debugDir: run.debugDir };
  }
  function reply(res, code, value, type = 'application/json; charset=utf-8') {
    res.writeHead(code, { 'Content-Type': type, 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'no-referrer', 'Content-Security-Policy': "default-src 'self'; style-src 'self' 'nonce-" + credential + "'; script-src 'self'; connect-src 'self'; img-src 'self' data: https:; frame-src " + docsUrl.origin + "; frame-ancestors 'none'" });
    res.end(type.startsWith('application/json') ? JSON.stringify(value) : value);
  }
  async function bodyOf(req, limit = 16384) {
    if (!String(req.headers['content-type']).startsWith('application/json')) throw new Error('JSON required');
    let size = 0; const chunks = [];
    for await (const chunk of req) { size += chunk.length; if (size > limit) throw new Error('Request too large'); chunks.push(chunk); }
    return JSON.parse(Buffer.concat(chunks).toString('utf8'));
  }
  async function deploymentRequest(path, init = {}) {
    const requestUrl = deploymentServiceUrl + path;
    let response;
    try {
      response = await fetch(requestUrl, { ...init, signal: init.signal || AbortSignal.timeout(180000) });
    } catch (error) {
      throw new Error(`Deployment service unavailable at ${requestUrl}: ${error.message}`);
    }
    const text = await response.text();
    let value; try { value = JSON.parse(text || '{}'); } catch { throw new Error(`Deployment service returned invalid JSON (${response.status})`); }
    if (!response.ok) throw new Error(`Deployment service ${response.status} at ${path}: ${value.error?.message || value.error || text || 'request failed'}`);
    return value;
  }
  const server = createServer(async (req, res) => {
    try {
      if (!allowed.has(req.headers.host) || (req.headers.origin && !origins.has(req.headers.origin))) return reply(res, 403, { error: 'Origin / Host rejected' });
      const url = new URL(req.url, 'http://localhost');
      if (url.pathname.startsWith('/api/')) {
        const actual = Buffer.from(req.headers.authorization || ''), expected = Buffer.from('Bearer ' + credential);
        if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) return reply(res, 401, { error: '请使用启动终端提供的完整 Studio 地址' });
        if (req.method === 'GET' && url.pathname === '/api/state') return reply(res, 200, {
          bots: creator.publicBots(), botsError: creator.botsError, mps: creator.publicMps(), mpsError: creator.mpsError,
          user: creator.publicSession(), creatorUrl: creator.baseUrl, devices: creator.devices, devicesUpdatedAt: creator.updatedAt,
          botSlots: creator.session ? slotState : { list: [], loading: false, error: '', updatedAt: null },
          project, runtimeConfig: { botApiBaseUrl: runtimeConfig.botApiBaseUrl || '', autoRunMpy: runtimeConfig.autoRunMpy === true, botId: runtimeConfig.botId || '', hasBotToken: Boolean(creator.botTokens.get(runtimeConfig.botId)) }, webAppHostname, webAppAddresses: addressChoices(), webAppPort: gateway.port, docsUrl: docsUrl.href, busy,
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
        if (req.method === 'GET' && url.pathname === '/api/deploy/servers') {
          return reply(res, 200, await deploymentRequest('/api/cloud/nodes'));
        }
        if (req.method === 'GET' && url.pathname === '/api/deploy/project-info') {
          if (!project) throw new Error('Please open a project first');
          const mps = await readMpsMetadata(project.path).catch(() => null);
          return reply(res, 200, { project_id: project.path.split(/[\\/]/).filter(Boolean).pop(), bot: project.bot, has_webapp: Boolean(project.webRoot), mps });
        }
        if (req.method === 'POST' && url.pathname === '/api/deploy/apply') {
          const body = await bodyOf(req);
          return reply(res, 200, await deploymentRequest('/api/cloud/servers/apply', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }));
        }
        const deploymentMetadataMatch = url.pathname.match(/^\/api\/deploy\/metadata\/([^/]+)$/);
        if (req.method === 'POST' && deploymentMetadataMatch) {
          const body = await bodyOf(req);
          return reply(res, 200, await deploymentRequest(`/api/cloud/deployments/${encodeURIComponent(deploymentMetadataMatch[1])}/metadata`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }));
        }
        if (req.method === 'POST' && url.pathname === '/api/deploy/upload') {
          if (!project) throw new Error('Please open a project first');
          const deploymentId = String(req.headers['x-deployment-id'] || '');
          const releaseId = String(req.headers['x-release-id'] || '1.0.0');
          const mpsId = String(req.headers['x-mps-id'] || '').trim();
          if (!deploymentId || !mpsId) throw new Error('Deployment ID and MPS ID are required');
          const metadata = await readMpsMetadata(project.path);
          const botId = String(req.headers['x-bot-id'] || runtimeConfig.botId || '');
          const botToken = creator.getBotToken(botId);
          if (!botToken) throw new Error('Set the selected Bot token before uploading');
          const archive = await createProjectArchive({ projectPath: project.path, projectId: project.path.split(/[\\/]/).filter(Boolean).pop(), releaseId });
          try {
            const headers = { 'content-type': 'application/gzip', 'x-release-id': releaseId, 'x-environment-json': JSON.stringify({ BOT_TOKEN: botToken, BOT_API_BASE_URL: runtimeConfig.botApiBaseUrl || DEFAULT_BOT_API_URL }) };
            const releaseUrl = deploymentServiceUrl + `/api/cloud/deployments/${encodeURIComponent(deploymentId)}/releases`;
            let response;
            try {
              response = await fetch(releaseUrl, { method: 'POST', headers, body: createReadStream(archive.path), duplex: 'half', signal: AbortSignal.timeout(600000) });
            } catch (error) {
              throw new Error(`Deployment service unavailable at ${releaseUrl}: ${error.message}`);
            }
            const text = await response.text(); let value; try { value = JSON.parse(text || '{}'); } catch { throw new Error(`Deployment service returned invalid JSON (${response.status})`); }
            if (!response.ok) throw new Error(`Deployment service ${response.status} at /api/cloud/deployments/:id/releases: ${value.error?.message || value.error || text || 'release upload failed'}`);
            return reply(res, 200, { ...value, mpy: metadata });
          } finally { await archive.cleanup(); }
        }
        const deployMatch = url.pathname.match(/^\/api\/deploy\/(status|stop|retry)\/([^/]+)$/);
        if (req.method === 'GET' && deployMatch?.[1] === 'status') return reply(res, 200, await deploymentRequest(`/api/cloud/deployments/${encodeURIComponent(deployMatch[2])}`));
        if (req.method === 'POST' && deployMatch?.[1] === 'stop') return reply(res, 200, await deploymentRequest(`/api/cloud/deployments/${encodeURIComponent(deployMatch[2])}/stop`, { method: 'POST' }));
        if (req.method === 'POST' && deployMatch?.[1] === 'retry') return reply(res, 200, await deploymentRequest(`/api/cloud/deployments/${encodeURIComponent(deployMatch[2])}/retry`, { method: 'POST' }));
        if (req.method !== 'POST') return reply(res, 404, { error: 'Not found' });
        const body = await bodyOf(req, url.pathname === '/api/files/save' ? 7 * 1024 * 1024 : 16384);
        if (stopped) return reply(res, 409, { error: 'Studio is stopping' });
        if (url.pathname === '/api/devices/refresh') {
          const session = creator.session;
          if (!deviceRefresh || deviceRefresh.session !== session) {
            const current = { session, promise: creator.refresh() };
            deviceRefresh = current;
            current.promise.finally(() => { if (deviceRefresh === current) deviceRefresh = null; }).catch(() => {});
          }
          return reply(res, 200, await deviceRefresh.promise);
        }
        if (['list', 'read', 'save'].some(action => url.pathname === '/api/files/' + action)) {
          const fileSession = creator.session;
          const operation = fileQueue.then(async () => {
            if (fileSession !== creator.session) throw new Error("Login session changed; please retry");
            if (stopped) throw new Error('Studio is stopping');
            let result;
            if (!creator.session || !project) throw new Error('请先登录并选择应用');
            if (body.project !== project.path) throw new Error('当前应用已变化，请刷新后重试');
            const files = new ProjectFiles(project.path);
            const action = url.pathname.split('/').pop();
            if (action === 'list') result = await files.list(body.path);
            if (action === 'read') result = await files.read(body.path);
            if (action === 'save') result = await files.save(body.path,body.content,body.revision);
            return result;
          });
          fileQueue = operation.catch(() => {});
          return reply(res, 200, await operation);
        }
        if (busy || stopped) return reply(res, 409, { error: '正在处理上一项操作，请稍后重试' });
        busy = true;
        try {
          let result = { ok: true };
          switch (url.pathname) {
            case '/api/auth/code': await creator.sendCode(body); break;
            case '/api/auth/login':
              if (!creator.session) { await stopRun(); runtimeConfig = {}; }
              result = await creator.login(body); break;
            case '/api/bots/refresh': result = await creator.refreshBots(); break;
            case '/api/mps/refresh': result = await creator.refreshMps(); break;
            case '/api/bots/token':
              if (run && runtimeConfig.botId === body.botId) throw new Error('请先停止智能体，再修改正在使用的 Bot token');
              creator.setBotToken(String(body.botId || ''), body.token); break;
            case '/api/bots/select': {
              if (run) throw new Error('请先停止智能体，再选择 Bot');
              const botId = String(body.botId || '');
              if (!creator.session || !creator.bots.some(bot => bot.id && bot.id === botId)) throw new Error('请选择当前账号下的 Bot');
              runtimeConfig = { ...runtimeConfig, botId, botToken: undefined };
              break;
            }
            case '/api/auth/logout': await stopRun(); runtimeConfig = {}; await creator.logout(); break;
            case '/api/project/open': {
              const next = await inspect(String(body.path || ''));
              if (!body.path) throw new Error('请选择项目目录');
              if (run) throw new Error('切换项目之前请先停止当前调试');
              if (project?.path !== next.path) runtimeConfig = { botId: runtimeConfig.botId };
              project = next; result = project; break;
            }
            case '/api/deploy/create': {
              if (!project) throw new Error('Please open a project first');
              const mpsId = String(body.mpsId || '').trim();
              const mps = await readMpsMetadata(project.path);
              if (!mpsId) throw new Error('MPS ID is required');
              const botId = String(body.botId || runtimeConfig.botId || '').trim();
              const bot = creator.bots.find(item => item.id === botId);
              result = await deploymentRequest('/api/cloud/deployments', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ node_id: body.nodeId, project_id: project.path.split(/[\\/]/).filter(Boolean).pop(), bot_id: botId, bot_name: bot?.name || '', mps_id: mpsId, mps_name: mps.name, mps_version: mps.version }) });
              break;
            }
            case '/api/webapp/address':
              if (run) throw new Error('请先停止智能体，再修改 WebApp 访问地址');
              webAppHostname = validateWebAppHostname(String(body.host || ''));
              result = { host: webAppHostname }; break;
            case '/api/run/start': result = await launch(body); break;
            case '/api/run/stop': result = await stopRun(true); break;
            case '/api/run/slots/refresh':
              if (!run || body.runId !== run.runId) throw new Error('运行已变化，请刷新后重试');
              await refreshSlots(); result = slotState; break;
            case '/api/run/slots/bind':
              if (!run || body.runId !== run.runId) throw new Error('运行已变化，请刷新后重试');
              clearTimeout(slotTimer);
              if (slotPending) await slotPending;
              clearTimeout(slotTimer);
              try {
                await creator.bindBotSlot(runtimeConfig.botToken, body.slotId, body.deviceId);
              } finally {
                await refreshSlots();
              }
              result = slotState; break;
            case '/api/run/device':
              if (!run) throw new Error('尚未开始调试');
              result = await run.launches.bindings.run(body.bindingId); break;
            case '/api/run/rerun':
              if (!run) throw new Error('尚未开始调试');
              result = await run.launches.rerun(body.launchId); break;
            case '/api/run/mpy/again':
              if (!run) throw new Error('尚未开始调试');
              result = await run.launches.runMpyAgain(body.launchId); break;
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
      let safe = message;
      for (const secret of [creator.session?.token, runtimeConfig.botToken, ...creator.botTokens.values()]) {
        if (secret) safe = safe.replaceAll(secret, '[REDACTED]');
      }
      if (!res.headersSent) reply(res, 400, { error: safe }); else res.destroy();
    }
  });
  const allowed = new Set(), origins = new Set();
  // Cloud deployment packages the project locally and may wait for remote
  // SSH, Docker build, and Caddy configuration. Keep the management request
  // alive long enough for that asynchronous deployment to complete.
  server.requestTimeout = 10 * 60 * 1000;
  server.headersTimeout = 10 * 60 * 1000;
  await new Promise((done, reject) => { server.once('error', reject); server.listen(options.port ?? 8787, '127.0.0.1', done); });
  const port = server.address().port;
  for (const host of ['127.0.0.1', 'localhost']) { allowed.add(host + ':' + port); origins.add('http://' + host + ':' + port); }
  async function close() { stopped = true; await stopRun(); creator.session = null; creator.botTokens.clear(); creator.bots = []; await gateway.close(); await new Promise(done => { server.close(done); server.closeAllConnections(); }); }
  return { server, port, gatewayPort: gateway.port, deploymentServiceUrl, studioUrl: 'http://127.0.0.1:' + port + '/#studioToken=' + credential, close };
}
