import {AXES,asPair,asHard,scoreText} from './scores.js';
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
export function accessSettings(lens,place=null){
  const age=Number.isFinite(lens.age)?lens.age:0,verified=lens.identity?.backing==='verified';
  const cap=age<13?'Kids':(!verified||age<18)?'Teen':null;
  const limits=Object.fromEntries(DIMENSIONS.map(([k])=>[k,asPair(lens.limits?.[k])])),hard=Object.fromEntries(DIMENSIONS.map(([k])=>[k,asHard(lens.hard?.[k])]));
  if(cap)for(const [k] of DIMENSIONS)for(const axis of AXES){limits[k][axis]=Math.min(limits[k][axis],PRESETS[cap].limits[k][axis]);const ceiling=PRESETS[cap].hard[k][axis];hard[k][axis]=hard[k][axis]===null?ceiling:Math.min(hard[k][axis],ceiling);}
  const placeId=typeof place==='string'?place:place?.id,person=lens.profileId??lens.id??'visitor';
  if(placeId&&!lens.preview)for(const grant of lens.visitGrants??[]){
    if(grant.person!==person||grant.place!==placeId||!['pending','active'].includes(grant.state)||grant.expires&&Date.parse(grant.expires)<=Date.now())continue;
    for(const [k] of DIMENSIONS)for(const axis of AXES){const n=grant.limits?.[k]?.[axis];if(Number.isInteger(n))limits[k][axis]=Math.max(limits[k][axis],Math.min(n,hard[k][axis]??3));}
  }
  return {age,verified,cap,limits,hard};
}
export const lensSummary=lens=>{const a=accessSettings(lens);return DIMENSIONS.map(([k,label])=>`${label} ≤ ${scoreText(a.limits[k])}`).join(' · ');};

export function appliedPreset(lens){const access=accessSettings(lens);return access.cap&&DIMENSIONS.some(([k])=>AXES.some(a=>asPair(lens.limits[k])[a]>access.limits[k][a]||asHard(lens.hard[k])[a]!==access.hard[k][a]))?`${access.cap} cap`:lens.preset;}
