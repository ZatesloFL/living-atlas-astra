// Compose an exhibit's local placement with its Place's rotation and scale.
export function exhibitPlacement(layout,placement){
 const [x,z]=placement.position??[0,0],scale=layout.scale??1,angle=layout.facing??0;
 return {...layout,scale:scale*(placement.scale??1),elevation:(layout.elevation??0)+scale*(placement.elevation??0),slot:[layout.slot[0]+scale*(x*Math.cos(angle)+z*Math.sin(angle)),layout.slot[1]+scale*(z*Math.cos(angle)-x*Math.sin(angle))],facing:angle+(placement.facing??0)};
}
import {itemStyle} from './item-style.js';


export function authoredPiecePlacement(layout,placement,block,lens){
 const position=exhibitPlacement(layout,placement);
 if(block.styleControl==='fixed'&&block.authorLook)position.style=itemStyle(block,lens);
 return position;
}
