import {viewRoom,versionLabel} from './audience.js';
import {itemStyle} from './item-style.js';
import {layerSelection} from './layers.js';
import {permission,roomTitle} from './permissions.js';
import * as THREE from '../vendor/three/three.module.min.js';
import { ROOMS, EDGES, DISTRICTS } from './data.js';
import {drawModel} from './world-models.js';
import { visibleEdge, roomVisible } from './rules.js';
const geo={box:new THREE.BoxGeometry(1,1,1),cylinder:new THREE.CylinderGeometry(1,1,1,10),cone:new THREE.ConeGeometry(1,1,9),orb:new THREE.IcosahedronGeometry(1,1),diamond:new THREE.OctahedronGeometry(1,0),ring:new THREE.TorusGeometry(1,.035,6,36),sphere:new THREE.SphereGeometry(1,12,8)};
const material={
  ghost:new THREE.MeshBasicMaterial({color:0x8b929c,transparent:true,opacity:.2,wireframe:true,depthWrite:false}),
  stone:new THREE.MeshStandardMaterial({color:0xffffff,roughness:.93,flatShading:true}),
  wood:new THREE.MeshStandardMaterial({color:0xffffff,roughness:.84,flatShading:true}),
  metal:new THREE.MeshStandardMaterial({color:0xffffff,roughness:.4,metalness:.5}),
  leaf:new THREE.MeshStandardMaterial({color:0xffffff,roughness:.95,flatShading:true}),
  teal:new THREE.MeshStandardMaterial({color:0x65ddcf,emissive:0x53cdbd,emissiveIntensity:3.7,roughness:.4}),
  amber:new THREE.MeshStandardMaterial({color:0xf6d59b,emissive:0xffbf61,emissiveIntensity:4,roughness:.35}),
  blue:new THREE.MeshStandardMaterial({color:0x9ebeff,emissive:0x5d92ff,emissiveIntensity:3.4,roughness:.4}),
  pink:new THREE.MeshStandardMaterial({color:0xe7a3eb,emissive:0xc265df,emissiveIntensity:3,roughness:.4}),
  glass:new THREE.MeshStandardMaterial({color:0x91bccc,emissive:0x264c69,emissiveIntensity:.25,transparent:true,opacity:.19,roughness:.25,metalness:.15,depthWrite:false,side:THREE.DoubleSide}),
  water:new THREE.MeshStandardMaterial({color:0x246b73,emissive:0x154f5d,emissiveIntensity:.4,roughness:.25,metalness:.45}),
};
const stoneCanvas=document.createElement('canvas');stoneCanvas.width=256;stoneCanvas.height=256;
const stoneContext=stoneCanvas.getContext('2d');stoneContext.fillStyle='#b9beb4';stoneContext.fillRect(0,0,256,256);
const stoneNoise=random(947);for(let i=0;i<10000;i++){const n=Math.floor(120+stoneNoise()*95);stoneContext.fillStyle=`rgba(${n},${n},${n},.16)`;stoneContext.fillRect(stoneNoise()*256,stoneNoise()*256,1+stoneNoise()*2,1+stoneNoise()*2);}
const stoneTexture=new THREE.CanvasTexture(stoneCanvas);stoneTexture.wrapS=stoneTexture.wrapT=THREE.RepeatWrapping;stoneTexture.repeat.set(9,9);stoneTexture.colorSpace=THREE.SRGBColorSpace;stoneTexture.anisotropy=4;
material.ground=new THREE.MeshStandardMaterial({color:0xffffff,map:stoneTexture,roughness:.96});
function random(seed){let a=seed;return()=>{a=(a*1664525+1013904223)>>>0;return a/4294967296;};}
const pose=new THREE.Object3D();
const makersSun=new THREE.Color(0xffdfad),commonsSun=new THREE.Color(0xd2e6c3);
export class World {
  constructor(kind,lens,reduced=false,diffLens=null){
    this.diffLens=diffLens;
    this.kind=kind;this.lens=lens;this.reduced=reduced;this.scene=new THREE.Scene();this.scene.background=new THREE.Color('#172739');this.scene.fog=new THREE.FogExp2('#263b48',.018);
    this.labels=[];this.batches=new Map();this.colliders=[];this.pickables=[];this.animated=[];this.dynamicResources=[];this.edgeObjects=[];this.granted=new Set();this.trees=0;
    this.scene.add(new THREE.HemisphereLight(0xb5cdec,0x536452,1.3));
    const sun=new THREE.DirectionalLight(0xffdfad,2.2);sun.position.set(-13,23,10);sun.castShadow=true;sun.shadow.mapSize.set(1024,1024);sun.shadow.camera.left=-34;sun.shadow.camera.right=34;sun.shadow.camera.top=29;sun.shadow.camera.bottom=-29;sun.shadow.camera.near=1;sun.shadow.camera.far=80;sun.shadow.bias=-.00035;sun.shadow.normalBias=.035;this.scene.add(sun);this.sun=sun;
    this.ground();
    if(kind==='studio')this.studio();else this.history();
    this.renderRooms();this.particles();this.flush();
    this.scene.userData.view={profile:lens.profileId,rooms:this.renderedRooms};this.scene.updateMatrixWorld(true);
  }
  add(shape,mat,x,y,z,sx=1,sy=1,sz=1,color='#ffffff',id=null,rotation=[0,0,0]){
    if(this.placement){
      const p=this.transform(x,y,z);x=p.x;y=p.y;z=p.z;const scale=this.placement.scale;sx*=scale;sy*=scale;sz*=scale;
      const q=new THREE.Quaternion().setFromEuler(new THREE.Euler(...rotation)).premultiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0,1,0),this.placement.facing));const e=new THREE.Euler().setFromQuaternion(q);rotation=[e.x,e.y,e.z];
    }
    if(this.placement?.ghost){mat='ghost';color='#a0a8b4';id=null;}else if(this.placement?.style){const st=this.placement.style;color=new THREE.Color(color).lerp(new THREE.Color(st.accent),st.mix).getStyle();}
    const key=shape+'|'+mat;let batch=this.batches.get(key);if(!batch){batch={shape,mat,items:[]};this.batches.set(key,batch);}
    batch.items.push({x,y,z,sx,sy,sz,color,id,rotation});
  }
  box(x,y,z,w,h,d,c,mat='stone',id=null,rotation){this.add('box',mat,x,y,z,w,h,d,c,id,rotation);}
  block(x,z,w,d){if(this.placement?.ghost)return;if(this.placement){const p=this.transform(x,0,z),c=Math.abs(Math.cos(this.placement.facing)),s=Math.abs(Math.sin(this.placement.facing)),scale=this.placement.scale;x=p.x;z=p.z;[w,d]=[(c*w+s*d)*scale,(s*w+c*d)*scale];}this.colliders.push({x,z,w:w/2+.24,d:d/2+.24});}
  transform(x,y,z){const l=this.placement;return new THREE.Vector3(x,y,z).multiplyScalar(l.scale).applyAxisAngle(new THREE.Vector3(0,1,0),l.facing).add(new THREE.Vector3(l.slot[0],0,l.slot[1]));}
  placeMesh(mesh,id){if(this.placement.ghost){mesh.material=material.ghost;id=null;if(mesh.userData.ids)mesh.userData.ids.fill(null);}else if(this.placement.style){mesh.material=mesh.material.clone();this.dynamicResources.push(mesh.material);mesh.material.color?.lerp(new THREE.Color(this.placement.style.accent),this.placement.style.mix);}
    mesh.position.copy(this.transform(...mesh.position.toArray()));mesh.scale.multiplyScalar(this.placement.scale);mesh.quaternion.premultiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0,1,0),this.placement.facing));mesh.userData.id=id;this.scene.add(mesh);this.pickables.push(mesh);}
  renderRooms(){
    this.geometry=geo;this.material=material;this.renderedRooms=[];
    const visible=(id,lens)=>roomVisible(id,lens)&&!EDGES.some(e=>e.to===id&&visibleEdge(e,lens).state==='hidden');
    for(const [id,original] of Object.entries(ROOMS)){
      if(original.layout?.scene!==this.kind)continue;
      const own=visible(id,this.lens),other=this.diffLens&&visible(id,this.diffLens),rights=permission(original,this.lens),ghost=!own&&other&&rights.visibility==='public';
      if(!own&&!ghost)continue;
      const r=viewRoom(original,ghost?this.diffLens:this.lens),style=itemStyle(r,ghost?this.diffLens:this.lens);
      this.placement={scale:1,facing:0,...r.layout,style,ghost};if(rights.canLook)this.placement.scale*=style.scale;
      drawModel(this,rights.canLook?(r.layout.model??r.layout.landmark??r.layout.kind):'boundary',id);
      this.renderedRooms.push({id,ghost:!!ghost,version:r.version?.id,style:rights.canLook?style:null});
      if(r.layout.sign!==false){const sign=!rights.canLook?['PRIVATE SPACE','KNOCK FOR ACCESS',[0,3.1,0]]:r.layout.sign??[r.title,'TAP TO READ',[0,2.5,0]],p=this.transform(...sign[2]);this.label((ghost?'◇ ':'')+sign[0]+(r.version?' · '+r.version.name:''),ghost?'OTHER LENS · NO ACCESS':versionLabel(r,this.lens)||sign[1],p.x,p.y,p.z,ghost?null:id,3.1,ghost?'#a0a8b4':DISTRICTS[r.district].color);}
      if(this.diffLens&&own&&rights.visibility==='public'&&(!other||viewRoom(original,this.diffLens).version?.id!==r.version?.id))this.add('ring','ghost',0,.15,0,2,2,2,'#aaa',null,[Math.PI/2,0,0]);
      if(!ghost&&rights.canLook){
        for(const [i,{layer}] of layerSelection(original,this.lens).filter(x=>!x.accepted).entries())this.add('diamond','teal',-1+i*.9,2.2,1.9,.16,.25,.16,'#fff','layer:'+id+':'+layer.id);
        for(const agent of (this.lens.access?.presence??[]).filter(p=>p.room===r.id&&p.agent)){
          this.add('diamond','teal',1.4,1.7,0,.18,.3,.18,'#fff',id);const p=this.transform(1.4,2.4,0);this.label('◇ '+agent.name,'AGENT PRESENT · SIMULATED',p.x,p.y,p.z,id);
        }
      }
      this.placement=null;
    }
  }
  flush(){
    for(const batch of this.batches.values()){
      const mesh=new THREE.InstancedMesh(geo[batch.shape],material[batch.mat],batch.items.length);
      mesh.castShadow=['stone','wood','leaf','metal'].includes(batch.mat);mesh.receiveShadow=!['glass','teal','amber','blue','pink'].includes(batch.mat);
      mesh.userData.ids=[];
      batch.items.forEach((p,i)=>{pose.position.set(p.x,p.y,p.z);pose.scale.set(p.sx,p.sy,p.sz);pose.rotation.set(...p.rotation);pose.updateMatrix();mesh.setMatrixAt(i,pose.matrix);mesh.setColorAt(i,new THREE.Color(p.color));mesh.userData.ids[i]=p.id;});
      mesh.instanceMatrix.needsUpdate=true;mesh.computeBoundingSphere();this.scene.add(mesh);if(batch.items.some(x=>x.id))this.pickables.push(mesh);
    }
    this.batches.clear();
  }
  label(title,sub,x,y,z,id=null,width=3.1,color){this.labels.push({title,sub,position:new THREE.Vector3(x,y,z),id,color});}
  tree(x,z,size=1,seed=1){
    const r=random(seed*174+23),y=1.6*size;
    this.add('cylinder','wood',x,y,z,.2*size,3.2*size,.22*size,'#746452');
    for(let i=0;i<3;i++){const a=i*2.1+r(),s=(.9+r()*.5)*size;this.add('orb','leaf',x+Math.sin(a)*size*.85,3.5*size+r()*.4,z+Math.cos(a)*size*.7,s*1.35,s*.65,s,['#477b6b','#628967','#385e5f'][i]);}
    this.add('cylinder','wood',x+.5*size,2.45*size,z,.12*size,1.65*size,.13*size,'#75664f',null,[0,0,-.65]);
    this.block(x,z,.5*size,.5*size);this.trees++;
  }
  planter(x,z,size=1){this.add('cylinder','stone',x,.22,z,.62*size,.42,.62*size,'#69756a');for(let i=0;i<3;i++)this.add('cone','leaf',x+(i-1)*.17,.7,z,.35*size,.9*size,.38*size,['#88a373','#577c65','#6c9273'][i]);this.block(x,z,.8*size,.8*size);}
  lamp(x,z,color='amber'){this.add('cylinder','metal',x,.65,z,.045,1.3,.045,'#566962');this.add('cylinder',color,x,1.35,z,.12,.3,.12);this.add('cone','metal',x,1.57,z,.2,.14,.2,'#48665e');}
  ground(){
    this.box(6,-.46,0,90,.8,85,'#303f43');
    const r=random(317);
    for(let i=0;i<34;i++){const a=i/34*Math.PI*2,rr=34+r()*10;this.add('cone','stone',Math.cos(a)*rr,-.7,Math.sin(a)*rr,4+r()*5,5+r()*9,4+r()*4,i%2?'#304e52':'#2a424e');}
    // A procedural night sky. No downloaded textures or models.
    const pts=[];for(let i=0;i<210;i++){const a=r()*Math.PI*2,el=r()*1.3+.1,rr=72;pts.push(Math.cos(a)*Math.cos(el)*rr,Math.sin(el)*rr,Math.sin(a)*Math.cos(el)*rr);}
    const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(pts,3));const m=new THREE.PointsMaterial({color:'#bed5dc',size:.1,transparent:true,opacity:.7,fog:false});this.scene.add(new THREE.Points(g,m));this.dynamicResources.push(g,m);
    this.add('sphere','amber',-28,33,-52,1.25,1.25,1.25,'#c4d1d0');
    const skyGeometry=new THREE.SphereGeometry(90,24,12),skyMaterial=new THREE.ShaderMaterial({side:THREE.BackSide,depthWrite:false,vertexShader:'varying vec3 p;void main(){p=position;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',fragmentShader:'varying vec3 p;void main(){float h=normalize(p).y;vec3 horizon=vec3(.035,.055,.07),zenith=vec3(.005,.01,.025);float a=pow(max(0.,h),.48);vec3 c=mix(horizon,zenith,a);gl_FragColor=vec4(c,1.);}'});const sky=new THREE.Mesh(skyGeometry,skyMaterial);this.scene.add(sky);this.dynamicResources.push(skyGeometry,skyMaterial);
  }
  floor(x,z,w,d,c){this.box(x,-.028,z,w,.1,d,c,'ground');}
  path(x,z,w,d){this.floor(x,z,w,d,'#536963');this.box(x,.025,z,w-.15,.015,d-.15,'#536963','ground');
    if(d>w){for(let i=0;i<Math.floor(d/1.5);i++)this.box(x,.04,z-d/2+.6+i*1.5,w-.2,.013,.022,'#8b9b86');}}
  table(x,z,id,c='#a69672'){
    this.box(x,.94,z,2.65,.18,1.3,c,'wood',id);this.box(x,.78,z,2.7,.09,1.35,'#a8b19c','metal',id);
    for(const dx of [-1,1])this.box(x+dx,.41,z,.15,.82,.85,'#475e5a','metal',id);this.block(x,z,2.8,1.5);
  }
  book(x,y,z,c,id){this.box(x,y,z,.34,.08,.48,c,'wood',id);this.box(x,y+.047,z,.3,.012,.42,'#dccba5','stone',id);}
  arch(edge,result){
    const [x,z]=edge.position,rot=edge.axis==='x'?Math.PI/2:0,color=result.type==='window'?'pink':result.type==='embedded'?'blue':'amber';
    const part=(dx,y,w,h,d,mat)=>{const px=x+Math.cos(rot)*dx,pz=z-Math.sin(rot)*dx;this.box(px,y,pz,w,h,d,'#fff',mat,'edge:'+edge.id,[0,rot,0]);};
    part(-1.55,1.65,.25,3.3,.42,'stone');part(1.55,1.65,.25,3.3,.42,'stone');part(0,3.25,3.36,.25,.45,'stone');
    part(-1.39,1.65,.055,3,.12,color);part(1.39,1.65,.055,3,.12,color);part(0,3.08,2.8,.055,.12,color);
    for(const dx of [-1.55,1.55]){part(dx,.22,.65,.45,.8,'stone');part(dx,3.53,.24,.22,.3,color);}
    const uniforms={time:{value:0},tint:{value:new THREE.Color(color==='blue'?'#729bee':color==='pink'?'#b483ca':'#cfbd83')},opacity:{value:result.type==='window'?.16:.42}};
    const mat=new THREE.ShaderMaterial({transparent:true,depthWrite:false,side:THREE.DoubleSide,uniforms,
      vertexShader:'varying vec2 vUv; void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',
      fragmentShader:`varying vec2 vUv;uniform float time,opacity;uniform vec3 tint;void main(){float rim=pow(abs(vUv.x-.5)*2.,9.);float line=pow(.5+.5*sin(vUv.y*36.-time*.65),18.);float center=(1.-vUv.y)*.13;gl_FragColor=vec4(tint*(.22+rim*2.8+line*.12),opacity+rim*.4+center);}`});
    const plane=new THREE.Mesh(new THREE.PlaneGeometry(2.8,3),mat);plane.position.set(x,1.55,z);plane.rotation.y=rot;plane.userData.id='edge:'+edge.id;this.scene.add(plane);this.pickables.push(plane);this.dynamicResources.push(plane.geometry,mat);this.animated.push({type:'portal',object:plane});
    const room=ROOMS[edge.to],title=roomTitle(room,this.lens);this.label(title,`${result.type} · ${result.reasons.length?'LENS PREVIEW':'TAP TO EXPLORE'}`,x,3.99,z,'edge:'+edge.id,3.75);
  }
  edge(edge){
    const result=visibleEdge(edge,this.lens);const item={...edge,result};this.edgeObjects.push(item);
    if(result.state==='hidden'){
      const [x,z]=edge.position;this.planter(x,z,1.25);this.planter(x+1.5,z-.6,.8);return false;
    }
    if(result.type==='seamless'){
      const [x,z]=edge.position,across=edge.axis==='x';const ground=new THREE.PlaneGeometry(across?7:3.7,across?3.7:7,8,8),p=ground.attributes.position,colors=[];
      const a=new THREE.Color(this.kind==='studio'?'#425e56':'#4b665b'),b=new THREE.Color(edge.to==='capitol'?'#748c88':'#3d6153');
      for(let i=0;i<p.count;i++){const t=THREE.MathUtils.smoothstep((across?p.getX(i):p.getY(i)),-3.5,3.5),c=a.clone().lerp(b,t);colors.push(c.r,c.g,c.b);}
      ground.setAttribute('color',new THREE.Float32BufferAttribute(colors,3));
      const groundMat=new THREE.MeshStandardMaterial({color:0xffffff,vertexColors:true,roughness:.96,map:stoneTexture});
      const band=new THREE.Mesh(ground,groundMat);band.rotation.x=-Math.PI/2;band.position.set(x,.052,z);band.receiveShadow=true;this.scene.add(band);this.dynamicResources.push(ground,groundMat);
      for(const side of [-1,1]){this.box(x+(across?0:side*1.8),.033,z+(across?side*1.8:0),across?6.8:.045,.015,across?.045:6.8,'#659b91');}
    }else this.arch(edge,result);
    return true;
  }
  studio(){
    this.floor(0,0,25,27,'#425e56');this.floor(22,1,19,24,'#3d6153');
    this.path(0,0,4,25);this.path(10,1,24,3.8);this.path(-6,1,13,3.2);
    // Small garden islands frame the first portrait view, with instanced foliage and stone.
    for(const [gx,gz] of [[-3.3,3],[3.7,1.5],[3.6,-8]]){
      this.add('cylinder','stone',gx,.06,gz,1,.22,1,'#87917b');
      for(let i=0;i<7;i++){const a=i*2.4;this.add('cone','leaf',gx+Math.sin(a)*.6,.32,gz+Math.cos(a)*.6,.2,.55,.22,i%2?'#6e8b62':'#91a77a');}
      this.block(gx,gz,1.7,1.7);
    }
    // Inset pavers make the open courtyard read as a built place.
    for(let i=0;i<10;i++)for(const side of [-1,1])this.box(side*1.9,.025,10-i*2.4,.035,.02,1.8,'#aec0a5');
    for(const [x,z,s] of [[-11,9,1.3],[9,9,1.5],[-11,-11,1.5],[9,-11,1.7],[-15,1,1.8],[14,9,1.5],[26,10,1.5],[17,-11,1.3],[33,-8,1.7]])this.tree(x,z,s,this.trees+2);
    for(const [x,z] of [[-2.9,6],[2.9,6],[-2.9,-7],[2.9,-7],[13,3.8],[23,3.8],[-10,6],[9,5]])this.lamp(x,z);
    this.tree(-3.8,-10,1.5,171);this.tree(3.8,-10,1.55,181);
    // Three open pavilion roofs; walls stay low to keep the walking paths legible.
    for(const [x,z,w] of [[-5,-5,6],[6,-5.5,6.5],[-8,2.5,5.2]]){
      for(const dx of [-w/2,w/2])this.box(x+dx,1.7,z-2,.18,3.4,.18,'#796a50','wood');
      this.box(x,3.5,z-2,w+.6,.16,.38,'#aa9268','wood');
      for(let i=0;i<6;i++)this.box(x-w/2+i*w/5,3.55,z,.12,.14,4.4,'#9e8e6c','wood');
    }
    for(const e of EDGES.filter(e=>e.scene==='studio'))this.edge(e);
  }
  history(){
    this.floor(0,-2,26,33,'#4b665b');this.path(0,-2,4.4,32);this.path(0,1,23,3.5);this.path(6,7,12,3);
    for(let i=0;i<7;i++){this.tree(-4.3,8-i*3.8,1.25+(i%2)*.2,80+i);this.tree(4.3,8-i*3.8,1.35,90+i);}
    for(const [x,z] of [[-2.7,6],[2.7,6],[-2.7,-1],[2.7,-1],[-2.7,-9],[2.7,-9]])this.lamp(x,z,'blue');
    for(const e of EDGES.filter(e=>e.scene==='history'))this.edge(e);
  }
  particles(){
    const r=random(this.kind==='studio'?33:71),count=this.kind==='studio'?95:130,p=new Float32Array(count*3),phase=new Float32Array(count);
    for(let i=0;i<count;i++){p[i*3]=r()*(this.kind==='studio'?45:25)-12;p[i*3+1]=.4+r()*3.8;p[i*3+2]=r()*25-13;phase[i]=r()*Math.PI*2;}
    this.particleBase=p.slice();this.particlePhase=phase;
    const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.BufferAttribute(p,3));
    const m=new THREE.ShaderMaterial({transparent:true,depthWrite:false,blending:THREE.AdditiveBlending,uniforms:{color:{value:new THREE.Color(this.kind==='studio'?'#e9cf81':'#84cddc')}},vertexShader:'void main(){vec4 p=modelViewMatrix*vec4(position,1.);gl_Position=projectionMatrix*p;gl_PointSize=clamp(36./-p.z,1.,6.);}',fragmentShader:'uniform vec3 color;void main(){float d=length(gl_PointCoord-.5)*2.;gl_FragColor=vec4(color*2.,pow(max(0.,1.-d),2.)*.65);}'});
    this.dust=new THREE.Points(g,m);this.scene.add(this.dust);this.dynamicResources.push(g,m);
    if(this.fountainLayout){
      const wg=new THREE.BufferGeometry(),v=new Float32Array(48*3);wg.setAttribute('position',new THREE.BufferAttribute(v,3));
      const wm=new THREE.PointsMaterial({color:0xa4e8f0,size:.055,transparent:true,opacity:.7,depthWrite:false});this.waterPoints=new THREE.Points(wg,wm);this.scene.add(this.waterPoints);this.dynamicResources.push(wg,wm);
    }
  }
  setWaypoint(point){
    if(!point){if(this.waypoint)this.waypoint.visible=false;return;}
    if(!this.waypoint){this.waypoint=new THREE.Group();const marker=new THREE.Mesh(geo.diamond,material.teal);marker.scale.set(.18,.55,.18);this.waypoint.add(marker);const ring=new THREE.Mesh(geo.ring,material.teal);ring.scale.set(.4,.4,.4);ring.rotation.x=Math.PI/2;ring.position.y=-2.3;this.waypoint.add(ring);this.scene.add(this.waypoint);}
    this.waypoint.visible=true;this.waypoint.position.set(point[0],2.5,point[1]);
  }
  update(t,position){
    if(this.waypoint?.visible){this.waypoint.rotation.y=t*.35;this.waypoint.position.y=2.5+Math.sin(t*1.5)*.08;}
    if(position&&this.kind==='studio')this.sun.color.copy(makersSun).lerp(commonsSun,THREE.MathUtils.smoothstep(position.x,9,17));
    const time=this.reduced?0:t;
    for(const a of this.animated){
      if(a.type==='agent'){a.object.position.y=a.base+Math.sin(time*.9)*.065;a.object.rotation.y=time*.2;}
      if(a.type==='portal')a.object.material.uniforms.time.value=time;
      if(a.type==='nodes'){for(let i=0;i<16;i++){const x=i%4,z=Math.floor(i/4),h=.18+Math.sin(time*1.4+x*.65+z*.4)*.1;pose.position.set(-.6+x*.4,1.22+h,-.6+z*.4);pose.rotation.set(0,0,0);pose.scale.set(.08,.08,.08);pose.updateMatrix();a.object.setMatrixAt(i,pose.matrix);}a.object.instanceMatrix.needsUpdate=true;}
    }
    if(!this.reduced){const p=this.dust.geometry.attributes.position;for(let i=0;i<p.count;i++){p.array[i*3+1]=this.particleBase[i*3+1]+Math.sin(time*.35+this.particlePhase[i])*.18;}p.needsUpdate=true;}
    if(this.waterPoints){const p=this.waterPoints.geometry.attributes.position;for(let i=0;i<p.count;i++){const a=i*2.4,f=(time*.4+i/48)%1;p.setXYZ(i,this.fountainLayout.slot[0]+Math.cos(a)*f*1.5,1+Math.sin(f*Math.PI)*.85-f*.7,this.fountainLayout.slot[1]+Math.sin(a)*f*1.5);}p.needsUpdate=true;}
  }
  zone(edge,x,z){
    const b=edge.zone;return !!b&&(!b.x||(x>b.x[0]&&x<b.x[1]))&&(!b.z||(z>b.z[0]&&z<b.z[1]));
  }
  canStand(x,z){
    if(x<(this.kind==='studio'?-13.5:-13)||x>(this.kind==='studio'?34.2:13)||z<(this.kind==='studio'?-14.5:-20)||z>12)return false;
    for(const c of this.colliders)if(Math.abs(x-c.x)<c.w&&Math.abs(z-c.z)<c.d)return false;
    for(const e of this.edgeObjects){if(this.zone(e,x,z)&&(()=>{const r=visibleEdge(e,this.lens);return r.state==='hidden'||r.state==='private'||r.type==='window'||(r.type==='door'&&!this.granted.has(e.id));})())return false;}
    return true;
  }
  nearest(x,z,yaw=0){let found=null,dist=Infinity;for(const e of this.edgeObjects){if(e.result.state==='hidden')continue;const dx=e.position[0]-x,dz=e.position[1]-z,d=Math.hypot(dx,dz);if(d>1.4&&(-Math.sin(yaw)*dx-Math.cos(yaw)*dz)<.1)continue;if(d<4&&d<dist){dist=d;found=e;}}return found;}
  context(x,z){
    const e=[...this.edgeObjects].filter(e=>e.contextPriority>=0).sort((a,b)=>a.contextPriority-b.contextPriority).find(e=>e.result.state!=='hidden'&&this.zone(e,x,z));
    if(e)return {room:e.to,...(e.host?{inside:ROOMS[e.host].title}:{})};
    return {room:Object.entries(ROOMS).find(([,r])=>r.layout?.scene===this.kind&&r.layout.root)?.[0]??'studio'};
  }
  dispose(){this.scene.traverse(o=>{if(o.isInstancedMesh)o.dispose();});for(const r of this.dynamicResources)r.dispose();this.sun.shadow.map?.dispose();}
}
