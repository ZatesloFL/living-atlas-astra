import {ROOMS} from './data.js';
import {viewRoom} from './audience.js';
import {sourcedRoom} from './source-catalog.js';
import {selectContent,contentStore} from './content.js';
import {roomVisible} from './rules.js';
import {permission} from './permissions.js';
import {doorPolicy} from './admission.js';

export function thingSubject(roomKey,blockId,lens){
 const original=ROOMS[roomKey];if(!original||!roomVisible(roomKey,lens)||!permission(original,lens).canLook)return null;
 const room=sourcedRoom(viewRoom(original,lens),lens);if(doorPolicy(room,lens).blocked)return null;
 const block=selectContent(room,lens,contentStore.blocks(roomKey,room.blocks)).blocks.find(b=>b.id===blockId&&!b.filtered);
 return block?{roomKey,room,block}:null;
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
