import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,readFile,writeFile,rm,symlink,readdir} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {emptyHousehold,applyHouseholdAction,matchRecipe,simulatePlans,foodReview,chilledHours,convert} from '../src/kitchen.mjs';
import {parseRecipes} from '../src/recipes.mjs';
import {readHousehold,writeHousehold} from '../src/household.mjs';
import {install,hash,collection} from '../src/library.mjs';
import {createApp} from '../src/server.mjs';
import {importRecipes} from '../scripts/import-recipes.mjs';

const now=Date.parse('2026-11-08T18:00:00Z'),hour=3600000;
const ingredient=(key,quantity,unit,extra={})=>({key,label:key,quantity,unit,...extra});
const base={section:'Homestead',category:'Basics',difficulty:'Simple',summary:'Synthetic test recipe',servings:4,prepMinutes:5,cookMinutes:10,restMinutes:0,equipment:['pot'],allergens:[],tags:['test'],steps:[{text:'Synthetic instruction.',guides:['basics']} ]};
const beans={...base,id:'beans',title:'Test beans',ingredients:[ingredient('dried-beans',1,'lb'),ingredient('water',8,'cup',{pantryBasic:true})],produces:[ingredient('cooked-beans',6,'cup',{cooked:true})]};
const bowl={...base,id:'bean-rice',title:'Test bean rice',ingredients:[ingredient('cooked-beans',2,'cup',{cooked:true}),ingredient('rice',1,'cup')],produces:[ingredient('bean-rice',4,'cup',{cooked:true})]};
const pack={schema:1,title:'Synthetic kitchen',recipes:[beans,bowl],guides:[{id:'basics',title:'Basics',summary:'Synthetic guide',sections:[{title:'Start',text:'Synthetic guide text.'}]}],mealChains:[{id:'beans-chain',title:'Beans chain',summary:'Synthetic chain',meals:[{recipeId:'beans',day:0,servings:4,expectedLeftovers:[ingredient('cooked-beans',4,'cup')],note:'Reserve an estimate.'},{recipeId:'bean-rice',day:1,servings:4,expectedLeftovers:[],note:'Use actual cooked beans.'}]}],references:[{title:'Test reference',url:'https://example.org/guide'}]};
const context={lookup:(c,id)=>c==='test-recipes'?pack.recipes.find(r=>r.id===id):undefined,pack:c=>c==='test-recipes'?pack:undefined,now};
const act=(s,a,d,t=now)=>applyHouseholdAction(s,a,d,{...context,now:t});
function stocked(){let s=act(emptyHousehold(),'addInventory',{key:'dried-beans',label:'Dry beans',quantity:1,unit:'lb',location:'Pantry'});return act(s,'addInventory',{key:'rice',label:'Rice',quantity:2,unit:'cup',location:'Pantry'});}
function chain(s){return act(s,'addChain',{collectionId:'test-recipes',chainId:'beans-chain',startAt:new Date(now).toISOString()});}
test('quantified stock matching converts compatible units without inventing density conversions',()=>{
  assert.equal(convert(1,'lb','oz'),16);assert.equal(convert(1,'cup','tbsp'),16);
  assert.throws(()=>convert(1,'cup','lb'),/cannot be converted/);
  const s=stocked();s.inventory[0].quantity=8;s.inventory[0].unit='oz';
  const result=matchRecipe(beans,s,{now});assert.equal(result.ingredients[0].missing,.5);
  assert.equal(s.inventory[0].quantity,8);
  s.avoidances.allergens=['milk'];assert(matchRecipe({...beans,allergens:['milk']},s,{now}).conflicts.includes('milk'));
});
test('meal plans reserve stock in simulation and distinguish expected leftovers from actual food',()=>{
  const s=chain(stocked());assert.equal(s.inventory.length,2);assert.equal(s.groceries.length,0);
  const result=simulatePlans(s,context.lookup,{now});
  assert.equal(result.meals.length,2);assert.equal(result.meals[1].match.missing.length,0);assert.equal(result.meals[1].match.usesExpected,true);assert.equal(result.meals[1].match.ready,false);
  assert.equal(s.inventory[0].quantity,1);assert(!s.inventory.some(l=>l.key==='cooked-beans'));
});
test('shopping records remain separate until a purchase is explicitly confirmed',()=>{
  let s=chain(emptyHousehold());s=act(s,'addGroceries',{});assert(s.groceries.length>0);assert.equal(s.inventory.length,0);
  const item=s.groceries[0];assert.throws(()=>act(s,'purchase',{id:item.id,quantity:item.quantity,location:'Pantry'}),/Confirm/);
  s=act(s,'purchase',{id:item.id,quantity:item.quantity,location:'Pantry',confirmed:true});assert.equal(s.inventory.length,1);assert.equal(s.inventory[0].quantity,item.quantity);
});
test('cooking does not turn expected leftovers into inventory without actual leftover quantities',()=>{
  let s=chain(stocked());const first=s.plans[0];const lot=s.inventory.find(l=>l.key==='dried-beans');
  s=act(s,'confirmCook',{planId:first.id,confirmed:true,uses:[{lotId:lot.id,quantity:1}],leftovers:[]});
  assert.equal(s.inventory.find(l=>l.id===lot.id).quantity,0);assert(!s.inventory.some(l=>l.key==='cooked-beans'));
  assert(simulatePlans(s,context.lookup,{now}).missing.some(i=>i.key==='cooked-beans'));
});
test('confirmed leftover chains retain original dates and refrigerated time across reheating',()=>{
  let s=chain(stocked());let lot=s.inventory.find(l=>l.key==='dried-beans');
  s=act(s,'confirmCook',{planId:s.plans[0].id,confirmed:true,handlingConfirmed:true,uses:[{lotId:lot.id,quantity:1}],leftovers:[{...ingredient('cooked-beans',3,'cup'),location:'Fridge'}]});
  lot=s.inventory.find(l=>l.key==='cooked-beans');assert.equal(lot.preparedAt,new Date(now).toISOString());
  s=act(s,'confirmCook',{planId:s.plans[1].id,confirmed:true,handlingConfirmed:true,uses:[{lotId:lot.id,quantity:2}],leftovers:[{...ingredient('bean-rice',1,'cup'),location:'Fridge'}]},now+24*hour);
  const next=s.inventory.find(l=>l.key==='bean-rice');assert.equal(next.preparedAt,new Date(now).toISOString());assert.equal(next.chilledHoursBefore,24);assert(foodReview(next,now+97*hour).some(f=>f.includes('four days')));
  assert.equal(s.inventory.find(l=>l.id===lot.id).quantity,1);
});
test('freezing pauses recorded refrigerator time without resetting the original preparation date',()=>{
  let s=act(emptyHousehold(),'addInventory',{...ingredient('cooked-beans',3,'cup'),location:'Fridge',cooked:true,preparedAt:new Date(now).toISOString(),handlingConfirmed:true});
  const id=s.inventory[0].id;s=act(s,'updateInventory',{id,quantity:3,location:'Freezer'},now+24*hour);
  s=act(s,'updateInventory',{id,quantity:3,location:'Fridge'},now+1000*hour);
  assert.equal(chilledHours(s.inventory[0],now+1012*hour),36);assert.equal(s.inventory[0].preparedAt,new Date(now).toISOString());assert.equal(foodReview(s.inventory[0],now+1012*hour).length,0);
});
test('unknown cooked-food history remains flagged, and duplicate consumption cannot overspend stock',()=>{
  let s=chain(stocked());const lot=s.inventory[0];
  assert.throws(()=>act(s,'confirmCook',{planId:s.plans[0].id,confirmed:true,uses:[{lotId:lot.id,quantity:.75},{lotId:lot.id,quantity:.75}],leftovers:[]}),/exceeds/);assert.equal(s.inventory[0].quantity,1);
  s=act(s,'addInventory',{...ingredient('cooked-beans',2,'cup'),location:'Fridge',cooked:true});assert(foodReview(s.inventory.at(-1),now).length>=2);
  const unknown=act(s,'confirmCook',{planId:s.plans[1].id,confirmed:true,uses:[],leftovers:[{...ingredient('bean-rice',1,'cup'),location:'Fridge'}]});
  assert.equal(unknown.inventory.at(-1).preparedAt,null);assert(foodReview(unknown.inventory.at(-1),now).length>0);
});
test('inherited refrigerator time cannot be cleared or shortened by adjusting a record',()=>{
  let s=chain(stocked());s=act(s,'confirmCook',{planId:s.plans[0].id,confirmed:true,handlingConfirmed:true,uses:[{lotId:s.inventory[0].id,quantity:1}],leftovers:[{...ingredient('cooked-beans',3,'cup'),location:'Fridge'}]});
  const lot=s.inventory.at(-1);
  assert.throws(()=>act(s,'updateInventory',{id:lot.id,quantity:3,storageSince:new Date(now+24*hour).toISOString()},now+24*hour),/must be retained/);
  assert.throws(()=>act(s,'updateInventory',{id:lot.id,quantity:3,storageSince:null}),/must be retained/);
  s=act(s,'updateInventory',{id:lot.id,quantity:3,location:'Freezer',storageSince:null},now+24*hour);
  assert.equal(s.inventory.at(-1).chilledHoursBefore,24);assert.equal(s.inventory.at(-1).storageSince,new Date(now+24*hour).toISOString());
});
test('purchases inherit known food handling metadata and do not invent a cooked-food history',()=>{
  let s=act(emptyHousehold(),'addGroceries',{items:[ingredient('cooked-beans',2,'cup')]});
  s=applyHouseholdAction(s,'purchase',{id:s.groceries[0].id,quantity:2,confirmed:true,location:'Fridge'},{...context,ingredientInfo:()=>({cooked:true,requiresCold:true})});
  assert.equal(s.inventory[0].cooked,true);assert(foodReview(s.inventory[0],now).some(f=>f.includes('preparation date')));
  const bread=applyHouseholdAction(emptyHousehold(),'addInventory',{...ingredient('bread-slice',12,'each'),location:'Pantry',shelfStable:true},{...context,ingredientInfo:()=>({cooked:true,requiresCold:false})});
  assert.equal(foodReview(bread.inventory[0],now).length,0);
  let sealed=act(emptyHousehold(),'addInventory',{...ingredient('cooked-beans',3,'cup'),cooked:true,shelfStable:true,location:'Pantry'});sealed=act(sealed,'addPlan',{collectionId:'test-recipes',recipeId:'bean-rice',scheduledAt:new Date(now).toISOString(),servings:4});
  sealed=act(sealed,'confirmCook',{planId:sealed.plans[0].id,confirmed:true,handlingConfirmed:true,uses:[{lotId:sealed.inventory[0].id,quantity:2}],leftovers:[{...ingredient('bean-rice',1,'cup'),location:'Fridge'}]});
  assert.equal(sealed.inventory.at(-1).preparedAt,new Date(now).toISOString());assert.equal(foodReview(sealed.inventory.at(-1),now).length,0);
});
test('recipe schemas validate guide links, ingredient units and meal-chain outputs',()=>{
  assert.equal(parseRecipes(JSON.stringify(pack)).recipes.length,2);
  const bad=structuredClone(pack);bad.recipes[0].steps[0].guides=['missing'];assert.throws(()=>parseRecipes(JSON.stringify(bad)),/missing guide/);
  const wrong=structuredClone(pack);wrong.recipes[0].ingredients[0].unit='bucket';assert.throws(()=>parseRecipes(JSON.stringify(wrong)),/ingredient/);
  wrong.recipes[0].ingredients[0].unit='constructor';assert.throws(()=>parseRecipes(JSON.stringify(wrong)),/ingredient/);
  const linked=structuredClone(pack);linked.recipes[0].steps[0].recipes=['absent'];assert.throws(()=>parseRecipes(JSON.stringify(linked)),/linked recipe/);
});
test('unmeasured source ingredients prevent a complete stock match and are never guessed for shopping',()=>{
  const r={...beans,unmeasuredIngredients:['Some flour; amount not stated']};const match=matchRecipe(r,stocked(),{now});assert.equal(match.ready,false);assert.equal(match.unmeasured.length,1);assert.equal(match.total,2);assert.equal(match.missing.length,0);
});
async function fixture(t){const root=await mkdtemp(path.join(os.tmpdir(),'dewey-kitchen-'));t.after(()=>rm(root,{recursive:true,force:true}));const household=path.join(root,'household');await mkdir(household);return {root,household,source:path.join(root,'library'),index:path.join(root,'index')};}
test('private household writes persist, reject stale revisions and preserve a previous record',async t=>{
  const f=await fixture(t);const state=await writeHousehold(f.household,0,'addInventory',{...ingredient('rice',2,'cup'),location:'Pantry'},context);
  assert.equal((await readHousehold(f.household)).inventory[0].quantity,2);assert.equal(state.revision,1);
  await assert.rejects(writeHousehold(f.household,0,'addInventory',{...ingredient('rice',2,'cup'),location:'Pantry'},context),/another tab/);
  assert.equal(JSON.parse(await readFile(path.join(f.household,'household.previous.json'))).revision,0);
  assert(!(await readdir(f.household)).includes('.household.lock'));
  const link=path.join(f.root,'link');await symlink(f.household,link);await assert.rejects(readHousehold(link),/regular directory/);
});
test('recipe import preserves source bytes and previous originals, refuses overwrite and rebuilds independently',async t=>{
  const f=await fixture(t);await install(f.source);const before=await readFile(path.join(f.source,'manifest.json'));
  const original=path.join(f.root,'recipes.json'),bytes=Buffer.from(JSON.stringify(pack));await writeFile(original,bytes);
  const archive=path.join(f.root,'originals.tar.gz');await writeFile(archive,'synthetic archived source fixture');
  const result=await importRecipes(original,f.source,archive);assert.equal(result.recipes,2);assert((await readFile(path.join(f.source,'homestead-kitchen-sources.tar.gz'))).equals(await readFile(archive)));
  assert((await readFile(path.join(f.source,'homestead-kitchen.txt'))).equals(bytes));assert((await readFile(path.join(f.source,result.previousManifest))).equals(before));
  const after=await readFile(path.join(f.source,'manifest.json'));await assert.rejects(importRecipes(original,f.source),/already installed/);assert((await readFile(path.join(f.source,'manifest.json'))).equals(after));
  const bad=structuredClone(pack);bad.recipes[0].steps[0].guides=['absent'];await writeFile(original,JSON.stringify(bad));await assert.rejects(importRecipes(original,f.source),/missing guide/);assert((await readFile(path.join(f.source,'manifest.json'))).equals(after));
  const link=path.join(f.root,'recipes-link');await symlink(original,link);await assert.rejects(importRecipes(link,f.source),/regular file/);
  await writeFile(path.join(f.source,'homestead-kitchen-sources.tar.gz'),'changed source');await assert.rejects(collection(f.source),/Checksum/);
});
test('household HTTP writes require the session token and same origin; recipes work without AI',async t=>{
  const f=await fixture(t);await install(f.source);const bytes=Buffer.from(JSON.stringify(pack));await writeFile(path.join(f.source,'test-recipes.txt'),bytes);
  const manifest=JSON.parse(await readFile(path.join(f.source,'manifest.json')));manifest.documents.push({id:'test-recipes',title:'Test recipes',topic:'Recipes',file:'test-recipes.txt',format:'recipes-v1',license:'CC0-1.0',provenance:'Synthetic test fixture',sha256:hash(bytes)});await writeFile(path.join(f.source,'manifest.json'),JSON.stringify(manifest));
  const server=await createApp(f);await new Promise(r=>server.listen(0,'127.0.0.1',r));t.after(()=>new Promise(r=>server.close(r)));
  const base=`http://127.0.0.1:${server.address().port}`;const status=await (await fetch(base+'/api/status')).json();assert(status.plannerEnabled);assert.equal(typeof status.plannerToken,'string');
  const body=JSON.stringify({revision:0,action:'addInventory',data:{...ingredient('rice',2,'cup'),location:'Pantry'}});
  assert.equal((await fetch(base+'/api/household',{method:'POST',headers:{'Content-Type':'application/json'},body})).status,403);
  const headers={'Content-Type':'application/json','X-Dewey-Planner-Token':status.plannerToken};
  assert.equal((await fetch(base+'/api/household',{method:'POST',headers:{...headers,Origin:'http://evil.example'},body})).status,403);
  assert.equal((await fetch(base+'/api/household',{method:'POST',headers,body})).status,200);
  assert.equal((await fetch(base+'/api/household',{method:'POST',headers,body})).status,409);
  assert.equal((await (await fetch(base+'/api/household')).json()).state.inventory[0].quantity,2);
  const listing=await (await fetch(base+'/api/catalog?topic=Recipes')).json();assert.equal(listing.documents[0].kind,'recipes');assert.equal(listing.documents[0].recipePack,undefined);
  const results=await (await fetch(base+'/api/recipes/test-recipes?difficulty=Simple')).json();assert.equal(results.recipes.length,2);
  assert.equal((await (await fetch(base+'/api/recipes/test-recipes/guide/basics')).json()).title,'Basics');
  const scaled=await (await fetch(base+'/api/recipes/test-recipes/recipe/bean-rice?servings=8')).json();assert.equal(scaled.match.ingredients.find(i=>i.key==='rice').quantity,2);
  assert.equal((await fetch(base+'/api/recipes/test-recipes/recipe/bean-rice?servings=-1')).status,400);
  assert.equal((await fetch(base+'/api/household',{method:'POST',headers,body:'{'})).status,400);
  assert.equal((await fetch(base+'/api/household',{method:'POST',headers,body:'null'})).status,400);
  const separate=path.join(f.root,'other-index');await assert.rejects(createApp({...f,index:separate,household:f.source}),/separate/);
});
