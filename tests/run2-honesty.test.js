import test from 'node:test';import assert from 'node:assert/strict';
import {createAI,provenanceLabel} from '../src/ai.js';
import {helperIdentityLabel,identityBadge,accountStateLabel} from '../src/identity.js';
import {presenceBadge} from '../src/discovery-policy.js';
import {helperRecord} from '../src/staff-data.js';
import {DONT_KNOW} from '../src/docent-questions.js';
import {AccessStore} from '../src/access-store.js';import {Staff} from '../src/staff.js';
import {ROOMS} from '../src/data.js';import {seedProfiles} from '../src/profiles.js';
const memory=()=>{const m=new Map();return {getItem:k=>m.get(k),setItem:(k,v)=>m.set(k,v)};};
test('An exact quote about the topic cannot masquerade as an answer to unsupported parts',async()=>{
 const body='Black residents organized a boycott of the city’s segregated bus service.',context={place:{key:'boycott'},action:'answer',question:'Why did Tallahassee hold its boycott, and was it successful?',blocks:[{id:'lead',body}]},receiptId=crypto.randomUUID();
 const client=createAI({transport:{eligible:()=>true,request:async()=>({proposal:{kind:'answer',room:'boycott',reason:'Exact excerpt',text:body,citations:['lead']},agentId:'docent-silver',model:'synthetic/fixture',receiptData:{receiptId}})}});
 const unknown=await client.request({job:'guide',agentId:'docent-silver',context});assert.equal(unknown.proposal.text,DONT_KNOW);assert.deepEqual(unknown.proposal.citations,[]);assert.equal(unknown.receiptData.receiptId,receiptId);assert.equal(provenanceLabel(unknown.receiptData),'Live response · answer withheld');
 const known=await client.request({job:'guide',agentId:'docent-silver',context:{...context,question:'What bus service did residents boycott?'}});assert.equal(known.proposal.text,body);assert.equal(provenanceLabel(known.receiptData,known.proposal),'Live · grounded answer');
 assert.equal(provenanceLabel({provider:'proxy'},{text:DONT_KNOW}),'Live · no supported answer','old stored abstentions also get the honest label');
});
test('Mara has one operator status across cards and presence; no unsupported verification claim',()=>{const actor=helperRecord({id:'docent-silver',name:'Mara',role:'Docent',places:['boycott'],capabilities:['answer']},null);const status=helperIdentityLabel(actor);assert.equal(identityBadge(actor),status);assert.equal(presenceBadge({author:actor}),status);assert.match(status,/operator Nic.*verification not connected/);assert.doesNotMatch(status,/verified person|Unbacked/);});
test('Robin retains its own operator record when a different profile is active',async t=>{const store=new AccessStore(()=>memory()),staff=new Staff(store);await staff.ready;const id='operator-test-'+crypto.randomUUID(),owner={...seedProfiles()[0],profileId:'synthetic-owner',profileName:'First owner',playAs:'visitor'};ROOMS[id]={...structuredClone(ROOMS.studio),id,ownerId:owner.profileId};t.after(()=>delete ROOMS[id]);await staff.seedArrival(id,owner);const actor=staff.data.helpers.find(a=>a.places.includes(id));const before=structuredClone(actor.operator);const other={...owner,profileId:'different-viewer',profileName:'Different viewer'};store.lens(other);assert.deepEqual(actor.operator,before);assert.equal(actor.operator.id,'synthetic-owner');assert.match(helperIdentityLabel(actor),/First owner/);assert.doesNotMatch(helperIdentityLabel(actor),/Different viewer/);});
test('Age supplied is distinguished from no age without changing verification',()=>{assert.equal(accountStateLabel({age:34,identity:{backing:'none'}}),'Unverified · age given, not verified');assert.equal(accountStateLabel({identity:{backing:'none'}}),'Unverified · age unknown');});
