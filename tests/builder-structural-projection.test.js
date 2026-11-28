import assert from 'node:assert/strict';
import test from 'node:test';
import {AccessStore} from '../src/access-store.js';
import {composeBuilderRoom, prepareBuilderStructures, registerProjection} from '../src/build-projection.js';
import {builderHallIdentity, materializeBuilderHall} from '../src/builder-hall.js';
import {makeBuilderPiece} from '../src/builder-pieces.js';
import {EDGES, PRESETS, ROOMS} from '../src/data.js';
import {exhibitSpace} from '../src/interior-kit.js';
import {spatialArrival, spatialRoute} from '../src/interior-space.js';
import {exhibitPlacement} from '../src/kit-placement.js';
import {graphEdges} from '../src/navigation.js';
import {roomVisible} from '../src/rules.js';
import {scores} from '../src/scores.js';

const reader = profileId => ({...structuredClone(PRESETS.Adult),profileId,age:30,
  show:{real:true,pseudonym:true,anonymous:true,agent:true},identity:{display:'pseudonym',backing:'verified'}});

function parentRoom(t) {
  const placeId = 'structure-test-' + crypto.randomUUID();
  const owner = reader(placeId + '-owner');
  registerProjection({projection:{schemaVersion:2,rootPlaceId:placeId,rooms:[
    {placeId,parentPlaceId:null,layout:{kind:'courtyard',scene:placeId},pathIds:[],pieces:[],behaviors:[]}
  ]},changes:[{op:'create',kind:'Place',ref:{placeId},fields:{title:'Synthetic courtyard',visibility:'hidden',content:scores()}}]},
  {ownerId:owner.profileId});
  t.after(()=>{
    for (const key of Object.keys(ROOMS)) if (key===placeId||key.startsWith(placeId+'/')) delete ROOMS[key];
    for (let i=EDGES.length-1;i>=0;i--) if (EDGES[i].id.startsWith(placeId+'/')) EDGES.splice(i,1);
  });
  return {placeId,owner,room:ROOMS[placeId]};
}

function hallPiece(parent, id='test-hall') {
  const piece = makeBuilderPiece('interior-shell',{placeId:parent.id,id,position:[-2,0,-3]});
  const content = scores();
  content.sensory={amount:2,graphicness:1};
  piece.block={id,title:'Synthetic Exhibit hall',type:'text',body:'Original hall notes',content,
    sources:[{sourceId:'synthetic-source',itemId:'synthetic-item'}],backing_ref:'synthetic-backing'};
  return piece;
}

test('A Builder hall stages one canonical Place and Path, and reprojection keeps their identities', async t=>{
  const {placeId:parentId,owner,room:parent} = parentRoom(t);
  const piece = hallPiece(parent);
  const {placeId,pathId} = builderHallIdentity(parent.id,piece.id);
  const authored = materializeBuilderHall(parent,piece);
  const staged = prepareBuilderStructures(parentId,parent,[authored]);
  assert.equal(ROOMS[placeId],undefined);
  assert.equal(EDGES.some(edge=>edge.id===pathId),false);
  assert.equal(staged.roomKeys.get(piece.id),placeId);
  assert.equal(staged.entries[placeId].ownerId,owner.profileId);
  assert.equal(staged.entries[placeId].parentPlaceId,parent.id);
  assert.deepEqual(staged.entries[placeId].content,piece.block.content);
  assert.deepEqual(staged.entries[placeId].sources,piece.block.sources);
  assert.equal(staged.entries[placeId].backing_ref,piece.block.backing_ref);
  const overlay = composeBuilderRoom(parent,[piece],{structuralPieceIds:staged.roomKeys});
  assert.deepEqual(overlay.kitPieces.at(-1).ref,{placeId});
  assert.equal(overlay.blocks.some(block=>block.id===piece.id),false);
  assert.equal(overlay.builderFixtures.some(fixture=>fixture.id===piece.id),false);
  assert.equal(composeBuilderRoom(parent,[piece]).blocks.at(-1).id,piece.id);

  staged.apply();
  prepareBuilderStructures(parentId,parent,[authored]).apply();
  assert.equal(EDGES.filter(edge=>edge.id===pathId).length,1);
  const path = graphEdges().find(edge=>edge.id===pathId);
  assert.equal(path.type,'door');
  assert.equal(path.from,parentId);
  assert.equal(path.to,placeId);
  assert.equal(ROOMS[placeId].parentPlaceId,parentId);
  assert.equal(path.destination,ROOMS[placeId].layout.interior.scene);
  assert.equal(spatialArrival(placeId,'inside').scene,path.destination);
  assert.equal(spatialArrival(placeId,'door').contextRoom,parentId);

  const disk = new Map();
  const access = new AccessStore(()=>({getItem:key=>disk.get(key)??null,setItem:(key,value)=>disk.set(key,value)}));
  const visitor = reader('synthetic-independent-visitor');
  assert.equal(roomVisible(placeId,access.lens(visitor)),false);
  assert.equal(spatialRoute(parentId,placeId,access.lens(visitor),parent.layout.scene,'inside'),null);
  assert.equal(roomVisible(placeId,access.lens(owner)),true);
  await access.policy(parentId,'public',owner);
  assert.equal(roomVisible(placeId,access.lens(visitor)),false);
  await access.policy(placeId,'public',owner);
  assert.equal(roomVisible(placeId,access.lens(visitor)),true);

  piece.transform.position=[3,0,-6];
  const moved = prepareBuilderStructures(parentId,parent,[materializeBuilderHall(parent,piece)]);
  assert.notDeepEqual(moved.paths[0].position,EDGES.find(edge=>edge.id===pathId).position);
  moved.apply();
  assert.equal(EDGES.filter(edge=>edge.id===pathId).length,1);
  assert.deepEqual(EDGES.find(edge=>edge.id===pathId).position,[3,-6]);
});

