import { readFileSync } from 'node:fs';
import { request } from 'node:http';
import { join } from 'node:path';

export function projectBotHttp(project) {
  let manifest;
  try {
    manifest = JSON.parse(readFileSync(join(project, 'package.json'), 'utf8'));
  } catch (error) {
    if (error.code === 'ENOENT') return null;
    throw error;
  }
  return createBotHttp(manifest.pixelmug, Number(process.env.POLLING_PORT || 8817));
}

export function createBotHttp(pixelmug, port) {
  const routes = pixelmug?.botHttpRoutes;
  const prefixes = Object.entries(pixelmug?.botHttpRoutePrefixes ?? {});
  if (!routes && !prefixes.length) return null;
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('Invalid Bot HTTP port');
  const methods = new Set(['GET', 'HEAD', 'POST']);
  for (const [prefix, allowed] of prefixes) {
    if (!prefix.startsWith('/mps/') || prefix === '/mps/' || !prefix.endsWith('/') ||
        new URL(prefix, 'http://localhost').pathname !== prefix ||
        !Array.isArray(allowed) || !allowed.length || allowed.some(method => !methods.has(method))) {
      throw new Error('Invalid pixelmug.botHttpRoutePrefixes entry: ' + prefix);
    }
  }

  function matches(url, method) {
    const path = url.pathname;
    if (!path.startsWith('/mps/') || !methods.has(method)) return false;
    if (routes && Object.hasOwn(routes, path)) return routes[path] === method;
    return prefixes.some(([prefix, allowed]) =>
      path.length > prefix.length && path.startsWith(prefix) && allowed.includes(method));
  }

  function forward(req, res, url) {
    const headers = { ...req.headers, host: '127.0.0.1:' + port };
    delete headers.connection;
    const upstream = request({
      hostname: '127.0.0.1', port, method: req.method, path: url.pathname + url.search, headers,
    }, (response) => {
      const vary = res.getHeader('vary');
      if (vary && response.headers.vary) response.headers.vary += ', ' + vary;
      res.writeHead(response.statusCode || 502, response.headers);
      response.pipe(res);
      response.on('error', () => res.destroy());
    });
    upstream.setTimeout(10000, () => upstream.destroy());
    upstream.on('error', () => {
      if (res.headersSent) return res.destroy();
      res.writeHead(502, { 'content-type': 'application/json', 'cache-control': 'no-store' });
      res.end(JSON.stringify({ ok: false, error: 'bot_http_unavailable' }));
    });
    res.once('close', () => { if (!res.writableEnded) upstream.destroy(); });
    req.pipe(upstream);
  }

  return { matches, forward };
}
