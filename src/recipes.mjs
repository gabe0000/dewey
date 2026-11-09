import {units,matchRecipe} from './kitchen.mjs';
const validId=value=>typeof value==='string'&&/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(value);
const string=value=>typeof value==='string'&&value.trim().length>0&&value.length<=10000;
const requireValue=(value,message)=>{if(!value)throw Error('Invalid recipe collection: '+message);};
export function parseRecipes(text){
  const pack=JSON.parse(text);
  requireValue(pack.schema===1&&string(pack.title)&&Array.isArray(pack.recipes)&&pack.recipes.length>0&&pack.recipes.length<=5000,'header');
  requireValue(Array.isArray(pack.guides)&&Array.isArray(pack.mealChains)&&Array.isArray(pack.references),'guides, meal chains and references');
  const guideIds=new Set();
  for(const guide of pack.guides){
    requireValue(validId(guide.id)&&!guideIds.has(guide.id)&&string(guide.title)&&string(guide.summary)&&Array.isArray(guide.sections)&&guide.sections.length>0,'guide');guideIds.add(guide.id);
    for(const section of guide.sections)requireValue(string(section.title)&&string(section.text),'guide section');
  }
  const ids=new Set();
  const item=i=>requireValue(validId(i.key)&&string(i.label)&&Number.isFinite(i.quantity)&&i.quantity>0&&i.quantity<=1000000&&Boolean(units[i.unit]),'ingredient/output');
  for(const recipe of pack.recipes){
    requireValue(validId(recipe.id)&&!ids.has(recipe.id)&&string(recipe.title)&&string(recipe.summary),'recipe identity');ids.add(recipe.id);
    requireValue(['Homestead','Everyday','Hunting','Foraging'].includes(recipe.section)&&['Simple','Intermediate','Project'].includes(recipe.difficulty)&&string(recipe.category),'recipe filters');
    requireValue(Number.isFinite(recipe.servings)&&recipe.servings>0&&recipe.servings<=1000,'servings');
    for(const key of ['prepMinutes','cookMinutes','restMinutes'])requireValue(Number.isInteger(recipe[key])&&recipe[key]>=0&&recipe[key]<=10080,'time');
    requireValue(Array.isArray(recipe.ingredients)&&recipe.ingredients.length<=100&&(recipe.ingredients.length>0||recipe.unmeasuredIngredients?.length>0)&&Array.isArray(recipe.steps)&&recipe.steps.length>0,'ingredients and instructions');
    if(recipe.unmeasuredIngredients!==undefined)requireValue(Array.isArray(recipe.unmeasuredIngredients)&&recipe.unmeasuredIngredients.every(string),'unmeasured ingredients');
    if(recipe.servingUnit!==undefined)requireValue(['portions','batches'].includes(recipe.servingUnit),'serving unit');
    if(recipe.sourceUrl!==undefined)requireValue(typeof recipe.sourceUrl==='string'&&recipe.sourceUrl.startsWith('https://'),'source URL');
    requireValue(Array.isArray(recipe.allergens)&&recipe.allergens.every(string)&&Array.isArray(recipe.tags)&&recipe.tags.every(string)&&Array.isArray(recipe.equipment)&&recipe.equipment.every(string),'recipe metadata');
    requireValue(Array.isArray(recipe.produces)&&recipe.produces.length>0,'recipe outputs');
    for(const ingredient of recipe.ingredients)item(ingredient);
    for(const output of recipe.produces)item(output);
    for(const step of recipe.steps)requireValue(string(step.text)&&Array.isArray(step.guides)&&step.guides.every(id=>guideIds.has(id)),'instruction or missing guide');
  }
  for(const recipe of pack.recipes)for(const step of recipe.steps)if(step.recipes!==undefined)requireValue(Array.isArray(step.recipes)&&step.recipes.every(id=>ids.has(id)),'linked recipe');
  const chainIds=new Set();
  for(const chain of pack.mealChains){
    requireValue(validId(chain.id)&&!chainIds.has(chain.id)&&string(chain.title)&&string(chain.summary)&&Array.isArray(chain.meals)&&chain.meals.length>=2,'meal chain');chainIds.add(chain.id);
    for(const meal of chain.meals){
      const recipe=pack.recipes.find(r=>r.id===meal.recipeId);
      requireValue(recipe&&Number.isInteger(meal.day)&&meal.day>=0&&Number.isFinite(meal.servings)&&meal.servings>0&&Array.isArray(meal.expectedLeftovers)&&string(meal.note),'meal chain step');
      for(const output of meal.expectedLeftovers){item(output);requireValue(recipe.produces.some(p=>p.key===output.key&&p.unit===output.unit),'meal-chain output');}
    }
  }
  for(const reference of pack.references)requireValue(string(reference.title)&&typeof reference.url==='string'&&reference.url.startsWith('https://'),'reference');
  return pack;
}
export function ingredientList(pack){
  const items=new Map();
  for(const r of pack.recipes)for(const i of [...r.ingredients,...r.produces])if(!items.has(i.key))items.set(i.key,{key:i.key,label:i.key.split('-').map(w=>w[0].toUpperCase()+w.slice(1)).join(' '),unit:i.unit,cooked:Boolean(i.cooked),requiresCold:Boolean(i.requiresCold)});
  return [...items.values()].sort((a,b)=>a.label.localeCompare(b.label));
}
const matchesWords=(text,query)=>query.toLowerCase().trim().split(/\s+/).filter(Boolean).every(word=>text.toLowerCase().includes(word));
const recipeText=r=>[r.title,r.summary,r.section,r.category,...r.tags,...r.equipment,...r.ingredients.map(i=>i.label),...(r.unmeasuredIngredients||[]),...r.steps.map(s=>s.text),r.originalText||''].join(' ');
export function searchRecipes(pack,query=''){
  return pack.recipes.filter(r=>matchesWords(recipeText(r),query));
}
function searchExcerpt(recipe,query=''){
  if(!query.trim())return undefined;
  const text=recipeText(recipe).replace(/\s+/g,' '),word=query.toLowerCase().trim().split(/\s+/)[0],at=text.toLowerCase().indexOf(word),start=Math.max(0,at-55),end=Math.min(text.length,at+word.length+105);
  return (start?'…':'')+text.slice(start,end)+(end<text.length?'…':'');
}
export function searchGuides(pack,query=''){
  return query.trim()?pack.guides.filter(g=>matchesWords([g.title,g.summary,...g.sections.flatMap(s=>[s.title,s.text])].join(' '),query)):[];
}
export function recipeCatalog(pack,state,params={}){
  const filtered=searchRecipes(pack,params.q||'').filter(r=>(!params.section||r.section===params.section)&&(!params.difficulty||r.difficulty===params.difficulty)&&(!params.category||r.category===params.category));
  const recipes=filtered.map(r=>({id:r.id,title:r.title,summary:r.summary,section:r.section,category:r.category,difficulty:r.difficulty,servings:r.servings,servingUnit:r.servingUnit||'portions',timeUnknown:Boolean(r.timeUnknown),totalMinutes:r.prepMinutes+r.cookMinutes+r.restMinutes,tags:r.tags,allergens:r.allergens,searchExcerpt:searchExcerpt(r,params.q),match:matchRecipe(r,state,{checkBasics:params.checkBasics==='1'})}));
  if(params.stock==='1')recipes.sort((a,b)=>a.match.conflicts.length-b.match.conflicts.length||(a.match.missing.length+a.match.unmeasured.length)-(b.match.missing.length+b.match.unmeasured.length)||b.match.covered-a.match.covered);
  return {title:pack.title,total:recipes.length,recipeCount:pack.recipes.length,homesteadCount:pack.recipes.filter(r=>r.section==='Homestead').length,recipes,sections:[...new Set(pack.recipes.map(r=>r.section))],categories:[...new Set(pack.recipes.map(r=>r.category))].sort(),guides:pack.guides.map(({id,title,summary})=>({id,title,summary})),matchingGuides:searchGuides(pack,params.q||'').map(({id,title,summary})=>({id,title,summary})),mealChains:pack.mealChains,ingredients:ingredientList(pack),references:pack.references};
}
