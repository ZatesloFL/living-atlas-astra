import test from 'node:test';
import assert from 'node:assert/strict';
import {ROOMS} from '../src/data.js';
import {scores,pair} from '../src/scores.js';
import {AccessStore,ACCESS_KEY} from '../src/access-store.js';
import {seedProfiles} from '../src/profiles.js';
import {verifyChain} from '../src/ledger.js';
import {crossing} from '../src/rules.js';
import {events,targetRef,currentMeasurements,readingsFor,pendingMeasurements,identityTier} from '../src/standing-records.js';
const person=(id='owner',extra={})=>({...seedProfiles()[0],profileId:id,profileName:id,identity:{display:'pseudonym',backing:'verified'},...extra});
function fixture(){const data=new Map(),storage={getItem:k=>data.get(k),setItem:(k,v)=>data.set(k,v)},key='standing-'+crypto.randomUUID();ROOMS[key]={...structuredClone(ROOMS.canopy),id:key,ownerId:'owner',creatorId:'owner',versions:undefined,blocks:[{id:'piece',type:'text',body:'Synthetic piece',importance:'core',content:scores()}],content:scores(),measured:scores()};return {key,store:new AccessStore(()=>storage),storage,ref:targetRef(ROOMS[key]),cleanup:()=>delete ROOMS[key]};}
const measure=(s,ref,value,lens=person('checker'),options={})=>s.standing.measure(ref,scores(value),lens,{method:'Synthetic controlled inspection',...options});

