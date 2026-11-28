import {arrivalWords} from './trip-words.js';
import {indexQuestionAnswer} from './atlas-index-answers.js';
import {ROOMS} from './data.js';
import {ai} from './ai.js';
import {ATLAS_INTENT_SCHEMA,AREA_LABELS,ATLAS_SCOPES} from './atlas-intents.js';
import {AtlasRecords} from './atlas-records.js';
import {personId} from './permissions.js';
import {assuranceExplanation} from './lens-state.js';
import {esc} from './block-renderer.js';
import {DIMENSIONS} from './scores.js';
import {lensBasis} from './lens-proposals.js';
import {holderReference,resolveHolderDestination} from './holder-destinations.js';
import {resolveDestination,placeQuestionWords,destinationWords} from './atlas-destinations.js';

export function intentWords(value,{applied=false}={}){
 if(value.kind==='extension')return (AREA_LABELS[value.area]??value.area)+': '+value.action.replaceAll('-',' ')+' in '+(Object.values(ROOMS).find(r=>r.id===value.placeId)?.title??value.placeId)+'.';
 if(value.kind==='trip')return applied?'Trip requested. Pre-flight and the crossing record show its progress.':value.description+' This trip is proposed; nothing has moved yet.';
 if(value.kind==='lens')return 'Set your Lens to '+Object.entries(value.changes).map(([key,p])=>`${DIMENSIONS.find(([k])=>k===key)[1]}: amount ${p.amount}, graphicness ${p.graphicness}`).join('; ')+'. Only these dimensions change. Hard locks and account assurance stay in force.';
 const areas=value.areas?.map(a=>AREA_LABELS[a]).join(', ');
 if(value.kind==='grant')return `Grant Atlas ${value.scope} scope for ${areas}, ${value.durationMs===null?'standing, with no expiry':'leased for '+value.durationMs/60000+' minutes'}. Look reads the named areas; suggest proposes; edit acts on your words in your own places and settings, and asks at the edges. Hard limits and door terms still apply.`;
 if(value.kind==='envelope')return `${areas}: ${value.posture}. ${value.posture==='Quiet'?'Atlas speaks when you ask and acts in the open when asked.':value.posture==='Conversational'?'Atlas may propose, explain and ask; it acts on your yes.':`Your specification — may act unasked: “${value.unasked}”; always ask about: “${value.alwaysAsk}”; watch for: ${value.watch.map(s=>'“'+s+'”').join('; ')}.`}`;
 if(value.kind==='narrow')return `Keep Atlas’s help for ${areas}${value.scope?' at '+value.scope+' scope':''}; remove its other access.`;
 if(value.kind==='revoke')return `Remove Atlas’s grant for ${areas||'all your areas'}. Other areas stay as granted.`;
 return value.text??'';
}

