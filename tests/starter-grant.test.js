import test from 'node:test';import assert from 'node:assert/strict';
import {AtlasRecords} from '../src/atlas-records.js';import {atlasIntent,ATLAS_AREAS} from '../src/atlas-intents.js';import {ProfileStore} from '../src/profiles.js';import {ROOMS} from '../src/data.js';import {verifyChain} from '../src/ledger.js';import {atlasActionBoundary} from '../src/atlas-action-policy.js';
const fixture=()=>{const memory=new Map(),storage=()=>({getItem:k=>memory.get(k),setItem:(k,v)=>memory.set(k,v)});return {memory,storage,records:new AtlasRecords(storage)};};
const lens={profileId:'starter-test',age:34,identity:{display:'pseudonym',backing:'none'}};
test('Arrival gives one honest system starter, Conversational in all six areas, no watch or attendance',async()=>{
 const {records,storage}=fixture();await records.ensureStarter(lens);await records.ensureStarter(lens);const state=records.state(lens);
 assert.equal(state.receipts.length,1);assert.equal(state.receipts[0].actor,'system');assert.equal(state.receipts[0].action,'atlas_starter_granted');assert.equal(state.grants[0].approvedBy,undefined);assert.deepEqual(state.grants[0].areas,ATLAS_AREAS);assert.equal(state.attending,false);
 for(const area of ATLAS_AREAS){assert.equal(records.require(lens,area,'edit').expires,null);assert.equal(state.envelopes[area].posture,'Conversational');assert.deepEqual(state.envelopes[area].watch,[]);}
 assert.equal((await new AtlasRecords(storage).ensureStarter(lens)).created,false);assert((await verifyChain(records.read().receipts)).valid);
});
test('Any old grant choice, including declined, narrowed and revoked, survives next entry byte for byte',async()=>{
 for(const choice of ['declined','narrowed','revoked']){const {records,storage}=fixture();const p=await records.propose(lens,atlasIntent('Give Atlas standing edit access for Lens'),'my choice');if(choice==='declined')await records.decline(lens,p.id);else{await records.confirm(lens,p.id);if(choice==='narrowed')await records.narrow(lens,p.id,{areas:['lens'],scope:'look'});else await records.revoke(lens,p.id);}const before=JSON.stringify(records.read());await new AtlasRecords(storage).ensureStarter(lens);assert.equal(JSON.stringify(records.read()),before);}
});
test('The first gentle request can act without a second ask and keeps all hard ceilings',async()=>{
 const {storage}=fixture(),profiles=new ProfileStore(storage);await profiles.setup({name:'Synthetic birds and bread',age:34,display:'pseudonym'});const records=profiles.atlasRecords,l=profiles.current(),hard=structuredClone(l.hard),words="keep it gentle, I'm here for birds and bread",p=await records.propose(l,atlasIntent(words),words);
 await records.confirmRequested(l,p.id,(value,refs)=>profiles.applyLensProposal(value.changes,{holder:l.profileId,basis:p.basis,...refs}));assert.equal(profiles.current().limits.violence.amount,1);assert.equal(profiles.current().limits.sexual.amount,0);assert.deepEqual(profiles.current().hard,hard);assert.equal(records.state(l).receipts.find(r=>r.action==='atlas_confirmed').diff.source,'holder request');
 await assert.rejects(records.propose(profiles.current(),atlasIntent('Set sexual content to 3 x 3'),'raise adult range'),/ceiling/);
 const cut=await records.propose(l,atlasIntent('Only help with Lens'),'Only help with Lens');await records.confirmRequested(l,cut.id);assert.throws(()=>records.require(l,'travel'),/grant/);await profiles.entryGrant();assert.throws(()=>records.require(l,'travel'),/grant/);
 const restore=atlasIntent('Give Atlas standing edit access');assert.deepEqual(restore.areas,ATLAS_AREAS);
});
test('A shared publication and source connection cannot use request-only confirmation',async t=>{
 const {records}=fixture();await records.ensureStarter(lens);const key='starter-publication-test';ROOMS[key]={id:key,ownerId:lens.profileId,visibility:'public'};t.after(()=>delete ROOMS[key]);
 const act={kind:'extension',area:'sources',action:'publish-draft',placeId:key,payload:{previewReceiptId:'builder:'+'a'.repeat(64)}};assert.match(atlasActionBoundary(act,lens).reason,/other people/);const p=await records.proposeExtension(lens,act,'Publish this draft',{requested:true});let applied=false;
 await assert.rejects(records.confirmRequested(lens,p.id,()=>{applied=true;}),/edge/);assert.equal(applied,false);await records.confirm(lens,p.id,()=>{applied=true;});assert.equal(applied,true);
 const source={...act,action:'connect-and-map',payload:{sourceId:'synthetic-source',kind:'drive',syncMode:'indexed',recipe:'drive-alcoves',planFingerprint:'a'.repeat(64)}};assert.equal(atlasActionBoundary(source,lens).ask,true);assert.equal(atlasActionBoundary({...act,area:'build',action:'place-piece',payload:{kind:'bench'}},lens).ask,false);
});
