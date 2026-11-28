import test from 'node:test';import assert from 'node:assert/strict';
import {ProfileStore} from '../src/profiles.js';import {AccessStore} from '../src/access-store.js';import {Discovery,eventsFor} from '../src/discovery.js';import {starterProposals} from '../src/starter-data.js';import {savedRecords} from '../src/saved-records-ui.js';
test('skipped and marked-seen trail stops finish without inventing visited stops or tour measurements',async()=>{
 const m=new Map(),storage=()=>({getItem:k=>m.get(k),setItem:(k,v)=>m.set(k,v)}),profiles=new ProfileStore(storage),access=new AccessStore(storage);await profiles.switchProfile('seed-me');await access.ready;
 let measured=0,ending=null;access.standing.completeTour=async()=>measured++;
 const d=new Discovery(profiles,access,{finished:(_,progress)=>ending=progress});d.startTrail('inside-studio');d.advanceTrail('seen');for(let i=0;i<3;i++)d.advanceTrail('skipped');
 assert.equal(ending.active,false);assert.equal(ending.done.length,0);assert.equal(ending.seen.length,1);assert.equal(ending.skipped.length,3);assert(ending.finishedAt);assert.equal(measured,0);assert.equal(d.prefs().trail.finishedAt,ending.finishedAt);
 d.startTrail('inside-studio');assert.deepEqual(d.prefs().trail.done,[]);assert.deepEqual(d.prefs().trail.skipped,[]);
 access.pin('square',d.lens());access.recent('studio',d.lens());assert.deepEqual(savedRecords(access,d.lens()).pins,['square']);assert.deepEqual(savedRecords(access,d.lens()).recent,['studio']);
});
test('birdwatching and bread match their own topics; sample event schedule recurs without invented publication dates',()=>{
 const p=starterProposals({id:'synthetic',hobbies:'birdwatching',interests:'bread'})[0];assert.match(p.body,/birdwatching/i);assert.match(p.body,/recipe/i);assert.doesNotMatch(p.title,/reading/i);assert.match(p.provenance,/birdwatching.*bread/);
 const epoch=Date.parse('2026-11-01T00:00:00Z'),now=epoch+24*86400000,events=eventsFor({community:{epoch}},now);assert(events.every(e=>e.end>now));assert(events.every(e=>!e.publishedAt));
});
test('kept answers belong to the accepting holder and cannot bypass a tightened Lens',async()=>{
 const {ROOMS}=await import('../src/data.js'),{evidenceText}=await import('../src/place-evidence.js');const m=new Map(),storage=()=>({getItem:k=>m.get(k),setItem:(k,v)=>m.set(k,v)}),profiles=new ProfileStore(storage),access=new AccessStore(storage);await profiles.switchProfile('seed-visitor');await access.ready;
 const lens=access.lens(profiles.current()),block=ROOMS.boycott.blocks.find(b=>b.id==='outcomes'),p={id:crypto.randomUUID(),agentName:'Mara',proposal:{kind:'answer',room:'boycott',text:evidenceText(block),citations:['outcomes']}};access.data.staffState.proposals.push(p);await access.record('boycott',lens,'helper_offer_accepted',{proposal:p.id});
 assert.equal(savedRecords(access,lens).kept.length,1);assert.equal(savedRecords(access,lens).kept[0].readable,true);assert.equal(savedRecords(access,{...lens,profileId:'another-holder'}).kept.length,0);
 const tight=structuredClone(lens);tight.limits.disturbing={amount:0,graphicness:0};assert.equal(savedRecords(access,tight).kept[0].readable,false);
});
