import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import { createServer } from 'node:http';
import { extname, join, normalize, relative, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const appEntry = process.env.PIXELMUG_APP_ENTRY || '/app/bot/index.js';
const webRoot = process.env.PIXELMUG_WEBAPP_ROOT || '/app/webapp/dist';
const webPort = Number(process.env.WEBAPP_PORT || 8799);

if (!appEntry) throw new Error('PIXELMUG_APP_ENTRY is required');
const staticServer = process.env.SERVE_WEBAPP === 'true' && webRoot && await isDirectory(resolve(webRoot))
  ? await startStaticServer(resolve(webRoot), webPort)
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

async function startStaticServer(root, port) {
  const server = createServer(async (req, res) => {
    try {
      const requestUrl = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`);
      const pathname = requestUrl.pathname === '/' ? '/index.html' : requestUrl.pathname;
      const filePath = normalize(join(root, decodeURIComponent(pathname)));
      const rel = relative(root, filePath);
      if (rel.startsWith('..') || rel.includes(':')) return send(res, 403, 'Forbidden');
      const info = await stat(filePath);
      if (!info.isFile()) return send(res, 404, 'Not found');
      res.writeHead(200, { 'content-type': contentType(filePath), 'cache-control': 'no-store' });
      createReadStream(filePath).pipe(res);
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
    default: return 'application/octet-stream';
  }
}
