// The visitor-side contract shared by Page, crossings and Builder preview.
// Policies belong to the source Place; references never get their own policy.
import {DIMENSIONS} from './data.js';
import {accessSettings} from './identity.js';
import {AXES,DIALS,asPair,maxPair,validPair,exceeds,scoreText} from './scores.js';
export const rating=(node,key,parent=null)=>maxPair(node?.content?.[key]??(parent?rating(parent,key):undefined),node?.measured?.[key]);
export function admissionPolicy(room,lens={}){
 const raw=lens.access?.policies?.[room.id]?.admission??room.admission;
 const declaredMinimum=Object.fromEntries(DIMENSIONS.map(([k])=>[k,asPair(raw?.minimum?.[k])])),measuredMinimum=Object.fromEntries(DIMENSIONS.map(([k])=>[k,maxPair(room.admission?.measuredMinimum?.[k],raw?.measuredMinimum?.[k])]));
 const minimum=Object.fromEntries(DIMENSIONS.map(([k])=>[k,maxPair(declaredMinimum[k],measuredMinimum[k])]));
 return {mode:raw?.mode==='filtered'?'filtered':'threshold',minimum,declaredMinimum,measuredMinimum,explicit:!!raw,valid:(!raw||['filtered','threshold'].includes(raw.mode))&&[...Object.values(minimum),...Object.values(declaredMinimum)].every(p=>validPair(p))};
}
export function doorPolicy(room,lens){
 const policy=admissionPolicy(room,lens),a=accessSettings(lens,room),unmet=DIALS.filter(([k,axis])=>a.limits[k][axis]<policy.minimum[k][axis]);
 return {...policy,unmet:unmet.map(([key,axis])=>({key,axis})),blocked:!policy.valid||policy.mode==='threshold'&&unmet.length>0,filtered:policy.mode==='filtered'&&(unmet.length>0||DIMENSIONS.some(([k])=>exceeds(rating(room,k),a.limits[k]))),canRaise:policy.valid&&unmet.every(([k,axis])=>policy.minimum[k][axis]<=(a.hard[k][axis]??3)),description:!policy.valid?'Entrance policy is invalid; entry is unavailable.':policy.mode==='filtered'?'Owner admits a visibly filtered view. Material above either Lens dial is withheld.':`Entrance threshold${policy.explicit?'':' · no additional minimum set'}${Object.values(policy.minimum).some(p=>AXES.some(a=>p[a]>0))?': '+DIMENSIONS.filter(([k])=>AXES.some(a=>policy.minimum[k][a]>0)).map(([k,label])=>label+' ≥ '+scoreText(policy.minimum[k])).join(' · '):'. Visitor previews still apply.'}`};
}
// Walk a containing chain without imposing the parent's score as a polish cap.
// Each node has its own gate. A cycle or missing parent fails closed.
export function containingPlaces(key,rooms,host=null){
 const chain=[],seen=new Set(),resolve=id=>rooms[id]?id:Object.keys(rooms).find(k=>rooms[k].id===id);let at=resolve(key);
 while(at){if(seen.has(at))return null;seen.add(at);chain.unshift(at);const r=rooms[at],parent=r.parentPlaceId??r.parentId??r.parent??(at===key?host:null);if(!parent)break;at=resolve(parent);if(!at)return null;}
 return chain;
}
