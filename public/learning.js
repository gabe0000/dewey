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
    const pack=await api('/api/lessons/'+d.id);if(!isCurrent())return()=>{};const start=pack.startNumber||1;
    const selected=route[0]==='lesson'?pack.lessons.find(l=>l.id===route[1]):undefined;
    if(route[0]&&!selected)throw Error('Lesson not found');
    const intro=el('p',pack.introduction||'Learn one idea, try it somewhere familiar, then check your understanding.');intro.className='learning-intro';container.append(intro);for(const r of pack.prerequisites||[]){const a=link('Before you start: '+r.label,hash(r.collection,'lesson',r.lesson));a.className='lesson-source';container.append(a);}
    const layout=el('div','');layout.className='lesson-layout';const nav=el('nav','');nav.setAttribute('aria-label','Navigation lessons');nav.className='lesson-list';
    pack.lessons.forEach((l,i)=>{const a=link(`${String(start+i).padStart(2,'0')}  ${l.title}`,hash(d.id,'lesson',l.id));if(l===selected)a.setAttribute('aria-current','page');nav.append(a);});
    const picker=el('select','');
    const overview=el('option',`All ${pack.lessons.length} lessons`);overview.value='';picker.append(overview);
    pack.lessons.forEach((l,i)=>{const option=el('option',`${start+i}. ${l.title}`);option.value=l.id;picker.append(option);});
    picker.value=selected?.id||'';picker.onchange=()=>{location.hash=picker.value?hash(d.id,'lesson',picker.value):hash(d.id);};
    const mobileNav=field('Choose a lesson',picker);mobileNav.className='lesson-picker';
    const body=el('section','');body.className='lesson-body';layout.append(nav,mobileNav,body);container.append(layout);
    if(!selected){body.append(el('h3',pack.overviewTitle||'Choose a lesson to begin'));pack.lessons.forEach((l,i)=>{const card=link(`${start+i}. ${l.title}`,hash(d.id,'lesson',l.id));card.className='lesson-card';card.append(el('small',l.duration),el('p',l.summary));body.append(card);});}
    else{
      const l=selected,index=pack.lessons.indexOf(l);body.append(el('small',`LESSON ${start+index} · ${index+1} OF ${pack.lessons.length} IN THIS SERIES · ${l.duration}`),el('h3',l.title),el('p',l.summary));
      if(l.practiceBoundary){const note=el('aside',l.practiceBoundary);note.className='lesson-boundary';note.setAttribute('role','note');note.setAttribute('aria-label','Practice boundary');body.append(note);}
      const list=(title,items,ordered=false)=>{body.append(el('h4',title));const ul=el(ordered?'ol':'ul','');items.forEach(t=>ul.append(el('li',t)));body.append(ul);};
      list('You will learn',l.goals);list('Gather these',l.equipment);body.append(el('h4','Learn the idea'));l.explanation.forEach(t=>body.append(el('p',t)));
      if(l.diagram)body.append(diagram(l.diagram,el));
      if(l.tool==='pace')body.append(paceTool(el));
      list('Try it',l.practice,true);body.append(el('h4','Check yourself'));
      l.checks.forEach(c=>{const check=el('details','');check.className='answer-check';check.append(el('summary',c.question),el('p',c.answer));body.append(check);});
      body.append(el('h4','Look inside the source'));
      l.sources.forEach(s=>{const a=link(`${s.label} · PDF page ${s.page} ↗`,hash(s.document,'page',s.page));a.onclick=()=>{returnLesson=hash(d.id,'lesson',l.id);};a.className='lesson-source';body.append(a);});
      body.append(el('p','Source links use the PDF’s physical page number, counting the cover as page 1. Older manual examples may use different dates, equipment, or map editions.'));
      const paging=el('div','');paging.className='learning-paging';if(index)paging.append(link('← Previous lesson',hash(d.id,'lesson',pack.lessons[index-1].id)));if(index<pack.lessons.length-1)paging.append(link('Next lesson →',hash(d.id,'lesson',pack.lessons[index+1].id)));else paging.append(link(`Review all ${pack.lessons.length} lessons`,hash(d.id)));body.append(paging);
    }
    if(pack.references?.length){const refs=el('details','');refs.className='source-record';refs.append(el('summary','Further references · online links'));pack.references.forEach(r=>{const a=link(r.title,r.url);a.target='_blank';a.rel='noopener noreferrer';refs.append(a,el('br',''));});container.append(refs);}
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
  if(['terrain-forms','contour-ground','position-evidence','stop-relocate'].includes(kind))return terrainDiagram(kind,el);
  if(['pace-course','handrail','attack-catch','practice-loop'].includes(kind))return fieldDiagram(kind,el);
  if(['compass','bearing','back-bearing','declination'].includes(kind))return compassDiagram(kind,el);
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
// Original teaching schematics in this function are dedicated to CC0-1.0.
function compassDiagram(kind,el){
  const captions={compass:'A simplified baseplate compass: the travel arrow, index mark, rotating dial, magnetic needle and printed orienting arrow have different jobs. Your model may look different.',bearing:'Bearings are measured clockwise from the chosen north reference. This example points northeast at 045 degrees.', 'back-bearing':'The opposite of a 060-degree forward bearing is 240 degrees. A back bearing gives a direction, not a guaranteed return route.',declination:'Hypothetical 10-degree east declination: magnetic north lies clockwise from true north. This is an arithmetic example, not a current local correction.'};
  const figure=el('figure','');figure.className='lesson-diagram';const svg=document.createElementNS('http://www.w3.org/2000/svg','svg');svg.setAttribute('viewBox','0 0 600 380');svg.setAttribute('role','img');svg.setAttribute('aria-label',captions[kind]);
  const add=(tag,attrs,t)=>{const n=document.createElementNS(svg.namespaceURI,tag);Object.entries(attrs).forEach(([k,v])=>n.setAttribute(k,String(v)));if(t)n.textContent=t;svg.append(n);return n;};
  const line=(x1,y1,x2,y2,color='#365c47',width=3)=>add('line',{x1,y1,x2,y2,stroke:color,'stroke-width':width});
  const label=(x,y,t,anchor='start')=>add('text',{x,y,fill:'#24382f','font-size':17,'font-family':'system-ui','text-anchor':anchor},t);
  const point=(degrees,r=115)=>[300+r*Math.sin(degrees*Math.PI/180),190-r*Math.cos(degrees*Math.PI/180)];
  const arrow=(x1,y1,x2,y2,color)=>{line(x1,y1,x2,y2,color,4);const angle=Math.atan2(y2-y1,x2-x1),r=13;add('path',{d:`M ${x2-r*Math.cos(angle-.45)} ${y2-r*Math.sin(angle-.45)} L ${x2} ${y2} L ${x2-r*Math.cos(angle+.45)} ${y2-r*Math.sin(angle+.45)}`,fill:'none',stroke:color,'stroke-width':4});};
  if(kind==='compass'){
    add('rect',{x:200,y:55,width:200,height:290,rx:14,fill:'#e2e9da',stroke:'#71856a','stroke-width':2});add('circle',{cx:300,cy:190,r:90,fill:'#fffefa',stroke:'#365c47','stroke-width':3});
    for(let d=0;d<360;d+=30){const a=point(d,82),b=point(d,90);line(...a,...b);}
    add('path',{d:'M 278 218 L 278 167 L 267 167 L 300 124 L 333 167 L 322 167 L 322 218 Z',fill:'none',stroke:'#668958','stroke-width':3});
    add('path',{d:'M 300 120 L 311 190 L 289 190 Z',fill:'#ab4c3d'});add('path',{d:'M 300 250 L 311 190 L 289 190 Z',fill:'#bdc6b4',stroke:'#365c47'});add('circle',{cx:300,cy:190,r:5,fill:'#24382f'});
    arrow(300,85,300,30,'#365c47');line(300,89,300,103,'#ab4c3d',4);label(323,33,'Travel arrow');line(300,96,420,70);label(424,73,'Index mark');line(292,145,160,119);label(30,115,'North end');label(30,136,'of needle');line(278,212,155,241);label(24,245,'Orienting arrow');line(390,190,447,188);label(453,194,'Rotating dial');line(400,316,450,318);label(456,324,'Baseplate');
  }else if(kind==='declination'){
    arrow(270,310,270,50,'#365c47');arrow(270,310,315,55,'#ab4c3d');add('path',{d:'M 270 120 A 190 190 0 0 1 303 123',fill:'none',stroke:'#bc7b35','stroke-width':3});label(140,42,'True north');label(330,56,'Magnetic north');label(326,140,'10° east');label(326,166,'example only');label(270,351,'Record place, date, model and reference.', 'middle');
  }else{
    add('circle',{cx:300,cy:190,r:115,fill:'none',stroke:'#9cac91','stroke-width':2});line(300,65,300,315,'#9cac91',1);line(175,190,425,190,'#9cac91',1);label(300,42,'N · 000°','middle');label(450,196,'E · 090°');label(300,352,'S · 180°','middle');label(80,196,'W · 270°');
    if(kind==='bearing'){const p=point(45);arrow(300,190,...p,'#ab4c3d');label(360,91,'045°');add('path',{d:'M 300 140 A 50 50 0 0 1 335.4 154.6',fill:'none',stroke:'#bc7b35','stroke-width':4});label(350,262,'Clockwise from north');}
    else{const a=point(60),b=point(240);arrow(300,190,...a,'#ab4c3d');arrow(300,190,...b,'#365c47');label(355,110,'060° forward');label(125,285,'240° back');}
  }
  figure.append(svg,el('figcaption',captions[kind]+' Original schematic; not a field map.'));return figure;
}

