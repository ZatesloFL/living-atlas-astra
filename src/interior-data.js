import {defineInterior} from './interior-kit.js';
export function addInteriors(rooms){
 rooms.boycott.layout.interior=defineInterior({kind:'exhibit-hall',scene:'hall:boycott',parent:'tallahassee',edge:'city-boycott',width:18,depth:24,height:4.8,
  frontage:{width:6.4,height:4.4,depth:4.8,door:[9,-3.4],arrival:[8,3.1],outside:[6.5,3.6]},
  arrival:{position:[0,8.4],facing:0},exit:[0,11.65],
  partitions:[{position:[-6.5,1],size:[5,.24]},{position:[6.5,1],size:[5,.24]}],
  bays:[
   {block:'film',position:[-8.55,5.5],facing:Math.PI/2,approach:[-2.5,5.5],label:[-8.36,3.46,5.5]},
   {block:'archive-image',position:[8.55,5.3],facing:-Math.PI/2,approach:[0,5.3],label:[8.32,4.06,5.3]},
   {block:'oral-history',position:[-7.9,-3.8],facing:Math.PI/2,approach:[-3.4,-3.8],label:[-8.67,2.46,-3.8]},
   {block:'sample-clipping',position:[7.2,-3.8],facing:-Math.PI/2,approach:[3.2,-3.8],label:[8.67,2.46,-3.8]},
   {block:'bus-model',position:[0,-8.5],facing:0,approach:[0,.5],label:[0,2.8,-11.72]},
  ]});
}
