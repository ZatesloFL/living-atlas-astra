import {ROOMS,EDGES} from './data.js';
import {visiblePeople,memberOf} from './discovery.js';
import {identityBadge} from './identity.js';
export function drawSquare(w){
 w.floor(0,0,25,27,'#526d61');w.path(0,-1,3.6,25);w.path(0,-2,23,3.2);w.path(0,4,15,2.6);
 w.add('cylinder','stone',0,.18,-2,1.5,.36,1.5,'#b9b796');w.add('orb','teal',0,.8,-2,.18,.18,.18,'#fff','noticeboard');w.block(0,-2,3,3);
 for(const [x,z] of [[-10,9],[10,10],[-11,-10],[11,-10],[-3,-9],[3,-9]])w.tree(x,z,1.2,w.trees+410);
 for(const [x,z] of [[-2,5],[2,5],[-7,0],[7,0],[-3,-6],[3,-6]])w.lamp(x,z);
 for(const x of [-5,5]){w.box(x,.52,6,2.7,.18,.7,'#b8a17a');for(const dx of [-1,1])w.box(x+dx,.25,6,.14,.5,.6,'#667e73');w.block(x,6,2.7,.7);}
 for(const edge of EDGES.filter(e=>e.scene==='square'&&e.render!==false))w.edge(edge);
 // Context-only kiosk zones do not require extra transition meshes.
 for(const e of EDGES.filter(e=>e.scene==='square'&&e.render===false))w.edgeObjects.push({...e,result:w.gate(e)});
 if(w.lens.identity?.backing==='verified'&&memberOf('tallahassee-resident',w.lens)){w.box(-9,1.5,4,1.7,2.5,.18,'#587b71','wood','neighborhood-board');w.block(-9,4,1.8,.3);w.label('NEIGHBORS','VERIFIED RESIDENT BOARD',-9,3,4,'neighborhood-board');}
}
export function drawPresence(w){
 for(const [i,p] of visiblePeople(w.lens,{located:true}).entries()){
  const room=ROOMS[p.room];if(room.layout.scene!==w.kind||p.room==='guide')continue;const pos=p.offset??[1.5,2],x=room.layout.slot[0]+pos[0],z=room.layout.slot[1]+pos[1];if(!w.canStand(x,z))continue;
  w.add('orb','leaf',x,1.2,z,.16,.22,.16,p.author.isAgent&&!w.lens.show.agent?'#697c77':'#acc8b6','person:'+p.id);w.label(p.author.isAgent?'◇ '+p.name:p.name,identityBadge(p.author)+' · SIMULATED',x,1.85,z,'person:'+p.id,2.3,'#a3c7ba');
 }
}
