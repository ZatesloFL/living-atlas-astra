import {ROOMS} from './data.js';
import {crossing} from './rules.js';
import {permission} from './permissions.js';
import {viewRoom} from './audience.js';
import {selectContent,blockAccess} from './content.js';

// A placement holds origin IDs only. Resolve afresh at every use; never cache a
// copied body, owner, score, standing or grant in the personal estate.
export function resolvePublicReference(ref,lens,rooms=ROOMS){
 const key=Object.keys(rooms).find(k=>rooms[k].id===ref?.placeId),source=rooms[key];
 if(!source)return {allowed:false,reason:'Source unavailable'};
 const rights=permission(source,lens),gate=crossing({to:key,type:'door'},lens,rooms);
 if(rights.visibility!=='public'||!rights.canLook||gate.state==='hidden'||gate.admission?.blocked)return {allowed:false,reason:'Source access unavailable'};
 // Public is discovery, not inclusion permission. Approved-only sources need
 // a future source-issued inclusion grant; enter/look grants do not imply it.
 const consent=lens.access?.policies?.[source.id]?.embed??source.permissions?.embed;
 if(consent!=='anyone')return {allowed:false,reason:consent==='approved'?'Source owner approval required':'Source inclusion is unavailable'};
 if(!ref.thingId)return {allowed:true,kind:'Place',key,ref:{placeId:source.id},title:source.title,gate,source,styleControl:source.styleControl};
 const room=viewRoom(source,lens),block=selectContent(room,lens).blocks.find(b=>b.id===ref.thingId);
 if(!block)return {allowed:false,reason:'Source Thing is unavailable under this Lens'};
 const access=blockAccess(block,room,lens);
 if(block.filtered||access.hidden||access.soft)return {allowed:false,filtered:!!block.filtered,reason:'Source Thing is withheld by this Lens'};
 return {allowed:true,kind:'Thing',key,ref:{placeId:source.id,thingId:block.id},title:source.title+' · '+block.id,gate,source:room,block,styleControl:source.styleControl};
}
export function publicSelections(lens,rooms=ROOMS){
 return Object.values(rooms).flatMap(room=>[...(!room.layout?.root?[{placeId:room.id}]:[]),...(room.blocks??[]).filter(b=>b.importance==='core').slice(0,1).map(b=>({placeId:room.id,thingId:b.id}))])
 .map(ref=>resolvePublicReference(ref,lens,rooms)).filter(item=>item.allowed).map(({ref,title,kind})=>({ref,title,kind}));
}
