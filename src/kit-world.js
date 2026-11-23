import * as THREE from '../vendor/three/three.module.min.js';
import {selectContent,blockAccess} from './content.js';
import {drawArt} from './kit-art.js';
import {subscribeMedia,players} from './kit-media.js';
import {exhibitPlacement} from './kit-placement.js';
// Fixture solids join the existing instance batches. All pictures share one atlas/draw.
export function drawKit(w,room,id){
 const blocks=selectContent(room,w.lens).blocks.filter(b=>b.exhibit&&!blockAccess(b,room,w.lens).hidden);
 for(const placement of room.layout.components??[]){const block=blocks.find(b=>b.id===placement.block);if(!block)continue;const c=block.exhibit,parent=w.placement;w.placement=exhibitPlacement(parent,placement);const x=0,z=0,k='exhibit:'+id+':'+block.id,pick=k;
  const box=(dx,y,dz,sx,sy,sz,color,mat='wood',target=pick)=>w.box(x+dx,y,z+dz,sx,sy,sz,color,mat,target);
  if(c.kind==='screen'){box(0,1.4,0,2.8,1.9,.2,'#223d45');box(0,.25,0,2.95,.2,.75,'#c2ae82');w.block(x,z,2.8,.45);tile(w,{x,y:1.45,z:z+.115,width:2.55,height:1.5,component:c,id:pick,screen:id+':'+c.id});}
  if(c.kind==='photoWall'){box(0,1.5,0,4.5,2.7,.2,'#506d68');w.block(x,z,4.5,.2);for(let i=0;i<c.settings.photos.length;i++){const dx=(i%3-1)*1.38,y=1+Math.floor(i/3)*1.2,target=pick+':'+i;box(dx,y,.14,1.29,1.01,.12,'#d3bc8e','wood',target);tile(w,{x:x+dx,y,z:z+.215,width:1.12,height:.83,component:c,photo:i,id:target});box(dx,y+.58,.37,.3,.06,.2,'#dac9a4','metal',target);}}
  if(c.kind==='listening'){box(0,.55,0,2.1,.2,.75,'#b89b6b');box(-.8,.25,0,.12,.55,.6,'#425b60','metal');box(.8,.25,0,.12,.55,.6,'#425b60','metal');box(0,1,-.3,2.1,.65,.15,'#8da093');w.add('ring','blue',x,1.45,z-.1,.22,.22,.22,'#fff',pick);box(-.23,1.3,-.1,.12,.27,.15,'#3c5864','metal');box(.23,1.3,-.1,.12,.27,.15,'#3c5864','metal');w.block(x,z,2.1,.9);}
  if(c.kind==='newspaper'){box(0,.55,0,.12,1.1,.12,'#7f8d84','metal');box(0,1.15,0,1.45,.1,1.1,'#b9a079');box(0,.07,0,.8,.1,.8,'#8c998b');tile(w,{x,y:1.205,z:z+.08,width:1.3,height:1,component:c,id:pick,flat:true});box(.75,1.4,-.3,.055,1,.055,'#acb69a','metal');w.add('cone','amber',x+.75,1.95,z-.3,.2,.12,.2,'#fff',pick);w.block(x,z,1.5,1.1);}
  if(c.kind==='seatMap'){box(0,.85,0,3.6,1.1,1.6,'#ccb991');box(0,1.65,0,3.65,.17,1.7,'#d8caaa');for(let i=0;i<6;i++){box(-1.5+i*.6,1.32,-.8,.045,.6,.05,'#c3b28e','metal');box(-1.5+i*.6,1.32,.8,.045,.6,.05,'#c3b28e','metal');}for(const dx of [-1.1,1.1])for(const dz of [-.8,.8])w.add('cylinder','wood',x+dx,.32,z+dz,.32,.16,.32,'#263c43',pick,[Math.PI/2,0,0]);for(let i=0;i<3;i++){box(-1+i,.7,-.25,.55,.3,.45,['#b38d72','#bead88','#7e9d96'][i]);box(-1+i,1.0,-.42,.55,.4,.12,'#7b9a92');}w.block(x,z,3.8,1.8);}
  const p=w.transform(x,2.55,z);w.label(c.settings.title,'SAMPLE · ARCHIVE NOT SYNCED',p.x,p.y,p.z,pick,2.5,'#e7c39d');w.placement=parent;
 }
}
function tile(w,s){w.kitTiles??=[];w.kitTiles.push({...s,point:w.transform(s.x,s.y,s.z),facing:w.placement.facing,scale:w.placement.scale});}
export function flushKit(w){
 if(!w.kitTiles?.length)return;
 // Allocate a tile per displayed Thing, including independent screens. All tiles
 // still share a single texture and draw; no content is baked into the renderer.
 const tiles=w.kitTiles,columns=Math.min(4,tiles.length),rows=2**Math.ceil(Math.log2(Math.ceil(tiles.length/columns)));
 const canvas=document.createElement('canvas');canvas.width=columns*256;canvas.height=rows*256;
 const ctx=canvas.getContext('2d'),lastCues=new Map();
 const paint=(tile,i,cue=0)=>drawTile(ctx,tile,(i%columns)*256,Math.floor(i/columns)*256,cue);
 tiles.forEach((tile,i)=>{const cue=players.get(tile.screen)?.cue??0;paint(tile,i,cue);lastCues.set(i,cue);});
 const texture=new THREE.CanvasTexture(canvas);texture.colorSpace=THREE.SRGBColorSpace;texture.anisotropy=2;
 const positions=[],uvs=[],ids=[],indices=[];
 for(const [i,s] of tiles.entries()){
  const n=positions.length/3,u=(i%columns)/columns,v=Math.floor(i/columns)/rows;
  const corners=s.flat?[[-.5,0,.5],[.5,0,.5],[.5,0,-.5],[-.5,0,-.5]]:[[-.5,-.5,0],[.5,-.5,0],[.5,.5,0],[-.5,.5,0]];
  for(const [a,b,c] of corners){const p=new THREE.Vector3(a*s.width,b*s.height,c*s.height).multiplyScalar(s.scale).applyAxisAngle(new THREE.Vector3(0,1,0),s.facing).add(s.point);positions.push(...p.toArray());}
  uvs.push(u,1-v-1/rows,u+1/columns,1-v-1/rows,u+1/columns,1-v,u,1-v);indices.push(n,n+1,n+2,n,n+2,n+3);ids.push(s.id,s.id);
 }
 const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));geometry.setAttribute('uv',new THREE.Float32BufferAttribute(uvs,2));geometry.setIndex(indices);geometry.computeVertexNormals();
 const mat=new THREE.MeshBasicMaterial({map:texture,side:THREE.DoubleSide,toneMapped:false});const mesh=new THREE.Mesh(geometry,mat);mesh.name='Exhibit media atlas';mesh.userData.faceIds=ids;w.scene.add(mesh);w.pickables.push(mesh);w.dynamicResources.push(geometry,mat,texture);
 const unsubscribe=subscribeMedia(p=>{tiles.forEach((tile,i)=>{if(tile.screen!==p.room+':'+p.component.id||lastCues.get(i)===p.cue)return;lastCues.set(i,p.cue);paint(tile,i,p.cue);texture.needsUpdate=true;});});
 w.dynamicResources.push({dispose:unsubscribe});
}
function drawTile(ctx,tile,x,y,cue){
 const {kind,settings:s}=tile.component;ctx.save();ctx.beginPath();ctx.rect(x,y,256,256);ctx.clip();
 if(kind==='newspaper'){
  ctx.fillStyle='#e3d3b3';ctx.fillRect(x,y,256,256);ctx.fillStyle='#2d3e3c';ctx.font='bold 18px Georgia';ctx.fillText('THE SAMPLE RECORD',x+12,y+35,232);ctx.font='10px sans-serif';ctx.fillText('FICTIONAL · NOT AN ARCHIVE',x+12,y+55);ctx.font='bold 15px Georgia';
  const words=s.headline.split(' ');let line='',dy=82;
  for(const word of words){if(ctx.measureText(line+word).width>232){ctx.fillText(line,x+12,y+dy);dy+=18;line='';}line+=word+' ';}ctx.fillText(line,x+12,y+dy);
  for(let c=0;c<s.columns.length;c++)for(let row=0;row<12;row++)ctx.fillRect(x+12+c*(232/s.columns.length),y+dy+20+row*8,232/s.columns.length-10-(row%4)*4,2);
 }else{
  const item=kind==='screen'?s.slides[Math.min(cue,s.slides.length-1)]:s.photos[tile.photo];
  drawArt(ctx,item.scene,x,y,256,256);
  if(kind==='photoWall'){const light=ctx.createRadialGradient(x+128,y,5,x+128,y+85,230);light.addColorStop(0,'#fff0c34a');light.addColorStop(1,'#fff0c300');ctx.fillStyle=light;ctx.fillRect(x,y,256,256);}
  ctx.fillStyle='#102d36';ctx.fillRect(x,y+218,256,38);ctx.fillStyle='#f6e6c9';ctx.font='14px Georgia';ctx.fillText(item.title,x+9,y+235,238);ctx.font='8px sans-serif';ctx.fillText('GENERATED SAMPLE · TO VERIFY',x+9,y+249);
 }
 ctx.restore();
}
