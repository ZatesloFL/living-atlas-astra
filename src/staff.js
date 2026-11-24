import {queryIndex} from './discovery-index.js';
import {discoveryEvidence,validateIndexAnswer} from './discovery-answer.js';
import {AXES,asPair,exceeds} from './scores.js';
import {accessSettings} from './identity.js';
import {doorPolicy} from './admission.js';
import {ai,PROPOSAL_SCHEMA,validateProposal} from './ai.js';
import {ROOMS,EDGES} from './data.js';
import {SEED_HELPERS,LEGACY_SEED_HELPERS,ROLE_ACTIONS,helperRecord,helperScope} from './staff-data.js';
import {permission,personId,scopeRank} from './permissions.js';
import {viewRoom} from './audience.js';
import {selectContent,blockAccess,roomEntry} from './content.js';
import {reachable,boardCards,availableTrail} from './discovery.js';
import {TRAILS} from './community-data.js';
import {migrateHelperIdentities} from './staff-identity.js';
import {normalizeQuestion} from './docent-questions.js';
const lease=days=>new Date(Date.now()+days*86400000).toISOString();
const actionKind={answer:'answer',tour:'tour',note:'note',flag:'score',curate:'curation',connect:'connection'};
export class Staff {
 constructor(store,{aiClient=ai}={}){this.store=store;this.ai=aiClient;store.data.staffState??={helpers:[],proposals:[],initialized:false};this.seedPromise=null;this.ready=this.seed();this.ready.catch(()=>{});}
 get data(){return this.store.data.staffState;}
 helpers(){return this.data.helpers.filter(a=>!a.revokedAt&&(!a.expires||Date.parse(a.expires)>Date.now()));}
 attachments(place){
  return this.data.helpers.filter(a=>!a.revokedAt&&a.places.includes(place)).flatMap(actor=>{
   const grant=this.store.data.grants.findLast(g=>g.room===ROOMS[place]?.id&&g.to?.person===actor.id);
   if(!grant||grant.revokedAt||grant.denied)return [];
   const expires=[actor.expires,grant.expires].filter(Boolean).sort((a,b)=>Date.parse(a)-Date.parse(b))[0]??null;
   return [{actor,grant,expires,expired:!!expires&&!(Date.parse(expires)>Date.now())}];
  });
 }
 seed(){
  if(this.seedPromise)return this.seedPromise;
  if(this.data.initialized&&this.data.standingDocents===1&&this.data.placeIdentities===1)return Promise.resolve();
  this.seedPromise=this.store.transaction(async()=>{
   const owner={profileId:'sample-place-owner',profileName:'Sample Place owner',playAs:'owner',isAgent:false};
   if(!this.data.initialized){
    for(const item of SEED_HELPERS){const scope=helperScope(item),actor=helperRecord(item,scope==='look'?null:lease(7));for(const place of actor.places)await this.store.issue(place,{person:actor.id},scope,actor.expires,owner,'helper');this.data.helpers.push(actor);}
    this.data.initialized=true;this.data.placeIdentities=1;
   }
   if(this.data.standingDocents!==1){
    // Upgrade only known, platform-seeded look grants, active or expired. Issue
    // replacements through the ledger; never resurrect revoked/denied grants,
    // missing attachments, owner overrides or a helper with higher capabilities.
    for(const item of [...LEGACY_SEED_HELPERS,...SEED_HELPERS].filter(a=>helperScope(a)==='look')){
     const actor=this.data.helpers.find(a=>a.id===item.id);
     if(!actor||actor.revokedAt||helperScope(actor)!=='look')continue;
     let standing=false;
     for(const place of actor.places.filter(p=>item.places.includes(p))){
      const grant=this.store.data.grants.findLast(g=>g.room===ROOMS[place]?.id&&g.to?.person===actor.id);
      if(!grant||grant.revokedAt||grant.denied||grant.scope!=='look'||grant.kind!=='helper'||grant.approvedBy!==owner.profileId)continue;
      if(grant.expires)await this.store.issue(place,{person:actor.id},'look',null,owner,'helper');
      standing=true;
     }
     if(standing)actor.expires=null;
    }
    this.data.standingDocents=1;
   }
   await migrateHelperIdentities(this.store);
  });return this.seedPromise;
 }
 seedArrival(place,lens){return this.store.transaction(async()=>{this.store.owner(lens,place);const id='arrival-docent-'+personId(lens);if(this.data.helpers.some(a=>a.id===id))return;const actor=helperRecord({id,name:'Robin',role:'Docent',places:[place],capabilities:['answer','tour']},null);actor.identity={display:'pseudonym',backing:'none'};actor.operator={name:lens.profileName??lens.name,backing:'none',backing_ref:null,simulated:false};await this.store.issue(place,{person:id},'look',null,lens,'helper');this.data.helpers.push(actor);});}
 actor(id){const a=this.helpers().find(a=>a.id===id);if(!a)throw new Error('This helper grant is expired or revoked. Ask the Place owner for a grant.');return a;}
 check(actor,place,action,lens){if(lens.preview)throw new Error('Exit Preview as before a receipted helper crossing.');if(!actor.declaredCapabilities.includes(action))throw new Error('Capability gap: this helper did not declare '+action+'. A new owner-approved grant is needed.');if(!actor.places.includes(place)||!ROOMS[place]||!reachable(place,this.store.lens(lens))||doorPolicy(ROOMS[place],this.store.lens(lens)).blocked)throw new Error('This Place is outside the helper or visitor’s allowed path.');
  const agentLens={...lens,profileId:actor.id,playAs:'visitor',isAgent:true,identity:actor.identity,access:this.store.data},p=permission(ROOMS[place],agentLens);if(doorPolicy(ROOMS[place],agentLens).standing.blocked)throw new Error('This helper does not meet the Place’s declared standing rules.');if(!p.grant||p.grant.to?.person!==actor.id||p.denied||scopeRank(p.scope)<scopeRank(['answer','tour'].includes(action)?'look':'suggest'))throw new Error('Grant missing, expired or revoked. This crossing needs the owner.');return p.grant;
 }
 context(actor,place,action,lens,extra={}){lens=this.store.lens(lens);const grant=this.check(actor,place,action,lens),room=viewRoom({...ROOMS[place],key:place},this.store.lens(lens));const blocks=selectContent(room,lens).blocks.filter(b=>!b.filtered&&!blockAccess(b,room,lens).soft).map(b=>({id:b.id,type:b.type,body:typeof b.body==='string'?b.body:JSON.stringify(b.body),sources:(b.sources??[]).map(s=>({label:s.label,status:s.status??'to verify'}))}));
  // A tour is an authored Path, with a grant held by the local helper at
  // every stop. Splitting identities preserves that coverage, not a global
  // helper's ability to read or act in other Places.
  const hosts=this.helpers().filter(a=>a.id===actor.id||actor.coverageGroup&&a.coverageGroup===actor.coverageGroup).flatMap(a=>a.places.filter(key=>ROOMS[key]).flatMap(key=>{const helperLens={...lens,profileId:a.id,playAs:'visitor',isAgent:true,access:this.store.data},p=permission(ROOMS[key],helperLens);return reachable(key,this.store.lens(lens))&&!doorPolicy(ROOMS[key],helperLens).standing.blocked&&p.grant?.to?.person===a.id&&!p.denied&&p.canLook?[{place:key,helper:a.id,name:a.name,grant:p.grant.id}]:[];}));
  const coverage=hosts.map(h=>h.place),destinations=coverage.filter(id=>id!==place),availableTrails=TRAILS.filter(t=>availableTrail(t,this.store.lens(lens))&&t.stops.every(s=>coverage.includes(s.room))).map(t=>t.id);
  const context={place:{key:place,address:room.address,title:room.title},action,question:normalizeQuestion(extra.question??'overview'),variant:extra.variant===1?1:0,blocks,declared:room.content,measured:room.measured,visibleThings:blocks.map(b=>b.id),lens:{depth:lens.depth,trustFrom:lens.trustFrom,show:{...lens.show},display:lens.identity?.display,backing:lens.identity?.backing,limits:accessSettings(this.store.lens(lens),room).limits,hard:accessSettings(this.store.lens(lens),room).hard,ageBand:lens.age<13?'child':lens.age<18?'teen':'adult'},grant:{holder:actor.id,scope:grant.scope,expires:grant.expires,revocable:true},availableTrails,destinations,trailHosts:hosts,allowedCards:boardCards(this.store.lens(lens)).filter(c=>coverage.includes(c.room)&&(c.type!=='trail'||availableTrails.includes(c.target))).map(c=>c.id)};
  if(extra.discovery){
   if(action!=='answer')throw new Error('Index discovery uses the Docent answer capability.');
   const result=queryIndex(lens,extra.discovery,{from:extra.discoveryFrom??place,standing:this.store.standing}),evidence=discoveryEvidence(result);
   return {...context,discovery:{query:result.query,sort:result.sort},blocks:evidence,visibleThings:evidence.map(b=>b.id)};
  }
  return context;
 }
 validate(q,actor,context,lens){validateProposal(q);if(q.room!==context.place.key||q.kind!==actionKind[context.action])throw new Error('Proposed crossing is outside the declared action.');this.check(actor,q.room,context.action,lens);if(context.discovery)validateIndexAnswer(q,context);if(q.kind==='answer'&&q.citations.some(id=>!context.visibleThings.includes(id)))throw new Error('Answer cites an out-of-scope Thing.');if(q.kind==='note'&&(!context.visibleThings.includes(q.blockId)||q.version!=='documentary'||q.sources.some(s=>s.status!=='to verify')))throw new Error('Note targets an unavailable Thing or claims unsupported verification.');if(q.kind==='score'&&(AXES.some(a=>q.value[a]!==asPair(context.measured[q.dimension])[a]||q.value[a]<asPair(context.declared[q.dimension])[a])))throw new Error('Score proposal may not lower the measured floor.');if(q.kind==='connection'&&!context.destinations.includes(q.target))throw new Error('Proposed path is outside the grant.');if(['tour','curation'].includes(q.kind)&&!context.availableTrails.includes(q.trail))throw new Error('Trail requires Places outside this helper’s grant.');if(q.kind==='curation'&&q.cards.some(id=>!context.allowedCards.includes(id)))throw new Error('Curation contains an out-of-scope Thing.');return true;}
 async request(id,place,action,lens,extra={},options={}){try{return await this.performRequest(id,place,action,lens,extra,options);}catch(error){if(error.name==='AbortError')throw error;if(!lens.preview){const key=ROOMS[place]&&roomEntry(place,this.store.lens(lens),EDGES).state!=='hidden'?place:'square';await this.store.transaction(()=>this.store.record(key,{profileId:id},'helper_crossing_blocked',{agent:id,action,reason:error.message,model:'simulated-v1',result:'blocked'})).catch(()=>{});}throw error;}}
 async performRequest(id,place,action,lens,extra={},{signal,isCurrent=()=>true,getLens=()=>lens}={}){await this.seed();const actor=this.actor(id),context=this.context(actor,place,action,lens,extra),snapshot=JSON.stringify(context),profile=personId(lens);
  const current=()=>{try{return !signal?.aborted&&isCurrent()&&personId(getLens())===profile&&JSON.stringify(this.context(this.actor(id),place,action,getLens(),extra))===snapshot;}catch{return false;}};
  const recheck=()=>{if(!current())throw new DOMException('Request cancelled','AbortError');};
  recheck();if(action==='flag'&&!exceeds(context.measured.sensory,context.declared.sensory))throw new Error('Declared and measured scores match. No new gap to propose.');const result=await this.ai.request({job:['answer','tour'].includes(action)?'guide':'background',context,schema:PROPOSAL_SCHEMA,agentId:id,signal,isCurrent:current});recheck();this.validate(result.proposal,actor,context,getLens());
  return this.store.transaction(async()=>{recheck();this.validate(result.proposal,actor,context,getLens());const record={primitive:'Thing',backing_ref:null,pathKind:'door',placeId:ROOMS[place].id,id:crypto.randomUUID(),agentId:id,agentName:actor.name,model:result.model,provenance:{...result.receiptData},proposal:result.proposal,status:['answer','tour'].includes(action)?'offered':'pending',created:new Date().toISOString(),expires:lease(7),declared:actor.declaredCapabilities.slice(),measured:action,...(extra.seedKey?{seedKey:extra.seedKey}:{})};actor.measuredCapabilities=[...new Set([...actor.measuredCapabilities,action])];this.data.proposals.push(record);await this.store.record(place,{profileId:id},'helper_proposed',{proposal:record.id,kind:result.proposal.kind,path:'door',...result.receiptData,expires:record.expires});return record;});
 }
 async pendingSamples(lens){await this.seed();if(lens.playAs!=='owner'||lens.isAgent||lens.preview)return;
  for(const [key,id,place,action,extra] of [['timeline','maintainer-archive','boycott','note',{}],['gallery','maintainer-archive','boycott','note',{variant:1}],['sensory','steward-market','market','flag',{}],['curation','curator-square','square','curate',{}],['connection','curator-silver','boycott','connect',{}]]){
   if(this.data.proposals.some(p=>p.seedKey===key)||!this.helpers().some(a=>a.id===id))continue;if(!reachable(place,this.store.lens(lens))||doorPolicy(ROOMS[place],this.store.lens(lens)).blocked)continue;try{await this.request(id,place,action,lens,{...extra,seedKey:key});}catch(error){if(!/unavailable Thing|outside.*grant/.test(error.message))throw error;}
  }
 }
 visibleProposals(lens){return this.data.proposals.filter(p=>(p.proposal.kind!=='note'||['documentary','immersive'].includes(viewRoom(ROOMS[p.proposal.room],lens).version?.id))&&roomEntry(p.proposal.room,this.store.lens(lens),EDGES).state!=='hidden'&&permission(ROOMS[p.proposal.room],this.store.lens(lens)).canLook&&Date.parse(p.expires)>Date.now());}
 ownerProposals(lens){if(lens.isAgent||lens.preview)return [];const current=this.store.lens(lens);return this.visibleProposals(current).filter(p=>!['answer','tour'].includes(p.proposal.kind)&&permission(ROOMS[p.proposal.room],current).owner);}
 decide(id,decision,lens){return this.store.transaction(async()=>{const p=this.data.proposals.find(p=>p.id===id);if(!p||!this.visibleProposals(lens).includes(p))throw new Error('This proposal is outside the current Lens or has expired.');this.store.owner(lens,p.proposal.room);if(!['approve','reject','why','contest'].includes(decision))throw new Error('Unknown proposal outcome');if(['approve','reject'].includes(decision)&&p.status!=='pending')throw new Error('This proposal is no longer pending.');
  if(decision==='approve'){const actor=this.actor(p.agentId),action=Object.keys(actionKind).find(a=>actionKind[a]===p.proposal.kind);this.validate(p.proposal,actor,this.context(actor,p.proposal.room,action,lens,{variant:p.proposal.blockId==='archive-image'?1:0}),lens);p.status='approved';p.publishedUntil=lease(90);}if(decision==='reject')p.status='rejected';if(decision==='contest')p.contested=true;
  await this.store.record(p.proposal.room,lens,'helper_'+({approve:'approved',reject:'rejected',why:'explanation_requested',contest:'contest_opened'}[decision]),{proposal:p.id,agent:p.agentId,model:p.model,reason:p.proposal.reason,publishedUntil:p.publishedUntil??null});return p;});}
 acceptOffer(id,lens){return this.store.transaction(async()=>{if(lens.preview)throw new Error('Exit Preview as first.');const p=this.data.proposals.find(p=>p.id===id);if(!p||p.status!=='offered'||Date.parse(p.expires)<=Date.now())throw new Error('Offer expired or already used');const actor=this.actor(p.agentId),action=p.proposal.kind==='tour'?'tour':'answer';this.validate(p.proposal,actor,this.context(actor,p.proposal.room,action,lens),lens);p.status='accepted';await this.store.record(p.proposal.room,lens,'helper_offer_accepted',{proposal:id,agent:p.agentId,model:p.model});return p;});}
 hire(place,role,capabilities,places,lens){return this.store.transaction(async()=>{for(const key of places)this.store.owner(lens,key);if(!ROLE_ACTIONS[role]||!capabilities.length||capabilities.some(c=>!ROLE_ACTIONS[role].includes(c))||!places.includes(place)||places.some(id=>!ROOMS[id]?.blocks||!reachable(id,this.store.lens(lens))))throw new Error('Choose allowed Places and declared capabilities.');const group='hired-'+crypto.randomUUID(),actors=[];for(const key of [...new Set(places)]){const base=ROOMS[key].title.replace(/\bSilver\b/gi,'Studio agent')+' · '+role+' helper',number=this.data.helpers.filter(a=>a.role===role&&a.places.includes(key)).length+1;const actor=helperRecord({id:'helper-'+crypto.randomUUID(),name:base+' '+number,role,places:[key],capabilities,coverageGroup:group},role==='Docent'?null:lease(7));if(ROOMS[key].ownerId)actor.operator={name:lens.profileName??lens.name,backing:'none',backing_ref:null,simulated:false};await this.store.issue(key,{person:actor.id},helperScope(actor),actor.expires,lens,'helper');this.data.helpers.push(actor);actors.push(actor);}return actors.find(a=>a.places.includes(place));});}
 async revoke(id,lens){const actor=this.data.helpers.find(a=>a.id===id&&!a.revokedAt);if(!actor)throw new Error('Helper is missing or already revoked.');for(const key of actor.places)this.store.owner(lens,key);for(const grant of this.store.standing.stewardship.grants().filter(g=>g.designate.id===id&&!g.revoked))await this.store.standing.stewardship.revoke(grant.id,lens);for(const g of this.store.data.grants.filter(g=>g.to?.person===id&&!g.revokedAt))await this.store.revoke(g.id,lens);actor.revokedAt=new Date().toISOString();this.store.persist();}
}
