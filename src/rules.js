import {permission} from './permissions.js';
import {accessSettings,identityOf} from './identity.js';
import { DIMENSIONS, PRESETS, ROOMS } from './data.js';
export function setPreset(lens, name) {
  lens.preset=name; lens.limits={...PRESETS[name].limits}; lens.hard={...PRESETS[name].hard};
}
export function effectiveIdentity(lens) {const a=accessSettings(lens);return {age:a.age,verified:a.verified};}
export function contentScore(room,key) { return Math.max(room.content?.[key]??0,room.measured?.[key]??0); }
export function crossing(edge,lens,rooms=ROOMS) {
  const target=rooms[edge.to];
  if(!target) return {state:'hidden',type:null,reasons:['Missing room'],oddness:[]};
  const rights=permission(target,lens);if(!rights.visible)return {state:'hidden',type:null,reasons:['No grant to this hidden room'],oddness:[],rights};
  const identity=effectiveIdentity(lens),access=accessSettings(lens);
  const reasons=[],over=[],oddness=[];
  if(identity.age<target.minAge) reasons.push(`Minimum age ${target.minAge}`);
  if(target.visibility==='verified-only'&&!identity.verified) reasons.push('Verified adults only');
  const host=edge.host?rooms[edge.host]:null;
  for(const [key,label] of DIMENSIONS) {
    const score=contentScore(target,key),effective=host?Math.max(score,contentScore(host,key)):score;
    if(host&&score>contentScore(host,key)) reasons.push(`${label} exceeds the host’s score`);
    if(access.hard[key]!==null&&effective>access.hard[key]) reasons.push(`${label}: ${effective}, hard limit ${access.hard[key]}`);
    if(effective>access.limits[key]) over.push(`${label}: ${effective}, your limit ${access.limits[key]}`);
    if((target.measured?.[key]??0)>(target.content?.[key]??0)) oddness.push(`${label} ${target.measured[key]} (declared ${target.content[key]})`);
  }
  if(reasons.length) return {state:'hidden',type:null,reasons,oddness,rights};
  if(!rights.canLook)return {state:'private',type:'door',reasons:[rights.reason,'Knock to request access'],oddness:[],rights};
  if(!rights.canEnter)return {state:over.length?'door':'pass',type:'window',reasons:[rights.reason,'Look only · entering is not granted',...over],oddness,rights};
  if(rights.visibility!=='public')return {state:'door',type:edge.type==='window'?'window':'door',reasons:[rights.reason,...over],oddness,rights};
  // With no hard limit, any amount over a soft limit requires explicit informed entry.
  // A view-only window never becomes an enterable door.
  if(over.length) return {state:'door',type:edge.type==='window'?'window':'door',reasons:over,oddness,rights};
  return {state:'pass',type:edge.type,reasons:[],oddness,rights};
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
