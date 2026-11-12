import * as THREE from '../vendor/three/three.module.min.js';
import { ROOMS, EDGES, DISTRICTS, EXHIBITS } from './data.js';
import { visibleEdge, roomVisible } from './rules.js';
const geo={box:new THREE.BoxGeometry(1,1,1),cylinder:new THREE.CylinderGeometry(1,1,1,10),cone:new THREE.ConeGeometry(1,1,9),orb:new THREE.IcosahedronGeometry(1,1),diamond:new THREE.OctahedronGeometry(1,0),ring:new THREE.TorusGeometry(1,.035,6,36),sphere:new THREE.SphereGeometry(1,12,8)};
const material={
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
const labelCache=new Map();
function labelMaterial(title,sub,color='#c2eddf'){
  const key=title+'|'+sub+'|'+color;if(labelCache.has(key))return labelCache.get(key);
  const canvas=document.createElement('canvas');canvas.width=768;canvas.height=176;const c=canvas.getContext('2d');
  c.fillStyle='#101e29ee';c.beginPath();c.roundRect(2,2,764,170,20);c.fill();c.strokeStyle='#627b8388';c.lineWidth=2;c.stroke();
  c.fillStyle=color;c.fillRect(30,34,5,103);c.font='500 34px system-ui';c.fillStyle='#edf4f3';c.fillText(title,58,76,674);c.font='500 19px system-ui';c.fillStyle='#b9ced1';c.fillText(sub.toUpperCase(),59,121,660);
  const t=new THREE.CanvasTexture(canvas);t.colorSpace=THREE.SRGBColorSpace;t.anisotropy=2;
  const mat=new THREE.SpriteMaterial({map:t,transparent:true,depthTest:true,toneMapped:false});labelCache.set(key,mat);return mat;
}
function random(seed){let a=seed;return()=>{a=(a*1664525+1013904223)>>>0;return a/4294967296;};}
const pose=new THREE.Object3D();
const makersSun=new THREE.Color(0xffdfad),commonsSun=new THREE.Color(0xd2e6c3);
export class World {
  constructor(kind,lens,reduced=false){
    this.kind=kind;this.lens=lens;this.reduced=reduced;this.scene=new THREE.Scene();this.scene.background=new THREE.Color('#172739');this.scene.fog=new THREE.FogExp2('#263b48',.018);
    this.batches=new Map();this.colliders=[];this.pickables=[];this.animated=[];this.dynamicResources=[];this.edgeObjects=[];this.granted=new Set();this.trees=0;
    this.scene.add(new THREE.HemisphereLight(0xb5cdec,0x536452,1.3));
    const sun=new THREE.DirectionalLight(0xffdfad,2.2);sun.position.set(-13,23,10);sun.castShadow=true;sun.shadow.mapSize.set(1024,1024);sun.shadow.camera.left=-34;sun.shadow.camera.right=34;sun.shadow.camera.top=29;sun.shadow.camera.bottom=-29;sun.shadow.camera.near=1;sun.shadow.camera.far=80;sun.shadow.bias=-.00035;sun.shadow.normalBias=.035;this.scene.add(sun);this.sun=sun;
    this.ground();
    if(kind==='studio')this.studio();else this.history();
    this.particles();this.flush();
    this.scene.updateMatrixWorld(true);
  }
  add(shape,mat,x,y,z,sx=1,sy=1,sz=1,color='#ffffff',id=null,rotation=[0,0,0]){
    const key=shape+'|'+mat;let batch=this.batches.get(key);if(!batch){batch={shape,mat,items:[]};this.batches.set(key,batch);}
    batch.items.push({x,y,z,sx,sy,sz,color,id,rotation});
  }
  box(x,y,z,w,h,d,c,mat='stone',id=null,rotation){this.add('box',mat,x,y,z,w,h,d,c,id,rotation);}
  block(x,z,w,d){this.colliders.push({x,z,w:w/2+.24,d:d/2+.24});}
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
  label(title,sub,x,y,z,id=null,width=3.1,color){const s=new THREE.Sprite(labelMaterial(title,sub,color));s.position.set(x,y,z);s.scale.set(width,width*176/768,1);s.userData.id=id;this.scene.add(s);if(id)this.pickables.push(s);return s;}
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
    const room=ROOMS[edge.to],title=room.title;this.label(title,`${result.type} · ${result.reasons.length?'LENS PREVIEW':'TAP TO EXPLORE'}`,x,3.99,z,'edge:'+edge.id,3.75);
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
    if(roomVisible('workbench',this.lens)){
      this.table(-2.8,-4,'workbench');this.book(-3.45,1.09,-4,'#c7915c','workbench');
      this.add('cylinder','metal',-2.8,1.13,-4,.48,.13,.48,'#56746b','workbench');
      this.label('SECOND LOOK','WORKBENCH · BRANCH ALLOWED',-3.15,2.5,-4.35,'workbench',2.4,'#f2bc73');
    }
    // The agent is independent of the human-author display filter.
    if(roomVisible('silver',this.lens)){
      const mat=material.teal.clone();mat.wireframe=true;mat.emissiveIntensity=this.lens.show.agent?3.7:.75;mat.color.set(this.lens.show.agent?'#99e8d8':'#84a69e');
      const diamond=new THREE.Mesh(geo.diamond,mat);diamond.position.set(-2.8,1.85,-4);diamond.scale.set(.35,.52,.35);diamond.userData.id='silver';this.scene.add(diamond);this.pickables.push(diamond);this.dynamicResources.push(mat);this.animated.push({type:'agent',object:diamond,base:1.85});
      this.add('orb',this.lens.show.agent?'teal':'stone',-2.8,1.85,-4,.1,.1,.1,this.lens.show.agent?'#fff':'#8cb3ab','silver');
      this.label('◇ SILVER','AGENT · VERIFIED OPERATOR',-2.8,3.15,-4.3,'silver',1.8);
    }
    if(roomVisible('governance',this.lens)){this.table(-7,-8,'governance');this.book(-7.7,1.08,-8,'#526a9b','governance');this.add('diamond','amber',-7,1.45,-8,.23,.28,.23,'#fff','governance');this.label('STERLING','GOVERNANCE · SUGGEST ONLY',-7,2.5,-8,'governance');}
    if(roomVisible('research',this.lens)){
      this.box(-10,1.6,-3,1.8,2.6,.18,'#637d77','wood','research');this.block(-10,-3,1.8,.3);
      for(let i=0;i<6;i++){this.box(-10+(i%2-.5)*.72,1.1+Math.floor(i/2)*.62,-2.89,.57,.45,.015,i%2?'#c5b48b':'#9dbfb4','stone','research');this.box(-10+(i%2-.5)*.72,1.12+Math.floor(i/2)*.62,-2.875,.38,.025,.018,'#435a59','wood','research');}
      this.label('RESEARCH','THREADS + SOURCES',-10,3.2,-3,'research',2.7);
    }
    if(roomVisible('civic',this.lens)){this.add('cylinder','wood',6,.9,4,1.45,.18,1.45,'#9f9877','civic');this.add('cylinder','stone',6,.4,4,.55,.8,.55,'#57756f','civic');this.block(6,4,2.9,2.9);for(let i=0;i<5;i++)this.add('diamond','teal',6+Math.sin(i*1.26)*.7,1.12,4+Math.cos(i*1.26)*.7,.09,.17,.09,'#fff','civic');this.label('CIVIC TABLE','COMMUNITY · OPEN SUBSTANCE',6,2.35,4,'civic',3.2);}
    // Private boundary: no family-room contents are created.
    this.box(-12,1.4,-8,1.7,2.8,.3,'#334c54','wood','family');this.box(-12,2.85,-8,2,.18,.5,'#b6a077','wood','family');this.add('orb','amber',-11.4,1.35,-7.81,.055,.055,.055,'#fff','family');this.block(-12,-8,2,.5);this.label('PRIVATE SPACE','tlh/studio/family',-12,3.4,-8,'family',2.8);
    for(const e of EDGES.filter(e=>e.scene==='studio'))this.edge(e);
    if(roomVisible('lab',this.lens)){
      this.floor(7,-6.2,5.6,4,'#394e62');this.box(7,1.55,-8.2,5.8,3,.15,'#344b60');
      this.table(7,-6.7,'lab','#7089a0');this.block(7,-6.5,5.3,4.3);
      const nodes=new THREE.InstancedMesh(geo.orb,material.blue,16);nodes.userData.ids=Array(16).fill('lab');this.scene.add(nodes);this.pickables.push(nodes);this.animated.push({type:'nodes',object:nodes});
      for(let i=0;i<4;i++){this.box(7,1.12,-7.3+i*.4,1.6,.018,.018,'#82bcc5','metal','lab');this.box(6.4+i*.4,1.12,-6.7,.018,.018,1.6,'#82bcc5','metal','lab');}
    }
    if(roomVisible('broadcast',this.lens)){
      this.floor(-8,1.7,4.8,5,'#445c6b');this.box(-10.5,1.25,1.7,.12,2.5,5,'#688b8f','glass','broadcast');this.block(-10.5,1.7,.2,5);
      this.box(-8,1.25,-.8,5.1,2.5,.15,'#3c5364','wood','broadcast');this.block(-8,-.8,5.1,.15);
      this.label('ON AIR','DANGEROUSLY REASONABLE',-8,3.3,3.9,'broadcast',3.4,'#9ebeff');
      if(visibleEdge(EDGES.find(e=>e.to==='listening'),this.lens).state!=='hidden'){this.box(-8,.5,.3,2,.75,.75,'#7d8f98','wood','listening');this.add('ring','blue',-8,1.3,.1,.33,.33,.33,'#fff','listening');}
    }
    this.label('THE COMMONS','FOLLOW THE GREEN PATH →',13,2.1,1,'commons',3.5,'#bde5ac');
    if(visibleEdge(EDGES.find(e=>e.to==='market'),this.lens).state!=='hidden'){
      this.floor(22,-9,8,7,'#667463');
      for(let i=0;i<3;i++){const x=19+i*3;this.box(x,1,-9,2.1,.18,1,'#a38c69','wood','market');this.box(x,2.5,-9,2.6,.18,2,'#7e9290','wood','market');this.box(x-.95,1.7,-9,.1,1.6,.1,'#887c63','wood','market');this.box(x+.95,1.7,-9,.1,1.6,.1,'#887c63','wood','market');this.add('sphere','amber',x,2.1,-8.7,.2,.25,.2,'#fff','market');this.block(x,-9,2,1);}
      this.label('NIGHT MARKET','LANTERNS + LATE CONVERSATIONS',22,3.35,-9,'market',4,'#f2bc73');
    }
    if(visibleEdge(EDGES.find(e=>e.to==='night'),this.lens).state!=='hidden'){
      this.floor(32,2,5,6,'#72536c');this.add('ring','pink',33,2.3,2,.8,.8,.8,'#fff','night',[0,Math.PI/2,0]);this.label('AFTER DARK','VERIFIED ADULTS · SIMULATED',32,3.5,2,'night',3.6,'#ecb4eb');
    }
  }
  history(){
    this.floor(0,-2,26,33,'#4b665b');this.path(0,-2,4.4,32);this.path(0,1,23,3.5);this.path(6,7,12,3);
    for(let i=0;i<7;i++){this.tree(-4.3,8-i*3.8,1.25+(i%2)*.2,80+i);this.tree(4.3,8-i*3.8,1.35,90+i);}
    for(const [x,z] of [[-2.7,6],[2.7,6],[-2.7,-1],[2.7,-1],[-2.7,-9],[2.7,-9]])this.lamp(x,z,'blue');
    for(const e of EDGES.filter(e=>e.scene==='history'))this.edge(e);
    this.edge({id:'city-studio',from:'tallahassee',to:'studio',type:'door',scene:'history',position:[0,11],destination:'studio'});
    if(roomVisible('canopy',this.lens))this.label('CANOPY ROADS','A CITY AT WALKING SPEED',-2.1,1.3,1,'canopy',1.8,'#b6d1ff');
    if(roomVisible('capitol',this.lens)){
      // Recognizable massing: white historic facade, red dome, modern tower behind.
      this.floor(0,-15,12,7,'#93a5a0');this.box(0,1.1,-15,8,2.2,2.5,'#d0c9b2','stone','capitol');this.box(0,2.3,-15,8.5,.25,2.9,'#b07d64','wood','capitol');
      this.add('cylinder','stone',0,2.85,-15,1.05,1,1.05,'#d3cbb6','capitol');this.add('sphere','stone',0,3.4,-15,1.06,.72,1.06,'#b76b58','capitol');this.add('cylinder','metal',0,4.28,-15,.035,1.1,.035,'#adb0a1','capitol');
      for(let i=-3;i<=3;i++){this.add('cylinder','stone',i,1.18,-13.55,.13,1.95,.13,'#e3d3b4','capitol');if(i!==0)this.box(i,1.2,-13.72,.45,.9,.03,'#476475','wood','capitol');}
      this.box(2.6,4.2,-18.5,2.5,8.4,2.1,'#abb5aa','stone','capitol');
      for(let i=0;i<13;i++)this.box(2.6,.6+i*.55,-17.41,2.18,.22,.025,'#466773','wood','capitol');
      this.block(0,-15,8.5,3);this.block(2.6,-18.5,2.5,2.1);this.label('THE TWO CAPITOLS','HISTORIC CAPITOL + MODERN TOWER',0,4.9,-14.5,'capitol',3.6,'#b6d1ff');
    }
    if(roomVisible('mission',this.lens)){
      this.floor(-9,-3,6,8,'#849077');this.add('cylinder','wood',-9,1.2,-4,2.3,2.4,2.3,'#b69b6a','mission');this.add('cone','wood',-9,3.1,-4,2.85,2.2,2.85,'#9a7a53','mission');
      this.box(-9,.9,-1.7,1.1,1.8,.08,'#374a47','wood','mission');this.block(-9,-4,4.9,4.9);this.label('MISSION SAN LUIS','APALACHEE + SPANISH HISTORY',-9,4.6,-4,'mission',4,'#b6d1ff');
    }
    if(visibleEdge(EDGES.find(e=>e.to==='boycott'),this.lens).state!=='hidden'){
      this.floor(9,-6,6,6,'#73857e');this.box(9,1.15,-6,3.6,1.6,1.6,'#c5b68a','wood','boycott');this.box(9,1.65,-6.82,3.3,.62,.04,'#547985','stone','boycott');
      this.box(9,1.65,-5.18,3.3,.62,.04,'#547985','stone','boycott');for(let i=0;i<5;i++)this.box(7.65+i*.67,1.65,-5.12,.05,.66,.05,'#b8bd9e','metal','boycott');
      for(const x of [7.9,10.1])for(const z of [-6.8,-5.2])this.add('cylinder','wood',x,.45,z,.35,.18,.35,'#2b4149','boycott',[Math.PI/2,0,0]);
      this.block(9,-6,3.8,2);this.label('1956 · BUS BOYCOTT','SAMPLE HISTORY · SOURCES TO VERIFY',9,3.05,-6,'boycott',4,'#b6d1ff');
    }
    if(roomVisible('cascades',this.lens)){
      this.add('cylinder','stone',9,.08,7,2.8,.22,2.8,'#899d98','cascades');this.add('cylinder','water',9,.21,7,2.5,.04,2.5,'#fff','cascades');this.block(9,7,5.5,5.5);
      this.add('cylinder','stone',9,.5,7,.6,.8,.6,'#b0bbb0','cascades');this.add('orb','blue',9,.96,7,.13,.13,.13,'#fff','cascades');
      this.label('CASCADES PARK','WATER + OPEN SKY',9,2.7,7,'cascades',3.5,'#b6d1ff');this.animated.push({type:'fountain',x:9,z:7});
    }
  }
  particles(){
    const r=random(this.kind==='studio'?33:71),count=this.kind==='studio'?95:130,p=new Float32Array(count*3),phase=new Float32Array(count);
    for(let i=0;i<count;i++){p[i*3]=r()*(this.kind==='studio'?45:25)-12;p[i*3+1]=.4+r()*3.8;p[i*3+2]=r()*25-13;phase[i]=r()*Math.PI*2;}
    this.particleBase=p.slice();this.particlePhase=phase;
    const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.BufferAttribute(p,3));
    const m=new THREE.ShaderMaterial({transparent:true,depthWrite:false,blending:THREE.AdditiveBlending,uniforms:{color:{value:new THREE.Color(this.kind==='studio'?'#e9cf81':'#84cddc')}},vertexShader:'void main(){vec4 p=modelViewMatrix*vec4(position,1.);gl_Position=projectionMatrix*p;gl_PointSize=clamp(36./-p.z,1.,6.);}',fragmentShader:'uniform vec3 color;void main(){float d=length(gl_PointCoord-.5)*2.;gl_FragColor=vec4(color*2.,pow(max(0.,1.-d),2.)*.65);}'});
    this.dust=new THREE.Points(g,m);this.scene.add(this.dust);this.dynamicResources.push(g,m);
    if(this.kind==='history'){
      const wg=new THREE.BufferGeometry(),v=new Float32Array(48*3);wg.setAttribute('position',new THREE.BufferAttribute(v,3));
      const wm=new THREE.PointsMaterial({color:0xa4e8f0,size:.055,transparent:true,opacity:.7,depthWrite:false});this.waterPoints=new THREE.Points(wg,wm);this.waterPoints.visible=roomVisible('cascades',this.lens);this.scene.add(this.waterPoints);this.dynamicResources.push(wg,wm);
    }
  }
  update(t,position){
    if(position&&this.kind==='studio')this.sun.color.copy(makersSun).lerp(commonsSun,THREE.MathUtils.smoothstep(position.x,9,17));
    const time=this.reduced?0:t;
    for(const a of this.animated){
      if(a.type==='agent'){a.object.position.y=a.base+Math.sin(time*.9)*.065;a.object.rotation.y=time*.2;}
      if(a.type==='portal')a.object.material.uniforms.time.value=time;
      if(a.type==='nodes'){for(let i=0;i<16;i++){const x=i%4,z=Math.floor(i/4),h=.18+Math.sin(time*1.4+x*.65+z*.4)*.1;pose.position.set(6.4+x*.4,1.22+h,-7.3+z*.4);pose.rotation.set(0,0,0);pose.scale.set(.08,.08,.08);pose.updateMatrix();a.object.setMatrixAt(i,pose.matrix);}a.object.instanceMatrix.needsUpdate=true;}
    }
    if(!this.reduced){const p=this.dust.geometry.attributes.position;for(let i=0;i<p.count;i++){p.array[i*3+1]=this.particleBase[i*3+1]+Math.sin(time*.35+this.particlePhase[i])*.18;}p.needsUpdate=true;}
    if(this.waterPoints){const p=this.waterPoints.geometry.attributes.position;for(let i=0;i<p.count;i++){const a=i*2.4,f=(time*.4+i/48)%1;p.setXYZ(i,9+Math.cos(a)*f*1.5,1+Math.sin(f*Math.PI)*.85-f*.7,7+Math.sin(a)*f*1.5);}p.needsUpdate=true;}
  }
  zone(edge,x,z){
    switch(edge.id){
      case 'studio-city':return Math.abs(x)<1.9&&z<-11.7;
      case 'city-studio':return Math.abs(x)<1.9&&z>10.7;
      case 'studio-commons':return x>12.5;
      case 'commons-market':return x>17&&x<27&&z<-5.2;
      case 'commons-night':return x>29.1&&z>-1.5&&z<5.5;
      case 'studio-broadcast':return x>-10.3&&x<-5.4&&z<3.9&&z>-.9;
      case 'broadcast-listening':return x>-10.3&&x<-5.4&&z<1.85&&z>-.9;
      case 'studio-lab':return x>4.2&&x<9.8&&z<-4.1&&z>-8.5;
      case 'city-boycott':return x>5.8&&z<-3.3&&z>-9.5;
      case 'canopy-capitol':return Math.abs(x)<6&&z<-9.5;
      case 'city-mission':return x<-5.7&&z<-1.4;
      case 'city-cascades':return x>5.7&&z>5;
      default:return false;
    }
  }
  canStand(x,z){
    if(x<(this.kind==='studio'?-13.5:-13)||x>(this.kind==='studio'?34.2:13)||z<(this.kind==='studio'?-14.5:-20)||z>12)return false;
    for(const c of this.colliders)if(Math.abs(x-c.x)<c.w&&Math.abs(z-c.z)<c.d)return false;
    for(const e of this.edgeObjects){if(this.zone(e,x,z)&&(e.result.state==='hidden'||e.result.type==='window'||(e.result.type==='door'&&!this.granted.has(e.id))))return false;}
    return true;
  }
  nearest(x,z,yaw=0){let found=null,dist=Infinity;for(const e of this.edgeObjects){if(e.result.state==='hidden')continue;const dx=e.position[0]-x,dz=e.position[1]-z,d=Math.hypot(dx,dz);if(d>1.4&&(-Math.sin(yaw)*dx-Math.cos(yaw)*dz)<.1)continue;if(d<4&&d<dist){dist=d;found=e;}}return found;}
  context(x,z){
    if(this.kind==='studio'){
      const listening=this.edgeObjects.find(e=>e.id==='broadcast-listening');if(listening?.result.state!=='hidden'&&this.zone(listening,x,z))return {room:'listening',inside:'Broadcast booth'};
      for(const [id,room] of [['commons-night','night'],['commons-market','market'],['studio-commons','commons']]){const edge=this.edgeObjects.find(e=>e.id===id);if(edge.result.state!=='hidden'&&this.zone(edge,x,z))return {room};}return {room:'studio'};
    }
    if(z<-9.5)return {room:'capitol'};return {room:'tallahassee'};
  }
  dispose(){this.scene.traverse(o=>{if(o.isInstancedMesh)o.dispose();});for(const r of this.dynamicResources)r.dispose();this.sun.shadow.map?.dispose();}
}
