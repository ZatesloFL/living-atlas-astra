import test from 'node:test';
import assert from 'node:assert/strict';
import {ROOMS,EDGES} from '../src/data.js';
import {defineInterior,exhibitSpace} from '../src/interior-kit.js';
import {hallEntry,hallExit,hallRoom,spatialArrival,spatialRoute} from '../src/interior-space.js';
import {travelPlan} from '../src/travel-plan.js';
import {exhibitPlacement} from '../src/kit-placement.js';
import {seedProfiles} from '../src/profiles.js';
import {viewRoom} from '../src/audience.js';
import {selectContent} from '../src/content.js';
const lens=()=>seedProfiles().find(p=>p.id==='seed-visitor');
const room=ROOMS.boycott,h=room.layout.interior;
test('An interior adds a spatial door without changing the Place graph or reading layout',()=>{
 assert.equal(room.id,'tallahassee/1956');assert.equal(room.layout.scene,'history');
 assert.equal(EDGES.find(e=>e.id===h.edge).type,'seamless');assert.equal(hallEntry('boycott').type,'door');
 assert.equal(hallRoom(h.scene),'boycott');assert.equal(hallExit('boycott').to,'tallahassee');
 assert.deepEqual(spatialArrival('boycott','inside').position,h.arrival.position);
 for(const choice of ['outside','door']){const a=spatialArrival('boycott',choice);assert.equal(a.scene,'history');assert.equal(a.contextRoom,'tallahassee');}
 const baseline=travelPlan('studio','boycott',lens());assert.deepEqual(baseline.rows.map(r=>r.edge.id),['city-boycott']);
});
test('Inside entry agrees to the hall’s age term; Door arrival and the ordinary exit need no review',()=>{
 const l=lens(),route=spatialRoute('tallahassee','boycott',l,'history','inside');
 assert.equal(travelPlan('tallahassee','boycott',l,{route}).ready,false);
 assert.equal(travelPlan('tallahassee','boycott',l,{route,confirmed:new Set([h.edge])}).ready,true);
 const outside=spatialRoute('tallahassee','boycott',l,'history','door');assert.equal(travelPlan('tallahassee','boycott',l,{route:outside}).ready,true);
 const exit=spatialRoute('boycott','boycott',l,h.scene,'door');assert.deepEqual(exit.map(e=>e.to),['tallahassee']);assert.equal(travelPlan('boycott','boycott',l,{route:exit}).ready,true);
 l.show.real=false;assert.equal(spatialRoute('tallahassee','boycott',l,'history','inside'),null);
});
test('Each audience retains its exhibits; fixture Style changes do not move bay centers',()=>{
 for(const [id,count] of [['seed-child',3],['seed-visitor',5]]){
  const l=seedProfiles().find(p=>p.id===id),r=viewRoom(room,l);assert.equal(selectContent(r,l).blocks.filter(b=>b.exhibit).length,count);
  for(const scale of [.7,1,1.25]){const layout=exhibitSpace(r,scale);for(const b of h.bays){const c=layout.components.find(c=>c.block===b.block);const placed=exhibitPlacement(layout,c);assert.ok(Math.hypot(...placed.slot.map((n,i)=>n-b.position[i]))<1e-9);assert.equal(placed.facing,b.facing);}}
 }
});
test('The bounded kit can attach to another Place without replacing its exhibit data',()=>{
 const source=structuredClone(room),copy=structuredClone(source),spec=structuredClone(h);spec.scene='hall:another-place';spec.parent='studio';spec.edge='sample-entry';
 copy.layout.interior=defineInterior(spec);assert.deepEqual(copy.blocks,source.blocks);assert.equal(exhibitSpace(copy).scene,'hall:another-place');assert.deepEqual(exhibitSpace(copy).components,exhibitSpace(room).components);
 for(const mutate of [s=>s.width=200,s=>s.bays.push(s.bays[0]),s=>s.bays[0].position=[100,0],s=>s.bays[0].approach=[0,100],s=>s.bays[0].label[1]=100,s=>s.frontage.depth=100]){const invalid=structuredClone(h);mutate(invalid);assert.throws(()=>defineInterior(invalid));}
});
