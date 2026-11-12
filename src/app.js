import * as THREE from '../vendor/three/three.module.min.js';
import {createLens,ROOMS,EDGES} from './data.js';
import {Renderer} from './renderer.js';
import {Controls,SPAWN_Z} from './controls.js';
import {World} from './world.js';
import {WorldLabels} from './labels.js';
import {UI} from './ui.js';
import {visibleEdge} from './rules.js';
const $=id=>document.getElementById(id);
const reducedQuery=matchMedia('(prefers-reduced-motion: reduce)');
let world,graphics,controls,ui,kind='studio',lens=createLens(),context={room:'studio'},transition=null,frame=0,lastTime=0,frames=0,period=0,fps=60,lastTune=0,active=true,near=null,contextKey='studio';
const camera=new THREE.PerspectiveCamera(innerHeight>innerWidth?67:61,innerWidth/innerHeight,.08,110);
const labels=new WorldLabels($('world-labels'));
const raycaster=new THREE.Raycaster(),tapPoint=new THREE.Vector2();
function state(){return {kind,lens,context,position:controls?.position,near};}
function rebuild(next=kind){
  kind=next;world?.dispose();world=new World(kind,lens,reducedQuery.matches);graphics.renderer.shadowMap.needsUpdate=true;
  if(!world.canStand(controls.position.x,controls.position.z)){controls.teleport(0,SPAWN_Z);ui.toast('Your lens changed this path. You’re back at a safe entrance.');}
  near=null;updateContext();ui.prompt(null);
}
function fadeTo(action){if(reducedQuery.matches){action();return;}transition={start:performance.now(),action,done:false};controls.resetInput();}
function changeScene(next){fadeTo(()=>{controls.teleport(0,SPAWN_Z);rebuild(next);ui.title(next);ui.toast(`Entered ${next==='history'?'History Quarter':'Makers Row'}`);});}
function lensChanged(){controls.resetInput();fadeTo(()=>rebuild());}
function enter(edge){
  const result=visibleEdge(edge,lens);if(result.state==='hidden'||result.type==='window')return;
  if(edge.destination){changeScene(edge.destination);return;}
  world.granted.add(edge.id);
  const [x,z]=edge.position;
  let px=x,pz=z-1.05;if(edge.axis==='x'){px=x+1.05;pz=z;}
  if(world.canStand(px,pz))controls.teleport(px,pz,edge.axis==='x'?-Math.PI/2:0);
  ui.toast(result.oddness.length?`${ROOMS[edge.to].title} reads louder: ${result.oddness.join(', ')}`:`Entered ${ROOMS[edge.to].title}`);updateContext();
}
function selectId(id){
  if(id?.startsWith('edge:')){const e=world.edgeObjects.find(e=>e.id===id.slice(5));if(e)ui.edge(e);}
  else if(id)ui.info(id);
}
function select(x,y){
  const label=labels.pick(x,y);if(label){selectId(label);return;}
  tapPoint.set(x/innerWidth*2-1,-y/innerHeight*2+1);raycaster.setFromCamera(tapPoint,camera);
  const hits=raycaster.intersectObjects(world.pickables,false);
  for(const hit of hits){if(hit.distance>22)continue;const id=hit.object.userData.id??hit.object.userData.ids?.[hit.instanceId];if(!id)continue;
    if(id.startsWith('edge:')){const e=world.edgeObjects.find(e=>e.id===id.slice(5));if(e)ui.edge(e);}
    else ui.info(id);return;
  }
}
function updateContext(){
  context=world.context(controls.position.x,controls.position.z);ui.location(context);
  if(context.room!==contextKey){contextKey=context.room;const name=ROOMS[context.room].title;
    if(context.room==='market')ui.toast('Night Market reads louder than it says: Sensory 2.');else if(context.inside)ui.toast('Inside: Broadcast booth · host rules apply');else ui.toast(`Entered ${DISTRICT_NAME(context.room)}`);
  }
}
function DISTRICT_NAME(id){return {studio:'Makers Row',commons:'the Commons',night:'After Dark',tallahassee:'History Quarter',capitol:'the Capitol grounds'}[id]??ROOMS[id].title;}
function loop(time){
  frame=requestAnimationFrame(loop);if(!active)return;
  const elapsed=(time-lastTime)/1000||.016,dt=Math.min(elapsed,.05);lastTime=time;
  let fade=0;if(transition){const p=(performance.now()-transition.start)/420;fade=p<.5?p*2:2-p*2;if(p>=.5&&!transition.done){transition.done=true;transition.action();}if(p>=1){transition=null;fade=0;}}
  controls.update(dt,world);world.update(time/1000,controls.position);graphics.render(world.scene,camera,Math.max(0,fade));labels.update(world,camera);
  frames++;period+=elapsed;
  if(frames%8===0){updateContext();const n=world.nearest(controls.position.x,controls.position.z,controls.smoothYaw);if(n?.id!==near?.id){near=n;ui.prompt(near);}}
  if(period>=1){fps=frames/period;ui.performance({fps,calls:graphics.calls,ratio:graphics.ratio,kind});if(time-lastTune>6000&&time>10000&&!ui.mode){graphics.adjust(fps);lastTune=time;}period=0;frames=0;}
}
try{
  graphics=new Renderer($('world'));
  ui=new UI({state,pause:()=>controls?.resetInput(),lensChanged,enter,home:()=>changeScene('studio')});
  controls=new Controls($('world'),camera,$('joystick'),select,()=>!ui.mode&&!transition&&active);
  rebuild();controls.apply();world.update(0);graphics.render(world.scene,camera);ui.title(kind);
  window.addEventListener('resize',()=>{controls.resetInput();camera.aspect=innerWidth/innerHeight;camera.fov=innerHeight>innerWidth?67:61;camera.updateProjectionMatrix();graphics.resize();});
  reducedQuery.addEventListener('change',()=>{controls.reduced=reducedQuery.matches;rebuild();});
  document.addEventListener('visibilitychange',()=>{active=!document.hidden;controls.resetInput();lastTime=performance.now();frames=0;period=0;});
  $('world').addEventListener('webglcontextlost',e=>{e.preventDefault();active=false;$('loading').classList.remove('done');$('load-status').innerHTML='The graphics context paused. <button id="reload">Reload the walk</button>';$('reload').onclick=()=>location.reload();});
  $('world').addEventListener('webglcontextrestored',()=>location.reload());
  $('loading').classList.add('done');requestAnimationFrame(loop);
  // Read-only runtime metrics; no automation controls or credentials in production.
  window.atlasStatus=()=>({scene:kind,room:context.room,fps:Math.round(fps),drawCalls:graphics.calls,dpr:graphics.ratio,triangles:graphics.renderer.info.render.triangles,position:{x:controls.position.x,z:controls.position.z},reducedMotion:reducedQuery.matches});
  if(new URLSearchParams(location.search).has('test')){
    window.__atlas={state:()=>({kind,context,lens:structuredClone(lens),position:controls.position.clone(),edges:world.edgeObjects.map(e=>({id:e.id,result:e.result})),...window.atlasStatus()}),position:(x,z,yaw=0)=>{controls.teleport(x,z,yaw);updateContext();},canStand:(x,z)=>world.canStand(x,z),pick:(id)=>id.startsWith('edge:')?ui.edge(world.edgeObjects.find(e=>e.id===id.slice(5))):ui.info(id),close:()=>ui.close(),changeScene,scene:()=>world.scene};
  }
}catch(error){console.error(error);$('load-status').textContent='The 3D scene could not start. Chrome with WebGL 2 is required. Reload to try again.';document.querySelector('.loading-line').hidden=true;}
