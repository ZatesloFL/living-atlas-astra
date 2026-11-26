import * as THREE from '../vendor/three/three.module.min.js';
import {VISITOR_EYE,viewpointCeiling,airStepAllowed,landingSpot,inEnteredPlace,crossesDoor} from './visitor-viewpoint.js';
import {ROOMS} from './data.js';
export const EYE_HEIGHT=VISITOR_EYE,SPAWN_Z=5.6,DEFAULT_PITCH=.065;
export class Controls {
 constructor(canvas,camera,joystick,onTap,canMove,options={}){
  Object.assign(this,{canvas,camera,joystick,onTap,canMove,options});this.position=new THREE.Vector3(0,EYE_HEIGHT,SPAWN_Z);this.velocity=new THREE.Vector2();this.stick=new THREE.Vector2();
  this.yaw=this.smoothYaw=0;this.pitch=this.smoothPitch=DEFAULT_PITCH;this.look=this.joy=null;this.keys=new Set();this.keyMinimum=new Map();this.touches=new Map();this.reduced=matchMedia('(prefers-reduced-motion: reduce)').matches;
  this.normalFov=camera.fov;this.zoomTarget=camera.fov;this.flightScope=null;this.rising=false;this.landing=null;this.camera.rotation.order='YXZ';canvas.tabIndex=0;
  const listen=(target,name,action,opts)=>target.addEventListener(name,this.guarded(action),opts);
  listen(joystick,'pointerdown',e=>{if(!canMove()||this.joy!==null)return;e.preventDefault();this.joy=e.pointerId;joystick.setPointerCapture(e.pointerId);this.joyUpdate(e);});
  listen(joystick,'pointermove',e=>{if(e.pointerId===this.joy)this.joyUpdate(e);});
  const release=e=>{if(e.pointerId===this.joy){this.joy=null;this.stick.set(0,0);joystick.style.setProperty('--jx','0px');joystick.style.setProperty('--jy','0px');}};
  for(const name of ['pointerup','pointercancel','lostpointercapture'])listen(joystick,name,release);
  listen(canvas,'pointerdown',e=>{
   if(!canMove())return;e.preventDefault();canvas.focus({preventScroll:true});canvas.setPointerCapture(e.pointerId);
   if(e.pointerType==='touch'){this.touches.set(e.pointerId,[e.clientX,e.clientY]);if(this.touches.size>=2){this.pinching=true;this.look=null;this.pinchDistance=this.touchDistance();return;}}
   if(!this.look)this.look={id:e.pointerId,x:e.clientX,y:e.clientY,time:performance.now(),moved:0};
  });
  listen(canvas,'pointermove',e=>{
   if(!canMove())return;
   if(this.touches.has(e.pointerId))this.touches.set(e.pointerId,[e.clientX,e.clientY]);
   if(this.pinching){if(this.touches.size>=2){const distance=this.touchDistance();if(distance>8&&this.pinchDistance>8)this.zoomTo(THREE.MathUtils.radToDeg(2*Math.atan(Math.tan(THREE.MathUtils.degToRad(this.zoomTarget)/2)*this.pinchDistance/distance)));this.pinchDistance=distance;}return;}
   const p=this.look;if(!p||p.id!==e.pointerId)return;const dx=e.clientX-p.x,dy=e.clientY-p.y;p.moved+=Math.hypot(dx,dy);this.yaw-=dx*.004;this.pitch=Math.max(-1.45,Math.min(1.35,this.pitch-dy*.0034));p.x=e.clientX;p.y=e.clientY;
  });
  const finish=(e,tap=false)=>{this.touches.delete(e.pointerId);if(this.pinching){if(!this.touches.size)this.pinching=false;this.look=null;return;}const p=this.look;if(p?.id!==e.pointerId)return;this.look=null;if(tap&&p.moved<11&&performance.now()-p.time<420&&canMove())onTap(e.clientX,e.clientY);};
  listen(canvas,'pointerup',e=>finish(e,true));for(const name of ['pointercancel','lostpointercapture'])listen(canvas,name,e=>finish(e));
  listen(canvas,'wheel',e=>{if(!canMove())return;e.preventDefault();this.zoomTo(this.zoomTarget*Math.exp(Math.max(-240,Math.min(240,e.deltaY*(e.deltaMode===1?16:1)))*.002));},{passive:false});
  listen(window,'keydown',e=>{if(!canMove()||(typeof e.target?.matches==='function'&&e.target.matches('input,select,textarea,[contenteditable=true]')))return;if(!e.repeat&&!this.keys.has(e.code))this.keyMinimum.set(e.code,.16);this.keys.add(e.code);if(['ArrowUp','ArrowDown','ArrowLeft','ArrowRight','KeyE','KeyQ'].includes(e.code))e.preventDefault();});
  listen(window,'keyup',e=>this.keys.delete(e.code));listen(window,'blur',()=>this.resetInput());listen(document,'visibilitychange',()=>this.resetInput());
 }
 guarded(action){return event=>{try{const result=action(event);if(result?.catch)result.catch(()=>this.inputFailed());return result;}catch{this.inputFailed();}};}
 inputFailed(){try{this.resetInput();}catch{}this.sayLimit('That input could not be used. Try again; your place is still open.');}
 sayLimit(message){const now=performance.now();if(this.lastLimit?.message===message&&now-this.lastLimit.time<4500)return;this.lastLimit={message,time:now};try{this.options.message?.(message);}catch{}}
 flightLimit(world,scope,from,to){this.sayLimit(crossesDoor(world,from,to)||!inEnteredPlace(world,scope,to[0],to[2])?'You cannot leave a Place by flying — use a door.':'There is a wall or object here. Move around it or use a door.');}
 get flying(){return this.position.y>EYE_HEIGHT+.01;}
 touchDistance(){const [a,b]=[...this.touches.values()];return a&&b?Math.hypot(a[0]-b[0],a[1]-b[1]):0;}
 zoomTo(fov){if(fov>this.normalFov+.01)this.sayLimit('This is normal magnification. Walk back for a wider view.');else if(fov<this.normalFov/3-.01)this.sayLimit('This is the closest magnification here.');this.zoomTarget=Math.max(this.normalFov/3,Math.min(this.normalFov,fov));}
 joyUpdate(e){const r=this.joystick.getBoundingClientRect(),x=e.clientX-r.left-r.width/2,y=e.clientY-r.top-r.height/2;this.stick.set(x,y).clampLength(0,38).divideScalar(38);this.joystick.style.setProperty('--jx',`${this.stick.x*34}px`);this.joystick.style.setProperty('--jy',`${this.stick.y*34}px`);}
 resetInput(){this.joy=this.look=null;this.touches.clear();this.pinching=false;this.rising=false;this.stick.set(0,0);this.keys.clear();this.keyMinimum.clear();this.velocity.set(0,0);this.joystick.style.setProperty('--jx','0px');this.joystick.style.setProperty('--jy','0px');}
 teleport(x,z,yaw=0,pitch=DEFAULT_PITCH){this.position.set(x,EYE_HEIGHT,z);this.yaw=this.smoothYaw=yaw;this.pitch=this.smoothPitch=pitch;this.flightScope=null;this.landing=null;this.zoomTarget=this.camera.fov=this.normalFov;this.camera.updateProjectionMatrix();this.resetInput();this.apply();}
 land(world){if(!this.flying)return true;const spot=landingSpot(world,this.flightScope,this.position.toArray());if(!spot){this.options.message?.('No clear standable spot below you. Move over clear ground, then Land.');return false;}this.resetInput();this.landing=spot;return true;}
 apply(){this.camera.position.copy(this.position);this.camera.rotation.set(this.smoothPitch,this.smoothYaw,0,'YXZ');}
 update(dt,world){
  if(!this.canMove()){this.resetInput();return;}
  const pressed=code=>this.keys.has(code)||(this.keyMinimum.get(code)??0)>0;
  const ease=1-Math.exp(-dt*(this.reduced?35:16));this.smoothYaw+=(this.yaw-this.smoothYaw)*ease;this.smoothPitch+=(this.pitch-this.smoothPitch)*ease;
  let sx=this.stick.x+(pressed('KeyD')?1:0)-(pressed('KeyA')?1:0),sy=this.stick.y+(pressed('KeyS')?1:0)-(pressed('KeyW')?1:0);
  const len=Math.hypot(sx,sy);if(len>1){sx/=len;sy/=len;}if(len>.02){this.zoomTarget=this.normalFov;this.landing=null;}
  const vertical=(this.rising||pressed('KeyE')?1:0)-(pressed('KeyQ')?1:0);if(vertical)this.landing=null;
  if(vertical>0&&!this.flying)this.flightScope=this.options.scope?.()??{scene:world.kind,room:world.context(this.position.x,this.position.z).room,anchor:[this.position.x,this.position.z]};
  if(this.landing){
   const p=this.position.toArray(),goal=this.landing,horizontal=Math.hypot(goal[0]-p[0],goal[2]-p[2]),next=horizontal>.01?[p[0]+(goal[0]-p[0])*Math.min(1,dt*3/horizontal),p[1],p[2]+(goal[2]-p[2])*Math.min(1,dt*3/horizontal)]:[goal[0],Math.max(goal[1],p[1]-dt*3),goal[2]];
   if(airStepAllowed(world,this.flightScope,p,next))this.position.fromArray(next);else {this.landing=null;this.options.message?.('The landing path changed. Move over clear ground, then Land.');}
   if(!this.flying){this.position.y=EYE_HEIGHT;this.landing=null;this.flightScope=null;}
  }else{
   if(vertical&&this.flightScope){const p=this.position.toArray(),height=Math.max(EYE_HEIGHT,Math.min(viewpointCeiling(ROOMS[this.flightScope.room]),p[1]+vertical*dt*2.5)),next=[p[0],height,p[2]];if(vertical>0&&p[1]+vertical*dt*2.5>=viewpointCeiling(ROOMS[this.flightScope.room]))this.sayLimit('This Place’s ceiling is '+(viewpointCeiling(ROOMS[this.flightScope.room])+.25).toFixed(1)+' metres high.');if(airStepAllowed(world,this.flightScope,p,next))this.position.y=height;else this.flightLimit(world,this.flightScope,p,next);if(!this.flying&&vertical<0)this.flightScope=null;}
   const speed=3.5,tx=(sx*Math.cos(this.yaw)+sy*Math.sin(this.yaw))*speed,tz=(-sx*Math.sin(this.yaw)+sy*Math.cos(this.yaw))*speed;
   this.velocity.x+=(tx-this.velocity.x)*(1-Math.exp(-dt*12));this.velocity.y+=(tz-this.velocity.y)*(1-Math.exp(-dt*12));
   for(const [axis,delta] of [['x',this.velocity.x*dt],['z',this.velocity.y*dt]]){const next=this.position.clone();next[axis]+=delta;const allowed=this.flying?airStepAllowed(world,this.flightScope,this.position.toArray(),next.toArray()):world.canStand(next.x,next.z);if(allowed)this.position.copy(next);else if(this.flying&&Math.abs(delta)>.001)this.flightLimit(world,this.flightScope,this.position.toArray(),next.toArray());}
  }
  if(pressed('ArrowLeft'))this.yaw+=dt*1.25;if(pressed('ArrowRight'))this.yaw-=dt*1.25;
  const fov=this.camera.fov+(this.zoomTarget-this.camera.fov)*(1-Math.exp(-dt*10));if(Math.abs(fov-this.camera.fov)>.001){this.camera.fov=fov;this.camera.updateProjectionMatrix();}
  for(const [key,left] of this.keyMinimum){if(left<=dt)this.keyMinimum.delete(key);else this.keyMinimum.set(key,left-dt);}
  this.apply();const signature=[this.flying,this.landing!==null,Math.round(this.position.y*10),Math.round(this.normalFov/this.camera.fov*10)].join(':');if(signature!==this.statusSignature){this.statusSignature=signature;this.options.status?.({flying:this.flying,landing:!!this.landing,height:this.position.y-EYE_HEIGHT,zoom:Math.tan(THREE.MathUtils.degToRad(this.normalFov)/2)/Math.tan(THREE.MathUtils.degToRad(this.camera.fov)/2)});}
 }
}