export function estimatePaces({courseLength,counts,distance,unit='m'}){
  if(!['m','ft'].includes(unit)||!Number.isFinite(courseLength)||courseLength<.1||courseLength>10000||!Number.isFinite(distance)||distance<0||distance>1000000||!Array.isArray(counts)||counts.length!==3||counts.some(n=>!Number.isInteger(n)||n<1||n>100000))throw Error('Enter a measured course length, three positive whole pace counts, and a nonnegative target distance in the same unit.');
  const average=counts.reduce((a,b)=>a+b,0)/counts.length;
  return {average,paceLength:courseLength/average,per100:average*100/courseLength,estimatedPaces:distance*average/courseLength,unit};
}
function paceTool(el){
  const form=el('form','');form.className='pace-tool';form.append(el('h4','Try your own pace counts'),el('p','Count the same foot each time: one pace is two steps. Use one unit for both distances. Copy your results to your notebook before leaving this lesson.'));
  const fields=el('div','');fields.className='pace-fields';
  function field(label,value,min,max,step='any'){const input=el('input','');input.type='number';Object.assign(input,{value,min,max,step,required:true});input.setAttribute('aria-label',label);const wrapper=el('label','');wrapper.append(el('span',label),input);fields.append(wrapper);return input;}
  const units=el('select','');units.setAttribute('aria-label','Pace distance unit');for(const [value,title] of [['m','Metres'],['ft','Feet']]){const option=el('option',title);option.value=value;units.append(option);}const label=el('label','');label.append(el('span','Distance unit'),units);fields.append(label);
  const course=field('Measured course length','100','.1','10000'),counts=[1,2,3].map(n=>field('Paces on walk '+n,'','1','100000','1')),target=field('Distance to estimate','250','0','1000000');form.append(fields);
  const calculate=el('button','Calculate estimate');calculate.type='submit';const example=el('button','Use the worked example');example.type='button';const output=el('p','Enter all three counts to calculate.');output.setAttribute('role','status');output.setAttribute('aria-live','polite');form.append(calculate,example,output,el('p','An estimate, not a position fix. Terrain, footwear, load and fatigue change your pace. Confirm your route with visible features.'));
  function show(){try{const values={courseLength:Number(course.value),counts:counts.map(n=>Number(n.value)),distance:target.value.trim()?Number(target.value):NaN,unit:units.value};const result=estimatePaces(values),fmt=n=>Number(n.toFixed(2));output.textContent=`Average: ${fmt(result.average)} paces on your ${values.courseLength} ${result.unit} course. About ${fmt(result.per100)} paces per 100 ${result.unit}; ${fmt(result.paceLength)} ${result.unit} per pace. ${values.distance} ${result.unit} ≈ ${fmt(result.estimatedPaces)} paces (about ${Math.round(result.estimatedPaces)} whole paces).`;}catch(error){output.textContent=error.message;}}
  form.onsubmit=event=>{event.preventDefault();show();};example.onclick=()=>{units.value='m';course.value='100';[64,66,65].forEach((v,i)=>counts[i].value=String(v));target.value='250';show();};for(const input of [course,...counts,target,units])input.oninput=()=>{output.textContent='Values changed. Calculate again to update the estimate.';};return form;
}
// Original practice schematics in this function are dedicated to CC0-1.0.
function fieldDiagram(kind,el){
  const captions={'pace-course':'Measure a safe level course before counting paces. Three walks of the same measured distance give three counts; count the same foot on every walk.',handrail:'An obvious permitted path is a handrail. The bench, marked tree and junction are collecting features checked in order. Do not leave the path to chase a feature.', 'attack-catch':'An attack point is the last easy-to-confirm landmark before a short precise leg. A catching feature beyond the target is a stop signal if the target is missed.', 'practice-loop':'A fictional practice loop stays inside a prechecked boundary. Walk together, confirm every checkpoint, and stop when the expected evidence is missing.'};
  const figure=el('figure','');figure.className='lesson-diagram';const svg=document.createElementNS('http://www.w3.org/2000/svg','svg');svg.setAttribute('viewBox','0 0 600 350');svg.setAttribute('role','img');svg.setAttribute('aria-label',captions[kind]);
  const add=(tag,attrs,text)=>{const n=document.createElementNS(svg.namespaceURI,tag);Object.entries(attrs).forEach(([k,v])=>n.setAttribute(k,String(v)));if(text)n.textContent=text;svg.append(n);};
  const text=(x,y,t,anchor='start')=>add('text',{x,y,'text-anchor':anchor,'font-size':17,'font-family':'system-ui',fill:'#24382f'},t);
  const line=(x1,y1,x2,y2,color='#365c47',width=5)=>add('line',{x1,y1,x2,y2,stroke:color,'stroke-width':width});
  const dot=(x,y)=>add('circle',{cx:x,cy:y,r:9,fill:'#b77935',stroke:'#365c47','stroke-width':2});
  if(kind==='pace-course'){
    line(70,145,530,145);line(70,125,70,165);line(530,125,530,165);dot(70,145);dot(530,145);text(70,105,'Start');text(530,105,'Finish','end');text(300,185,'Measured course: example 100 m','middle');text(300,230,'Walk 1: 64 · Walk 2: 66 · Walk 3: 65','middle');text(300,267,'Average: 65 paces per 100 m','middle');text(300,304,'One pace = two natural steps','middle');
  }else if(kind==='handrail'){
    line(50,190,550,190,'#bfc9ae',24);line(50,190,550,190,'#365c47',3);[[100,'Bench'],[280,'Marked tree'],[460,'Junction']].forEach(([x,t])=>{dot(x,190);text(x,145,t,'middle');});line(460,190,460,65);text(300,250,'Known features, in the expected order','middle');text(300,295,'Path = handrail','middle');
  }else if(kind==='attack-catch'){
    line(50,270,550,270,'#bfc9ae',20);line(270,270,355,140);dot(270,270);dot(355,140);line(70,65,540,65,'#a35442',12);text(300,36,'Catching feature: stop if reached','middle');text(370,145,'Target');text(85,325,'Attack point: path junction');line(270,270,270,290);text(70,238,'Main path');text(385,210,'Short checked leg');
  }else{
    add('rect',{x:35,y:55,width:530,height:255,rx:8,fill:'none',stroke:'#a35442','stroke-width':3,'stroke-dasharray':'10 7'});add('polyline',{points:'100,250 100,115 465,115 465,250 100,250',fill:'none',stroke:'#365c47','stroke-width':5});[[100,250],[100,115],[465,115],[465,250]].forEach(([x,y])=>dot(x,y));text(300,30,'Prechecked boundary: stop inside it','middle');text(120,105,'A · bench');text(450,105,'B · tree','end');text(445,280,'C · junction','end');text(110,280,'Start / finish');text(300,195,'Walk together. Check every leg.','middle');
  }
  figure.append(svg,el('figcaption',captions[kind]+' Original schematic; not to scale and not a map for travel.'));return figure;
}

