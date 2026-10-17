import { access, mkdir, readFile, readdir, stat, writeFile } from 'node:fs/promises';
import { join, relative, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { randomUUID } from 'node:crypto';

const NAME_RE = /^[a-z0-9._-]+$/;
const SEMVER_RE = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:[-+][0-9A-Za-z.-]+)?$/;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const EXCLUDE_DIRS = new Set(['dist', '.git', '.svn', '.hg', '__pycache__']);
const EXCLUDE_FILES = new Set(['.DS_Store', 'Thumbs.db']);

export async function createMpsArchive(projectPath) {
  const root = resolve(projectPath);
  const mpyRoot = join(root, 'mpy');
  const metaPath = join(mpyRoot, 'mps.json');
  await access(join(mpyRoot, '__main__.py'));
  const meta = JSON.parse(await readFile(metaPath, 'utf8'));
  const { name, version, changed } = normalizeMetadata(meta);
  if (changed) await writeFile(metaPath, JSON.stringify(meta, null, 2) + '\n', 'utf8');

  const topdir = `${name}-${version}`;
  const fileName = `${topdir}.mps`;
  const output = join(tmpdir(), `pixelmug-mps-${randomUUID()}.mps`);
  const files = await collectFiles(mpyRoot, fileName);
  const archive = buildZipStore(files, topdir);
  await writeFile(output, archive);
  return { path: output, fileName, size: archive.length, name, version, cleanup: async () => {
    const { rm } = await import('node:fs/promises');
    await rm(output, { force: true });
  } };
}

function normalizeMetadata(meta) {
  if (!meta || typeof meta !== 'object' || Array.isArray(meta)) throw new Error('mps.json must be a JSON object');
  let changed = false;
  const name = String(meta.name || '').trim();
  const version = String(meta.version || '').trim();
  if (!name) throw new Error('mps.json name is required');
  if (!version) throw new Error('mps.json version is required');
  if (name.length > 64 || !NAME_RE.test(name)) throw new Error('mps.json name must match [a-z0-9._-]+ and be at most 64 characters');
  if (version.length > 32 || !SEMVER_RE.test(version)) throw new Error(`mps.json version must be semver: ${version}`);
  for (const key of ['description', 'author', 'category']) if (meta[key] != null && typeof meta[key] !== 'string') throw new Error(`mps.json ${key} must be a string`);
  if (meta.date == null || (typeof meta.date === 'string' && (!meta.date.trim() || meta.date.trim() === 'yyyy-mm-dd'))) {
    meta.date = new Date().toISOString().slice(0, 10); changed = true;
  } else if (typeof meta.date !== 'string' || !DATE_RE.test(meta.date.trim())) throw new Error('mps.json date must be YYYY-MM-DD');
  if (meta.name !== name) { meta.name = name; changed = true; }
  if (meta.version !== version) { meta.version = version; changed = true; }
  if (meta.dependencies != null) {
    if (!Array.isArray(meta.dependencies)) throw new Error('mps.json dependencies must be an array');
    for (const [index, dep] of meta.dependencies.entries()) {
      if (!dep || typeof dep !== 'object' || !String(dep.name || '').trim() || !String(dep.version || '').trim()) throw new Error(`mps.json dependencies[${index}] is invalid`);
      const depName = String(dep.name).trim(), depVersion = String(dep.version).trim();
      if (dep.name !== depName) { dep.name = depName; changed = true; }
      if (dep.version !== depVersion) { dep.version = depVersion; changed = true; }
    }
  }
  return { name, version, changed };
}

async function collectFiles(root, outputName) {
  const result = [];
  async function visit(dir) {
    for (const entry of await readdir(dir, { withFileTypes: true })) {
      const full = join(dir, entry.name), rel = relative(root, full).replaceAll('\\', '/');
      const parts = rel.split('/');
      if (parts.some(part => EXCLUDE_DIRS.has(part)) || EXCLUDE_FILES.has(entry.name) || entry.name.endsWith('.pyc') || entry.name === outputName) continue;
      if (entry.isDirectory()) await visit(full);
      else if (entry.isFile()) result.push({ name: rel, data: await readFile(full) });
    }
  }
  await visit(root);
  return result.sort((a, b) => a.name.localeCompare(b.name));
}

function buildZipStore(files, topdir) {
  const local = [], central = [];
  let offset = 0;
  for (const file of files) {
    const name = `${topdir}/${file.name}`;
    if (name.startsWith('/') || name.split('/').includes('..')) throw new Error(`Unsafe MPS path: ${name}`);
    const nameBytes = Buffer.from(name, 'utf8'), crc = crc32(file.data), size = file.data.length;
    const header = Buffer.alloc(30 + nameBytes.length);
    header.writeUInt32LE(0x04034b50, 0); header.writeUInt16LE(20, 4); header.writeUInt16LE(0, 6);
    header.writeUInt16LE(0, 8); header.writeUInt16LE(0, 10); header.writeUInt16LE(0, 12);
    header.writeUInt32LE(crc, 14); header.writeUInt32LE(size, 18); header.writeUInt32LE(size, 22);
    header.writeUInt16LE(nameBytes.length, 26); header.writeUInt16LE(0, 28); nameBytes.copy(header, 30);
    local.push(header, file.data);
    const record = Buffer.alloc(46 + nameBytes.length);
    record.writeUInt32LE(0x02014b50, 0); record.writeUInt16LE(20, 4); record.writeUInt16LE(20, 6); record.writeUInt16LE(0, 8);
    record.writeUInt16LE(0, 10); record.writeUInt16LE(0, 12); record.writeUInt16LE(0, 14); record.writeUInt32LE(crc, 16);
    record.writeUInt32LE(size, 20); record.writeUInt32LE(size, 24); record.writeUInt16LE(nameBytes.length, 28);
    record.writeUInt16LE(0, 30); record.writeUInt16LE(0, 32); record.writeUInt16LE(0, 34); record.writeUInt16LE(0, 36);
    record.writeUInt32LE(0, 38); record.writeUInt32LE(offset, 42); nameBytes.copy(record, 46); central.push(record);
    offset += header.length + size;
  }
  const centralData = Buffer.concat(central), end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0); end.writeUInt16LE(0, 4); end.writeUInt16LE(0, 6); end.writeUInt16LE(files.length, 8);
  end.writeUInt16LE(files.length, 10); end.writeUInt32LE(centralData.length, 12); end.writeUInt32LE(offset, 16); end.writeUInt16LE(0, 20);
  return Buffer.concat([...local, centralData, end]);
}

function crc32(buffer) {
  let crc = 0xffffffff;
  for (const byte of buffer) { crc ^= byte; for (let i = 0; i < 8; i++) crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1)); }
  return (crc ^ 0xffffffff) >>> 0;
}
