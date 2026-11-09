import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {lstat,readFile,writeFile,rename,rm} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import {collection,hash} from '../src/library.mjs';
import {parseBibleDocument} from '../src/bible.mjs';

const profiles={
  kjv:{id:'bible-kjv',title:'King James Version',format:'gutenberg-kjv',translation:'KJV',license:'Public domain in the USA; Gutenberg license included',sourceUrl:'https://www.gutenberg.org/ebooks/10',provenance:'Project Gutenberg eBook #10. Original downloaded text, including its license, is preserved without modification. Book and verse display is derived locally.'},
  bbe:{id:'bible-bbe',title:'Bible in Basic English',format:'ebible-bbe-vpl',translation:'BBE',license:'Public domain in the USA, as stated by eBible.org',sourceUrl:'https://www.ebible.org/find/details.php?id=engBBE',provenance:'eBible.org Bible in Basic English, verse-per-line edition. Simple English translation. The original text and original download archive, including publisher rights information, are preserved without modification.'}
};
async function regularFile(file,maximum){
  if(!file||!path.isAbsolute(file))throw Error('Specify absolute input file paths');
  const info=await lstat(file);
  if(!info.isFile()||info.isSymbolicLink())throw Error('Import source must be a regular file');
  if(info.size>maximum)throw Error('Import file exceeds the supported size');
  return readFile(file);
}
export async function importBible(translation,sourceFile,library,archiveFile){
  const profile=profiles[translation];
  if(!profile)throw Error('Supported imports are kjv and bbe');
  if(!library||!path.isAbsolute(library))throw Error('Specify an absolute installed library path');
  const existing=await collection(library);
  if(!existing.length)throw Error('Install or select a verified collection before importing');
  if(existing.some(d=>d.id===profile.id))throw Error(profile.translation+' is already installed; refusing to overwrite');
  const bytes=await regularFile(sourceFile,20*1024*1024);
  const parsed=parseBibleDocument({...profile,text:bytes.toString('utf8')});
  let archive;
  if(translation==='bbe'){
    if(!archiveFile)throw Error('BBE requires its original eBible ZIP archive to preserve publisher rights information');
    archive=await regularFile(archiveFile,50*1024*1024);
    if(!archive.subarray(0,4).equals(Buffer.from([80,75,3,4])))throw Error('Expected the original ZIP archive');
  }
  const lock=path.join(library,'.import-bible.lock');
  await writeFile(lock,randomUUID(),{flag:'wx',mode:0o600});
  let temporary;
  try {
    const manifestPath=path.join(library,'manifest.json');
    const original=await readFile(manifestPath);
    const manifest=JSON.parse(original);
    await collection(library);
    if(manifest.documents.some(d=>d.id===profile.id))throw Error('Translation was installed concurrently; refusing to overwrite');
    const file=profile.id+'.txt';
    await writeFile(path.join(library,file),bytes,{flag:'wx',mode:0o600});
    const attachments=[];
    if(archive){
      const archiveName=profile.id+'-original.zip';
      await writeFile(path.join(library,archiveName),archive,{flag:'wx',mode:0o600});
      attachments.push({file:archiveName,sha256:hash(archive),role:'Original publisher download and rights information'});
    }
    const backup='manifest-before-'+translation+'-'+randomUUID()+'.json';
    await writeFile(path.join(library,backup),original,{flag:'wx',mode:0o600});
    manifest.documents.push({...profile,topic:'Bibles',file,importedAt:new Date().toISOString(),sha256:hash(bytes),...(attachments.length?{attachments}:{})});
    temporary=path.join(library,'manifest-import-'+randomUUID()+'.tmp');
    await writeFile(temporary,JSON.stringify(manifest,null,2)+'\n',{flag:'wx',mode:0o600});
    if(!(await readFile(manifestPath)).equals(original))throw Error('Manifest changed during import; backup and new source preserved for inspection');
    await rename(temporary,manifestPath);temporary=undefined;
    await collection(library);
    return {id:profile.id,books:parsed.bookCount,verses:parsed.verseCount,sha256:hash(bytes),previousManifest:backup,...(archive?{archiveSha256:hash(archive)}:{})};
  } finally {
    if(temporary)await rm(temporary,{force:true});
    await rm(lock);
  }
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  try {console.log(JSON.stringify(await importBible(...process.argv.slice(2)),null,2));}
  catch(error){console.error('Bible import stopped: '+error.message);process.exitCode=1;}
}
