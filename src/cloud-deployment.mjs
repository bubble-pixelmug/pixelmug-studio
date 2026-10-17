import { access, cp, mkdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { dirname, join, relative, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { spawn } from 'node:child_process';

const DOCKERFILE = `FROM node:20-bookworm-slim
WORKDIR /app
ENV NODE_ENV=production
COPY package.json package-lock.json* ./
RUN npm ci --omit=dev --ignore-scripts
COPY . .
RUN if [ -f webapp/package.json ]; then npm --prefix webapp ci --ignore-scripts; if node -e "process.exit(require('./webapp/package.json').scripts?.build ? 0 : 1)"; then npm --prefix webapp run build; fi; fi
EXPOSE 8799
CMD ["node", "bot/index.js"]
`;

export async function readMpsMetadata(projectPath) {
  const file = join(projectPath, 'mpy', 'mps.json');
  const data = JSON.parse(await readFile(file, 'utf8'));
  if (!data.name || !data.version) throw new Error('mpy/mps.json must contain name and version');
  return { name: String(data.name), version: String(data.version) };
}

export async function createProjectArchive({ projectPath, projectId, releaseId }) {
  const source = resolve(projectPath);
  const packageJson = JSON.parse(await readFile(join(source, 'package.json'), 'utf8'));
  if (!packageJson.dependencies?.['@jeejio-bubble/bot']) throw new Error('package.json must declare @jeejio-bubble/bot');
  await access(join(source, 'bot', 'index.js'));
  const staging = await mkdir(join(tmpdir(), `pixelmug-deploy-${Date.now()}-${Math.random().toString(16).slice(2)}`), { recursive: true });
  const output = join(tmpdir(), `pixelmug-release-${Date.now()}-${Math.random().toString(16).slice(2)}.tar.gz`);
  const excluded = new Set(['mpy', 'node_modules', '.git', '.env', 'Dockerfile', 'Caddyfile', 'project-manifest.json', 'bubble-mps.json']);
  try {
    await cp(source, staging, { recursive: true, filter(entry) {
      const name = relative(source, entry).replaceAll('\\\\', '/');
      if (!name) return true;
      return !excluded.has(name) && !name.startsWith('.env.') && !name.endsWith('.log') && name !== 'webapp/dist' && !name.startsWith('webapp/dist/');
    }});
    const webappPackage = await canRead(join(staging, 'webapp', 'package.json')) ? JSON.parse(await readFile(join(staging, 'webapp', 'package.json'), 'utf8')) : null;
    const manifest = { manifest_version: 1, node_version: '20', package_manager: 'npm', install_command: 'npm ci --ignore-scripts', build_command: packageJson.scripts?.build || (webappPackage?.scripts?.build ? 'npm --prefix webapp run build' : null), start_command: 'node bot/index.js', webapp_directory: webappPackage?.scripts?.build ? 'webapp/dist' : (webappPackage ? 'webapp' : null), requires_package_lock: true, allow_install_scripts: false, dependencies: packageJson.dependencies || {} };
    const bubbleMps = { config_version: 1, project_id: projectId, release_id: releaseId, runtime_environment: { api_base_url: 'BOT_API_BASE_URL', bot_token: 'BOT_TOKEN', webapp_url: 'STUDIO_WEBAPP_URL', mps_id: 'STUDIO_MPS_ID', mps_version: 'STUDIO_MPS_VERSION' } };
    await writeFile(join(staging, 'project-manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
    await writeFile(join(staging, 'bubble-mps.json'), JSON.stringify(bubbleMps, null, 2) + '\n');
    await writeFile(join(staging, 'Dockerfile'), DOCKERFILE);
    await run('tar', ['-czf', output, '-C', staging, '.']);
    return { path: output, size: (await stat(output)).size, cleanup: async () => { await rm(output, { force: true }); await rm(staging, { recursive: true, force: true }); } };
  } catch (error) { await rm(output, { force: true }).catch(() => {}); await rm(staging, { recursive: true, force: true }).catch(() => {}); throw error; }
}
async function canRead(path) { try { await access(path); return true; } catch { return false; } }
function run(command, args) { return new Promise((resolvePromise, reject) => { const child = spawn(command, args, { windowsHide: true }); let stderr = ''; child.stderr.on('data', chunk => { stderr += chunk; }); child.once('error', reject); child.once('exit', code => code === 0 ? resolvePromise() : reject(new Error(`${command} exited with code ${code}: ${stderr.trim()}`))); }); }
