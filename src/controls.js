import * as THREE from '../vendor/three/three.module.min.js';
export const EYE_HEIGHT=1.88, SPAWN_Z=5.6, DEFAULT_PITCH=.065;
export class Controls {
  constructor(canvas,camera,joystick,onTap,canMove) {
    this.camera=camera;this.canvas=canvas;this.joystick=joystick;this.onTap=onTap;this.canMove=canMove;
    this.position=new THREE.Vector3(0,EYE_HEIGHT,SPAWN_Z);this.velocity=new THREE.Vector2();
    this.stick=new THREE.Vector2();this.yaw=0;this.pitch=DEFAULT_PITCH;this.smoothYaw=0;this.smoothPitch=DEFAULT_PITCH;
    this.look=null;this.joy=null;this.keys=new Set();this.reduced=matchMedia('(prefers-reduced-motion: reduce)').matches;
    this.camera.rotation.order='YXZ';
    joystick.addEventListener('pointerdown',e=>{if(!canMove()||this.joy!==null)return;e.preventDefault();this.joy=e.pointerId;joystick.setPointerCapture(e.pointerId);this.joyUpdate(e);});
    joystick.addEventListener('pointermove',e=>{if(e.pointerId===this.joy)this.joyUpdate(e);});
    const release=e=>{if(e.pointerId===this.joy){this.joy=null;this.stick.set(0,0);joystick.style.setProperty('--jx','0px');joystick.style.setProperty('--jy','0px');}};
    joystick.addEventListener('pointerup',release);joystick.addEventListener('pointercancel',release);joystick.addEventListener('lostpointercapture',release);
    canvas.addEventListener('pointerdown',e=>{if(!canMove()||this.look)return;canvas.setPointerCapture(e.pointerId);this.look={id:e.pointerId,x:e.clientX,y:e.clientY,startX:e.clientX,startY:e.clientY,time:performance.now(),moved:0};});
    canvas.addEventListener('pointermove',e=>{const p=this.look;if(!p||p.id!==e.pointerId)return;const dx=e.clientX-p.x,dy=e.clientY-p.y;p.moved+=Math.hypot(dx,dy);this.yaw-=dx*.004;this.pitch=Math.max(-1.1,Math.min(1.0,this.pitch-dy*.0034));p.x=e.clientX;p.y=e.clientY;});
    canvas.addEventListener('pointerup',e=>{const p=this.look;if(!p||p.id!==e.pointerId)return;this.look=null;if(p.moved<11&&performance.now()-p.time<420&&canMove())onTap(e.clientX,e.clientY);});
    canvas.addEventListener('pointercancel',()=>{this.look=null;});canvas.addEventListener('lostpointercapture',()=>{this.look=null;});
    window.addEventListener('keydown',e=>{if(!canMove()||e.target.matches('input,button,select,textarea'))return;this.keys.add(e.code);if(['ArrowUp','ArrowDown','ArrowLeft','ArrowRight','Space'].includes(e.code))e.preventDefault();});
    window.addEventListener('keyup',e=>this.keys.delete(e.code));
    window.addEventListener('blur',()=>this.resetInput());
    document.addEventListener('visibilitychange',()=>this.resetInput());
  }
  joyUpdate(e){const r=this.joystick.getBoundingClientRect();const x=e.clientX-r.left-r.width/2,y=e.clientY-r.top-r.height/2;this.stick.set(x,y).clampLength(0,38).divideScalar(38);this.joystick.style.setProperty('--jx',`${this.stick.x*34}px`);this.joystick.style.setProperty('--jy',`${this.stick.y*34}px`);}
  resetInput(){this.joy=null;this.look=null;this.stick.set(0,0);this.keys.clear();this.velocity.set(0,0);this.joystick.style.setProperty('--jx','0px');this.joystick.style.setProperty('--jy','0px');}
  teleport(x,z,yaw=0){this.position.set(x,EYE_HEIGHT,z);this.yaw=this.smoothYaw=yaw;this.pitch=this.smoothPitch=DEFAULT_PITCH;this.resetInput();this.apply();}
  apply(){this.camera.position.copy(this.position);this.camera.rotation.set(this.smoothPitch,this.smoothYaw,0,'YXZ');}
  update(dt,world){
    if(!this.canMove()){this.velocity.set(0,0);return;}
    const ease=1-Math.exp(-dt*(this.reduced?35:16));this.smoothYaw+=(this.yaw-this.smoothYaw)*ease;this.smoothPitch+=(this.pitch-this.smoothPitch)*ease;
    let sx=this.stick.x+(this.keys.has('KeyD')?1:0)-(this.keys.has('KeyA')?1:0),sy=this.stick.y+(this.keys.has('KeyS')?1:0)-(this.keys.has('KeyW')?1:0);
    const len=Math.hypot(sx,sy);if(len>1){sx/=len;sy/=len;}
    const speed=3.5,tx=(sx*Math.cos(this.yaw)+sy*Math.sin(this.yaw))*speed,tz=(-sx*Math.sin(this.yaw)+sy*Math.cos(this.yaw))*speed;
    this.velocity.x+=(tx-this.velocity.x)*(1-Math.exp(-dt*12));this.velocity.y+=(tz-this.velocity.y)*(1-Math.exp(-dt*12));
    if(this.keys.has('ArrowLeft'))this.yaw+=dt*1.25;if(this.keys.has('ArrowRight'))this.yaw-=dt*1.25;
    const x=this.position.x+this.velocity.x*dt,z=this.position.z+this.velocity.y*dt;
    if(world.canStand(x,this.position.z))this.position.x=x;
    if(world.canStand(this.position.x,z))this.position.z=z;
    this.apply();
  }
}
