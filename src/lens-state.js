import {DIMENSIONS,pair} from './scores.js';

// Null means no personal choice, not an age-derived starting position.
// The crossing engine conservatively evaluates an unset soft dial as zero.
export const unsetDials=()=>Object.fromEntries(DIMENSIONS.map(([key])=>[key,pair(null,null)]));
export const personalPair=value=>value&&typeof value==='object'?pair(value.amount??null,value.graphicness??null):pair(value??null);
export const dialLabel=value=>value==null?'Not set':String(value);
export const UNSET_HELP='Dials marked “Not set” use 0 for filtering until you choose.';
export function assuranceExplanation(subject){
  const account=subject.accountState??subject;
  if(account.identity?.backing!=='verified')return 'Your account is not yet age-verified. Adult-range doors stay closed until it is.';
  if(Number.isFinite(account.age)&&account.age<18)return 'This local profile simulates a minor account. Guardian linking is not connected; fixed ceilings apply.';
  return 'This local profile simulates a verified adult account. Verification is not connected in this prototype.';
}
