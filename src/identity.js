import {DIMENSIONS,PRESETS} from './data.js';
export const DISPLAY_LABELS={anonymous:'Anonymous',pseudonym:'Pseudonym',real:'Real name'};
export function identityOf(subject){
  return subject.identity??{display:subject.tier==='anonymous'?'anonymous':subject.tier==='named'?'pseudonym':'real',backing:subject.verifiedHuman?'verified':'none'};
}
export function identityBadge(subject){
  const i=identityOf(subject);
  if(subject.isAgent)return `Agent · ${i.backing==='verified'?'verified person operates it':'no verified operator'}`;
  return `${DISPLAY_LABELS[i.display]} · ${i.backing==='verified'?'verified person behind it':'no trail'}`;
}
export function authorName(subject){return identityOf(subject).display==='anonymous'&&!subject.isAgent?'Anonymous':subject.name;}
export function accessSettings(lens){
  const age=Number.isFinite(lens.age)?lens.age:0,verified=lens.identity?.backing==='verified';
  const cap=age<13?'Kids':(!verified||age<18)?'Teen':null;
  const limits={...lens.limits},hard={...lens.hard};
  if(cap)for(const [k] of DIMENSIONS){limits[k]=Math.min(limits[k],PRESETS[cap].limits[k]);const ceiling=PRESETS[cap].hard[k];hard[k]=hard[k]===null?ceiling:Math.min(hard[k],ceiling);}
  return {age,verified,cap,limits,hard};
}
export function appliedPreset(lens){const access=accessSettings(lens);return access.cap&&DIMENSIONS.some(([k])=>lens.limits[k]>access.limits[k]||lens.hard[k]!==access.hard[k])?`${access.cap} cap`:lens.preset;}
