import {ROOMS} from './data.js';
import {permission,personId,visibilityOf} from './permissions.js';
import {crossing} from './rules.js';
import {blockAccess} from './content.js';
import {viewRoom} from './audience.js';
import {sourcedRoom} from './source-catalog.js';
import {sourceVisible} from './source-media.js';
import {appendEntry,entryHash} from './ledger.js';
import {events,targetId,targetRef,identityTier,validateScores,declarationSnapshot,currentMeasurements,readingsFor,pendingMeasurements,gapBetween,underDeclared} from './standing-records.js';
import {deriveStanding,recordBrowsing,readingSummary} from './standing-facets.js';
import {TRAILS} from './community-data.js';
import {Stewardship} from './stewardship.js';
import {stewardGrants,validateStandingRules} from './standing-policy.js';

const words=(value,required=false)=>{const text=String(value??'').trim();if(text.length>1000||required&&!text)throw new Error('Add a method or reason, up to 1,000 characters.');return text;};
export class StandingStore {
 constructor(access){this.access=access;this.stewardship=new Stewardship(access,this);}
 get data(){return this.access.data.standingState;}
 doorRules(place,rules,lens){return this.access.transaction(async()=>{const actor=this.actor(lens);this.access.owner(lens,place);const room=this.access.room(place),checked=validateStandingRules(rules),receipt=await this.append(actor,'standing_rules_declared',{target:targetRef(room),rules:checked,published:this.published(room)});this.access.data.policies[room.id]={...this.access.data.policies[room.id],standingRules:checked,standingRulesBy:actor.id,standingRulesReceipt:receipt.hash};return receipt;});}
 knockRecord(lens){if(lens.identity?.display==='anonymous')return null;const id=personId(lens),helper=this.access.data.staffState.helpers.find(a=>a.id===id),operatorId=lens.operatorId??helper?.operator?.id??null;return {actorId:id,identityTier:identityTier(lens),facets:readingSummary(deriveStanding(this.data,{actor:id})),operatorId,operator:operatorId?readingSummary(deriveStanding(this.data,{actor:operatorId})):null};}
 published(room){const seen=new Set();while(room){if(seen.has(room.id)||visibilityOf(room,{access:this.access.data})!=='public')return false;seen.add(room.id);const parent=room.parentPlaceId;room=parent?Object.values(ROOMS).find(r=>r.id===parent):null;if(parent&&!room)return false;}return true;}
 references(ref,lens){
  const target=this.resolve(ref,lens),declaration=declarationSnapshot(this.data,target.ref,target.node,target.view,{publishedOnly:target.published}),subject={placeId:target.ref.placeId,...(target.ref.thingId?{thingId:target.ref.thingId}:{})};
  return {declarationRef:declaration.id?{versionId:declaration.versionId,receiptRef:'local-standing:'+declaration.id}:null,measurementRecordsRef:{kind:'atlas-measurements-v1',subject},declarationRecordReadingRef:{kind:'atlas-declaration-reading-v1',subject}};
 }
 resolveMeasurements(reference,lens){
  if(reference?.kind!=='atlas-measurements-v1')throw new Error('Unknown measurement collection.');
  const target=this.resolve(reference.subject,lens,{metadataOnly:true});
  return structuredClone(readingsFor(this.data,target.ref,{publishedOnly:target.published}));
 }
 resolveReading(reference,lens){
  if(reference?.kind!=='atlas-declaration-reading-v1')throw new Error('Unknown declaration record.');
  const target=this.resolve(reference.subject,lens,{metadataOnly:true});return deriveStanding(this.data,{target:target.ref});
 }
 browsing(browsable,lens){return this.access.transaction(async()=>{const actor=this.actor(lens);if(actor.isAgent)throw new Error('An operator manages the agent’s public offer.');return this.append(actor,'record_browsing_changed',{browsable:!!browsable,published:false});});}
 actorRecord(id,lens,{place=null,knockId=null,helperId=null}={}){
  const own=id===personId(lens),browsable=recordBrowsing(this.data,id),request=this.access.data.requests.find(q=>q.id===knockId&&q.standing&&(q.by===id||q.standing.operatorId===id));
  const knock=!!request&&permission(this.access.room(request.room),this.access.lens(lens)).owner;
  const helper=this.access.data.staffState.helpers.find(a=>a.id===helperId),offer=!!helper&&!!place&&helper.places.includes(place)&&!helper.revokedAt&&permission(this.access.room(place),this.access.lens(lens)).canLook&&(id===helper.id||id===helper.operator?.id);
  const record=deriveStanding(this.data,{actor:id});for(const [key,facet] of Object.entries(record.facets)){
   const publicFacet=key==='measurement'||key==='helper'&&offer;
   if(!own&&!browsable&&!publicFacet)facet.history=[];
   if(!own&&!browsable&&!publicFacet&&!knock&&!offer)facet.reading=null;
  }
  return {...record,browsable,own,moment:knock||offer};
 }
 async helperOutcome(helper,place,{outcome='held',detail,source='local receipt',proxyReceipt=null}={}){
  if(!helper||helper.revokedAt||helper.expires&&Date.parse(helper.expires)<=Date.now()||helper.operator?.backing!=='verified')return;
  const room=this.access.room(place);if(!this.published(room))return;
  if(proxyReceipt&&events(this.data).some(e=>e.proxyReceipt===proxyReceipt))return;
  return this.append(helper.id,'helper_result',{helper:helper.id,operator:helper.operator.id??null,outcome,detail,source,proxyReceipt,published:true,simulation:source!=='real proxy receipt'});
 }
 async observeReceipt(room,lens,receipt){
  const d=receipt.diff,helper=this.access.data.staffState.helpers.find(a=>a.id===(d.agent??receipt.actor));
  if(receipt.action==='helper_proposed'&&d.provider==='proxy'&&/^[a-f0-9-]{36}$/.test(d.receiptId??''))await this.helperOutcome(helper,room.id,{detail:'AI proxy validation',source:'real proxy receipt',proxyReceipt:d.receiptId});
  if(receipt.action==='helper_approved')await this.helperOutcome(helper,room.id,{detail:'Owner accepted a proposal'});
  if(receipt.action==='helper_offer_accepted'){
   const offer=this.access.data.staffState.proposals.find(p=>p.id===d.proposal);
   if(offer?.proposal.kind==='tour')(this.access.data.staffState.tours??=[]).push({proposal:offer.id,helper:offer.agentId,visitor:personId(lens),trail:offer.proposal.trail,place:offer.proposal.room,completed:false});
  }
  if(receipt.action==='access_used'){
   const declared=declarationSnapshot(this.data,targetRef(room),room,room),holder=declared.owner;
   if(holder&&declared.id&&this.published(room)&&(this.access.data.policies[room.id]?.admission||room.admission||d.grant!=='public')){const observed=await this.append(holder,'commitment_observed',{holder,target:targetRef(room),outcome:'held',detail:'Declared threshold or grant honored',published:true});await appendEntry(this.access.data.ledgers[room.id],holder,'commitment_proved',{crossingReceipt:receipt.hash,standingReceipt:observed.hash});}
  }
 }
 completeTour(trail,lens){return this.access.transaction(async()=>{
  const authored=TRAILS.find(t=>t.id===trail.id),progress=lens.discovery?.trail;if(!authored||!progress||progress.id!==trail.id||progress.active||!authored.stops.every(s=>progress.done.includes(s.room)))return;
  for(const pending of this.access.data.staffState.tours??[])if(!pending.completed&&pending.visitor===personId(lens)&&pending.trail===trail.id){const helper=this.access.data.staffState.helpers.find(a=>a.id===pending.helper);await this.helperOutcome(helper,pending.place,{detail:'Helper tour completed'});pending.completed=true;}
 });}
 resolve(ref,lens,{metadataOnly=false}={}){
  if(typeof ref==='string')ref=targetRef(this.access.room(ref));
  const key=Object.keys(ROOMS).find(k=>ROOMS[k].id===ref.placeId),room=ROOMS[key];if(!room)throw new Error('Place is unavailable.');
  const current=this.access.lens(lens),gate=crossing({to:key,type:'door'},current);
  const publicMetadata=metadataOnly&&this.published(room);
  if(!publicMetadata&&(gate.state==='hidden'||gate.admission?.blocked||!permission(room,current).canLook))throw new Error('This record is outside your current crossing.');
  const view=sourcedRoom(viewRoom(room,current),current);let node=room;
  if(ref.thingId){if(ref.audienceVersion!==undefined&&(view.version?.id??null)!==(ref.audienceVersion??null))throw new Error('Choose a Thing in the current audience version.');node=view.blocks?.find(b=>b.id===ref.thingId);if(!node||!publicMetadata&&(blockAccess(node,view,current).hidden||blockAccess(node,view,current).withheld))throw new Error('This Thing is outside your Lens.');}
  if(ref.thingId&&!sourceVisible(node,view,current))throw new Error('This source Thing is outside your access.');
  let published=true,at=room,seen=new Set();while(at){if(seen.has(at.id))throw new Error('Invalid containing Place.');seen.add(at.id);if(visibilityOf(at,current)!=='public')published=false;const parent=at.parentPlaceId;at=parent?Object.values(ROOMS).find(r=>r.id===parent):null;if(parent&&!at)throw new Error('Missing containing Place.');}
  if(node.source?.visibility==='private')published=false;
  return {key,room,node,view,ref:targetRef(ref.thingId?view:room,ref.thingId?node:null),published};
 }
 actor(lens){
  if(lens.preview)throw new Error('Preview does not file a receipt.');
  if(lens.identity?.display==='anonymous')throw new Error('Anonymous presentation carries no standing. Choose named or pseudonymous presentation to declare or measure.');
  if(lens.isAgent){const grant=stewardGrants(this.data).find(g=>g.active&&g.designate.id===personId(lens)&&g.designate.operator?.id===lens.operatorId&&(!lens.actingGrant||g.id===lens.actingGrant));if(!grant)throw new Error('An agent needs a verified operator and a scoped Steward grant.');return {id:grant.designate.id,name:grant.designate.name,tier:grant.designate.operator.tier,isAgent:true,operatorId:grant.designate.operator.id};}
  const tier=identityTier(lens);if(tier==='anonymous')throw new Error('Unverified accounts cannot declare or measure. Use a verified account with named or pseudonymous presentation. Verification here is a labeled local simulation.');
  return {id:personId(lens),name:lens.profileName??lens.name??'Visitor',tier,isAgent:false};
 }
 async append(actor,kind,diff){return appendEntry(this.data.receipts,actor.id??actor,kind,diff);}
 declare(ref,value,lens,{versionId=null}={}){return this.access.transaction(async()=>{
  const actor=this.actor(lens),target=this.resolve(ref,lens);this.access.owner(lens,target.key);const scores=validateScores(value);
  if(versionId!==null&&(typeof versionId!=='string'||!versionId.trim()||versionId.length>200))throw new Error('An authored record version is required.');
  if(target.node.recordVersionId&&versionId&&target.node.recordVersionId!==versionId)throw new Error('The authored record version changed.');
  const materialHash=await entryHash({target:target.ref,type:target.node.type??'Place',body:target.node.body??target.room.substance??null,blocks:target.ref.thingId?null:(target.room.blocks??[]).map(b=>({id:b.id,body:b.body??null,content:b.content??null})),content:scores});
  return this.append(actor,'declared',{target:target.ref,scores,versionId:versionId??target.node.recordVersionId??'local/'+crypto.randomUUID(),materialHash,owner:actor.id,creator:target.node.creatorId??target.room.creatorId??actor.id,published:target.published,identity:actor.tier,method:'Owner declaration',simulation:true});
 });}
 crossingReceipt(target,lens){
  const ledger=this.access.data.ledgers[target.room.id]??[],actor=personId(lens);
  return ledger.findLast(e=>e.actor===actor&&(target.ref.thingId?e.action==='thing_crossed'&&targetId(e.diff.target)===targetId(target.ref):e.action==='access_used'&&(e.diff.scope==='enter'||e.diff.visit===true)));
 }
 crossThing(ref,lens){return this.access.transaction(async()=>{
  const target=this.resolve(ref,lens);if(!target.ref.thingId||lens.preview)return;
  if(!this.crossingReceipt({...target,ref:targetRef(target.room)},lens))throw new Error('Enter this Place before filing a Thing reading.');
  const receipt=await this.access.record(target.key,lens,'thing_crossed',{target:target.ref});return receipt.hash;
 });}
 measure(ref,value,lens,{kind='steward',method='',text='',queueId=null,grantId=null}={}){return this.access.transaction(async()=>{
  const actor=this.actor(lens),target=this.resolve(ref,lens),scores=validateScores(value);if(!['steward','audience'].includes(kind))throw new Error('Choose Steward or audience.');
  const proof=this.crossingReceipt(target,lens);if(kind==='audience'&&!proof)throw new Error('An audience reading needs your crossing receipt for this Thing or Place.');
  const queue=queueId&&pendingMeasurements(this.data,target.ref,{publishedOnly:target.published}).find(q=>q.id===queueId);if(queueId&&!queue)throw new Error('That re-measurement is no longer pending.');if(queue&&kind!=='steward')throw new Error('A Steward must perform the re-measurement.');
  const original=queue?.measurement&&events(this.data).find(e=>e.id===queue.measurement);if(original&&(original.measurer.id===actor.id||original.measurer.operator?.id===actor.id||actor.operatorId&&(actor.operatorId===original.measurer.id||actor.operatorId===original.measurer.operator?.id)))throw new Error('A different Steward and operator must re-measure a contested reading.');
  const declaration=declarationSnapshot(this.data,target.ref,target.node,target.view,{publishedOnly:target.published}),previous=currentMeasurements(this.data,target.ref,{publishedOnly:target.published}).filter(e=>e.published===target.published&&e.measurer.id===actor.id&&e.measurer.class===kind);
  const supersedes=[...previous.map(e=>e.id),...(original?.measurer.class==='steward'?[original.id]:[])];
  if(original&&original.declaration.id!==declaration.id)throw new Error('The declaration changed. Re-measure its original authored version before resolving this contest.');
  const measurer=this.stewardship.measurer(actor,lens,target,kind,grantId);
  const receipt=await this.append(actor,'measured',{target:target.ref,measurer,scores,declaration,gap:gapBetween(scores,declaration.scores),method:words(method,kind==='steward'),text:words(text),supersedes,edited:kind==='audience'&&previous.length>0,resolves:queue?.id??null,reviewOf:original?.id??null,crossingConfirmed:kind==='audience'&&!!proof,published:target.published,simulation:true});
  if(kind==='audience'){
   await this.access.record(target.key,lens,'audience_crossing_proved',{measurement:receipt.hash,crossingReceipt:proof.hash});
   const aggregate=readingsFor(this.data,target.ref,{publishedOnly:target.published}).audienceReading;
   if(underDeclared(gapBetween(aggregate,declaration.scores))&&!pendingMeasurements(this.data,target.ref,{publishedOnly:target.published}).some(q=>q.reason==='audience divergence'))await this.append(actor,'remeasurement_requested',{target:target.ref,reason:'audience divergence',threshold:1,measurement:null,trigger:receipt.hash,published:target.published});
  }
  await this.stewardship.honored(measurer,target);return receipt;
 });}
 contest(measurementId,reason,lens,{grantId=null}={}){return this.access.transaction(async()=>{
  const actor=this.actor(lens),measurement=events(this.data).find(e=>e.kind==='measured'&&e.id===measurementId);if(!measurement)throw new Error('Measurement not found.');
  const target=this.resolve(measurement.target,lens);if(!currentMeasurements(this.data,target.ref,{publishedOnly:target.published}).some(e=>e.id===measurementId))throw new Error('This reading has already been superseded.');
  if(pendingMeasurements(this.data,target.ref,{publishedOnly:target.published}).some(q=>q.measurement===measurementId))throw new Error('A re-measurement is already pending.');
  const measurer=this.stewardship.measurer(actor,lens,target,'steward',grantId,'contest');
  return this.append(actor,'remeasurement_requested',{target:target.ref,reason:'contest',words:words(reason,true),measurement:measurementId,measurer,published:target.published});
 });}
}
