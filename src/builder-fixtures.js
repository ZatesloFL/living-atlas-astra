import * as THREE from '../vendor/three/three.module.min.js';
import {BUILDER_PIECES,isHostedSourceKind} from './builder-pieces.js';
import {authoredPiecePlacement} from './kit-placement.js';
import {drawModel} from './world-models.js';
import {readHostedPhotoPreview,sourceStateMessage,uploadedCopyLabel} from './source-media.js';

function hostedPhotoFrame(world,room,block,marker,status){
  const panel=document.createElement('canvas');
  panel.width=512;panel.height=352;
  const context=panel.getContext('2d');
  const texture=new THREE.CanvasTexture(panel);
  texture.colorSpace=THREE.SRGBColorSpace;
  const geometry=new THREE.PlaneGeometry(1.44,.99);
  const material=new THREE.MeshBasicMaterial({map:texture,side:THREE.DoubleSide,toneMapped:false});
  const mesh=new THREE.Mesh(geometry,material);
  mesh.name='Hosted photo preview';
  mesh.position.set(0,1.53,.092);
  world.placeMesh(mesh,marker);
  const controller=new AbortController();
  const {signal}=controller;
  world.dynamicResources.push({dispose(){
    controller.abort();texture.dispose();geometry.dispose();material.dispose();panel.width=panel.height=1;
  }});
  const background=()=>{context.fillStyle='#172a38';context.fillRect(0,0,panel.width,panel.height);};
  const message=(text,state)=>{
    background();context.textAlign='center';context.textBaseline='middle';context.font='600 24px system-ui';
    context.fillStyle='#e1ebed';context.fillText(text,panel.width/2,panel.height/2,panel.width-32);
    mesh.userData.sourceStatus=state;texture.needsUpdate=true;
  };
  message(status||'Loading sized photo preview…',status&&block.state!=='pending'?'unavailable':'loading');
  if(status)return;
  void (async()=>{
    try {
      const bytes=await readHostedPhotoPreview(block,room,world.lens,{signal});
      const bitmap=await createImageBitmap(bytes);
      try {
        signal.throwIfAborted();
        if(!bitmap.width||!bitmap.height||Math.max(bitmap.width,bitmap.height)>640)throw new Error('Unexpected photo preview size.');
        const fit=Math.min(panel.width/bitmap.width,panel.height/bitmap.height);
        const width=bitmap.width*fit,height=bitmap.height*fit;
        background();context.drawImage(bitmap,(panel.width-width)/2,(panel.height-height)/2,width,height);
        mesh.userData.sourceStatus='ready';texture.needsUpdate=true;
      } finally {bitmap.close();}
    } catch {
      if(!signal.aborted)message('Photo preview unavailable.','unavailable');
    }
  })();
}

function drawHostedFixture(world,room,piece,block,box,marker){
  const status=sourceStateMessage(block);
  const photo=piece.kind==='hosted-photo';
  box(0,.18,0,1.65,.36,.65,'#566b67');
  box(0,.75,0,.16,1.05,.24,'#6e7f79');
  box(0,1.53,0,1.53,1.08,.18,photo?'#ac987c':'#303c4a');
  world.block(0,0,1.65,.65);
  if(photo)hostedPhotoFrame(world,room,block,marker,status);
  else if(!status)world.add('diamond','blue',0,1.53,.13,.18,.18,.045,'#4cacc9',marker,[0,0,Math.PI/2]);
  const title=world.transform(0,2.22,0);
  const label=status?BUILDER_PIECES[piece.kind].label:block.title??block.body;
  const backing=status||(photo?uploadedCopyLabel(block.source):'Open hosted player');
  world.label(label,backing,title.x,title.y,title.z,marker,2.3,'#b2d4cf');
}

export function drawBuilderFixtures(world,room,roomKey,blocks){
  const parent=world.placement;
  for(const piece of room.builderFixtures){
    const block=blocks.get(piece.block);
    if(!block)continue;
    const hosted=isHostedSourceKind(piece.kind);
    const marker='exhibit:'+roomKey+':'+(hosted&&world.builderView?.editing?piece.id:block.id);
    world.placement=authoredPiecePlacement(parent,piece,block,world.lens);
    const box=(x,y,z,width,height,depth,color,material='stone')=>
      world.box(x,y,z,width,height,depth,color,material,marker);
    if(hosted){
      world.placement.style=null;
      drawHostedFixture(world,room,piece,block,box,marker);
      world.placement=parent;
      continue;
    }
    switch(piece.kind){
      case 'bench':
        box(0,.56,0,1.8,.16,.55,'#bca984','wood');
        box(-.68,.25,0,.16,.5,.45,'#566b67');
        box(.68,.25,0,.16,.5,.45,'#566b67');
        world.block(0,0,1.8,.55);
        break;
      case 'sign':
        box(0,.59,0,.14,1.18,.14,'#54666c');
        box(0,1.28,0,1.15,.49,.15,'#c6b48a','wood');
        break;
      case 'lantern':
        box(0,.62,0,.11,1.24,.11,'#46616c','metal');
        box(0,1.38,0,.3,.25,.3,'#efc683','amber');
        box(0,1.54,0,.36,.09,.36,'#59686e');
        break;
      case 'plant':
        box(0,.19,0,.65,.38,.65,'#75877e');
        world.add('orb','leaf',0,.73,0,.45,.65,.45,'#7eb499',marker);
        world.add('orb','leaf',-.23,.53,0,.31,.33,.29,'#50977d',marker);
        world.add('orb','leaf',.26,.6,.03,.3,.44,.3,'#65a488',marker);
        break;
      case 'interior-shell':
        box(0,1.1,-1.85,4,.18,.12,'#647d7a');
        box(-2,1,0,.14,2,3.8,'#647d7a');
        box(2,1,0,.14,2,3.8,'#647d7a');
        break;
      default:
        drawModel(world,BUILDER_PIECES[piece.kind]?.model??'plinth',marker);
    }
    const title=world.transform(0,1.85,0);
    world.label(block.title,piece.settings?.text||'READ THING',title.x,title.y,title.z,marker,2.3,'#b2d4cf');
    world.placement=parent;
  }
}
