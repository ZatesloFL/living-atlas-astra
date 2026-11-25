import test from 'node:test';
import assert from 'node:assert/strict';
import {AccessStore} from '../src/access-store.js';
import {holderCrossings} from '../src/crossing-history.js';
import {PRESETS,ROOMS} from '../src/data.js';
import {appendEntry,verifyChain} from '../src/ledger.js';

test('Holder history reads actual Place/Thing crossings without exposing other actors or counting previews',async()=>{
 const memory=new Map(),storage=()=>({getItem:k=>memory.get(k),setItem:(k,v)=>memory.set(k,v)}),access=new AccessStore(storage);
 await access.ready;
 const lens={...structuredClone(PRESETS.Adult),profileId:'synthetic-holder',age:30,identity:{display:'pseudonym',backing:'verified'},playAs:'visitor',show:{real:true,pseudonym:true,anonymous:true,agent:true}};
 assert.deepEqual(holderCrossings(access,lens),[]);
 await access.use('boycott','enter',lens);await access.use('boycott','enter',{...lens,profileId:'someone-else'});
 await access.standing.crossThing({placeId:ROOMS.boycott.id,thingId:'film',versionId:null},lens);
 const chain=access.data.ledgers[ROOMS.boycott.id];await appendEntry(chain,lens.profileId,'access_requested',{scope:'enter'});
 const before=JSON.stringify(access.data),rows=holderCrossings(access,lens);
 assert.equal(rows.length,2);assert(rows.every(r=>r.receipt.actor===lens.profileId&&r.receipt.time&&r.receipt.hash));
 assert.equal(rows[0].receipt.action,'thing_crossed');assert.equal(JSON.stringify(access.data),before);
 assert.deepEqual(holderCrossings(access,{...lens,preview:true}),[]);
 assert.equal((await verifyChain(chain)).valid,true);
 access.persist();const reload=new AccessStore(storage);await reload.ready;
 assert.deepEqual(holderCrossings(reload,lens),rows);
});
