import {DIMENSIONS,AXES,scores,validPair} from './scores.js';

// Receipts are the source of truth. These selectors never edit a stored record.
export const emptyStanding=()=>({receipts:[]});
export const standingState=lens=>lens?.access?.standingState??empty;
export const identityTier=actor=>actor?.identity?.backing==='verified'?(actor.identity.display==='real'?'verified-named':'verified-unnamed'):'anonymous';
export const targetRef=(room,block=null)=>({placeId:room.id,audienceVersion:block?(room.version?.id??null):null,thingId:block?.id??null});
export const targetId=ref=>JSON.stringify([ref.placeId,ref.audienceVersion??null,ref.thingId??null]);
const caches=new WeakMap(),empty=emptyStanding();
function index(state=empty){
 const receipts=state.receipts??[],saved=caches.get(state);
 if(saved?.length===receipts.length&&saved.hash===receipts.at(-1)?.hash)return saved;
 const all=receipts.map(e=>({...e.diff,id:e.hash,kind:e.action,time:e.time,actor:e.actor})),targets=new Map();
 for(const e of all)if(e.target){const key=targetId(e.target);if(!targets.has(key))targets.set(key,[]);targets.get(key).push(e);}
 const next={length:receipts.length,hash:receipts.at(-1)?.hash,events:all,targets,readings:new Map()};caches.set(state,next);return next;
}
export const events=state=>index(state).events;
export const targetEvents=(state,ref)=>index(state).targets.get(targetId(ref))??[];
export const latestDeclaration=(state,ref,{publishedOnly=true}={})=>targetEvents(state,ref).findLast(e=>e.kind==='declared'&&(!publishedOnly||e.published));
export function validateScores(value){
 if(!value||Object.keys(value).length!==DIMENSIONS.length||DIMENSIONS.some(([key])=>!validPair(value[key])))throw new Error('Declare both dials, from 0 to 3, for all six dimensions.');
 return structuredClone(value);
}
export function gapBetween(measured,declared){return Object.fromEntries(DIMENSIONS.map(([key])=>[key,Object.fromEntries(AXES.map(axis=>[axis,measured[key][axis]-declared[key][axis]]))]));}
export const hasGap=gap=>DIMENSIONS.some(([key])=>AXES.some(axis=>gap?.[key]?.[axis]!==0));
export const underDeclared=gap=>DIMENSIONS.some(([key])=>AXES.some(axis=>gap?.[key]?.[axis]>0));
export function currentMeasurements(state,ref,{publishedOnly=true}={}){
 const history=targetEvents(state,ref).filter(e=>e.kind==='measured'&&(!publishedOnly||e.published)),superseded=new Set(history.flatMap(e=>e.supersedes??[]));
 return history.filter(e=>!superseded.has(e.id));
}
export function readingsFor(state,ref,{publishedOnly=true}={}){
 const cache=index(state).readings,key=targetId(ref)+':'+publishedOnly;if(cache.has(key))return cache.get(key);
 const current=currentMeasurements(state,ref,{publishedOnly}),stewards=current.filter(e=>e.measurer.class==='steward'),audience=current.filter(e=>e.measurer.class==='audience');
 const combine=(records,reduce)=>records.length?Object.fromEntries(DIMENSIONS.map(([key])=>[key,Object.fromEntries(AXES.map(axis=>[axis,reduce(records.map(e=>e.scores[key][axis]).sort((a,b)=>a-b))]))])):null;
 const result={stewards,audience,steward:combine(stewards,a=>a.at(-1)),audienceReading:combine(audience,a=>a[Math.floor(a.length/2)])};cache.set(key,result);return result;
}
export function pendingMeasurements(state,ref,{publishedOnly=true}={}){
 const history=targetEvents(state,ref).filter(e=>!publishedOnly||e.published),resolved=new Set(history.filter(e=>e.kind==='measured').map(e=>e.resolves).filter(Boolean));
 return history.filter(e=>e.kind==='remeasurement_requested'&&!resolved.has(e.id));
}
export function declarationSnapshot(state,ref,node,room,{publishedOnly=true}={}){
 const current=latestDeclaration(state,ref,{publishedOnly});
 return current?{id:current.id,versionId:current.versionId,scores:current.scores,owner:current.owner,creator:current.creator,source:'receipt'}:
  {id:null,versionId:node.recordVersionId??null,scores:scores(node.content??room.content),owner:room.ownerId??null,creator:node.creatorId??room.creatorId??room.ownerId??null,source:'authored catalog · no declaration receipt'};
}
