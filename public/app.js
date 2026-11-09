const $ = id => document.getElementById(id);
let token, sequence=0;
const el = (tag,text) => {const n=document.createElement(tag); n.textContent=text; return n;};
function showError(error) {
  $('status').textContent = error.message;
  if (error.offline) {
    sequence++;
    readerSequence++;
    $('catalog').replaceChildren();
    $('reader').replaceChildren(el('h2', 'Local server unavailable'), el('p', 'Your library files are unchanged. Your search is preserved; press Enter to retry after restarting the preview.'));
  }
}
async function api(url,options) {
    let r;
    try { r = await fetch(url,options); }
    catch {
      const error = Error('Dewey’s local server is not running. Restart the preview, then reload.');
      error.offline = true;
      throw error;
    }
    const body=await r.json();
    if(!r.ok) throw Error(body.error);
    return body;}
async function catalog() {
  const seq=++sequence;
  try {
    const data=await api(`/api/catalog?q=${encodeURIComponent($('query').value)}&topic=${encodeURIComponent($('topic').value)}`);
    if(seq!==sequence)return;
    if($('topic').options.length===1) for(const t of data.topics) {const option=el('option',t);option.value=t;
    $('topic').append(option);}
    $('catalog').replaceChildren();
    for(const d of data.documents) {const button=el('button','');
      button.className='book';
      button.append(el('small',d.topic),el('h2',d.title),el('span',d.kind==='bible'?`${d.translation} · ${d.bookCount} books · ${d.verseCount.toLocaleString()} verses →`:`${d.license} · verified source →`));
      button.onclick=()=>{
        const nextHash = '#' + encodeURIComponent(d.id);
        if (location.hash === nextHash) return view(d.id);
        location.hash = nextHash;
      };
    $('catalog').append(button);}
    $('status').textContent=`${data.documents.length} text${data.documents.length===1?'':'s'} on this shelf`;
  } catch(e) {if(seq===sequence)showError(e);}
}
let readerSequence=0;
async function view(id,book,chapterNumber,verseNumber) {const seq=++readerSequence;try {const d=await api('/api/source/'+encodeURIComponent(id));
    if(seq!==readerSequence)return;
    if(d.kind==='bible')return await bibleView(d,book,chapterNumber,verseNumber,seq);
    const close=el('button','← Close source');close.onclick=()=>{location.hash='';};
    $('reader').replaceChildren(close,el('small',d.topic),el('h2',d.title),el('pre',d.text),el('h3','Source record'),el('p',`Provenance: ${d.provenance}`),el('p',`License: ${d.license}`),el('p',`File: ${d.file}`),el('p',`SHA-256 (verified now): ${d.sha256}`));} catch(e) {if(seq===readerSequence)showError(e);}}
