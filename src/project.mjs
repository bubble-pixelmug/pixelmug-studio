import { readFile, realpath, stat } from "node:fs/promises";
import { extname, isAbsolute, join, relative, resolve } from "node:path";

const BOT_ENTRY_CANDIDATES = [
  "bot/index.js", "bot/index.mjs", "bot/index.cjs",
  "bot/main.js", "bot/main.mjs", "bot/main.cjs",
  "bot/bot.js", "bot/bot.mjs", "bot/bot.cjs",
];

function isInside(root, target) {
  const value = relative(root, target);
  return value !== "" && !value.startsWith("..") && !isAbsolute(value);
}

async function directory(root, name, required) {
  const expected = join(root, name);
  try {
    const full = await realpath(expected);
    if (!isInside(root, full) || !(await stat(full)).isDirectory()) throw new Error(`项目中的 ${name} 必须是独立文件夹`);
    return full;
  } catch (error) {
    if (error.code === "ENOENT" && !required) return null;
    if (error.code === "ENOENT") throw new Error(`项目缺少必需的 ${name}/ 文件夹`);
    throw error;
  }
}

async function requiredFile(root, folder, name) {
  const expected = join(folder, name);
  try {
    const full = await realpath(expected);
    if (!isInside(folder, full) || !(await stat(full)).isFile()) throw new Error();
    return full;
  } catch {
    throw new Error(`项目包含 mpy/ 时必须提供 mpy/${name}`);
  }
}

async function suggestedBotEntry(root) {
  const botRoot = await realpath(join(root, "bot"));
  for (const name of BOT_ENTRY_CANDIDATES) {
    try {
      const full = await realpath(join(root, name));
      if (isInside(botRoot, full) && (await stat(full)).isFile()) return name;
    } catch {}
  }
  return "";
}

export async function inspectProject(path) {
  const root = await realpath(resolve(path));
  if (!(await stat(root)).isDirectory()) throw new Error("请选择项目文件夹");
  await directory(root, "bot", true);
  const webapp = await directory(root, "webapp", false);
  const mpy = await directory(root, "mpy", false);
  if (mpy) {
    await requiredFile(root, mpy, "__main__.py");
    const manifestPath = await requiredFile(root, mpy, "mps.json");
    let manifest;
    try { manifest = JSON.parse(await readFile(manifestPath, "utf8")); }
    catch { throw new Error("mpy/mps.json 不是合法的 JSON"); }
    if (!manifest || typeof manifest !== "object" || Array.isArray(manifest)) throw new Error("mpy/mps.json 必须是 JSON 对象");
  }
  return { path: root, bot: await suggestedBotEntry(root), webRoot: webapp ? "webapp" : "", mpy: Boolean(mpy) };
}

export async function validateProjectRun(path, options = {}) {
  const project = await inspectProject(path);
  const selected = String(options.bot || "").trim();
  if (!selected) throw new Error("请指定 bot/ 文件夹中的 Bot 入口文件");
  let entry;
  try { entry = await realpath(resolve(project.path, selected)); }
  catch { throw new Error("指定的 Bot 入口文件不存在"); }
  const botRoot = await realpath(join(project.path, "bot"));
  if (!isInside(botRoot, entry) || !(await stat(entry)).isFile()) throw new Error("Bot 入口必须是 bot/ 文件夹中的文件");
  if (![".js", ".mjs", ".cjs"].includes(extname(entry).toLowerCase())) throw new Error("Bot 入口必须是 .js、.mjs 或 .cjs 文件");
  return { ...project, bot: relative(project.path, entry).replaceAll("\\", "/") };
}