import {appendEntry,verifyChain} from './ledger.js';
import {personId} from './permissions.js';
import {ATLAS_AREAS,ATLAS_SCOPES,validateAtlasIntent} from './atlas-intents.js';

export const ATLAS_RECORDS_KEY='living-atlas.atlas-records.v1';
const clone=value=>structuredClone(value);
export class AtlasRecords {
 constructor(storage=()=>globalThis.localStorage){this.storage=storage;this.queue=Promise.resolve();}
 holder(lens){if(!lens||lens.preview||lens.isAgent||!personId(lens)||lens.age<13)throw new Error('Use your own active local profile, outside Preview as.');return personId(lens);}
 read(){const raw=this.storage()?.getItem(ATLAS_RECORDS_KEY);const data=raw?JSON.parse(raw):{version:1,receipts:[]};if(data.version!==1||!Array.isArray(data.receipts))throw new Error('Atlas records need recovery.');return data;}
 state(lens,now=Date.now(),data=this.read()){
  const holder=personId(lens),receipts=data.receipts.filter(r=>r.diff.holder===holder),grants=[],envelopes={},proposals=new Map();
  for(const r of receipts){const d=r.diff;
   if(r.action==='atlas_proposed')proposals.set(d.id,{...d,receipt:r.hash,status:'proposal'});
   if(r.action==='atlas_declined'||r.action==='atlas_confirmed')if(proposals.has(d.id))proposals.get(d.id).status=r.action==='atlas_declined'?'declined':'confirmed';
   if(r.action==='atlas_applied'){
    const p=proposals.get(d.id);if(p){p.status='applied';p.outcome=r.hash;}
    if(p?.value.kind==='grant')grants.push({...p.value,id:p.id,to:{person:'atlas'},approvedBy:holder,createdAt:r.time,expires:p.value.durationMs===null?null:new Date(Date.parse(r.time)+p.value.durationMs).toISOString(),receipt:r.hash});
    if(p?.value.kind==='envelope')for(const area of p.value.areas)envelopes[area]={...p.value,receipt:r.hash,time:r.time};
   }
   if(r.action==='atlas_grant_revoked'){const grant=grants.find(g=>g.id===d.grant);if(grant)grant.revokedAt=r.time;}
   if(r.action==='atlas_grant_narrowed'){const grant=grants.find(g=>g.id===d.grant);if(grant)Object.assign(grant,d.changes);}
  }
  for(const g of grants)g.active=!g.revokedAt&&(!g.expires||Date.parse(g.expires)>now);
  return {holder,receipts,grants,envelopes,proposals:[...proposals.values()]};
 }
 require(lens,area,scope='look',data=this.read()){
  this.holder(lens);const grant=this.state(lens,Date.now(),data).grants.findLast(g=>g.active&&g.areas.includes(area)&&ATLAS_SCOPES.indexOf(g.scope)>=ATLAS_SCOPES.indexOf(scope));
  if(!grant)throw new Error(`Atlas needs your active ${scope} grant for ${area}. Ask for that grant first; nothing has changed.`);return grant;
 }
 write(lens,operation){const holder=this.holder(lens);const job=this.queue.then(()=>{
  const run=async()=>{const data=this.read();if(!(await verifyChain(data.receipts)).valid)throw new Error('Atlas receipt verification failed. Preserved records cannot be changed.');
   const record=async(actor,action,diff)=>{const r=await appendEntry(data.receipts,actor,action,{holder,...diff});this.storage().setItem(ATLAS_RECORDS_KEY,JSON.stringify(data));return r;};
   return operation(data,record,holder);
  };return globalThis.navigator?.locks?navigator.locks.request(ATLAS_RECORDS_KEY,run):run();
 });this.queue=job.catch(()=>{});return job;}
 propose(lens,value,words){validateAtlasIntent(value);if(value.kind==='clarify')throw new Error('A clarification is not an act.');return this.write(lens,async(data,record)=>{
  const id=crypto.randomUUID(),r=await record('atlas','atlas_proposed',{id,value:clone(value),words:String(words).slice(0,1600)});return {id,value:clone(value),receipt:r.hash,status:'proposal'};
 });}
 confirm(lens,id,apply){return this.write(lens,async(data,record,holder)=>{
  const p=this.state(lens,Date.now(),data).proposals.find(p=>p.id===id&&p.status==='proposal');if(!p)throw new Error('This proposal is no longer open for this profile.');validateAtlasIntent(p.value);
  if(!['grant','envelope','revoke'].includes(p.value.kind))this.require(lens,p.value.kind==='lens'?'lens':'travel','edit',data);
  const confirmation=await record(holder,'atlas_confirmed',{id,proposalReceipt:p.receipt});
  if(p.value.kind==='revoke')for(const g of this.state(lens,Date.now(),data).grants.filter(g=>g.active&&(!p.value.areas.length||g.areas.some(a=>p.value.areas.includes(a))))){
   const remaining=p.value.areas.length?g.areas.filter(a=>!p.value.areas.includes(a)):[];
   await record(holder,remaining.length?'atlas_grant_narrowed':'atlas_grant_revoked',{grant:g.id,...(remaining.length?{changes:{areas:remaining,scope:g.scope}}:{}),proposalReceipt:p.receipt});
  }
  try{const result=await apply?.(clone(p.value),{proposalReceipt:p.receipt,confirmationReceipt:confirmation.hash});const receipt=await record('atlas','atlas_applied',{id,proposalReceipt:p.receipt,confirmationReceipt:confirmation.hash,result:result??null});return {receipt:receipt.hash,value:p.value,result};}
  catch(error){await record('atlas','atlas_failed',{id,confirmationReceipt:confirmation.hash,reason:String(error.message).slice(0,500)});throw error;}
 });}
 decline(lens,id){return this.write(lens,async(data,record,holder)=>{const p=this.state(lens,Date.now(),data).proposals.find(p=>p.id===id&&p.status==='proposal');if(p)await record(holder,'atlas_declined',{id,proposalReceipt:p.receipt});});}
 revoke(lens,id){return this.write(lens,async(data,record,holder)=>{if(!this.state(lens,Date.now(),data).grants.some(g=>g.id===id&&g.active))throw new Error('No active grant for this profile.');return record(holder,'atlas_grant_revoked',{grant:id});});}
 narrow(lens,id,{areas,scope}){return this.write(lens,async(data,record,holder)=>{const prior=this.state(lens,Date.now(),data).grants.find(g=>g.id===id&&g.active);
  if(!prior||!Array.isArray(areas)||!areas.length||areas.some(a=>!ATLAS_AREAS.includes(a)||!prior.areas.includes(a))||!ATLAS_SCOPES.includes(scope)||ATLAS_SCOPES.indexOf(scope)>ATLAS_SCOPES.indexOf(prior.scope))throw new Error('Narrowing can only remove areas or reduce scope.');
  return record(holder,'atlas_grant_narrowed',{grant:id,changes:{areas:[...new Set(areas)],scope}});
 });}
}
