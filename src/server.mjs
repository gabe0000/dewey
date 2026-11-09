import http from 'node:http';
import path from 'node:path';
import {readFile} from 'node:fs/promises';
import {randomBytes, timingSafeEqual} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {collection, sourceDocument, install, rebuild, search} from './library.mjs';
import {bookList,chapter,searchVerses} from './bible.mjs';
const project = fileURLToPath(new URL('../',import.meta.url));
export async function createApp({source=process.env.DEWEY_LIBRARY_ROOT || process.env.DEWEY_SOURCES || path.resolve(project,'../dewey-library'), index=process.env.DEWEY_INDEX || path.resolve(project,'../dewey-cache'), setup=process.env.DEWEY_SETUP === '1'}={}) {
  let docs = await rebuild(source,index);
  const token = randomBytes(32).toString('hex');
  let installing = false;
  const server = http.createServer(async (req,res) => {
    const send = (code, value, type='application/json') => {
      res.writeHead(code,{'Content-Type':type,'Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Content-Security-Policy':"default-src 'self'; script-src 'self'; style-src 'self'; object-src 'none'; frame-ancestors 'none'; base-uri 'none'",'Referrer-Policy':'no-referrer'});
      res.end(type === 'application/json' ? JSON.stringify(value) : value);
    };
    try {
      // Reject DNS rebinding. Publication is deliberately unsupported.
      if(!/^(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/.test(req.headers.host || '')) return send(403,{error:'Localhost only'});
      const url = new URL(req.url,'http://localhost');
      if(req.method === 'GET' && url.pathname === '/api/status') return send(200,{count:docs.length,setup,source,index,token:setup?token:undefined});
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
      if(url.pathname === '/api/catalog') return send(200,{topics:[...new Set(docs.map(d=>d.topic))].sort(),documents:search(docs,url.searchParams.get('q')||'',url.searchParams.get('topic')||'').map(({text,bible,...d})=>({...d,...(bible?{kind:'bible',bookCount:bible.bookCount,verseCount:bible.verseCount}:{})}))});
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
        return doc?send(200,doc.text,'text/plain; charset=utf-8'):send(404,{error:'Source not found'});
      }
      if(url.pathname.startsWith('/api/source/')) {
        const id = url.pathname.slice('/api/source/'.length);
        // Read and reverify source at viewing time, not only at startup.
        const doc = await sourceDocument(source,id);
        if(doc?.format){
          const cached=docs.find(d=>d.id===id&&d.bible);
          if(!cached||cached.sha256!==doc.sha256)throw Error('Source changed; restart Dewey to rebuild its index');
          const {text,...metadata}=doc;
          return send(200,{...metadata,kind:'bible',books:bookList(cached.bible),bookCount:cached.bible.bookCount,verseCount:cached.bible.verseCount});
        }
        return doc ? send(200,doc) : send(404,{error:'Source not found'});
      }
      const assets = {'/':['index.html','text/html; charset=utf-8'],'/app.js':['app.js','text/javascript; charset=utf-8'],'/style.css':['style.css','text/css; charset=utf-8']};
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
