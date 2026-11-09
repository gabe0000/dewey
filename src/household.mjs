import path from 'node:path';
import {lstat,readFile,writeFile,rename,rm} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import {emptyHousehold,applyHouseholdAction} from './kitchen.mjs';
async function checkedRoot(root){
  if(!root||!path.isAbsolute(root))throw Error('Private household storage needs an absolute configured path');
  const info=await lstat(root);if(!info.isDirectory()||info.isSymbolicLink())throw Error('Household storage must be an existing regular directory');
}
export async function readHousehold(root){
  if(!root)return {...emptyHousehold(),readOnly:true};
  await checkedRoot(root);
  const file=path.join(root,'household.json');
  try{
    if(!(await lstat(file)).isFile())throw Error('Household record must be a regular file');
    const state=JSON.parse(await readFile(file,'utf8'));
    if(state.schema!==1||!Number.isInteger(state.revision)||!['inventory','plans','groceries','cookedMeals','audit'].every(k=>Array.isArray(state[k])))throw Error('Invalid household record');
    return state;
  }catch(error){if(error.code==='ENOENT')return emptyHousehold();throw error;}
}
export async function writeHousehold(root,revision,action,data,context){
  await checkedRoot(root);
  const lock=path.join(root,'.household.lock');await writeFile(lock,randomUUID(),{flag:'wx',mode:0o600});
  let temporary;
  try{
    const old=await readHousehold(root);
    if(old.revision!==revision)throw Error('Household changed in another tab; reload before saving');
    const next=applyHouseholdAction(old,action,data,context);
    temporary=path.join(root,'household-'+randomUUID()+'.tmp');await writeFile(temporary,JSON.stringify(next,null,2)+'\n',{flag:'wx',mode:0o600});
    const previous=path.join(root,'previous-'+randomUUID()+'.tmp');await writeFile(previous,JSON.stringify(old,null,2)+'\n',{flag:'wx',mode:0o600});
    await rename(previous,path.join(root,'household.previous.json'));
    await rename(temporary,path.join(root,'household.json'));temporary=undefined;
    return next;
  }finally{if(temporary)await rm(temporary,{force:true});await rm(lock);}
}
