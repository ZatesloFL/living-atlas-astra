import {DIMENSIONS,AXES} from './scores.js';
import {events,targetId,currentMeasurements,pendingMeasurements,hasGap} from './standing-records.js';
import {PROXY_VALIDATION_RECEIPTS} from './standing-proxy-data.js';

export const FACETS={declaration:'Declaration record',measurement:'Measurement record',helper:'Helper record',commitment:'Commitment record'};
const same=(a,b)=>DIMENSIONS.every(([key])=>AXES.every(axis=>a[key][axis]===b[key][axis]));
const publicEvents=state=>events(state).filter(e=>e.published);
const fact=(receipt,outcome,title,extra={})=>({receipt:receipt.id,time:receipt.time,outcome,title,...extra});
// File 27: each facet has a reading, never an overall number or points balance.
export function readFacet(history,now=Date.now()){
 const weights={held:0,gap:0,contested:0};
 for(const entry of history)if(Object.hasOwn(weights,entry.outcome))weights[entry.outcome]+=2**(-Math.max(0,now-Date.parse(entry.time))/(30*86400000));
 const reading=['contested','gap','held'].sort((a,b)=>weights[b]-weights[a])[0];
 return {reading:weights[reading]>0?reading:'unmeasured',history:[...history].sort((a,b)=>b.time.localeCompare(a.time)||a.receipt.localeCompare(b.receipt))};
}
export function deriveStanding(state,subject,{now=Date.now(),proxyReceipts=PROXY_VALIDATION_RECEIPTS}={}){
 const all=publicEvents(state),history=Object.fromEntries(Object.keys(FACETS).map(key=>[key,[]])),actor=subject.actor,target=subject.target;
 const measurements=all.filter(e=>e.kind==='measured'&&e.measurer.class==='steward');
 const declarations=new Map();
 for(const entry of measurements){const d=entry.declaration;if(target?targetId(target)!==targetId(entry.target):![d.owner,d.creator].includes(actor))continue;const id=d.id??'catalog:'+targetId(entry.target);if(!declarations.has(id))declarations.set(id,{entry,decl:d});}
 for(const {entry,decl} of declarations.values()){
  const active=currentMeasurements(state,entry.target).filter(e=>e.measurer.class==='steward'&&e.declaration.id===decl.id),queues=pendingMeasurements(state,entry.target),contested=active.some(e=>queues.some(q=>q.measurement===e.id));
  if(!active.length)continue;
  const latest=active.reduce((a,b)=>a.time>b.time?a:b),outcome=contested?'contested':active.some(e=>hasGap(e.gap))?'gap':'held';
  history.declaration.push(fact(latest,outcome,'Declared against Steward readings',{declaration:decl.id,versionId:decl.versionId,target:entry.target,receipts:active.map(e=>e.id),gaps:active.map(e=>({measurer:e.measurer.id,gap:e.gap}))}));
 }
 if(actor){
  for(const entry of measurements.filter(e=>e.measurer.id===actor)){
   const review=measurements.findLast(e=>e.reviewOf===entry.id&&e.measurer.id!==actor),contested=pendingMeasurements(state,entry.target).some(q=>q.measurement===entry.id);
   history.measurement.push(fact(review??entry,review?(same(entry.scores,review.scores)?'held':'gap'):contested?'contested':'unmeasured',review?'Re-measurement outcome':contested?'Contested reading':'Awaiting re-measurement',{measurement:entry.id,target:entry.target,review:review?.id??null}));
  }
  const helper=new Map();
  for(const row of proxyReceipts.filter(r=>r.agent===actor))helper.set(row.id,{receipt:'proxy:'+row.id,time:new Date(row.time.replace(' ','T').replace(/\+00$/,'Z')).toISOString(),outcome:row.validation_passed?'held':'gap',title:'AI proxy validation',source:'real proxy receipt',failureClass:row.failure_class??null});
  for(const entry of all.filter(e=>e.kind==='helper_result'&&e.helper===actor))helper.set(entry.proxyReceipt??entry.id,fact(entry,entry.outcome,entry.detail,{source:entry.source,proxyReceipt:entry.proxyReceipt??null}));
  history.helper=[...helper.values()];
  history.commitment=all.filter(e=>e.kind==='commitment_observed'&&e.holder===actor).map(e=>fact(e,e.outcome,e.detail,{target:e.target,grant:e.grant??null}));
 }
 return {subject,facets:Object.fromEntries(Object.entries(history).map(([key,entries])=>[key,{label:FACETS[key],...readFacet(entries,now)}]))};
}
export function recordBrowsing(state,actor){return events(state).findLast(e=>e.kind==='record_browsing_changed'&&e.actor===actor)?.browsable===true;}
export const readingSummary=record=>Object.fromEntries(Object.entries(record.facets).map(([key,value])=>[key,value.reading]));
