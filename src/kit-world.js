import * as THREE from '../vendor/three/three.module.min.js';
import {selectContent,blockAccess} from './content.js';
import {drawArt} from './kit-art.js';
import {subscribeMedia} from './kit-media.js';
// Fixture solids join the existing instance batches. All pictures share one atlas/draw.
export function drawKit(w,room,id){
 const blocks=selectContent(room,w.lens).blocks.filter(b=>b.exhibit&&!blockAccess(b,room,w.lens).hidden);
 for(const placement of room.layout.components??[]){const block=blocks.find(b=>b.id===placement.block);if(!block)continue;const c=block.exhibit,[x,z]=placement.position,k='exhibit:'+id+':'+block.id,pick=k;
  const box=(dx,y,dz,sx,sy,sz,color,mat='wood',target=pick)=>w.box(x+dx,y,z+dz,sx,sy,sz,color,mat,target);
  if(c.kind==='screen'){box(0,1.4,0,2.8,1.9,.2,'#223d45');box(0,.25,0,2.95,.2,.75,'#c2ae82');w.block(x,z,2.8,.45);tile(w,{x,y:1.45,z:z+.115,width:2.55,height:1.5,index:6,id:pick,screen:id+':'+c.id});}
  if(c.kind==='photoWall'){box(0,1.5,0,4.5,2.7,.2,'#506d68');w.block(x,z,4.5,.2);for(let i=0;i<c.settings.photos.length;i++){const dx=(i%3-1)*1.38,y=1+Math.floor(i/3)*1.2,target=pick+':'+i;box(dx,y,.14,1.29,1.01,.12,'#d3bc8e','wood',target);tile(w,{x:x+dx,y,z:z+.215,width:1.12,height:.83,index:i,id:target});box(dx,y+.58,.37,.3,.06,.2,'#dac9a4','metal',target);}}
  if(c.kind==='listening'){box(0,.55,0,2.1,.2,.75,'#b89b6b');box(-.8,.25,0,.12,.55,.6,'#425b60','metal');box(.8,.25,0,.12,.55,.6,'#425b60','metal');box(0,1,-.3,2.1,.65,.15,'#8da093');w.add('ring','blue',x,1.45,z-.1,.22,.22,.22,'#fff',pick);box(-.23,1.3,-.1,.12,.27,.15,'#3c5864','metal');box(.23,1.3,-.1,.12,.27,.15,'#3c5864','metal');w.block(x,z,2.1,.9);}
  if(c.kind==='newspaper'){box(0,.55,0,.12,1.1,.12,'#7f8d84','metal');box(0,1.15,0,1.45,.1,1.1,'#b9a079');box(0,.07,0,.8,.1,.8,'#8c998b');tile(w,{x,y:1.19,z:z+.08,width:1.3,height:1,index:7,id:pick,flat:true});box(.75,1.4,-.3,.055,1,.055,'#acb69a','metal');w.add('cone','amber',x+.75,1.95,z-.3,.2,.12,.2,'#fff',pick);w.block(x,z,1.5,1.1);}
  if(c.kind==='seatMap'){box(0,.85,0,3.6,1.1,1.6,'#ccb991');box(0,1.65,0,3.65,.17,1.7,'#d8caaa');for(let i=0;i<6;i++){box(-1.5+i*.6,1.32,-.8,.045,.6,.05,'#c3b28e','metal');box(-1.5+i*.6,1.32,.8,.045,.6,.05,'#c3b28e','metal');}for(const dx of [-1.1,1.1])for(const dz of [-.8,.8])w.add('cylinder','wood',x+dx,.32,z+dz,.32,.16,.32,'#263c43',pick,[Math.PI/2,0,0]);for(let i=0;i<3;i++){box(-1+i,.7,-.25,.55,.3,.45,['#b38d72','#bead88','#7e9d96'][i]);box(-1+i,1.0,-.42,.55,.4,.12,'#7b9a92');}w.block(x,z,3.8,1.8);}
  const p=w.transform(x,2.55,z);w.label(c.settings.title,'SAMPLE MEDIA · TAP',p.x,p.y,p.z,pick,2.5,'#e7c39d');
 }
}
function tile(w,s){w.kitTiles??=[];w.kitTiles.push({...s,point:w.transform(s.x,s.y,s.z),facing:w.placement.facing,scale:w.placement.scale});}
export function flushKit(w){
 if(!w.kitTiles?.length)return;const canvas=document.createElement('canvas');canvas.width=1024;canvas.height=512;const ctx=canvas.getContext('2d');for(let i=0;i<8;i++)drawTile(ctx,i);const texture=new THREE.CanvasTexture(canvas);texture.colorSpace=THREE.SRGBColorSpace;texture.anisotropy=2;
 const positions=[],uvs=[],ids=[],indices=[];
 for(const s of w.kitTiles){const n=positions.length/3,u=(s.index%4)/4,v=Math.floor(s.index/4)/2;const corners=s.flat?[[-.5,0,.5],[.5,0,.5],[.5,0,-.5],[-.5,0,-.5]]:[[-.5,-.5,0],[.5,-.5,0],[.5,.5,0],[-.5,.5,0]];for(const [a,b,c] of corners){const p=new THREE.Vector3(a*s.width,b*s.height,c*s.height).multiplyScalar(s.scale).applyAxisAngle(new THREE.Vector3(0,1,0),s.facing).add(s.point);positions.push(...p.toArray());}uvs.push(u,1-v-1/2,u+1/4,1-v-1/2,u+1/4,1-v,u,1-v);indices.push(n,n+1,n+2,n,n+2,n+3);ids.push(s.id,s.id);}
 const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));geometry.setAttribute('uv',new THREE.Float32BufferAttribute(uvs,2));geometry.setIndex(indices);geometry.computeVertexNormals();const mat=new THREE.MeshBasicMaterial({map:texture,side:THREE.DoubleSide,toneMapped:false});const mesh=new THREE.Mesh(geometry,mat);mesh.userData.faceIds=ids;w.scene.add(mesh);w.pickables.push(mesh);w.dynamicResources.push(geometry,mat,texture);let last=-1;
 const unsubscribe=subscribeMedia(p=>{if(!w.kitTiles.some(t=>t.screen===p.room+':'+p.component.id))return;if(p.cue===last)return;last=p.cue;drawTile(ctx,6,p.cue);texture.needsUpdate=true;});w.dynamicResources.push({dispose:unsubscribe});
}
function drawTile(ctx,index,scene=index){const x=index%4*256,y=Math.floor(index/4)*256;if(index===7){ctx.fillStyle='#e3d3b3';ctx.fillRect(x,y,256,256);ctx.fillStyle='#2d3e3c';ctx.font='bold 18px Georgia';ctx.fillText('THE SAMPLE RECORD',x+12,y+35);ctx.font='10px sans-serif';ctx.fillText('FICTIONAL · NOT AN ARCHIVE',x+12,y+55);ctx.font='bold 16px Georgia';ctx.fillText('Another way',x+12,y+85);for(let c=0;c<3;c++)for(let line=0;line<15;line++)ctx.fillRect(x+12+c*80,y+103+line*8,65-(line%4)*6,2);return;}drawArt(ctx,scene,x,y,256,256);}
