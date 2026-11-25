import test from 'node:test';import assert from 'node:assert/strict';
import {AtlasRecords} from '../src/atlas-records.js';import {atlasIntent,ATLAS_INTENT_SCHEMA} from '../src/atlas-intents.js';import {createAI} from '../src/ai.js';import {verifyChain} from '../src/ledger.js';
const lens={profileId:'synthetic-holder',age:30,identity:{display:'pseudonym',backing:'none'}};
const fixture=()=>{const m=new Map();return new AtlasRecords(()=>({getItem:k=>m.get(k),setItem:(k,v)=>m.set(k,v)}));};
test('Atlas grant is scoped, explicitly confirmed, leased or standing, narrowed and revoked with receipts',async()=>{
 const r=fixture(),p=await r.propose(lens,atlasIntent('Give Atlas standing edit access for my Lens and travel'),'synthetic grant');
 assert.throws(()=>r.require(lens,'lens','edit'),/needs your active/);await assert.rejects(r.confirm({...lens,profileId:'other'},p.id),/no longer open/);
 await r.confirm(lens,p.id);assert.equal(r.require(lens,'lens','edit').expires,null);assert.throws(()=>r.require(lens,'discovery'),/needs your active/);
 await r.narrow(lens,p.id,{areas:['lens'],scope:'suggest'});assert.throws(()=>r.require(lens,'travel'),/needs your active/);assert.throws(()=>r.require(lens,'lens','edit'),/needs your active/);
 await assert.rejects(r.narrow(lens,p.id,{areas:['lens'],scope:'edit'}),/only remove/);await r.revoke(lens,p.id);assert.throws(()=>r.require(lens,'lens'),/needs your active/);
 const leased=await r.propose(lens,atlasIntent('Allow Atlas look access for Discovery for 10 minutes'),'synthetic lease');await r.confirm(lens,leased.id);assert(r.require(lens,'discovery').expires);assert.equal(r.state(lens,Date.now()+11*60000).grants.find(g=>g.id===leased.id).active,false);
 assert((await verifyChain(r.read().receipts)).valid);assert(r.state(lens).receipts.some(r=>r.action==='atlas_grant_narrowed'));assert(r.state(lens).receipts.some(r=>r.action==='atlas_grant_revoked'));
});
test('User-specified per-area initiative has no default watch and changes only on confirmation',async()=>{
 const r=fixture();assert.deepEqual(r.state(lens).envelopes,{});
 const words='Be Proactive for travel. You may warn me unasked. Always ask before crossing. Watch for soft-limit Lens gaps.';
 const value=atlasIntent(words);assert.deepEqual(value.areas,['travel']);const p=await r.propose(lens,value,words);assert.deepEqual(r.state(lens).envelopes,{});await r.confirm(lens,p.id);
 assert.equal(r.state(lens).envelopes.travel.specification,words);assert.deepEqual(r.state(lens).envelopes.travel.watch,['soft-limit Lens gaps']);
 const q=await r.propose(lens,atlasIntent('Be Quiet for travel'),'Be Quiet for travel');await r.confirm(lens,q.id);assert.equal(r.state(lens).envelopes.travel.posture,'Quiet');
 assert.equal(atlasIntent('Be proactive for travel').kind,'clarify');assert.equal(atlasIntent('Give Atlas edit access for Lens').kind,'clarify');assert.equal(r.state({...lens,profileId:'other'}).receipts.length,0);
});
test('Personal request interpretation crosses ai.request locally and cannot dispatch through the Docent route',async()=>{
 const brain=createAI({transport:{eligible:()=>true,request:()=>{throw Error('No live call permitted');}}});
 const result=await brain.request({job:'guide',agentId:'atlas',schema:ATLAS_INTENT_SCHEMA,context:{place:{key:'studio'},blocks:[],action:'personal-intent',question:'Give Atlas standing edit access for my Lens'}});
 assert.equal(result.proposal.kind,'grant');assert.equal(result.receiptData.provider,'simulated');
});
