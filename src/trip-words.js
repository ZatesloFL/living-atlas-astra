import {ROOMS} from './data.js';
import {roomTitle} from './permissions.js';
import {doorAgreement} from './travel-agreement.js';
import {travelPlan} from './travel-plan.js';
import {spatialRoute} from './interior-space.js';
import {canonical} from './ledger.js';

export function tripDetails(from,target,lens,scene,choice='inside'){
 const plan=travelPlan(from,target,lens,{route:spatialRoute(from,target,lens,scene,choice)});
 if(!plan.route)throw new Error('No permitted route to that Place under the current Lens and door terms.');
 const route=plan.route.map(edge=>{const agreement=doorAgreement(edge,lens),title=roomTitle(ROOMS[edge.to],lens),reasons=agreement.reasons;
  return {edge,title,agreement,words:`${title}. ${agreement.versionLabel||''} ${reasons.length?reasons.join(' '):'Within your Lens; no additional door term to agree to.'} ${!agreement.view?'':`${agreement.view.readable} Things are readable at these limits; ${agreement.view.previewRequired} need an individual preview; ${agreement.view.omitted.content} are withheld by content checks.`}`};});
 return {target,choice,plan,route,signature:canonical({from,target,choice,route:route.map(r=>({id:r.edge.id,title:r.title,agreement:r.agreement.signature}))}),words:route.length?'Route: '+route.map(r=>r.title).join(' → ')+'. '+route.map((r,i)=>`Stop ${i+1}: ${r.words.slice(r.title.length+2)}`).join(' '):choice==='inside'?`You are already at ${roomTitle(ROOMS[target],lens)}. This trip changes only the arrival point.`:`Arrive at the public approach to ${roomTitle(ROOMS[target],lens)}. This does not cross the hall’s door.`};
}

export function arrivalWords(arrival,lens){
 const title=roomTitle(ROOMS[arrival.room],lens);
 if(arrival.choice==='inside')return 'Arrived inside '+title+'. The crossing is recorded.';
 return (arrival.choice==='door'?'At the door to ':'At the public approach to ')+title+(arrival.contextRoom?', in '+roomTitle(ROOMS[arrival.contextRoom],lens):'')+'. This Place has not been entered.';
}
