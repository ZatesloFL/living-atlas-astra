export const ATLAS_INTENT_SCHEMA={name:'atlas-personal-intent-v1'};
export const ATLAS_AREAS=['lens','travel','discovery'];
export const ATLAS_SCOPES=['look','suggest','edit'];
export const AREA_LABELS={lens:'Lens',travel:'Travel',discovery:'Discovery'};
const clear=text=>({kind:'clarify',text});
const areasIn=text=>ATLAS_AREAS.filter(a=>new RegExp(a==='travel'?'\\b(travel|trips?|crossings?|visits?)\\b':a==='discovery'?'\\b(discovery|search)\\b':'\\blens\\b','i').test(text));
const clause=(text,start)=>text.match(new RegExp(start+'\\s+([^.;\\n]+)','i'))?.[1]?.trim()??'';

// Local interpretation, through ai.request. It cannot actuate anything.
export function atlasIntent(text,{limits={}}={}){
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
 const names=/\b(violence|sexual(?: content)?|language|disturbing(?: themes)?|viewpoint|sensory)\b/gi,matches=[...text.matchAll(names)],changes={};
 for(let i=0;i<matches.length;i++){
  const match=matches[i],key=match[1].toLowerCase().split(' ')[0],part=text.slice(match.index+match[0].length,matches[i+1]?.index??text.length),before=text.slice(0,match.index);
  if(changes[key])return clear('That dimension appears more than once. Give one amount and graphicness pair for each dimension you want to change.');
  const pair=part.match(/(?:to\s+)?(\d+)\s*[×x]\s*(\d+)/i),amount=part.match(/amount\s*(?:to|at|=|:)?\s*(\d+)/i),graphic=part.match(/graphicness\s*(?:to|at|=|:)?\s*(\d+)/i);
  if(pair)changes[key]={amount:Number(pair[1]),graphicness:Number(pair[2])};
  else if(amount&&graphic)changes[key]={amount:Number(amount[1]),graphicness:Number(graphic[1])};
  else if(amount||graphic)return clear(`For ${DIMENSIONS.find(([k])=>k===key)[1]}, name both amount and graphicness. Neither dial has changed.`);
  else {
   const adjective=before.match(/\b(no|less|more|mild|low|high)\s*$/i)?.[1]?.toLowerCase()??part.match(/\b(none|less|more|mild|low|high)\b/i)?.[1]?.toLowerCase();
   if(['no','none','mild','low','high'].includes(adjective)){const n={no:0,none:0,mild:1,low:1,high:3}[adjective];changes[key]={amount:n,graphicness:n};}
   else if(['less','more'].includes(adjective)&&validPair(limits[key])){const delta=adjective==='less'?-1:1;changes[key]={amount:Math.max(0,Math.min(3,limits[key].amount+delta)),graphicness:Math.max(0,Math.min(3,limits[key].graphicness+delta))};}
   else return clear(`What amount and graphicness do you want for ${DIMENSIONS.find(([k])=>k===key)[1]}? Each dial runs from 0 to 3.`);
  }
 }
 if(Object.keys(changes).length)return {kind:'lens',changes};
 return clear('You can ask Atlas to set Lens dials, or ask for a scoped grant or initiative setting. Name a dimension and both dials, or describe less, mild or no content in that dimension.');
}

export function validateAtlasIntent(value){
 const fields={clarify:['text'],grant:['areas','scope','durationMs'],envelope:['areas','posture','specification','unasked','alwaysAsk','watch'],revoke:['areas'],lens:['changes'],trip:['target','choice','description']};
 if(!value||!fields[value.kind]||Object.keys(value).some(k=>!['kind',...fields[value.kind]].includes(k)))throw new Error('Invalid Atlas intent.');
 if(value.kind==='clarify'){if(typeof value.text!=='string'||!value.text||value.text.length>2000)throw new Error('Invalid clarification.');return value;}
 if(value.kind==='lens'){if(!value.changes||Array.isArray(value.changes)||!Object.keys(value.changes).length||Object.entries(value.changes).some(([k,p])=>!DIMENSIONS.some(([id])=>id===k)||!validPair(p)))throw new Error('Each dimension needs both dials from 0 to 3.');return value;}
 if(value.kind==='trip'){if(typeof value.target!=='string'||value.target.length>200||!['inside','door','outside'].includes(value.choice)||typeof value.description!=='string'||value.description.length>12000)throw new Error('Invalid trip proposal.');return value;}
 if(!Array.isArray(value.areas)||new Set(value.areas).size!==value.areas.length||value.areas.some(a=>!ATLAS_AREAS.includes(a))||!value.areas.length&&value.kind!=='revoke')throw new Error('Choose supported areas.');
 if(value.kind==='grant'&&(!ATLAS_SCOPES.includes(value.scope)||value.durationMs!==null&&(!Number.isInteger(value.durationMs)||value.durationMs<=0||value.durationMs>365*86400000)))throw new Error('Choose a valid scope and a lease of up to one year, or standing.');
 if(value.kind==='envelope'){
  if(!['Quiet','Conversational','Proactive'].includes(value.posture)||['specification','unasked','alwaysAsk'].some(k=>typeof value[k]!=='string'||value[k].length>1600)||!Array.isArray(value.watch)||value.watch.some(s=>typeof s!=='string'||!s.trim()||s.length>1600))throw new Error('Invalid initiative specification.');
  if(value.posture==='Proactive'&&(!value.unasked||!value.alwaysAsk||!value.watch.length))throw new Error('Proactive requires your full specification.');
 }
 return value;
}
import {DIMENSIONS,validPair} from './scores.js';
