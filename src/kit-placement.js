// Compose an exhibit's local placement with its Place's rotation and scale.
export function exhibitPlacement(layout,placement){
 const [x,z]=placement.position??[0,0],scale=layout.scale??1,angle=layout.facing??0;
 return {...layout,scale,slot:[layout.slot[0]+scale*(x*Math.cos(angle)+z*Math.sin(angle)),layout.slot[1]+scale*(z*Math.cos(angle)-x*Math.sin(angle))],facing:angle+(placement.facing??0)};
}
