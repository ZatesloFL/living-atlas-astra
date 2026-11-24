import {AXES,asPair,validPair} from './scores.js';
import {viewRoom,selectVersion} from './audience.js';
import {permission} from './permissions.js';
import {accessSettings,identityOf} from './identity.js';
import { DIMENSIONS, PRESETS, ROOMS } from './data.js';
import {rating,doorPolicy,containingPlaces} from './admission.js';
export function setPreset(lens, name) {
  lens.preset=name; lens.limits=structuredClone(PRESETS[name].limits); lens.hard=structuredClone(PRESETS[name].hard);
}
export function effectiveIdentity(lens) {const a=accessSettings(lens);return {age:a.age,verified:a.verified};}
export function contentScore(room,key,lens={}) { return rating(room,key,null,lens); }
export function crossing(edge,lens,rooms=ROOMS,inside=false) {
  const original=rooms[edge.to],target=original&&viewRoom(original,lens);
  if(!inside&&original){const chain=containingPlaces(edge.to,rooms,edge.host);if(!chain)return {state:'hidden',type:null,reasons:['Invalid containing path'],oddness:[]};for(const key of chain.slice(0,-1)){const parent=crossing({to:key,type:'door'},lens,rooms,true);if(parent.state==='hidden'||parent.state==='private'||parent.admission?.blocked)return {...parent,state:'hidden',type:null,reasons:['Containing Place is not admitted',...parent.reasons]};}}
  if(original?.versions?.length&&!selectVersion(original,lens))return {state:'hidden',type:null,reasons:['No audience version fits this lens'],oddness:[]};
  if(!target) return {state:'hidden',type:null,reasons:['Missing room'],oddness:[]};
  if(edge.reference&&edge.consent==='Source inclusion policy checked at use'&&(permission(target,lens).visibility!=='public'||(lens.access?.policies?.[target.id]?.embed??target.permissions?.embed)!=='anyone'))return {state:'hidden',type:null,reasons:['Source inclusion is unavailable'],oddness:[]};
  if(DIMENSIONS.some(([key])=>!validPair(rating(target,key,null,lens))))return {state:'hidden',type:null,reasons:['Invalid content scores'],oddness:[]};
  const rights=permission(target,lens);if(!rights.visible)return {state:'hidden',type:null,reasons:['No grant to this hidden room'],oddness:[],rights};
  const identity=effectiveIdentity(lens),access=accessSettings(lens,target),admission=doorPolicy(target,lens);
  const reasons=[],over=[],oddness=[];
  if(identity.age<target.minAge) reasons.push(`Minimum age ${target.minAge}`);
  if(target.visibility==='verified-only'&&!identity.verified) reasons.push('Verified adults only');
  for(const [key,label] of DIMENSIONS)for(const axis of AXES) {
    const effective=contentScore(target,key,lens)[axis],hard=access.hard[key][axis],limit=access.limits[key][axis],declared=asPair(target.content?.[key])[axis],measured=asPair(target.measured?.[key])[axis];
    if(hard!==null&&effective>hard&&admission.mode!=='filtered') reasons.push(`${label} ${axis}: ${effective}, hard limit ${hard}`);
    if(effective>limit) over.push(`${label} ${axis}: ${effective}, your limit ${limit}`);
    if(measured>declared) oddness.push(`${label} ${axis} ${measured} (declared ${declared})`);
    if(admission.measuredMinimum[key][axis]>admission.declaredMinimum[key][axis])oddness.push(`Entrance ${label} ${axis} ${admission.measuredMinimum[key][axis]} (declared ${admission.declaredMinimum[key][axis]})`);
  }
  if(reasons.length) return {state:'hidden',type:null,reasons,oddness,rights};
  if(admission.blocked&&rights.canLook)return {state:'door',type:edge.type==='window'?'window':'door',reasons:[admission.description,...admission.unmet.map(({key,axis})=>`${DIMENSIONS.find(([k])=>k===key)[1]} ${axis}: ${access.limits[key][axis]}, entrance needs ${admission.minimum[key][axis]}`)],oddness,rights,admission};
  if(!rights.canLook)return {state:'private',type:'door',reasons:[rights.reason,'Knock to request access'],oddness:[],rights};
  if(!rights.canEnter)return {state:over.length?'door':'pass',type:'window',reasons:[rights.reason,'Look only · entering is not granted',...over],oddness,rights,admission};
  if(rights.visibility!=='public')return {state:'door',type:edge.type==='window'?'window':'door',reasons:[admission.description,rights.reason,...over],oddness,rights,admission};
  if(admission.explicit)return {state:'door',type:edge.type==='window'?'window':'door',reasons:[admission.description,...over],oddness,rights,admission};
  // With no hard limit, any amount over a soft limit requires explicit informed entry.
  // A view-only window never becomes an enterable door.
  if(over.length) return {state:'door',type:edge.type==='window'?'window':'door',reasons:over,oddness,rights,admission};
  return {state:'pass',type:edge.type,reasons:[],oddness,rights,admission};
}
export function roomVisible(key,lens) {
  const room=ROOMS[key];
  if(!room) return false;
  if(!crossing({to:key,type:'seamless'},lens).type) return false;
  if(!permission(room,lens).canLook||!room.author)return true;
  return room.author.isAgent||lens.show[identityOf(room.author).display]!==false;
}
export function visibleEdge(edge,lens) {
  const result=crossing(edge,lens);
  // Hiding an author's objects must not erase an agent hosted in that room.
  if(result.state!=='hidden'&&ROOMS[edge.to]?.author&&!roomVisible(edge.to,lens))
    return {...result,state:'hidden',type:null,reasons:['Hidden by your author filter']};
  if(edge.host&&!roomVisible(edge.host,lens)) return {...result,state:'hidden',type:null,reasons:['Host is hidden by your lens']};
  return result;
}
export function presetForIdentity(lens,identity) {
  lens.viewAs=identity;
  lens.identity={display:identity==='child'||identity==='visitor'?'anonymous':'real',backing:identity==='verified'||identity==='me'||identity==='agent'?'verified':'none'};
  lens.age=identity==='child'?10:25;lens.isAgent=identity==='agent';lens.testMode=true;
  // Explicit simulation shortcuts; these do not establish a product default or real verification.
  setPreset(lens,identity==='child'?'Kids':identity==='visitor'?'Teen':'Adult');
}