test('audience requires verified identity and a crossing; edits retain receipts and one active reading',async()=>{
 const f=fixture(),visitor=person('visitor');try{
  assert.equal(identityTier(visitor),'verified-unnamed');assert.equal(identityTier({...visitor,identity:{display:'real',backing:'verified'}}),'verified-named');
  await assert.rejects(measure(f.store,f.ref,{},person('anonymous',{identity:{display:'real',backing:'none'}})),/Unverified/);
  await assert.rejects(measure(f.store,f.ref,{},visitor,{kind:'audience'}),/crossing receipt/);
  await f.store.use(f.key,'enter',visitor);const first=await measure(f.store,f.ref,{sensory:pair(1,0)},visitor,{kind:'audience',text:'First words'}),second=await measure(f.store,f.ref,{sensory:pair(0,0)},visitor,{kind:'audience',text:'Edited words'});
  const current=currentMeasurements(f.store.standing.data,f.ref);assert.equal(current.length,1);assert(current[0].edited);assert.deepEqual(current[0].supersedes,[first.hash]);assert.equal(current[0].id,second.hash);
  assert.equal(events(f.store.standing.data).filter(e=>e.kind==='measured').length,2);assert((await verifyChain(f.store.standing.data.receipts)).valid);
  assert(!JSON.stringify(f.store.standing.data).includes('crossingReceipt'));assert(f.store.data.ledgers[f.key].some(e=>e.action==='audience_crossing_proved'));
 }finally{f.cleanup();}
});
test('Thing audience proof is exact, private records stay private, and previews cannot file',async()=>{
 const f=fixture(),visitor=person(),ref=targetRef(ROOMS[f.key],ROOMS[f.key].blocks[0]);try{
  await f.store.use(f.key,'enter',visitor);await assert.rejects(measure(f.store,ref,{},visitor,{kind:'audience'}),/crossing receipt/);
  await f.store.standing.crossThing(ref,visitor);await measure(f.store,ref,{},visitor,{kind:'audience'});
  await f.store.policy(f.key,'hidden',visitor);await measure(f.store,ref,{},visitor);
  assert.equal(events(f.store.standing.data).at(-1).published,false);await assert.rejects(measure(f.store,ref,{},person('outsider')),/outside/);
  await assert.rejects(measure(f.store,ref,{},person('owner',{preview:true})),/Preview/);
 }finally{f.cleanup();}
});
test('Steward readings bind independently on both dials and owner readings cannot suppress an independent one',async()=>{
 const f=fixture();try{
  await measure(f.store,f.ref,{sensory:pair(3,1)},person('independent'));await measure(f.store,f.ref,{sensory:pair(1,3)},person('owner'));
  const reading=readingsFor(f.store.standing.data,f.ref);assert.deepEqual(reading.steward.sensory,pair(3,3));assert.deepEqual(reading.stewards.map(e=>e.measurer.relationship),['independent','owner']);
  const l=person('visitor');l.hard.sensory=pair(2,2);assert.equal(crossing({to:f.key,type:'door'},f.store.lens(l)).state,'hidden');
 }finally{f.cleanup();}
});
test('contest queues another Steward, outcome supersedes by receipt, history stays complete',async()=>{
 const f=fixture();try{
  const first=await measure(f.store,f.ref,{sensory:pair(2,1)}),q=await f.store.standing.contest(first.hash,'Synthetic counter-evidence',person('owner'));
  assert.equal(pendingMeasurements(f.store.standing.data,f.ref).length,1);
  await assert.rejects(measure(f.store,f.ref,{},person('checker'),{queueId:q.hash}),/different Steward/);
  const repaired=await measure(f.store,f.ref,{},person('second-checker'),{queueId:q.hash});
  assert.deepEqual(currentMeasurements(f.store.standing.data,f.ref).map(e=>e.id),[repaired.hash]);assert.equal(pendingMeasurements(f.store.standing.data,f.ref).length,0);
  assert.deepEqual(readingsFor(f.store.standing.data,f.ref).steward.sensory,pair(0,0));assert(events(f.store.standing.data).some(e=>e.id===first.hash));
 }finally{f.cleanup();}
});
test('audience divergence automatically queues once and does not become a Steward reading',async()=>{
 const f=fixture(),visitor=person('visitor');try{
  await f.store.use(f.key,'enter',visitor);await measure(f.store,f.ref,{sensory:pair(3,3)},visitor,{kind:'audience'});await measure(f.store,f.ref,{sensory:pair(2,2)},visitor,{kind:'audience'});
  const view=readingsFor(f.store.standing.data,f.ref);assert.equal(view.steward,null);assert.deepEqual(view.audienceReading.sensory,pair(2,2));assert.equal(pendingMeasurements(f.store.standing.data,f.ref).length,1);
  const l=person('reader');l.hard.sensory=pair(1,1);assert.notEqual(crossing({to:f.key,type:'door'},f.store.lens(l)).state,'hidden');
 }finally{f.cleanup();}
});
test('declarations are signed receipts and a measurement keeps its original declaration snapshot',async()=>{
 const f=fixture();try{
  const declared=await f.store.standing.declare(f.ref,scores(),person()),measured=await measure(f.store,f.ref,{violence:pair(1,0)});
  await f.store.standing.declare(f.ref,scores({violence:pair(2,1)}),person());
  const entry=events(f.store.standing.data).find(e=>e.id===measured.hash);assert.equal(entry.declaration.id,declared.hash);assert.deepEqual(entry.gap.violence,pair(1,0));assert.equal(entry.declaration.owner,'owner');
  await assert.rejects(f.store.standing.declare(f.ref,scores(),person('outsider')),/owner/);
  await assert.rejects(measure(f.store,f.ref,{sensory:{amount:1,graphicness:9}}),/both dials/);
 }finally{f.cleanup();}
});
test('standing survives reload and a changed receipt freezes all writes without discarding the record',async()=>{
 const f=fixture();try{
  await measure(f.store,f.ref,{});const loaded=new AccessStore(()=>f.storage);await loaded.ready;assert(loaded.valid);assert.equal(events(loaded.standing.data).length,1);
  const raw=JSON.parse(f.storage.getItem(ACCESS_KEY));raw.standingState.receipts[0].diff.text='tampered';f.storage.setItem(ACCESS_KEY,JSON.stringify(raw));const broken=new AccessStore(()=>f.storage);await broken.ready;assert.equal(broken.valid,false);await assert.rejects(measure(broken,f.ref,{}),/verification/);assert.equal(broken.standing.data.receipts.length,1);
 }finally{f.cleanup();}
});
test('subject-scoped collection references survive new readings and publication does not expose private history',async()=>{
 const f=fixture();try{
  await f.store.policy(f.key,'hidden',person());await measure(f.store,f.ref,{sensory:pair(3,3)},person());
  await f.store.policy(f.key,'public',person());assert.equal(readingsFor(f.store.standing.data,f.ref).steward,null);
  const receipt=await f.store.standing.declare(f.ref,scores(),person(),{versionId:'authored-version-1'}),links=f.store.standing.references(f.ref,person());
  assert.deepEqual(links.declarationRef,{versionId:'authored-version-1',receiptRef:'local-standing:'+receipt.hash});assert.equal(f.store.standing.resolveMeasurements(links.measurementRecordsRef,person()).steward,null);
  await measure(f.store,f.ref,{sensory:pair(1,0)});assert.deepEqual(f.store.standing.resolveMeasurements(links.measurementRecordsRef,person()).steward.sensory,pair(1,0));assert.deepEqual(f.store.standing.references(f.ref,person()).measurementRecordsRef,links.measurementRecordsRef);
 }finally{f.cleanup();}
});
