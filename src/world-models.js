// Reusable procedural models. No room names, addresses, authored prose or world placements.
import * as THREE from '../vendor/three/three.module.min.js';
export function drawModel(w,model,id){
 const box=(...a)=>w.box(...a),add=(...a)=>w.add(...a);
 switch(model){
 case 'none':return;
 case 'workbench':w.table(0,0,id);w.book(-.65,1.09,0,'#c7915c',id);add('cylinder','metal',0,1.13,0,.48,.13,.48,'#56746b',id);return;
 case 'agent':{
  const mat=w.material.teal.clone();mat.wireframe=true;mat.emissiveIntensity=w.lens.show.agent?3.7:.75;mat.color.set(w.lens.show.agent?'#99e8d8':'#84a69e');
  const mesh=new THREE.Mesh(w.geometry.diamond,mat);mesh.position.set(0,1.85,0);mesh.scale.set(.35,.52,.35);w.placeMesh(mesh,id);w.dynamicResources.push(mat);w.animated.push({type:'agent',object:mesh,base:mesh.position.y});
  add('orb',w.lens.show.agent?'teal':'stone',0,1.85,0,.1,.1,.1,w.lens.show.agent?'#fff':'#8cb3ab',id);return;}
 case 'desk':w.table(0,0,id);w.book(-.7,1.08,0,'#526a9b',id);add('diamond','amber',0,1.45,0,.23,.28,.23,'#fff',id);return;
 case 'gallery-wall':
  box(0,1.6,0,1.8,2.6,.18,'#637d77','wood',id);w.block(0,0,1.8,.3);
  for(let i=0;i<6;i++){box((i%2-.5)*.72,1.1+Math.floor(i/2)*.62,.11,.57,.45,.015,i%2?'#c5b48b':'#9dbfb4','stone',id);box((i%2-.5)*.72,1.12+Math.floor(i/2)*.62,.125,.38,.025,.018,'#435a59','wood',id);}return;
 case 'table':case 'courtyard':
  add('cylinder','wood',0,.9,0,1.45,.18,1.45,'#9f9877',id);add('cylinder','stone',0,.4,0,.55,.8,.55,'#57756f',id);w.block(0,0,2.9,2.9);for(let i=0;i<5;i++)add('diamond','teal',Math.sin(i*1.26)*.7,1.12,Math.cos(i*1.26)*.7,.09,.17,.09,'#fff',id);return;
 case 'boundary':box(0,1.4,0,1.7,2.8,.3,'#334c54','wood',id);box(0,2.85,0,2,.18,.5,'#b6a077','wood',id);add('orb','amber',.6,1.35,.19,.055,.055,.055,'#fff',id);w.block(0,0,2,.5);return;
 case 'network':{
  w.floor(0,.5,5.6,4,'#394e62');box(0,1.55,-1.5,5.8,3,.15,'#344b60');w.table(0,0,id,'#7089a0');w.block(0,.2,5.3,4.3);
  const nodes=new THREE.InstancedMesh(w.geometry.orb,w.material.blue,16);nodes.userData.ids=Array(16).fill(id);w.placeMesh(nodes,id);w.animated.push({type:'nodes',object:nodes});
  for(let i=0;i<4;i++){box(0,1.12,-.6+i*.4,1.6,.018,.018,'#82bcc5','metal',id);box(-.6+i*.4,1.12,0,.018,.018,1.6,'#82bcc5','metal',id);}return;}
 case 'broadcast':case 'booth':
  w.floor(0,0,4.8,5,'#445c6b');box(-2.5,1.25,0,.12,2.5,5,'#688b8f','glass',id);w.block(-2.5,0,.2,5);box(0,1.25,-2.5,5.1,2.5,.15,'#3c5364','wood',id);w.block(0,-2.5,5.1,.15);return;
 case 'listening':box(0,.5,0,2,.75,.75,'#7d8f98','wood',id);add('ring','blue',0,1.3,-.2,.33,.33,.33,'#fff',id);return;
 case 'market':
  w.floor(0,0,8,7,'#667463');for(let i=0;i<3;i++){const x=-3+i*3;box(x,1,0,2.1,.18,1,'#a38c69','wood',id);box(x,2.5,0,2.6,.18,2,'#7e9290','wood',id);box(x-.95,1.7,0,.1,1.6,.1,'#887c63','wood',id);box(x+.95,1.7,0,.1,1.6,.1,'#887c63','wood',id);add('sphere','amber',x,2.1,.3,.2,.25,.2,'#fff',id);w.block(x,0,2,1);}return;
 case 'night':w.floor(0,0,5,6,'#72536c');add('ring','pink',1,2.3,0,.8,.8,.8,'#fff',id,[0,Math.PI/2,0]);return;
 case 'capitols':
  w.floor(0,0,12,7,'#93a5a0');box(0,1.1,0,8,2.2,2.5,'#d0c9b2','stone',id);box(0,2.3,0,8.5,.25,2.9,'#b07d64','wood',id);add('cylinder','stone',0,2.85,0,1.05,1,1.05,'#d3cbb6',id);add('sphere','stone',0,3.4,0,1.06,.72,1.06,'#b76b58',id);add('cylinder','metal',0,4.28,0,.035,1.1,.035,'#adb0a1',id);
  for(let i=-3;i<=3;i++){add('cylinder','stone',i,1.18,1.45,.13,1.95,.13,'#e3d3b4',id);if(i!==0)box(i,1.2,1.28,.45,.9,.03,'#476475','wood',id);}
  box(2.6,4.2,-3.5,2.5,8.4,2.1,'#abb5aa','stone',id);for(let i=0;i<13;i++)box(2.6,.6+i*.55,-2.41,2.18,.22,.025,'#466773','wood',id);w.block(0,0,8.5,3);w.block(2.6,-3.5,2.5,2.1);return;
 case 'mission':
  w.floor(0,1,6,8,'#849077');add('cylinder','wood',0,1.2,0,2.3,2.4,2.3,'#b69b6a',id);add('cone','wood',0,3.1,0,2.85,2.2,2.85,'#9a7a53',id);box(0,.9,2.3,1.1,1.8,.08,'#374a47','wood',id);w.block(0,0,4.9,4.9);return;
 case 'bus':
  w.floor(0,0,6,6,'#73857e');box(0,1.15,0,3.6,1.6,1.6,'#c5b68a','wood',id);box(0,1.65,-.82,3.3,.62,.04,'#547985','stone',id);box(0,1.65,.82,3.3,.62,.04,'#547985','stone',id);for(let i=0;i<5;i++)box(-1.35+i*.67,1.65,.88,.05,.66,.05,'#b8bd9e','metal',id);for(const x of [-1.1,1.1])for(const z of [-.8,.8])add('cylinder','wood',x,.45,z,.35,.18,.35,'#2b4149',id,[Math.PI/2,0,0]);w.block(0,0,3.8,2);return;
 case 'fountain':
  add('cylinder','stone',0,.08,0,2.8,.22,2.8,'#899d98',id);add('cylinder','water',0,.21,0,2.5,.04,2.5,'#fff',id);w.block(0,0,5.5,5.5);add('cylinder','stone',0,.5,0,.6,.8,.6,'#b0bbb0',id);add('orb','blue',0,.96,0,.13,.13,.13,'#fff',id);w.fountainLayout={...w.placement};return;
 case 'panorama':box(0,1.3,0,4,2.6,.2,'#486d76','wood',id);w.block(0,0,4,.2);add('ring','blue',0,1.5,.2,.65,.65,.65,'#fff',id);return;
 case 'path-stops':w.floor(0,0,2.5,2.5,'#638477'); // fall through to a reusable plinth
 default:add('cylinder','stone',0,.4,0,.65,.8,.65,'#82988b',id);add('diamond','teal',0,1.35,0,.35,.5,.35,'#fff',id);w.block(0,0,1.3,1.3);
 }
}
