import assert from 'node:assert/strict';
import test from 'node:test';
import {Builder, BUILDER_STORAGE} from '../src/builder.js';
import {builderHallIdentity, builderHallPlacementFits} from '../src/builder-hall.js';
import {makeBuilderPiece} from '../src/builder-pieces.js';
import {registerProjection} from '../src/build-projection.js';
import {EDGES, PRESETS, ROOMS} from '../src/data.js';
import {scores} from '../src/scores.js';
import {appendEntry, verifyChain} from '../src/ledger.js';

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

test('Legacy replay recovers the original Thing and placement Receipts without rewriting the ledger',async t=>{
  const {key,owner,disk,reset}=fixture(t);
  const piece=makeBuilderPiece('interior-shell',{id:'legacy-hall',placeId:key,position:[-2,0,-2]});
  const {placeId,pathId}=builderHallIdentity(key,piece.id);
  piece.block={id:piece.id,type:'text',title:'Old exhibit hall',body:'Old source notes',importance:'core',
    content:scores(),sources:[{sourceId:'old-source',itemId:'old-item'}],backing_ref:'old-backing',recordVersionId:'old-version/legacy-hall'};
  piece.block.content.sensory={amount:1,graphicness:0};
  const target={placeId:key,thingId:piece.id,versionId:piece.block.recordVersionId};
  const receipts=[];
  const original=await appendEntry(receipts,owner.profileId,'build_published',{
    roomKey:key,revisionId:'old-version',pieces:[piece],ownedRecordVersions:[target]
  });
  await appendEntry(receipts,'prior-reader','build_vouched',{target,publicationReceiptRef:'builder:'+original.hash});
  const moved=structuredClone(piece);
  moved.transform.position=[27,0,0];
  const placement=await appendEntry(receipts,owner.profileId,'build_published',{
    roomKey:key,revisionId:'old-move',priorRevisionId:'old-version',pieces:[moved],ownedRecordVersions:[target]
  });
  const raw=JSON.stringify({version:1,drafts:{},receipts});
  disk.setItem(BUILDER_STORAGE,raw);
  const publicAccess={policies:{[key]:{visibility:'public'}}};
  const reader={...owner,profileId:'independent-reader',access:publicAccess};
  const fresh=new Builder({storage:()=>disk});
  await fresh.recover(reader);
  const recovered=ROOMS[placeId];
  assert.equal(recovered.visibility,'public');
  assert.equal(recovered.title,piece.block.title);
  assert.equal(recovered.substance.body,piece.block.body);
  assert.deepEqual(recovered.content,piece.block.content);
  assert.deepEqual(recovered.sources,piece.block.sources);
  assert.equal(recovered.backing_ref,piece.block.backing_ref);
  assert.equal(recovered.publishedAt,original.time);
  assert.equal(recovered.vouches,undefined);
  assert.deepEqual(recovered.builderStructure.recoveredFrom,{thing:target,publicationReceiptRef:'builder:'+original.hash,
    placementReceiptRef:'builder:'+placement.hash});
  assert.equal(builderHallPlacementFits(ROOMS[key],recovered),true);
  assert.equal(EDGES.find(edge=>edge.id===pathId).provenanceRef,'builder:'+placement.hash);
  assert.equal(ROOMS[key].blocks.some(block=>block.id===piece.id),false);
  assert.equal(disk.getItem(BUILDER_STORAGE),raw);

  reset();
  const reopened=new Builder({storage:()=>disk});
  const author={...owner,access:publicAccess};
  await reopened.recover(author);
  assert.deepEqual(ROOMS[placeId].layout,recovered.layout);
  assert.equal(disk.getItem(BUILDER_STORAGE),raw);
  await reopened.add(key,author,'bench');
  await publish(reopened,key,author);
  assert.deepEqual(ROOMS[placeId].layout,recovered.layout);
  assert.deepEqual(ROOMS[placeId].builderStructure.recoveredFrom,recovered.builderStructure.recoveredFrom);
  assert.equal(EDGES.filter(edge=>edge.id===pathId).length,1);
  const republished=JSON.parse(disk.getItem(BUILDER_STORAGE));
  assert.deepEqual(republished.receipts.slice(0,receipts.length),receipts);
  assert.ok((await verifyChain(republished.receipts)).valid);
});
