import test from 'node:test';
import assert from 'node:assert/strict';
import {builderHallIdentity, builderHallPlacementFits, materializeBuilderHall, validateBuilderHallPlacement} from '../src/builder-hall.js';
import {makeBuilderPiece} from '../src/builder-pieces.js';
import {ROOMS, EDGES, PRESETS} from '../src/data.js';
import {hallEntry, hallExit, hallExteriorFallback, spatialArrival, spatialRoute} from '../src/interior-space.js';
import {manualDestination} from '../src/atlas-destinations.js';
import {roomVisible} from '../src/rules.js';
import {scores} from '../src/scores.js';

const parentFixture = id => ({id, address:'local/'+id, district:'makers', visibility:'public', ownerId:'synthetic-owner',
  title:'Synthetic parent', content:scores(), minAge:0, blocks:[],
  layout:{kind:'booth',root:true,scene:id,slot:[4,-2],scale:3,facing:Math.PI/2,
    arrivals:{inside:{position:[4,0],facing:0}}}});

function hallPiece(parent,id,transform={}) {
  const piece=makeBuilderPiece('interior-shell',{placeId:parent.id,id,...transform});
  piece.block={id,title:'Synthetic ' + id,body:'Independent hall reading',content:scores({sensory:{amount:1,graphicness:0}}),
    backing_ref:null,sources:[]};
  return piece;
}

test('Exhibit hall material has a stable Place and doorstep in its containing frame',()=>{
  const parent=parentFixture('hall-test/workshop');
  const piece=hallPiece(parent,'framed',{position:[2,0,-1],yaw:Math.PI/4});
  const first=materializeBuilderHall(parent,piece);
  const {placeId,pathId}=builderHallIdentity(parent.id,piece.id);
  const [place,path]=first.changes;
  const {layout}=first.room;
  assert.deepEqual(place.ref,{placeId});
  assert.deepEqual(path.ref,{pathId});
  assert.equal(layout.scene,parent.layout.scene);
  assert.equal(layout.interior.edge,pathId);
  assert.equal(layout.interior.parent,parent.id);
  assert.equal(layout.interior.frontage.facing,3*Math.PI/4);
  assert.ok(Math.hypot(layout.slot[0]-1,layout.slot[1]+8)<1e-8);
  assert.equal(path.fields.type,'door');
  assert.deepEqual(path.fields.position,layout.interior.frontage.door);
  assert.deepEqual(path.fields.before,layout.interior.frontage.arrival);
  assert.deepEqual(place.fields.content,piece.block.content);
  assert.deepEqual(place.fields.standing.measurementRecordsRef.subject,{placeId});
  assert.deepEqual(place.fields.standing.declarationRecordReadingRef.subject,{placeId});
  assert.deepEqual(place.fields.blocks,[]);
  assert.deepEqual(layout.arrivals.inside,layout.interior.arrival);
  assert.equal(layout.interior.height,4.8);

  piece.transform.position=[-1,0,1];
  piece.block.title='New hall title';
  const moved=materializeBuilderHall(parent,piece);
  assert.equal(moved.room.placeId,first.room.placeId);
  assert.equal(moved.room.layout.interior.scene,layout.interior.scene);
  assert.deepEqual(moved.changes[1].ref,path.ref);
  assert.notDeepEqual(moved.room.layout.slot,layout.slot);
  assert.equal(moved.changes[0].fields.title,'New hall title');
  assert.notEqual(materializeBuilderHall(parentFixture('hall-test-workshop'),
    hallPiece(parentFixture('hall-test-workshop'),'framed')).room.layout.interior.scene,layout.interior.scene);
});

test('publish placement uses the walking limits of its containing scene and hall',()=>{
  const parent=parentFixture('hall-check-placement');
  parent.layout.slot=[0,0];
  parent.layout.facing=0;
  parent.layout.scale=3.2;
  const valid=materializeBuilderHall(parent,hallPiece(parent,'valid',{position:[-3,0,1]})).room;
  const beyond=materializeBuilderHall(parent,hallPiece(parent,'beyond',{position:[7.5,0,-4]})).room;
  assert.equal(builderHallPlacementFits(parent,valid),true);
  assert.equal(builderHallPlacementFits(parent,beyond),false);
  assert.throws(()=>validateBuilderHallPlacement(parent,beyond),/frontage and arrival points fit/);
  const child={...valid,id:valid.placeId,district:parent.district};
  const nested=materializeBuilderHall(child,hallPiece(child,'nested',{position:[4,0,-2]})).room;
  const roofOverhang=materializeBuilderHall(child,hallPiece(child,'too-wide',{position:[6,0,-2]})).room;
  assert.doesNotThrow(()=>validateBuilderHallPlacement(child,nested));
  assert.equal(builderHallPlacementFits(child,roofOverhang),false);
});

