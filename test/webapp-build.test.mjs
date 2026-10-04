import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, rm, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { init, parse } from 'es-module-lexer/minimal';
import { startStudio } from '../src/receiver.mjs';
import { startWebAppGateway } from '../src/gateway.mjs';

test('npm WebApp builds outside the workspace tree, serves through gateway and rebuilds on restart', async t => {
  const project = await mkdtemp(join(tmpdir(), 'studio-build-'));
  t.after(() => rm(project, { recursive: true, force: true }));
  await mkdir(join(project, 'webapp'));
  const entry = join(project, 'webapp', 'main.js');
  await writeFile(join(project, 'webapp', 'index.html'), '<html><head></head><body><script type="module" src="./main.js"></script></body></html>');
  const source = value => `import { BubbleWebApp } from '@jeejio-bubble/bot/sdk/WebApp.js';
    import PixelMug from '@jeejio-bubble/bot/devices/pixelmug/ext';
    import PixelMugS1 from '@jeejio-bubble/bot/devices/pixelmug-s1/ext';
    globalThis.example = [BubbleWebApp, new PixelMug(), new PixelMugS1(), '${value}'];`;
  const gateway = await startWebAppGateway({ port: 0, bind: '127.0.0.1', mdns: false });
  t.after(() => gateway.close());
  await init();
  const scripts = [];
  for (const value of ['first-build', 'second-build']) {
    await writeFile(entry, source(value));
    const run = await startStudio({ project, webRoot: 'webapp', port: 0, bind: '127.0.0.1' });
    try {
      gateway.activate(project, run);
      const url = gateway.webAppUrl(project, '127.0.0.1');
      const html = await (await fetch(url)).text();
      const script = html.match(/type="module"[^>]*src="([^"]+)"/)[1];
      scripts.push(script);
      const visited = new Set();
      async function visit(url) {
        if (visited.has(url)) return '';
        visited.add(url);
        const response = await fetch(url);
        assert.equal(response.status, 200, url);
        const code = await response.text();
        assert.doesNotMatch(code, /talShowImage|talShowSyncImage|imageUrlToTalPlayRGBBitmap|@napi-rs\/canvas|ali-oss/);
        const [imports] = parse(code);
        for (const item of imports) {
          if (item.d === -2) continue;
          assert.ok(item.n?.startsWith('.'), item.n);
          await visit(new URL(item.n, url).href);
        }
        return code;
      }
      const code = await visit(new URL(script, url).href);
      assert.ok(code.includes(value));
      assert.ok(code.includes('system.studio.prepareMps'), 'launch adapter is bundled');
      assert.ok(!code.includes('/bubble-sdk/'));
      assert.equal(await readFile(entry, 'utf8'), source(value));
    } finally { gateway.deactivate(run); await run.close(); }
  }
  assert.notEqual(scripts[0], scripts[1]);
  await writeFile(entry, "import { missing } from 'missing-package-for-build-test'; console.log(missing);");
  await assert.rejects(startStudio({ project, webRoot: 'webapp', port: 0 }), /WebApp 构建失败/);
});
