import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
import {previewConfig, startPreview} from '../scripts/start-preview.mjs';

test('preview requires explicit absolute separate storage and disables setup', async () => {
  assert.throws(() => previewConfig({}), /absolute paths/);
  assert.throws(() => previewConfig({DEWEY_LIBRARY_ROOT:'relative',DEWEY_INDEX:'/cache'}), /absolute paths/);
  assert.throws(() => previewConfig({DEWEY_LIBRARY_ROOT:'/same',DEWEY_INDEX:'/same'}), /separate/);
  assert.throws(() => previewConfig({DEWEY_LIBRARY_ROOT:'/library',DEWEY_INDEX:'/cache',PORT:'bad'}), /PORT/);
  for(const household of ['/library/private','/cache','/'])assert.throws(()=>previewConfig({DEWEY_LIBRARY_ROOT:'/library',DEWEY_INDEX:'/cache',DEWEY_HOUSEHOLD_ROOT:household}),/separate/);
  assert.deepEqual(previewConfig({DEWEY_LIBRARY_ROOT:'/library',DEWEY_INDEX:'/cache',DEWEY_SETUP:'1'}), {source:'/library',index:'/cache',port:8080,setup:false});
  await assert.rejects(startPreview({DEWEY_LIBRARY_ROOT:'/nonexistent-dewey-test-library',DEWEY_INDEX:'/nonexistent-dewey-test-cache'}), /No installed collection/);
});

test('offline UI clears stale content, preserves query, and retries successfully', async () => {
  const node = () => ({value:'',textContent:'',children:[],options:[{}],append(...items){this.children.push(...items);},replaceChildren(...items){this.children=items;}});
  const nodes = Object.fromEntries(['status','catalog','reader','query','topic','filters','install','setup'].map(id => [id,node()]));
  nodes.query.value = 'checksum';
  nodes.catalog.children = ['stale result'];
  let online = false;
  const context = {
    document:{getElementById:id=>nodes[id],createElement:node},
    window:{addEventListener(){}}, location:{hash:'#test'},
    fetch:async url=>{if(!online)throw TypeError('Failed to fetch');return {ok:true,json:async()=>url.startsWith('/api/source/') ? {id:'test',topic:'Storage',title:'Checksum',license:'CC0-1.0',text:'Restored source',provenance:'Test',file:'test.txt',sha256:'test'} : {topics:['Storage'],documents:[{id:'test',topic:'Storage',title:'Checksum',license:'CC0-1.0'}]}};}
  };
  const script = await readFile(new URL('../public/app.js',import.meta.url),'utf8');
  await vm.runInNewContext(`(async()=>{${script}\n})()`,context);
  assert.match(nodes.status.textContent,/local server is not running/);
  assert.equal(nodes.catalog.children.length,0);
  assert.equal(nodes.query.value,'checksum');
  assert.match(nodes.reader.children[1].textContent,/search is preserved/);
  online = true;
  await nodes.query.oninput();
  assert.equal(nodes.catalog.children.length,1);
  assert.match(nodes.status.textContent,/1 source/);
  assert.equal(nodes.query.value,'checksum');
  await nodes.catalog.children[0].onclick();
  assert.equal(context.location.hash, '#test');
  assert.equal(nodes.reader.children[3].textContent, 'Restored source');
});