export class AtlasUI {
 constructor(ui,api,{records=new AtlasRecords(),brain=ai}={}){this.ui=ui;this.api=api;this.records=records;this.brain=brain;this.messages=[];this.pending=null;if(!document.querySelector('[data-atlas-style]')){const link=document.createElement('link');link.rel='stylesheet';link.href=new URL('../atlas.css',import.meta.url).href;link.dataset.atlasStyle='';document.head.append(link);}}
 lens(){return this.api.lens();}
 sync(){const holder=personId(this.lens());if(holder!==this.holder){this.holder=holder;this.messages=[];this.pending=null;this.destinations=null;this.returnOffer=null;this.placeChoices=null;this.error=null;this.busy=false;this.controller?.abort();}return holder;}
 safeState(){try{return this.records.state(this.lens());}catch(error){return {grants:[],envelopes:{},receipts:[],attending:false,error:'Atlas records are unavailable: '+error.message+' Manual controls remain available.'};}}
 attendance(){const state=this.safeState(),envelope=state.envelopes.travel;return {attending:state.attending,posture:envelope?.posture??null,watch:state.attending&&envelope?.posture==='Proactive'?envelope.watch:[]};}
 mountStatus(parent){this.status=document.createElement('button');this.status.id='ask-atlas-status';this.status.className='glass';this.status.onclick=()=>this.open();parent.append(this.status);this.refreshStatus();this.statusTimer=setInterval(()=>this.refreshStatus(),1000);}
 refreshStatus(){const status=this.attendance();if(this.status){const label='Ask Atlas · attending '+(status.attending?'On':'Off');if(this.status.textContent!==label)this.status.textContent=label;}return status;}
 open(){this.sync();this.ui.open('ask-atlas','','Ask Atlas');this.render();}
 render(){
  this.sync();
  const lens=this.lens(),state=this.safeState(),root=this.ui.content;
  const draft=root.dataset.askHolder===this.holder?root.querySelector('#atlas-ask')?.value??'':'';root.dataset.askHolder=this.holder;
  root.innerHTML=`${state.error?`<p role="alert">${esc(state.error)}</p>`:''}<div class="atlas-conversation" aria-live="polite">${this.messages.map(m=>`<p><strong>${m.who==='you'?'You':'Atlas'}</strong> · ${esc(m.text)}</p>`).join('')}</div>${this.pending?`<section class="atlas-proposal"><h3>${this.pending.value.kind==='trip'?'Go there?':'Proposal · not applied'}</h3><p>${esc(intentWords(this.pending.value))}</p><button id="atlas-confirm" class="primary">${this.pending.value.kind==='trip'?'Yes, take me there':'Yes, make this change'}</button><button id="atlas-decline">No, leave it unchanged</button><details><summary>Record</summary><button id="atlas-proposal-record">Inspect its receipt</button></details></section>`:''}<form id="atlas-ask-form"><label>What would you like to do or know?<textarea id="atlas-ask" rows="2" maxlength="1600" required placeholder="Take me to the bus boycott" ${this.busy?'disabled':''}>${esc(draft)}</textarea></label><button type="submit" ${this.busy?'disabled':''}>${this.busy?'Working…':'Ask'}</button></form><p id="atlas-message" role="status">${esc(this.error??'')}</p><details class="atlas-record-layer"><summary>Your records</summary><button id="atlas-audit">Grants, initiative and receipts</button>${this.api.inspector?'<button id="atlas-inspector">Lens dials</button>':''}<p>${esc(assuranceExplanation(lens))}</p><p>Settings and directions here use local interpretation. Place descriptions are quoted from the catalog. Docents show their live or local path on their own surface.</p><p>${state.grants.some(g=>g.active)?'Permission to help is on file. Each act rechecks its scope and expiry.':'No Atlas grant is active for this profile.'} Permission to help does not turn attending on. The Lens filters; Atlas attends.</p><details><summary>Change what Atlas may do</summary><p>“Give Atlas standing edit access for my Lens, Travel, Discovery, Build, Sources and standing.”</p><p>“Be Quiet for my Lens.”</p><p>For Proactive, name the area, what Atlas may do unasked, what it must always ask about, and what to watch for.</p></details></details>`;

  root.querySelector('#atlas-ask').onkeydown=e=>{if(e.key==='Enter'&&!e.shiftKey&&!e.isComposing){e.preventDefault();root.querySelector('#atlas-ask-form').requestSubmit();}};
  root.querySelector('#atlas-ask-form').onsubmit=e=>{e.preventDefault();this.ask(root.querySelector('#atlas-ask').value);};
  root.querySelector('#atlas-proposal-record')?.addEventListener('click',()=>this.audit(this.pending.receipt));
  root.querySelector('#atlas-confirm')?.addEventListener('click',()=>this.confirm());
  root.querySelector('#atlas-decline')?.addEventListener('click',()=>this.run(async()=>{await this.records.decline(this.lens(),this.pending.id);this.pending=null;this.messages.push({who:'atlas',text:'The proposal was declined. Nothing changed.'});this.render();}));
  root.querySelector('#atlas-audit').onclick=()=>this.audit();root.querySelector('#atlas-inspector')?.addEventListener('click',()=>this.api.inspector());
  if(this.destinations?.matches.length>1){const choices=document.createElement('section');choices.innerHTML=`<h3>Choose the Place you mean</h3><p>Order: ${esc(this.destinations.rule)} · ${esc(this.destinations.source??'Discovery index')}</p>${this.destinations.matches.map(c=>`<article><h4>${esc(c.title)}</h4><p>${esc(c.why)}</p><button data-atlas-destination="${esc(c.room)}">Offer this trip</button></article>`).join('')}`;root.querySelector('#atlas-ask-form').before(choices);choices.querySelectorAll('[data-atlas-destination]').forEach(b=>b.onclick=()=>this.run(async()=>{const fresh=resolveHolderDestination(this.destinations.requested,this.lens(),this.api.holderContext?.())??resolveDestination(this.destinations.requested,this.api.discovery(),{from:this.api.room?.()??'square'});if(!fresh.matches.some(c=>c.room===b.dataset.atlasDestination))throw new Error('That Place no longer fits the current Lens or door terms. Ask again.');this.destinations=null;await this.offerTrip(b.dataset.atlasDestination);}));}
  if(this.api.entrance&&!document.getElementById('navigation-return')){const back=document.createElement('button');back.id='atlas-return';back.textContent='Back to the entrance';back.onclick=()=>this.api.entrance();root.querySelector('#atlas-ask-form').before(back);}
  const status=this.refreshStatus(),button=document.createElement('button');button.id='atlas-attending';button.className='atlas-attending';button.textContent=`Help as I explore: ${status.attending?'On · turn off':'Off · turn on'}`;button.onclick=()=>this.run(async()=>{await this.records.attendance(this.lens(),!this.attendance().attending);this.refreshStatus();this.render();});const controls=document.createElement('div');controls.className='atlas-plain-controls';controls.append(button);const back=root.querySelector('#atlas-return');if(back)controls.append(back);root.prepend(controls);
  if(this.placeChoices?.matches.length){const section=document.createElement('section');section.className='atlas-place-answers';const visible=this.api.discovery?.().query({},{from:this.api.room?.()??'square'}).results??[],cards=this.placeChoices.matches.map(c=>visible.find(v=>v.type==='room'&&v.room===c.room)).filter(Boolean);section.innerHTML=cards.map(c=>`<article><p>${esc(placeQuestionWords(c,this.placeChoices.question))}</p><button data-question-trip="${esc(c.room)}">Take me there</button></article>`).join('')||'<p>This description is no longer available in your current view.</p>';root.querySelector('#atlas-ask-form').before(section);section.querySelectorAll('[data-question-trip]').forEach(b=>b.onclick=()=>this.run(async()=>{const found=resolveHolderDestination(this.placeChoices.requested,this.lens(),this.api.holderContext?.())??resolveDestination(this.placeChoices.requested,this.api.discovery(),{from:this.api.room?.()??'square'});if(!found.matches.some(c=>c.room===b.dataset.questionTrip))throw new Error('This Place is no longer available. Ask again.');await this.offerTrip(b.dataset.questionTrip);}));}
 }
 async run(action){this.error=null;try{await action();}catch(error){if(error.name==='AbortError')return;this.error=error.message;const status=this.ui.content.querySelector('#atlas-message');if(status)status.textContent=error.message;else this.ui.toast(error.message);}}
 async ask(words){if(this.busy)return;this.sync();this.busy=true;try{return await this.run(async()=>{
  this.sync();this.records.holder(this.lens());if(!String(words).trim())throw new Error('Type a request first.');const input=this.ui.content.querySelector('#atlas-ask');if(input)input.value='';await this.records.ensureStarter(this.lens());
  const holder=this.holder;this.destinations=null;this.returnOffer=null;this.placeChoices=null;this.error=null;this.controller?.abort();this.controller=new AbortController();this.messages.push({who:'you',text:words});this.render();
  const result=await this.brain.request({job:'guide',agentId:'atlas',schema:ATLAS_INTENT_SCHEMA,context:{action:'personal-intent',question:words,lensLimits:structuredClone(this.lens().limits),place:{key:this.api.room?.()??'studio'},blocks:[]},signal:this.controller.signal,isCurrent:()=>personId(this.lens())===holder&&this.ui.mode==='ask-atlas'});
  if(this.pending&&!['index','place-question','clarify'].includes(result.proposal.kind)){if(['revoke','narrow'].includes(result.proposal.kind)||result.proposal.kind==='destination'&&this.pending.value.kind==='trip'){await this.records.decline(this.lens(),this.pending.id);this.pending=null;}else throw new Error('Confirm or decline the open proposal first.');}
  if(result.proposal.kind==='place-question'){await this.answerPlaceQuestion(result.proposal);}
  else if(result.proposal.kind==='index'){
   this.records.require(this.lens(),'discovery','look');if(!this.api.discovery)throw new Error('Finish your starter before exploring shared records.');
   const answer=indexQuestionAnswer(result.proposal,this.api.discovery(),{from:this.api.room?.()??'square'});
   await this.records.indexAnswer(this.lens(),result.proposal,answer);
   this.messages.push({who:'atlas',text:answer.text});
  }
  else if(result.proposal.kind==='destination'){
   if(holderReference(result.proposal.query))this.records.require(this.lens(),'travel','look');
   const personal=resolveHolderDestination(result.proposal.query,this.lens(),this.api.holderContext?.());
   if(personal){await this.records.holderLookup(this.lens(),personal);if(personId(this.lens())!==holder)throw new Error('The profile changed. Ask again.');this.messages.push({who:'atlas',text:personal.message});this.destinations=personal;this.returnOffer=personal.entrance?JSON.stringify(personal.entrance):null;
    if(personal.matches.length===1){this.destinations=null;await this.offerTrip(personal.matches[0].room,{words});return;}this.render();return;
   }
   this.records.require(this.lens(),'discovery','look');if(!this.api.discovery)throw new Error('Discovery is unavailable during setup. Finish your starter before asking for a trip.');const found=resolveDestination(result.proposal.query,this.api.discovery(),{from:this.api.room?.()??'square'});await this.records.lookup(this.lens(),found);if(personId(this.lens())!==holder)throw new Error('The profile changed. Ask again in this profile.');this.messages.push({who:'atlas',text:found.message});this.destinations=found;
   if(found.matches.length===1){this.destinations=null;await this.offerTrip(found.matches[0].room,{words});return;}
  }
  else if(result.proposal.kind==='clarify')this.messages.push({who:'atlas',text:result.proposal.text});
  else {this.pending=await this.records.propose(this.lens(),result.proposal,words);if(['lens','envelope','revoke','narrow'].includes(result.proposal.kind)){await this.confirm({requested:true});return;}}
  this.render();
 });}finally{this.busy=false;if(this.ui.mode==='ask-atlas'){this.render();this.ui.content.querySelector('#atlas-ask')?.focus({preventScroll:true});}}}
 async answerPlaceQuestion(value){
  const lens=this.lens(),from=this.api.room?.()??'square',personal=resolveHolderDestination(value.query,lens,this.api.holderContext?.());
  if(personal){this.records.require(lens,'travel','look');await this.records.holderLookup(lens,personal);this.messages.push({who:'atlas',text:personal.message});this.placeChoices={...personal,question:value.question,matches:personal.matches.map(c=>({...c,view:ROOMS[c.room],summary:ROOMS[c.room]?.substance?.summary}))};return;}
  this.records.require(lens,'discovery','look');if(!this.api.discovery)throw new Error('Finish your starter to explore other Places. You can still ask about your Lens here.');
  const requested=destinationWords(value.query),current=/^(?:this|here|this (?:place|hall|room))(?: about)?$/i.test(requested),query=current?ROOMS[from]?.address:value.query,found=resolveDestination(query,this.api.discovery(),{from});
  await this.records.lookup(lens,found);this.placeChoices={...found,requested:query,question:value.question,...(current?{current:from}:{})};
  this.messages.push({who:'atlas',text:found.matches.length?'From the Places in your view. Nothing has been crossed.':`I couldn’t find a matching Place description for “${requested}”. I tried ${current?'the current Place':`the catalog for “${found.query||found.requested}”`}. I do not have a supported answer to fill the gap. Nothing has been crossed.`});
 }
 async offerTrip(target,{choice='inside',words='Trip requested'}={}){this.sync();this.open();return this.run(async()=>{
  if(this.pending?.value.kind==='trip'){await this.records.decline(this.lens(),this.pending.id);this.pending=null;}if(this.pending)throw new Error('Confirm or decline the open proposal first.');if(!this.api.tripDetails)throw new Error('Trip preparation is unavailable on this surface.');
  const details=this.api.tripDetails(target,choice);this.pending=await this.records.propose(this.lens(),{kind:'trip',target,choice,description:details.words},words,{tripBasis:details.signature});if(ROOMS[target]?.ownerId===this.holder)await this.confirm({requested:true});else this.render();
 });}
 async confirm({requested=false}={}){return this.run(async()=>{const pending=this.pending;if(!pending)return;this.sync();if(this.pending!==pending)throw new Error('The profile changed. Ask again in this profile.');
  const holder=this.holder,result=await this.records[requested?'confirmRequested':'confirm'](this.lens(),pending.id,async(value,refs)=>{
   if(value.kind==='trip'){
    if(personId(this.lens())!==holder||this.api.tripDetails(value.target,value.choice).signature!==pending.basis)throw new Error('The route, Lens or door terms changed. Ask for the trip again.');
    if(!this.api.trip)throw new Error('Travel is unavailable on this surface.');return this.api.trip(value.target,{choice:value.choice,words:true,auto:true});
   }
   if(value.kind!=='lens')return null;
   if(personId(this.lens())!==holder||lensBasis(this.lens())!==pending.basis)throw new Error('The profile or Lens changed. Ask again.');
   if(!this.api.applyLens)throw new Error('Lens changes are unavailable on this surface.');
   return this.api.applyLens(value.changes,{holder,basis:pending.basis,...refs});
  });this.pending=null;
  this.messages.push({who:'atlas',text:(result.value.kind==='trip'?'':requested?'Done as you asked. ':'Confirmed and recorded. ')+intentWords(result.value,{applied:true})+(result.result?.persisted===false?' Browser storage is blocked; the Lens change is kept only for this session.':'')+(result.result?.stagedForStarter?' These positions are staged for your starter. Finish arrival to save them to the profile.':'')});await this.api.changed?.();if(result.value.kind!=='trip')this.render();
 });}
 arrived(room,arrival={room,choice:'inside'}){this.messages.push({who:'atlas',text:arrivalWords(arrival,this.lens())});}
 audit(receipt){this.sync();const state=this.safeState(),host=this.ui.content;let root=host.querySelector('#atlas-audit-panel');if(!root){root=document.createElement('section');root.id='atlas-audit-panel';root.className='atlas-inspector';host.append(root);}
  root.innerHTML=`<h2>Grants, initiative and receipts</h2>${state.error?`<p role="alert">${esc(state.error)}</p>`:''}<p>These are this profile’s local records. Hard limits, legal floors, other owners’ terms and confirmation remain binding.</p><button id="atlas-back">Close inspector · keep asking</button><h3>Grants</h3>${state.grants.map(g=>`<section class="atlas-grant"><h4>${g.active?'Active':g.revokedAt?'Revoked':'Expired'} · ${esc(g.scope)}</h4>${g.origin==='starter'?'<p>Starter grant, given at arrival by the system.</p>':''}<p>${g.areas.map(a=>AREA_LABELS[a]).join(', ')} · ${g.expires?'Expires '+esc(g.expires):'Standing · no expiry'}</p><code>${esc(g.id)}</code>${g.active?`<details><summary>Narrow by hand</summary><form data-atlas-narrow="${esc(g.id)}">${g.areas.map(a=>`<label><input type="checkbox" name="area" value="${a}" checked>${AREA_LABELS[a]}</label>`).join('')}<label>Scope<select name="scope">${ATLAS_SCOPES.slice(0,ATLAS_SCOPES.indexOf(g.scope)+1).map(s=>`<option ${s===g.scope?'selected':''}>${s}</option>`).join('')}</select></label><button>Narrow grant · record receipt</button></form></details><button data-atlas-revoke="${esc(g.id)}">Revoke grant</button>`:''}</section>`).join('')||'<p>No grants on file.</p>'}<h3>Initiative by area</h3>${Object.entries(AREA_LABELS).map(([area,label])=>{const e=state.envelopes[area];return `<section><h4>${label} · ${e?.posture??'Not set'}</h4>${e?`<p>${e.origin==='starter'?'Starting term':'Your specification'}: ${esc(e.specification)}</p><p>${esc(intentWords(e))}</p><code>${esc(e.receipt)}</code>`:'<p>Atlas is not attending this area. You may still ask directly.</p>'}</section>`;}).join('')}<p>Proactive specifications are recorded as your words. This local round has no background monitoring service; travel checks happen in an open trip. Ask Atlas to change an initiative setting.</p><p id="atlas-message" role="status"></p><details><summary>Your ${state.receipts.length} Atlas receipts</summary>${[...state.receipts].reverse().map(r=>`<article><strong>${esc(receiptSummary(r,state))}</strong><p>${esc(r.time)} · ${esc(r.actor)}</p><code>${esc(r.hash)}</code></article>`).join('')}</details>`;
  root.querySelector('#atlas-back').onclick=()=>{root.remove();host.querySelector('#atlas-ask')?.focus();};root.querySelectorAll('[data-atlas-revoke]').forEach(b=>b.onclick=()=>this.run(async()=>{await this.records.revoke(this.lens(),b.dataset.atlasRevoke);this.api.changed?.();this.audit();}));
  root.querySelectorAll('[data-atlas-narrow]').forEach(f=>f.onsubmit=e=>{e.preventDefault();this.run(async()=>{await this.records.narrow(this.lens(),f.dataset.atlasNarrow,{areas:[...f.querySelectorAll('[name=area]:checked')].map(i=>i.value),scope:f.elements.scope.value});this.api.changed?.();this.audit();});});
  if(receipt){const record=[...root.querySelectorAll('article')].find(r=>r.querySelector('code')?.textContent===receipt);if(record){record.closest('details').open=true;record.scrollIntoView({block:'center'});}}
 }
}

