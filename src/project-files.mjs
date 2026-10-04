import { readdir, realpath, lstat, readFile, writeFile, rename, unlink } from 'node:fs/promises';
import { relative, join, dirname, isAbsolute } from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
const LIMIT = 1024 * 1024;
const excluded = new Set(['.git', 'node_modules', 'debug']);
const revision = data => createHash('sha256').update(data).digest('hex');
export class ProjectFiles {
  constructor(root) { this.root = root; }
  async path(input = '') {
    if (typeof input !== 'string' || input.includes('\0') || input.includes(':') || isAbsolute(input)) throw new Error('无效的相对路径');
    const parts = input.replaceAll('\\','/').split('/').filter(Boolean);
    if (parts.some(p => p === '..' || p === '.' || excluded.has(p.toLowerCase()) || /[<>"|?*]/.test(p) || /[. ]$/.test(p))) throw new Error('此路径不可访问');
    const root = await realpath(this.root);
    let target = root;
    for (let i=0; i<parts.length; i++) {
      target = join(target,parts[i]);
      if ((await lstat(target)).isSymbolicLink()) throw new Error('不支持访问符号链接或目录联接');
    }
    const rel = relative(root,target);
    if (rel.startsWith('..') || isAbsolute(rel)) throw new Error('路径超出当前应用');
    return target;
  }
  async list(path = '') {
    const target = await this.path(path);
    const entries = await readdir(target,{withFileTypes:true});
    return entries.filter(e=>!excluded.has(e.name.toLowerCase())&&!e.isSymbolicLink()&&(e.isDirectory()||e.isFile())).map(e=>({
      name:e.name,path:[path,e.name].filter(Boolean).join('/'),directory:e.isDirectory()
    })).sort((a,b)=>Number(b.directory)-Number(a.directory)||a.name.localeCompare(b.name));
  }
  async read(path) {
    const target = await this.path(path);
    const stat = await lstat(target);
    if (!stat.isFile() || stat.size > LIMIT) throw new Error('仅支持编辑不超过 1 MB 的文本文件');
    const bytes = await readFile(target);
    if(bytes.includes(0)) throw new Error('此文件是二进制文件，不能作为文本编辑');
    let content;
    try { content = new TextDecoder('utf-8',{fatal:true,ignoreBOM:true}).decode(bytes); }
    catch { throw new Error('仅支持 UTF-8 编码的文本文件'); }
    return {path,content,revision:revision(bytes)};
  }
  async save(path,content,expected) {
    if(typeof content!=='string'||Buffer.byteLength(content)>LIMIT) throw new Error('文本内容不能超过 1 MB');
    const target=await this.path(path);
    const original=await this.read(path);
    if(original.revision!==expected) throw new Error('文件已被其它程序修改，请重新打开后再编辑，未覆盖磁盘内容');
    const temporary=join(dirname(target),'.studio-save-'+randomUUID());
    try {
      await writeFile(temporary,content,{flag:'wx',mode:(await lstat(target)).mode});
      if((await this.read(path)).revision!==expected) throw new Error('文件发生变化，请重新打开');
      await rename(temporary,target);
    } finally { await unlink(temporary).catch(()=>{}); }
    return {path,content,revision:revision(Buffer.from(content))};
  }
}
