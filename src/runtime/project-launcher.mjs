import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import { createServer } from 'node:http';
import { projectBotHttp } from './bot-http.mjs';
import { extname, join, normalize, relative, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const appEntry = process.env.PIXELMUG_APP_ENTRY || '/app/bot/index.js';
const webRoot = process.env.PIXELMUG_WEBAPP_ROOT || '/app/webapp/dist';
const webPort = Number(process.env.WEBAPP_PORT || 8799);

if (!appEntry) throw new Error('PIXELMUG_APP_ENTRY is required');
const staticServer = process.env.SERVE_WEBAPP === 'true' && webRoot && await isDirectory(resolve(webRoot))
  ? await startStaticServer(resolve(webRoot), webPort, projectBotHttp(process.cwd()))
  : null;

try {
  await import(pathToFileURL(resolve(appEntry)).href);
} catch (error) {
  staticServer?.close();
  throw error;
}

async function isDirectory(path) {
  try { return (await stat(path)).isDirectory(); } catch { return false; }
}

async function startStaticServer(root, port, botHttp) {
  const server = createServer(async (req, res) => {
    try {
      const requestUrl = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`);
      if (botHttp?.matches(requestUrl, req.method)) return botHttp.forward(req, res, requestUrl);
      const pathname = requestUrl.pathname === '/' ? '/index.html' : requestUrl.pathname;
      const filePath = normalize(join(root, decodeURIComponent(pathname)));
      const rel = relative(root, filePath);
      if (rel.startsWith('..') || rel.includes(':')) return send(res, 403, 'Forbidden');
      const info = await stat(filePath);
      if (!info.isFile()) return send(res, 404, 'Not found');
      const headers = {
        'content-type': contentType(filePath),
        'cache-control': 'no-store',
        'accept-ranges': 'bytes',
      };
      const range = parseRange(req.headers.range, info.size);
      if (range) {
        headers['content-range'] = `bytes ${range.start}-${range.end}/${info.size}`;
        headers['content-length'] = String(range.end - range.start + 1);
        res.writeHead(206, headers);
        if (req.method !== 'HEAD') createReadStream(filePath, { start: range.start, end: range.end }).pipe(res);
        else res.end();
        return;
      }
      headers['content-length'] = String(info.size);
      res.writeHead(200, headers);
      if (req.method !== 'HEAD') createReadStream(filePath).pipe(res);
      else res.end();
    } catch (error) {
      send(res, 404, error?.code === 'ENOENT' ? 'Build not found.' : 'Not found');
    }
  });
  await new Promise((resolvePromise, reject) => {
    server.once('error', reject);
    server.listen(port, '0.0.0.0', () => {
      server.off('error', reject);
      console.log(`Studio runtime WebApp server listening on http://0.0.0.0:${port}`);
      resolvePromise(server);
    });
  });
  return server;
}

function parseRange(value, size) {
  const match = String(value || '').match(/^bytes=(\d*)-(\d*)$/);
  if (!match) return null;
  let start = match[1] ? Number(match[1]) : Math.max(0, size - Number(match[2] || 0));
  let end = match[2] ? Number(match[2]) : size - 1;
  if (!Number.isInteger(start) || !Number.isInteger(end) || start < 0 || end < start || start >= size) return null;
  end = Math.min(end, size - 1);
  return { start, end };
}

function send(res, status, body) {
  res.writeHead(status, { 'content-type': 'text/plain; charset=utf-8' });
  res.end(body);
}

function contentType(filePath) {
  switch (extname(filePath)) {
    case '.html': return 'text/html; charset=utf-8';
    case '.js': return 'text/javascript; charset=utf-8';
    case '.css': return 'text/css; charset=utf-8';
    case '.json': return 'application/json';
    case '.svg': return 'image/svg+xml';
    case '.png': return 'image/png';
    case '.jpg':
    case '.jpeg': return 'image/jpeg';
    case '.mp4':
    case '.m4v': return 'video/mp4';
    case '.webm': return 'video/webm';
    default: return 'application/octet-stream';
  }
}
