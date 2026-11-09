import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {importBible} from './import-bible.mjs';
export const importKJV=(sourceFile,library)=>importBible('kjv',sourceFile,library);
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  try {console.log(JSON.stringify(await importKJV(process.argv[2],process.argv[3]),null,2));}
  catch(error){console.error('KJV import stopped: '+error.message);process.exitCode=1;}
}
