let returnLesson='';
const hash=(...parts)=>'#'+parts.map(encodeURIComponent).join('/');
export async function renderLearning(d,{container,api,el,route,isCurrent,query}){
  document.body.classList.add('learning-open');container.className='learning-reader';
  const link=(label,to)=>{const a=el('a',label);a.href=to;return a;};
  const button=(label,fn)=>{const b=el('button',label);b.type='button';b.onclick=fn;return b;};
  const field=(label,input)=>{const l=el('label','');input.setAttribute('aria-label',label);l.append(el('span',label),input);return l;};
  const close=link('← All shelves','#');close.className='reader-back';
  const record=el('details','');record.className='source-record';const original=link(d.kind==='pdf'?'Open original PDF':'Open original lesson file','/api/original/'+d.id);original.target='_blank';original.rel='noopener';
  record.append(el('summary','Source record & original file'),el('p',d.provenance),el('p',d.license),el('p','SHA-256 verified when opened: '+d.sha256),original);
  container.replaceChildren(close,el('small','MAPS & NAVIGATION'),el('h2',d.title));
  if(d.kind==='lessons'){
    const pack=await api('/api/lessons/'+d.id);if(!isCurrent())return()=>{};
    const selected=route[0]==='lesson'?pack.lessons.find(l=>l.id===route[1]):undefined;
    if(route[0]&&!selected)throw Error('Lesson not found');
    const intro=el('p','Start at home. Learn one idea, try it somewhere familiar, then check your understanding. No navigation experience needed.');intro.className='learning-intro';container.append(intro);
    const layout=el('div','');layout.className='lesson-layout';const nav=el('nav','');nav.setAttribute('aria-label','Navigation lessons');nav.className='lesson-list';
    pack.lessons.forEach((l,i)=>{const a=link(`${String(i+1).padStart(2,'0')}  ${l.title}`,hash(d.id,'lesson',l.id));if(l===selected)a.setAttribute('aria-current','page');nav.append(a);});
    const picker=el('select','');
    const overview=el('option','All eight lessons');overview.value='';picker.append(overview);
    pack.lessons.forEach((l,i)=>{const option=el('option',`${i+1}. ${l.title}`);option.value=l.id;picker.append(option);});
    picker.value=selected?.id||'';picker.onchange=()=>{location.hash=picker.value?hash(d.id,'lesson',picker.value):hash(d.id);};
    const mobileNav=field('Choose a lesson',picker);mobileNav.className='lesson-picker';
    const body=el('section','');body.className='lesson-body';layout.append(nav,mobileNav,body);container.append(layout);
    if(!selected){body.append(el('h3','Eight small steps to reading the land'),el('p',pack.introduction||''));pack.lessons.forEach((l,i)=>{const card=link(`${i+1}. ${l.title}`,hash(d.id,'lesson',l.id));card.className='lesson-card';card.append(el('small',l.duration),el('p',l.summary));body.append(card);});}
    else{
      const l=selected,index=pack.lessons.indexOf(l);body.append(el('small',`LESSON ${index+1} OF ${pack.lessons.length} · ${l.duration}`),el('h3',l.title),el('p',l.summary));
      const list=(title,items,ordered=false)=>{body.append(el('h4',title));const ul=el(ordered?'ol':'ul','');items.forEach(t=>ul.append(el('li',t)));body.append(ul);};
      list('You will learn',l.goals);list('Gather these',l.equipment);body.append(el('h4','Learn the idea'));l.explanation.forEach(t=>body.append(el('p',t)));
      if(l.diagram)body.append(diagram(l.diagram,el));
      list('Try it',l.practice,true);body.append(el('h4','Check yourself'));
      l.checks.forEach(c=>{const check=el('details','');check.className='answer-check';check.append(el('summary',c.question),el('p',c.answer));body.append(check);});
      body.append(el('h4','Look inside the source'));
      l.sources.forEach(s=>{const a=link(`${s.label} · PDF page ${s.page} ↗`,hash(s.document,'page',s.page));a.onclick=()=>{returnLesson=hash(d.id,'lesson',l.id);};a.className='lesson-source';body.append(a);});
      body.append(el('p','Source links use the PDF’s physical page number, counting the cover as page 1. Older manual examples may use different dates, equipment, or map editions.'));
      const paging=el('div','');paging.className='learning-paging';if(index)paging.append(link('← Previous lesson',hash(d.id,'lesson',pack.lessons[index-1].id)));if(index<pack.lessons.length-1)paging.append(link('Next lesson →',hash(d.id,'lesson',pack.lessons[index+1].id)));else paging.append(link('Review all eight lessons',hash(d.id)));body.append(paging);
    }
    container.append(record);container.scrollIntoView({block:'start'});return()=>{};
  }
  let alive=true,task,pdf,renderTask,drawSequence=0,scale=1,firstDraw=true;
  const dispose=()=>{alive=false;window.removeEventListener('resize',resize);drawSequence++;renderTask?.cancel();task?.destroy().catch(()=>{});};
  if(returnLesson)container.append(link('← Return to your lesson',returnLesson));
  const nativeReader=link('Open PDF in browser reader ↗','/api/original/'+d.id);nativeReader.target='_blank';nativeReader.rel='noopener';nativeReader.className='pdf-native-link';container.append(nativeReader);
  const n=Number(route[0]==='page'?route[1]:1);if(!Number.isInteger(n)||n<1||n>d.pageCount)throw Error('PDF page not found');
  const toolbar=el('form','');toolbar.className='pdf-toolbar';
  const input=el('input','');input.type='number';input.min=1;input.max=d.pageCount;input.value=n;input.required=true;
  const go=button('Go',()=>{if(toolbar.reportValidity())location.hash=hash(d.id,'page',input.value);});
  const prev=button('← Previous',()=>location.hash=hash(d.id,'page',n-1)),next=button('Next →',()=>location.hash=hash(d.id,'page',n+1));prev.disabled=n===1;next.disabled=n===d.pageCount;
  const zoom=el('select','');for(const [v,label] of [[1,'Fit width'],[1.25,'125%'],[1.5,'150%'],[2,'200%']]){const o=el('option',label);o.value=v;zoom.append(o);}
  toolbar.append(prev,field('PDF page',input),el('span','of '+d.pageCount),go,next,field('Zoom',zoom));toolbar.onsubmit=e=>{e.preventDefault();go.click();};
  const status=el('p','Loading original PDF…');status.setAttribute('role','status');
  const viewport=el('div','');viewport.className='pdf-viewport';const canvas=el('canvas','');canvas.setAttribute('role','img');canvas.setAttribute('aria-label',`${d.title}, PDF page ${n}`);viewport.append(canvas);
  const search=el('form','');search.className='pdf-search';const q=el('input','');q.type='search';q.value=query||'';q.placeholder='Find words in this PDF';const submit=el('button','Search PDF');submit.type='submit';search.append(field('Find in this PDF',q),submit);
  const results=el('div','');results.className='pdf-results';results.setAttribute('aria-live','polite');
  const text=el('details','');text.className='page-text';text.append(el('summary','Read or copy this page’s extracted text'));
  container.append(toolbar,status,viewport,text,search,results,record);
  async function draw(){
    const seq=++drawSequence;renderTask?.cancel();if(!pdf||!alive)return;
    const page=await pdf.getPage(n);if(seq!==drawSequence||!alive)return;
    const normal=page.getViewport({scale:1}),width=Math.min(1200,Math.max(1,viewport.clientWidth-28));const view=page.getViewport({scale:width/normal.width*scale});const ratio=Math.min(window.devicePixelRatio||1,2);
    canvas.width=Math.floor(view.width*ratio);canvas.height=Math.floor(view.height*ratio);canvas.style.width=view.width+'px';canvas.style.height=view.height+'px';
    if(firstDraw)container.scrollIntoView({block:'start'});
    status.textContent=document.hidden?'Bring this browser window forward to draw the page.':'Drawing the original page…';
    renderTask=page.render({canvasContext:canvas.getContext('2d'),viewport:view,transform:ratio===1?undefined:[ratio,0,0,ratio,0,0]});
    try{await renderTask.promise;if(alive&&seq===drawSequence){status.textContent=`PDF page ${n} of ${pdf.numPages} · original page, including illustrations`;if(firstDraw){firstDraw=false;container.scrollIntoView({block:'start'});}}}catch(e){if(e.name!=='RenderingCancelledException')throw e;}
  }
  const fail=e=>{if(alive&&isCurrent())status.textContent='PDF could not load: '+e.message;};
  let lastWidth=viewport.clientWidth;
  function resize(){const width=viewport.clientWidth;if(width!==lastWidth){lastWidth=width;draw().catch(fail);}}
  window.addEventListener('resize',resize);
  zoom.onchange=()=>{scale=Number(zoom.value);draw().catch(fail);};
  (async()=>{const page=await api(`/api/pdf/${d.id}?page=${n}`);if(!alive)return;text.append(el('p',page.textQuality),el('pre',page.text||'No embedded text on this page. Use the original page image.'));
    status.textContent='Preparing the PDF reader…';const engine=await import('/vendor/pdfjs/build/pdf.mjs');if(!alive)return;engine.GlobalWorkerOptions.workerSrc='/vendor/pdfjs/build/pdf.worker.mjs';
    status.textContent='Reading the original PDF…';task=engine.getDocument({url:'/api/original/'+d.id,isEvalSupported:false,enableXfa:false,cMapUrl:'/vendor/pdfjs/cmaps/',cMapPacked:true,standardFontDataUrl:'/vendor/pdfjs/standard_fonts/',wasmUrl:'/vendor/pdfjs/wasm/',iccUrl:'/vendor/pdfjs/iccs/'});pdf=await task.promise;if(alive){status.textContent='Drawing the original page…';await draw();}
  })().catch(fail);
  search.onsubmit=async e=>{e.preventDefault();try{const result=await api(`/api/pdf/${d.id}?q=${encodeURIComponent(q.value)}`);if(!alive)return;results.replaceChildren(el('p',q.value.trim()?`${result.total} matching pages${result.total>result.limit?' · first 100 shown':''}`:'Enter words to search embedded PDF text.'));result.matches.forEach(p=>{const a=link(`PDF page ${p.number}`,hash(d.id,'page',p.number));a.append(el('p',p.snippet));results.append(a);});}catch(e){if(alive)results.textContent=e.message;}};
  return dispose;
}
function diagram(kind,el){
  const figure=el('figure','');figure.className='lesson-diagram';const svg=document.createElementNS('http://www.w3.org/2000/svg','svg');svg.setAttribute('viewBox','0 0 600 280');svg.setAttribute('role','img');
  const names={yard:'An example yard map with north upward, a house at the west, a tree to the east and a gate to the south.',scale:'A scale bar with four equal segments, each representing 100 metres.',contours:'Three nested contour lines rise from 100 to 120 metres, showing a hill.',checkpoints:'A known path connects the start, a bench, a junction and the return point.'};svg.setAttribute('aria-label',names[kind]);
  function add(tag,attrs,label){const n=document.createElementNS(svg.namespaceURI,tag);Object.entries(attrs).forEach(([k,v])=>n.setAttribute(k,v));if(label)n.textContent=label;svg.append(n);}
  const line=(x1,y1,x2,y2)=>add('line',{x1,y1,x2,y2,stroke:'#365c47','stroke-width':3});const label=(x,y,t)=>add('text',{x,y,fill:'#24382f','font-size':18,'font-family':'system-ui'},t);
  if(kind==='yard'){add('rect',{x:50,y:50,width:460,height:180,fill:'#e7eddf',stroke:'#667e62'});add('rect',{x:95,y:90,width:130,height:80,fill:'#d9b98b'});label(125,138,'House');add('circle',{cx:410,cy:125,r:30,fill:'#759b6c'});label(390,185,'Tree');line(280,230,320,230);label(277,260,'Gate');line(550,75,550,25);label(540,18,'N');}
  if(kind==='scale'){for(let i=0;i<4;i++){add('rect',{x:60+i*110,y:110,width:110,height:25,fill:i%2?'#fff':'#365c47',stroke:'#365c47'});label(53+i*110,163,String(i*100));}label(485,163,'400 m');label(60,65,'Each segment represents 100 metres');}
  if(kind==='contours'){for(let i=0;i<3;i++){add('ellipse',{cx:290,cy:140,rx:210-i*60,ry:105-i*30,fill:'none',stroke:'#927146','stroke-width':3});label(280,43+i*30,String(100+i*10)+' m');}label(355,260,'Contour interval: 10 m');}
  if(kind==='checkpoints'){add('polyline',{points:'65,180 230,180 380,80 530,170',fill:'none',stroke:'#365c47','stroke-width':5});[[65,180,'Start'],[230,180,'Bench'],[380,80,'Junction'],[530,170,'Turn back']].forEach(([x,y,t])=>{add('circle',{cx:x,cy:y,r:9,fill:'#c17c38'});label(x-35,y+35,t);});}
  figure.append(svg,el('figcaption',names[kind]+' Illustrative only; not a map for travel.'));return figure;
}
