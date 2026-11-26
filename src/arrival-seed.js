// Arrival owns the approved claim and data. Lane B owns registration; the same
// stored kit payload goes to its entry point unchanged, including on reload.
import {ROOMS,EDGES} from './data.js';
import {registerProjection} from './build-projection.js';
import {contentStore} from './content.js';
import {resolvePublicReference} from './public-references.js';
export function loadArrivalSeed(draft){
 const result=registerProjection(draft,{ownerId:draft.holderId});
 for(const key of Object.values(result.roomKeys)){
  const room=ROOMS[key];room.arrivalSeed=true;
  // Heal legacy starter bylines on load without rewriting their claim receipt.
  if(room.author&&!room.author.isAgent)room.author={...room.author,profileId:draft.holderId};
  for(const block of room.blocks??[])if(block.author&&!block.author.isAgent)block.author={...block.author,profileId:draft.holderId};
  // Update only this old system guide sentence, not the stored claim or owner-authored words.
  if(room.id.endsWith('/workshop'))room.blocks=(room.blocks??[]).map(b=>{const old='an unverified account with age unknown and fixed conservative ceilings.',text='an unverified account with fixed conservative ceilings. A supplied age is given, not verified.';return b.id==='account'&&typeof b.body==='string'&&b.body.includes(old)?{...b,body:b.body.replace(old,text),reps:{...b.reps,text:b.reps?.text?.replace(old,text)}}:b;});
  room.includedReferences=[...room.kitPieces.filter(p=>p.ref?.thingId&&p.ref.placeId!==room.id).map(p=>structuredClone(p.ref)),...EDGES.filter(e=>e.from===key&&e.reference&&e.consent==='Source inclusion policy checked at use').map(e=>structuredClone(e.reference))];
 }
 for(const key of Object.values(result.roomKeys))contentStore.emit(key);
 return result;
}
export function starterReferences(room,lens){return (room.includedReferences??[]).map(ref=>resolvePublicReference(ref,lens));}
