import {PRESETS,DIMENSIONS} from './data.js';
import {appendEntry,verifyChain} from './ledger.js';
export const STORAGE_KEY='living-atlas.profiles.v4';
export const GROUPS=[['family','Family','made'],['writing-circle','Writing circle','made'],['tallahassee-resident','Verified Tallahassee resident','credential'],['neighborhood','My neighborhood','credential']];
const clone=value=>structuredClone(value);
export function makeProfile(name,extra={}){
  return {id:crypto.randomUUID(),name,identity:{display:'pseudonym',backing:'none'},age:18,preset:'Teen',limits:{...PRESETS.Teen.limits},hard:{...PRESETS.Teen.hard},show:{real:true,pseudonym:true,anonymous:true,agent:true},trustFrom:'Author',depth:'Standard',form:'3d',stylePreset:'Studio',acceptedLayers:[],groups:[],playAs:'visitor',isAgent:false,isTest:false,...extra};
}
export function seedProfiles(){
  const base=(id,name,preset,extra={})=>makeProfile(name,{id,seed:true,isTest:true,preset,limits:{...PRESETS[preset].limits},hard:{...PRESETS[preset].hard},...extra});
  return [base('seed-me','Me','Adult',{identity:{display:'real',backing:'verified'},age:35}),base('seed-verified','Verified adult','Adult',{identity:{display:'real',backing:'verified'},age:25}),base('seed-visitor','Unverified visitor','Teen',{identity:{display:'anonymous',backing:'none'},age:25}),base('seed-child','Child','Kids',{identity:{display:'anonymous',backing:'none'},age:10}),base('seed-agent','An agent','Adult',{identity:{display:'pseudonym',backing:'verified'},age:25,isAgent:true})];
}
function sanitize(p){
  if(!p||typeof p.id!=='string'||typeof p.name!=='string'||!p.name.trim()||!Number.isFinite(p.age))return null;
  const out=makeProfile(p.name.trim().slice(0,40));out.id=p.id.slice(0,100);out.age=Math.max(0,Math.min(120,Math.floor(p.age)));out.seed=seedIds.has(out.id);
  out.identity={display:['anonymous','pseudonym','real'].includes(p.identity?.display)?p.identity.display:'anonymous',backing:p.identity?.backing==='verified'?'verified':'none'};
  out.preset=[...Object.keys(PRESETS),'Custom'].includes(p.preset)?p.preset:'Teen';
  for(const [k] of DIMENSIONS){out.limits[k]=Number.isInteger(p.limits?.[k])&&p.limits[k]>=0&&p.limits[k]<=3?p.limits[k]:PRESETS.Teen.limits[k];out.hard[k]=p.hard?.[k]===null?null:Number.isInteger(p.hard?.[k])&&p.hard[k]>=0&&p.hard[k]<=3?p.hard[k]:PRESETS.Teen.hard[k];}
  for(const k of ['real','pseudonym','anonymous','agent'])out.show[k]=p.show?.[k]!==false;
  for(const [k,values] of Object.entries({trustFrom:['Author','Vouched','Academic','Community'],depth:['Glance','Standard','Deep'],form:['3d','card','narration','text'],stylePreset:['Studio','Documentary','Gallery','Kids'],playAs:['visitor','owner']}))if(values.includes(p[k]))out[k]=p[k];
  out.groups=Array.isArray(p.groups)?p.groups.filter(k=>GROUPS.some(g=>g[0]===k)):[];
  out.acceptedLayers=Array.isArray(p.acceptedLayers)?p.acceptedLayers.filter(k=>typeof k==='string').slice(0,200):[];
  out.isAgent=!!p.isAgent;out.isTest=out.seed||!!p.isTest||out.identity.backing==='verified'||out.groups.length>0||out.playAs==='owner';return out;
}
const seedIds=new Set(['seed-me','seed-verified','seed-visitor','seed-child','seed-agent']);
export class ProfileStore {
  constructor(storage=()=>globalThis.localStorage){
    this.storage=storage;this.profiles=seedProfiles();this.activeId=null;this.regularId=null;this.completed=false;this.override=null;this.entries=[];this.storageWarning='';this.queue=Promise.resolve();
    try{
      const raw=this.storage()?.getItem(STORAGE_KEY);
      if(raw){const data=JSON.parse(raw);if(data.version!==1||!Array.isArray(data.profiles))throw new Error('Unsupported profile data');
        const seen=new Set();const saved=data.profiles.map(sanitize).filter(p=>p&&!seen.has(p.id)&&seen.add(p.id));
        this.profiles=[...this.profiles.filter(p=>!saved.some(s=>s.id===p.id)),...saved];
        this.activeId=this.profiles.some(p=>p.id===data.activeId)?data.activeId:null;
        this.regularId=this.profiles.some(p=>p.id===data.regularId&&!p.isTest)?data.regularId:null;
        this.completed=!!data.completed&&!!this.activeId;this.entries=Array.isArray(data.entries)?data.entries:[];
      }
    }catch{this.storageWarning='Saved settings could not be read. Set up a fresh local profile to continue.';}
    this.ready=verifyChain(this.entries).then(result=>{this.chain=result;return result;}).catch(()=>{this.chain={valid:false,count:this.entries.length};return this.chain;});
  }
  active(){return this.profiles.find(p=>p.id===this.activeId);}
  current(){const base=this.active()??makeProfile('Visitor',{age:0,preset:'Kids',limits:{...PRESETS.Kids.limits},hard:{...PRESETS.Kids.hard}});return {...clone(base),...clone(this.override??{}),identity:{...base.identity,...this.override?.identity},profileId:base.id,profileName:base.name,viewAs:(this.override?.isAgent??base.isAgent)?'agent':'profile',testMode:this.testActive()};}
  testActive(){const p=this.active();return !!this.override||!!p?.isTest||p?.identity.backing==='verified'||p?.playAs==='owner'||!!p?.groups.length;}
  persist(){
    try{const storage=this.storage();if(!storage)throw new Error('Storage unavailable');storage.setItem(STORAGE_KEY,JSON.stringify({version:1,completed:this.completed,profiles:this.profiles,activeId:this.activeId,regularId:this.regularId,entries:this.entries}));this.storageWarning='';return true;}
    catch{this.storageWarning='This browser blocked saving. Changes and receipts are kept for this session only.';return false;}
  }
  transact(operation){const job=this.queue.then(async()=>{await this.ready;if(!this.chain.valid)throw new Error('Saved receipts failed verification. They have been preserved; profile switching is disabled.');return operation();});this.queue=job.catch(()=>{});return job;}
  async record(action,diff){return appendEntry(this.entries,this.activeId??'new-visitor',action,diff);}
  setup({name,age,preset,depth,form,display}){return this.transact(async()=>{
    if(!Number.isInteger(age)||age<0||age>120)throw new Error('Enter an age from 0 to 120.');
    const p=makeProfile(name?.trim().slice(0,40)||'My visit',{age,preset,limits:{...PRESETS[preset].limits},hard:{...PRESETS[preset].hard},depth,form,identity:{display,backing:'none'}});
    await this.record('profile_created',{profile:p.id,name:p.name});await this.record('profile_switched',{from:this.activeId,to:p.id});
    this.profiles.push(p);this.activeId=this.regularId=p.id;this.completed=true;this.override=null;this.persist();return p;
  });}
  switchProfile(id){return this.transact(async()=>{
    const next=this.profiles.find(p=>p.id===id);if(!next)throw new Error('Profile not found.');
    await this.record('profile_switched',{from:this.activeId,to:id,clearedOverrides:!!this.override});
    this.activeId=id;this.override=null;if(!next.isTest)this.regularId=id;this.persist();return next;
  });}
  saveAs(name){return this.transact(async()=>{
    if(!name?.trim())throw new Error('Give the profile a name.');
    const p=sanitize({...this.current(),id:crypto.randomUUID(),name:name.trim(),seed:false,isTest:this.testActive()});
    await this.record('profile_created',{profile:p.id,name:p.name,copiedFrom:this.activeId});await this.record('profile_switched',{from:this.activeId,to:p.id});
    this.profiles.push(p);this.activeId=p.id;this.override=null;if(!p.isTest)this.regularId=p.id;this.persist();return p;
  });}
  rename(id,name){return this.transact(async()=>{const p=this.profiles.find(p=>p.id===id);if(!p||p.seed)throw new Error('Built-in profiles keep their names. Save a copy to rename it.');if(!name?.trim())throw new Error('Give the profile a name.');await this.record('profile_renamed',{id,from:p.name,to:name.trim().slice(0,40)});p.name=name.trim().slice(0,40);this.persist();});}
  remove(id){return this.transact(async()=>{const p=this.profiles.find(p=>p.id===id);if(!p||p.seed)throw new Error('Built-in profiles cannot be deleted.');
    await this.record('profile_deleted',{id,name:p.name});this.profiles=this.profiles.filter(p=>p.id!==id);
    if(this.activeId===id){const next=this.profiles.find(p=>!p.seed&&!p.isTest)??this.profiles.find(p=>!p.seed);if(next)await this.record('profile_switched',{from:id,to:next.id});this.activeId=next?.id??null;this.override=null;this.completed=!!next;}
    if(this.regularId===id)this.regularId=this.profiles.find(p=>!p.seed&&!p.isTest)?.id??null;this.persist();
  });}
  preferences(lens){const p=this.active();if(!p)return;for(const key of ['preset','limits','hard','show','trustFrom','depth','form','stylePreset','acceptedLayers'])if(lens[key]!==undefined)p[key]=clone(lens[key]);this.persist();}
  setDisplay(display){const p=this.active();if(!p||!['anonymous','pseudonym','real'].includes(display))return;p.identity.display=display;this.persist();}
  setOverride(changes){this.override={...this.override,...clone(changes),identity:{...this.current().identity,...changes.identity}};}
  async exitTest(){if(this.active()?.isTest){if(this.regularId)return this.switchProfile(this.regularId);this.completed=false;this.activeId=null;this.override=null;this.persist();return;}this.override=null;this.persist();}
}
