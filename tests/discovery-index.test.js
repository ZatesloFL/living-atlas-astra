import test from 'node:test';
import assert from 'node:assert/strict';
import {ROOMS,EDGES} from '../src/data.js';
import {scores,pair} from '../src/scores.js';
import {seedProfiles} from '../src/profiles.js';
import {AccessStore} from '../src/access-store.js';
import {catalogIndex,queryIndex} from '../src/discovery-index.js';
import {crossing} from '../src/rules.js';
import {selectContent} from '../src/content.js';
import {targetRef} from '../src/standing-records.js';
import {ageDoorPolicy} from '../src/age-policy.js';
const reader=(extra={})=>({...structuredClone(seedProfiles()[0]),profileId:'reader',playAs:'visitor',identity:{display:'pseudonym',backing:'verified'},age:25,...extra});
function fixture(){
 const key='discovery-'+crypto.randomUUID(),memory=new Map(),store=new AccessStore(()=>({getItem:k=>memory.get(k),setItem:(k,v)=>memory.set(k,v)}));
 ROOMS[key]={...structuredClone(ROOMS.canopy),id:key,title:'Synthetic botanical observatory',ownerId:'owner',creatorId:'owner',visibility:'public',versions:undefined,content:scores(),measured:scores(),parentPlaceId:null,blocks:[{id:'leaf',title:'Leaf specimens',type:'text',body:'Synthetic botanical notes',importance:'core',content:scores()}]};
 EDGES.push({id:key,from:'square',to:key,type:'door',scene:'square'});
 return {key,room:ROOMS[key],store,lens:extra=>store.lens(reader(extra)),cleanup:()=>{delete ROOMS[key];EDGES.splice(EDGES.findIndex(e=>e.id===key),1);}};
}
test('queries read current catalog metadata, named ordering and paired ranges without writing a second record',async()=>{
 const f=fixture();try{await f.store.ready;const before=JSON.stringify(f.store.data),lens=f.lens();
  let result=queryIndex(lens,{words:'botanical',ranges:{violence:{amount:{max:1}}},facets:{declaration:'unmeasured'},sort:'newest'},{standing:f.store.standing});
  assert(result.results.some(e=>e.room===f.key));const card=result.results.find(e=>e.type==='room'&&e.room===f.key);
  assert.equal(card.publishedAt,null);assert.equal(card.vouches,null);assert.equal(card.readings.steward,null);assert.equal(card.facets.declaration,'unmeasured');
  assert.match(card.why,/“botanical” matches title/);assert.match(card.why,/Declared violence amount 0 matches 0–1/);assert.match(card.why,/Declaration record: unmeasured/);assert.match(card.why,/Order: Newest/);
  assert.equal(card.references.measurementRecordsRef.subject.placeId,f.key);
  f.room.title='Renamed orchid observatory';assert(!queryIndex(lens,{words:'botanical'}).results.some(e=>e.type==='room'&&e.room===f.key));assert(queryIndex(lens,{words:'orchid'}).results.some(e=>e.room===f.key));
  assert.equal(JSON.stringify(f.store.data),before);
 }finally{f.cleanup();}
});
test('minor and unknown age are excluded by the same owner predicate in discovery, crossings and Things',async()=>{
 const f=fixture();try{await f.store.ready;f.room.admission={mode:'filtered',ageRule:{band:{lower:{op:'gte',years:18}}}};
  const minor=f.lens({age:16});assert(crossing({to:f.key,type:'door'},minor).admission.blocked);assert(!catalogIndex(minor).some(e=>e.room===f.key));
  assert(catalogIndex(f.lens()).some(e=>e.room===f.key));
  await f.store.admission(f.key,{mode:'threshold',minimum:scores()},reader({profileId:'owner'}));assert(!catalogIndex(f.lens({age:16})).some(e=>e.room===f.key));delete f.store.data.policies[f.key];
  const unknown=f.lens({age:25,identity:{display:'pseudonym',backing:'none'}});f.room.admission.ageRule.band={upper:{op:'lte',years:70}};assert(!catalogIndex(unknown).some(e=>e.room===f.key));
  f.room.admission={mode:'threshold',price:{reserved:'synthetic'}};assert(crossing({to:f.key,type:'door'},f.lens()).admission.priceUnresolved);assert(!catalogIndex(f.lens()).some(e=>e.room===f.key));
  delete f.room.admission;f.room.blocks[0].admission={mode:'threshold',ageRule:{band:{lower:{op:'gt',years:65}}}};
  assert.equal(selectContent(f.room,f.lens()).blocks.length,0);assert(!catalogIndex(f.lens()).some(e=>e.type==='thing'&&e.room===f.key));
  assert.equal(ageDoorPolicy(f.room.blocks[0].admission.ageRule,reader({age:65})).blocked,true);assert.equal(ageDoorPolicy(f.room.blocks[0].admission.ageRule,reader({age:66})).blocked,false);
  assert(ageDoorPolicy({band:{lower:{op:'gte',years:18}},guardianExceptionBand:{lower:{op:'gte',years:13}}},reader({age:16})).blocked);
 }finally{f.cleanup();}
});
test('soft gaps appear before crossing; hard limits, owner thresholds and blocked containing doors exclude',async()=>{
 const f=fixture();try{await f.store.ready;f.room.content=scores({sensory:pair(2,1)});const lens=f.lens();lens.limits.sensory=pair(1,1);lens.hard.sensory=pair(3,3);
  const card=catalogIndex(lens).find(e=>e.type==='room'&&e.room===f.key);assert(card);assert(card.softGaps.includes('Sensory amount: 2, your limit 1'));assert.equal(card.gate.type,'door');
  lens.hard.sensory=pair(1,1);assert(!catalogIndex(lens).some(e=>e.room===f.key));lens.hard.sensory=pair(3,3);
  f.room.admission={mode:'threshold',minimum:scores({sensory:pair(2,0)})};assert(!catalogIndex(lens).some(e=>e.room===f.key));
  f.room.admission={mode:'filtered'};assert(catalogIndex(lens).some(e=>e.type==='room'&&e.room===f.key));
  f.room.parentPlaceId='missing-parent';assert(!catalogIndex(lens).some(e=>e.room===f.key));
 }finally{f.cleanup();}
});
test('standing Lens preferences alter result sets and named facet conditions cite actual receipts',async()=>{
 const f=fixture();try{await f.store.ready;const owner=reader({profileId:'owner'}),ref=targetRef(f.room);
  await f.store.standing.declare(ref,scores(),owner);await f.store.standing.measure(ref,scores({sensory:pair(1,0)}),reader({profileId:'checker'}),{method:'Synthetic inspection'});
  const warn=f.lens({standingPreferences:{declaration:'warn'}}),card=queryIndex(warn,{facets:{declaration:'gap'}},{standing:f.store.standing}).results.find(e=>e.room===f.key);
  assert(card);assert.equal(card.readings.steward.sensory.amount,1);assert.equal(card.readings.declared.sensory.amount,0);assert(card.softGaps.some(g=>/Declaration record: gap/.test(g)));assert.match(card.why,/Declaration record: gap/);
  assert(!catalogIndex(f.lens({standingPreferences:{declaration:'filter'}})).some(e=>e.room===f.key));
 }finally{f.cleanup();}
});
test('trails and events share the index, declarations and all venue gates',()=>{
 const lens=reader(),results=queryIndex(lens).results;
 assert(results.some(e=>e.type==='trail'&&e.target==='civil-rights'&&Object.keys(e.declaration).length===6));
 assert(results.some(e=>e.type==='event'&&e.target==='sample-tour'&&e.facets.declaration==='unmeasured'));
 const original=ROOMS.capitol.admission;try{ROOMS.capitol.admission={mode:'threshold',ageRule:{band:{lower:{op:'gte',years:80}}}};assert(!queryIndex(lens).results.some(e=>e.type==='trail'&&e.target==='civil-rights'));}finally{ROOMS.capitol.admission=original;}
});
