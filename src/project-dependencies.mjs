import { access, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { spawn } from 'node:child_process';

const BOT_PACKAGE = '@jeejio-bubble/bot';

export async function prepareProjectDependencies(project, webRoot) {
  await preparePackageRoot(project, 'Bot');
  if (webRoot) await preparePackageRoot(webRoot, 'WebApp');
}

export async function readPackageManifest(root, label = '项目') {
  let manifest;
  try { manifest = JSON.parse(await readFile(join(root, 'package.json'), 'utf8')); }
  catch { throw new Error(`${label}缺少有效的 package.json`); }
  if (!manifest || typeof manifest !== 'object' || Array.isArray(manifest)) throw new Error(`${label}的 package.json 必须是 JSON 对象`);
  if (!manifest.dependencies?.[BOT_PACKAGE]) throw new Error(`${label}的 package.json 必须明确声明 ${BOT_PACKAGE}`);
  try { await access(join(root, 'package-lock.json')); }
  catch { throw new Error(`${label}缺少 package-lock.json，请先在该目录执行 npm install 并提交 lock 文件`); }
  return manifest;
}

async function preparePackageRoot(root, label) {
  await readPackageManifest(root, label);
  await runNpm(root, ['ci', '--ignore-scripts', '--no-audit', '--no-fund'], label);
}

function runNpm(cwd, args, label) {
  const command = 'npm';
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { cwd, shell: process.platform === 'win32', windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
    let output = '';
    child.stdout.on('data', chunk => { output += chunk; });
    child.stderr.on('data', chunk => { output += chunk; });
    child.once('error', error => reject(new Error(`${label}依赖安装失败：${error.message}`)));
    child.once('exit', code => code === 0 ? resolve() : reject(new Error(`${label}依赖安装失败（npm ci exit=${code}）：${output.trim().slice(-4000)}`)));
  });
}
