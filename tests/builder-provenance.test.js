import assert from 'node:assert/strict';
import test from 'node:test';
import {AccessStore} from '../src/access-store.js';
import {Builder, BUILDER_STORAGE} from '../src/builder.js';
import {registerProjection} from '../src/build-projection.js';
import {EDGES, PRESETS, ROOMS} from '../src/data.js';
import {queryIndex} from '../src/discovery-index.js';
import {verifyChain} from '../src/ledger.js';
import {scores} from '../src/scores.js';

const reader = (profileId, extra = {}) => ({
  ...structuredClone(PRESETS.Adult), profileId, age:30, playAs:'visitor', depth:'Deep',
  show:{real:true,pseudonym:true,anonymous:true,agent:true},
  identity:{display:'pseudonym',backing:'verified'}, ...extra
});

function fixture(t) {
  const roomKey = 'provenance-test-' + crypto.randomUUID();
  const ownerId = roomKey + '-owner';
  const original = {
    id:'old-record', title:'Lantern in a historical seed', type:'text',
    importance:'core', body:'Preserved existing text', content:scores(),
    source:{sourceId:'original-source',itemId:'original-item',url:null,syncedAt:null,rights:'Fixed'},
    standing:{declarationRef:{versionId:'source-version',receiptRef:'source-declaration-receipt'}}
  };
  registerProjection({
    projection:{schemaVersion:2,rootPlaceId:roomKey,
      rooms:[{placeId:roomKey,parentPlaceId:null,layout:{kind:'courtyard'},pathIds:[],pieces:[],behaviors:[]}]},
    changes:[{op:'create',kind:'Place',ref:{placeId:roomKey},
      fields:{title:'Lantern study Place',visibility:'public',content:scores(),blocks:[original]}}]
  },{ownerId});
  const edge = {id:roomKey,from:'square',to:roomKey,type:'door',scene:'square',position:[2,2]};
  EDGES.push(edge);
  t.after(()=>{
    delete ROOMS[roomKey];
    EDGES.splice(EDGES.indexOf(edge),1);
  });
  const memory = new Map();
  const storage = ()=>({getItem:key=>memory.get(key)??null,setItem:(key,value)=>memory.set(key,value)});
  const access = new AccessStore(storage);
  return {roomKey,ownerId,original,base:ROOMS[roomKey],builder:new Builder({storage}),storage,
    disk:()=>JSON.parse(memory.get(BUILDER_STORAGE)),access,
    owner:reader(ownerId),visitor:reader(roomKey+'-visitor')};
}

async function publish({builder,roomKey,owner}, definition = null) {
  let pieceId;
  if (definition) {
    const draft = await builder.add(roomKey,owner,definition);
    pieceId = draft.pieces.at(-1).id;
  }
  await builder.preview(roomKey,owner,owner);
  const result = await builder.publish(roomKey,owner);
  return {...result,pieceId};
}

const resultFor = (lens, roomKey, thingId = null) => queryIndex(lens).results.find(entry=>
  entry.room===roomKey && (thingId ? entry.type==='thing'&&entry.target===thingId : entry.type==='room'));

test('Discovery reads actual Builder publication times while legacy and draft metadata remain missing', async t=>{
  const f = fixture(t);
  assert.equal(resultFor(f.visitor,f.roomKey).publishedAt,null);
  assert.equal(resultFor(f.visitor,f.roomKey,f.original.id).publishedAt,null);
  const staged = await f.builder.add(f.roomKey,f.owner,'lantern');
  const thingId = staged.pieces[0].id;
  assert.equal(resultFor(f.visitor,f.roomKey,thingId),undefined);
  assert.equal(f.builder.roomFor(f.roomKey,f.owner).blocks.at(-1).publishedAt,undefined);

  const first = await publish(f);
  assert.equal(resultFor(f.visitor,f.roomKey).publishedAt,Date.parse(first.receipt.time));
  assert.equal(resultFor(f.visitor,f.roomKey,thingId).publishedAt,Date.parse(first.receipt.time));
  assert.equal(resultFor(f.visitor,f.roomKey,thingId).vouches,null);
  assert.equal(resultFor(f.visitor,f.roomKey,f.original.id).publishedAt,null);
  assert.equal(resultFor(f.visitor,f.roomKey,f.original.id).vouches,null);
  assert.deepEqual(ROOMS[f.roomKey].blocks.find(block=>block.id===f.original.id).standing,f.original.standing);
  assert.deepEqual(ROOMS[f.roomKey].blocks.find(block=>block.id===f.original.id).source,f.original.source);

  const before = ROOMS[f.roomKey].blocks.at(-1);
  await f.builder.update(f.roomKey,f.owner,thingId,{transform:{position:[2,0,3]}});
  const second = await publish(f);
  assert.equal(ROOMS[f.roomKey].publishedAt,second.receipt.time);
  assert.equal(ROOMS[f.roomKey].blocks.at(-1).recordVersionId,before.recordVersionId);
  assert.equal(ROOMS[f.roomKey].blocks.at(-1).publishedAt,first.receipt.time);
  assert.equal(second.draft.pieces.at(-1).block.publishedAt,undefined);
  const newest = queryIndex(f.visitor,{words:'lantern',sort:'newest'}).results.filter(entry=>entry.room===f.roomKey);
  assert.equal(newest.at(-1).target,f.original.id);

  ROOMS[f.roomKey] = f.base;
  await new Builder({storage:f.storage}).recover(f.owner);
  assert.equal(ROOMS[f.roomKey].publishedAt,second.receipt.time);
  assert.equal(ROOMS[f.roomKey].blocks.at(-1).publishedAt,first.receipt.time);
});

