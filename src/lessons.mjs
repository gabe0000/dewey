const text=(v,max=20000)=>typeof v==='string'&&v.trim().length>0&&v.length<=max;
export function parseLessons(raw){
  let p;try{p=JSON.parse(raw);}catch{throw Error('Invalid lesson JSON');}
  if(p?.schema!==1||!text(p.title,200)||!Array.isArray(p.lessons)||!p.lessons.length||p.lessons.length>100)throw Error('Invalid lesson collection');
  if(p.startNumber!==undefined&&(!Number.isInteger(p.startNumber)||p.startNumber<1||p.startNumber>1000))throw Error('Invalid lesson starting number');
  for(const key of ['introduction','overviewTitle'])if(p[key]!==undefined&&!text(p[key]))throw Error('Invalid lesson introduction');
  if(p.prerequisites!==undefined&&(!Array.isArray(p.prerequisites)||p.prerequisites.length>20||p.prerequisites.some(r=>!text(r.label,300)||!/^[a-z0-9-]+$/.test(r.collection)||!/^[a-z0-9-]+$/.test(r.lesson))))throw Error('Invalid lesson prerequisite');
  if(p.references!==undefined&&(!Array.isArray(p.references)||p.references.length>30||p.references.some(r=>!text(r.title,300)||!text(r.url,2000)||!/^https:\/\/[^\s]+$/.test(r.url))))throw Error('Invalid lesson reference');
  const ids=new Set();
  for(const l of p.lessons){
    if(!/^[a-z0-9-]+$/.test(l.id)||ids.has(l.id)||!text(l.title,200)||!text(l.summary,1000)||!text(l.duration,100))throw Error('Invalid lesson identity');ids.add(l.id);
    for(const key of ['equipment','goals','explanation','practice'])if(!Array.isArray(l[key])||!l[key].length||l[key].length>30||l[key].some(s=>!text(s)))throw Error('Missing lesson '+key);
    if(!Array.isArray(l.checks)||!l.checks.length||l.checks.some(c=>!text(c.question)||!text(c.answer)))throw Error('Missing lesson checks');
    if(!Array.isArray(l.sources)||!l.sources.length||l.sources.some(s=>!/^([a-z0-9-]+)$/.test(s.document)||!Number.isInteger(s.page)||s.page<1||!text(s.label,300)))throw Error('Invalid lesson source link');
    if(l.diagram!==undefined&&!['yard','scale','contours','checkpoints','compass','bearing','back-bearing','declination','pace-course','handrail','attack-catch','practice-loop'].includes(l.diagram))throw Error('Unknown lesson diagram');
    if(l.tool!==undefined&&l.tool!=='pace')throw Error('Unknown lesson tool');
  }
  return p;
}
export function validateLessonSources(docs){
  for(const d of docs)for(const r of d.lessonPack?.prerequisites||[]){
    if(!docs.find(source=>source.id===r.collection)?.lessonPack?.lessons.some(l=>l.id===r.lesson))throw Error('Lesson prerequisite does not exist: '+r.label);
  }
  for(const d of docs)for(const l of d.lessonPack?.lessons||[])for(const s of l.sources){
    const source=docs.find(d=>d.id===s.document&&d.pdf);
    if(!source||s.page>source.pdf.pageCount)throw Error('Lesson source page does not exist: '+l.id);
  }
}
