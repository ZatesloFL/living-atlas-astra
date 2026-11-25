export const ATLAS_INTENT_SCHEMA={name:'atlas-personal-intent-v1'};
export const ATLAS_AREAS=['lens','travel','discovery'];
export const ATLAS_SCOPES=['look','suggest','edit'];
export const AREA_LABELS={lens:'Lens',travel:'Travel',discovery:'Discovery'};
const clear=text=>({kind:'clarify',text});
const areasIn=text=>ATLAS_AREAS.filter(a=>new RegExp(a==='travel'?'\\b(travel|trips?|crossings?|visits?)\\b':a==='discovery'?'\\b(discovery|search)\\b':'\\blens\\b','i').test(text));
const clause=(text,start)=>text.match(new RegExp(start+'\\s+([^.;\\n]+)','i'))?.[1]?.trim()??'';

// Local interpretation, through ai.request. It cannot actuate anything.
export function atlasIntent(text){
 if(typeof text!=='string'||!text.trim()||text.length>1600)throw new Error('Use one request of up to 1,600 characters.');
 const areas=areasIn(text);
 if(/\b(revoke|remove|end)\b.*\bgrant\b/i.test(text))return {kind:'revoke',areas};
 const posture=['Quiet','Conversational','Proactive'].find(p=>new RegExp('\\b'+p+'\\b','i').test(text));
 if(posture){
  areas.splice(0,areas.length,...areasIn(text.split(/[.;\n]/)[0]));
  if(!areas.length)return clear('Which area should use that initiative setting: Lens, Travel or Discovery?');
  const unasked=clause(text,'(?:you may|may act unasked:|unasked:)'),alwaysAsk=clause(text,'(?:always ask(?: me)?(?: before)?|must ask:)'),watch=clause(text,'(?:watch for|watch:)');
  if(posture==='Proactive'&&(!unasked||!alwaysAsk||!watch))return clear('For Proactive, tell Atlas what it may do unasked, what it must always ask about, and what to watch for. Nothing has changed.');
  return {kind:'envelope',areas,posture,specification:text,unasked,alwaysAsk,watch:watch?[watch]:[]};
 }
 if(/\b(grant|allow|let|permission|access)\b/i.test(text)){
  if(!areas.length)return clear('Which areas may Atlas help with: Lens, Travel or Discovery? Name the areas and choose a standing grant or a lease duration.');
  const duration=text.match(/\b(?:for|lease(?:d)?(?: for)?)\s+(\d+)\s*(minutes?|hours?|days?)\b/i),standing=/\bstanding\b/i.test(text);
  if(standing&&duration)return clear('Choose a standing grant or one lease duration, so the grant has one clear end condition.');
  if(!standing&&!duration)return clear('Should this grant be standing, or leased for a number of minutes, hours or days?');
  const scope=/\b(?:read|look)(?:-only)?\b/i.test(text)?'look':/\bsuggest(?:ions)?(?:-only)?\b/i.test(text)?'suggest':/\b(edit|apply|change|set|take|act|help)\b/i.test(text)?'edit':null;
  if(!scope)return clear('What may Atlas do: look at those areas, suggest changes, or apply changes after your confirmation?');
  return {kind:'grant',areas,scope,durationMs:standing?null:Number(duration[1])*({minute:60000,hour:3600000,day:86400000}[duration[2].toLowerCase().replace(/s$/,'')])};
 }
 return clear('You can ask Atlas for a scoped grant or an initiative setting for Lens, Travel or Discovery. Say what it may do and whether the grant is standing or leased.');
}

export function validateAtlasIntent(value){
 const fields={clarify:['text'],grant:['areas','scope','durationMs'],envelope:['areas','posture','specification','unasked','alwaysAsk','watch'],revoke:['areas']};
 if(!value||!fields[value.kind]||Object.keys(value).some(k=>!['kind',...fields[value.kind]].includes(k)))throw new Error('Invalid Atlas intent.');
 if(value.kind==='clarify'){if(typeof value.text!=='string'||!value.text||value.text.length>2000)throw new Error('Invalid clarification.');return value;}
 if(!Array.isArray(value.areas)||new Set(value.areas).size!==value.areas.length||value.areas.some(a=>!ATLAS_AREAS.includes(a))||!value.areas.length&&value.kind!=='revoke')throw new Error('Choose supported areas.');
 if(value.kind==='grant'&&(!ATLAS_SCOPES.includes(value.scope)||value.durationMs!==null&&(!Number.isInteger(value.durationMs)||value.durationMs<=0||value.durationMs>365*86400000)))throw new Error('Choose a valid scope and a lease of up to one year, or standing.');
 if(value.kind==='envelope'){
  if(!['Quiet','Conversational','Proactive'].includes(value.posture)||['specification','unasked','alwaysAsk'].some(k=>typeof value[k]!=='string'||value[k].length>1600)||!Array.isArray(value.watch)||value.watch.some(s=>typeof s!=='string'||!s.trim()||s.length>1600))throw new Error('Invalid initiative specification.');
  if(value.posture==='Proactive'&&(!value.unasked||!value.alwaysAsk||!value.watch.length))throw new Error('Proactive requires your full specification.');
 }
 return value;
}
