import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';
import {recipeCatalog,searchRecipes,searchGuides} from '../src/recipes.mjs';
import {search} from '../src/library.mjs';
import {emptyHousehold,matchRecipe} from '../src/kitchen.mjs';
import {recipeFilters,recipeHash,renderRecipes} from '../public/recipes.js';
import {mkdtemp,writeFile,rm} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {install,hash} from '../src/library.mjs';
import {createApp} from '../src/server.mjs';

const base={summary:'Synthetic food',category:'Supper',servings:2,prepMinutes:5,cookMinutes:10,restMinutes:0,equipment:['pan'],allergens:[],tags:[],produces:[{key:'test-meal',label:'Test meal',quantity:2,unit:'each'}],ingredients:[],steps:[{text:'Cook gently.',guides:['basics']}]};
const pack={schema:1,title:'Test kitchen',recipes:[{...base,id:'venison',title:'Venison skillet',section:'Hunting',difficulty:'Intermediate',ingredients:[{key:'venison',label:'Venison',quantity:1,unit:'lb'}]},{...base,id:'rice',title:'Plain rice',section:'Homestead',difficulty:'Simple',ingredients:[{key:'rice',label:'Rice',quantity:1,unit:'cup'}]}],guides:[{id:'basics',title:'Pan basics',summary:'A synthetic guide',sections:[{title:'Heat',text:'Keep a steady low flame.'}]}],mealChains:[],references:[]};
const doc={id:'test-kitchen',kind:'recipes',title:pack.title,topic:'Recipes',recipeCount:2,homesteadCount:1,recipePack:pack,provenance:'Synthetic fixture',license:'CC0-1.0'};

test('recipe search stays within one recipe or guide and agrees with library results',()=>{
  assert.deepEqual(searchRecipes(pack,' VENISON ').map(r=>r.id),['venison']);
  assert.equal(recipeCatalog(pack,emptyHousehold(),{q:'venison'}).total,1);
  assert.match(recipeCatalog(pack,emptyHousehold(),{q:'venison'}).recipes[0].searchExcerpt,/Venison/);
  assert.equal(recipeCatalog(pack,emptyHousehold(),{q:'venison',section:'Homestead'}).total,0);
  assert.equal(search([doc],'venison rice').length,0);
  assert.equal(search([doc],'steady flame').length,1);
  assert.equal(recipeCatalog(pack,emptyHousehold(),{q:'steady flame'}).total,0);
  assert.deepEqual(searchGuides(pack,'steady flame').map(g=>g.id),['basics']);
  for(const q of ['', '   '])assert.equal(recipeCatalog(pack,emptyHousehold(),{q}).total,2);
  assert.equal(search([doc],'nosuchfood').length,0);
});
test('search URLs round-trip explicit empty filters, special characters and direct-link defaults',()=>{
  assert.equal(recipeFilters().section,'Homestead');
  assert.equal(recipeFilters().difficulty,'Simple');
  const state=recipeFilters(new URLSearchParams({q:'venison & rice?/+'}));
  assert.equal(state.section,'');assert.equal(state.difficulty,'');
  state.category='Supper';state.stock=true;state.checkBasics=true;
  const hash=recipeHash('test-kitchen','recipe','venison',state);
  assert.deepEqual(recipeFilters(new URLSearchParams(hash.split('?')[1])),state);
  assert.match(hash,/test-kitchen\/recipe\/venison\?/);
  assert.equal(recipeFilters(new URLSearchParams({q:'',section:'Hunting'})).section,'Hunting');
});

