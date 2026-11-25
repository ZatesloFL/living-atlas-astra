import {ROOMS} from './data.js';
import {DIMENSIONS,AXES} from './scores.js';
import {viewRoom,versionLabel} from './audience.js';
import {accessSettings} from './identity.js';
import {visibleEdge} from './rules.js';
import {rating} from './admission.js';
import {selectContent,blockAccess} from './content.js';
import {canonical} from './ledger.js';

export function doorAgreement(edge,lens){
 const room=viewRoom(ROOMS[edge.to],lens),gate=visibleEdge(edge,lens),a=accessSettings(lens,room),policy=gate.admission;
 if(!room||gate.state==='hidden')return {required:true,blocked:true,signature:'unavailable',terms:null,softGaps:[],reasons:gate.reasons??[]};
 const softGaps=[],raiseLimits=structuredClone(a.limits);
 for(const [key,label] of DIMENSIONS)for(const axis of AXES){const score=rating(room,key,null,lens)[axis];if(score>a.limits[key][axis])softGaps.push(`${label} ${axis}: ${score}; your limit is ${a.limits[key][axis]}`);raiseLimits[key][axis]=Math.max(a.limits[key][axis],score,policy?.minimum[key][axis]??0);}
 const view=selectContent(room,lens),withheld=view.omitted.content;view.readable=view.blocks.filter(b=>!b.filtered&&!blockAccess(b,room,lens).soft&&!blockAccess(b,room,lens).hidden).length;view.previewRequired=view.blocks.filter(b=>!b.filtered&&blockAccess(b,room,lens).soft).length;
 const raised=(lens.visitGrants??[]).some(g=>g.place===room.id&&['pending','active'].includes(g.state));
 const reasons=[...softGaps,...(policy?.filtered||withheld?['The Lens will withhold content in this rendering.']:[]),...(policy?.ageRule?[policy.age.reason||'A declared age rule applies.']:[]),...(room.minAge>0?[`Declared minimum age: ${room.minAge}.`]:[]),...(policy?.price!==null&&policy?.price!==undefined?[policy.description]:[]),...(policy?.blocked?[policy.description]:[]),...(raised?['An at-door Lens raise applies for this visit.']:[]),...(policy?.standing.reasons??[])];
 const terms={placeId:room.id,version:room.version?.id??room.recordVersionId??null,content:room.content,measured:room.measured??null,admission:policy?{mode:policy.mode,minimum:policy.minimum,ageRule:policy.ageRule,price:policy.price,standingRules:policy.standing.rules}:null,minAge:room.minAge??0};
 const signature=canonical({terms,limits:a.limits,hard:a.hard,grant:gate.rights?.grant?.id??null,reasons});
 return {required:reasons.length>0,blocked:!!policy?.blocked,signature,terms,softGaps,reasons,raiseLimits,raiseSummary:DIMENSIONS.filter(([k])=>AXES.some(axis=>raiseLimits[k][axis]>a.limits[k][axis])).map(([k,label])=>`${label}: amount ${raiseLimits[k].amount}, graphicness ${raiseLimits[k].graphicness}`).join('; '),canRaise:(softGaps.length>0||policy?.unmet.length>0)&&!policy?.priceUnresolved&&!policy?.age.blocked&&!policy?.standing.blocked&&DIMENSIONS.every(([k])=>AXES.every(axis=>raiseLimits[k][axis]<=(a.hard[k][axis]??3))),filtered:!!policy?.filtered||withheld>0,versionLabel:versionLabel(ROOMS[edge.to],lens),view};
}
