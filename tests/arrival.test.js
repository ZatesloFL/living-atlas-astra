import test from 'node:test';
import assert from 'node:assert/strict';
import {ArrivalRecords,interviewRecord} from '../src/arrival-records.js';
import {STARTS,starterDraft,starterProposals,WORKSHOP_COPY} from '../src/starter-data.js';
import {loadArrivalSeed} from '../src/arrival-seed.js';
import {publicSelections,resolvePublicReference} from '../src/public-references.js';
import {makeProfile,ProfileStore} from '../src/profiles.js';
import {ROOMS,EDGES} from '../src/data.js';
import {validPair,pair} from '../src/scores.js';
import {permission} from '../src/permissions.js';
import {verifyChain} from '../src/ledger.js';
const memory=()=>{const m=new Map();return {getItem:k=>m.get(k),setItem:(k,v)=>m.set(k,v)};};
test('Interview uses only supplied answers; locality is never inferred, and credential-bearing/unsafe source URLs are rejected',()=>{
 const r=interviewRecord({localArea:'Do not silently use this'},{holderId:'person'});assert.equal(r.hobbies,null);assert.equal(r.includeLocal,null);assert.equal(r.localArea,null);
 assert.equal(interviewRecord({includeLocal:'yes',localArea:'A town'},{holderId:'p'}).localArea,'A town');assert.equal(interviewRecord({includeLocal:'no',localArea:'Ignore'},{holderId:'p'}).localArea,null);
 for(const url of ['javascript:alert(1)','https://person:secret@example.com','not a URL'])assert.throws(()=>interviewRecord({sources:[url]},{holderId:'p'}));
});
test('All three starters use the same v1 kit data unchanged through lane B registration; ownership and paired scores stay explicit',()=>{
 const profile=makeProfile('Synthetic arrival'),interview=interviewRecord({hobbies:'Gardening',sources:['https://example.org/growing']},{holderId:profile.id});
 const proposals=starterProposals(interview);assert.equal(proposals.length,1);assert.match(proposals[0].provenance,/not a fact about you/);proposals[0].status='keep';
 for(const [start] of STARTS){profile.id=crypto.randomUUID();interview.holderId=profile.id;const draft=starterDraft({profile,interview,start,proposals}),before=JSON.stringify(draft);const loaded=loadArrivalSeed(draft),rooms=ROOMS;assert.equal(JSON.stringify(draft),before);assert.equal(Object.keys(loaded.roomKeys).length,3);assert.equal(draft.projection.schemaVersion,1);
  for(const id of Object.values(loaded.roomKeys)){assert.equal(rooms[id].ownerId,profile.id);assert(permission(rooms[id],profile).owner);assert(!permission(rooms[id],makeProfile('Another person')).visible);assert(Object.values(rooms[id].content).every(v=>validPair(v)));assert.equal(rooms[id].backing_ref,null);}
  const home=draft.projection.rooms[0];assert.equal(home.parentPlaceId,null);assert.equal(home.pieces.length,start==='scratch'?0:1);assert.equal(rooms[loaded.rootKey+'/drive'].blocks.find(b=>b.id==='source-0').source.syncedAt,null);assert.match(WORKSHOP_COPY.account,/has not created or linked/);
 }
});
test('Public selections carry origin IDs only and recheck original grants, scores and inclusion revocation',()=>{
 const p=makeProfile('Synthetic'),ref={placeId:ROOMS.civic.id,thingId:'lead'},original=JSON.stringify(ROOMS.civic);assert(publicSelections(p).some(x=>x.ref.placeId===ref.placeId));assert(resolvePublicReference(ref,p).allowed);
 const interview=interviewRecord({},{holderId:p.id}),draft=starterDraft({profile:p,interview,references:[ref]});assert.deepEqual(draft.projection.rooms[0].pieces[0].ref,ref);assert(!draft.changes.some(c=>c.ref.placeId===ref.placeId));assert.equal(JSON.stringify(ROOMS.civic),original);
 const revoked={...p,access:{policies:{[ref.placeId]:{embed:'none'}}}};assert.equal(resolvePublicReference(ref,revoked).allowed,false);
 const restricted={...p,access:{grants:[{id:'deny',room:ref.placeId,to:{person:p.id},denied:true,scope:'look',createdAt:new Date().toISOString()}]}};assert.equal(resolvePublicReference(ref,restricted).allowed,false);
 const rooms=structuredClone(ROOMS);rooms.civic.blocks[0].measured={disturbing:pair(1,3)};assert.equal(resolvePublicReference(ref,p,rooms).allowed,false);
 assert.equal(resolvePublicReference({placeId:ROOMS.canopy.id},p).allowed,false);
});
test('Source organization and proposal decisions are receipted durable records independent of the projection and profile deletion',async()=>{
 const storage=memory(),records=new ArrivalRecords(()=>storage),profile=makeProfile('Synthetic');const i=await records.saveInterview({hobbies:'Reading',sources:['https://example.org/book']},profile.id),proposals=starterProposals(i);await records.saveProposals(i.id,proposals,profile.id);const edit=await records.decide(proposals[0].id,'edit',profile.id,'My chosen notebook');await records.organize(i.id+'-source-0','Reading',profile.id);
 const draft=starterDraft({profile,interview:i,proposals:[edit]});await records.claimStarter(draft,profile.id);await records.claimStarter(draft,profile.id);assert.equal(records.data.starters.length,1);
 const restored=new ArrivalRecords(()=>storage);await restored.ready;assert.equal(restored.data.archive[0].collection,'Reading');assert.equal(restored.data.proposals[0].editedBody,'My chosen notebook');assert((await verifyChain(restored.data.receipts)).valid);
 const profiles=new ProfileStore(()=>storage);await profiles.setup({...profile,display:'pseudonym',homePlaceId:draft.projection.rootPlaceId,arrivalId:i.id});await profiles.remove(profile.id);assert.equal(new ArrivalRecords(()=>storage).data.archive.length,1);
});

