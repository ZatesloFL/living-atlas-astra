import {standingDoorPolicy,stewardGrants} from './standing-policy.js';
export const SCOPES=['look','enter','suggest','edit'];
export const scopeRank=scope=>SCOPES.indexOf(scope);
export const personId=lens=>lens.profileId??lens.id??'visitor';
export const visibilityOf=(room,lens)=>lens.access?.policies?.[room.id]?.visibility??(room.visibility==='private'?'listed':room.visibility==='verified-only'?'public':room.visibility??'public');
export function permission(room,lens,now=Date.now()){
 const visibility=visibilityOf(room,lens),owner=!lens.isAgent&&(room.ownerId?room.ownerId===personId(lens):lens.playAs==='owner');
 const groups=lens.access?.groups??[];
 const member=id=>{const g=groups.find(g=>g.id===id);return !!g&&(g.kind!=='credential'||lens.identity?.backing==='verified')&&((lens.groups??[]).includes(id)||(g?.members??[]).includes(personId(lens)));};
 const valid=(lens.access?.grants??room.grants??[]).filter(g=>g.room===room.id&&!g.revokedAt&&(!g.expires||Date.parse(g.expires)>now)&&(!g.createdAt||Date.parse(g.createdAt)<=now)&&(!g.delegation?.length||g.delegation.every(id=>stewardGrants(lens.access?.standingState,room.id,now).some(s=>s.id===id&&s.active))));
 const individual=valid.filter(g=>g.to?.person===personId(lens)).sort((a,b)=>Date.parse(b.createdAt)-Date.parse(a.createdAt)||b.id.localeCompare(a.id))[0];
 const collective=valid.filter(g=>g.to?.group&&member(g.to.group)).map(g=>({...g,scope:SCOPES[Math.min(scopeRank(g.scope),scopeRank(groups.find(x=>x.id===g.to.group)?.maxScope??g.scope))]})).sort((a,b)=>scopeRank(b.scope)-scopeRank(a.scope))[0];
 const standing=standingDoorPolicy(room,lens),standingGrant=standing.autoAdmit&&!standing.blocked?{id:'standing-rule:'+room.id,scope:'enter',approvedBy:room.ownerId??lens.access?.policies?.[room.id]?.standingRulesBy,kind:'standing rule',to:{person:personId(lens)}}:null;
 const grant=owner?{id:'owner',scope:'edit',approvedBy:personId(lens),to:{person:personId(lens)}}:individual??standingGrant??collective;
 const denied=!!grant?.denied,rank=denied?-1:scopeRank(grant?.scope??(visibility==='public'?'enter':null));
 return {visibility,owner,grant,scope:rank<0?null:SCOPES[rank],visible:visibility!=='hidden'||!!grant&&!denied,canLook:rank>=0,canEnter:rank>=1,canSuggest:rank>=2,canEdit:rank>=3,denied,reason:denied?'Individual access is blocked':grant?(grant.to?.group?'Group grant':'Individual grant')+(grant.expires?' · expires '+grant.expires:''):(visibility==='public'?'Public room':'Private space, something is here')};
}
export const roomTitle=(room,lens)=>permission(room,lens).canLook?room.title:'Private space';
