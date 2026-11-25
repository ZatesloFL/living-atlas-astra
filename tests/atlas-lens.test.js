import test from 'node:test';import assert from 'node:assert/strict';
import {AtlasRecords} from '../src/atlas-records.js';import {atlasIntent} from '../src/atlas-intents.js';import {ProfileStore} from '../src/profiles.js';import {lensBasis} from '../src/lens-proposals.js';import {verifyChain} from '../src/ledger.js';
const fixture=async()=>{const memory=new Map(),storage=()=>({getItem:k=>memory.get(k),setItem:(k,v)=>memory.set(k,v)}),profiles=new ProfileStore(storage);await profiles.setup({name:'Synthetic Lens',age:34,display:'pseudonym'});return {profiles,records:new AtlasRecords(storage)};};
const grant=async(r,lens)=>{const p=await r.propose(lens,atlasIntent('Give Atlas standing edit access for Lens'),'grant');await r.confirm(lens,p.id);return p;};
test('Lens words propose exact pairs; only confirmed granted acts change the profile and produce linked receipts',async()=>{
 const {profiles,records}=await fixture(),lens=profiles.current(),words='Set violence to amount 1 and graphicness 0, and disturbing themes to amount 1 and graphicness 1';
 await assert.rejects(records.propose(lens,atlasIntent(words),words),/needs your active/);await grant(records,lens);
 const before=structuredClone(profiles.current().limits),proposal=await records.propose(lens,atlasIntent(words),words);assert.deepEqual(profiles.current().limits,before);
 const result=await records.confirm(lens,proposal.id,(value,refs)=>profiles.applyLensProposal(value.changes,{holder:profiles.activeId,basis:proposal.basis,...refs}));
 assert.deepEqual(profiles.current().limits.violence,{amount:1,graphicness:0});assert.deepEqual(profiles.current().limits.disturbing,{amount:1,graphicness:1});assert.deepEqual(profiles.current().hard,lens.hard);
 const receipt=profiles.entries.findLast(r=>r.action==='lens_changed');assert.equal(receipt.diff.proposalReceipt,proposal.receipt);assert.equal(result.result.receipt,receipt.hash);assert.equal((await verifyChain(profiles.entries)).valid,true);
});
test('Lens proposal rechecks current hard ceilings, grant, profile and changed settings',async()=>{
 const {profiles,records}=await fixture(),lens=profiles.current(),g=await grant(records,lens),value=atlasIntent('Set violence to 1 x 0');
 const proposal=await records.propose(lens,value,'synthetic');await records.revoke(lens,g.id);await assert.rejects(records.confirm(lens,proposal.id,()=>assert.fail('revoked actuator')),/needs your active/);
 await grant(records,lens);const changed={...lens,limits:{...lens.limits,violence:{amount:0,graphicness:0}}};await assert.rejects(records.confirm(changed,proposal.id,()=>assert.fail('stale actuator')),/Lens or assurance changed/);
 await assert.rejects(records.propose(lens,atlasIntent('Set sexual content to 3 x 3'),'synthetic'),/ceiling/);
 assert.equal(profiles.current().preset,null);assert.equal(lensBasis(lens),lensBasis(profiles.current()));
});
test('Natural qualitative requests are proposals in both dials; ambiguity does not presume a position',()=>{
 assert.deepEqual(atlasIntent('I want no violence and mild language').changes,{violence:{amount:0,graphicness:0},language:{amount:1,graphicness:1}});
 assert.deepEqual(atlasIntent('Less disturbing themes please',{limits:{disturbing:{amount:2,graphicness:1}}}).changes,{disturbing:{amount:1,graphicness:0}});
 assert.equal(atlasIntent('Less violence please',{limits:{violence:{amount:null,graphicness:null}}}).kind,'clarify');assert.equal(atlasIntent('Set violence amount 1').kind,'clarify');
});
