import {ROOMS,DIMENSIONS} from './data.js';
import {accessSettings,identityOf} from './identity.js';
import {contentScore,roomVisible,visibleEdge} from './rules.js';
const order={core:0,supporting:1,detail:2},depths={Glance:0,Standard:1,Deep:2};
export function blockAccess(block,room,lens){
 const access=accessSettings(lens),hard=[],soft=[];
 for(const [key,label] of DIMENSIONS){const score=block.content?.[key]??contentScore(room,key);if(access.hard[key]!==null&&score>access.hard[key])hard.push(label);if(score>access.limits[key])soft.push(label);}
 return {hidden:hard.length>0,soft:soft.length>0,reasons:hard.length?hard:soft};
}
export function selectContent(room,lens,blocks=room.blocks??[]){
 const shown=[],omitted={depth:0,content:0,show:0,trust:0};
 for(const block of blocks){
  if((order[block.importance]??1)>(depths[lens.depth]??1)){omitted.depth++;continue;}
  if(blockAccess(block,room,lens).hidden){omitted.content++;continue;}
  const author=block.author??room.author;
  if(author&&!author.isAgent&&lens.show?.[identityOf(author).display]===false){omitted.show++;continue;}
  const trust=block.trust??{},kind=lens.trustFrom??'Author';
  // Core authored material remains visible and labeled. Trust narrows supporting material,
  // never manufactures a review or changes identity/content access.
  if(block.importance!=='core'&&((kind==='Academic'&&!trust.academic)||(kind==='Vouched'&&!(trust.vouches>0))||(kind==='Community'&&!(trust.community>0)))){omitted.trust++;continue;}
  shown.push(block);
 }
 return {blocks:shown,omitted};
}
export function roomEntry(id,lens,edges){
 if(!ROOMS[id]||!roomVisible(id,lens))return {state:'hidden',type:null,reasons:['Outside your lens']};
 const edge=edges.find(e=>e.to===id)??{to:id,type:'seamless'};
 return visibleEdge(edge,lens);
}
export class ContentStore {
 constructor(rooms=ROOMS){this.rooms=rooms;this.overrides=new Map();this.listeners=new Set();this.tokens=new Map();}
 blocks(id){return this.rooms[id]?.blocks?.map(b=>({...b,...this.overrides.get(id+':'+b.id)}))??[];}
 subscribe(fn){this.listeners.add(fn);return()=>this.listeners.delete(fn);}
 emit(id){for(const fn of this.listeners)fn(id);}
 async load(id,blockId,loader){
  const key=id+':'+blockId,token=Symbol();this.tokens.set(key,token);this.overrides.set(key,{state:'pending'});this.emit(id);
  try{const payload=await loader();if(this.tokens.get(key)!==token)return;const original=this.rooms[id]?.blocks?.find(b=>b.id===blockId);if(!original)throw new Error('Unknown content block');
   // Loader changes representations/body only. Authorship, type, importance and access
   // metadata remain in the catalog until a future source adapter validates them.
   this.overrides.set(key,{state:'ready',body:payload?.body??original.body,reps:{...original.reps,...payload?.reps}});
  }catch(error){if(this.tokens.get(key)!==token)return;this.overrides.set(key,{state:'error',error:'Content could not be loaded. A text fallback is shown.'});}
  this.emit(id);
 }
}
export const contentStore=new ContentStore();
