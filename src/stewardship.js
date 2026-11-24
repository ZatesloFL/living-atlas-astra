import {ROOMS} from './data.js';
import {personId,permission} from './permissions.js';
import {identityTier,targetRef} from './standing-records.js';
import {stewardGrants,standingDoorPolicy} from './standing-policy.js';

export const STEWARD_POWERS=['measure','contest','admit','exclude'];
export class Stewardship {
 constructor(access,standing){this.access=access;this.standing=standing;}
 grants(place){return stewardGrants(this.standing.data,place?this.access.room(place).id:null);}
 authorize(id,lens,power,ref){
  if(lens.preview||identityTier(lens)==='anonymous'||lens.identity?.display==='anonymous')throw new Error('A verified actor with named or pseudonymous presentation must exercise this grant.');
  const grant=this.grants().find(g=>g.id===id&&g.active);if(!grant||!grant.powers.includes(power)||ref&&grant.target.placeId!==ref.placeId)throw new Error('Steward grant is expired, revoked, out of scope or missing this power.');
  const actor=personId(lens);if(grant.designate.kind==='human'?actor!==grant.designate.id:actor!==grant.designate.operator.id&&!(lens.isAgent&&actor===grant.designate.id&&lens.operatorId===grant.designate.operator.id))throw new Error('This grant belongs to a different designate or operator.');
  const room=this.access.room(grant.target.placeId),acting=this.access.lens(this.actingLens(grant,lens)),rights=permission(room,acting);
  if(rights.denied||!rights.canLook||standingDoorPolicy(room,acting).blocked)throw new Error('The designate does not meet this Place’s current access or standing rules.');
  return grant;
 }
 actingLens(grant,lens){return grant.designate.kind==='human'?lens:{...lens,profileId:grant.designate.id,profileName:grant.designate.name,isAgent:true,playAs:'visitor',operatorId:grant.designate.operator.id,actingGrant:grant.id,identity:{display:'pseudonym',backing:'verified'}};}
 appoint(place,config,lens){return this.access.transaction(async()=>{
  const owner=this.standing.actor(lens);if(owner.isAgent)throw new Error('The owner appoints a Steward.');this.access.owner(lens,place);const room=this.access.room(place),powers=[...new Set(config.powers??[])];
  if(!powers.length||powers.some(p=>!STEWARD_POWERS.includes(p)))throw new Error('Choose the scoped Steward powers.');
  const expires=config.expires??null;if(expires&&(!Number.isFinite(Date.parse(expires))||Date.parse(expires)<=Date.now()))throw new Error('Choose a future lease or a standing grant.');
  let designate,helper;
  if(config.kind==='human'){
   const person=config.person;if(!person||person.isAgent||identityTier(person)==='anonymous')throw new Error('Choose a verified, named or verified, unnamed person.');
   designate={id:personId(person),name:person.profileName??person.name,kind:'human',tier:identityTier(person),operator:null};
  }else if(config.kind==='operated-agent'){
   helper=this.access.data.staffState.helpers.find(a=>a.id===config.agentId&&a.operator?.id===owner.id&&!a.revokedAt&&a.places.includes(place));
   if(!helper||helper.operator.backing!=='verified')throw new Error('Choose your own agent already attached to this Place.');
   designate={id:helper.id,name:helper.name,kind:'operated-agent',tier:owner.tier,operator:{id:owner.id,name:owner.name,tier:owner.tier}};
  }else if(config.kind==='template-agent'){
   const name=String(config.name??'').trim();if(!name||name.length>80||/\bsilver\b/i.test(name))throw new Error('Give this Place’s Steward its own name, up to 80 characters.');
   designate={id:'steward-'+crypto.randomUUID(),name,kind:'template-agent',tier:owner.tier,operator:{id:owner.id,name:owner.name,tier:owner.tier}};
   helper={id:designate.id,name,role:'Steward',places:[place],declaredCapabilities:powers.slice(),measuredCapabilities:[],identity:{display:'pseudonym',backing:'verified'},isAgent:true,operator:{id:owner.id,name:owner.name,backing:'verified',simulated:true,backing_ref:null},expires,revokedAt:null};
  }else throw new Error('Choose a human, operated agent or template agent.');
  if(this.grants(place).some(g=>g.active&&g.designate.id===designate.id))throw new Error('Revoke the existing Steward grant before replacing it.');
  const accessView={...lens,profileId:designate.id,isAgent:designate.kind!=='human',playAs:'visitor'},rights=permission(room,this.access.lens(accessView));if(rights.denied)throw new Error('Remove the owner’s individual block before appointing this designate.');
  const receipt=await this.standing.append(owner,'steward_granted',{target:targetRef(room),owner:owner.id,ownerName:owner.name,designate,powers,expires,published:this.standing.published(room),simulation:true});
  if(config.kind==='template-agent'||!rights.canLook||config.kind==='operated-agent'&&!rights.grant)await this.access.issue(place,{person:designate.id},'look',expires,lens,'steward');
  if(config.kind==='template-agent')this.access.data.staffState.helpers.push(helper);
  await this.standing.append(owner,'commitment_observed',{holder:owner.id,target:targetRef(room),grant:receipt.hash,outcome:'unmeasured',detail:'Place Steward appointed; fulfillment not yet observed',published:this.standing.published(room)});
  return receipt;
 });}
 revoke(id,lens){return this.access.transaction(async()=>{
  this.standing.actor(lens);const grant=this.grants().find(g=>g.id===id);if(!grant||grant.revoked)throw new Error('Steward grant is already revoked or unavailable.');this.access.owner(lens,grant.target.placeId);
  const receipt=await this.standing.append(personId(lens),'steward_revoked',{target:grant.target,grant:id,published:grant.published});
  for(const g of this.access.data.grants.filter(g=>g.room===grant.target.placeId&&g.to.person===grant.designate.id&&g.kind==='steward'&&!g.revokedAt)){g.revokedAt=new Date().toISOString();await this.access.record(grant.target.placeId,lens,'access_revoked',{grant:g.id});}
  return receipt;
 });}
 measurer(actor,lens,target,kind,grantId=null,power='measure'){
  if(kind==='audience'){if(actor.isAgent)throw new Error('An audience reading belongs to a verified person, not an agent.');return {...actor,class:kind,relationship:'audience',operator:null,grant:null,delegation:[]};}
  const candidate=grantId??lens.actingGrant??this.grants(target.key).find(g=>g.active&&g.designate.id===actor.id&&g.powers.includes(power))?.id;
  const grant=candidate?this.authorize(candidate,lens,power,target.ref):null;
  if(actor.isAgent&&!grant)throw new Error('This agent needs a current scoped Steward grant.');
  return {...actor,class:'steward',relationship:grant?'designate':permission(target.room,this.access.lens(lens)).owner?'owner':'independent',operator:grant?.designate.operator??null,grant:grant?.id??null,delegation:grant?[{owner:grant.owner,grant:grant.id,designate:grant.designate.id,placeId:grant.target.placeId,powers:grant.powers,expires:grant.expires}]:[]};
 }
 async honored(measurer,target){if(measurer.grant)await this.standing.append(measurer.id,'commitment_observed',{holder:measurer.delegation[0].owner,target:target.ref,grant:measurer.grant,outcome:'held',detail:'Scoped Steward appointment honored',published:target.published});}
 measureAs(id,ref,values,lens,options={}){const target=this.standing.resolve(ref,lens),grant=this.authorize(id,lens,'measure',target.ref);return this.standing.measure(ref,values,this.actingLens(grant,lens),{...options,kind:'steward',grantId:id});}
 contestAs(id,measurement,reason,lens){const grant=this.authorize(id,lens,'contest');return this.standing.contest(measurement,reason,this.actingLens(grant,lens),{grantId:id});}
 admit(id,visitor,lens,{expires=null}={}){return this.access.transaction(async()=>{
  const grant=this.authorize(id,lens,'admit'),room=this.access.room(grant.target.placeId);if(typeof visitor!=='string'||!visitor.trim())throw new Error('Choose a visitor.');
  if(expires&&(!Number.isFinite(Date.parse(expires))||Date.parse(expires)<=Date.now()))throw new Error('Admission expiry must be in the future.');
  if(grant.expires&&(!expires||Date.parse(expires)>Date.parse(grant.expires)))expires=grant.expires;
  const prior=permission(room,this.access.lens({...lens,profileId:visitor,playAs:'visitor',isAgent:false}));if(prior.denied)throw new Error('A Steward cannot override the owner’s individual block.');if(prior.grant?.scope==='edit')throw new Error('This visitor already has owner-granted access.');
  const accessGrant={id:crypto.randomUUID(),room:room.id,to:{person:visitor},scope:'enter',expires,approvedBy:grant.owner,createdAt:new Date().toISOString(),revokedAt:null,kind:'Steward admission',denied:false,delegation:[grant.id]};
  this.access.data.grants.push(accessGrant);await this.access.record(room.id,{profileId:grant.designate.id},'access_granted',accessGrant);
  await this.standing.append(grant.designate.id,'commitment_observed',{holder:grant.owner,target:targetRef(room),grant:grant.id,outcome:'held',detail:'Scoped Steward admission honored',published:this.standing.published(room)});return accessGrant;
 });}
 display(ref,excluded,reason,lens,{grantId=null}={}){return this.access.transaction(async()=>{
  this.standing.actor(lens);const target=this.standing.resolve(ref,lens,{metadataOnly:true});if(!target.ref.thingId)throw new Error('Choose a Thing within this Place.');
  const owner=permission(target.room,this.access.lens(lens)).owner,grant=grantId?this.authorize(grantId,lens,'exclude',target.ref):null;
  if(!owner&&!grant)throw new Error('The owner or a scoped Place Steward must choose this display.');
  const text=String(reason??'').trim();if(!text||text.length>1000)throw new Error('Record a reason, up to 1,000 characters.');
  const by=grant?grant.designate.id:personId(lens),name=grant?grant.designate.name:lens.profileName??lens.name;
  return this.standing.append(by,'steward_display_changed',{target:target.ref,excluded:!!excluded,reason:text,by,name,grant:grant?.id??null,published:target.published});
 });}
}
