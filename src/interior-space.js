import {ROOMS,EDGES} from './data.js';
import {planRoute} from './travel-plan.js';
export function hallRoom(scene){return Object.keys(ROOMS).find(id=>ROOMS[id].layout.interior?.scene===scene);}
export function hallEntry(id){
 const r=ROOMS[id],h=r?.layout.interior;if(!h)return null;
 const path=EDGES.find(e=>e.id===h.edge);if(!path)return null;
 return {...path,type:'door',position:h.frontage.door,before:h.frontage.arrival,zone:undefined,contextPriority:-1,interior:id,destination:h.scene};
}
export function hallExit(id){
 const r=ROOMS[id],h=r.layout.interior;
 return {id:'hall-exit:'+id,from:id,to:h.parent,type:'door',scene:h.scene,position:h.exit,before:[h.exit[0],h.exit[1]-1.7],interiorExit:id,destination:r.layout.scene,contextPriority:-1};
}
function throughHallDoor(edge){
 const origin=ROOMS[edge.from],target=ROOMS[edge.to];
 if(!origin?.builderStructure&&!target?.builderStructure)return true;
 const from=origin?.layout.interior,to=target?.layout.interior;
 return edge.id===to?.edge||from?.parent===edge.to&&edge.originalId===from.edge;
}
export function spatialRoute(from,target,lens,scene,choice){
 const options={passable:throughHallDoor},initial=planRoute(from,target,lens,options);if(!initial)return null;
 const current=hallRoom(scene),h=ROOMS[target]?.layout.interior;
 if(current===target&&choice!=='inside')return [hallExit(current)];
 // Outside/Door arrival ends in the public parent, before the hall's terms.
 const route=h&&choice!=='inside'?planRoute(from,h.parent,lens,options):initial;if(!route)return null;
 const result=route.map(e=>{
  const fromHall=ROOMS[e.from]?.layout.interior,entry=hallEntry(e.to);
  if(fromHall&&e.originalId===fromHall.edge&&e.to===fromHall.parent)return hallExit(e.from);
  return entry?.id===e.id?entry:e;
 });
 if(h&&choice==='inside'&&current!==target&&!result.some(e=>e.interior===target)){
  const entry=hallEntry(target);if(!entry)return null;
  result.push(entry);
 }
 return result;
}
export function spatialArrival(id,choice){
 const r=ROOMS[id],h=r.layout.interior;
 if(!h)return {room:id,scene:r.layout.scene,...r.layout.arrivals[choice],choice};
 const p=choice==='door'?h.frontage.arrival:h.frontage.outside;
 return choice==='inside'?{room:id,scene:h.scene,...h.arrival,choice}:{room:id,contextRoom:h.parent,scene:r.layout.scene,position:p,facing:h.frontage.facing??Math.atan2(p[0]-h.frontage.door[0],p[1]-h.frontage.door[1]),choice};
}
