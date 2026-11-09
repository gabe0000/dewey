import {readFile, readdir, mkdir, writeFile, rename, lstat} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash, randomUUID} from 'node:crypto';
export const hash = bytes => createHash('sha256').update(bytes).digest('hex');
export const starterDir = new URL('../starter/', import.meta.url);
export async function collection(root) {
  let manifest;
  for (const target of [root, path.join(root, 'manifest.json')]) {
    try { if ((await lstat(target)).isSymbolicLink()) throw Error('Symbolic source root or manifest is not allowed'); }
    catch (e) { if (e.code !== 'ENOENT') throw e; }
  }
  try { manifest = JSON.parse(await readFile(path.join(root, 'manifest.json'), 'utf8')); }
  catch(e) { if(e.code === 'ENOENT') return []; throw e; }
  if(manifest.schema !== 1 || !Array.isArray(manifest.documents)) throw Error('Invalid manifest');
  const seen = new Set();
  return Promise.all(manifest.documents.map(async d => {
    if(!/^[a-z0-9-]+$/.test(d.id) || seen.has(d.id)) throw Error('Invalid or duplicate document ID');
    seen.add(d.id);
    if(d.file !== `${d.id}.txt` || !/^[a-f0-9]{64}$/.test(d.sha256)) throw Error('Invalid source path or checksum');
    for(const key of ['title','topic','license','provenance']) if(typeof d[key] !== 'string') throw Error('Missing metadata');
    const file = path.join(root, d.file);
    if(!(await lstat(file)).isFile()) throw Error('Source must be a regular file');
    const bytes = await readFile(file);
    if(hash(bytes) !== d.sha256) throw Error(`Checksum mismatch: ${d.id}`);
    return {...d, text: bytes.toString('utf8'), verified: true};
  }));
}
export async function install(root) {
  try { if ((await lstat(root)).isSymbolicLink()) throw Error('Symbolic source root is not allowed'); }
  catch (e) { if (e.code !== 'ENOENT') throw e; }
  await mkdir(root, {recursive:true});
  const existing = await readdir(root);
  if(existing.some(n => n !== '.gitkeep')) throw Error('Source directory is not empty; refusing to overwrite');
  const docs = await collection(fileURLToPath(starterDir));
  // Each file is exclusive; the manifest is the commit marker, written last.
  for(const d of docs) await writeFile(path.join(root,d.file), d.text, {flag:'wx'});
  await writeFile(path.join(root, 'LICENSE.txt'), await readFile(new URL('LICENSE.txt', starterDir)), {flag: 'wx'});
  const manifest = await readFile(new URL('manifest.json', starterDir));
  await writeFile(path.join(root,'manifest.json'), manifest, {flag:'wx'});
  return docs;
}
export async function rebuild(source, index) {
  const docs = await collection(source);
  await mkdir(index,{recursive:true});
  const temporary = path.join(index, `catalog-${randomUUID()}.tmp`);
  await writeFile(temporary, JSON.stringify({schema:1, generatedAt:new Date().toISOString(), documents:docs}));
  await rename(temporary,path.join(index,'catalog.json'));
  return docs;
}
export function search(docs, query='', topic='') {
  const words = query.toLowerCase().trim().split(/\s+/).filter(Boolean);
  return docs.filter(d => (!topic || d.topic === topic) && words.every(w => `${d.title} ${d.topic} ${d.text}`.toLowerCase().includes(w)));
}
