// Arrival owns the approved claim and data. Lane B owns registration; the same
// stored kit payload goes to its entry point unchanged, including on reload.
import {ROOMS,EDGES} from './data.js';
import {registerProjection} from './build-projection.js';
import {resolvePublicReference} from './public-references.js';
export function loadArrivalSeed(draft){
 const result=registerProjection(draft,{ownerId:draft.holderId});
 for(const key of Object.values(result.roomKeys)){
  const room=ROOMS[key];room.arrivalSeed=true;
  room.includedReferences=[...room.kitPieces.filter(p=>p.ref?.thingId&&p.ref.placeId!==room.id).map(p=>structuredClone(p.ref)),...EDGES.filter(e=>e.from===key&&e.reference&&e.consent==='Source inclusion policy checked at use').map(e=>structuredClone(e.reference))];
 }
 return result;
}
export function starterReferences(room,lens){return (room.includedReferences??[]).map(ref=>resolvePublicReference(ref,lens));}