test('An existing profile claims its own starter once without replacing identity, preferences or old receipts',async()=>{
 const storage=memory(),profiles=new ProfileStore(()=>storage),records=new ArrivalRecords(()=>storage);profiles.arrivalRecords=records;
 await profiles.setup({name:'My visit',age:40,preset:'Teen',depth:'Deep',form:'3d',display:'pseudonym'});
 profiles.preferences({...profiles.current(),stylePreset:'Gallery',acceptedLayers:['saved-layer'],discovery:{...profiles.current().discovery,pins:['boycott']}});
 const before=structuredClone(profiles.active()),entries=structuredClone(profiles.entries),count=profiles.profiles.length;
 const interview=await records.saveInterview({hobbies:'Reading'},before.id),draft=starterDraft({profile:before,interview});
 const completion={...before,display:'pseudonym',homePlaceId:draft.projection.rootPlaceId,arrivalId:interview.id,depth:'Glance'};
 await assert.rejects(profiles.setup(completion),/Claim this profile/);
 await records.claimStarter(draft,before.id);await profiles.setup(completion);await profiles.setup(completion);
 assert.equal(profiles.activeId,before.id);assert.equal(profiles.regularId,before.id);assert.equal(profiles.profiles.length,count);
 for(const key of ['id','name','identity','age','stylePreset','acceptedLayers','discovery','limits','hard'])assert.deepEqual(profiles.active()[key],before[key],key);
 assert.equal(profiles.active().depth,'Glance');assert.deepEqual(profiles.entries.slice(0,entries.length),entries);
 assert.equal(profiles.entries.filter(e=>e.action==='profile_starter_attached').length,1);
 const second=starterDraft({profile:before,interview:interviewRecord({},{holderId:before.id})});
 await assert.rejects(records.claimStarter(second,before.id),/already has a starter/);
 assert.equal(records.data.receipts.filter(e=>e.action==='starter_claimed_local').length,1);
 const restored=new ProfileStore(()=>storage);await restored.ready;
 assert.equal(restored.active().homePlaceId,draft.projection.rootPlaceId);assert.equal(restored.active().arrivalId,interview.id);
 assert((await verifyChain(restored.entries)).valid);assert((await verifyChain(records.data.receipts)).valid);
});

test('Legacy workshop account copy heals after registration without rewriting the stored claim',()=>{const profile=makeProfile('Synthetic supplied age'),interview=interviewRecord({},{holderId:profile.id}),draft=starterDraft({profile,interview});const block=draft.changes.find(c=>c.kind==='Place'&&c.ref.placeId.endsWith('/workshop')).fields.blocks.find(b=>b.id==='account');block.body=block.reps.text=WORKSHOP_COPY.account.replace('an unverified account with fixed conservative ceilings. A supplied age is given, not verified.','an unverified account with age unknown and fixed conservative ceilings.');const before=JSON.stringify(draft),loaded=loadArrivalSeed(draft),guide=ROOMS[loaded.rootKey+'/workshop'].blocks.find(b=>b.id==='account');assert.doesNotMatch(guide.body,/age unknown/);assert.match(guide.body,/given, not verified/);assert.equal(JSON.stringify(draft),before);const other=makeProfile('Synthetic edited guide'),editedDraft=starterDraft({profile:other,interview:interviewRecord({},{holderId:other.id})}),editedBlock=editedDraft.changes.find(c=>c.kind==='Place'&&c.ref.placeId.endsWith('/workshop')).fields.blocks.find(b=>b.id==='account');editedBlock.body=block.body+' Owner-authored addition.';const edited=editedBlock.body,otherLoad=loadArrivalSeed(editedDraft);assert.equal(ROOMS[otherLoad.rootKey+'/workshop'].blocks.find(b=>b.id==='account').body,edited);});