test('Collision and removal dependencies leave both live catalog collections intact', t=>{
  const {placeId:parentId,room:parent} = parentRoom(t);
  const piece = hallPiece(parent);
  const {placeId,pathId} = builderHallIdentity(parent.id,piece.id);
  const authored = materializeBuilderHall(parent,piece);
  const collision = structuredClone(authored);
  collision.room.layout.interior.scene=ROOMS.boycott.layout.interior.scene;
  assert.throws(()=>prepareBuilderStructures(parentId,parent,[collision]),/occupied interior scene/);
  const wrongHost = structuredClone(authored);
  wrongHost.changes.find(change=>change.kind==='Path').fields.host=ROOMS.square.id;
  assert.throws(()=>prepareBuilderStructures(parentId,parent,[wrongHost]),/containing door/);
  assert.equal(ROOMS[placeId],undefined);
  assert.equal(EDGES.some(edge=>edge.id===pathId),false);
  prepareBuilderStructures(parentId,parent,[authored]).apply();

  const live = ROOMS[placeId];
  const nested = materializeBuilderHall(live,hallPiece(live,'nested-hall'));
  prepareBuilderStructures(placeId,live,[nested]).apply();
  assert.throws(()=>prepareBuilderStructures(parentId,parent,[]),/rooms inside this hall/);
  const preview = prepareBuilderStructures(parentId,parent,[],{forPreview:true});
  assert.deepEqual(preview.entries,{});
  assert.deepEqual(preview.paths,[]);
  assert.equal(preview.apply,undefined);
  assert.equal(ROOMS[placeId],live);
  assert.ok(ROOMS[nested.room.placeId]);
  prepareBuilderStructures(placeId,live,[]).apply();

  const unrelated = {id:parentId+'/unrelated',from:'square',to:placeId};
  EDGES.push(unrelated);
  assert.throws(()=>prepareBuilderStructures(parentId,parent,[]),/separate Path attached/);
  assert.equal(ROOMS[placeId],live);
  assert.ok(EDGES.some(edge=>edge.id===pathId));
  EDGES.splice(EDGES.indexOf(unrelated),1);
  prepareBuilderStructures(parentId,parent,[]).apply();
  assert.equal(ROOMS[placeId],undefined);
  assert.equal(EDGES.some(edge=>edge.id===pathId),false);
  assert.equal(ROOMS[parentId],parent);
});

test('An authored exhibit uses its hall placement and existing bays retain canonical centers', t=>{
  const {placeId,room} = parentRoom(t);
  const staged = prepareBuilderStructures(placeId,room,[materializeBuilderHall(room,hallPiece(room))]);
  const interior = Object.values(staged.entries)[0];
  const screen = makeBuilderPiece('screen',{placeId:interior.id,id:'test-screen',position:[3,0,-2],yaw:.5});
  const authored = composeBuilderRoom(interior,[screen]);
  const layout = exhibitSpace(authored,1.25);
  const mounted = exhibitPlacement(layout,layout.components.find(component=>component.block===screen.id));
  assert.deepEqual(mounted.slot,[3,-2]);
  assert.equal(mounted.facing,.5);
  assert.equal(mounted.scale,1.25);
  const boycott = exhibitSpace(ROOMS.boycott);
  assert.equal(boycott.components.length,ROOMS.boycott.layout.interior.bays.length);
});
