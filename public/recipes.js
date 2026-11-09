const memories=new Map();
const unitNames=['each','cup','tbsp','tsp','lb','oz','g','kg','ml','l'];
const round=n=>Number(n.toFixed(3));
const amount=(n,unit)=>`${round(n)} ${unit}`;
const stamp=iso=>iso?new Date(iso).toLocaleString(): 'not recorded';
function localDate(value=new Date()){const d=new Date(value);return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;}
function localTime(value){if(!value)return '';const d=new Date(value);return localDate(d)+'T'+String(d.getHours()).padStart(2,'0')+':'+String(d.getMinutes()).padStart(2,'0');}
const iso=value=>value?new Date(value).toISOString():null;
const slug=value=>value.toLowerCase().trim().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'');
const duration=n=>n>=60?`${Math.floor(n/60)}h${n%60?' '+n%60+'m':''}`:`${n}m`;

export async function renderRecipes(doc,{container,api,el,token,route,isCurrent}){
  const state=memories.get(doc.id)||{tab:'Recipes',q:'',section:'Homestead',difficulty:'Simple',category:'',stock:false,checkBasics:false};memories.set(doc.id,state);
  let household,data,revision=0,request=0;
  const node=(tag,text='',cls)=>{const n=el(tag,text);if(cls)n.className=cls;return n;};
  const button=(text,fn,cls='k-button')=>{const b=node('button',text,cls);b.type='button';b.onclick=fn;return b;};
  const field=(label,input)=>{const l=node('label');input.setAttribute('aria-label',label);l.append(node('span',label),input);return l;};
  const input=(type='text',value='')=>{const n=node('input');n.type=type;n.value=value;return n;};
  const select=(values,value)=>{const n=node('select');for(const [key,label] of values){const o=node('option',label);o.value=key;n.append(o);}n.value=value;return n;};
  const checkbox=(label,checked)=>{const n=input('checkbox');n.checked=checked;return {input:n,label:field(label,n)};};
  const goto=(kind,id)=>{location.hash='#'+[doc.id,kind,id].filter(Boolean).map(encodeURIComponent).join('/');};
  document.body.classList.add('kitchen-open');container.className='recipes-reader';
  const top=node('div','','k-top');top.append(button('← Library',()=>{location.hash='';},'k-back'),node('span','DEWEY · THE HOMESTEAD KITCHEN','k-eyebrow'));
  const hero=node('section','','k-hero');hero.append(node('p','A little know-how. A good meal.','k-eyebrow'),node('h2','From the pantry\nto the table.'),node('p','Start with the basics, learn as you cook, and give tomorrow’s leftovers a plan.','k-intro'));
  hero.hidden=Boolean(route[0]);
  const counts=node('div',`${doc.recipeCount} recipes  ·  ${doc.homesteadCount} homestead meals  ·  offline kitchen guides`,'k-counts');hero.append(counts);
  const navigation=node('nav','','k-nav');navigation.setAttribute('aria-label','Kitchen sections');
  const alert=node('p','','k-alert');alert.setAttribute('role','alert');alert.hidden=true;
  const pane=node('section','','k-pane');pane.setAttribute('aria-live','polite');
  const navButtons=new Map();
  const notify=error=>{alert.textContent=error.message||String(error);alert.hidden=false;};
  async function refresh(){
    const params=new URLSearchParams({q:state.q,section:state.section,difficulty:state.difficulty,category:state.category,stock:state.stock?'1':'0',checkBasics:state.checkBasics?'1':'0'});
    [data,household]=await Promise.all([api('/api/recipes/'+doc.id+'?'+params),api('/api/household?checkBasics='+(state.checkBasics?'1':'0'))]);revision=household.state.revision;
  }
  async function mutate(action,payload){
    if(!household.enabled)throw Error('Pantry and meal-plan storage is not enabled for this library');
    const body=JSON.stringify({revision,action,data:payload});
    async function send(){return fetch('/api/household',{method:'POST',headers:{'Content-Type':'application/json','X-Dewey-Planner-Token':token},body});}
    let response=await send();if(response.status===403){token=(await api('/api/status')).plannerToken;response=await send();}
    const result=await response.json();if(!response.ok){await refresh();throw Error(result.error);}
    await refresh();
  }
  const formSubmit=(form,handler)=>{form.onsubmit=async e=>{e.preventDefault();alert.hidden=true;const submits=[...form.querySelectorAll('button[type="submit"]')];submits.forEach(b=>b.disabled=true);try{await handler();}catch(error){notify(error);}finally{submits.forEach(b=>b.disabled=false);}};};
  const submit=(form,label)=>{const b=node('button',label,'k-button primary');b.type='submit';form.append(b);return b;};
  const perform=fn=>async()=>{alert.hidden=true;try{await fn();}catch(error){notify(error);}};
  async function switchTab(tab){state.tab=tab;if(route[0]){goto();return;}await showTab();}
  for(const tab of ['Recipes','Pantry','Meal plan','Shopping','Kitchen guides']){const b=button(tab,perform(()=>switchTab(tab)),'k-tab');navButtons.set(tab,b);navigation.append(b);}
  container.replaceChildren(top,hero,navigation,alert,pane);
  function heading(title,description){const h=node('div','','k-section-heading');h.append(node('h3',title));if(description)h.append(node('p',description));pane.append(h);}
  function empty(title,text){const box=node('div','','k-empty');box.append(node('h4',title),node('p',text));pane.append(box);}
  function sourceRecord(){const details=node('details','','k-source');details.append(node('summary','Collection source & references'),node('p',doc.provenance),node('p',doc.license));const original=node('a','Open original recipe collection');original.href='/api/original/'+doc.id;original.target='_blank';original.rel='noopener';details.append(original);pane.append(details);}
  function outputFields(recipe,title){
    const section=node('fieldset','','k-output-fields');section.append(node('legend',title));const outputs=[];
    for(const output of recipe.produces){const quantity=input('number','0');quantity.min='0';quantity.step='0.01';const row=node('div','','k-output-row');row.append(field(output.label+' ('+output.unit+')',quantity));section.append(row);outputs.push({output,quantity});}
    return {section,values:()=>outputs.filter(o=>Number(o.quantity.value)>0).map(o=>({...o.output,quantity:Number(o.quantity.value)}))};
  }
  function statusText(match){if(match.conflicts.length)return 'Recorded avoidance: '+match.conflicts.join(', ');if(match.unmeasured?.length)return match.unmeasured.length+' ingredient amounts need a manual check';if(!household.state.inventory.some(l=>l.quantity>0))return 'Add your actual pantry to check quantities';return match.ready?'Stock covers listed amounts':match.usesExpected&&!match.missing.length?'Relies on planned leftovers':`${match.covered} of ${match.total} ingredient amounts covered`;}
  async function recipeList(){
    heading('Start simple. Build confidence.','The first view shows simple homestead recipes. Change the filters whenever you’re ready for more.');
    const controls=node('div','','k-filters'),query=input('search',state.q);query.placeholder='Potatoes, soup, eggs, bread…';
    const area=select([['','All recipes'],...data.sections.map(s=>[s,s])],state.section);
    const level=select([['','All skill levels'],['Simple','Simple'],['Intermediate','Intermediate'],['Project','Project']],state.difficulty);
    const category=select([['','All categories'],...data.categories.map(c=>[c,c])],state.category);
    controls.append(field('Find recipes',query),field('Recipe area',area),field('Skill level',level),field('Category',category));pane.append(controls);
    const stock=checkbox('Sort by what I have',state.stock),basics=checkbox('Check salt, pepper, water and oil too',state.checkBasics),options=node('div','','k-options');options.append(stock.label,basics.label);pane.append(options);
    const count=node('p','','k-result-count'),grid=node('div','','k-recipe-grid');pane.append(count,grid);
    async function update(){const seq=++request;state.q=query.value;state.section=area.value;state.difficulty=level.value;state.category=category.value;state.stock=stock.input.checked;state.checkBasics=basics.input.checked;const params=new URLSearchParams({q:state.q,section:state.section,difficulty:state.difficulty,category:state.category,stock:state.stock?'1':'0',checkBasics:state.checkBasics?'1':'0'});try{const result=await api('/api/recipes/'+doc.id+'?'+params);if(seq!==request||!isCurrent())return;count.textContent=result.total+' recipes'+(state.checkBasics?'':' · pantry basics omitted from stock checks');grid.replaceChildren();for(const recipe of result.recipes){const card=button('',()=>goto('recipe',recipe.id),'k-recipe-card');card.append(node('small',recipe.section+' · '+recipe.difficulty),node('strong',recipe.title),node('span',recipe.summary),node('small',(recipe.timeUnknown?'Time not stated':duration(recipe.totalMinutes))+' · '+recipe.servings+' '+recipe.servingUnit),node('span',statusText(recipe.match),'k-stock-note'));grid.append(card);}if(!result.total)grid.append(node('p','No recipes match these filters. Try another ingredient or skill level.'));}catch(error){notify(error);}}
    let timer;query.oninput=()=>{clearTimeout(timer);timer=setTimeout(update,200);};for(const control of [area,level,category,stock.input,basics.input])control.onchange=update;
    await update();sourceRecord();
  }
  async function recipeDetail(id){
    const result=await api('/api/recipes/'+doc.id+'/recipe/'+id+'?checkBasics='+(state.checkBasics?'1':'0'));if(!isCurrent())return;
    const r=result.recipe;state.returnRecipe=r.id;state.returnTitle=r.title;
    pane.append(button('← Recipes',()=>goto(),'k-back'));heading(r.title,r.summary);
    const meta=node('div','','k-recipe-meta');for(const value of [r.section,r.difficulty,r.timeUnknown?'Time not fully stated':`${r.prepMinutes}m prep`,r.timeUnknown?null:`${r.cookMinutes}m cooking`,r.restMinutes?`${r.restMinutes}m resting/rising`:null,`${r.servings} ${r.servingUnit||'portions'}`].filter(Boolean))meta.append(node('span',value));pane.append(meta);
    const columns=node('div','','k-recipe-detail'),ingredients=node('section','','k-ingredients'),steps=node('section','','k-instructions');
    ingredients.append(node('p',r.equipment.length?'Equipment: '+r.equipment.join(', '):'Check the original steps for equipment before starting.','k-fine'),node('h4','Ingredients'),node('p',statusText(result.match),'k-stock-note'));const list=node('ul');
    for(const [index,i] of r.ingredients.entries()){const item=node('li');item.append(node('strong',amount(i.quantity,i.unit)),node('span',i.label));const checked=result.match.ingredients.find(m=>m.ingredientIndex===index);if(checked?.missing>0)item.append(node('small','Need '+amount(checked.missing,i.unit)+(checked.unitMismatch?' · another recorded unit needs a measurement':'')));else if(i.pantryBasic&&!state.checkBasics)item.append(node('small','Pantry basic · not included in stock check'));list.append(item);}for(const raw of r.unmeasuredIngredients||[]){const item=node('li');item.append(node('span',raw),node('small','Check this amount manually; excluded from quantity matching'));list.append(item);}ingredients.append(list);if(r.sourceNote)ingredients.append(node('p',r.sourceNote,'k-review'));
    ingredients.append(node('p','Listed allergens: '+(r.allergens.length?r.allergens.join(', '):'none identified from the basic ingredients')+'. Check packaged ingredient labels.','k-fine'));
    steps.append(node('h4','One step at a time'));const ol=node('ol','','k-steps');
    r.steps.forEach((step,n)=>{const item=node('li');item.append(node('span',String(n+1),'k-step-number'),node('p',step.text));if(step.guides.length){const links=node('div','','k-guide-links');for(const id of step.guides){const guide=result.guides.find(g=>g.id===id);const a=node('a',guide.title+' ↗');a.href='#'+doc.id+'/guide/'+id;links.append(a);}item.append(links);}if(step.recipes?.length){const links=node('div','','k-guide-links');for(const id of step.recipes){const a=node('a','Related recipe: '+id.replace(/^community-/, '').replaceAll('-',' ')+' ↗');a.href='#'+doc.id+'/recipe/'+id;links.append(a);}item.append(links);}ol.append(item);});steps.append(ol);columns.append(ingredients,steps);pane.append(columns);
    const planning=node('section','','k-plan-recipe');planning.append(node('h4','Plan this meal'),node('p','Planned portions and expected leftovers are estimates. Actual stock changes only after you log cooking.'));
    const form=node('form','','k-form'),day=input('date',localDate()),portions=input('number',String(r.servings));day.required=true;portions.min='0.25';portions.step='.25';portions.required=true;
    form.append(field('Meal date',day),field(r.servingUnit==='batches'?'Batches to cook':'Portions to cook',portions));const expected=outputFields(r,'Expected to save · estimates only');form.append(expected.section);submit(form,'Add to meal plan').disabled=!household.enabled;
    formSubmit(form,async()=>{await mutate('addPlan',{collectionId:doc.id,recipeId:r.id,scheduledAt:new Date(day.value+'T12:00').toISOString(),servings:Number(portions.value),expectedLeftovers:expected.values()});state.tab='Meal plan';goto();});planning.append(form);pane.append(planning);
    const missing=result.match.missing.map(i=>({key:i.key,label:i.label,quantity:i.missing,unit:i.unit}));if(missing.length)pane.append(button('Add these missing ingredients to shopping',perform(async()=>{await mutate('addGroceries',{items:missing});state.tab='Shopping';goto();})));
    if(r.originalText){const original=node('details','','k-source');original.append(node('summary','Original community recipe & source'),node('p','Author: '+(r.sourceAuthor||'Community contributor')),node('p',r.sourceUrl||''));const text=node('pre',r.originalText);text.className='k-original';original.append(text);pane.append(original);}sourceRecord();
  }
  async function guideDetail(id){
    const g=await api('/api/recipes/'+doc.id+'/guide/'+id);if(!isCurrent())return;
    pane.append(button(state.returnRecipe?'← Back to '+state.returnTitle:'← Kitchen guides',()=>{if(state.returnRecipe)goto('recipe',state.returnRecipe);else{state.tab='Kitchen guides';goto();}},'k-back'));
    heading(g.title,g.summary);const article=node('div','','k-guide-article');
    for(const section of g.sections){article.append(node('h4',section.title));for(const paragraph of section.text.split('\n').filter(Boolean))article.append(node('p',paragraph));}pane.append(article);
    const references=node('details','','k-source');references.append(node('summary','Factual references · online links'));for(const ref of g.references){const a=node('a',ref.title);a.href=ref.url;a.target='_blank';a.rel='noopener noreferrer';references.append(a);}pane.append(references);
  }
  function guides(){heading('A guide beside every recipe','Read these here, offline. Recipe steps link back to the technique they use.');const grid=node('div','','k-guide-grid');for(const g of data.guides){const b=button('',()=>goto('guide',g.id),'k-guide-card');b.append(node('strong',g.title),node('span',g.summary));grid.append(b);}pane.append(grid);}
  function pantry(){
    heading('What is actually on hand?','Record quantities and storage. A planned purchase or hoped-for leftover does not belong here yet.');
    const form=node('form','','k-form k-pantry-form'),name=input('text'),quantity=input('number','1'),unit=select(unitNames.map(u=>[u,u]),'each'),location=select(['Pantry','Fridge','Freezer'].map(v=>[v,v]),'Pantry');name.placeholder='Rice, eggs, cooked chicken…';name.required=true;name.setAttribute('list','k-ingredient-options');quantity.min='.001';quantity.step='.001';quantity.required=true;
    const datalist=node('datalist');datalist.id='k-ingredient-options';for(const i of data.ingredients){const o=node('option');o.value=i.label;datalist.append(o);}
    const cooked=checkbox('Already prepared / opened leftovers',false),stable=checkbox('Unopened shelf-stable food or plain bread',false),history=checkbox('Cooling and storage history is known',false),prepared=input('datetime-local'),stored=input('datetime-local'),useBy=input('date');
    form.append(field('Food or ingredient',name),datalist,field('Quantity on hand',quantity),field('Unit',unit),field('Stored in',location),cooked.label,stable.label,field('Original preparation date',prepared),field('Stored here since',stored),field('Package use-by date (if known)',useBy),history.label);
    const nowButton=button('Use now for storage time',()=>{stored.value=localTime(new Date());});form.append(nowButton,node('p','Leave unknown dates blank; they will be flagged for review. Changing a dish does not make old food new.','k-fine'));
    let editing;const save=submit(form,'Add actual food');save.disabled=!household.enabled;
    function info(){return data.ingredients.find(i=>i.label.toLowerCase()===name.value.trim().toLowerCase()||i.key===slug(name.value));}
    name.onchange=()=>{const i=info();if(i){unit.value=i.unit;cooked.input.checked=i.cooked;location.value=i.requiresCold?'Fridge':'Pantry';}};
    stable.input.onchange=()=>{if(stable.input.checked)cooked.input.checked=false;};
    location.onchange=()=>{if(editing)stored.value=localTime(new Date());};
    formSubmit(form,async()=>{
      const i=info();
      if(editing){const payload={id:editing.id,quantity:Number(quantity.value),location:location.value,storageSince:iso(stored.value),handlingConfirmed:history.input.checked,useBy:useBy.value?new Date(useBy.value+'T23:59').toISOString():null};if(!editing.lineage?.length)payload.preparedAt=iso(prepared.value);await mutate('updateInventory',payload);}
      else await mutate('addInventory',{key:i?.key||name.value,label:i?.label||name.value,quantity:Number(quantity.value),unit:unit.value,location:location.value,cooked:cooked.input.checked,requiresCold:!stable.input.checked&&(cooked.input.checked||Boolean(i?.requiresCold)),shelfStable:stable.input.checked,preparedAt:iso(prepared.value),storageSince:iso(stored.value),handlingConfirmed:history.input.checked,useBy:useBy.value?new Date(useBy.value+'T23:59').toISOString():null});
      await showTab();
    });pane.append(form);
    const lots=household.state.inventory.filter(l=>l.quantity>0);
    if(!lots.length)empty('An honest starting point','Your pantry is empty until you enter food you actually have. Nothing has been filled with sample stock.');
    const cards=node('div','','k-inventory-list');
    for(const lot of lots){const card=node('section','','k-inventory-card');card.append(node('h4',lot.label),node('p',amount(lot.quantity,lot.unit)+' · '+lot.location));if(lot.cooked)card.append(node('p','Originally prepared: '+stamp(lot.preparedAt),'k-fine'));card.append(node('p','Stored here since: '+stamp(lot.storageSince),'k-fine'));if(lot.lastCookedAt)card.append(node('p','Last cooked into a dish: '+stamp(lot.lastCookedAt),'k-fine'));
      for(const flag of household.review[lot.id]||[])card.append(node('p',flag,'k-review'));
      card.append(button('Adjust record',()=>{editing=lot;name.value=lot.label;name.disabled=true;quantity.value=String(lot.quantity);unit.value=lot.unit;unit.disabled=true;location.value=lot.location;cooked.input.checked=lot.cooked;cooked.input.disabled=true;stable.input.checked=lot.shelfStable;stable.input.disabled=true;prepared.value=localTime(lot.preparedAt);prepared.disabled=Boolean(lot.lineage?.length);stored.value=localTime(lot.storageSince);useBy.value=lot.useBy?localDate(lot.useBy):'';history.input.checked=lot.handlingConfirmed;save.textContent='Save actual adjustment';form.scrollIntoView({block:'start'});}),button('Remove from stock',perform(async()=>{await mutate('removeInventory',{id:lot.id});await showTab();}),'k-button quiet'));cards.append(card);
    }pane.append(cards);
    const details=node('details','','k-avoidances');details.append(node('summary','Recorded ingredient and allergen avoidances'));
    const avoidForm=node('form','','k-form'),allergens=input('text',household.state.avoidances.allergens.join(', ')),ingredients=input('text',household.state.avoidances.ingredients.join(', '));allergens.placeholder='milk, egg, wheat, fish';ingredients.placeholder='Ingredient names, separated by commas';avoidForm.append(field('Allergens to avoid',allergens),field('Ingredients to avoid',ingredients));submit(avoidForm,'Save avoidances').disabled=!household.enabled;formSubmit(avoidForm,async()=>{await mutate('avoidances',{allergens:allergens.value.toLowerCase().split(',').map(v=>v.trim()).filter(Boolean),ingredients:ingredients.value.split(',').map(v=>v.trim()).filter(Boolean)});await showTab();});details.append(avoidForm,node('p','Recorded matches are reminders, not an allergy or food-safety certification. Read ingredient labels.','k-fine'));pane.append(details);
    const care=node('a','Read: cooling, storage and reheating ↗');care.href='#'+doc.id+'/guide/leftover-care';pane.append(care);
  }
  function chains(){const grid=node('div','','k-chain-grid');for(const chain of data.mealChains){const card=node('section','','k-chain-card');card.append(node('h4',chain.title),node('p',chain.summary));const list=node('ol');for(const meal of chain.meals)list.append(node('li','Day '+(meal.day+1)+': '+meal.note));card.append(list);const form=node('form'),day=input('date',localDate());day.required=true;form.append(field('Start date for '+chain.title,day));submit(form,'Add this meal chain').disabled=!household.enabled;formSubmit(form,async()=>{await mutate('addChain',{collectionId:doc.id,chainId:chain.id,startAt:new Date(day.value+'T12:00').toISOString()});await showTab();});card.append(form);grid.append(card);}pane.append(grid);}
  async function cookingForm(plan,target){
    const response=await api('/api/recipes/'+plan.collectionId+'/recipe/'+plan.recipeId+'?servings='+plan.servings+'&checkBasics='+(state.checkBasics?'1':'0')),r=response.recipe;
    const box=node('section','','k-cook-confirmation');box.append(node('h4','What actually happened?'),node('p','Review actual quantities used. Expected leftovers below do not become stock unless you enter a real amount.'));
    const form=node('form','','k-form'),useFields=[];
    const lots=household.state.inventory.filter(l=>l.quantity>0&&r.ingredients.some(i=>i.key===l.key));
    for(const lot of lots){const qty=input('number',String(round(response.match.allocations.filter(a=>a.lotId===lot.id).reduce((n,a)=>n+a.quantity,0))));qty.min='0';qty.max=String(lot.quantity);qty.step='.001';form.append(field('Actually used: '+lot.label+' ('+lot.unit+'; '+round(lot.quantity)+' on hand)',qty));useFields.push({lot,qty});}
    if(!lots.length)form.append(node('p','No matching stock is recorded. You may log the meal as using untracked ingredients; no pantry amounts will be invented.','k-fine'));
    const actual=outputFields(r,'Actual leftovers saved · leave zero if none');const places=[];
    for(const output of r.produces){const place=select(['Fridge','Freezer','Pantry'].map(v=>[v,v]),output.requiresCold===false?'Pantry':'Fridge');actual.section.append(field('Store '+output.label+' in',place));places.push({key:output.key,place});}
    const reviewed=checkbox('I reviewed the amounts actually used',false);reviewed.input.required=true;
    const untracked=checkbox('Some ingredients used were not recorded in stock',!lots.length),old=checkbox('Untracked previously cooked food was used',r.ingredients.some(i=>i.cooked&&!lots.some(l=>l.key===i.key))||(r.unmeasuredIngredients||[]).some(i=>/\bcooked\b|leftover/i.test(i))),handling=checkbox('Prompt cooling and cold storage were confirmed',false);
    form.append(actual.section,untracked.label,old.label,handling.label,reviewed.label,node('p','Earlier preparation dates and recorded refrigerator time carry forward. Unknown cooked-food history remains flagged.','k-fine'));submit(form,'Confirm cooked meal & actual leftovers');
    formSubmit(form,async()=>{await mutate('confirmCook',{planId:plan.id,confirmed:reviewed.input.checked,uses:useFields.filter(v=>Number(v.qty.value)>0).map(v=>({lotId:v.lot.id,quantity:Number(v.qty.value)})),leftovers:actual.values().map(o=>({...o,location:places.find(p=>p.key===o.key).place.value})),untrackedIngredients:untracked.input.checked,untrackedCooked:old.input.checked,handlingConfirmed:handling.input.checked});await showTab();});box.append(form);target.replaceChildren(box);box.scrollIntoView({block:'start'});
  }
  function mealPlan(){
    heading('Cook once. Eat forward.','A plan can use expected leftovers, but only a cooking confirmation puts actual leftovers in your pantry.');
    const active=household.state.plans.filter(p=>p.status==='planned').sort((a,b)=>a.scheduledAt.localeCompare(b.scheduledAt));
    if(!active.length)empty('Plan your first meal','Open a recipe and choose a day, or start with one of the linked meal chains below.');
    const cards=node('div','','k-planned-meals');
    for(const plan of active){const recipe=data.recipes.find(r=>r.id===plan.recipeId);const title=household.plan.meals.find(m=>m.planId===plan.id)?.title||recipe?.title||plan.recipeId.replaceAll('-',' ');const result=household.plan.meals.find(m=>m.planId===plan.id)?.match;const card=node('section','','k-meal-card');card.append(node('small',new Date(plan.scheduledAt).toLocaleDateString(undefined,{weekday:'long',month:'short',day:'numeric'})),node('h4',title),node('p',plan.servings+' '+(plan.servingUnit||'portions')+' to cook'));
      if(result){if(result.unmeasured?.length)card.append(node('p',result.unmeasured.length+' ingredient amounts also need a manual check','k-review'));card.append(node('p',result.usesExpected?'Uses expected food from an earlier planned meal':result.ready?'Recorded stock covers the checked amounts':result.missing.length+' measured ingredient amounts are missing','k-stock-note'));for(const item of result.missing)card.append(node('p','Need '+amount(item.missing,item.unit)+' '+item.label,'k-fine'));for(const conflict of result.conflicts)card.append(node('p','Recorded avoidance: '+conflict,'k-review'));}
      if(plan.expectedLeftovers.length)card.append(node('p','Expected to save: '+plan.expectedLeftovers.map(l=>amount(l.quantity,l.unit)+' '+l.label).join('; '),'k-expected'));
      const cookTarget=node('div');card.append(button('Open recipe',()=>goto('recipe',plan.recipeId)),button('Log actual cooking',perform(()=>cookingForm(plan,cookTarget))),button('Remove plan',perform(async()=>{await mutate('removePlan',{id:plan.id});await showTab();}),'k-button quiet'),cookTarget);cards.append(card);
    }pane.append(cards);
    if(household.plan.missing.length)pane.append(button('Add plan’s missing ingredients to shopping',perform(async()=>{await mutate('addGroceries',{checkBasics:state.checkBasics});state.tab='Shopping';await showTab();}),'k-button primary'));
    heading('Try a linked meal chain','These are planning templates, not a promise of yield. Check servings, storage history and the quantities actually saved.');chains();
    if(household.state.cookedMeals.length){const history=node('details','','k-source');history.append(node('summary',household.state.cookedMeals.length+' cooked meals recorded'));for(const meal of household.state.cookedMeals.slice(-20).reverse())history.append(node('p',meal.recipeId.replaceAll('-',' ')+' · '+stamp(meal.at)+' · '+meal.leftoverLotIds.length+' actual leftover records'));pane.append(history);}
  }
  function shopping(){
    heading('Planned groceries','This list does not count as food on hand. Confirm the quantity actually bought to add it to the pantry.');
    if(!household.state.groceries.length)empty('Nothing on the shopping list','Add missing ingredients from a recipe or meal plan.');
    for(const item of household.state.groceries){const card=node('section','','k-shopping-card');card.append(node('h4',item.label),node('p','Need '+amount(item.quantity,item.unit)));const form=node('form','','k-inline-form'),q=input('number',String(round(item.quantity))),i=data.ingredients.find(i=>i.key===item.key),place=select(['Pantry','Fridge','Freezer'].map(v=>[v,v]),i?.requiresCold?'Fridge':'Pantry');q.min='.001';q.max=String(item.quantity);q.step='.001';form.append(field('Actually bought ('+item.unit+')',q),field('Store purchase in',place));submit(form,'Confirm purchase');formSubmit(form,async()=>{await mutate('purchase',{id:item.id,quantity:Number(q.value),location:place.value,confirmed:true,requiresCold:Boolean(i?.requiresCold),storageSince:new Date().toISOString()});await showTab();});card.append(form,button('Remove shopping item',perform(async()=>{await mutate('removeGrocery',{id:item.id});await showTab();}),'k-button quiet'));pane.append(card);}
  }
  async function showTab(){hero.hidden=state.tab!=='Recipes';const seq=++request;await refresh();if(!isCurrent()||seq!==request)return;pane.replaceChildren();for(const [name,b] of navButtons)b.setAttribute('aria-pressed',String(name===state.tab));if(!household.enabled)pane.append(node('p','This kitchen is in read-only mode. Recipes and guides still work; private pantry storage has not been enabled.','k-review'));if(state.tab==='Recipes')await recipeList();else if(state.tab==='Pantry')pantry();else if(state.tab==='Meal plan')mealPlan();else if(state.tab==='Shopping')shopping();else guides();}
  try{await refresh();if(!isCurrent())return;if(route[0]==='recipe'&&route[1])await recipeDetail(route[1]);else if(route[0]==='guide'&&route[1])await guideDetail(route[1]);else await showTab();if(isCurrent())container.scrollIntoView({block:'start'});}catch(error){notify(error);}
}
