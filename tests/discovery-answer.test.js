import test from 'node:test';
import assert from 'node:assert/strict';
import {AccessStore} from '../src/access-store.js';
import {Staff} from '../src/staff.js';
import {seedProfiles} from '../src/profiles.js';
import {createAI} from '../src/ai.js';
import {queryIndex} from '../src/discovery-index.js';
import {discoveryEvidence,discoveryQuestionQuery,DISCOVERY_UNKNOWN,validateIndexAnswer} from '../src/discovery-answer.js';
const lens=()=>({...seedProfiles()[0],profileId:'seed-me',playAs:'visitor'});
const fixture=()=>{const m=new Map();return new AccessStore(()=>({getItem:k=>m.get(k),setItem:(k,v)=>m.set(k,v)}));};
test('Docent discovery quotes the same index reasons through ai.request, even with a live-capable transport',async()=>{
 const store=fixture();let calls=0;const ai=createAI({transport:{eligible:()=>true,request:()=>{calls++;throw new Error('Must not dispatch Discovery to the exhibit provider');}}}),staff=new Staff(store,{aiClient:ai});await staff.ready;
 const query=discoveryQuestionQuery('Where can I find the boycott?'),current=store.lens(lens()),result=queryIndex(current,query,{from:'boycott',standing:store.standing}),evidence=discoveryEvidence(result);
 const record=await staff.request('docent-silver','boycott','answer',current,{question:'Where can I find the boycott?',discovery:query});
 assert.equal(calls,0);assert.equal(record.provenance.localReason,'discovery_local');assert.equal(record.provenance.provider,'simulated');
 assert(record.proposal.citations.length>0);for(const part of record.proposal.text.split('\n\n'))assert(evidence.some(block=>block.body===part));
 assert(result.results.some(card=>record.proposal.text.includes(card.why)));assert.equal(store.data.grants.filter(g=>g.to.person==='docent-silver').at(-1).expires,null);
});
test('missing discovery evidence abstains and invented content is rejected rather than weakening validation',async()=>{
 const store=fixture(),staff=new Staff(store,{aiClient:createAI()});await staff.ready;
 const record=await staff.request('docent-square','square','answer',store.lens(lens()),{question:'African swallow speed?',discovery:{words:'African swallow speed'}});
 assert.equal(record.proposal.text,DISCOVERY_UNKNOWN);assert.deepEqual(record.proposal.citations,[]);
 assert.throws(()=>validateIndexAnswer({text:'Invented',citations:['x']},{blocks:[{id:'x',body:'Actual index evidence'}]}),/quote/);
 assert.throws(()=>discoveryQuestionQuery('Where is it? Who built it?'),/one question/i);
});
test('index answer offers are cancelled when a selected Lens changes during the request',async()=>{
 const store=fixture(),local=createAI();let release,started;const ready=new Promise(resolve=>started=resolve),delay=new Promise(resolve=>release=resolve);
 const staff=new Staff(store,{aiClient:{request:async request=>{started();await delay;return local.request(request);}}});await staff.ready;
 let current=store.lens(lens());const count=staff.data.proposals.length;
 const pending=staff.request('docent-square','square','answer',current,{question:"What's here?",discovery:{}},{getLens:()=>current});await ready;
 current={...current,discovery:{...current.discovery,sort:'newest'}};release();await assert.rejects(pending,{name:'AbortError'});assert.equal(staff.data.proposals.length,count);
});
