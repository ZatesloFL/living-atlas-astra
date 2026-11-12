import { DIMENSIONS, PRESETS, ROOMS } from './data.js';
export function setPreset(lens, name) {
  lens.preset=name; lens.limits={...PRESETS[name].limits}; lens.hard={...PRESETS[name].hard};
}
export function effectiveIdentity(lens) {
  if (lens.viewAs==='child') return {age:10,verified:false};
  if (lens.viewAs==='verified') return {age:25,verified:true};
  return {age:25,verified:false};
}
export function contentScore(room,key) { return Math.max(room.content?.[key]??0,room.measured?.[key]??0); }
export function crossing(edge,lens,rooms=ROOMS) {
  const target=rooms[edge.to];
  if(!target) return {state:'hidden',type:null,reasons:['Missing room'],oddness:[]};
  if(target.visibility==='private') return {state:'private',type:'door',reasons:['Private space'],oddness:[]};
  const identity=effectiveIdentity(lens);
  const reasons=[],over=[],oddness=[];
  if(identity.age<target.minAge) reasons.push(`Minimum age ${target.minAge}`);
  if(target.visibility==='verified-only'&&!identity.verified) reasons.push('Verified adults only');
  const host=edge.host?rooms[edge.host]:null;
  for(const [key,label] of DIMENSIONS) {
    const score=contentScore(target,key),effective=host?Math.max(score,contentScore(host,key)):score;
    if(host&&score>contentScore(host,key)) reasons.push(`${label} exceeds the host’s score`);
    if(lens.hard[key]!==null&&effective>lens.hard[key]) reasons.push(`${label}: ${effective}, hard limit ${lens.hard[key]}`);
    if(effective>lens.limits[key]) over.push(`${label}: ${effective}, your limit ${lens.limits[key]}`);
    if((target.measured?.[key]??0)>(target.content?.[key]??0)) oddness.push(`${label} ${target.measured[key]} (declared ${target.content[key]})`);
  }
  if(reasons.length) return {state:'hidden',type:null,reasons,oddness};
  // With no hard limit, any amount over a soft limit requires explicit informed entry.
  // A view-only window never becomes an enterable door.
  if(over.length) return {state:'door',type:edge.type==='window'?'window':'door',reasons:over,oddness};
  return {state:'pass',type:edge.type,reasons:[],oddness};
}
export function roomVisible(key,lens) {
  if(key==='family') return true;
  const room=ROOMS[key];
  if(!room) return false;
  if(!crossing({to:key,type:'seamless'},lens).type) return false;
  return room.author.isAgent||lens.show[room.author.tier]!==false;
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
  // Explicit simulation shortcuts; these do not establish a product default or real verification.
  setPreset(lens,identity==='child'?'Kids':identity==='visitor'?'Teen':'Adult');
}