test('Distinct people vouch for an exact record version and Discovery consumes the derived count', async t=>{
  const f = fixture(t);
  const {pieceId,receipt} = await publish(f,'lantern');
  const first = await f.builder.vouch(f.roomKey,f.visitor,{thingId:pieceId});
  assert.deepEqual(await f.builder.vouch(f.roomKey,f.visitor,{thingId:pieceId}),first);
  assert.equal(first.target.versionId,ROOMS[f.roomKey].blocks.at(-1).recordVersionId);
  const secondReader = reader(f.roomKey+'-second-visitor');
  await f.builder.vouch(f.roomKey,secondReader,{thingId:pieceId});
  await f.builder.vouch(f.roomKey,f.visitor);
  const vouched = queryIndex(f.visitor,{words:'lantern',sort:'vouched'}).results
    .filter(entry=>entry.room===f.roomKey);
  assert.deepEqual(vouched.map(({type,vouches})=>[type,vouches]),[['thing',2],['room',1],['thing',null]]);
  assert.equal(f.builder.open(f.roomKey,f.owner).pieces[0].block.vouches,undefined);
  const receipts = f.disk().receipts;
  const recorded = receipts.filter(entry=>entry.action==='build_vouched');
  assert.equal(recorded.length,3);
  assert.equal(recorded[0].diff.publicationReceiptRef,receipt.id);
  assert.equal((await verifyChain(receipts)).valid,true);

  ROOMS[f.roomKey] = f.base;
  const recovered = new Builder({storage:f.storage});
  await recovered.recover(f.owner);
  assert.equal(resultFor(f.visitor,f.roomKey,pieceId).vouches,2);
  await recovered.update(f.roomKey,f.owner,pieceId,{transform:{position:[3,0,4]}});
  await publish({...f,builder:recovered});
  assert.equal(resultFor(f.visitor,f.roomKey).vouches,null);
  assert.equal(resultFor(f.visitor,f.roomKey,pieceId).vouches,2);
  await recovered.update(f.roomKey,f.owner,pieceId,{block:{title:'A newly authored lantern'}});
  const changed = await publish({...f,builder:recovered});
  assert.equal(resultFor(f.visitor,f.roomKey,pieceId).publishedAt,Date.parse(changed.receipt.time));
  assert.equal(resultFor(f.visitor,f.roomKey,pieceId).vouches,null);
  const newVouch = await recovered.vouch(f.roomKey,f.visitor,{thingId:pieceId});
  assert.notEqual(newVouch.target.versionId,first.target.versionId);
  assert.equal(resultFor(f.visitor,f.roomKey,pieceId).vouches,1);
});

test('Vouches observe live permissions, presentation, author independence, and publication evidence', async t=>{
  const f = fixture(t);
  const {pieceId} = await publish(f,'lantern');
  await assert.rejects(f.builder.vouch(f.roomKey,f.owner),/independent/);
  await assert.rejects(f.builder.vouch(f.roomKey,{...f.visitor,preview:true}),/verified person/);
  await assert.rejects(f.builder.vouch(f.roomKey,{...f.visitor,isAgent:true}),/verified person/);
  await assert.rejects(f.builder.vouch(f.roomKey,reader(f.visitor.profileId,
    {identity:{display:'anonymous',backing:'verified'}})),/verified person/);
  await assert.rejects(f.builder.vouch(f.roomKey,reader(f.visitor.profileId,
    {identity:{display:'pseudonym',backing:'none'}})),/verified person/);
  await assert.rejects(f.builder.vouch(f.roomKey,f.visitor,{thingId:f.original.id}),/no Builder publication Receipt/);

  const readOnly = await f.access.grant(f.roomKey,{person:f.visitor.profileId},'look',null,f.owner);
  await assert.rejects(f.builder.vouch(f.roomKey,f.access.lens(f.visitor)),/public record you can read or enter/);
  await f.builder.vouch(f.roomKey,f.access.lens(f.visitor),{thingId:pieceId});
  await f.access.revoke(readOnly.id,f.owner);
  await f.access.policy(f.roomKey,'hidden',f.owner);
  await assert.rejects(f.builder.vouch(f.roomKey,f.access.lens(f.visitor)),/public record you can read or enter/);
  assert.equal(resultFor(f.access.lens(f.visitor),f.roomKey),undefined);
  assert.equal(f.disk().receipts.filter(entry=>entry.action==='build_vouched').length,1);
});
