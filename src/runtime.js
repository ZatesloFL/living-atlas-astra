export async function startAtlas(diag){
const THREE=await diag.asyncRun('engine module',()=>import('../vendor/three/three.module.min.js'));
const {ROOMS,EDGES}=await diag.asyncRun('data module',()=>import('./data.js'));
const {Renderer}=await diag.asyncRun('renderer module',()=>import('./renderer.js'));
const {Controls,SPAWN_Z}=await diag.asyncRun('controls module',()=>import('./controls.js'));
const {World}=await diag.asyncRun('world module',()=>import('./world.js'));
const {WorldLabels}=await diag.asyncRun('labels module',()=>import('./labels.js'));
const {UI}=await diag.asyncRun('UI module',()=>import('./ui.js'));
const {ProfileStore}=await diag.asyncRun('profiles module',()=>import('./profiles.js'));
const {ProfileUI}=await diag.asyncRun('profile UI module',()=>import('./profile-ui.js'));
const {roomEntry}=await diag.asyncRun('content rules module',()=>import('./content.js'));
const {PageRenderer}=await diag.asyncRun('Page module',()=>import('./page.js'));
const {AccessStore}=await diag.asyncRun('access module',()=>import('./access-store.js'));
const {AccessUI}=await diag.asyncRun('access UI module',()=>import('./access-ui.js'));
const {Travel,graphRoute,resolveAddress,beforeDoor,approach}=await diag.asyncRun('travel module',()=>import('./navigation.js'));
const {permission,roomTitle}=await import('./permissions.js');
const {visibleEdge}=await diag.asyncRun('rules module',()=>import('./rules.js'));
const $=id=>document.getElementById(id);
const reducedQuery=matchMedia('(prefers-reduced-motion: reduce)');
const profiles=diag.run('profiles',()=>new ProfileStore());
const access=diag.run('room access',()=>new AccessStore());await diag.asyncRun('room receipts',()=>access.ready);
const currentLens=()=>access.lens(profiles.current());
let profileUI,page,pageOrigin,selectedRoom,accessUI,travel,waypoint=null,place=null,expiryTimer;
let world,graphics,controls,ui,kind='studio',lens=diag.run('profile lens',()=>currentLens()),context={room:'studio'},transition=null,frame=0,lastTime=0,frames=0,period=0,fps=60,lastTune=0,titlePosition=null,active=true,near=null,contextKey='studio';
const camera=diag.run('camera',()=>new THREE.PerspectiveCamera(innerHeight>innerWidth?67:61,innerWidth/innerHeight,.08,110));
let labels=null;
const raycaster=new THREE.Raycaster(),tapPoint=new THREE.Vector2();
function state(){return {kind,lens,context,profiles,access,travel,position:controls?.position,near,approvedRooms:[...(world?.granted??[])].map(id=>EDGES.find(e=>e.id===id)?.to)};}
function rebuild(next=kind){
  const nextWorld=diag.run(world?'scene rebuild':'first scene',()=>new World(next,lens,reducedQuery.matches));
  try{world?.dispose();}catch(error){diag.record('scene disposal',error,'The new scene remains available.');}
  world=nextWorld;kind=next;graphics.renderer.shadowMap.needsUpdate=graphics.renderer.shadowMap.enabled;
  if(!world.canStand(controls.position.x,controls.position.z)){controls.teleport(0,SPAWN_Z);ui.toast('Your lens changed this path. You’re back at a safe entrance.');}
  near=null;updateContext();ui.prompt(null);
}
function fadeTo(action){if(reducedQuery.matches){action();return;}transition={start:performance.now(),action,done:false};controls.resetInput();}
function changeScene(next){fadeTo(()=>{controls.teleport(0,SPAWN_Z);rebuild(next);ui.title(next);ui.toast(`Entered ${next==='history'?'History Quarter':'Makers Row'}`);});}
function lensChanged(){travel?.cancel();place=null;profiles.preferences(lens);lens=currentLens();profileUI?.refresh();controls.resetInput();if(page&&!page.root.hidden)rebuild();else fadeTo(()=>rebuild());}
async function applyProfile(){travel?.cancel();place=null;waypoint=null;lens=currentLens();controls?.resetInput();if(lens.form==='page'){rebuild();setTimeout(()=>openPage(context.room),0);}else fadeTo(()=>rebuild());profileUI?.refresh();}
async function switchProfile(id){await profiles.switchProfile(id);await applyProfile();}
function enter(edge){
  const result=visibleEdge(edge,lens);if(result.state==='hidden'||result.type==='window')return;
  if(edge.travel){travel.confirm();return;}
  if(!result.rights?.canEnter)return;
  if(edge.readTarget){focusRoom(edge.readTarget,true);return;}
  if(edge.destination){changeScene(edge.destination);return;}
  world.granted.add(edge.id);
  const [x,z]=edge.position;
  let px=x,pz=z-1.05;if(edge.axis==='x'){px=x+1.05;pz=z;}
  if(world.canStand(px,pz))controls.teleport(px,pz,edge.axis==='x'?-Math.PI/2:0);
  ui.toast(result.oddness.length?`${ROOMS[edge.to].title} reads louder: ${result.oddness.join(', ')}`:`Entered ${ROOMS[edge.to].title}`);updateContext();
}
function selectId(id){
  if(id?.startsWith('edge:')){const e=world.edgeObjects.find(e=>e.id===id.slice(5));if(e)ui.edge(e);}
  else if(id){selectedRoom=id;ui.info(id);}
}
function select(x,y){
  const label=labels?.pick(x,y);if(label){selectId(label);return;}
  tapPoint.set(x/innerWidth*2-1,-y/innerHeight*2+1);raycaster.setFromCamera(tapPoint,camera);
  const hits=raycaster.intersectObjects(world.pickables,false);
  for(const hit of hits){if(hit.distance>22)continue;const id=hit.object.userData.id??hit.object.userData.ids?.[hit.instanceId];if(!id)continue;
    if(id.startsWith('edge:')){const e=world.edgeObjects.find(e=>e.id===id.slice(5));if(e)ui.edge(e);}
    else {selectedRoom=id;ui.info(id);}return;
  }
}
function updateContext(){
  if(place&&(place.scene!==kind||Math.hypot(place.x-controls.position.x,place.z-controls.position.z)>1.8||!permission(ROOMS[place.id],lens).canEnter))place=null;context=place?{room:place.id}:world.context(controls.position.x,controls.position.z);ui.location(context);
  if(context.room!==contextKey){contextKey=context.room;const name=ROOMS[context.room].title;if(!travel?.active&&!document.body.classList.contains('page-mode')&&permission(ROOMS[context.room],lens).canEnter){access.use(context.room,'enter',lens).catch(error=>ui.toast(error.message));access.recent(context.room,lens);}
    if(context.room==='market')ui.toast('Night Market reads louder than it says: Sensory 2.');else if(context.inside)ui.toast('Inside: Broadcast booth · host rules apply');else ui.toast(`Entered ${DISTRICT_NAME(context.room)}`);
  }
}
function DISTRICT_NAME(id){return {studio:'Makers Row',commons:'the Commons',night:'After Dark',tallahassee:'History Quarter',capitol:'the Capitol grounds'}[id]??ROOMS[id].title;}
function loop(time){
  frame=requestAnimationFrame(loop);if(!active)return;
  const elapsed=(time-lastTime)/1000||.016,dt=Math.min(elapsed,.05);lastTime=time;
  let fade=0;if(transition){const p=(performance.now()-transition.start)/420;fade=p<.5?p*2:2-p*2;if(p>=.5&&!transition.done){transition.done=true;try{transition.action();}catch(error){diag.fallback('scene transition',error);return;}}if(p>=1){transition=null;fade=0;}}
  travel?.update(dt);updateWaypoint();
  try{controls.update(dt,world);}catch(error){diag.record('controls update',error,'Movement disabled; Page form remains available.');controls=staticControls();}
  if(!titlePosition)titlePosition=controls.position.clone();if(titlePosition.distanceTo(controls.position)>.12)ui.fadeTitle();
  try{world.update(time/1000,controls.position);}catch(error){diag.fallback('scene update',error);return;}
  try{graphics.render(world.scene,camera,Math.max(0,fade));}catch(error){diag.fallback('frame render',error);return;}
  if(labels)try{labels.update(world,camera);}catch(error){diag.record('labels update',error,'Nameplates disabled; object selection and Page form remain available.');labels=null;$('world-labels')?.replaceChildren();}
  frames++;period+=elapsed;
  if(frames%8===0){updateContext();const n=world.nearest(controls.position.x,controls.position.z,controls.smoothYaw);if(n?.id!==near?.id){near=n;ui.prompt(near);}}
  if(period>=1){fps=frames/period;ui.performance({fps,calls:graphics.calls,ratio:graphics.ratio,kind,level:graphics.status().label});if(time-lastTune>6000&&time>10000&&!ui.mode){graphics.adjust(fps);lastTune=time;}period=0;frames=0;}
}
function staticControls(){
  const position=new THREE.Vector3(0,1.88,SPAWN_Z);const fallback={position,smoothYaw:0,reduced:reducedQuery.matches,resetInput(){},update(){},apply(){camera.position.copy(position);camera.rotation.set(.065,0,0,'YXZ');},teleport(x,z,yaw=0){position.set(x,1.88,z);this.smoothYaw=yaw;camera.position.copy(position);camera.rotation.set(.065,yaw,0,'YXZ');}};fallback.apply();return fallback;
}
async function readingAge(age){if(!profiles.completed){await profiles.setup({name:'My reading visit',age,preset:age<13?'Kids':'Teen',depth:'Standard',form:'page',display:'anonymous'});lens=currentLens();}return lens;}
function focusRoom(id,approved=false){
  const r=ROOMS[id];if(!r?.layout||roomEntry(id,lens,EDGES).state==='hidden')return;
  const edge=EDGES.find(e=>e.to===id);if(r.layout.scene!==kind){controls.teleport(0,SPAWN_Z);rebuild(r.layout.scene);}
  if(approved&&edge)world.granted.add(edge.id);
  const [x,z]=!permission(r,lens).canEnter&&edge?beforeDoor(edge):r.layout.approach??[r.layout.slot[0],r.layout.slot[1]+2];
  if(world.canStand(x,z)){const dx=r.layout.slot[0]-x,dz=r.layout.slot[1]-z;controls.teleport(x,z,Math.atan2(-dx,-dz));}
  selectedRoom=id;place={id,scene:kind,x:controls.position.x,z:controls.position.z};updateContext();
}
function readRoom(id,showCard=true){const result=roomEntry(id,lens,EDGES);if(result.state==='hidden')return;if(result.type==='door'&&result.state!=='private'){ui.edge({...EDGES.find(e=>e.to===id),id:'read-'+id,to:id,type:'door',readTarget:id});return;}focusRoom(id);if(showCard)ui.info(id);}
function resume3D(id){
  lens=currentLens();lens.form='3d';profiles.preferences(lens);page=null;
  if(id!==pageOrigin)focusRoom(id,true);
  active=true;lastTime=performance.now();cancelAnimationFrame(frame);frame=requestAnimationFrame(loop);diag.setMode(`3D · ${graphics.mode} · shadows ${graphics.renderer.shadowMap.enabled?'on':'off'}`);
}
function openPage(id=context.room){
  travel?.cancel();ui.close();controls.resetInput();active=false;cancelAnimationFrame(frame);transition=null;pageOrigin=context.room;page?.close();lens.form='page';profiles.preferences(lens);
  page=new PageRenderer({lens,room:id,access,profiles,onAccessChange:refreshAccess,diagnostics:diag,approvedRooms:[context.room,...state().approvedRooms],onAgeChange:readingAge,onVisit:next=>{selectedRoom=next;},onLensChange:next=>{lens=next;profiles.preferences(lens);rebuild();profileUI?.refresh();},on3D:resume3D});
  page.open(id);diag.setMode('Page form');if(diag.params.has('test'))window.__atlasPage=page;
}
diag.pageState=()=>({lens,room:context.room,access,profiles,approvedRooms:[context.room,...state().approvedRooms],onAgeChange:readingAge,onLensChange:next=>{lens=next;profiles.preferences(lens);}});
diag.stop3D=()=>{clearInterval(expiryTimer);travel?.cancel();diag.threeFailed=true;active=false;cancelAnimationFrame(frame);try{controls?.resetInput();}catch{}};
graphics=diag.run('renderer',()=>new Renderer($('world'),{diagnostics:diag,safe:diag.safe}));
try{diag.run('shadows',()=>graphics.setupShadows(!diag.safe));}catch(error){graphics.setupShadows(false);diag.recovered('shadows','Shadows disabled.');}
graphics.initPost();
diag.onFullQuality=()=>{try{diag.safe=false;const url=new URL(location.href);url.searchParams.delete('safe');history.replaceState(null,'',url);graphics.retryFull(world.scene,camera);diag.setMode(`3D · ${graphics.mode} · shadows ${graphics.renderer.shadowMap.enabled?'on':'off'}`);}catch(error){diag.fallback('quality retry',error);}};
ui=diag.run('UI',()=>new UI({state,pause:()=>controls?.resetInput(),lensChanged,enter,openPage,readRoom,accessRoom:id=>accessUI.open(id),travel:id=>startTravel(id),cancelTravel:()=>{travel.cancel();waypoint=null;updateWaypoint();},waypoint:id=>setWaypoint(id),address:goAddress,home:()=>changeScene('studio'),openProfiles:()=>profileUI.switcher(),panelChanged:()=>profileUI?.refresh()}));
try{controls=diag.run('controls',()=>new Controls($('world'),camera,$('joystick'),select,()=>!ui.mode&&!transition&&active&&!travel?.active));}catch(error){controls=staticControls();diag.recovered('controls','Movement disabled; switch to Page form to browse.');}
profileUI=diag.run('profile UI',()=>new ProfileUI(ui,profiles,{state,apply:applyProfile,switchProfile,override:async changes=>{profiles.setOverride(changes);await applyProfile();}}));
try{labels=diag.run('labels',()=>new WorldLabels($('world-labels')));}catch(error){diag.recovered('labels','Nameplates disabled; object selection remains available.');}
rebuild();controls.apply();
accessUI=new AccessUI(ui,access,{state,changed:refreshAccess});
travel=new Travel({lens:()=>lens,room:()=>context.room,world:()=>world,controls:()=>controls,message:text=>ui.toast(text),preview:e=>ui.edge(e),use:id=>access.use(id,'enter',lens),arrived:id=>{place={id,scene:kind,x:controls.position.x,z:controls.position.z};access.recent(id,lens);updateContext();},scene:next=>new Promise(resolve=>fadeTo(()=>{controls.teleport(0,SPAWN_Z);place=null;rebuild(next);ui.title(next);resolve();})),changed:()=>updateWaypoint()});
const compass=document.createElement('aside');compass.id='compass';compass.hidden=true;compass.innerHTML='<span data-bearing>↑</span><button data-status></button><button data-cancel>Clear</button>';document.body.append(compass);compass.querySelector('[data-cancel]').onclick=()=>{travel.cancel();waypoint=null;world.setWaypoint(null);compass.hidden=true;ui.close();};compass.querySelector('[data-status]').onclick=()=>{if(travel.waiting)ui.edge({...travel.edge,travel:true});};
let expiryState=expirySignature();expiryTimer=setInterval(()=>{const next=expirySignature();if(next!==expiryState){expiryState=next;refreshAccess();ui.toast('Access changed or expired; the scene has been checked again.');}},1000);
function expirySignature(){return access.data.grants.map(g=>g.id+':'+!!g.revokedAt+':'+!!(g.expires&&Date.parse(g.expires)<=Date.now())).join('|');}
function refreshAccess({preserveAccess=false}={}){travel?.cancel();place=null;lens=currentLens();if(world)rebuild();if(page){page.lens=lens;page.render(true);}if(ui.mode==='info')ui.info(ui.infoId,true);if(ui.mode==='atlas')ui.renderAtlas();if(!preserveAccess&&ui.mode==='access'&&accessUI.currentRoom){if(permission(ROOMS[accessUI.currentRoom],lens).visible)accessUI.open(accessUI.currentRoom);else ui.close();}profileUI?.refresh();expiryState=expirySignature();}
function setWaypoint(id){if(graphRoute(context.room,id,lens)===null){ui.toast('No permitted route for a waypoint.');return;}waypoint=id;ui.fadeTitle();updateWaypoint();}
function startTravel(id){ui.close();if(page){page.close();resume3D(pageOrigin);}setWaypoint(id);travel.start(id);}
function goAddress(value){const id=resolveAddress(value,lens);if(!id||roomEntry(id,lens,EDGES).state==='hidden'){ui.toast('No accessible room at that address.');return;}if(graphRoute(context.room,id,lens)===null){accessUI.open(id);return;}startTravel(id);}
function updateWaypoint(){
 const panel=document.getElementById('compass');if(!panel||!world)return;const target=travel?.active?travel.target:waypoint;
 if(!target||!permission(ROOMS[target],lens).visible||roomEntry(target,lens,EDGES).state==='hidden'){panel.hidden=true;world.setWaypoint(null);return;}
 const route=graphRoute(context.room,target,lens);if(route===null){panel.hidden=true;world.setWaypoint(null);waypoint=null;return;}
 let point=approach(ROOMS[target]),via='';if(ROOMS[target].layout.scene!==kind){const door=route.find(e=>e.destination);if(door){point=beforeDoor(door);via=' · next doorway';}}
 if(travel?.active&&travel.door){point=beforeDoor(travel.edge);via=' · doorway';}
 world.setWaypoint(point);const dx=point[0]-controls.position.x,dz=point[1]-controls.position.z,bearing=Math.atan2(-dx,-dz)-controls.smoothYaw;panel.hidden=false;panel.querySelector('[data-bearing]').style.transform=`rotate(${-bearing*180/Math.PI}deg)`;panel.querySelector('[data-status]').textContent=`${travel?.waiting?'At door · tap to continue':travel?.active?'Travelling':'Waypoint'} · ${roomTitle(ROOMS[target],lens)} · ${Math.round(Math.hypot(dx,dz))} m${via}`;panel.querySelector('[data-cancel]').textContent=travel?.active?'Cancel':'Clear';
}

diag.run('first scene update',()=>world.update(0));
diag.run('first render',()=>graphics.render(world.scene,camera));
if(labels)try{diag.run('first label pass',()=>labels.update(world,camera));}catch(error){labels=null;$('world-labels')?.replaceChildren();diag.recovered('first label pass','Nameplates disabled; object selection remains available.');}
try{diag.run('scene HUD',()=>ui.title(kind));}catch(error){diag.recovered('scene HUD','Decorative scene title unavailable; the scene remains usable.');}
window.addEventListener('resize',()=>{try{controls.resetInput();camera.aspect=innerWidth/innerHeight;camera.fov=innerHeight>innerWidth?67:61;camera.updateProjectionMatrix();graphics.resize();}catch(error){diag.fallback('resize',error);}});
reducedQuery.addEventListener('change',()=>{try{controls.reduced=reducedQuery.matches;rebuild();}catch(error){diag.fallback('reduced-motion update',error);}});
document.addEventListener('visibilitychange',()=>{active=!document.hidden&&!document.body.classList.contains('page-mode');controls.resetInput();lastTime=performance.now();frames=0;period=0;});
$('world').addEventListener('webglcontextlost',event=>{event.preventDefault();diag.fallback('graphics context lost',new Error('The browser reported a lost graphics context after initialization.'));});
$('loading').classList.add('done');requestAnimationFrame(loop);
await diag.asyncRun('profile initialization',()=>profiles.ready);if(diag.threeFailed)return;
if(!profiles.completed)diag.run('first-run UI',()=>profileUI.setup());else profileUI.refresh();
diag.setMode(`3D · ${graphics.mode} · shadows ${graphics.renderer.shadowMap.enabled?'on':'off'}`);
const pageButton=document.createElement('button');pageButton.id='page-form-button';pageButton.textContent='Page';pageButton.onclick=()=>openPage(context.room);document.body.append(pageButton);
window.atlasStatus=()=>({mode:document.body.classList.contains('page-mode')?'page':'3d',renderMode:graphics.mode,shadows:graphics.renderer.shadowMap.enabled,safe:diag.safe,scene:kind,room:page?.room??context.room,fps:Math.round(fps),drawCalls:graphics.calls,dpr:graphics.ratio,triangles:graphics.renderer.info.render.triangles,position:{x:controls.position.x,z:controls.position.z},reducedMotion:reducedQuery.matches});
if(diag.params.get('form')==='3d'){lens.form='3d';profiles.preferences(lens);}
if(profiles.completed&&lens.form==='page')openPage(context.room);
const initialRoom=diag.params.get('room');if(initialRoom&&ROOMS[initialRoom]&&profiles.completed&&initialRoom!==context.room)readRoom(initialRoom,false);
const invite=diag.params.get('invite');if(invite)access.redeem(invite,lens).then(id=>{ui.toast('Local invite accepted.');startTravel(id);}).catch(error=>ui.toast(error.message));
if(new URLSearchParams(location.search).has('test')){
  window.__atlas={travel,access,go:startTravel,waypoint:setWaypoint,state:()=>({kind,context,lens:structuredClone(lens),profiles:profiles.profiles.map(p=>({id:p.id,name:p.name,seed:p.seed})),activeProfile:profiles.activeId,testActive:profiles.testActive(),receiptCount:profiles.entries.length,position:controls.position.clone(),edges:world.edgeObjects.map(e=>({id:e.id,result:e.result})),...window.atlasStatus()}),position:(x,z,yaw=0)=>{controls.teleport(x,z,yaw);updateContext();},canStand:(x,z)=>world.canStand(x,z),pick:(id)=>id.startsWith('edge:')?ui.edge(world.edgeObjects.find(e=>e.id===id.slice(5))):ui.info(id),close:()=>ui.close(),changeScene,scene:()=>world.scene};
}
}
