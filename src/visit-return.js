import {VISITOR_EYE,inEnteredPlace} from './visitor-viewpoint.js';
// Return is a local teleport, not a walk along a straight line through other zones.
export function entranceSpot(world,scope,entry){
 if(!entry||entry.room!==scope.room||entry.scene!==scope.scene)return null;
 const [x,,z]=entry.position,candidates=[[x,z]];
 for(const r of [.4,.8,1.2,1.6,2,3,4,6,8,12,16,24,32,48,64])for(let i=0;i<16;i++)candidates.push([x+Math.sin(i*Math.PI/8)*r,z+Math.cos(i*Math.PI/8)*r]);
 for(const [px,pz] of candidates)if(inEnteredPlace(world,scope,px,pz)&&world.canStand(px,pz))return {position:[px,VISITOR_EYE,pz],yaw:entry.yaw,adjusted:px!==x||pz!==z};
 return null;
}
