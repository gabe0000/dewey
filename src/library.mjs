import {readFile, readdir, mkdir, writeFile, rename, lstat} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash, randomUUID} from 'node:crypto';
import {bibleFormats,parseBibleDocument,searchVerses} from './bible.mjs';
export const hash = bytes => createHash('sha256').update(bytes).digest('hex');
export const starterDir = new URL('../starter/', import.meta.url);
async function manifestDocuments(root) {
  let manifest;
  for (const target of [root, path.join(root, 'manifest.json')]) {
    try { if ((await lstat(target)).isSymbolicLink()) throw Error('Symbolic source root or manifest is not allowed'); }
    catch (e) { if (e.code !== 'ENOENT') throw e; }
  }
  try { manifest = JSON.parse(await readFile(path.join(root, 'manifest.json'), 'utf8')); }
  catch(e) { if(e.code === 'ENOENT') return []; throw e; }
  if(manifest.schema !== 1 || !Array.isArray(manifest.documents)) throw Error('Invalid manifest');
  const seen = new Set();
  for(const d of manifest.documents){
    if(!/^[a-z0-9-]+$/.test(d.id) || seen.has(d.id)) throw Error('Invalid or duplicate document ID');
    seen.add(d.id);
    if(d.file !== `${d.id}.txt` || !/^[a-f0-9]{64}$/.test(d.sha256)) throw Error('Invalid source path or checksum');
    for(const key of ['title','topic','license','provenance']) if(typeof d[key] !== 'string') throw Error('Missing metadata');
    if(d.format!==undefined && !bibleFormats.includes(d.format)) throw Error('Unsupported document format');
    if(d.attachments!==undefined){
      if(!Array.isArray(d.attachments))throw Error('Invalid source attachments');
      const files=new Set();
      for(const attachment of d.attachments){
        if(typeof attachment.file!=='string'||!attachment.file.startsWith(d.id+'-')||!/^[a-z0-9][a-z0-9.-]*$/.test(attachment.file)||attachment.file.includes('..')||!/^([a-f0-9]{64})$/.test(attachment.sha256)||files.has(attachment.file))throw Error('Invalid attachment path or checksum');
        files.add(attachment.file);
      }
    }
  }
  return manifest.documents;
}
async function loadDocument(root,d){
  async function checked(file,digest){
    const full=path.join(root,file);
    if(!(await lstat(full)).isFile())throw Error('Source must be a regular file');
    const bytes=await readFile(full);
    if(hash(bytes)!==digest)throw Error(`Checksum mismatch: ${d.id}`);
    return bytes;
  }
  const bytes=await checked(d.file,d.sha256);
  for(const attachment of d.attachments||[])await checked(attachment.file,attachment.sha256);
  return {...d,text:bytes.toString('utf8'),verified:true};
}
export async function collection(root){
  return Promise.all((await manifestDocuments(root)).map(d=>loadDocument(root,d)));
}
export async function sourceDocument(root,id){
  const doc=(await manifestDocuments(root)).find(d=>d.id===id);
  return doc?loadDocument(root,doc):undefined;
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
  for(const doc of docs) if(doc.format) doc.bible=parseBibleDocument(doc);
  await mkdir(index,{recursive:true});
  const temporary = path.join(index, `catalog-${randomUUID()}.tmp`);
  await writeFile(temporary, JSON.stringify({schema:1, generatedAt:new Date().toISOString(), documents:docs}));
  await rename(temporary,path.join(index,'catalog.json'));
  return docs;
}
export function search(docs, query='', topic='') {
  const words = query.toLowerCase().trim().split(/\s+/).filter(Boolean);
  const reference=/^[1-3]?\s*[a-z][a-z\s-]*?\s*\d+(?::\d+(?:-\d+)?)?$/i.test(query.trim());
  return docs.filter(d => (!topic || d.topic === topic) && (d.bible&&reference?searchVerses(d.bible,query,1).total>0:words.every(w => `${d.title} ${d.topic} ${d.text}`.toLowerCase().includes(w))));
}