function element(tag='div',text=''){
  return {tag,children:[],value:'',attributes:{},_text:text,classList:{add(){},remove(){}},
    set textContent(value){this._text=value;this.children=[];},get textContent(){return this._text+this.children.map(c=>c.textContent).join('');},
    append(...children){this.children.push(...children);},replaceChildren(...children){this._text='';this.children=children;},
    setAttribute(k,v){this.attributes[k]=v;},getAttribute(k){return this.attributes[k];},scrollIntoView(){},querySelectorAll(){return [];},
    get options(){return this.children;}};
}
const walk=n=>[n,...n.children.flatMap(walk)];
async function ui(t,hash=''){
  const nodes=Object.fromEntries(['status','catalog','reader','query','topic','filters','install','setup'].map(id=>[id,element()]));nodes.topic.append(element('option','All shelves'));
  const document={getElementById:id=>nodes[id],createElement:element,body:element('body')};
  const historyEntries=[hash];let position=0,currentHash=hash,hashListener;const calls=[],held=new Map();
  const location={get hash(){return currentHash;},set hash(value){if(value===currentHash)return;currentHash=value;historyEntries.splice(++position);historyEntries.push(value);}};
  const history={replaceState(a,b,value){currentHash=value;historyEntries[position]=value;}};
  const originals={document:global.document,location:global.location,history:global.history};Object.assign(global,{document,location,history});t.after(()=>Object.assign(global,originals));
  async function fetch(url){calls.push(url);const u=new URL(url,'http://localhost');const q=u.searchParams;
    if(u.pathname==='/api/recipes/test-kitchen'&&held.has(q.get('q')))await held.get(q.get('q'));
    let result;
    if(u.pathname==='/api/status')result={count:1,setup:false};
    else if(u.pathname==='/api/catalog')result={topics:['Recipes'],documents:search([doc],q.get('q')||'').map(d=>({...d,matchingRecipeCount:searchRecipes(pack,q.get('q')||'').length,matchingGuideCount:searchGuides(pack,q.get('q')||'').length}))};
    else if(u.pathname==='/api/source/test-kitchen')result=doc;
    else if(u.pathname==='/api/household')result={enabled:false,state:emptyHousehold(),review:{},plan:{meals:[],missing:[]}};
    else if(u.pathname==='/api/recipes/test-kitchen')result=recipeCatalog(pack,emptyHousehold(),Object.fromEntries(q));
    else if(u.pathname.includes('/recipe/')){const recipe=pack.recipes.find(r=>r.id===u.pathname.split('/').at(-1));result={recipe,match:matchRecipe(recipe,emptyHousehold()),guides:pack.guides};}
    else if(u.pathname.includes('/guide/'))result={...pack.guides[0],references:[]};
    else throw Error('Unexpected request: '+url);
    return {ok:true,json:async()=>result};
  }
  const context={document,window:{addEventListener(name,fn){if(name==='hashchange')hashListener=fn;}},location,history,URLSearchParams,fetch,loadRecipes:async()=>({renderRecipes})};
  const script=(await readFile(new URL('../public/app.js',import.meta.url),'utf8')).replace("import('/recipes.js')","loadRecipes()");
  await vm.runInNewContext(`(async()=>{${script}\n})()`,context);
  const find=(label)=>walk(nodes.reader).find(n=>n.attributes['aria-label']===label);
  const button=(text)=>walk(nodes.reader).find(n=>n.tag==='button'&&n.textContent===text);
  const cards=()=>walk(nodes.reader).filter(n=>n.className==='k-recipe-card').map(n=>n.children[1].textContent);
  return {nodes,find,button,cards,calls,location,hold(query){let release;held.set(query,new Promise(resolve=>{release=resolve;}));return ()=>{held.delete(query);release();};},async navigate(value){location.hash=value;await hashListener();},async follow(node){node.onclick?await node.onclick():location.hash=node.href;await hashListener();},async back(){currentHash=historyEntries[--position];await hashListener();},async forward(){currentHash=historyEntries[++position];await hashListener();}};
}
test('global search opens matching kitchen results through detail, guide, Back/Forward, clearing and repeated searches',async t=>{
  const u=await ui(t);u.nodes.query.value='venison';await u.nodes.query.oninput();
  assert.match(u.nodes.catalog.children[0].textContent,/1 matching recipes/);
  await u.follow(u.nodes.catalog.children[0]);
  assert.equal(u.find('Find recipes').value,'venison');assert.equal(u.find('Recipe area').value,'');assert.equal(u.find('Skill level').value,'');assert.deepEqual(u.cards(),['Venison skillet']);
  await u.follow(walk(u.nodes.reader).find(n=>n.className==='k-recipe-card'));
  assert.match(u.location.hash,/recipe\/venison\?q=venison/);
  const guide=walk(u.nodes.reader).find(n=>n.tag==='a'&&n.textContent==='Pan basics ↗');assert.match(guide.href,/q=venison/);await u.follow(guide);
  await u.back();assert(u.button('← Results for “venison”'));await u.back();assert.deepEqual(u.cards(),['Venison skillet']);await u.forward();assert(u.button('← Results for “venison”'));
  await u.follow(u.button('← Results for “venison”'));assert.deepEqual(u.cards(),['Venison skillet']);
  const level=u.find('Skill level');level.value='Simple';await level.onchange();assert.deepEqual(u.cards(),[]);assert.match(u.nodes.reader.textContent,/No recipes match/);
  const query=u.find('Find recipes');query.value='';await query.oninput();assert.equal(u.find('Skill level').value,'Simple');assert.deepEqual(u.cards(),['Plain rice']);
  query.value='nosuchfood';await query.oninput();assert.deepEqual(u.cards(),[]);query.value='   ';await query.oninput();assert.deepEqual(u.cards(),['Plain rice']);
  await u.follow(u.button('← Library'));u.nodes.query.value='rice';await u.nodes.query.oninput();await u.follow(u.nodes.catalog.children[0]);assert.deepEqual(u.cards(),['Plain rice']);
  await u.follow(u.button('← Library'));u.nodes.query.value='venison';await u.nodes.query.oninput();await u.follow(u.nodes.catalog.children[0]);assert.deepEqual(u.cards(),['Venison skillet']);assert.equal(u.find('Skill level').value,'');
});
test('fresh direct links, empty query, guide-only query and legacy recipe links remain explicit',async t=>{
  const u=await ui(t,'#test-kitchen?q=venison');assert.deepEqual(u.cards(),['Venison skillet']);
  await u.navigate('#test-kitchen?q=steady+flame');assert.deepEqual(u.cards(),[]);assert.match(u.nodes.reader.textContent,/Kitchen guides matching “steady flame”/);
  await u.navigate('#test-kitchen?q=');assert.equal(u.cards().length,2);
  await u.navigate('#test-kitchen');assert.deepEqual(u.cards(),['Plain rice']);
  await u.navigate('#test-kitchen/recipe/venison');assert(u.button('← Recipes'));
});
test('an older recipe response cannot replace a newer search or URL',async t=>{
  const u=await ui(t,'#test-kitchen?q=venison'),release=u.hold('rice'),query=u.find('Find recipes');
  query.value='rice';const older=query.oninput();assert.deepEqual(u.cards(),[]);
  query.value='venison';await query.oninput();assert.deepEqual(u.cards(),['Venison skillet']);
  release();await older;assert.deepEqual(u.cards(),['Venison skillet']);assert.match(u.location.hash,/q=venison/);
});
test('HTTP library counts and recipe/guide results agree without crossing recipe boundaries',async t=>{
  const root=await mkdtemp(path.join(os.tmpdir(),'dewey-search-'));t.after(()=>rm(root,{recursive:true,force:true}));const source=path.join(root,'library'),index=path.join(root,'index');await install(source);
  const manifestPath=path.join(source,'manifest.json'),manifest=JSON.parse(await readFile(manifestPath)),bytes=Buffer.from(JSON.stringify(pack));await writeFile(path.join(source,'test-kitchen.txt'),bytes);manifest.documents.push({id:doc.id,title:doc.title,topic:'Recipes',file:'test-kitchen.txt',format:'recipes-v1',license:'CC0-1.0',provenance:'Synthetic test fixture',sha256:hash(bytes)});await writeFile(manifestPath,JSON.stringify(manifest));
  const server=await createApp({source,index});await new Promise(r=>server.listen(0,'127.0.0.1',r));t.after(()=>new Promise(r=>server.close(r)));const base='http://127.0.0.1:'+server.address().port,get=async p=>(await fetch(base+p)).json();
  const catalog=await get('/api/catalog?q=venison');assert.equal(catalog.documents.length,1);assert.equal(catalog.documents[0].matchingRecipeCount,1);assert.equal(catalog.documents[0].matchingGuideCount,0);
  assert.equal((await get('/api/recipes/test-kitchen?q=venison')).total,1);
  assert.equal((await get('/api/recipes/test-kitchen?q=venison&difficulty=Simple')).total,0);
  assert.equal((await get('/api/catalog?q=venison+rice')).documents.length,0);
  assert.equal((await get('/api/catalog?q=steady+flame')).documents[0].matchingGuideCount,1);
  assert.equal((await get('/api/recipes/test-kitchen?q=steady+flame')).matchingGuides.length,1);
});
