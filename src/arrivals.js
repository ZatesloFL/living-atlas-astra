// Arrival geometry is catalog data, shared by fast travel, trails and future kit rooms.
export function addArrivals(rooms,edges){
 for(const [id,r] of Object.entries(rooms)){
  const layout=r.layout,e=edges.find(e=>e.to===id&&e.scene===layout.scene),inside=layout.approach??[layout.slot[0],layout.slot[1]+2];
  const door=e?(e.before??(e.axis==='x'?[e.position[0]-1.5,e.position[1]]:[e.position[0],e.position[1]+1.5])):inside;
  const outside=e?(e.axis==='x'?[door[0]-1,door[1]]:[door[0],Math.min(11.3,door[1]+1)]):[inside[0],Math.min(11.3,inside[1]+1)];
  const point=position=>({position,facing:Math.atan2(layout.slot[0]-position[0],layout.slot[1]-position[1])-Math.PI});
  layout.arrivals??={outside:point(outside),door:point(door),inside:point(inside)};
 }
}
