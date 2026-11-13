import {ROOMS,EDGES} from './data.js';
import {visibleEdge} from './rules.js';
import {permission} from './permissions.js';
export function graphEdges(){
 const all=[...EDGES];
 for(const [id,r] of Object.entries(ROOMS))if(!r.layout?.root&&!all.some(e=>e.to===id))all.push({id:'local-'+id,from:r.layout.scene==='square'?'square':r.layout.scene==='history'?'tallahassee':r.district==='commons'?'commons':'studio',to:id,type:'seamless',scene:r.layout.scene,position:r.layout.approach??r.layout.slot});
 for(const e of [...all])if(!all.some(x=>x.from===e.to&&x.to===e.from)&&e.type!=='window')all.push({...e,id:'reverse-'+e.id,originalId:e.id,from:e.to,to:e.from,reversed:true,scene:ROOMS[e.to].layout.scene,destination:ROOMS[e.to].layout.scene!==ROOMS[e.from].layout.scene?ROOMS[e.from].layout.scene:undefined});
 return all;
}
export function canTravel(edge,lens){const r=visibleEdge(edge,lens);return r.state!=='hidden'&&r.state!=='private'&&r.type!=='window'&&permission(ROOMS[edge.to],lens).canEnter;}
export function graphRoute(from,to,lens){
 if(!ROOMS[from]||!ROOMS[to]||!permission(ROOMS[to],lens).canEnter)return null;if(from===to)return [];
 const edges=graphEdges(),queue=[from],seen=new Map([[from,null]]);
 for(let i=0;i<queue.length;i++)for(const e of edges.filter(e=>e.from===queue[i]))if(!seen.has(e.to)&&canTravel(e,lens)){seen.set(e.to,e);if(e.to===to){const route=[];let at=to;while(at!==from){const edge=seen.get(at);route.unshift(edge);at=edge.from;}return route;}queue.push(e.to);}
 return null;
}
export function resolveAddress(value,lens){const text=String(value).trim().replace(/^https?:\/\/[^/]+\//,'').replace(/^\/+|\/+$/g,'').toLowerCase();const entry=Object.entries(ROOMS).find(([id,r])=>[id,r.id,r.address,...r.aliases??[]].some(a=>a.toLowerCase()===text));if(!entry||!permission(entry[1],lens).visible)return null;return entry[0];}
export const approach=(room)=>room.layout.approach??[room.layout.slot[0],room.layout.slot[1]+2];
export function beforeDoor(e){if(e.before&&!e.reversed)return e.before;const [x,z]=e.position;if(e.reversed)return e.after??(e.axis==='x'?[x+1.7,z]:[x,z-1.7]);return e.axis==='x'?[x-1.7,z]:[x,z+1.7];}
const lineClear=(world,a,b)=>{const n=Math.max(1,Math.ceil(Math.hypot(b[0]-a[0],b[1]-a[1])/.18));for(let i=1;i<=n;i++)if(!world.canStand(a[0]+(b[0]-a[0])*i/n,a[1]+(b[1]-a[1])*i/n))return false;return true;};
export function walkingPath(world,start,end){
 if(!world.canStand(...end))return null;if(lineClear(world,start,end))return [end];
 const step=.6,key=(x,z)=>x+','+z,point=(x,z)=>[x*step,z*step],nearest=p=>{const cx=Math.round(p[0]/step),cz=Math.round(p[1]/step);const found=[];for(let dx=-2;dx<=2;dx++)for(let dz=-2;dz<=2;dz++){const v=point(cx+dx,cz+dz);if(world.canStand(...v)&&lineClear(world,p,v))found.push({x:cx+dx,z:cz+dz,d:Math.hypot(v[0]-p[0],v[1]-p[1])});}return found.sort((a,b)=>a.d-b.d)[0];};
 const first=nearest(start),last=nearest(end);if(!first||!last)return null;
 const nodes=new Map(),open=[],closed=new Set();const node={...first,g:0,f:0,parent:null};nodes.set(key(node.x,node.z),node);open.push(node);let finish;
 for(let i=0;open.length&&i<10000;i++){
  let best=0;for(let j=1;j<open.length;j++)if(open[j].f<open[best].f)best=j;const at=open.splice(best,1)[0],k=key(at.x,at.z);if(closed.has(k))continue;closed.add(k);if(at.x===last.x&&at.z===last.z){finish=at;break;}
  for(const [dx,dz] of [[1,0],[-1,0],[0,1],[0,-1],[1,1],[1,-1],[-1,1],[-1,-1]]){const x=at.x+dx,z=at.z+dz,k=key(x,z);if(closed.has(k)||x< -24||x>58||z< -34||z>20)continue;const p=point(x,z);if(!world.canStand(...p)||!lineClear(world,point(at.x,at.z),p))continue;const g=at.g+Math.hypot(dx,dz),old=nodes.get(k);if(!old||g<old.g){const next={x,z,g,f:g+Math.hypot(x-last.x,z-last.z),parent:at};nodes.set(k,next);open.push(next);}}
 }
 if(!finish)return null;const path=[end];for(let n=finish;n;n=n.parent)path.unshift(point(n.x,n.z));path.unshift(start);const smooth=[];let i=0;while(i<path.length-1){let j=path.length-1;while(j>i+1&&!lineClear(world,path[i],path[j]))j--;smooth.push(path[j]);i=j;}return smooth;
}
export class Travel {
 constructor(api){this.api=api;this.active=false;this.waiting=false;this.target=null;this.path=[];this.speed=5.2;this.generation=0;}
 cancel(message){this.generation++;this.busy=false;this.recorded=null;this.active=false;this.waiting=false;this.path=[];this.hops=[];this.api.controls().resetInput();if(message)this.api.message(message);this.api.changed?.();}
 start(target){this.cancel();const hops=graphRoute(this.api.room(),target,this.api.lens());if(!hops){this.api.message('No permitted route to that place.');return false;}this.target=target;this.hops=hops;this.active=true;this.advance();return true;}
 advance(){
  if(!this.active)return;const e=this.hops[0];if(!e){this.complete();return;}
  if(!canTravel(e,this.api.lens())){this.cancel('The route changed with your access or lens.');return;}
  const result=visibleEdge(e,this.api.lens());this.edge=e;this.door=result.type==='door';const end=this.door?beforeDoor(e):approach(ROOMS[e.to]);
  const c=this.api.controls();this.path=walkingPath(this.api.world(),[c.position.x,c.position.z],end);if(!this.path){this.cancel('No clear walking path to this stop. Set a waypoint and approach it on foot.');return;}
  this.api.changed?.();
 }
 async confirm(){
  const e=this.edge;if(!this.active||!this.waiting||!canTravel(e,this.api.lens())){this.cancel('Access changed at the door.');return;}
  const generation=this.generation;try{await this.api.use(e.to);if(!this.active||this.generation!==generation)return;this.recorded=e.to;
   if(e.destination)await this.api.scene(e.destination);else this.api.world().granted.add(e.originalId??e.id);
   if(!this.active||this.generation!==generation)return;this.waiting=false;const c=this.api.controls();this.path=walkingPath(this.api.world(),[c.position.x,c.position.z],approach(ROOMS[e.to]));this.door=false;
   if(!this.path){this.cancel('The entrance is blocked. You can continue on foot.');return;}
  }catch(error){this.cancel(error.message);}
 }
 update(dt){
  if(!this.active||this.waiting||this.busy)return;if(!canTravel(this.edge,this.api.lens())){this.cancel('Access expired or this route is no longer allowed.');return;}
  let remaining=this.speed*dt;const c=this.api.controls();
  while(this.path.length&&remaining>0){const [x,z]=this.path[0],dx=x-c.position.x,dz=z-c.position.z,d=Math.hypot(dx,dz),step=Math.min(remaining,d);if(d>.001){const nx=c.position.x+dx/d*step,nz=c.position.z+dz/d*step;if(!this.api.world().canStand(nx,nz)){this.cancel('The path changed. Travel stopped safely.');return;}c.position.x=nx;c.position.z=nz;c.yaw=Math.atan2(-dx,-dz);}remaining-=step;if(d<=step+.001)this.path.shift();else break;}
  if(!this.path.length){if(this.door){this.waiting=true;this.api.preview({...this.edge,travel:true});}else this.finishHop();}
 }
 async finishHop(){
  if(this.busy)return;const generation=this.generation,e=this.hops[0];this.busy=true;
  try{if(this.recorded!==e.to)await this.api.use(e.to);if(!this.active||this.generation!==generation)return;this.recorded=null;this.hops.shift();this.api.arrived(e.to);this.busy=false;if(!this.hops.length){this.api.message('Arrived at '+ROOMS[e.to].title);this.cancel();}else this.advance();}catch(error){if(this.generation===generation)this.cancel(error.message);}finally{if(this.generation===generation)this.busy=false;}
 }
 async complete(){
  const generation=this.generation;this.busy=true;try{await this.api.use(this.target);if(!this.active||this.generation!==generation)return;this.api.arrived(this.target);this.cancel();}catch(error){if(this.generation===generation)this.cancel(error.message);}finally{if(this.generation===generation)this.busy=false;}
 }
}
