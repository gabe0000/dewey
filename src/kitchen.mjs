import {randomUUID} from 'node:crypto';

export const units=Object.freeze(Object.assign(Object.create(null),{g:['mass',1],kg:['mass',1000],oz:['mass',28.349523125],lb:['mass',453.59237],ml:['volume',1],l:['volume',1000],tsp:['volume',4.92892159375],tbsp:['volume',14.78676478125],cup:['volume',236.5882365],each:['count',1]}));
export const locations=['Pantry','Fridge','Freezer'];
const hour=3600000,epsilon=1e-7;
const aliases={eggs:'egg',potatoes:'potato',carrots:'carrot',onions:'onion',tomatoes:'tomato','chicken-stock':'chicken-broth','vegetable-stock':'vegetable-broth','leftover-chicken':'cooked-chicken','leftover-rice':'cooked-rice','leftover-beans':'cooked-beans','all-purpose-flour':'flour'};
export const ingredientKey=value=>{const key=String(value).trim().toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'');return aliases[key]||key;};
const check=(ok,message)=>{if(!ok)throw Error(message);};
const number=(value,zero=false)=>{const n=Number(value);check(Number.isFinite(n)&&n>=(zero?0:epsilon)&&n<=1000000,'Enter a valid quantity');return n;};
const text=(value,max=160)=>{check(typeof value==='string'&&value.trim().length>0&&value.length<=max,'Enter valid text');return value.trim();};
const key=value=>{const k=ingredientKey(text(value));check(/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(k),'Invalid ingredient');return k;};
const date=(value,now)=>{if(!value)return null;const n=Date.parse(value);check(Number.isFinite(n)&&n<=now+300000,'Enter a valid date that is not in the future');return new Date(n).toISOString();};
export function convert(quantity,from,to){check(units[from]&&units[to]&&units[from][0]===units[to][0],'Units cannot be converted without more information');return quantity*units[from][1]/units[to][1];}
export function emptyHousehold(){return {schema:1,revision:0,inventory:[],plans:[],groceries:[],cookedMeals:[],avoidances:{allergens:[],ingredients:[]},audit:[]};}
export function chilledHours(lot,now=Date.now()){
  const ongoing=lot.location==='Fridge'&&lot.storageSince?Math.max(0,(now-Date.parse(lot.storageSince))/hour):0;
  return (lot.chilledHoursBefore||0)+ongoing;
}
export function foodReview(lot,now=Date.now()){
  const flags=[];
  if(lot.useBy&&Date.parse(lot.useBy)<now)flags.push('Past the recorded use-by date');
  if(lot.cooked){
    if(lot.requiresCold!==false&&!lot.preparedAt)flags.push('Original preparation date is missing');
    if(lot.requiresCold!==false){
      if(!lot.handlingConfirmed&&!lot.expected)flags.push('Cooling/storage history needs review');
      if(lot.location==='Pantry')flags.push('Prepared food needs cold storage');
      if(chilledHours(lot,now)>96)flags.push('Recorded refrigerator time exceeds four days');
    }
  }else if(lot.requiresCold&&!lot.shelfStable){
    if(lot.location==='Pantry')flags.push('Perishable ingredient needs cold storage');
    if(!lot.storageSince)flags.push('Cold-storage date is missing');
    const limits={'raw-chicken':48,'whole-chicken':48,'ground-beef':48,sausage:48,fish:48,'raw-beef':120,'raw-pork':120,egg:840};
    if(limits[lot.key]&&chilledHours(lot,now)>limits[lot.key])flags.push('Recorded refrigerator time needs review for this raw ingredient');
  }
  if(lot.preparedAt&&Date.parse(lot.preparedAt)>now)flags.push('Preparation date is after this meal');
  return flags;
}
function needs(recipe,servings,checkBasics){return recipe.ingredients.filter(i=>!i.optional&&(checkBasics||!i.pantryBasic)).map(i=>({...i,quantity:i.quantity*servings/recipe.servings}));}
export function matchRecipe(recipe,state,{servings=recipe.servings,checkBasics=false,now=Date.now(),reserve=false}={}){
  const stock=reserve?state.inventory:structuredClone(state.inventory);
  const avoidance=state.avoidances||{allergens:[],ingredients:[]};
  const conflicts=[...recipe.allergens.filter(a=>avoidance.allergens.includes(a)),...recipe.ingredients.filter(i=>avoidance.ingredients.includes(i.key)).map(i=>i.label)];
  const ingredients=[],allocations=[];
  for(const item of needs(recipe,servings,checkBasics)){
    let remaining=item.quantity,available=0,reviewCount=0,unitMismatch=false;
    const candidates=stock.filter(l=>l.key===item.key&&l.quantity>epsilon).sort((a,b)=>(a.location==='Fridge'?0:1)-(b.location==='Fridge'?0:1)||(Date.parse(a.preparedAt||a.storageSince||'9999-01-01')-Date.parse(b.preparedAt||b.storageSince||'9999-01-01')));
    for(const lot of candidates){
      if(foodReview(lot,now).length){reviewCount++;continue;}
      if(!units[lot.unit]||units[lot.unit][0]!==units[item.unit][0]){unitMismatch=true;continue;}
      const amount=convert(lot.quantity,lot.unit,item.unit);available+=amount;
      const taken=Math.min(remaining,amount);
      if(taken>epsilon){const quantity=convert(taken,item.unit,lot.unit);allocations.push({lotId:lot.id,key:lot.key,label:lot.label,quantity,unit:lot.unit,expected:Boolean(lot.expected),sourceMeal:lot.sourceMeal||null});lot.quantity=Math.max(0,lot.quantity-quantity);remaining-=taken;}
    }
    ingredients.push({...item,available,missing:Math.max(0,remaining),reviewCount,unitMismatch});
  }
  const missing=ingredients.filter(i=>i.missing>epsilon);
  const unmeasured=recipe.unmeasuredIngredients||[];
  return {ingredients,allocations,missing,unmeasured,conflicts,covered:ingredients.length-missing.length,total:ingredients.length+unmeasured.length,usesExpected:allocations.some(a=>a.expected),ready:missing.length===0&&conflicts.length===0&&unmeasured.length===0&&!allocations.some(a=>a.expected),basicsExcluded:!checkBasics};
}
export function simulatePlans(state,lookup,{checkBasics=false,now=Date.now()}={}){
  const working={inventory:structuredClone(state.inventory),avoidances:state.avoidances};
  const results=[],missing=new Map();
  const plans=state.plans.filter(p=>p.status==='planned').sort((a,b)=>a.scheduledAt.localeCompare(b.scheduledAt)||a.createdAt.localeCompare(b.createdAt));
  for(const plan of plans){
    const recipe=lookup(plan.collectionId,plan.recipeId);if(!recipe)continue;
    const at=Math.max(now,Date.parse(plan.scheduledAt));
    const match=matchRecipe(recipe,working,{servings:plan.servings,checkBasics,now:at,reserve:true});
    for(const item of match.missing){const k=item.key+'|'+item.unit;const old=missing.get(k);if(old)old.quantity+=item.missing;else missing.set(k,{key:item.key,label:item.label,quantity:item.missing,unit:item.unit});}
    const parents=match.allocations.map(a=>working.inventory.find(l=>l.id===a.lotId)).filter(Boolean);
    const dates=parents.filter(l=>l.cooked).map(l=>l.preparedAt).filter(Boolean);
    const origin=dates.length?dates.sort()[0]:plan.scheduledAt;
    const oldHours=parents.filter(l=>l.cooked&&l.requiresCold!==false).reduce((n,l)=>Math.max(n,chilledHours(l,at)),0);
    for(const leftover of plan.expectedLeftovers){const output=recipe.produces.find(o=>o.key===leftover.key);working.inventory.push({...leftover,requiresCold:output?.requiresCold!==false,id:'expected-'+plan.id+'-'+leftover.key,expected:true,sourceMeal:plan.id,cooked:true,preparedAt:origin,storageSince:plan.scheduledAt,chilledHoursBefore:oldHours,handlingConfirmed:false,location:output?.requiresCold===false?'Pantry':'Fridge'});}
    results.push({planId:plan.id,title:recipe.title,match});
  }
  return {meals:results,missing:[...missing.values()]};
}
function amount(value){const unit=text(value.unit);check(Boolean(units[unit]),'Choose a supported unit');return {key:key(value.key),label:text(value.label),quantity:number(value.quantity),unit};}
export function applyHouseholdAction(current,action,data,{lookup,pack,ingredientInfo,now=Date.now()}={}){
  const state=structuredClone(current),stamp=new Date(now).toISOString();
  check(state.schema===1&&Number.isInteger(state.revision),'Invalid household record');
  const addLot=(entry,extra={})=>{
    const info=ingredientInfo?.(key(entry.key));
    const lot={...amount(entry),id:randomUUID(),location:text(entry.location||'Pantry'),cooked:Boolean(entry.cooked||info?.cooked),requiresCold:!entry.shelfStable&&Boolean(entry.requiresCold||entry.cooked||info?.requiresCold),shelfStable:Boolean(entry.shelfStable),preparedAt:date(entry.preparedAt,now),storageSince:date(entry.storageSince||entry.preparedAt,now),useBy:entry.useBy?new Date(text(entry.useBy)).toISOString():null,chilledHoursBefore:0,handlingConfirmed:Boolean(entry.handlingConfirmed),createdAt:stamp,lineage:[],...extra};
    check(locations.includes(lot.location),'Choose Pantry, Fridge or Freezer');state.inventory.push(lot);return lot;
  };
  const findPlan=id=>{const p=state.plans.find(p=>p.id===id);check(p&&p.status==='planned','Planned meal not found');return p;};
  const addPlan=input=>{
    const recipe=lookup(input.collectionId,input.recipeId);check(recipe,'Recipe not found');
    const scheduledAt=new Date(input.scheduledAt);check(Number.isFinite(scheduledAt.getTime()),'Choose a meal date');
    const expected=(input.expectedLeftovers||[]).map(amount);
    for(const item of expected)check(recipe.produces.some(p=>p.key===item.key&&p.unit===item.unit),'Expected leftover must match a recipe output');
    const p={id:randomUUID(),collectionId:input.collectionId,recipeId:input.recipeId,scheduledAt:scheduledAt.toISOString(),servings:number(input.servings),servingUnit:recipe.servingUnit||'portions',expectedLeftovers:expected,status:'planned',createdAt:stamp};state.plans.push(p);return p;
  };
  if(action==='addInventory')addLot(data);
  else if(action==='updateInventory'){
    const lot=state.inventory.find(l=>l.id===data.id);check(lot,'Inventory item not found');
    lot.quantity=number(data.quantity,true);
    const moving=Boolean(data.location&&data.location!==lot.location);
    if(moving){const transition=date(data.storageSince,now)||stamp;check(locations.includes(data.location),'Invalid storage location');check(!lot.storageSince||Date.parse(transition)>=Date.parse(lot.storageSince),'Storage move cannot precede the previous storage record');lot.chilledHoursBefore=chilledHours(lot,Date.parse(transition));lot.location=data.location;lot.storageSince=transition;}
    if(Object.hasOwn(data,'preparedAt')){check(!lot.lineage?.length,'Inherited preparation dates must be retained');lot.preparedAt=date(data.preparedAt,now);}
    if(!moving&&Object.hasOwn(data,'storageSince')){const next=date(data.storageSince,now);check(!lot.lineage?.length||next===lot.storageSince||(next&&lot.storageSince&&next<=lot.storageSince),'Inherited refrigerator time must be retained');lot.storageSince=next;}
    if(Object.hasOwn(data,'handlingConfirmed'))lot.handlingConfirmed=Boolean(data.handlingConfirmed);
    if(Object.hasOwn(data,'useBy'))lot.useBy=data.useBy?new Date(text(data.useBy)).toISOString():null;
  }
  else if(action==='removeInventory'){const lot=state.inventory.find(l=>l.id===data.id);check(lot,'Inventory item not found');lot.quantity=0;}
  else if(action==='avoidances'){
    check(Array.isArray(data.allergens)&&Array.isArray(data.ingredients),'Enter avoidance lists');
    state.avoidances={allergens:data.allergens.map(v=>text(v,40)),ingredients:data.ingredients.map(key)};
  }
  else if(action==='addPlan')addPlan(data);
  else if(action==='addChain'){
    const chain=pack(data.collectionId)?.mealChains.find(c=>c.id===data.chainId);check(chain,'Meal chain not found');
    const start=Date.parse(data.startAt);check(Number.isFinite(start),'Choose a start date');
    for(const step of chain.meals)addPlan({collectionId:data.collectionId,recipeId:step.recipeId,scheduledAt:new Date(start+step.day*24*hour).toISOString(),servings:step.servings,expectedLeftovers:step.expectedLeftovers});
  }
  else if(action==='removePlan'){const plan=findPlan(data.id);plan.status='cancelled';}
  else if(action==='addGroceries'){
    const suggestions=data.items||simulatePlans(state,lookup,{checkBasics:Boolean(data.checkBasics),now}).missing;
    check(Array.isArray(suggestions)&&suggestions.length<=500,'Invalid shopping list');
    for(const value of suggestions){const item=amount(value);const prior=state.groceries.find(g=>g.key===item.key&&g.unit===item.unit);if(prior)prior.quantity+=item.quantity;else state.groceries.push({...item,id:randomUUID()});}
  }
  else if(action==='removeGrocery')state.groceries=state.groceries.filter(g=>g.id!==data.id);
  else if(action==='purchase'){
    const item=state.groceries.find(g=>g.id===data.id);check(item&&data.confirmed===true,'Confirm the quantity actually purchased');
    const quantity=number(data.quantity);check(quantity<=item.quantity+epsilon,'Adjust the shopping quantity before recording a larger purchase');
    addLot({...item,quantity,location:data.location,storageSince:data.storageSince||stamp,requiresCold:data.requiresCold,shelfStable:data.shelfStable});
    item.quantity-=quantity;state.groceries=state.groceries.filter(g=>g.quantity>epsilon);
  }
  else if(action==='confirmCook'){
    check(data.confirmed===true,'Confirm the actual ingredients used');
    const plan=findPlan(data.planId),recipe=lookup(plan.collectionId,plan.recipeId);check(recipe,'Recipe not found');
    check(Array.isArray(data.uses)&&Array.isArray(data.leftovers),'Enter actual use and actual leftovers');
    const totals=new Map();
    for(const use of data.uses){const q=number(use.quantity);totals.set(use.lotId,(totals.get(use.lotId)||0)+q);}
    const used=[];
    for(const [id,q] of totals){const lot=state.inventory.find(l=>l.id===id);check(lot&&lot.quantity+epsilon>=q,'Actual use exceeds recorded stock');check(foodReview(lot,now).length===0,'Review the storage record before using this food');used.push({...lot,quantity:q});lot.quantity=Math.max(0,lot.quantity-q);}
    const cookedParents=used.filter(l=>l.cooked);
    const unknown=Boolean(data.untrackedCooked)||cookedParents.some(l=>l.requiresCold!==false&&!l.preparedAt)||recipe.ingredients.some(i=>i.cooked&&!used.some(l=>l.key===i.key))||(recipe.unmeasuredIngredients||[]).some(i=>/\bcooked\b|leftover/i.test(i));
    const dates=cookedParents.map(l=>l.preparedAt).filter(Boolean);
    const origin=unknown?null:dates.length?dates.sort()[0]:stamp;
    const oldHours=cookedParents.filter(l=>l.requiresCold!==false).reduce((n,l)=>Math.max(n,chilledHours(l,now)),0);
    const created=[];
    for(const leftover of data.leftovers){
      const output=recipe.produces.find(p=>p.key===leftover.key);check(output&&output.unit===leftover.unit,'Choose an output of this recipe');
      const lot=addLot({...leftover,cooked:true,requiresCold:output.requiresCold!==false,shelfStable:output.requiresCold===false,location:leftover.location||'Fridge',handlingConfirmed:Boolean(data.handlingConfirmed)},{preparedAt:origin,storageSince:stamp,chilledHoursBefore:oldHours,lastCookedAt:stamp,handlingConfirmed:!unknown&&Boolean(data.handlingConfirmed),lineage:[...new Set(used.flatMap(l=>[...(l.lineage||[]),l.id]))],sourceMeal:plan.id});created.push(lot.id);
    }
    plan.status='cooked';plan.cookedAt=stamp;
    state.cookedMeals.push({id:randomUUID(),planId:plan.id,recipeId:recipe.id,collectionId:plan.collectionId,at:stamp,uses:used,leftoverLotIds:created,originalPreparedAt:origin,untrackedIngredients:Boolean(data.untrackedIngredients)||unknown});
  }
  else throw Error('Unknown household action');
  state.revision++;state.updatedAt=stamp;state.audit.push({revision:state.revision,action,at:stamp});state.audit=state.audit.slice(-200);
  return state;
}
