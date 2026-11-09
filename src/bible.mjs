const names = ['Genesis','Exodus','Leviticus','Numbers','Deuteronomy','Joshua','Judges','Ruth','1 Samuel','2 Samuel','1 Kings','2 Kings','1 Chronicles','2 Chronicles','Ezra','Nehemiah','Esther','Job','Psalms','Proverbs','Ecclesiastes','Song of Solomon','Isaiah','Jeremiah','Lamentations','Ezekiel','Daniel','Hosea','Joel','Amos','Obadiah','Jonah','Micah','Nahum','Habakkuk','Zephaniah','Haggai','Zechariah','Malachi','Matthew','Mark','Luke','John','Acts','Romans','1 Corinthians','2 Corinthians','Galatians','Ephesians','Philippians','Colossians','1 Thessalonians','2 Thessalonians','1 Timothy','2 Timothy','Titus','Philemon','Hebrews','James','1 Peter','2 Peter','1 John','2 John','3 John','Jude','Revelation'];
export const bibleBooks = names.map((name, order) => ({id:name.toLowerCase().replaceAll(' ','-'),name,order,testament:order<39?'Old Testament':'New Testament'}));
const vplCodes='GEN EXO LEV NUM DEU JOS JDG RUT 1SA 2SA 1KI 2KI 1CH 2CH EZR NEH EST JOB PSA PRO ECC SOL ISA JER LAM EZE DAN HOS JOE AMO OBA JON MIC NAH HAB ZEP HAG ZEC MAL MAT MAR LUK JOH ACT ROM 1CO 2CO GAL EPH PHI COL 1TH 2TH 1TI 2TI TIT PHM HEB JAM 1PE 2PE 1JO 2JO 3JO JUD REV'.split(' ');
export const bibleFormats=['gutenberg-kjv','ebible-bbe-vpl'];
const normalize = text => text.toLowerCase().replace(/[^a-z0-9]/g,'');

// Parse the numbered text of Project Gutenberg eBook #10. Original bytes stay untouched.
export function parseGutenbergKJV(text, {requireComplete=true}={}) {
  const start = text.match(/\*\*\* START OF (?:THE|THIS) PROJECT GUTENBERG EBOOK[^\n]*\*\*\*/);
  const end = text.match(/\*\*\* END OF (?:THE|THIS) PROJECT GUTENBERG EBOOK/);
  if(!start || !end || start.index>=end.index) throw Error('Not a complete Project Gutenberg Bible text');
  const body=text.slice(start.index+start[0].length,end.index).replaceAll('\r','');
  const firstVerse=body.search(/(?:^|\n)1:1\s/);
  if(firstVerse<0) throw Error('Bible has no numbered verses');
  const headings=[...new Set(body.slice(0,firstVerse).split('\n').map(s=>s.trim()).filter(s=>s&&!/^The (Old|New) Testament/.test(s)))];
  if(headings.length!==66) throw Error('Expected the 66-book Gutenberg KJV edition');
  const positions=[];
  let cursor=body.lastIndexOf('\n'+headings[0]+'\n',firstVerse);
  for(const heading of headings){
    const position=body.indexOf('\n'+heading+'\n',cursor);
    if(position<0) throw Error('Missing Bible book: '+heading);
    positions.push(position);cursor=position+heading.length+2;
  }
  const books=bibleBooks.map((definition,i)=>{
    const chunk=body.slice(positions[i]+headings[i].length+2,positions[i+1]??body.length);
    const markers=[...chunk.matchAll(/(?<!\S)(\d+):(\d+)\s+/g)];
    const chapters=[];
    for(let n=0;n<markers.length;n++){
      const marker=markers[n], chapter=Number(marker[1]), verse=Number(marker[2]);
      let current=chapters.at(-1);
      if(!current || current.number!==chapter){
        if(chapter!==(current?.number??0)+1 || verse!==1) throw Error('Invalid chapter order in '+definition.name);
        current={number:chapter,verses:[]};chapters.push(current);
      }
      if(verse!==current.verses.length+1) throw Error('Missing or duplicate verse in '+definition.name);
      const content=chunk.slice(marker.index+marker[0].length,markers[n+1]?.index??chunk.length).replace(/\s+/g,' ').trim();
      if(!content) throw Error('Empty Bible verse');
      current.verses.push({number:verse,text:content});
    }
    if(!chapters.length) throw Error('Empty Bible book: '+definition.name);
    return {...definition,chapters};
  });
  const verseCount=books.reduce((count,book)=>count+book.chapters.reduce((sum,c)=>sum+c.verses.length,0),0);
  if(requireComplete && verseCount!==31102) throw Error('Expected 31,102 KJV verses; found '+verseCount);
  return {translation:'KJV',bookCount:books.length,verseCount,books};
}

