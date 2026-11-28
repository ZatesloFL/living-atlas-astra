export const BOYCOTT_HALL_FINISH = Object.freeze({
  background:'#5d6458', floor:'#b2a38c', wall:'#ad9f82', skirting:'#59635b',
  ceiling:'#d1c3a6', partition:'#788077', sun:'#fff0d2', sky:'#f7ead4', ground:'#c2b9a7',
});

const displayWalls = {
  film:{width:4.6,paint:'#304041',frame:'#ac9373'},
  'archive-image':{width:5.9,paint:'#baa47e',frame:'#65584a'},
  'oral-history':{width:4.6,paint:'#694d43',frame:'#af8969'},
  'sample-clipping':{width:4.6,paint:'#526766',frame:'#9f906f'},
};

export function drawBoycottHallDetails(world,hall){
  const {width,depth,height}=hall;
  const groundMark=(x,z,w,d,color)=>world.box(x,.031,z,w,.015,d,color,'ground');
  groundMark(0,0,5.5,depth-.6,'#6a7162');
  const sideAisle=(width-.7-5.5)/2;
  for(const z of [5.4,-3.8])for(const side of [-1,1])groundMark(side*(2.75+sideAisle/2),z,sideAisle,2.8,'#968970');
  // The two clear edge lines make the main aisle readable without text or colour alone.
  for(const x of [-2.9,2.9])world.box(x,.041,0,.075,.012,depth-.6,'#e6d0a4','ground');

  for(const bay of hall.bays){
    const finish=displayWalls[bay.block];
    if(!finish)continue;
    const side=Math.sign(bay.position[0]);
    const x=side*(width/2-.19),z=bay.position[1];
    world.box(x,2.15,z,.065,3.96,finish.width,finish.paint);
    for(const edge of [-1,1])world.box(x-side*.07,2.15,z+edge*finish.width/2,.14,4.05,.13,finish.frame);
    world.box(x-side*.07,4.16,z,.16,.115,finish.width+.13,finish.frame);
    world.box(x-side*.18,4.24,z,.24,.065,finish.width*.60,'#f5e1b6');
    if(bay.block==='oral-history') {
      for(const offset of [-1.8,-1.5,-1.2,1.2,1.5,1.8])world.box(x-side*.07,1.98,z+offset,.12,3.55,.065,finish.frame);
    }
  }

  const rear=-depth/2+.17;
  world.box(0,2.52,rear,8,4.35,.10,'#40534e');
  for(const x of [-4.15,4.15])world.box(x,2.52,rear+.04,.11,4.35,.18,'#ae9571');
  world.box(0,4.65,rear+.04,8.35,.085,.18,'#ae9571');
  world.box(0,.043,-8.65,6.6,.025,4.2,'#c5b18c','ground');

  for(const z of [9.4,1.7,-4.7,-9]){
    world.box(0,height-.27,z,width-.38,.18,.28,'#776a52');
    for(const x of [-4.6,0,4.6])world.box(x,height-.40,z,2.6,.10,.38,'#ead9ae');
  }
  for(const x of [-2.19,2.19])world.box(x,(height+3.7)/2,-1.7,.046,height-3.7,.046,'#98835e');
}
