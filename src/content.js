import {displayDecision} from './standing-policy.js';
import {standingState,targetRef} from './standing-records.js';
import {AXES,exceeds,validPair} from './scores.js';
import {ROOMS,DIMENSIONS} from './data.js';
import {accessSettings,identityOf} from './identity.js';
import {contentScore,roomVisible,visibleEdge} from './rules.js';
import {rating,admissionPolicy} from './admission.js';
const order={core:0,supporting:1,detail:2},depths={Glance:0,Standard:1,Deep:2};
export function blockAccess(block,room,lens){
 const access=accessSettings(lens,room),hard=[],soft=[],display=displayDecision(standingState(lens),targetRef(room,block));
 for(const [key,label] of DIMENSIONS){const score=rating(block,key,room,lens);if(!validPair(score)){hard.push(label+' invalid score');soft.push(label+' invalid score');continue;}for(const axis of AXES){if(access.hard[key][axis]!==null&&score[axis]>access.hard[key][axis])hard.push(label+' '+axis);if(score[axis]>access.limits[key][axis])soft.push(label+' '+axis);}}
 return {hidden:hard.length>0,soft:soft.length>0,withheld:!!display?.excluded||admissionPolicy(room,lens).mode==='filtered'&&(hard.length>0||soft.length>0),displayExcluded:!!display?.excluded,displayBy:display?.published?display.name:'Place owner',reasons:hard.length?hard:soft};
}
// The hero and the block reader share exactly the same soft-preview boundary.
// Hard limits are checked separately and can never be approved away.
export function blockNeedsPreview(block,room,lens,{approved=false,softApproved=new Set()}={}){
 const covered=approved&&DIMENSIONS.every(([k])=>!exceeds(rating(block,k,room,lens),contentScore(room,k,lens)));
 return blockAccess(block,room,lens).soft&&!covered&&!softApproved.has(block.id);
}
export function selectContent(room,lens,blocks=room.blocks??[]){
 const shown=[],omitted={depth:0,content:0,show:0,trust:0};
 for(const block of blocks){
  if((order[block.importance]??1)>(depths[lens.depth]??1)){omitted.depth++;continue;}
  const author=block.author??room.author;
  if(author&&!author.isAgent&&lens.show?.[identityOf(author).display]===false){omitted.show++;continue;}
  const trust=block.trust??{},kind=lens.trustFrom??'Author';
  // Core authored material remains visible and labeled. Trust narrows supporting material,
  // never manufactures a review or changes identity/content access.
  if(block.importance!=='core'&&((kind==='Academic'&&!trust.academic)||(kind==='Vouched'&&!(trust.vouches>0))||(kind==='Community'&&!(trust.community>0)))){omitted.trust++;continue;}
  const gate=blockAccess(block,room,lens);
  if(gate.withheld){omitted.content++;shown.push({id:block.id,type:'withheld',importance:block.importance,filtered:true,...(gate.displayExcluded?{filteredBy:'Place Steward',displayBy:gate.displayBy}:{})});continue;}
  if(gate.hidden){omitted.content++;continue;}
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
 blocks(id,base=this.rooms[id]?.blocks){return base?.map(b=>({...b,...this.overrides.get(id+':'+b.id)}))??[];}
 subscribe(fn){this.listeners.add(fn);return()=>this.listeners.delete(fn);}
 emit(id){for(const fn of this.listeners)fn(id);}
 async load(id,blockId,loader){
  const key=id+':'+blockId,token=Symbol();this.tokens.set(key,token);this.overrides.set(key,{state:'pending'});this.emit(id);
  try{const payload=await loader();if(this.tokens.get(key)!==token)return;const original=[...(this.rooms[id]?.blocks??[]),...(this.rooms[id]?.versions??[]).flatMap(v=>v.blocks??[])].find(b=>b.id===blockId);if(!original)throw new Error('Unknown content block');
   // Loader changes representations/body only. Authorship, type, importance and access
   // metadata remain in the catalog until a future source adapter validates them.
   this.overrides.set(key,{state:'ready',body:payload?.body??original.body,reps:{...original.reps,...payload?.reps}});
  }catch(error){if(this.tokens.get(key)!==token)return;this.overrides.set(key,{state:'error',error:'Content could not be loaded. A text fallback is shown.'});}
  this.emit(id);
 }
}
export const contentStore=new ContentStore();
