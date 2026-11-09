const text=(v,max=20000)=>typeof v==='string'&&v.trim().length>0&&v.length<=max;
export function parseLessons(raw){
  let p;try{p=JSON.parse(raw);}catch{throw Error('Invalid lesson JSON');}
  if(p?.schema!==1||!text(p.title,200)||!Array.isArray(p.lessons)||!p.lessons.length||p.lessons.length>100)throw Error('Invalid lesson collection');
  const ids=new Set();
  for(const l of p.lessons){
    if(!/^[a-z0-9-]+$/.test(l.id)||ids.has(l.id)||!text(l.title,200)||!text(l.summary,1000)||!text(l.duration,100))throw Error('Invalid lesson identity');ids.add(l.id);
    for(const key of ['equipment','goals','explanation','practice'])if(!Array.isArray(l[key])||!l[key].length||l[key].length>30||l[key].some(s=>!text(s)))throw Error('Missing lesson '+key);
    if(!Array.isArray(l.checks)||!l.checks.length||l.checks.some(c=>!text(c.question)||!text(c.answer)))throw Error('Missing lesson checks');
    if(!Array.isArray(l.sources)||!l.sources.length||l.sources.some(s=>!/^([a-z0-9-]+)$/.test(s.document)||!Number.isInteger(s.page)||s.page<1||!text(s.label,300)))throw Error('Invalid lesson source link');
    if(l.diagram!==undefined&&!['yard','scale','contours','checkpoints'].includes(l.diagram))throw Error('Unknown lesson diagram');
  }
  return p;
}
export function validateLessonSources(docs){
  for(const d of docs)for(const l of d.lessonPack?.lessons||[])for(const s of l.sources){
    const source=docs.find(d=>d.id===s.document&&d.pdf);
    if(!source||s.page>source.pdf.pageCount)throw Error('Lesson source page does not exist: '+l.id);
  }
}
