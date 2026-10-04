import { build, normalizePath } from 'vite';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { readdir } from 'node:fs/promises';

const studioImporter = fileURLToPath(new URL('../package.json', import.meta.url));
const runtimeRoot = fileURLToPath(new URL('./runtime/', import.meta.url));

export async function buildWebApp(source, output) {
  try {
    const inputs = [];
    async function findPages(folder) {
      for (const entry of await readdir(folder, { withFileTypes: true })) {
        if (entry.name.startsWith('.') || ['node_modules', 'dist', 'public'].includes(entry.name)) continue;
        const path = join(folder, entry.name);
        if (entry.isDirectory()) await findPages(path);
        else if (entry.isFile() && entry.name.endsWith('.html')) inputs.push(path);
      }
    }
    await findPages(source);
    await build({
      configFile: false,
      root: source,
      base: './',
      publicDir: 'public',
      logLevel: 'error',
      plugins: [{
        name: 'studio-webapp-dependencies',
        enforce: 'pre',
        transformIndexHtml: {
          order: 'pre',
          handler: html => /<script\b[^>]*type\s*=\s*["']module["']/i.test(html) ? [
            { tag: 'script', attrs: { src: '/studio-debug-config.js' }, injectTo: 'head-prepend' },
            { tag: 'script', attrs: { type: 'module', src: '/@studio-bootstrap' }, injectTo: 'head' },
          ] : [],
        },
        async resolveId(id, importer) {
          if (id === '/@studio-bootstrap') return '\0studio-bootstrap';
          // Keep older applications working while new ones use npm imports.
          if (id.startsWith('/sdk/')) id = '@jeejio-bubble/bot/sdk/' + id.slice(5);
          if (id.startsWith('/bubble-sdk/')) id = '@jeejio-bubble/bot/' + id.slice(12);
          if (id.startsWith('/studio-runtime/')) return normalizePath(join(runtimeRoot, id.slice(16)));
          if (id.startsWith('@jeejio-bubble/bot')) {
            // Use the same SDK installed with Studio as the Bot runtime.
            return this.resolve(id, studioImporter, { skipSelf: true });
          }
          if (!id.startsWith('.') && !id.startsWith('/') && !id.includes(':')) {
            return await this.resolve(id, importer, { skipSelf: true }) ||
              this.resolve(id, studioImporter, { skipSelf: true });
          }
        },
        load(id) {
          if (id === '\0studio-bootstrap') return `import { enableStudioDebugFromPage } from ${JSON.stringify(normalizePath(join(runtimeRoot, 'StudioDebugWeb.js')))}; enableStudioDebugFromPage();`;
        },
      }],
      build: { target: ['chrome89', 'safari15'], outDir: output, emptyOutDir: true, sourcemap: false,
        rollupOptions: { input: inputs.length ? inputs : join(source, 'index.html') } },
    });
    return output;
  } catch (error) {
    throw new Error(`WebApp 构建失败：${error.message}`, { cause: error });
  }
}
