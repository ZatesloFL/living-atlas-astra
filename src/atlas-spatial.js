// Scene-local coordinates are real catalog placements. Separate scenes are
// tiled as separate areas, never assigned invented world distances.
export function spatialMapLayout(places,edges,{scene,position}={}){
 const areas=new Map(),nodes=[];
 const area=(id,title)=>{if(!areas.has(id))areas.set(id,{id,title,points:[]});return areas.get(id);};
 for(const p of places){
  const a=area(p.scene,p.sceneTitle);
  if(p.position){const n={kind:'place',id:p.id,room:p.id,title:p.title,scene:p.scene,position:p.position,current:p.current,owned:p.owned,visible:p.visible};nodes.push(n);a.points.push(n);}
  if(p.interior){const inner=area(p.interior.scene,p.title+' · inside'),n={kind:'place',id:p.id+':inside',room:p.id,title:p.title,scene:inner.id,position:p.interior.arrival.position,current:p.current,owned:p.owned,visible:p.visible};nodes.push(n);inner.points.push(n);}
  for(const t of p.things)if(t.mapPosition){const n={...t,kind:'thing',room:p.id,position:t.mapPosition};nodes.push(n);area(t.scene,t.sceneTitle??p.title).points.push(n);}
 }
 const current=places.find(p=>p.current),currentArea=scene??current?.interior?.scene??current?.scene;for(const n of nodes)if(n.current)n.current=n.scene===currentArea;
 if(position&&areas.has(currentArea))areas.get(currentArea).points.push({kind:'visitor',scene:currentArea,position:[position.x,position.z]});
 const sorted=[...areas.values()].sort((a,b)=>a.id.localeCompare(b.id));
 for(const [i,a] of sorted.entries()){
  const coords=a.points.map(p=>p.position),xs=coords.map(p=>p[0]),zs=coords.map(p=>p[1]);
  const left=Math.min(-4,...xs),right=Math.max(4,...xs),top=Math.min(-4,...zs),bottom=Math.max(4,...zs);
  a.x=(i%2)*620;a.y=Math.floor(i/2)*460;a.width=600;a.height=440;
  const scale=Math.min(450/(right-left),275/(bottom-top));a.scale=scale;
  a.project=([x,z])=>[a.x+300+(x-(left+right)/2)*scale,a.y+225+(z-(top+bottom)/2)*scale];
  for(const n of a.points){[n.x,n.y]=a.project(n.position);}
  // Labels move aside; their markers stay on the recorded coordinates.
  const used=[];for(const n of a.points.filter(p=>p.kind==='place')){
   const w=Math.min(238,Math.max(95,Math.min(20,n.title.length)*10.5+14)),h=34;
   let label;for(let row=0;row<9&&!label;row++)for(const dy of [24+row*38,-58-row*38])for(const dx of [-w/2,24,-w-24]){
    const trial={x:Math.max(a.x+10,Math.min(a.x+a.width-w-10,n.x+dx)),y:Math.max(a.y+45,Math.min(a.y+a.height-h-8,n.y+dy)),w,h};
    if(!used.some(r=>trial.x<r.x+r.w+4&&trial.x+trial.w+4>r.x&&trial.y<r.y+r.h+3&&trial.y+trial.h+3>r.y)){label=trial;break;}

   }
   if(!label){const choices=[];for(let y=a.y+47;y<a.y+a.height-h-8;y+=38)for(let x=a.x+10;x<a.x+a.width-w-8;x+=12){const r={x,y,w,h};if(!used.some(u=>r.x<u.x+u.w+4&&r.x+r.w+4>u.x&&r.y<u.y+u.h+3&&r.y+r.h+3>u.y))choices.push(r);}choices.sort((r,s)=>Math.hypot(r.x+r.w/2-n.x,r.y-n.y)-Math.hypot(s.x+s.w/2-n.x,s.y-n.y));label=choices[0];}
   n.label=label??null;if(label)used.push(label);
  }
 }
 const primary=new Map(nodes.filter(n=>n.kind==='place'&&!n.id.endsWith(':inside')).map(n=>[n.room,n]));
 const paths=edges.flatMap(e=>{const a=primary.get(e.from),b=primary.get(e.to);return a&&b?[{...e,a,b}]:[];});
 return {areas:sorted,nodes,paths,currentArea,visitor:sorted.flatMap(a=>a.points).find(p=>p.kind==='visitor'),width:sorted.length===1?600:1220,height:Math.max(440,Math.ceil(sorted.length/2)*460)};
}