export function bookList(bible){return bible.books.map(({id,name,testament,chapters})=>({id,name,testament,chapters:chapters.length}));}
export function parseBasicEnglish(text,{requireComplete=true}={}){
  const books=bibleBooks.map(b=>({...b,chapters:[]}));
  let previous=-1,verseCount=0;
  for(const line of text.replace(/^\uFEFF/,'').split(/\r?\n/)){
    if(!line.trim())continue;
    const match=line.match(/^(\S+) (\d+):(\d+) (.+)$/);
    if(!match)throw Error('Invalid eBible verse-per-line record');
    const i=vplCodes.indexOf(match[1]),c=Number(match[2]),v=Number(match[3]);
    if(i<0||i<previous||i>previous+1)throw Error('Missing or out-of-order Bible book');
    previous=i;const book=books[i];let current=book.chapters.at(-1);
    if(!current||current.number!==c){
      if(c!==(current?.number??0)+1||v!==1)throw Error('Invalid chapter order in '+book.name);
      current={number:c,verses:[]};book.chapters.push(current);
    }
    if(v!==current.verses.length+1)throw Error('Missing or duplicate verse in '+book.name);
    current.verses.push({number:v,text:match[4]});verseCount++;
  }
  if(books.some(b=>!b.chapters.length))throw Error('Expected 66 Bible books');
  if(requireComplete&&verseCount!==31102)throw Error('Expected 31,102 BBE verses; found '+verseCount);
  return {translation:'BBE',bookCount:books.length,verseCount,books};
}
export function parseBibleDocument(doc){
  if(doc.format==='gutenberg-kjv')return parseGutenbergKJV(doc.text);
  if(doc.format==='ebible-bbe-vpl')return parseBasicEnglish(doc.text);
}
function findBook(bible, name){
  const key=normalize(name);
  if(key==='ps'||key==='psalm')return bible.books.find(b=>b.id==='psalms');
  if(key==='songofsongs')return bible.books.find(b=>b.id==='song-of-solomon');
  const exact=bible.books.find(b=>normalize(b.name)===key||normalize(b.id)===key);
  if(exact)return exact;
  const candidates=key.length>=2?bible.books.filter(b=>normalize(b.name).startsWith(key)):[];
  return candidates.length===1?candidates[0]:undefined;
}
export function chapter(bible, bookId, number=1){
  const book=findBook(bible,bookId);
  const content=book?.chapters.find(c=>c.number===Number(number));
  if(!book||!content)throw Error('Book or chapter not found');
  const previous=content.number>1?{book:book.id,chapter:content.number-1}:book.order>0?{book:bible.books[book.order-1].id,chapter:bible.books[book.order-1].chapters.length}:null;
  const next=content.number<book.chapters.length?{book:book.id,chapter:content.number+1}:book.order<bible.books.length-1?{book:bible.books[book.order+1].id,chapter:1}:null;
  return {book:book.id,name:book.name,chapter:content.number,verses:content.verses,previous,next};
}
export function searchVerses(bible, query, limit=100){
  const q=query.trim();
  const reference=q.match(/^([1-3]?\s*[a-z][a-z\s-]*?)\s*(\d+)(?::(\d+)(?:-(\d+))?)?$/i);
  let book,chapterNumber,first,last;
  if(reference){
    book=findBook(bible,reference[1]);chapterNumber=Number(reference[2]);first=reference[3]?Number(reference[3]):undefined;last=reference[4]?Number(reference[4]):first;
    if(!book||!book.chapters.some(c=>c.number===chapterNumber)||first===0||last<first) return {total:0,matches:[],limit};
  }
  const words=q.toLowerCase().split(/\s+/).filter(Boolean);
  const matches=[];let total=0;
  for(const b of bible.books)for(const c of b.chapters)for(const v of c.verses){
    const match=reference?b.id===book.id&&c.number===chapterNumber&&(first===undefined||(v.number>=first&&v.number<=last)):words.length>0&&words.every(w=>v.text.toLowerCase().includes(w));
    if(match){total++;if(matches.length<limit)matches.push({book:b.id,name:b.name,chapter:c.number,verse:v.number,text:v.text,reference:`${b.name} ${c.number}:${v.number}`});}
  }
  return {total,matches,limit};
}
