import {events,standingState,targetRef,targetId} from './standing-records.js';
import {FACETS,deriveStanding,readingSummary} from './standing-facets.js';

export const standingPreferences=value=>({declaration:['warn','filter'].includes(value?.declaration)?value.declaration:'ignore',audienceWhenUnmeasured:value?.audienceWhenUnmeasured===true});
export const declaredStandingRules=(room,lens)=>lens.access?.policies?.[room.id]?.standingRules??room.admission?.standingRules??room.standingRules??[];
export function validateStandingRules(rules){
 if(!Array.isArray(rules)||rules.length>4)throw new Error('Use at most four standing rules.');
 return rules.map(rule=>{
  if(!Object.hasOwn(FACETS,rule.facet)||!['held','no-gap'].includes(rule.requires)||!['everyone','agents','helpers'].includes(rule.appliesTo)||!['allow','knock'].includes(rule.unmeasured)||!['require','admit'].includes(rule.effect))throw new Error('Choose a facet, reading, audience and declared door effect.');
  return {facet:rule.facet,requires:rule.requires,appliesTo:rule.appliesTo,unmeasured:rule.unmeasured,effect:rule.effect};
 });
}
export function standingDoorPolicy(room,lens){
 if(lens.standingInvalid)return {rules:[],blocked:true,autoAdmit:false,reasons:['Standing receipts failed verification. Entry is unavailable.'],readings:null};
 const rules=declaredStandingRules(room,lens);
 if(!rules.length)return {rules:[],blocked:false,autoAdmit:false,reasons:[],readings:null};
 let checked;try{checked=validateStandingRules(rules);}catch{return {rules,blocked:true,autoAdmit:false,reasons:['Standing rule is invalid. Ask the owner.'],readings:null};}
 const actor=lens.profileId??lens.id??'visitor',state=standingState(lens),readings=lens.identity?.display==='anonymous'?Object.fromEntries(Object.keys(FACETS).map(k=>[k,'unmeasured'])):readingSummary(deriveStanding(state,{actor}));
 const helper=(lens.access?.staffState?.helpers??[]).some(a=>a.id===actor&&!a.revokedAt)||stewardGrants(state,room.id).some(g=>g.active&&g.designate.id===actor);
 const results=checked.map(rule=>{
  const applies=rule.appliesTo==='everyone'||rule.appliesTo==='agents'&&lens.isAgent||rule.appliesTo==='helpers'&&helper,reading=readings[rule.facet];
  const passes=reading==='unmeasured'?rule.unmeasured==='allow':rule.requires==='held'?reading==='held':reading!=='gap'&&reading!=='contested';
  return {...rule,reading,applies,passes};
 });
 return {rules:results,readings,blocked:results.some(r=>r.applies&&r.effect==='require'&&!r.passes),autoAdmit:results.some(r=>r.applies&&r.effect==='admit'&&r.passes),reasons:results.filter(r=>r.applies).map(r=>`Standing rule · ${FACETS[r.facet]}: ${r.reading}; ${r.effect==='admit'?'admit when':'requires'} ${r.requires==='held'?'held':'no gap or contest'}; unmeasured ${r.unmeasured==='allow'?'allowed':'may knock'}.`)};
}
export function standingLensPolicy(room,lens){
 const pref=standingPreferences(lens.standingPreferences);if(pref.declaration==='ignore')return {filter:false,warning:null};
 const reading=deriveStanding(standingState(lens),{target:targetRef(room)}).facets.declaration.reading,affected=['gap','contested'].includes(reading);
 return {filter:affected&&pref.declaration==='filter',warning:affected?`Your Lens · Declaration record: ${reading}.`:null};
}
export function stewardGrants(state,placeId,now=Date.now()){
 const all=events(state),revoked=new Set(all.filter(e=>e.kind==='steward_revoked').map(e=>e.grant));
 return all.filter(e=>e.kind==='steward_granted'&&(!placeId||e.target.placeId===placeId)).map(e=>({...e,revoked:revoked.has(e.id),expired:!!e.expires&&Date.parse(e.expires)<=now,active:!revoked.has(e.id)&&(!e.expires||Date.parse(e.expires)>now)}));
}
export function displayDecision(state,ref){return events(state).findLast(e=>e.kind==='steward_display_changed'&&targetId(e.target)===targetId(ref))??null;}
