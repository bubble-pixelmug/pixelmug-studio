import { readdir, readFile, lstat, realpath } from "node:fs/promises";
import { join, basename, posix } from "node:path";
import { createHash } from "node:crypto";
export const RESERVED = new Set(["boot.py", "webrepl_cfg.py", "__studio_bootstrap__.py"]);
export const CLEAN = `import os
os.chdir("/")
for protected in ("boot.py", "webrepl_cfg.py"):
    if not (os.stat("/" + protected)[0] & 0x8000):
        raise RuntimeError("REPL startup file missing: " + protected)
def _studio_remove(path):
    if os.stat(path)[0] & 0x4000:
        for child in os.listdir(path):
            _studio_remove(path + "/" + child)
        os.rmdir(path)
    else:
        os.remove(path)
for name in os.listdir("/"):
    if name not in ("boot.py", "webrepl_cfg.py"):
        _studio_remove("/" + name)
del _studio_remove
print("STUDIO_CLEAN_OK")
`;
export async function snapshotProject(project) {
  const root = join(project, "mpy");
  if ((await lstat(root)).isSymbolicLink()) throw new Error("mpy must not be a symlink");
  await realpath(root);
  const files = [], directories = [], hash = createHash("sha256");
  let total = 0;
  async function walk(dir, prefix = "") {
    for (const entry of (await readdir(dir, { withFileTypes: true })).sort((a,b) => a.name.localeCompare(b.name))) {
      if (!prefix && entry.name === "dist" && entry.isDirectory()) continue;
      const name = prefix + entry.name;
      if (/[\\:*?"<>|\x00-\x1f]/.test(entry.name)) throw new Error("Invalid FAT filename: " + name);
      if (entry.isSymbolicLink()) throw new Error("Symlinks are not supported: " + name);
      if (Buffer.byteLength(entry.name) > 63) throw new Error("Filename exceeds WebREPL limit: " + name);
      if (!prefix && RESERVED.has(entry.name.toLowerCase())) throw new Error("Reserved device filename: " + name);
      if (entry.isDirectory()) {
        if (directories.length >= 2000) throw new Error("Too many directories");
        directories.push(name); hash.update("dir:" + name + "\0");
        await walk(join(dir, entry.name), name + "/");
      }
      else if (entry.isFile()) {
        const path = join(dir, entry.name), before = await lstat(path);
        if (!before.isFile() || before.isSymbolicLink()) throw new Error("Source type changed: " + name);
        if (before.size + total > 32 * 1024 * 1024 || files.length >= 2000) throw new Error("Project exceeds 32 MB / 2000 files");
        const bytes = await readFile(path), after = await lstat(path);
        if (before.mtimeMs !== after.mtimeMs || before.size !== bytes.length) throw new Error("Source changed during snapshot: " + name);
        total += bytes.length;
        if (total > 32 * 1024 * 1024 || files.length >= 2000) throw new Error("Project exceeds 32 MB / 2000 files");
        hash.update(name + "\0" + bytes.length + "\0"); hash.update(bytes);
        files.push({ name, bytes });
      } else throw new Error("Unsupported file: " + name);
    }
  }
  await walk(root);
  if (new Set(files.map(f => f.name.toLowerCase())).size !== files.length) throw new Error("Case-insensitive filename collision");
  if (!files.some(file => file.name === "__main__.py")) throw new Error("mpy/__main__.py is required");
  return { files, directories, fingerprint: hash.digest("hex"), total };
}
export async function deploy(repl, snapshot, progress) {
  await repl.exec("exec(" + JSON.stringify(CLEAN) + ")");
  const bootstrap = await readFile(new URL("./device-bootstrap.py", import.meta.url));
  for (const directory of snapshot.directories || []) {
    await repl.exec("import os; os.mkdir(" + JSON.stringify("/" + directory) + ")");
  }
  const files = [...snapshot.files, { name: "__studio_bootstrap__.py", bytes: bootstrap }];
  for (let index = 0; index < files.length; index++) {
    const { name, bytes } = files[index];
    const dir = posix.dirname("/" + name);
    const setup = `import os
os.chdir("/")
path = ""
for part in ${JSON.stringify(dir)}.split("/"):
    if part:
        path += "/" + part
        try:
            os.mkdir(path)
        except OSError:
            if not (os.stat(path)[0] & 0x4000):
                raise
os.chdir(${JSON.stringify(dir)})
`;
    await repl.exec("exec(" + JSON.stringify(setup) + ")");
    await repl.putFile(basename(name), bytes);
    const result = await repl.exec("import os; print(os.stat(" + JSON.stringify("/" + name) + ")[6])");
    if (Number(result.trim()) !== bytes.length) throw new Error("File size mismatch: " + name);
    progress({ file: name, index: index + 1, total: files.length });
  }
  await repl.exec('import os; os.chdir("/")');
}

