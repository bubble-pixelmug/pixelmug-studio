import { access, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { spawn } from 'node:child_process';

const BOT_PACKAGE = '@jeejio-bubble/bot';

export async function prepareProjectDependencies(project, webRoot) {
  await preparePackageRoot(project, 'Bot');
  if (webRoot) await preparePackageRoot(webRoot, 'WebApp');
}

export async function readPackageManifest(root, label = 'Project') {
  let manifest;
  try {
    manifest = JSON.parse(await readFile(join(root, 'package.json'), 'utf8'));
  } catch {
    throw new Error(`${label} is missing a valid package.json`);
  }
  if (!manifest || typeof manifest !== 'object' || Array.isArray(manifest)) {
    throw new Error(`${label} package.json must contain a JSON object`);
  }
  if (!manifest.dependencies?.[BOT_PACKAGE]) {
    throw new Error(`${label} package.json must explicitly declare ${BOT_PACKAGE}`);
  }
  return manifest;
}

async function preparePackageRoot(root, label) {
  await readPackageManifest(root, label);

  // Studio owns the local setup. Generate the lock file once when a project
  // does not have one yet, then use the deterministic clean-install path.
  if (!await hasFile(join(root, 'package-lock.json'))) {
    await runNpm(root, ['install', '--ignore-scripts', '--no-audit', '--no-fund'], label, 'install');
  }
  if (!await hasFile(join(root, 'package-lock.json'))) {
    throw new Error(`${label} dependency installation did not create package-lock.json`);
  }
  await runNpm(root, ['ci', '--ignore-scripts', '--no-audit', '--no-fund'], label, 'ci');
}

async function hasFile(path) {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

function runNpm(cwd, args, label, operation) {
  const command = process.platform === 'win32' ? (process.env.ComSpec || 'cmd.exe') : 'npm';
  const commandArgs = process.platform === 'win32'
    ? ['/d', '/s', '/c', ['npm.cmd', ...args].join(' ')]
    : args;
  return new Promise((resolve, reject) => {
    const child = spawn(command, commandArgs, { cwd, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
    let output = '';
    child.stdout.on('data', chunk => { output += chunk; });
    child.stderr.on('data', chunk => { output += chunk; });
    child.once('error', error => reject(new Error(`${label} dependency ${operation} failed: ${error.message}`)));
    child.once('exit', code => code === 0
      ? resolve()
      : reject(new Error(`${label} dependency ${operation} failed (npm ${operation} exit=${code}): ${output.trim().slice(-4000)}`)));
  });
}
