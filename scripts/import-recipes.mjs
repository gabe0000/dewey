import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {lstat,readFile,writeFile,rename,rm} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import {collection,hash} from '../src/library.mjs';
import {parseRecipes} from '../src/recipes.mjs';
export async function importRecipes(file,library,sourceArchive){
  if(!file||!library||!path.isAbsolute(file)||!path.isAbsolute(library))throw Error('Specify absolute recipe-file and installed-library paths');
  const info=await lstat(file);if(!info.isFile()||info.isSymbolicLink()||info.size>20*1024*1024)throw Error('Recipe source must be a regular file no larger than 20 MiB');
  const bytes=await readFile(file),pack=parseRecipes(bytes.toString('utf8'));
  let archive;
  if(sourceArchive){if(!path.isAbsolute(sourceArchive)||!sourceArchive.endsWith('.tar.gz'))throw Error('Specify an absolute source .tar.gz archive');const info=await lstat(sourceArchive);if(!info.isFile()||info.isSymbolicLink()||info.size>20*1024*1024)throw Error('Source archive must be a regular file no larger than 20 MiB');archive=await readFile(sourceArchive);}
  const id='homestead-kitchen';
  if(!(await collection(library)).length)throw Error('Select an installed verified library');
  const lock=path.join(library,'.import-library.lock');await writeFile(lock,randomUUID(),{flag:'wx',mode:0o600});let temporary;
  try{
    const manifestPath=path.join(library,'manifest.json'),original=await readFile(manifestPath),manifest=JSON.parse(original);
    await collection(library);
    if(manifest.documents.some(d=>d.id===id))throw Error('Recipe collection already installed; refusing to overwrite');
    await writeFile(path.join(library,id+'.txt'),bytes,{flag:'wx',mode:0o600});
    const attachments=[];
    if(archive){const file=id+'-sources.tar.gz';await writeFile(path.join(library,file),archive,{flag:'wx',mode:0o600});attachments.push({file,sha256:hash(archive)});}
    const previousManifest='manifest-before-recipes-'+randomUUID()+'.json';await writeFile(path.join(library,previousManifest),original,{flag:'wx',mode:0o600});
    manifest.documents.push({id,title:pack.title,topic:'Recipes',file:id+'.txt',format:'recipes-v1',license:pack.license||'License recorded in source',provenance:pack.provenance||'Recipe source supplied by library owner',importedAt:new Date().toISOString(),sha256:hash(bytes),...(attachments.length?{attachments}:{})});
    temporary=path.join(library,'manifest-import-'+randomUUID()+'.tmp');await writeFile(temporary,JSON.stringify(manifest,null,2)+'\n',{flag:'wx',mode:0o600});
    if(!(await readFile(manifestPath)).equals(original))throw Error('Manifest changed; new source and backup preserved for inspection');
    await rename(temporary,manifestPath);temporary=undefined;await collection(library);
    return {id,recipes:pack.recipes.length,homestead:pack.recipes.filter(r=>r.section==='Homestead').length,guides:pack.guides.length,mealChains:pack.mealChains.length,sha256:hash(bytes),previousManifest};
  }finally{if(temporary)await rm(temporary,{force:true});await rm(lock);}
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  try{console.log(JSON.stringify(await importRecipes(process.argv[2],process.argv[3],process.argv[4]),null,2));}
  catch(error){console.error('Recipe import stopped: '+error.message);process.exitCode=1;}
}
