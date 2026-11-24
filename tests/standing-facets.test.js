import test from 'node:test';
import assert from 'node:assert/strict';
import {ROOMS} from '../src/data.js';
import {scores,pair} from '../src/scores.js';
import {AccessStore} from '../src/access-store.js';
import {seedProfiles} from '../src/profiles.js';
import {targetRef,events} from '../src/standing-records.js';
import {deriveStanding,readFacet,readingSummary} from '../src/standing-facets.js';
import {PROXY_VALIDATION_RECEIPTS} from '../src/standing-proxy-data.js';
import {verifyChain} from '../src/ledger.js';
import {TRAILS} from '../src/community-data.js';
const person=id=>({...seedProfiles()[0],profileId:id,profileName:id});
function fixture(){const key='facet-'+crypto.randomUUID();ROOMS[key]={...structuredClone(ROOMS.canopy),id:key,ownerId:'creator',content:scores(),measured:scores()};const memory=new Map(),store=new AccessStore(()=>({getItem:k=>memory.get(k),setItem:(k,v)=>memory.set(k,v)}));return {key,ref:targetRef(ROOMS[key]),store,cleanup:()=>delete ROOMS[key]};}
test('a creator and Place have separate declaration records; a contest repairs conclusions while retaining evidence',async()=>{
 const f=fixture();try{
  await f.store.standing.declare(f.ref,scores(),person('creator'));const first=await f.store.standing.measure(f.ref,scores({sensory:pair(2,1)}),person('checker'),{method:'Synthetic inspection'});
  assert.equal(deriveStanding(f.store.standing.data,{actor:'creator'}).facets.declaration.reading,'gap');assert.equal(deriveStanding(f.store.standing.data,{target:f.ref}).facets.declaration.reading,'gap');
  assert.equal(deriveStanding(f.store.standing.data,{actor:'checker'}).facets.measurement.reading,'unmeasured');
  const contest=await f.store.standing.contest(first.hash,'Synthetic challenge',person('creator'));assert.equal(deriveStanding(f.store.standing.data,{actor:'creator'}).facets.declaration.reading,'contested');
  await f.store.standing.measure(f.ref,scores(),person('second'),{method:'Synthetic re-measurement',queueId:contest.hash});
  assert.equal(deriveStanding(f.store.standing.data,{actor:'creator'}).facets.declaration.reading,'held');assert.equal(deriveStanding(f.store.standing.data,{actor:'checker'}).facets.measurement.reading,'gap');assert(events(f.store.standing.data).some(e=>e.id===first.hash));assert((await verifyChain(f.store.standing.data.receipts)).valid);
 }finally{f.cleanup();}
});
test('recent history shapes each reading without an overall number; no evidence is unmeasured',()=>{
 const now=Date.parse('2026-11-24T12:00:00Z'),old={receipt:'old',outcome:'gap',time:'2025-11-24T12:00:00Z'},recent={receipt:'new',outcome:'held',time:'2026-11-24T12:00:00Z'};
 assert.equal(readFacet([old,recent],now).reading,'held');assert.equal(readFacet([],now).reading,'unmeasured');assert.equal(readFacet([{...recent,outcome:'unmeasured'}],now).reading,'unmeasured');
 const r=deriveStanding({receipts:[]},{actor:'newcomer'});assert.deepEqual(Object.values(readingSummary(r)),['unmeasured','unmeasured','unmeasured','unmeasured']);assert(!('score' in r));
});
test('helper facet consumes all real validation receipts including incomplete and unclassified failures, once each',()=>{
 assert.equal(PROXY_VALIDATION_RECEIPTS.length,28);const r=deriveStanding({receipts:[]},{actor:'docent-silver'}),h=r.facets.helper.history;
 assert.equal(h.length,28);assert.equal(h.filter(e=>e.outcome==='gap').length,4);assert(h.some(e=>e.failureClass==='provider_output_incomplete'));assert.equal(h.filter(e=>e.outcome==='gap'&&e.failureClass===null).length,2);assert.equal(r.facets.declaration.reading,'unmeasured');
});
test('private acts do not accrue standing and browsing choice does not change the reading',async()=>{
 const f=fixture();try{
  await f.store.policy(f.key,'hidden',person('creator'));await f.store.standing.declare(f.ref,scores(),person('creator'));await f.store.standing.measure(f.ref,scores({sensory:pair(2,1)}),person('creator'),{method:'Private inspection'});
  assert.equal(deriveStanding(f.store.standing.data,{actor:'creator'}).facets.declaration.reading,'unmeasured');await f.store.policy(f.key,'public',person('creator'));await f.store.standing.declare(f.ref,scores(),person('creator'));await f.store.standing.measure(f.ref,scores({sensory:pair(1,0)}),person('checker'),{method:'Public inspection'});
  const before=readingSummary(deriveStanding(f.store.standing.data,{actor:'creator'}));const hidden=f.store.standing.actorRecord('creator',person('other'));assert.equal(hidden.facets.declaration.reading,null);assert.deepEqual(hidden.facets.declaration.history,[]);
  await f.store.standing.browsing(true,person('creator'));assert.equal(f.store.standing.actorRecord('creator',person('other')).facets.declaration.reading,'gap');assert.deepEqual(readingSummary(deriveStanding(f.store.standing.data,{actor:'creator'})),before);
 }finally{f.cleanup();}
});
test('observed fulfillment uses actual successful crossings without publishing visitor identity or Lens',async()=>{
 const f=fixture();try{
  await f.store.standing.declare(f.ref,scores(),person('creator'));await f.store.admission(f.key,{mode:'threshold',minimum:scores()},person('creator'));await f.store.use(f.key,'enter',person('PRIVATE_VISITOR_CANARY'));
  await f.store.commitTravel([{key:f.key,scope:'enter'}],person('PRIVATE_VISITOR_CANARY'),{arrival:{choice:'inside',room:f.key}});const r=deriveStanding(f.store.standing.data,{actor:'creator'});assert.equal(r.facets.commitment.reading,'held');assert.equal(r.facets.commitment.history.length,2);assert(!JSON.stringify(f.store.standing.data).includes('PRIVATE_VISITOR_CANARY'));assert(!JSON.stringify(f.store.standing.data).includes('crossingReceipt'));assert(f.store.data.ledgers[f.key].some(e=>e.action==='commitment_proved'));
 }finally{f.cleanup();}
});
test('an accepted tour is not a completion; every authored stop and a matching private offer are required',async()=>{
 const f=fixture(),trail=TRAILS[0],helper={id:'synthetic-guide',operator:{backing:'verified'},places:[f.key]};try{
  f.store.data.staffState.helpers.push(helper);f.store.data.staffState.proposals.push({id:'offer',agentId:helper.id,proposal:{kind:'tour',trail:trail.id,room:f.key}});
  await f.store.transaction(()=>f.store.record(f.key,person('VISITOR_PRIVATE'),'helper_offer_accepted',{proposal:'offer',agent:helper.id}));
  assert.equal(deriveStanding(f.store.standing.data,{actor:helper.id}).facets.helper.reading,'unmeasured');
  const l={...person('VISITOR_PRIVATE'),discovery:{trail:{id:trail.id,active:false,done:[trail.stops[0].room]}}};await f.store.standing.completeTour(trail,l);assert.equal(deriveStanding(f.store.standing.data,{actor:helper.id}).facets.helper.reading,'unmeasured');
  l.discovery.trail.done=trail.stops.map(s=>s.room);await f.store.standing.completeTour(trail,l);await f.store.standing.completeTour(trail,l);const facet=deriveStanding(f.store.standing.data,{actor:helper.id}).facets.helper;assert.equal(facet.reading,'held');assert.equal(facet.history.length,1);assert(!JSON.stringify(f.store.standing.data).includes('VISITOR_PRIVATE'));
 }finally{f.cleanup();}
});
