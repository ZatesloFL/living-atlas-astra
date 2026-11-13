import {ROOMS,EDGES} from './data.js';
import {permission,roomTitle,personId} from './permissions.js';
import {visibleEdge} from './rules.js';
import {beforeDoor} from './navigation.js';
import {travelPlan} from './travel-plan.js';
import {esc} from './block-renderer.js';
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
export class FastTravel {
 constructor(ui,store,api){this.ui=ui;this.store=store;this.api=api;this.active=false;this.generation=0;this.waits=new Map();this.session=null;
  this.chip=document.createElement('div');this.chip.id='travel-waiting';this.chip.hidden=true;this.chip.className='waiting-chip';api.hud.mount(this.chip,75);
  this.fade=document.createElement('div');this.fade.id='travel-fade';this.fade.hidden=true;this.fade.innerHTML='<div><p>Preparing your arrival…</p><button>Cancel travel</button></div>';document.body.append(this.fade);this.fade.querySelector('button').onclick=()=>this.cancel();
  this.unsubscribe=store.subscribe(()=>this.refresh());this.timer=setInterval(()=>this.refresh(),800);
 }
 lens(){return this.api.lens();}
 start(target){if(!ROOMS[target])return;this.cancel({quiet:true});const lens=this.lens(),origin=this.api.room(),plan=travelPlan(origin,target,lens);if(!plan.route){this.ui.toast('No permitted route to that place.');return false;}
  const entry=EDGES.find(e=>e.to===target),needsDoor=entry&&visibleEdge(entry,lens).type!=='seamless';this.session={origin,target,profile:personId(lens),choice:needsDoor?'door':'inside',confirmed:new Set(),invites:new Set(),created:[],preview:null};this.render();return true;
 }
 plan(){const s=this.session;return s?travelPlan(s.origin,s.target,this.lens(),s):null;}
 render(){const s=this.session;if(!s||this.active)return;const lens=this.lens(),plan=this.plan();if(!plan.route){this.ui.close();this.session=null;this.ui.toast('The destination is outside your current access or lens.');return;}
  this.ui.open('travel','Fast travel · pre-flight','Plan your arrival');const root=this.ui.content,room=ROOMS[s.target],windowStop=plan.rows.some(r=>r.kind==='window'),insideAllowed=!windowStop&&room.visibility!=='private';if(!insideAllowed&&s.choice==='inside')s.choice='door';
  root.innerHTML=`<p class="address">${esc(room.address)}</p><h3>${esc(roomTitle(room,lens))}</h3><p>Review the route here. When every row is Ready, a short fade takes you to the selected landing point.</p><label>Arrival point<select id="travel-arrival">${[['outside','Outside · public approach'],['door','Door · at the threshold'],['inside','Inside · entry point']].map(([v,t])=>`<option value="${v}" ${v===s.choice?'selected':''} ${v==='inside'&&!insideAllowed?'disabled':''}>${t}</option>`).join('')}</select></label><ol class="travel-checklist">${plan.rows.map(row=>`<li data-travel-row="${esc(row.id)}" data-state="${row.state}"><div><strong>${esc(roomTitle(ROOMS[row.edge.to],lens))}</strong><span class="travel-state">${row.state}</span></div><p>${esc(row.reason)}</p>${row.kind==='door'&&row.state!=='Ready'?s.preview===row.id?`<div class="travel-preview"><p>${esc(ROOMS[row.edge.to].substance?.summary??'A doorway between places.')}</p><button data-confirm="${row.edge.id}">Confirm preview</button><button data-dismiss-preview>Not yet</button></div>`:`<button data-preview="${row.id}">Review doorway</button>`:row.kind==='access'?`${lens.isAgent?'<p>Agent requests need a person’s approval. Choose the person you represent in Access.</p>':''}${row.state==='Waiting on owner'?'<p>Waiting on Nic to approve · local simulation</p>':`<button data-knock="${row.edge.to}">${row.request?.status==='declined'?'Knock again':'Knock · ask to enter'}</button>`}`:row.kind==='invite'&&row.state!=='Ready'?`<button data-invite="${row.grant.id}">Accept invite for this trip</button>`:''}</li>`).join('')||'<li data-state="Ready"><strong>Ready</strong><p>Open route · no previews needed.</p></li>'}</ol><button id="travel-go" class="primary" ${!plan.ready?'disabled':''}>Go · fade to arrival</button>${plan.rows.some(r=>r.kind==='access'&&r.state!=='Ready')?'<button id="travel-waystation" class="secondary">Go to waystation</button>':''}<button id="travel-cancel" class="secondary">Cancel</button><p class="muted">Passes and content limits are checked again immediately before arrival. Uses receive room receipts.</p>`;
  root.querySelector('#travel-arrival').onchange=e=>s.choice=e.target.value;root.querySelectorAll('[data-preview]').forEach(b=>b.onclick=()=>{s.preview=b.dataset.preview;this.render();});root.querySelectorAll('[data-confirm]').forEach(b=>b.onclick=()=>{s.confirmed.add(b.dataset.confirm);s.preview=null;this.render();});root.querySelector('[data-dismiss-preview]')?.addEventListener('click',()=>{s.preview=null;this.render();});root.querySelectorAll('[data-invite]').forEach(b=>b.onclick=()=>{s.invites.add(b.dataset.invite);this.render();});
  root.querySelectorAll('[data-knock]').forEach(b=>b.onclick=async()=>{try{if(lens.isAgent){this.api.access(b.dataset.knock);return;}const q=await this.store.knock(b.dataset.knock,lens);s.created.push(q.id);this.render();}catch(e){this.ui.toast(e.message);}});
  root.querySelector('#travel-go').onclick=()=>this.go();root.querySelector('#travel-waystation')?.addEventListener('click',()=>this.go(true));root.querySelector('#travel-cancel').onclick=()=>this.cancel();
 }
 async cancel({quiet=false}={}){this.generation++;const s=this.session;this.active=false;this.session=null;this.fade.hidden=true;this.fade.classList.remove('shown');this.api.controls().resetInput();if(this.ui.mode==='travel')this.ui.close();if(s&&!s.atWaystation){for(const id of s.created)await this.store.cancelRequest(id,this.lens()).catch(()=>{});}if(!quiet&&s)this.ui.toast('Travel cancelled. You stayed where you were.');this.signature='';}
 update(){} // Movement is manual; fast travel only commits at the end of its pre-flight.
 refresh(){const lens=this.lens(),who=personId(lens),wait=this.waits.get(who);this.updateWaiting(wait);
  if(this.session&&this.session.profile!==who&&!this.active){this.session=null;if(this.ui.mode==='travel')this.ui.close();}
  if(this.session&&this.ui.mode==='travel'&&!this.active){const plan=this.plan(),sig=JSON.stringify(plan.rows.map(r=>[r.id,r.state,r.request?.status]));if(sig!==this.signature){this.signature=sig;this.render();}}
 }
 updateWaiting(wait){if(!wait){this.chip.hidden=true;return;}const q=this.store.data.requests.find(q=>wait.created.includes(q.id)),lens=this.lens(),rights=permission(ROOMS[wait.target],lens),approved=q?.status==='approved'&&rights.canEnter;
  const text=approved?'Approved · continue your trip':q?.status==='declined'?'Request declined':'Waiting on Nic to approve';this.chip.hidden=false;
  const stateKey=personId(lens)+wait.target+text;if(this.chip.dataset.state===stateKey)return;this.chip.dataset.state=stateKey;this.chip.innerHTML=`<span>${text}</span><button data-wait-continue>${approved?'Continue':q?.status==='declined'?'Knock again':'Review'}</button><button data-wait-leave>Leave</button>`;
  this.chip.querySelector('[data-wait-continue]').onclick=()=>{this.session={...wait,origin:this.api.room(),atWaystation:true};this.render();};this.chip.querySelector('[data-wait-leave]').onclick=async()=>{this.waits.delete(personId(lens));for(const id of wait.created)await this.store.cancelRequest(id,lens).catch(()=>{});this.chip.hidden=true;this.ui.toast('Left the waiting trip.');};if(approved)this.ui.toast('Nic approved your request.',{duration:12000,label:'Continue',action:()=>{this.session={...wait,origin:this.api.room(),atWaystation:true};this.render();}});
 }
 async go(waystation=false){const s=this.session,plan=this.plan();if(!s||!plan.route||!waystation&&!plan.ready||this.active)return;const lens=this.lens(),generation=++this.generation;let route=plan.route,landing;
  if(waystation){const first=plan.rows.find(r=>r.state!=='Ready');if(!first)return;const index=route.indexOf(first.edge);route=route.slice(0,index);landing={room:first.edge.from,scene:ROOMS[first.edge.from].layout.scene,position:beforeDoor(first.edge),facing:ROOMS[s.target].layout.arrivals.door.facing,choice:'outside'};}
  else landing={room:s.target,scene:ROOMS[s.target].layout.scene,...ROOMS[s.target].layout.arrivals[s.choice],choice:s.choice};
  const cancelled=()=>generation!==this.generation;this.active=true;this.ui.close();this.api.controls().resetInput();this.fade.hidden=false;this.fade.classList.toggle('reduced',this.api.reduced());this.fade.querySelector('p').textContent=waystation?'Arriving at a cleared waystation…':'Arriving at '+roomTitle(ROOMS[s.target],lens)+'…';this.fade.querySelector('button').hidden=false;
  requestAnimationFrame(()=>{if(!cancelled())this.fade.classList.add('shown');});
  try{await sleep(this.api.reduced()?180:350);if(cancelled())return;await sleep(120);if(cancelled())return;
   const latest=this.plan();if(!latest.route||!waystation&&!latest.ready)throw new Error('Access changed. Review the pre-flight again.');
   const uses=route.map(e=>({key:e.to,scope:visibleEdge(e,lens).type==='window'?'look':e.to===s.target&&s.choice!=='inside'?'look':'enter'}));
   if(!uses.length&&!waystation&&permission(ROOMS[s.target],lens).canLook)uses.push({key:s.target,scope:s.choice==='inside'?'enter':'look'});
   const committed=await this.store.commitTravel(uses,lens,{cancelled,invites:[...s.invites],arrival:landing,commit:()=>this.api.land(landing,route,s.confirmed)});if(!committed||cancelled())return;
   if(waystation){s.atWaystation=true;this.waits.set(s.profile,s);}else this.waits.delete(s.profile);
   this.session=null;this.fade.querySelector('button').hidden=true;this.fade.classList.remove('shown');await sleep(this.api.reduced()?180:350);this.fade.hidden=true;this.api.arrived(landing.room);this.active=false;this.refresh();this.ui.toast(waystation?'At the waystation. Your request can be reviewed in Test → owner.':'Arrived at '+roomTitle(ROOMS[landing.room],this.lens()));
  }catch(error){if(cancelled())return;this.active=false;this.fade.hidden=true;this.fade.classList.remove('shown');this.ui.toast(error.message);this.render();}
 }
}