test('nested halls use the approved parent and their own doors in both directions',()=>{
  const added=[];
  const originalPathCount=EDGES.length;
  function mount(parent,piece){
    const {room,changes:[place,path]}=materializeBuilderHall(parent,piece);
    const builderStructure={parentPlaceId:parent.id,pieceId:piece.id};
    const record={...place.fields,id:room.placeId,address:'local/'+room.placeId,parentPlaceId:parent.id,ownerId:parent.ownerId,
      builderStructure,layout:room.layout,minAge:0};
    ROOMS[record.id]=record;
    EDGES.push({...path.fields,builderStructure,id:path.ref.pathId,scene:room.layout.scene});
    added.push(record.id);
    return record;
  }
  const parent=parentFixture('hall-route-fixture');
  const visitor={...structuredClone(PRESETS.Adult),profileId:'hall-test-visitor',age:36,testMode:true,
    show:{},identity:{display:'real',backing:'verified'}};
  try{
    ROOMS[parent.id]=parent;
    added.push(parent.id);
    EDGES.push({id:'unit-square-hall-root',from:'square',to:parent.id,type:'door',scene:'square',position:[0,0]});
    const child=mount(parent,hallPiece(parent,'outer'));
    const nested=mount(child,hallPiece(child,'inner',{position:[4,0,-2]}));
    assert.equal(nested.layout.scene,child.layout.interior.scene);
    assert.deepEqual(nested.layout.slot,[4,-2]);
    const [entryX,entryZ]=hallEntry(nested.id).before;
    assert.equal(entryX,4);
    assert.ok(Math.abs(entryZ-.7)<1e-8);
    assert.deepEqual(spatialArrival(nested.id,'inside').position,[0,8.4]);
    assert.equal(spatialArrival(nested.id,'door').contextRoom,child.id);
    assert.equal(spatialArrival(nested.id,'door').facing,0);
    assert.equal(hallExit(nested.id).destination,child.layout.interior.scene);

    EDGES.push({id:'unit-rejected-hall-shortcut',from:'square',to:nested.id,type:'door',scene:'square',position:[0,0]});
    const entry=spatialRoute('square',nested.id,visitor,'square','inside');
    assert.deepEqual(entry.map(path=>path.id),['unit-square-hall-root',hallEntry(child.id).id,hallEntry(nested.id).id]);
    const back=spatialRoute(nested.id,parent.id,visitor,nested.layout.interior.scene,'inside');
    assert.deepEqual(back.map(path=>path.id),[hallExit(nested.id).id,hallExit(child.id).id]);
    assert.equal(roomVisible(nested.id,visitor),true);
    assert.equal(manualDestination(nested.id,visitor,'square').ok,true);
    assert.deepEqual(hallExteriorFallback(nested.id,visitor),{...spatialArrival(nested.id,'door'),room:child.id});

    child.visibility='hidden';
    assert.deepEqual(hallExteriorFallback(nested.id,visitor),spatialArrival(parent.id,'inside'));
    child.visibility='public';

    parent.visibility='hidden';
    assert.equal(roomVisible(nested.id,visitor),false);
    assert.equal(manualDestination(nested.id,visitor,'square').ok,false);
    assert.equal(spatialRoute('square',nested.id,visitor,'square','inside'),null);
    const invited={...visitor,access:{grants:[{id:'unit-parent-access',room:parent.id,scope:'enter',to:{person:visitor.profileId}}]}};
    const lookOnly={...invited,access:{grants:[{...invited.access.grants[0],scope:'look'}]}};
    assert.deepEqual(hallExteriorFallback(nested.id,visitor),spatialArrival('square','inside'));
    assert.deepEqual(hallExteriorFallback(nested.id,lookOnly),spatialArrival('square','inside'));
    assert.deepEqual(hallExteriorFallback(nested.id,invited),{...spatialArrival(nested.id,'door'),room:child.id});
    assert.equal(manualDestination(nested.id,invited,'square').ok,true);
    assert.deepEqual(spatialRoute('square',nested.id,invited,'square','inside').map(path=>path.id),entry.map(path=>path.id));
  }finally{
    for(const id of added)delete ROOMS[id];
    EDGES.splice(originalPathCount);
  }
});

test('Seeded hall ejection uses the existing exterior geometry',()=>{
  assert.deepEqual(hallExteriorFallback('boycott',{}),spatialArrival('boycott','door'));
});