function openChapter(id,book,chapterNumber,verseNumber){
  const hash='#'+[id,book,chapterNumber,verseNumber].filter(v=>v!==undefined).map(encodeURIComponent).join('/');
  if(location.hash===hash)return view(id,book,chapterNumber,verseNumber);
  location.hash=hash;
}
function field(labelText,input){const label=el('label','');input.setAttribute('aria-label',labelText);label.append(el('span',labelText),input);return label;}
async function bibleView(d,bookId,chapterNumber,verseNumber,seq){
  const close=el('button','← Close source');close.onclick=()=>{location.hash='';};
  const subtitle=el('small',`${d.translation} · ${d.bookCount} books · ${d.verseCount.toLocaleString()} verses`);
  const book=el('select','');book.id='bible-book';
  for(const b of d.books){const option=el('option',b.name);option.value=b.id;book.append(option);}
  book.value=bookId||d.books[0].id;
  const chapters=el('select','');chapters.id='bible-chapter';
  const selected=d.books.find(b=>b.id===book.value);
  if(!selected)throw Error('Book not found');
  for(let n=1;n<=selected.chapters;n++){const option=el('option',String(n));option.value=String(n);chapters.append(option);}
  chapters.value=String(chapterNumber||1);
  book.onchange=()=>openChapter(d.id,book.value,1);
  chapters.onchange=()=>openChapter(d.id,book.value,Number(chapters.value));
  const navigation=el('div','');navigation.className='bible-navigation';navigation.append(field('Book',book),field('Chapter',chapters));
  const query=el('input','');query.type='search';query.id='bible-query';query.placeholder='John 3:16, Psalm 23, or words';
  const find=el('button','Find');find.type='submit';
  const form=el('form','');form.className='bible-search';form.append(field('Find a passage or words',query),find);
  const body=el('section','');body.className='bible-passage';body.setAttribute('aria-live','polite');
  const record=el('details','');record.className='source-record';
  const original=el('a','Open original downloaded text');original.href='/api/original/'+encodeURIComponent(d.id);original.target='_blank';original.rel='noopener';
  record.append(el('summary','Source record'),el('p',d.provenance),el('p',d.license),el('p',`Source: ${d.sourceUrl}`),el('p',`SHA-256 (verified when opened): ${d.sha256}`),original);
  $('reader').replaceChildren(close,subtitle,el('h2',d.title),navigation,form,body,record);
  async function findVerses(){
    const request=++readerSequence;
    try {
      const result=await api('/api/bible/'+encodeURIComponent(d.id)+'?q='+encodeURIComponent(query.value));
      if(request!==readerSequence)return;
      body.replaceChildren(el('h3',result.total?`${result.total.toLocaleString()} matching verse${result.total===1?'':'s'}`:'No matching verses'));
      if(!query.value.trim())body.append(el('p','Enter a reference such as John 3:16, or words to find in the same verse.'));
      if(result.total>result.limit)body.append(el('p',`Showing the first ${result.limit}. Add more words to narrow your search.`));
      for(const verse of result.matches){
        const button=el('button','');button.className='verse-result';
        button.append(el('strong',verse.reference+' · '+d.translation),el('span',verse.text),el('small','Read chapter →'));
        button.onclick=()=>openChapter(d.id,verse.book,verse.chapter,verse.verse);body.append(button);
      }
    }catch(error){if(request===readerSequence)showError(error);}
  }
  form.onsubmit=e=>{e.preventDefault();findVerses();};
  if(!bookId&&$('query').value.trim()){query.value=$('query').value;return findVerses();}
  const passage=await api('/api/bible/'+encodeURIComponent(d.id)+'?'+new URLSearchParams({book:book.value,chapter:chapters.value}));
  if(seq!==readerSequence)return;
  body.append(el('h3',`${passage.name} ${passage.chapter}`));
  let highlighted;
  for(const verse of passage.verses){
    const line=el('p','');line.className='verse';
    if(verse.number===Number(verseNumber)){line.className+=' selected-verse';highlighted=line;}
    line.append(el('sup',String(verse.number)),el('span',verse.text));body.append(line);
  }
  const paging=el('div','');paging.className='chapter-paging';
  for(const [label,target] of [['← Previous chapter',passage.previous],['Next chapter →',passage.next]]){
    if(target){const button=el('button',label);button.onclick=()=>openChapter(d.id,target.book,target.chapter);paging.append(button);}
  }
  body.append(paging);
  if(highlighted)highlighted.scrollIntoView({block:'center'});
}
function navigate(){if(location.hash){try{view(...location.hash.slice(1).split('/').map(decodeURIComponent));}catch(error){showError(error);}}else{readerSequence++;
    $('reader').replaceChildren(el('h2','A little library, built to last.'),el('p','Choose a text to read its original source and inspect where it came from.'));}}
window.addEventListener('hashchange',navigate);
$('filters').onsubmit=e=>{e.preventDefault();catalog();};
$('query').oninput=catalog;
    $('topic').onchange=catalog;
$('install').onclick=async()=>{ $('install').disabled=true;try {await api('/api/install',{method:'POST',headers:{'X-Dewey-Token':token}});
    $('setup').hidden=true;
    await catalog();} catch(e) {showError(e);
    $('install').disabled=false;}};
try {const s=await api('/api/status');token=s.token;
    if(s.setup)$('setup').append(el('p',`Sources: ${s.source}. Index: ${s.index}. Change these locations with DEWEY_LIBRARY_ROOT / DEWEY_INDEX or Compose bind mounts before installing. Normal mode mounts sources read-only.`));
    $('setup').hidden=!(s.setup && !s.count);
    if(!s.count&&!s.setup)$('reader').append(el('p','No collection installed. Start the local setup profile described in README.'));
    await catalog();navigate();} catch(e) {showError(e);}
