import {ROOMS} from './data.js';
import {VISITOR_EYE,airPointAllowed,localSegment} from './visitor-viewpoint.js';
// Check rendered solids as well as walk colliders: roof overhangs and scaled
// fixtures can intersect the visitor even when their ground collider is clear.
export function safeArrivalPosition(world,arrival){
 const [x,z]=arrival.position,room=arrival.contextRoom??(arrival.choice==='inside'?arrival.room:world.context(x,z).room),scope={room,scene:world.kind,anchor:[x,z]};
 const clear=(a,b)=>world.canStand(a,b)&&airPointAllowed(world,scope,[a,VISITOR_EYE,b]);
 if(clear(x,z))return [x,z];
 for(let radius=.35;radius<=4;radius+=.35)for(const angle of [0,-Math.PI/8,Math.PI/8,-Math.PI/4,Math.PI/4,-Math.PI/2,Math.PI/2,Math.PI]){
  const facing=arrival.facing+angle,a=x+Math.sin(facing)*radius,b=z+Math.cos(facing)*radius;
  if(clear(a,b)&&localSegment(world,scope,[x,VISITOR_EYE,z],[a,VISITOR_EYE,b]))return [a,b];
 }
 throw new Error('No clear arrival spot is available in '+(ROOMS[arrival.room]?.title??'this Place')+'. Nothing has been crossed.');
}
