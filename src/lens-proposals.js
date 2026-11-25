import {DIMENSIONS,AXES,validPair} from './scores.js';
import {accessSettings} from './identity.js';
export const lensBasis=lens=>JSON.stringify({limits:lens.limits,hard:lens.hard,identity:lens.identity,age:lens.age,accountState:lens.accountState??null});
export function validateLensChanges(changes,lens){
 if(!changes||typeof changes!=='object'||Array.isArray(changes)||!Object.keys(changes).length||Object.entries(changes).some(([k,p])=>!DIMENSIONS.some(([id])=>id===k)||!validPair(p)))throw new Error('Each proposed dimension needs both amount and graphicness, from 0 to 3.');
 const access=accessSettings(lens);
 for(const [key,p] of Object.entries(changes))for(const axis of AXES)if(p[axis]>(access.hard[key][axis]??3))throw new Error(`${DIMENSIONS.find(([k])=>k===key)[1]} ${axis} ${p[axis]} exceeds the current ceiling ${access.hard[key][axis]}. The proposal cannot change a hard limit or account assurance.`);
 return changes;
}
export function changedLens(lens,changes){validateLensChanges(changes,lens);return {...lens,preset:'Custom',limits:{...structuredClone(lens.limits),...structuredClone(changes)}};}
