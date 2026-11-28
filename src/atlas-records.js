import {appendEntry,verifyChain} from './ledger.js';
import {personId} from './permissions.js';
import {ATLAS_AREAS,ATLAS_SCOPES,validateAtlasIntent} from './atlas-intents.js';
import {lensBasis,validateLensChanges} from './lens-proposals.js';
import {ROOMS} from './data.js';
import {extensionAreas} from './atlas-builder-contract.js';
import {atlasActionBoundary} from './atlas-action-policy.js';

export const ATLAS_RECORDS_KEY='living-atlas.atlas-records.v1';
export const STARTER_GRANT_LINE='Atlas can help with your places and settings from the start — narrow or turn off any of it anytime, in words.';
const clone=value=>structuredClone(value);
export class AtlasRecords {
 constructor(storage=()=>globalThis.localStorage){this.storage=storage;this.queue=Promise.resolve();this.applying=new Set();}
 holder(lens){if(!lens||lens.preview||lens.isAgent||!personId(lens)||lens.age<13)throw new Error('Use your own active local profile, outside Preview as.');return personId(lens);}
 read(){const raw=this.storage()?.getItem(ATLAS_RECORDS_KEY);const data=raw?JSON.parse(raw):{version:1,receipts:[]};if(data.version!==1||!Array.isArray(data.receipts))throw new Error('Atlas records need recovery.');return data;}
 state(lens,now=Date.now(),data=this.read()){
  const holder=personId(lens),receipts=data.receipts.filter(r=>r.diff.holder===holder),grants=[],envelopes={},proposals=new Map();let attending=false;
  for(const r of receipts){const d=r.diff;
   if(r.action==='atlas_starter_granted'){
    grants.push({kind:'grant',id:d.id,areas:[...d.areas],scope:'edit',durationMs:null,to:{person:'atlas'},issuedBy:'system',origin:'starter',createdAt:r.time,expires:null,receipt:r.hash});
    for(const area of d.areas)if(!envelopes[area])envelopes[area]={kind:'envelope',areas:[area],posture:'Conversational',specification:'Starter at arrival',origin:'starter',unasked:'',alwaysAsk:'Actions that reach outside your own places and settings.',watch:[],receipt:r.hash,time:r.time};
   }
   if(r.action==='atlas_attendance_changed')attending=d.enabled===true;
   if(r.action==='atlas_proposed'){
    const old=proposals.get(d.supersedes);if(old?.status==='proposal')old.status='superseded';
    proposals.set(d.id,{...d,receipt:r.hash,status:'proposal'});
   }
   if(r.action==='atlas_declined'||r.action==='atlas_confirmed')if(proposals.has(d.id))proposals.get(d.id).status=r.action==='atlas_declined'?'declined':'confirmed';
   if(r.action==='atlas_failed'&&proposals.get(d.id)?.value.kind==='extension')proposals.get(d.id).status='failed';
   if(r.action==='atlas_applied'){
    const p=proposals.get(d.id);if(p){p.status='applied';p.outcome=r.hash;}
    if(p?.value.kind==='grant')grants.push({...p.value,id:p.id,to:{person:'atlas'},approvedBy:holder,createdAt:r.time,expires:p.value.durationMs===null?null:new Date(Date.parse(r.time)+p.value.durationMs).toISOString(),receipt:r.hash});
    if(p?.value.kind==='envelope')for(const area of p.value.areas)envelopes[area]={...p.value,receipt:r.hash,time:r.time};
   }
   if(r.action==='atlas_grant_revoked'){const grant=grants.find(g=>g.id===d.grant);if(grant)grant.revokedAt=r.time;}
   if(r.action==='atlas_grant_narrowed'){const grant=grants.find(g=>g.id===d.grant);if(grant)Object.assign(grant,d.changes);}
  }
  for(const g of grants)g.active=!g.revokedAt&&(!g.expires||Date.parse(g.expires)>now);
  return {holder,receipts,grants,envelopes,proposals:[...proposals.values()],attending:attending&&grants.some(g=>g.active&&g.areas.includes('travel'))};
 }
 ensureStarter(lens){return this.write(lens,async(data,record,holder)=>{
  const state=this.state(lens,Date.now(),data),chosen=state.receipts.some(r=>r.action==='atlas_starter_granted'||r.action.startsWith('atlas_grant_')||r.action==='atlas_proposed'&&['grant','revoke','narrow'].includes(r.diff.value?.kind));
  if(chosen)return {created:false};
  const id=crypto.randomUUID(),receipt=await record('system','atlas_starter_granted',{id,areas:[...ATLAS_AREAS],scope:'edit',durationMs:null,origin:'starter',givenAt:'arrival',posture:'Conversational',attending:false});
  return {created:true,id,receipt:receipt.hash,holder};
 });}
 require(lens,area,scope='look',data=this.read()){
  this.holder(lens);if(!ATLAS_AREAS.includes(area)||!ATLAS_SCOPES.includes(scope))throw new Error('Choose a supported Atlas area and scope.');
  const grant=this.state(lens,Date.now(),data).grants.findLast(g=>g.active&&g.areas.includes(area)&&ATLAS_SCOPES.indexOf(g.scope)>=ATLAS_SCOPES.indexOf(scope));
  if(!grant)throw new Error(`Atlas needs your active ${scope} grant for ${area}. Ask for that grant first; nothing has changed.`);return grant;
 }
 async requireInitiative(lens,area,scope,{requested=false}={}){
  const data=this.read();
  if(!(await verifyChain(data.receipts)).valid)throw new Error('Atlas Receipt verification failed.');
  if(requested!==true)throw new Error('Ask Atlas directly for this action.');
  return this.require(lens,area,scope,data);
 }
 extensionBasis(lens,value,scope,data,{requested=false,prior=null}={}){
  const areas=extensionAreas(value),holder=this.holder(lens);
  const room=Object.values(ROOMS).find(room=>room.id===value.placeId);
  if(!(lens.profileId??lens.id)||room?.ownerId!==holder)throw new Error('Ask from a Place you own.');
  if(requested!==true)throw new Error('Ask Atlas directly for this action.');
  const state=this.state(lens,Date.now(),data),grants={},envelopes={};
  for(const area of areas){
   const grant=prior?state.grants.find(g=>g.id===prior.grants[area]&&g.active&&g.areas.includes(area)&&
     ATLAS_SCOPES.indexOf(g.scope)>=ATLAS_SCOPES.indexOf(scope)):this.require(lens,area,scope,data);
   if(!grant)throw new Error(`Your ${area} grant changed or lacks ${scope} scope. Ask again with an active ${scope} grant.`);
   grants[area]=grant.id;
   envelopes[area]=state.envelopes[area]?.receipt??null;
   if(prior&&envelopes[area]!==prior.envelopes[area])throw new Error(`Your initiative for ${area} changed. Ask again.`);
  }
  return {requested:true,grants,envelopes};
 }
 proposeExtension(lens,value,words,{requested=false,supersedes=null}={}){
  return this.propose(lens,{...value,kind:'extension'},words,{requested,supersedes});
 }
 write(lens,operation){const holder=this.holder(lens);const job=this.queue.then(()=>{
  const run=async()=>{const data=this.read();if(!(await verifyChain(data.receipts)).valid)throw new Error('Atlas receipt verification failed. Preserved records cannot be changed.');
   const record=async(actor,action,diff)=>{const r=await appendEntry(data.receipts,actor,action,{holder,...diff});this.storage().setItem(ATLAS_RECORDS_KEY,JSON.stringify(data));return r;};
   return operation(data,record,holder);
  };return globalThis.navigator?.locks?navigator.locks.request(ATLAS_RECORDS_KEY,run):run();
 });this.queue=job.catch(()=>{});return job;}
 propose(lens,value,words,{tripBasis=null,requested=false,supersedes=null}={}){validateAtlasIntent(value);value=clone(value);if(['clarify','destination','index','place-question'].includes(value.kind))throw new Error('A lookup or clarification is not a confirmed act.');return this.write(lens,async(data,record)=>{
  if(value.kind==='lens'){this.require(lens,'lens','suggest',data);validateLensChanges(value.changes,lens);}
  if(value.kind==='trip'){this.require(lens,'travel','suggest',data);if(typeof tripBasis!=='string')throw new Error('A current route is required.');}
  let basis=value.kind==='lens'?lensBasis(lens):value.kind==='trip'?tripBasis:null;
  if(value.kind==='extension'){
   basis=this.extensionBasis(lens,value,'suggest',data,{requested});
   if(supersedes){
    const prior=this.state(lens,Date.now(),data).proposals.find(p=>p.id===supersedes&&p.status==='proposal');
    if(!prior||['kind','area','action','placeId'].some(key=>prior.value[key]!==value[key]))throw new Error('That Atlas proposal cannot be revised.');
   }
  }else if(supersedes)throw new Error('This proposal does not support revisions.');
  const id=crypto.randomUUID(),r=await record('atlas','atlas_proposed',{id,value,words:String(words).slice(0,1600),basis,...(supersedes?{supersedes}:{})});
  return {id,value:clone(value),basis,receipt:r.hash,status:'proposal'};
 });}
 confirmRequested(lens,id,apply){return this.confirm(lens,id,apply,{fromRequest:true});}
 confirm(lens,id,apply,{fromRequest=false}={}){return this.write(lens,async(data,record,holder)=>{
  const p=this.state(lens,Date.now(),data).proposals.find(p=>p.id===id&&p.status==='proposal');if(!p)throw new Error('This proposal is no longer open for this profile.');validateAtlasIntent(p.value);
  if(fromRequest&&(!p.words.trim()||atlasActionBoundary(p.value,lens).ask))throw new Error('This action reaches an edge. Ask the holder before applying it.');
  if(p.value.kind==='extension'){
   this.extensionBasis(lens,p.value,'edit',data,{requested:p.basis?.requested,prior:p.basis});
   if(typeof apply!=='function')throw new Error('No actuator can apply this Atlas proposal here.');
  }else if(!['grant','envelope','revoke','narrow'].includes(p.value.kind))this.require(lens,p.value.kind==='lens'?'lens':'travel','edit',data);
  if(p.value.kind==='lens'){if(p.basis!==lensBasis(lens))throw new Error('Your Lens or assurance changed. Decline this proposal and ask again.');validateLensChanges(p.value.changes,lens);if(!apply)throw new Error('No Lens actuator is connected.');}
  const confirmation=await record(holder,'atlas_confirmed',{id,proposalReceipt:p.receipt,source:fromRequest?'holder request':'confirmation',...(fromRequest?{words:p.words}:{})});
  if(p.value.kind==='narrow')for(const g of this.state(lens,Date.now(),data).grants.filter(g=>g.active)){
   const areas=g.areas.filter(a=>p.value.areas.includes(a)),scope=p.value.scope&&ATLAS_SCOPES.indexOf(p.value.scope)<ATLAS_SCOPES.indexOf(g.scope)?p.value.scope:g.scope;
   await record(holder,areas.length?'atlas_grant_narrowed':'atlas_grant_revoked',{grant:g.id,...(areas.length?{changes:{areas,scope}}:{}),proposalReceipt:p.receipt});
  }
  if(p.value.kind==='revoke')for(const g of this.state(lens,Date.now(),data).grants.filter(g=>g.active&&(!p.value.areas.length||g.areas.some(a=>p.value.areas.includes(a))))){
   const remaining=p.value.areas.length?g.areas.filter(a=>!p.value.areas.includes(a)):[];
   await record(holder,remaining.length?'atlas_grant_narrowed':'atlas_grant_revoked',{grant:g.id,...(remaining.length?{changes:{areas:remaining,scope:g.scope}}:{}),proposalReceipt:p.receipt});
  }
  if(p.value.kind==='extension')this.applying.add(confirmation.hash);
  try{const result=await apply?.(clone(p.value),{proposalReceipt:p.receipt,confirmationReceipt:confirmation.hash});const receipt=await record('atlas','atlas_applied',{id,proposalReceipt:p.receipt,confirmationReceipt:confirmation.hash,result:result??null});return {receipt:receipt.hash,confirmationReceipt:confirmation.hash,value:p.value,result};}
  catch(error){await record('atlas','atlas_failed',{id,confirmationReceipt:confirmation.hash,reason:String(error.message).slice(0,500)});throw error;}
  finally{this.applying.delete(confirmation.hash);}
 });}
 async verifyExtension(lens,{area,action,placeId,proposalReceipt,confirmationReceipt}){
  const data=this.read(),holder=this.holder(lens);
  if(!(await verifyChain(data.receipts)).valid)throw new Error('Atlas Receipt verification failed.');
  const state=this.state(lens,Date.now(),data);
  const proposal=state.proposals.find(p=>p.receipt===proposalReceipt&&p.status==='confirmed');
  const value=proposal?.value;
  if(!this.applying.has(confirmationReceipt)||value?.kind!=='extension'||value.area!==area||value.action!==action||value.placeId!==placeId||
    !state.receipts.some(r=>r.hash===confirmationReceipt&&r.actor===holder&&r.action==='atlas_confirmed'&&
      r.diff.id===proposal.id&&r.diff.proposalReceipt===proposalReceipt))throw new Error('A matching active Atlas confirmation is required.');
  this.extensionBasis(lens,value,'edit',data,{requested:proposal.basis?.requested,prior:proposal.basis});
  return clone(value.payload);
 }
 decline(lens,id){return this.write(lens,async(data,record,holder)=>{const p=this.state(lens,Date.now(),data).proposals.find(p=>p.id===id&&p.status==='proposal');if(p)await record(holder,'atlas_declined',{id,proposalReceipt:p.receipt});});}
 attendance(lens,enabled){return this.write(lens,async(data,record,holder)=>{if(typeof enabled!=='boolean')throw new Error('Choose attending on or off.');if(enabled)this.require(lens,'travel','look',data);return record(holder,'atlas_attendance_changed',{enabled});});}
 holderLookup(lens,{kind,room,matches=[]}){return this.write(lens,async(data,record)=>{this.require(lens,'travel','look',data);return record('atlas','atlas_holder_located',{kind,room:room??null,places:matches.map(c=>c.room),source:'holder records'});});}
 indexAnswer(lens,{topic,query},{rule}){return this.write(lens,async(data,record)=>{this.require(lens,'discovery','look',data);if(!['news','clubs','people'].includes(topic)||typeof query!=='string'||typeof rule!=='string')throw new Error('Invalid record question.');return record('atlas','atlas_index_answered',{topic,requested:query,rule});});}
 lookup(lens,{requested,query,exact,rule,matches}){return this.write(lens,async(data,record)=>{this.require(lens,'discovery','look',data);return record('atlas','atlas_searched',{requested,query,exact,rule,places:matches.map(c=>c.room)});});}
 revoke(lens,id){return this.write(lens,async(data,record,holder)=>{if(!this.state(lens,Date.now(),data).grants.some(g=>g.id===id&&g.active))throw new Error('No active grant for this profile.');return record(holder,'atlas_grant_revoked',{grant:id});});}
 narrow(lens,id,{areas,scope}){return this.write(lens,async(data,record,holder)=>{const prior=this.state(lens,Date.now(),data).grants.find(g=>g.id===id&&g.active);
  if(!prior||!Array.isArray(areas)||!areas.length||areas.some(a=>!ATLAS_AREAS.includes(a)||!prior.areas.includes(a))||!ATLAS_SCOPES.includes(scope)||ATLAS_SCOPES.indexOf(scope)>ATLAS_SCOPES.indexOf(prior.scope))throw new Error('Narrowing can only remove areas or reduce scope.');
  return record(holder,'atlas_grant_narrowed',{grant:id,changes:{areas:[...new Set(areas)],scope}});
 });}
}