// Original terrain teaching schematics in this function are dedicated to CC0-1.0.
function terrainDiagram(kind,el){
  const figure=el('figure','');figure.className='lesson-diagram terrain-diagram';
  const captions={'terrain-forms':'Compare raised ground and hollows using the elevation labels, not the outline alone. A saddle is low along a ridge between higher tops; a reentrant is a small valley cut into a slope.', 'contour-ground':'At the same map scale and contour interval, wider contour spacing represents a gentler slope. These paired plan and side sketches show the same 30 m rise over different horizontal distances.', 'position-evidence':'Fictional north-up paper example: sightings from the observer toward B and A are 315° and 045° true. Plot their back bearings 135° and 225° from the correctly identified landmarks. The overlap is an estimate to cross-check, not an exact position guarantee.', 'stop-relocate':'Controlled practice only: stop together and check the evidence. A helper may direct a return only along an already confirmed safe route. If the route cannot be confirmed, stay and seek help rather than searching outward.'};
  const panels=el('div','');panels.className=kind==='terrain-forms'||kind==='contour-ground'?'terrain-panels':'';figure.append(panels);
  function panel(title,viewBox='0 0 320 260'){
    const box=el('div','');box.className='terrain-panel';box.append(el('strong',title));const svg=document.createElementNS('http://www.w3.org/2000/svg','svg');svg.setAttribute('viewBox',viewBox);svg.setAttribute('role','img');svg.setAttribute('aria-label',title);box.append(svg);panels.append(box);
    const add=(tag,attrs,text)=>{const n=document.createElementNS(svg.namespaceURI,tag);Object.entries(attrs).forEach(([k,v])=>n.setAttribute(k,String(v)));if(text)n.textContent=text;svg.append(n);};
    const text=(x,y,t,anchor='start',size=15)=>add('text',{x,y,'text-anchor':anchor,'font-family':'system-ui','font-size':size,fill:'#24382f'},t);
    const path=d=>add('path',{d,fill:'none',stroke:'#927146','stroke-width':3});
    const line=(x1,y1,x2,y2,color='#365c47',dash)=>add('line',{x1,y1,x2,y2,stroke:color,'stroke-width':3,...(dash?{'stroke-dasharray':dash}:{})});
    return {add,text,path,line};
  }
  if(kind==='terrain-forms'){
    const ridge=panel('Ridge / spur: raised ground');
    ['M25 85 C85 85 95 190 160 195 C225 190 235 85 295 85','M25 60 C95 60 115 150 160 160 C205 150 225 60 295 60','M25 35 C105 35 135 110 160 125 C185 110 215 35 295 35'].forEach(ridge.path);
    [[35,'120'],[60,'110'],[85,'100']].forEach(([y,t])=>ridge.text(268,y-5,t));ridge.text(160,226,'Nose projects toward lower ground','middle',14);
    const valley=panel('Valley: low ground between sides');
    ['M25 200 C90 190 105 85 160 70 C215 85 230 190 295 200','M25 165 C95 155 120 60 160 45 C200 60 225 155 295 165','M25 130 C105 120 135 35 160 20 C185 35 215 120 295 130'].forEach(valley.path);
    [[200,'100'],[165,'110'],[130,'120']].forEach(([y,t])=>valley.text(268,y-6,t));valley.text(160,236,'Indentations point toward higher ground','middle',13);
    const saddle=panel('Saddle: low pass between higher tops');saddle.path('M30 110 C30 25 120 20 160 78 C200 20 290 25 290 110 C290 190 200 195 160 138 C120 195 30 190 30 110 Z');
    for(const x of [90,230]){saddle.add('ellipse',{cx:x,cy:109,rx:43,ry:55,fill:'none',stroke:'#927146','stroke-width':3});saddle.add('ellipse',{cx:x,cy:109,rx:22,ry:29,fill:'none',stroke:'#927146','stroke-width':3});saddle.text(x,114,'120','middle',13);}saddle.text(160,114,'Pass','middle',13);saddle.text(160,228,'The pass is below both adjacent tops','middle',14);
    const hollow=panel('Reentrant: small hollow in a slope');['M30 195 C105 190 125 75 160 65 C195 75 215 190 290 195','M30 155 C110 150 135 50 160 40 C185 50 210 150 290 155','M30 115 C115 110 145 25 160 15 C175 25 205 110 290 115'].forEach(hollow.path);hollow.text(280,190,'100','end');hollow.text(280,150,'110','end');hollow.text(280,110,'120','end');hollow.text(160,236,'Low ground may be dry','middle');
  }else if(kind==='contour-ground'){
    for(const [title,xs] of [['Wider spacing: gentler',[40,105,170,235]],['Closer spacing: steeper',[40,60,80,100]]]){
      const p=panel(title);p.text(160,25,'Plan view · 10 m interval','middle');xs.forEach(x=>p.line(x,70,x,145,'#927146'));p.text(xs[0],62,'100','middle',13);p.text(xs[3],48,'130 m','middle',13);p.line(25,228,295,228,'#899a80');p.line(xs[0],220,xs[3],166);p.text(160,252,'Side view · same 30 m rise','middle',13);
    }
  }else if(kind==='position-evidence'){
    const p=panel('Combine independent evidence','0 0 360 330');p.line(80,65,205,190,'#8a6f43');p.line(280,65,155,190,'#365c47');p.add('ellipse',{cx:180,cy:165,rx:26,ry:18,fill:'#e8eddc',stroke:'#a35442','stroke-width':2,'stroke-dasharray':'6 4'});
    for(const [x,label] of [[80,'B · 315° true'],[280,'A · 045° true']]){p.add('circle',{cx:x,cy:65,r:7,fill:'#b77935'});p.text(x,37,label,'middle',17);}p.text(8,130,'135° back','start',16);p.text(245,130,'225° back','start',16);p.text(180,270,'Overlap is approximate.','middle',17);p.text(180,298,'Check other features.','middle',17);p.line(332,230,332,190);p.add('path',{d:'M326 197 L332 190 L338 197',fill:'none',stroke:'#365c47','stroke-width':3});p.text(332,177,'N','middle');
  }else{
    const p=panel('Controlled-course decision','0 0 360 460');
    function box(x,y,w,h,lines){p.add('rect',{x,y,width:w,height:h,rx:9,fill:'#e7eddf',stroke:'#71856a','stroke-width':2});lines.forEach((t,i)=>p.text(x+w/2,y+24+i*21,t,'middle',15));}
    box(70,15,220,54,['Stop. Stay together.']);p.line(180,69,180,92);box(50,92,260,72,['Check last confirmed point,','map and visible evidence.']);p.line(180,164,180,187);box(45,187,270,72,['Can the helper confirm','an already safe return route?']);p.line(130,259,88,320);p.line(230,259,272,320);p.text(70,294,'Yes','middle');p.text(293,294,'No','middle');box(8,320,160,76,['Return together','on that known route.']);box(190,320,160,76,['Stay. Seek help.','Do not search outward.']);p.text(180,436,'Real emergency: use the emergency plan.','middle',14);
  }
  figure.append(el('figcaption',captions[kind]+' Original schematic; not to scale, not a field map.'));return figure;
}
