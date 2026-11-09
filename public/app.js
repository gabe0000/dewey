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
      button.append(el('small',d.topic),el('h2',d.title),el('span',`${d.license} · verified source →`));
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
async function view(id) {const seq=++readerSequence;try {const d=await api('/api/source/'+encodeURIComponent(id));
    if(seq!==readerSequence)return;
    const close=el('button','← Close source');close.onclick=()=>{location.hash='';};
    $('reader').replaceChildren(close,el('small',d.topic),el('h2',d.title),el('pre',d.text),el('h3','Source record'),el('p',`Provenance: ${d.provenance}`),el('p',`License: ${d.license}`),el('p',`File: ${d.file}`),el('p',`SHA-256 (verified now): ${d.sha256}`));} catch(e) {if(seq===readerSequence)showError(e);}}
function navigate(){if(location.hash){view(decodeURIComponent(location.hash.slice(1)));}else{readerSequence++;
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
