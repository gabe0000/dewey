import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {readFile,lstat,writeFile,rename,rm} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import {collection,hash} from '../src/library.mjs';
import {parsePdf} from '../src/pdf.mjs';
import {parseLessons,validateLessonSources} from '../src/lessons.mjs';
// Reviewed batch specification: {schema:1,documents:[{id,title,format,file:absolutePath,sha256,license,provenance,sourceUrl?}]}.
export async function importLearning(specFile,library){
  if(!path.isAbsolute(specFile||'')||!path.isAbsolute(library||''))throw Error('Specify absolute batch-specification and installed-library paths');
  const specInfo=await lstat(specFile);if(!specInfo.isFile()||specInfo.size>1024*1024)throw Error('Invalid batch specification');
  const spec=JSON.parse(await readFile(specFile,'utf8'));if(spec.schema!==1||!Array.isArray(spec.documents)||!spec.documents.length||spec.documents.length>20)throw Error('Invalid learning batch');
  const existing=await collection(library);if(!existing.length)throw Error('Select an installed verified library');
  const ids=new Set(existing.map(d=>d.id)),pending=[];
  // Parse every byte and validate every link before creating any source file.
  for(const entry of spec.documents){
    const {id,title,format,file,sha256,license,provenance,sourceUrl}=entry;
    if(!/^[a-z0-9-]+$/.test(id)||ids.has(id)||!['pdf-v1','lessons-v1'].includes(format)||!path.isAbsolute(file||'')||!['title','license','provenance'].every(k=>typeof entry[k]==='string'&&entry[k].trim())||!/^[a-f0-9]{64}$/.test(sha256))throw Error('Invalid or duplicate learning source');ids.add(id);
    const info=await lstat(file);if(!info.isFile()||info.size>100*1024*1024)throw Error('Invalid learning source file');const bytes=await readFile(file);if(hash(bytes)!==sha256)throw Error('Learning source checksum mismatch');
    const parsed=format==='pdf-v1'?{pdf:await parsePdf(bytes)}:{lessonPack:parseLessons(bytes.toString('utf8'))};
    pending.push({metadata:{id,title,format,file:id+(format==='pdf-v1'?'.pdf':'.txt'),sha256,license,provenance,...(sourceUrl?{sourceUrl}:{}),topic:'Maps & Navigation',importedAt:new Date().toISOString()},bytes,...parsed});
  }
  const checkedExisting=[];for(const d of existing)checkedExisting.push({...d,...(d.format==='pdf-v1'?{pdf:await parsePdf(d.bytes)}:{})});
  validateLessonSources([...checkedExisting,...pending.map(p=>({...p.metadata,pdf:p.pdf,lessonPack:p.lessonPack}))]);
  const lock=path.join(library,'.import-library.lock');await writeFile(lock,randomUUID(),{flag:'wx',mode:0o600});let temporary;
  try{
    const manifestFile=path.join(library,'manifest.json'),original=await readFile(manifestFile),manifest=JSON.parse(original);await collection(library);
    if(pending.some(p=>manifest.documents.some(d=>d.id===p.metadata.id)))throw Error('Source already installed; refusing to overwrite');
    for(const p of pending)await writeFile(path.join(library,p.metadata.file),p.bytes,{flag:'wx',mode:0o600});
    const previousManifest='manifest-before-learning-'+randomUUID()+'.json';await writeFile(path.join(library,previousManifest),original,{flag:'wx',mode:0o600});
    manifest.documents.push(...pending.map(p=>p.metadata));temporary=path.join(library,'manifest-import-'+randomUUID()+'.tmp');await writeFile(temporary,JSON.stringify(manifest,null,2)+'\n',{flag:'wx',mode:0o600});
    if(!(await readFile(manifestFile)).equals(original))throw Error('Manifest changed; staged sources and previous manifest retained');await rename(temporary,manifestFile);temporary=undefined;await collection(library);
    return {documents:pending.map(p=>({id:p.metadata.id,sha256:p.metadata.sha256,pages:p.pdf?.pageCount,lessons:p.lessonPack?.lessons.length})),previousManifest};
  }finally{if(temporary)await rm(temporary,{force:true});await rm(lock);}
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url))try{console.log(JSON.stringify(await importLearning(process.argv[2],process.argv[3]),null,2));}catch(e){console.error('Learning import stopped: '+e.message);process.exitCode=1;}
