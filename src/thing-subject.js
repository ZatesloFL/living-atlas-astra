import {sourceVisible} from './source-media.js';
import {ROOMS} from './data.js';
import {viewRoom} from './audience.js';
import {sourcedRoom} from './source-catalog.js';
import {selectContent,contentStore} from './content.js';
import {roomVisible} from './rules.js';
import {permission} from './permissions.js';
import {doorPolicy} from './admission.js';

// Recovery keeps the historical Thing and its receipts intact. Only the link
// destination changes, using the explicit relation published by the Builder.
export function recoveredHall(ref,lens){
 if(!ref?.thingId)return null;
 const hall=Object.values(ROOMS).find(room=>{
  const old=room.builderStructure?.recoveredFrom?.thing;
  return old?.placeId===ref.placeId&&old.thingId===ref.thingId&&(!ref.versionId||old.versionId===ref.versionId);
 });
 return hall&&roomVisible(hall.id,lens)&&permission(hall,lens).canLook?hall:null;
}
export function pickedRecoveredHall(marker,lens){
 if(typeof marker!=='string'||!marker.startsWith('exhibit:'))return null;
 for(const room of Object.values(ROOMS)){
  const old=room.builderStructure?.recoveredFrom?.thing;
  if(old&&marker==='exhibit:'+old.placeId+':'+old.thingId)return recoveredHall(old,lens);
 }
 return null;
}

export function thingSubject(roomKey,blockId,lens){
 const original=ROOMS[roomKey];if(!original||!roomVisible(roomKey,lens)||!permission(original,lens).canLook)return null;
 const room=sourcedRoom(viewRoom(original,lens),lens);if(doorPolicy(room,lens).blocked)return null;
 const block=selectContent(room,lens,contentStore.blocks(roomKey,room.blocks)).blocks.find(b=>b.id===blockId&&!b.filtered);
 return block&&sourceVisible(block,room,lens)?{roomKey,room,block}:null;
}
export function pickedThing(marker,lens){
 if(typeof marker!=='string'||!marker.startsWith('exhibit:'))return null;
 for(const roomKey of Object.keys(ROOMS).sort((a,b)=>b.length-a.length)){
  const prefix='exhibit:'+roomKey+':';if(!marker.startsWith(prefix))continue;
  const original=ROOMS[roomKey],room=sourcedRoom(viewRoom(original,lens),lens),suffix=marker.slice(prefix.length);
  for(const block of [...room.blocks??[]].sort((a,b)=>b.id.length-a.id.length))if(suffix===block.id||suffix.startsWith(block.id+':')&&/^\d+$/.test(suffix.slice(block.id.length+1))){
   const subject=thingSubject(roomKey,block.id,lens);return subject?{...subject,photo:suffix===block.id?null:suffix.slice(block.id.length+1)}:null;
  }
 }
 return null;
}

export function thingTitle(block){
 for(const title of [block?.title,block?.exhibit?.settings?.title,...(['image','video','audio','model','heading'].includes(block?.type)?[block?.body]:[])])if(typeof title==='string'&&title.trim())return title;
 return 'Untitled Thing';
}
