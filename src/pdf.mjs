import {fileURLToPath} from 'node:url';
const assets=fileURLToPath(new URL('../node_modules/pdfjs-dist/',import.meta.url));
export async function parsePdf(bytes){
  if(!Buffer.isBuffer(bytes)||bytes.length>100*1024*1024||!bytes.subarray(0,1024).includes(Buffer.from('%PDF-')))throw Error('Invalid PDF source (maximum 100 MiB)');
  const {getDocument}=await import('pdfjs-dist/legacy/build/pdf.mjs');
  const task=getDocument({data:new Uint8Array(bytes),isEvalSupported:false,stopAtErrors:true,useSystemFonts:false,standardFontDataUrl:assets+'standard_fonts/',cMapUrl:assets+'cmaps/',cMapPacked:true});
  try{
    const pdf=await task.promise;
    if(pdf.numPages<1||pdf.numPages>2000)throw Error('PDF must contain 1–2000 pages');
    const pages=[];
    for(let n=1;n<=pdf.numPages;n++){
      const page=await pdf.getPage(n),content=await page.getTextContent();
      pages.push({number:n,text:content.items.map(i=>i.str===undefined?'':i.str+(i.hasEOL?'\n':' ')).join('').replace(/[ \t]+/g,' ').trim()});page.cleanup();
    }
    return {pageCount:pdf.numPages,pages,textQuality:pages.some(p=>p.text.length>20)?'embedded text; diagrams and reading order require the original page':'No usable embedded text; search may miss scanned pages'};
  }finally{await task.destroy();}
}
export function findPages(pdf,query=''){
  const words=query.trim().toLowerCase().split(/\s+/).filter(Boolean);
  const matches=words.length?pdf.pages.filter(p=>words.every(w=>p.text.toLowerCase().includes(w))):[];
  return {total:matches.length,limit:100,matches:matches.slice(0,100).map(p=>{const at=Math.max(0,p.text.toLowerCase().indexOf(words[0])-70);return {number:p.number,snippet:p.text.slice(at,at+300)};})};
}
