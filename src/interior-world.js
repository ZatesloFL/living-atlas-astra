import * as THREE from '../vendor/three/three.module.min.js';
import {ROOMS} from './data.js';
import {selectContent,blockAccess} from './content.js';
import {hallExit} from './interior-space.js';

export function drawFrontage(w,room,id){
 const h=room.layout.interior,f=h.frontage,[x,z]=f.door,half=f.width/2,side=(f.width-3.4)/2;
 for(const dx of [-1,1]){w.box(x+dx*(1.7+side/2),2,z,side,4,.35,'#a6b2a3','stone',id);w.block(x+dx*(1.7+side/2),z,side,.35);w.box(x+dx*half,2,z-f.depth/2,.25,4,f.depth,'#667e77','stone','wall');w.block(x+dx*half,z-f.depth/2,.25,f.depth);}
 w.box(x,3.95,z,f.width,.9,.4,'#c8ba94','stone',id);w.box(x,f.height,z-f.depth/2,f.width+.3,.18,f.depth+.4,'#627970');
 w.box(x,2,z-f.depth,f.width,4,.3,'#667e77','stone','wall');w.block(x,z-f.depth,f.width,.3);
 w.floor(x,z+1.1,4.4,2.4,'#8d9c8c');w.block(x,z,3.4,.2);
 w.label(room.layout.sign?.[0]??room.title,'ENTER · EXHIBITION HALL',x,4.7,z,id);
}
export function drawHall(w,id){
 const room=ROOMS[id],h=room.layout.interior,W=h.width,D=h.depth,H=h.height;
 w.scene.background=new THREE.Color('#5b6d68');w.scene.fog=null;
 w.sun.position.set(-3,H-.7,6);w.sun.intensity=1.4;w.sun.shadow.camera.left=-W;w.sun.shadow.camera.right=W;w.sun.shadow.camera.top=D;w.sun.shadow.camera.bottom=-D;
 const ambient=w.scene.children.find(o=>o.isHemisphereLight);ambient.intensity=1.7;ambient.color.set('#e1e6db');ambient.groundColor.set('#b2bcae');
 w.floor(0,0,W,D,'#b1ac93');
 // Solid enclosure. Collision and ray occlusion use the same wall positions.
 for(const x of [-W/2,W/2]){w.box(x,H/2,0,.3,H,D,'#73877d','stone','wall');w.block(x,0,.3,D);w.box(x+Math.sign(-x)*.17,.55,0,.08,1.1,D,'#b4a27e');}
 for(const z of [-D/2,D/2]){w.box(0,H/2,z,W,H,.3,'#73877d','stone','wall');w.block(0,z,W,.3);}
 w.box(0,H,0,W+.3,.2,D+.3,'#93aaa4');
 for(const p of h.partitions){w.box(p.position[0],1.9,p.position[1],p.size[0],3.8,p.size[1],'#8e9e8c','stone','wall');w.block(...p.position,...p.size);}
 // A continuous aisle and two broad cross aisles; no floor furniture in the route.
 w.floor(0,0,5.5,D-.6,'#bdb69c');for(const z of [5.4,-3.8])w.floor(0,z,W-.7,2.6,'#b8b297');
 for(const z of [-8,-2,4,9]){w.box(0,H-.18,z,3,.07,.12,'#efdfb2','stone');for(const x of [-5,5])w.box(x,H-.12,z,.1,.08,2.4,'#c5b58c');}
 const exit=hallExit(id);w.edgeObjects.push({...exit,result:w.gate(exit)});
 w.box(0,1.5,D/2-.2,2.7,3,.12,'#304b4c','stone','edge:'+exit.id);
 for(const x of [-1.5,1.5])w.box(x,1.7,D/2-.27,.16,3.4,.18,'#c7b793');
 w.box(0,3.35,D/2-.27,3.16,.16,.18,'#c7b793');
 sign(w,{title:'Return to the Quarter',sub:'EXIT · DOOR CROSSING',position:[0,2.65,D/2-.31],facing:Math.PI,width:2.4,height:.65,id:'edge:'+exit.id});
 sign(w,{title:room.layout.sign?.[0]??room.title,sub:'EXHIBITION HALL',position:[0,4,D/2-.2],facing:Math.PI,width:5,height:.7,id});
}
export function hallLabels(w,room,id){
 const blocks=selectContent(room,w.lens).blocks.filter(b=>b.exhibit&&!blockAccess(b,room,w.lens).hidden);
 for(const bay of room.layout.interior.bays){const b=blocks.find(b=>b.id===bay.block);if(!b)continue;
  sign(w,{title:b.exhibit.settings.title,sub:'SAMPLE · ARCHIVE NOT SYNCED',position:bay.label,facing:bay.facing,width:3.2,height:.78,id:'exhibit:'+id+':'+b.id});
 }
}
function sign(w,s){
 w.hallSigns??=[];w.hallSigns.push(s);
 w.box(...s.position,s.width+.08,s.height+.08,.06,'#dfcfaa','stone',s.id,[0,s.facing,0]);
}
export function flushHallSigns(w){
 const signs=w.hallSigns;if(!signs?.length)return;
 const columns=2,rows=2**Math.ceil(Math.log2(Math.ceil(signs.length/columns))),canvas=document.createElement('canvas');canvas.width=columns*768;canvas.height=rows*192;const c=canvas.getContext('2d'),positions=[],uv=[],indices=[],ids=[];
 for(const [i,s] of signs.entries()){
  const x=i%columns*768,y=Math.floor(i/columns)*192;c.fillStyle='#243e43';c.fillRect(x,y,768,192);c.fillStyle='#f3e5ca';c.font='600 39px Georgia';
  const lines=[];let line='';for(const word of s.title.split(' ')){if(c.measureText(line+' '+word).width>710&&line){lines.push(line);line=word;}else line+=(line?' ':'')+word;}lines.push(line);lines.slice(0,2).forEach((t,j)=>c.fillText(t,x+28,y+55+j*44,710));c.fillStyle='#c0d4c8';c.font='23px sans-serif';c.fillText(s.sub,x+28,y+162,710);
  const n=positions.length/3,u=(i%columns)/columns,v=Math.floor(i/columns)/rows;
  for(const [a,b] of [[-.5,-.5],[.5,-.5],[.5,.5],[-.5,.5]]){const p=new THREE.Vector3(a*s.width,b*s.height,.035).applyAxisAngle(new THREE.Vector3(0,1,0),s.facing).add(new THREE.Vector3(...s.position));positions.push(...p.toArray());}
  uv.push(u,1-v-1/rows,u+1/columns,1-v-1/rows,u+1/columns,1-v,u,1-v);indices.push(n,n+1,n+2,n,n+2,n+3);ids.push(s.id,s.id);
 }
 const texture=new THREE.CanvasTexture(canvas);texture.colorSpace=THREE.SRGBColorSpace;texture.anisotropy=4;
 const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));geometry.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));geometry.setIndex(indices);geometry.computeVertexNormals();
 const material=new THREE.MeshBasicMaterial({map:texture,toneMapped:false}),mesh=new THREE.Mesh(geometry,material);mesh.name='Interior wall labels';mesh.userData.faceIds=ids;w.scene.add(mesh);w.pickables.push(mesh);w.dynamicResources.push(texture,geometry,material);
}
