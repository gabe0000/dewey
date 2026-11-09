import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readFile,writeFile,rm,symlink,readdir} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {bibleBooks,parseGutenbergKJV,parseBasicEnglish,chapter,searchVerses} from '../src/bible.mjs';
import {collection,sourceDocument,install,rebuild,search,hash} from '../src/library.mjs';
import {createApp} from '../src/server.mjs';
import {importKJV} from '../scripts/import-kjv.mjs';
import {importBible} from '../scripts/import-bible.mjs';

// Synthetic structure only. No downloaded Bible or copyrighted translation is bundled.
function fixtureText(complete=true){
  const titles=bibleBooks.map(b=>'Book heading '+b.name);
  const books=bibleBooks.map((b,i)=>{
    const count=complete?471+(i<16?1:0):2;
    const verses=Array.from({length:count},(_,n)=>`${Math.floor(n/30)+1}:${n%30+1} Synthetic text for ${b.name}, passage ${n+1}.`);
    // Mix line-start and inline markers, as in the real Gutenberg edition.
    return titles[i]+'\n\n'+verses.join(i%2?'\n\n':' ')+'\n';
  });
  return '*** START OF THE PROJECT GUTENBERG EBOOK SYNTHETIC TEST ***\n'+titles.join('\n')+'\n\n'+books.join('\n')+'\n*** END OF THE PROJECT GUTENBERG EBOOK SYNTHETIC TEST ***\nSynthetic license record.\n';
}
function fixtureVPL(complete=true){
  const codes='GEN EXO LEV NUM DEU JOS JDG RUT 1SA 2SA 1KI 2KI 1CH 2CH EZR NEH EST JOB PSA PRO ECC SOL ISA JER LAM EZE DAN HOS JOE AMO OBA JON MIC NAH HAB ZEP HAG ZEC MAL MAT MAR LUK JOH ACT ROM 1CO 2CO GAL EPH PHI COL 1TH 2TH 1TI 2TI TIT PHM HEB JAM 1PE 2PE 1JO 2JO 3JO JUD REV'.split(' ');
  return codes.map((code,i)=>Array.from({length:complete?471+(i<16?1:0):2},(_,n)=>`${code} ${Math.floor(n/30)+1}:${n%30+1} Synthetic simple text for book ${i+1}.`).join('\n')).join('\n')+'\n';
}
async function fixture(t){
  const root=await mkdtemp(path.join(os.tmpdir(),'dewey-bible-'));
  t.after(()=>rm(root,{recursive:true,force:true}));
  const source=path.join(root,'library');await install(source);
  return {root,source,index:path.join(root,'local-index'),file:path.join(root,'download.txt')};
}
test('Bible parser handles inline markers, book order, references, ranges and bounded search',()=>{
  const bible=parseGutenbergKJV(fixtureText());
  assert.equal(bible.bookCount,66);assert.equal(bible.verseCount,31102);
  assert.equal(searchVerses(bible,'John3:16').matches[0].reference,'John 3:16');
  assert.equal(searchVerses(bible,'1 Corinthians 13:4-7').total,4);
  assert.equal(searchVerses(bible,'Psalm 1').total,30);
  assert.equal(searchVerses(bible,'Gen 1:2').matches[0].reference,'Genesis 1:2');
  assert.equal(searchVerses(bible,'SYNTHETIC passage').total,31102);
  assert.equal(searchVerses(bible,'Synthetic',3).matches.length,3);
  assert.equal(searchVerses(bible,'Synthetic nonexistentword').total,0);
  assert.equal(searchVerses(bible,'John 999:1').total,0);
  assert.equal(searchVerses(bible,'John 3:0').total,0);
  assert.equal(searchVerses(bible,'John 3:7-4').total,0);
  assert.equal(searchVerses(bible,'').total,0);
  assert.equal(chapter(bible,'genesis',1).previous,null);
  assert.deepEqual(chapter(bible,'exodus',1).previous,{book:'genesis',chapter:16});
  assert.equal(chapter(bible,'revelation',16).next,null);
  assert.throws(()=>chapter(bible,'not-a-book',1),/not found/);
});
test('Bible parser refuses incomplete, missing or duplicate verse structures',()=>{
  const small=fixtureText(false);
  assert.throws(()=>parseGutenbergKJV(small),/31,102/);
  assert.equal(parseGutenbergKJV(small,{requireComplete:false}).verseCount,132);
  assert.throws(()=>parseGutenbergKJV(small.replace('1:2 Synthetic','1:1 Synthetic'),{requireComplete:false}),/duplicate/);
  assert.throws(()=>parseGutenbergKJV(small.replace('1:2 Synthetic','1:3 Synthetic'),{requireComplete:false}),/Missing/);
  assert.throws(()=>parseGutenbergKJV(small.replace('*** END OF','END OF')),/complete/);
});
test('KJV import preserves original bytes and previous manifest, refuses overwrite and rebuilds separately',async t=>{
  const f=await fixture(t);const text=fixtureText();await writeFile(f.file,text);
  const before=await readFile(path.join(f.source,'manifest.json'));
  const result=await importKJV(f.file,f.source);
  assert.equal(result.books,66);assert.equal(result.verses,31102);
  assert.equal(result.sha256,hash(Buffer.from(text)));
  assert.equal(await readFile(path.join(f.source,'bible-kjv.txt'),'utf8'),text);
  assert.deepEqual(await readFile(path.join(f.source,result.previousManifest)),before);
  const manifest=JSON.parse(await readFile(path.join(f.source,'manifest.json')));
  assert.equal(manifest.documents.length,4);
  assert.equal(manifest.documents.at(-1).file,'bible-kjv.txt');
  await assert.rejects(importKJV(f.file,f.source),/already installed/);
  assert(!(await readdir(f.source)).includes('.import-kjv.lock'));
  const docs=await rebuild(f.source,f.index);
  assert.equal(docs.at(-1).bible.verseCount,31102);
  assert.equal(search(docs,'John3:16')[0].id,'bible-kjv');
  assert.equal(search(docs,'John 999:1').length,0);
  const first=JSON.parse(await readFile(path.join(f.index,'catalog.json')));
  await rm(f.index,{recursive:true});
  await rebuild(f.source,f.index);
  assert.deepEqual(JSON.parse(await readFile(path.join(f.index,'catalog.json'))).documents,first.documents);
});
test('rejected imports preserve the installed collection and reject symbolic inputs',async t=>{
  const f=await fixture(t);await writeFile(f.file,'not a Bible');
  const before=await readFile(path.join(f.source,'manifest.json'));
  await assert.rejects(importKJV(f.file,f.source),/complete/);
  assert.deepEqual(await readFile(path.join(f.source,'manifest.json')),before);
  assert.equal((await collection(f.source)).length,3);
  const link=path.join(f.root,'link');await symlink(f.file,link);
  await assert.rejects(importKJV(link,f.source),/regular file/);
});
test('Bible HTTP responses keep catalogs small, support passages and verify original bytes',async t=>{
  const f=await fixture(t);await writeFile(f.file,fixtureText());await importKJV(f.file,f.source);
  const server=await createApp(f);await new Promise(r=>server.listen(0,'127.0.0.1',r));
  t.after(()=>new Promise(r=>server.close(r)));
  const base=`http://127.0.0.1:${server.address().port}`;
  const get=async url=>{const r=await fetch(base+url);assert.equal(r.status,200);return r.json();};
  const listing=await get('/api/catalog?topic=Bibles');
  assert.equal(listing.documents.length,1);assert.equal(listing.documents[0].bible,undefined);assert.equal(listing.documents[0].text,undefined);assert.equal(listing.documents[0].verseCount,31102);
  const meta=await get('/api/source/bible-kjv');assert.equal(meta.books.length,66);assert.equal(meta.text,undefined);
  const results=await get('/api/bible/bible-kjv?q=John%203%3A16');assert.equal(results.total,1);assert.equal(results.matches[0].reference,'John 3:16');
  assert.equal((await get('/api/bible/bible-kjv?book=john&chapter=3')).verses.length,30);
  assert.equal((await fetch(base+'/api/bible/bible-kjv?chapter=999')).status,404);
  assert.equal((await fetch(base+'/api/bible/unknown')).status,404);
  assert.equal(await (await fetch(base+'/api/original/bible-kjv')).text(),fixtureText());
  await writeFile(path.join(f.source,'bible-kjv.txt'),'tampered');
  assert.equal((await fetch(base+'/api/bible/bible-kjv?book=john&chapter=3')).status,409);
  assert.equal((await fetch(base+'/api/original/bible-kjv')).status,409);
});
test('Basic English parser maps numbered books and refuses missing or duplicate verses',()=>{
  const text=fixtureVPL();const bible=parseBasicEnglish(text);
  assert.equal(bible.bookCount,66);assert.equal(bible.verseCount,31102);assert.equal(bible.translation,'BBE');
  assert.equal(searchVerses(bible,'John3:16').matches[0].reference,'John 3:16');
  assert.equal(searchVerses(bible,'1 John 1:1').matches[0].book,'1-john');
  assert.throws(()=>parseBasicEnglish(fixtureVPL(false)),/31,102/);
  assert.throws(()=>parseBasicEnglish(text.replace('GEN 1:2','GEN 1:1')),/duplicate/);
  assert.throws(()=>parseBasicEnglish(text.replace('GEN 1:2','GEN 1:3')),/Missing/);
  assert.throws(()=>parseBasicEnglish(text.replace('GEN 1:1','XXX 1:1')),/book/);
});
test('Basic English import preserves text and source archive, and rejects attachment tampering',async t=>{
  const f=await fixture(t);const text=fixtureVPL();await writeFile(f.file,text);
  const archiveFile=path.join(f.root,'source.zip');
  // Opaque preservation fixture; the importer does not execute or extract archive contents.
  const archive=Buffer.concat([Buffer.from([80,75,3,4]),Buffer.from('Synthetic archive preservation fixture')]);
  await writeFile(archiveFile,archive);
  await assert.rejects(importBible('bbe',f.file,f.source),/original.*ZIP/);
  const result=await importBible('bbe',f.file,f.source,archiveFile);
  assert.equal(result.id,'bible-bbe');assert.equal(result.verses,31102);
  assert.equal(await readFile(path.join(f.source,'bible-bbe.txt'),'utf8'),text);
  assert.deepEqual(await readFile(path.join(f.source,'bible-bbe-original.zip')),archive);
  const doc=await sourceDocument(f.source,'bible-bbe');assert.equal(doc.attachments[0].sha256,hash(archive));
  assert.equal((await rebuild(f.source,f.index)).at(-1).bible.translation,'BBE');
  await writeFile(path.join(f.source,'bible-bbe-original.zip'),'tampered archive');
  await assert.rejects(collection(f.source),/Checksum mismatch/);
  await assert.rejects(sourceDocument(f.source,'bible-bbe'),/Checksum mismatch/);
  assert.equal((await sourceDocument(f.source,'a-small-library')).verified,true);
});
test('attachment paths cannot leave the library or follow symbolic files',async t=>{
  const f=await fixture(t);const manifest=path.join(f.source,'manifest.json');
  const data=JSON.parse(await readFile(manifest));
  data.documents[0].attachments=[{file:'../outside.zip',sha256:'a'.repeat(64)}];
  await writeFile(manifest,JSON.stringify(data));
  await assert.rejects(collection(f.source),/attachment path/);
  const name='a-small-library-extra.zip';
  data.documents[0].attachments=[{file:name,sha256:'a'.repeat(64)}];
  await writeFile(manifest,JSON.stringify(data));
  await symlink(path.join(f.source,'a-reading-log.txt'),path.join(f.source,name));
  await assert.rejects(collection(f.source),/regular file/);
});
