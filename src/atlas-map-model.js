import {sourceVisible} from './source-media.js';
import {thingTitle} from './thing-subject.js';
import {ROOMS,EDGES} from './data.js';
import {permission,roomTitle,personId} from './permissions.js';
import {roomEntry,selectContent,contentStore} from './content.js';
import {viewRoom} from './audience.js';
import {sourcedRoom} from './source-catalog.js';
import {graphEdges} from './navigation.js';
import {visibleEdge} from './rules.js';

// A fresh projection of the same catalog used by Discovery. No saved node list.
export function atlasMapModel(lens,current,{showOthers=false,columns=2}={}){
 const places=[];
 for(const [id,original] of Object.entries(ROOMS)){
  const rights=permission(original,lens);if(!rights.visible)continue;
  const gate=roomEntry(id,lens,EDGES),visible=gate.state!=='hidden';if(!visible&&!showOthers)continue;
  const room=sourcedRoom(viewRoom(original,lens),lens),things=[];
  if(visible&&rights.canLook)for(const block of selectContent(room,lens,contentStore.blocks(id,room.blocks)).blocks){
   if(block.filtered||!sourceVisible(block,room,lens))continue;
   const placement=room.layout?.interior?.bays?.find(p=>p.block===block.id)??room.layout?.components?.find(p=>p.block===block.id)??room.builderFixtures?.find(p=>p.block===block.id)??room.sourcePlacements?.find(p=>p.blockId===block.id);
   things.push({id:block.id,title:thingTitle(block),position:placement?.position??null,elevation:placement?.elevation??null,facing:placement?.facing??null,version:block.recordVersionId??null});
  }
  places.push({id,title:visible?roomTitle(original,lens):'Withheld by your Lens',address:visible?original.address:null,current:id===current,owned:original.ownerId===personId(lens),visible,things,position:room.layout?.slot??null});
 }
 places.sort((a,b)=>Number(b.current)-Number(a.current)||Number(b.owned)-Number(a.owned)||a.title.localeCompare(b.title)||a.id.localeCompare(b.id));
 columns=columns===1?1:2;const rowHeight=columns===1?64:44,header=columns===1?78:62;let y=20;for(let i=0;i<places.length;i+=columns){const row=places.slice(i,i+columns);for(const [j,p] of row.entries()){p.x=12+j*220;p.y=y;p.width=columns===1?416:196;p.height=header+4+Math.max(1,p.things.length)*rowHeight;}y+=Math.max(...row.map(p=>p.height))+24;}
 const shown=new Set(places.map(p=>p.id));
 const edges=graphEdges().filter(e=>!e.reversed&&shown.has(e.from)&&shown.has(e.to)).map(e=>({...e,result:visibleEdge(e,lens)})).filter(e=>e.result.state!=='hidden'||showOthers);
 return {places,edges,columns,rowHeight,header,width:440,height:Math.max(180,y),current,signature:JSON.stringify([places,edges.map(e=>[e.id,e.from,e.to,e.result.state,e.result.type])])};
}
