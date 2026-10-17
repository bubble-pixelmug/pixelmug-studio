import { access, cp, mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import { join, relative, resolve } from 'node:path';
import { spawn } from 'node:child_process';

export async function buildWebApp(source, output) {
  const root = resolve(source);
  const manifest = await readManifest(root);
  if (!manifest.scripts?.build) throw new Error('WebApp 的 package.json 必须定义 build script');
  const configuredOutput = manifest.pixelmug?.outputDir || manifest.pixelmug?.webapp?.outputDir;
  await runNpm(root, ['run', 'build'], 'WebApp 构建');
  const outputDir = resolve(root, configuredOutput || await firstExistingOutput(root));
  await access(outputDir).catch(() => { throw new Error(`WebApp 构建完成，但找不到输出目录：${relative(root, outputDir)}`); });
  await mkdir(output, { recursive: true });
  await cp(outputDir, output, { recursive: true, force: true });
  await injectDebugBootstrap(output);
  return output;
}

async function readManifest(root) {
  try { return JSON.parse(await readFile(join(root, 'package.json'), 'utf8')); }
  catch { throw new Error('WebApp 缺少有效的 package.json'); }
}

async function firstExistingOutput(root) {
  for (const candidate of ['dist', 'build']) if (await exists(join(root, candidate))) return candidate;
  throw new Error('WebApp 构建完成，但没有找到 dist 或 build 输出目录；请在 package.json 中配置 pixelmug.outputDir');
}

async function injectDebugBootstrap(folder) {
  for (const entry of await readdir(folder, { withFileTypes: true })) {
    const path = join(folder, entry.name);
    if (entry.isDirectory()) await injectDebugBootstrap(path);
    else if (entry.isFile() && entry.name.endsWith('.html')) {
      const html = await readFile(path, 'utf8');
      if (!/<script[^>]+studio-debug-config\.js/i.test(html)) {
        const scripts = '<script src="/studio-debug-config.js"></script><script type="module" src="/@studio-bootstrap"></script>';
        await writeFile(path, html.includes('</head>') ? html.replace('</head>', scripts + '</head>') : scripts + html);
      }
    }
  }
}

async function exists(path) { try { await access(path); return true; } catch { return false; } }

function runNpm(cwd, args, label) {
  const command = 'npm';
  return new Promise((resolvePromise, reject) => {
    const child = spawn(command, args, { cwd, shell: process.platform === 'win32', windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
    let output = '';
    child.stdout.on('data', chunk => { output += chunk; });
    child.stderr.on('data', chunk => { output += chunk; });
    child.once('error', error => reject(new Error(`${label}失败：${error.message}`)));
    child.once('exit', code => code === 0 ? resolvePromise() : reject(new Error(`${label}失败（npm exit=${code}）：${output.trim().slice(-4000)}`)));
  });
}
