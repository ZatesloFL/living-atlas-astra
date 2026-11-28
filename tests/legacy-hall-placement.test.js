import assert from 'node:assert/strict';
import test from 'node:test';
import {materializeRecoveredBuilderHall} from '../src/builder-hall-recovery.js';
import {builderHallExteriorFootprint, builderHallPlacementFits, materializeBuilderHall} from '../src/builder-hall.js';
import {makeBuilderPiece} from '../src/builder-pieces.js';
import {scores} from '../src/scores.js';
import {sceneBounds} from '../src/world-bounds.js';

function starterParent() {
  return {id:'home/legacy-hall-holder',visibility:'public',district:'makers',
    layout:{scene:'home/legacy-hall-holder',slot:[0,0],scale:3.2,facing:0}};
}

function hallPiece(parent, position, yaw = 0, scale = 1) {
  const id = 'synthetic-legacy-hall';
  const piece = makeBuilderPiece('interior-shell',{id,placeId:parent.id,position,yaw,scale});
  piece.block = {id,title:'Legacy hall',body:'Authored notes',content:scores(),
    backing_ref:'same-backing',sources:[{sourceId:'same-source',itemId:'same-item'}]};
  return piece;
}

function approxPoint(actual, expected) {
  assert.equal(actual.length,2);
  assert.ok(actual.every((n,i)=>Math.abs(n-expected[i])<1e-10),
    `Coordinates ${actual} should match ${expected}`);
}

test('A legacy hall with valid geometry materializes unchanged',()=>{
  const parent = starterParent();
  const piece = hallPiece(parent,[-3,0,1]);
  const original = structuredClone({parent,piece});
  const expected = materializeBuilderHall(parent,piece,{visibility:'hidden'});
  assert.equal(builderHallPlacementFits(parent,expected.room),true);
  assert.deepEqual(materializeRecoveredBuilderHall(parent,piece,{visibility:'hidden'}),expected);
  assert.deepEqual({parent,piece},original);
});

test('Recovery translates a legacy hall to the nearest fit without touching its authored record',()=>{
  const parent = starterParent();
  const piece = hallPiece(parent,[7.5,0,-7.5]);
  const original = structuredClone({parent,piece});
  const native = materializeBuilderHall(parent,piece,{visibility:'hidden'});
  assert.equal(builderHallPlacementFits(parent,native.room),false);

  const migrated = materializeRecoveredBuilderHall(parent,piece,{visibility:'hidden'});
  const {layout} = migrated.room;
  const path = migrated.changes.find(change=>change.kind==='Path');
  assert.equal(builderHallPlacementFits(parent,migrated.room),true);
  approxPoint(layout.slot,[9.65,-15]);
  assert.deepEqual(layout.slot,layout.interior.frontage.door);
  assert.deepEqual(layout.slot,path.fields.position);
  assert.deepEqual(layout.approach,layout.interior.frontage.arrival);
  assert.deepEqual(layout.approach,path.fields.before);
  assert.deepEqual(layout.arrivals.door.position,layout.approach);
  assert.deepEqual(layout.arrivals.outside.position,layout.interior.frontage.outside);
  assert.deepEqual(layout.arrivals.inside,native.room.layout.arrivals.inside);
  assert.deepEqual(layout.interior.arrival,native.room.layout.interior.arrival);
  assert.deepEqual(layout.interior.exit,native.room.layout.interior.exit);
  assert.deepEqual(migrated.changes[0],native.changes[0]);
  assert.deepEqual({parent,piece},original);
  assert.deepEqual(materializeRecoveredBuilderHall(parent,piece,{visibility:'hidden'}),migrated);

  const oneAxis = hallPiece(parent,[-3,0,-7.5]);
  const beforeX = materializeBuilderHall(parent,oneAxis).room.layout.slot[0];
  assert.equal(materializeRecoveredBuilderHall(parent,oneAxis).room.layout.slot[0],beforeX);
});

test('A rotated footprint fits the existing interior rectangle with no change of direction or size',()=>{
  const base = starterParent();
  const enclosing = materializeBuilderHall(base,hallPiece(base,[-3,0,1])).room;
  const parent = {...enclosing,id:enclosing.placeId};
  const piece = hallPiece(parent,[10.5,0,10],Math.PI/3,1.2);
  const original = materializeBuilderHall(parent,piece).room;
  const migrated = materializeRecoveredBuilderHall(parent,piece).room;
  assert.equal(builderHallPlacementFits(parent,original),false);
  assert.equal(builderHallPlacementFits(parent,migrated),true);
  const {maxX,maxZ} = sceneBounds(migrated.layout.scene,parent.layout.interior);
  const footprint = builderHallExteriorFootprint(migrated);
  approxPoint([Math.max(...footprint.map(p=>p[0])),Math.max(...footprint.map(p=>p[1]))],[maxX,maxZ]);
  const moved = migrated.layout.interior.frontage;
  const unshifted = original.layout.interior.frontage;
  assert.equal(moved.facing,unshifted.facing);
  assert.equal(moved.width,unshifted.width);
  assert.equal(moved.depth,unshifted.depth);
  const delta = moved.door.map((n,i)=>n-unshifted.door[i]);
  for (const key of ['arrival','outside']) approxPoint(moved[key],unshifted[key].map((n,i)=>n+delta[i]));

  const narrowed = structuredClone(parent);
  narrowed.layout.interior.width=12;
  const tooWide = hallPiece(narrowed,[10.5,0,10],Math.PI/4,1.25);
  assert.throws(()=>materializeRecoveredBuilderHall(narrowed,tooWide),/footprint cannot fit/);
});
