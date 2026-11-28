import assert from 'node:assert/strict';
import test from 'node:test';
import {Builder, BUILDER_STORAGE} from '../src/builder.js';
import {builderHallIdentity} from '../src/builder-hall.js';
import {registerProjection} from '../src/build-projection.js';
import {EDGES, PRESETS, ROOMS} from '../src/data.js';
import {scores} from '../src/scores.js';
import {verifyChain} from '../src/ledger.js';

function fixture(t) {
  const key='hall-publication-'+crypto.randomUUID(), ownerId=key+'-owner';
  registerProjection({projection:{schemaVersion:2,rootPlaceId:key,rooms:[{placeId:key,parentPlaceId:null,
    layout:{kind:'courtyard'},pathIds:[],pieces:[],behaviors:[]}]},changes:[{
    op:'create',kind:'Place',ref:{placeId:key},fields:{title:'A courtyard',visibility:'hidden',content:scores()}
  }]},{ownerId});
  const base=ROOMS[key], entries=new Map();
  const disk={getItem:k=>entries.get(k)??null,setItem:(k,value)=>entries.set(k,value)};
  const owner={...structuredClone(PRESETS.Adult),profileId:ownerId,age:30,depth:'Deep',
    show:{real:true,pseudonym:true,anonymous:true,agent:true},identity:{display:'pseudonym',backing:'verified'}};
  const reset=()=>{
    for(const child of Object.keys(ROOMS))if(child.startsWith(key+'/'))delete ROOMS[child];
    for(let i=EDGES.length-1;i>=0;i--)if(EDGES[i].id.startsWith(key+'/'))EDGES.splice(i,1);
    ROOMS[key]=base;
  };
  t.after(()=>{reset();delete ROOMS[key];});
  return {key,owner,disk,reset,builder:new Builder({storage:()=>disk})};
}

async function publish(builder, key, owner) {
  await builder.preview(key,owner,owner);
  return builder.publish(key,owner);
}

test('Builder publishes one hall Place and Path and recovers the hall’s own furnishings',async t=>{
  const {key,owner,disk,reset,builder}=fixture(t);
  const {pieces:[piece]}=await builder.add(key,owner,'interior-shell',{position:[-2,0,-2]});
  const {placeId,pathId}=builderHallIdentity(key,piece.id);
  assert.equal(builder.roomFor(key,owner).draftStructures[0].room.id,placeId);
  assert.equal(ROOMS[placeId],undefined);
  assert.equal(EDGES.some(edge=>edge.id===pathId),false);
  const first=await publish(builder,key,owner);
  assert.equal(ROOMS[placeId].publishedAt,first.receipt.time);
  assert.equal(ROOMS[placeId].standing.declarationRef,first.receipt.id);
  assert.equal(ROOMS[placeId].visibility,'hidden');
  assert.equal(ROOMS[key].blocks.some(block=>block.id===piece.id),false);
  assert.deepEqual(ROOMS[key].kitPieces.at(-1).ref,{placeId});
  assert.equal(EDGES.find(edge=>edge.id===pathId).to,placeId);

  const {pieces:[bench]}=await builder.add(placeId,owner,'bench',{position:[1,0,0]});
  const child=await publish(builder,placeId,owner);
  await builder.update(key,owner,piece.id,{transform:{position:[2,0,-3]}});
  await publish(builder,key,owner);
  assert.deepEqual(EDGES.find(edge=>edge.id===pathId).position,[2,-3]);
  assert.equal(EDGES.filter(edge=>edge.id===pathId).length,1);
  assert.equal(ROOMS[placeId].blocks[0].id,bench.id);
  assert.equal(ROOMS[placeId].publishedAt,child.receipt.time);

  reset();
  const fresh=new Builder({storage:()=>disk});
  await fresh.recover(owner);
  assert.deepEqual(EDGES.find(edge=>edge.id===pathId).position,[2,-3]);
  assert.equal(ROOMS[placeId].blocks[0].id,bench.id);
  assert.equal(ROOMS[placeId].publishedAt,child.receipt.time);
  assert.ok((await verifyChain(JSON.parse(disk.getItem(BUILDER_STORAGE)).receipts)).valid);
});

test('Invalid placement or failed persistence keeps the hall out of the live catalog',async t=>{
  const {key,owner,disk,builder}=fixture(t);
  const {pieces:[piece]}=await builder.add(key,owner,'interior-shell',{position:[27,0,0]});
  const {placeId,pathId}=builderHallIdentity(key,piece.id);
  await assert.rejects(publish(builder,key,owner),/frontage and arrival points/);
  assert.equal(ROOMS[placeId],undefined);
  assert.equal(builder.history(key,owner).length,0);
  await builder.update(key,owner,piece.id,{transform:{position:[2,0,-2]}});
  await builder.preview(key,owner,owner);
  disk.setItem=()=>{throw new Error('Storage full');};
  await assert.rejects(builder.publish(key,owner),/Storage full/);
  assert.equal(ROOMS[placeId],undefined);
  assert.equal(EDGES.some(edge=>edge.id===pathId),false);
});
