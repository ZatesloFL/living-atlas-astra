import {BUILDER_PIECES} from './builder-pieces.js';
import {authoredPiecePlacement} from './kit-placement.js';
import {drawModel} from './world-models.js';

export function drawBuilderFixtures(world,room,roomKey,blocks){
  const parent=world.placement;
  for(const piece of room.builderFixtures){
    const block=blocks.get(piece.block);
    if(!block)continue;
    const marker='exhibit:'+roomKey+':'+block.id;
    world.placement=authoredPiecePlacement(parent,piece,block,world.lens);
    const box=(x,y,z,width,height,depth,color,material='stone')=>
      world.box(x,y,z,width,height,depth,color,material,marker);
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
