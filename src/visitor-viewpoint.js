import {ROOMS} from './data.js';
import {permission,personId} from './permissions.js';
import {roomVisible} from './rules.js';

export const VISITOR_EYE=1.88,DEFAULT_CEILING=8;
export function viewpointCeiling(room){
 const height=room?.layout?.interior?.height??room?.layout?.ceiling??DEFAULT_CEILING;
 return Math.max(VISITOR_EYE,Number.isFinite(height)?height-.25:DEFAULT_CEILING-.25);
}
export function inEnteredPlace(world,scope,x,z){
 if(!scope||scope.holder&&scope.holder!==personId(world.lens)||scope.scene!==world.kind||!Number.isFinite(x)||!Number.isFinite(z)||!world.withinBounds(x,z))return false;
 const room=ROOMS[scope.room];if(!room||!permission(room,world.lens).canEnter||!roomVisible(scope.room,world.lens))return false;
 if(world.hall)return world.hall===scope.room;
 // Physical zones still exist when their contents are hidden by the Lens.
 // Some embedded Places do not drive the location label; their boundaries still bind.
 if(world.edgeObjects.some(e=>!(e.contextPriority>=0)&&e.zone&&e.to!==scope.room&&world.zone(e,x,z)))return false;
 const zone=[...world.edgeObjects].filter(e=>e.contextPriority>=0).sort((a,b)=>a.contextPriority-b.contextPriority).find(e=>world.zone(e,x,z));
 if(zone&&zone.to!==scope.room)return false;
 for(const r of Object.values(ROOMS)){
  const h=r.layout?.scene===world.kind&&r.layout.interior;if(!h)continue;
  const f=h.frontage;if(Math.abs(x-f.door[0])<f.width/2+.25&&z<f.door[1]+.25&&z>f.door[1]-f.depth-.25)return false;
 }
 if(zone?.to===scope.room||room.layout.root)return true;
 // Legacy embedded Places without a zone retain their entered approach only.
 return !!scope.anchor&&Math.hypot(x-scope.anchor[0],z-scope.anchor[1])<=1.75;
}
export function crossesDoor(world,a,b){
 return world.edgeObjects.some(e=>{
  if(e.result?.type==='seamless'&&!e.destination&&!e.interior&&!e.interiorExit)return false;
  const across=e.axis==='x',v=across?0:2,u=across?2:0,p=across?e.position[0]:e.position[1],center=across?e.position[1]:e.position[0];
  if((a[v]-p)*(b[v]-p)>0||Math.abs(b[v]-a[v])<1e-8)return false;
  const t=(p-a[v])/(b[v]-a[v]);return t>=0&&t<=1&&Math.abs(a[u]+(b[u]-a[u])*t-center)<1.9;
 });
}
export function airPointAllowed(world,scope,p){
 const [x,y,z]=p;if(!inEnteredPlace(world,scope,x,z)||!Number.isFinite(y)||y<VISITOR_EYE||y>viewpointCeiling(ROOMS[scope.room]))return false;
 return !(world.solids??[]).some(b=>x+.22>b.min.x&&x-.22<b.max.x&&z+.22>b.min.z&&z-.22<b.max.z&&y+.12>b.min.y&&y-VISITOR_EYE+.22<b.max.y);
}
export function airStepAllowed(world,scope,a,b){
 if(crossesDoor(world,a,b))return false;
 const steps=Math.max(1,Math.ceil(Math.hypot(...b.map((v,i)=>v-a[i]))/.12));
 for(let i=1;i<=steps;i++)if(!airPointAllowed(world,scope,b.map((v,j)=>a[j]+(v-a[j])*i/steps)))return false;
 return true;
}
export function localSegment(world,scope,a,b){
 if(crossesDoor(world,a,b))return false;
 const n=Math.max(1,Math.ceil(Math.hypot(b[0]-a[0],b[2]-a[2])/.15));
 for(let i=0;i<=n;i++)if(!inEnteredPlace(world,scope,a[0]+(b[0]-a[0])*i/n,a[2]+(b[2]-a[2])*i/n))return false;
 return true;
}
export function landingSpot(world,scope,position){
 const candidates=[[position[0],position[2]]];
 for(const radius of [.4,.8,1.2,1.6])for(let i=0;i<16;i++)candidates.push([position[0]+Math.sin(i*Math.PI/8)*radius,position[2]+Math.cos(i*Math.PI/8)*radius]);
 for(const [x,z] of candidates){const above=[x,position[1],z],ground=[x,VISITOR_EYE,z];
  if(world.canStand(x,z)&&airStepAllowed(world,scope,position,above)&&airStepAllowed(world,scope,above,ground))return ground;
 }
 return null;
}
export function viewingSpot(world,scope,frame,position){
 const direction=[Math.sin(frame.facing),Math.cos(frame.facing)],side=[direction[1],-direction[0]],bounds=frame.bounds;
 const reach=Math.abs(direction[0])*(bounds.max.x-bounds.min.x)/2+Math.abs(direction[1])*(bounds.max.z-bounds.min.z)/2;
 const center=[(bounds.min.x+bounds.max.x)/2,(bounds.min.z+bounds.max.z)/2];
 for(const gap of [.9,1.5,2.3,3.2])for(const offset of [0,-.8,.8,-1.6,1.6]){
  const x=center[0]+direction[0]*(reach+gap)+side[0]*offset,z=center[1]+direction[1]*(reach+gap)+side[1]*offset,target=[x,VISITOR_EYE,z];
  if(world.canStand(x,z)&&localSegment(world,scope,position,target))return {position:target,yaw:Math.atan2(x-center[0],z-center[1]),pitch:Math.atan2(Math.min(2.5,(bounds.min.y+bounds.max.y)/2)-VISITOR_EYE,Math.hypot(x-center[0],z-center[1]))};
 }
 return null;
}
