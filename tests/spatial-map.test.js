import test from 'node:test';import assert from 'node:assert/strict';
import {atlasMapModel} from '../src/atlas-map-model.js';import {makeProfile} from '../src/profiles.js';import {ROOMS,PRESETS} from '../src/data.js';
import {scores,pair} from '../src/scores.js';
test('spatial Map preserves world placements and readable labels under the unverified Lens',()=>{
 const lens=makeProfile('Synthetic',{age:34,...structuredClone(PRESETS.Teen)}),m=atlasMapModel(lens,'square',{scene:'square',position:{x:1,z:2}}).spatial;
 assert.deepEqual(m.visitor.position,[1,2]);assert.equal(m.currentArea,'square');const square=m.nodes.find(n=>n.id==='square');assert.deepEqual(square.position,ROOMS.square.layout.slot);
 for(const area of m.areas){const labels=m.nodes.filter(n=>n.scene===area.id&&n.kind==='place').map(n=>n.label);assert(labels.every(Boolean));for(const [i,a] of labels.entries())for(const b of labels.slice(i+1))assert(!(a.x<b.x+b.w&&a.x+a.w>b.x&&a.y<b.y+b.h&&a.y+a.h>b.y),'labels overlap in '+area.title);}
});
test('map coordinates compose containing Place rotation and scale; withheld Things have no spatial marker',t=>{
 const lens=makeProfile('Synthetic',{age:34,...structuredClone(PRESETS.Teen)}),id='spatial-synthetic',r=ROOMS[id]={...structuredClone(ROOMS.studio),id,visibility:'public',layout:{...ROOMS.studio.layout,slot:[10,20],facing:Math.PI/2,scale:2,components:[]},versions:undefined,blocks:[{id:'mark',title:'Synthetic positioned Thing',body:'Synthetic',type:'text',importance:'core',content:scores()}],builderFixtures:[{block:'mark',position:[3,-2]}]};t.after(()=>delete ROOMS[id]);
 let m=atlasMapModel(lens,'square').spatial,n=m.nodes.find(n=>n.room===id&&n.id==='mark');assert(Math.abs(n.position[0]-6)<1e-8);assert(Math.abs(n.position[1]-14)<1e-8);r.builderFixtures[0].position=[0,1];n=atlasMapModel(lens,'square').spatial.nodes.find(n=>n.room===id&&n.id==='mark');assert.deepEqual(n.position,[12,20]);r.blocks[0].content=scores({violence:pair(3,3)});assert(!atlasMapModel(lens,'square').spatial.nodes.some(n=>n.room===id&&n.id==='mark'));
});
