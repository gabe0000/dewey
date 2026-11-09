import http from 'node:http';
import path from 'node:path';
import {readFile} from 'node:fs/promises';
import {randomBytes, timingSafeEqual} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {collection, sourceDocument, install, rebuild, search} from './library.mjs';
import {bookList,chapter,searchVerses} from './bible.mjs';
import {recipeCatalog,ingredientList,searchRecipes,searchGuides} from './recipes.mjs';
import {readHousehold,writeHousehold} from './household.mjs';
import {findPages} from './pdf.mjs';
import {foodReview,matchRecipe,simulatePlans,ingredientKey} from './kitchen.mjs';
const project = fileURLToPath(new URL('../',import.meta.url));
export async function createApp({source=process.env.DEWEY_LIBRARY_ROOT || process.env.DEWEY_SOURCES || path.resolve(project,'../dewey-library'), index=process.env.DEWEY_INDEX || path.resolve(project,'../dewey-cache'), household=process.env.DEWEY_HOUSEHOLD_ROOT,setup=process.env.DEWEY_SETUP === '1'}={}) {
  if(household){
    if(!path.isAbsolute(household))throw Error('Household storage must use an absolute path');
    for(const root of [source,index])for(const [a,b] of [[root,household],[household,root]]){const rel=path.relative(a,b);if(!rel||(!rel.startsWith('..')&&!path.isAbsolute(rel)))throw Error('Household storage must be separate from originals and index');}
  }
  let docs = await rebuild(source,index);
  const token = randomBytes(32).toString('hex');
  const plannerToken=randomBytes(32).toString('hex');
  if(household)await readHousehold(household);
  const pack=id=>docs.find(d=>d.id===id)?.recipePack;
  const lookup=(collectionId,recipeId)=>pack(collectionId)?.recipes.find(r=>r.id===recipeId);
  const ingredientInfo=key=>docs.flatMap(d=>d.recipePack?ingredientList(d.recipePack):[]).find(i=>i.key===ingredientKey(key));
  async function verifiedPack(id){const cached=docs.find(d=>d.id===id&&d.recipePack);if(!cached)return undefined;const fresh=await sourceDocument(source,id);if(!fresh||fresh.sha256!==cached.sha256)throw Error('Recipe source changed; restart Dewey to rebuild its index');return cached.recipePack;}
  let installing = false;
  const server = http.createServer(async (req,res) => {
    const send = (code, value, type='application/json') => {
      res.writeHead(code,{'Content-Type':type,'Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Content-Security-Policy':"default-src 'self'; script-src 'self' 'wasm-unsafe-eval'; worker-src 'self'; style-src 'self'; object-src 'none'; frame-ancestors 'none'; base-uri 'none'",'Referrer-Policy':'no-referrer'});
      res.end(type === 'application/json' ? JSON.stringify(value) : value);
    };
    try {
      // Reject DNS rebinding. Publication is deliberately unsupported.
      if(!/^(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/.test(req.headers.host || '')) return send(403,{error:'Localhost only'});
      const url = new URL(req.url,'http://localhost');
      if(req.method === 'GET' && url.pathname === '/api/status') return send(200,{count:docs.length,setup,source,index,token:setup?token:undefined,plannerEnabled:Boolean(household),plannerToken:household?plannerToken:undefined});
      if(url.pathname==='/api/household'){
        if(req.method==='GET'){
          const state=await readHousehold(household);return send(200,{state,enabled:Boolean(household),review:Object.fromEntries(state.inventory.map(l=>[l.id,foodReview(l)])),plan:simulatePlans(state,lookup,{checkBasics:url.searchParams.get('checkBasics')==='1'})});
        }
        if(req.method==='POST'){
          const supplied=Buffer.from(req.headers['x-dewey-planner-token']||'');
          if(!household||supplied.length!==plannerToken.length||!timingSafeEqual(supplied,Buffer.from(plannerToken)))return send(403,{error:'Planner session changed; reload before saving'});
          if(req.headers.origin&&req.headers.origin!==`http://${req.headers.host}`)return send(403,{error:'Origin rejected'});
          if(!req.headers['content-type']?.startsWith('application/json'))return send(415,{error:'Use a JSON request'});
          const chunks=[];let size=0;for await(const chunk of req){size+=chunk.length;if(size>65536)return send(413,{error:'Household action is too large'});chunks.push(chunk);}
          let body;try{body=JSON.parse(Buffer.concat(chunks).toString('utf8'));}catch{return send(400,{error:'Invalid JSON request'});}
          if(!body||!Number.isInteger(body.revision)||typeof body.action!=='string'||!body.data||typeof body.data!=='object'||Array.isArray(body.data))return send(400,{error:'Invalid household action'});
          const collectionId=body.data.collectionId||(body.action==='confirmCook'?(await readHousehold(household)).plans.find(p=>p.id===body.data.planId)?.collectionId:undefined);
          if(collectionId&&!await verifiedPack(collectionId))return send(404,{error:'Recipe collection not found'});
          const state=await writeHousehold(household,body.revision,body.action,body.data,{lookup,pack,ingredientInfo});return send(200,{revision:state.revision});
        }
        return send(405,{error:'Method not allowed'});
      }
      if(req.method === 'POST' && url.pathname === '/api/install') {
        const supplied = Buffer.from(req.headers['x-dewey-token'] || '');
        if(!setup || supplied.length !== token.length || !timingSafeEqual(supplied,Buffer.from(token))) return send(403,{error:'Setup is disabled or token is invalid'});
        if(req.headers.origin && req.headers.origin !== `http://${req.headers.host}`) return send(403,{error:'Origin rejected'});
        if(installing) return send(409,{error:'Installation already running'});
        installing = true;
        try {await install(source); docs = await rebuild(source,index); return send(200,{count:docs.length});}
        finally {installing = false;}
      }
      if(req.method !== 'GET') return send(405,{error:'Method not allowed'});
      if(url.pathname === '/api/catalog') return send(200,{topics:[...new Set(docs.map(d=>d.topic))].sort(),documents:search(docs,url.searchParams.get('q')||'',url.searchParams.get('topic')||'').map(({text,bytes,pdf,lessonPack,bible,recipePack,...d})=>({...d,...(pdf?{kind:'pdf',pageCount:pdf.pageCount}:lessonPack?{kind:'lessons',lessonCount:lessonPack.lessons.length}:bible?{kind:'bible',bookCount:bible.bookCount,verseCount:bible.verseCount}:recipePack?{kind:'recipes',recipeCount:recipePack.recipes.length,homesteadCount:recipePack.recipes.filter(r=>r.section==='Homestead').length,matchingRecipeCount:searchRecipes(recipePack,url.searchParams.get('q')||'').length,matchingGuideCount:searchGuides(recipePack,url.searchParams.get('q')||'').length}:{})}))});
      const learningRoute=url.pathname.match(/^\/api\/(pdf|lessons)\/([a-z0-9-]+)$/);
      if(learningRoute){
        const [,kind,id]=learningRoute,cached=docs.find(d=>d.id===id&&(kind==='pdf'?d.pdf:d.lessonPack));
        if(!cached)return send(404,{error:'Learning source not found'});
        const fresh=await sourceDocument(source,id);if(!fresh||fresh.sha256!==cached.sha256)throw Error('Source changed; restart Dewey to rebuild its index');
        if(kind==='lessons')return send(200,cached.lessonPack);
        if(url.searchParams.has('q'))return send(200,findPages(cached.pdf,url.searchParams.get('q')));
        const n=Number(url.searchParams.get('page')||1),page=cached.pdf.pages.find(p=>p.number===n);
        return page?send(200,{...page,pageCount:cached.pdf.pageCount,textQuality:cached.pdf.textQuality}):send(404,{error:'PDF page not found'});
      }
      const recipesRoute=url.pathname.match(/^\/api\/recipes\/([a-z0-9-]+)(?:\/(recipe|guide)\/([a-z0-9-]+))?$/);
      if(recipesRoute){
        const [,,kind,id]=recipesRoute,p=kind?await verifiedPack(recipesRoute[1]):pack(recipesRoute[1]);
        if(!p)return send(404,{error:'Recipe collection not found'});
        const state=await readHousehold(household);
        if(!kind)return send(200,recipeCatalog(p,state,Object.fromEntries(url.searchParams)));
        if(kind==='guide'){const guide=p.guides.find(g=>g.id===id);return guide?send(200,{...guide,references:p.references}):send(404,{error:'Guide not found'});}
        const recipe=p.recipes.find(r=>r.id===id);const servings=url.searchParams.has('servings')?Number(url.searchParams.get('servings')):recipe?.servings;
        if(recipe&&(!Number.isFinite(servings)||servings<=0||servings>1000000))return send(400,{error:'Invalid portions'});
        return recipe?send(200,{recipe,match:matchRecipe(recipe,state,{servings,checkBasics:url.searchParams.get('checkBasics')==='1'}),guides:p.guides.map(({id,title})=>({id,title}))}):send(404,{error:'Recipe not found'});
      }
      const bibleRoute=url.pathname.match(/^\/api\/bible\/([a-z0-9-]+)$/);
      if(bibleRoute){
        const doc=docs.find(d=>d.id===bibleRoute[1]&&d.bible);
        if(!doc)return send(404,{error:'Bible not found'});
        if(url.searchParams.has('q'))return send(200,{...searchVerses(doc.bible,url.searchParams.get('q')),translation:doc.translation,indexVerified:true});
        const fresh=await sourceDocument(source,doc.id);
        if(!fresh||fresh.sha256!==doc.sha256)throw Error('Source changed; restart Dewey to rebuild its index');
        try{return send(200,{...chapter(doc.bible,url.searchParams.get('book')||'genesis',url.searchParams.get('chapter')||1),translation:doc.translation,verified:true});}
        catch(error){return send(404,{error:error.message});}
      }
      if(url.pathname.startsWith('/api/original/')){
        const doc=await sourceDocument(source,url.pathname.slice('/api/original/'.length));
        return doc?send(200,doc.bytes||doc.text,doc.format==='pdf-v1'?'application/pdf':'text/plain; charset=utf-8'):send(404,{error:'Source not found'});
      }
      if(url.pathname.startsWith('/api/source/')) {
        const id = url.pathname.slice('/api/source/'.length);
        // Read and reverify source at viewing time, not only at startup.
        const doc = await sourceDocument(source,id);
        if(doc?.format==='pdf-v1'||doc?.format==='lessons-v1'){
          const cached=docs.find(d=>d.id===id);if(!cached||cached.sha256!==doc.sha256)throw Error('Source changed; restart Dewey to rebuild its index');
          const {bytes,text,...metadata}=doc;
          return send(200,{...metadata,...(cached.pdf?{kind:'pdf',pageCount:cached.pdf.pageCount,textQuality:cached.pdf.textQuality}:{kind:'lessons',lessonCount:cached.lessonPack.lessons.length})});
        }
        if(doc?.format==='recipes-v1'){
          const p=await verifiedPack(id);return send(200,{...doc,text:undefined,kind:'recipes',recipeCount:p.recipes.length,homesteadCount:p.recipes.filter(r=>r.section==='Homestead').length});
        }
        if(doc?.format){
          const cached=docs.find(d=>d.id===id&&d.bible);
          if(!cached||cached.sha256!==doc.sha256)throw Error('Source changed; restart Dewey to rebuild its index');
          const {text,...metadata}=doc;
          return send(200,{...metadata,kind:'bible',books:bookList(cached.bible),bookCount:cached.bible.bookCount,verseCount:cached.bible.verseCount});
        }
        return doc ? send(200,doc) : send(404,{error:'Source not found'});
      }
      if(url.pathname==='/vendor/pdfjs/LICENSE')return send(200,await readFile(path.join(project,'node_modules/pdfjs-dist/LICENSE')),'text/plain; charset=utf-8');
      const vendor=url.pathname.match(/^\/vendor\/pdfjs\/(build\/(?:pdf|pdf.worker)\.mjs|(?:cmaps|standard_fonts|wasm|iccs)\/[a-zA-Z0-9_.-]+)$/);
      if(vendor){const name=vendor[1];try{return send(200,await readFile(path.join(project,'node_modules/pdfjs-dist',name)),name.endsWith('.mjs')?'text/javascript':name.endsWith('.wasm')?'application/wasm':'application/octet-stream');}catch(e){if(e.code==='ENOENT')return send(404,{error:'PDF asset not found'});throw e;}}
      if(url.pathname==='/agent.md')return send(200,await readFile(path.join(project,'docs/agent-bootstrap.md')),'text/plain; charset=utf-8');
      const assets = {'/.well-known/dewey.json':['dewey-agent.json','application/json; charset=utf-8'],'/learning.js':['learning.js','text/javascript; charset=utf-8'],'/learning.css':['learning.css','text/css; charset=utf-8'],'/':['index.html','text/html; charset=utf-8'],'/app.js':['app.js','text/javascript; charset=utf-8'],'/recipes.js':['recipes.js','text/javascript; charset=utf-8'],'/style.css':['style.css','text/css; charset=utf-8'],'/recipes.css':['recipes.css','text/css; charset=utf-8']};
      if(assets[url.pathname]) {const [file,type]=assets[url.pathname]; return send(200,await readFile(path.join(project,'public',file)),type);}
      return send(404,{error:'Not found'});
    } catch(e) {send(409,{error:e.message});}
  });
  return server;
}
if(process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const server = await createApp();
  const port = Number(process.env.PORT || 8080);
  const host = process.env.HOST || '127.0.0.1';
  server.listen(port,host,()=>console.log(`Dewey listening on ${host}:${port}; setup ${process.env.DEWEY_SETUP === '1' ? 'enabled' : 'disabled'}`));
}
