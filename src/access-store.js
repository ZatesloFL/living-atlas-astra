import {AXES,asPair,validPair} from './scores.js';
import {ROOMS} from './data.js';
import {permission,personId,SCOPES} from './permissions.js';
import {crossing} from './rules.js';
import {appendEntry,verifyChain} from './ledger.js';
import {accessSettings} from './identity.js';
import {DIMENSIONS} from './data.js';
import {doorPolicy,containingPlaces} from './admission.js';
import {emptyStanding} from './standing-records.js';
import {StandingStore} from './standing-store.js';
export const ACCESS_KEY='living-atlas.access.v4';
export const GROUP_RECORDS=[{id:'family',name:'Family',kind:'made',members:[],maxScope:'enter'},{id:'writing-circle',name:'Writing circle',kind:'made',members:[],maxScope:'suggest'},{id:'tallahassee-resident',name:'Verified Tallahassee resident',kind:'credential',members:[],maxScope:'enter'},{id:'neighborhood',name:'My neighborhood',kind:'credential',members:[],maxScope:'look'}];
const stamp=()=>new Date().toISOString(),id=()=>crypto.randomUUID();
export class AccessStore {
 constructor(storage=()=>globalThis.localStorage){
  this.visitGrants=[];
  this.storage=storage;this.warning='';this.queue=Promise.resolve();this.listeners=new Set();this.data={grants:[],requests:[],groups:structuredClone(GROUP_RECORDS),policies:{},ledgers:{},presence:[],places:{},layerState:{},community:{epoch:Date.now()},staffState:{helpers:[],proposals:[],initialized:false}};
  try{const raw=storage()?.getItem(ACCESS_KEY);if(raw){const d=JSON.parse(raw);if(d.version!==1)throw new Error('Unknown access data');for(const k of Object.keys(this.data))if(d[k]!==undefined&&Array.isArray(d[k])===Array.isArray(this.data[k]))this.data[k]=d[k];}}catch{this.warning='Saved access data could not be read. Using an empty local simulation.';}
  this.data.standingState??=emptyStanding();
  // Old stores have no standing record. Never invent measurements on load.
  try{const saved=JSON.parse(storage()?.getItem(ACCESS_KEY)??'null');if(saved?.standingState)this.data.standingState=saved.standingState;}catch{/* the access warning above covers unreadable storage */}
  this.standing=new StandingStore(this);
  this.ready=Promise.all([...Object.values(this.data.ledgers),this.data.standingState.receipts].map(verifyChain)).then(results=>{this.valid=results.every(r=>r.valid);return this.valid;}).catch(()=>this.valid=false);
 }
 snapshot(){return this.data;}
 lens(lens){const view={...lens,access:this.data,visitGrants:this.visitGrants};if(Object.values(ROOMS).some(r=>{const p=permission(r,view);return p.visibility!=='public'&&p.grant&&!p.denied&&!(r.ownerId&&p.owner);}))view.testMode=true;return view;}
 subscribe(fn){this.listeners.add(fn);return()=>this.listeners.delete(fn);}
 persist(){try{this.storage()?.setItem(ACCESS_KEY,JSON.stringify({version:1,...this.data}));}catch{this.warning='Access changes stay in memory because browser storage is blocked.';}for(const fn of this.listeners)fn();}
 transaction(fn){const job=this.queue.then(async()=>{await this.ready;if(!this.valid)throw new Error('Room receipts failed verification. Preserved data cannot be changed.');const result=await fn();this.persist();return result;});this.queue=job.catch(()=>{});return job;}
 room(key){const r=ROOMS[key]??Object.values(ROOMS).find(r=>r.id===key);if(!r)throw new Error('Room not found');return r;}
 owner(lens,key){if(lens.preview)throw new Error('Exit Preview as before changing access.');if(lens.isAgent||!(key?permission(this.room(key),this.lens(lens)).owner:lens.playAs==='owner'))throw new Error('A person playing as owner must approve this action. Agents cannot approve.');}
 async record(room,lens,action,diff){const key=this.room(room).id;this.data.ledgers[key]??=[];return appendEntry(this.data.ledgers[key],personId(lens),action,diff);}
 admission(key,policy,lens){return this.transaction(async()=>{
  this.owner(lens,key);const r=this.room(key),minimum=Object.fromEntries(DIMENSIONS.map(([k])=>[k,asPair(policy.minimum?.[k])]));
  if(!['threshold','filtered'].includes(policy.mode)||Object.values(minimum).some(p=>!validPair(p)))throw new Error('Choose a door mode and dimensions from 0 to 3.');
  const admission={mode:policy.mode,minimum};this.data.policies[r.id]={...this.data.policies[r.id],admission};await this.record(key,lens,'admission_declared',admission);
 });}
 raiseForVisit(key,limits,lens){return this.transaction(async()=>{
  if(lens.preview||lens.isAgent)throw new Error('A visitor must choose their own visit limits.');
  const r=this.room(key),p=permission(r,this.lens(lens)),a=accessSettings(lens,r);
  if(!p.canLook||!p.canEnter||crossing({to:Object.keys(ROOMS).find(k=>ROOMS[k]===r),type:'door'},this.lens(lens)).state==='hidden')throw new Error('This Place is outside your access or legal ceiling.');
  const raised={};for(const [k,value] of Object.entries(limits)){if(!DIMENSIONS.some(([name])=>name===k)||!validPair(value))throw new Error('Choose amount and graphicness from 0 to 3.');for(const axis of AXES){const n=value[axis];if(n>(a.hard[k][axis]??3))throw new Error('A visit cannot raise a hard limit or legal ceiling.');if(n>a.limits[k][axis]){raised[k]??={...a.limits[k]};raised[k][axis]=n;}}}
  if(!Object.keys(raised).length)throw new Error('Choose a higher dimension for this visit.');
  const grant={id:id(),place:r.id,person:personId(lens),limits:raised,state:'pending',createdAt:stamp(),expires:new Date(Date.now()+5*60000).toISOString()};
  await this.record(key,lens,'visit_lens_raised',{grant:grant.id,place:r.id,limits:raised,scope:'this Place for this visit',pendingExpires:grant.expires});this.visitGrants.push(grant);return grant;
 });}
 async transitionVisit(key,lens){
  if(lens.preview)return;const next=key?this.room(key).id:null,person=personId(lens),within=new Set(next?(containingPlaces(next,ROOMS)??[]).map(id=>ROOMS[id].id):[]);
  for(const grant of [...this.visitGrants])if(grant.person===person){
   if(grant.expires&&Date.parse(grant.expires)<=Date.now()||grant.state==='active'&&!within.has(grant.place)){await this.record(grant.place,lens,'visit_lens_expired',{grant:grant.id,reason:next?'left Place':'visit ended'});this.visitGrants.splice(this.visitGrants.indexOf(grant),1);}
   else if(grant.place===next&&grant.state==='pending'){grant.state='active';grant.expires=null;await this.record(key,lens,'visit_lens_started',{grant:grant.id});}
  }
 }
 endVisits(lens){return this.transaction(async()=>{for(const grant of [...this.visitGrants])if(grant.person===personId(lens)){await this.record(grant.place,lens,'visit_lens_expired',{grant:grant.id,reason:'visit ended'});this.visitGrants.splice(this.visitGrants.indexOf(grant),1);}});}
 inclusion(key,mode,lens){return this.transaction(async()=>{this.owner(lens,key);if(!['anyone','approved','none'].includes(mode))throw new Error('Choose an inclusion policy.');const r=this.room(key);this.data.policies[r.id]={...this.data.policies[r.id],embed:mode};await this.record(key,lens,'inclusion_changed',{mode});});}
 policy(key,visibility,lens){return this.transaction(async()=>{this.owner(lens,key);const r=this.room(key);if(r.layout?.root&&!r.ownerId)throw new Error('The prototype keeps its home entrances public.');if(!['public','listed','hidden'].includes(visibility)||r.visibility==='private'&&visibility==='public')throw new Error('Choose an allowed visibility.');this.data.policies[r.id]={...this.data.policies[r.id],visibility};await this.record(key,lens,'visibility_changed',{visibility});});}
 knock(key,lens,{scope='enter',onBehalfOf}={}){return this.transaction(async()=>{if(lens.preview)throw new Error('Preview as does not record real access.');const r=this.room(key),p=permission(r,this.lens(lens));if(!p.visible)throw new Error('No reachable door for this request.');if(lens.isAgent&&!onBehalfOf)throw new Error('Choose the person this agent represents.');if(!SCOPES.includes(scope))throw new Error('Unknown scope');const request={id:id(),room:r.id,by:personId(lens),name:lens.profileName??lens.name??'Visitor',agent:!!lens.isAgent,to:onBehalfOf??personId(lens),scope,status:'pending',createdAt:stamp()};this.data.requests.push(request);await this.record(key,lens,'access_requested',request);return request;});}
 async issue(key,to,scope,expires,lens,kind='grant',denied=false){
  this.owner(lens,key);if(!SCOPES.includes(scope)||!to?.person&&!to?.group)throw new Error('Choose a recipient and scope.');if(expires&&(!Number.isFinite(Date.parse(expires))||Date.parse(expires)<=Date.now()))throw new Error('Expiry must be in the future.');
  const r=this.room(key),grant={id:id(),room:r.id,to,scope,expires:expires||null,approvedBy:personId(lens),createdAt:stamp(),revokedAt:null,kind,denied};
  // One current individual setting wins even when two actions share a timestamp.
  if(to.person)for(const g of this.data.grants.filter(g=>g.room===r.id&&g.to.person===to.person&&!g.revokedAt)){g.revokedAt=stamp();await this.record(key,lens,'grant_superseded',{grant:g.id});}
  this.data.grants.push(grant);await this.record(key,lens,kind==='invite'?'invite_created':'access_granted',grant);return grant;
 }
 grant(key,to,scope,expires,lens,kind='grant',denied=false){return this.transaction(()=>this.issue(key,to,scope,expires,lens,kind,denied));}
 respond(requestId,approved,lens,expires=null){return this.transaction(async()=>{const q=this.data.requests.find(q=>q.id===requestId);if(!q||q.status!=='pending')throw new Error('Request is no longer pending.');this.owner(lens,q.room);let grant;if(approved)grant=await this.issue(q.room,{person:q.to},q.scope,expires,lens,'knock');q.status=approved?'approved':'declined';q.decidedAt=stamp();await this.record(q.room,lens,'request_'+q.status,{request:q.id,grant:grant?.id??null});return grant;});}
 revoke(grantId,lens){return this.transaction(async()=>{const g=this.data.grants.find(g=>g.id===grantId);if(!g||g.revokedAt)throw new Error('Grant is no longer active.');this.owner(lens,g.room);g.revokedAt=stamp();await this.record(g.room,lens,'access_revoked',{grant:g.id});});}
 group(key,groupId,members,maxScope,lens){return this.transaction(async()=>{this.owner(lens,key);const group=this.data.groups.find(g=>g.id===groupId);if(!group||!SCOPES.includes(maxScope))throw new Error('Unknown group or scope');if(group.kind==='made')group.members=[...new Set(members)];group.maxScope=maxScope;await this.record(key,lens,'group_updated',{group:groupId,members:group.members,maxScope});});}
 use(key,scope,lens,{visit=false}={}){return this.transaction(async()=>{if(lens.preview)throw new Error('Preview as does not record real access.');const r=this.room(key),view=this.lens(lens),p=permission(r,view),gate=crossing({to:Object.keys(ROOMS).find(k=>ROOMS[k]===r),type:'door'},view);if(gate.state==='hidden'||gate.admission?.blocked||!p.canLook||SCOPES.indexOf(p.scope)<SCOPES.indexOf(scope))throw new Error('Access changed before arrival.');if(scope!=='look'||visit)await this.transitionVisit(key,lens);await this.record(key,lens,'access_used',{scope,visit,grant:p.grant?.id??'public',approvedBy:p.grant?.approvedBy??'room author',name:lens.profileName??lens.name??'Visitor',agent:!!lens.isAgent});if(scope!=='look'){this.data.presence=this.data.presence.filter(p=>p.person!==personId(lens));this.data.presence.push({room:r.id,person:personId(lens),name:lens.profileName??lens.name??'Visitor',agent:!!lens.isAgent,identity:{...lens.identity},privacy:lens.discovery?.privacy??'everyone',groups:[...(lens.groups??[])],expires:new Date(Date.now()+5*60000).toISOString(),at:stamp()});}return p;});}
 leave(key,lens){return this.transaction(async()=>{if(lens.preview)throw new Error('Preview as does not record real access.');await this.transitionVisit(null,lens);this.data.presence=this.data.presence.filter(p=>!(p.person===personId(lens)&&p.room===this.room(key).id));await this.record(key,lens,'room_left',{});});}
 redeem(inviteId,lens){return this.transaction(async()=>{if(lens.preview)throw new Error('Preview as does not record real access.');const g=this.data.grants.find(g=>g.id===inviteId&&g.kind==='invite');if(!g||g.revokedAt||g.to.person!==personId(lens)||g.expires&&Date.parse(g.expires)<=Date.now())throw new Error('This local invite is missing, expired, revoked, or addressed to a different profile.');await this.record(g.room,lens,'invite_opened',{grant:g.id});return Object.keys(ROOMS).find(k=>ROOMS[k].id===g.room);});}
 cancelRequest(requestId,lens){return this.transaction(async()=>{const q=this.data.requests.find(q=>q.id===requestId);if(!q||q.status!=='pending'||q.by!==personId(lens))return;q.status='cancelled';await this.record(q.room,lens,'request_cancelled',{request:requestId});});}
 commitTravel(uses,lens,{cancelled=()=>false,invites=[],arrival,commit}={}){return this.transaction(async()=>{
  if(cancelled())return false;const staged=structuredClone(this.data.ledgers),validate=()=>uses.every(({key,scope})=>{const r=this.room(key),p=permission(r,this.lens(lens));return p.canLook&&SCOPES.indexOf(p.scope)>=SCOPES.indexOf(scope)&&crossing({to:key,type:'door'},this.lens(lens)).state!=='hidden'&&!doorPolicy(r,this.lens(lens)).blocked;});
  if(!validate())throw new Error('A pass expired or the route is no longer allowed.');
  if(!lens.preview)for(const {key,scope} of uses){const r=this.room(key),p=permission(r,this.lens(lens));staged[r.id]??=[];if(p.grant&&invites.includes(p.grant.id))await appendEntry(staged[r.id],personId(lens),'invite_opened',{grant:p.grant.id});await appendEntry(staged[r.id],personId(lens),'access_used',{scope,grant:p.grant?.id??'public',approvedBy:p.grant?.approvedBy??'room author',name:lens.profileName??lens.name??'Visitor',agent:!!lens.isAgent,via:'fast travel',arrival:arrival.choice});}
  if(cancelled())return false;if(!validate())throw new Error('Access changed before arrival.');commit?.();if(!lens.preview){this.data.ledgers=staged;await this.transitionVisit(arrival.contextRoom??uses.at(-1)?.key??arrival.room,lens);if(uses.at(-1)?.scope==='enter'){this.data.presence=this.data.presence.filter(p=>p.person!==personId(lens));this.data.presence.push({room:this.room(uses.at(-1).key).id,person:personId(lens),name:lens.profileName??lens.name,agent:!!lens.isAgent,identity:{...lens.identity},privacy:lens.discovery?.privacy??'everyone',groups:[...(lens.groups??[])],expires:new Date(Date.now()+5*60000).toISOString(),at:stamp()});}}return true;
 });}
 places(lens){return this.data.places[personId(lens)]??{pins:[],recent:[]};}
 pin(key,lens){if(lens.preview)return;const p=this.data.places[personId(lens)]??={pins:[],recent:[]};p.pins=p.pins.includes(key)?p.pins.filter(k=>k!==key):[...p.pins,key];this.persist();}
 recent(key,lens){if(lens.preview)return;const p=this.data.places[personId(lens)]??={pins:[],recent:[]};p.recent=[key,...p.recent.filter(k=>k!==key)].slice(0,12);this.persist();}
}
