import {ROOMS} from './data.js';
import {personId,visibilityOf} from './permissions.js';

// Decide from the validated action and current records, never from model assurances.
export function atlasActionBoundary(value,lens){
 if(['lens','envelope','revoke','narrow'].includes(value.kind))return {ask:false};
 if(value.kind==='trip'&&ROOMS[value.target]?.ownerId===personId(lens))return {ask:false};
 if(value.kind==='grant')return {ask:true,reason:'Change what Atlas may do for you?'};
 if(value.kind!=='extension')return {ask:true,reason:'Review this action before it happens.'};
 const room=Object.values(ROOMS).find(r=>r.id===value.placeId);
 if(!room||room.ownerId!==personId(lens))return {ask:true,reason:'This would change a Place you do not own.'};
 if(value.action==='connect-and-map')return {ask:true,reason:'Connect this external source and bring its records into your Place?'};
 const shared=visibilityOf(room,lens)==='public'||(lens.access?.grants??room.grants??[]).some(g=>g.room===room.id&&g.kind!=='helper'&&!g.denied&&!g.revokedAt&&(!g.expires||Date.parse(g.expires)>Date.now())&&(g.to?.group||g.to?.person&&g.to.person!==personId(lens)));
 if(value.action==='publish-draft'&&shared)return {ask:true,reason:'Publish these changes where other people can see or enter them?'};
 if(['place-piece','move-piece','place-source','publish-draft'].includes(value.action))return {ask:false};
 if(value.action==='declare-upload'&&!shared)return {ask:false};
 return {ask:true,reason:'Apply this change where others may see it?'};
}
