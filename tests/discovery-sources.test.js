import test from 'node:test';
import assert from 'node:assert/strict';
import {ROOMS,EDGES} from '../src/data.js';
import {AccessStore} from '../src/access-store.js';
import {seedProfiles} from '../src/profiles.js';
import {scores} from '../src/scores.js';
import {installGallery,GALLERY_PLACE,sourcedRoom,recordUploadInventory} from '../src/source-catalog.js';
import {connectedSources} from '../src/connected-sources.js';
import {queryIndex} from '../src/discovery-index.js';
import {targetRef} from '../src/standing-records.js';
const memory=()=>{const m=new Map();return {getItem:k=>m.get(k),setItem:(k,v)=>m.set(k,v)};};
const person=extra=>({...seedProfiles()[0],profileId:'source-reader',playAs:'visitor',...extra});
test('Discovery consumes the shared source projection and current availability with its real badge fields',async()=>{
 installGallery();const storage=memory(),store=new AccessStore(()=>storage);await store.ready;const lens=store.lens(person()),room=ROOMS[GALLERY_PLACE];
 const result=()=>queryIndex(lens,{}, {standing:store.standing}).results.filter(card=>card.room===GALLERY_PLACE),cards=result();
 assert(cards.some(card=>card.type==='thing'&&card.title==='Study in Cobalt'));assert(cards.every(card=>card.sourceBadge?.simulated));
 const source=room.sources[0],actorId=room.ownerId;
 try{await connectedSources.setMockAvailability(source.id,'blue-vessel',false,{actorId});const unavailable=result().find(card=>card.type==='thing'&&card.node.source.itemId==='blue-vessel');assert.match(unavailable.sourceState,/unavailable/);assert.notEqual(unavailable.title,'Study in Cobalt');}
 finally{await connectedSources.setMockAvailability(source.id,'blue-vessel',true,{actorId});}
});
test('upload declaration references resolve without inventing a measurement or exposing a private source',async()=>{
 const key='upload-reading-'+crypto.randomUUID(),owner=person({profileId:'upload-owner'}),storage=memory(),store=new AccessStore(()=>storage);await store.ready;
 ROOMS[key]={...structuredClone(ROOMS.canopy),id:key,ownerId:owner.profileId,visibility:'public',versions:undefined,content:scores(),measured:scores(),blocks:[]};EDGES.push({id:key,from:'square',to:key,type:'door'});
 try{
  recordUploadInventory([{id:'synthetic-upload',placeId:key,sourceId:'uploaded-copy',filename:'synthetic.txt',contentType:'text/plain',state:'published',scores:scores(),snapshotReceiptId:'snapshot-test',declarationReceiptId:'declaration-test',sha256:'a'.repeat(64),uploadedAt:'2026-11-24T17:00:00Z'}],owner);
  const lens=store.lens(owner),card=queryIndex(lens,{}, {standing:store.standing}).results.find(c=>c.type==='thing'&&c.room===key);
  assert.equal(card.references.declarationRef.receiptRef,'declaration-test');assert.equal(card.declarationSource,'referenced declaration receipt');assert.equal(card.readings.steward,null);
  const block=sourcedRoom(ROOMS[key],lens).blocks[0];assert.throws(()=>store.standing.resolve(targetRef(ROOMS[key],block),store.lens(person()),{metadataOnly:true}),/outside/);
  assert(!queryIndex(store.lens(person()),{},{standing:store.standing}).results.some(c=>c.type==='thing'&&c.room===key));
 }finally{recordUploadInventory([],owner);delete ROOMS[key];EDGES.splice(EDGES.findIndex(e=>e.id===key),1);}
});