export function receiptSummary(receipt,state){
 const d=receipt.diff??{},proposal=state.proposals.find(p=>p.id===d.id),value=d.value??proposal?.value;
 const areas=a=>(a??[]).map(k=>AREA_LABELS[k]??k).join(', ');
 switch(receipt.action){
 case 'atlas_starter_granted':return 'Starter grant given at arrival by the system: standing edit access for '+areas(d.areas)+'. Conversational; attending Off.';
 case 'atlas_proposed':return 'Proposed, not yet applied: '+intentWords(value);
 case 'atlas_confirmed':return (d.source==='holder request'?'Authorized by your request: ':'Confirmed by you: ')+(value?intentWords(value):'the recorded proposal.');
 case 'atlas_applied':return 'Applied: '+(value?intentWords(value,{applied:true}):'the confirmed proposal.');
 case 'atlas_declined':return 'You declined the proposal. Nothing was applied.';
 case 'atlas_failed':return 'Could not apply the proposal: '+(d.reason??'No reason was recorded.');
 case 'atlas_grant_revoked':return 'You revoked this grant. Its access is no longer active.';
 case 'atlas_grant_narrowed':return 'You narrowed this grant to '+d.changes.scope+' for '+areas(d.changes.areas)+'.';
 case 'atlas_attendance_changed':return 'You turned attending '+(d.enabled?'On':'Off')+'.';
 case 'atlas_holder_located':return 'Looked in your own records for '+d.kind+'. '+d.places.length+' Place(s) found.';
 case 'atlas_index_answered':return 'Answered from visible '+d.topic+' records using '+d.rule+'.';
 case 'atlas_searched':return 'Searched Discovery for “'+d.requested+'” using '+d.rule+'. '+d.places.length+' Place(s) found.';
 default:return 'Recorded action: '+receipt.action.replaceAll('_',' ')+'.';
 }
}
