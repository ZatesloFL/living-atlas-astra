import {Staff} from './staff.js';
import {StaffUI} from './staff-ui.js';
import {Discovery} from './discovery.js';
import {CommunityUI} from './community-ui.js';
import {presentationFor,heroHTML} from './presentation.js';
import {viewRoom} from './audience.js';
import {mediaContext,stopMedia} from './kit-ui.js';
import {itemStyle} from './item-style.js';
import {LayerUI,experienceHTML,bindExperience,layerSettings,bindLayerSettings} from './experience-ui.js';
import {permission,roomTitle} from './permissions.js';
import {graphRoute} from './navigation.js';
import {AccessUI,readingDialog} from './access-ui.js';
// Independent reading surface: no engine, world geometry, controls or 3D UI imports.
import {ROOMS,EDGES,PRESETS,DIMENSIONS,createLens} from './data.js';
import {roomVisible,setPreset,visibleEdge} from './rules.js';
import {roomEntry,contentStore} from './content.js';
import {identityBadge,accessSettings,appliedPreset} from './identity.js';
import {esc,articleHTML,bindBlocks} from './block-renderer.js';
export class PageRenderer {
 constructor({lens,room='studio',originRoom='studio',onLensChange,onAgeChange,on3D,onVisit,diagnostics,approvedRooms=[],access,profiles,onAccessChange}={}){
  if(!document.querySelector('[data-page-design]')){const css=document.createElement('link');css.rel='stylesheet';css.href=new URL('../page.css',import.meta.url).href;css.dataset.pageDesign='';document.head.append(css);}
  this.lens=lens??{...createLens(),age:0,identity:{display:'anonymous',backing:'none'}};this.room=approvedRooms.includes(room)?room:approvedRooms.includes(originRoom)?originRoom:'studio';this.initialRoom=room;this.access=access;this.profiles=profiles;this.onLensChange=onLensChange;this.onAgeChange=onAgeChange;this.on3D=on3D;this.onVisit=onVisit;this.diagnostics=diagnostics;this.approved=new Set(['studio',...approvedRooms]);this.softApproved=new Set();
  this.root=document.getElementById('page-form')||document.createElement('main');this.root.id='page-form';if(!this.root.parentNode)document.body.append(this.root);this.root.hidden=true;
  if(access)this.accessUI=new AccessUI(readingDialog(),access,{state:()=>({lens:this.lens,profiles}),changed:()=>{this.approved.clear();onAccessChange?.();this.render(true);}});
  if(profiles&&access){this.discovery=new Discovery(profiles,access,{lens:()=>this.lens,changed:lens=>this.experienceChanged(lens)});this.communityUI=new CommunityUI(readingDialog(),this.discovery,{reading:true,room:()=>this.room,page:id=>this.visit(id),layer:(room,id)=>this.layerUI.peek(room,id)});}
  if(access&&profiles){this.staff=new Staff(access);this.staffUI=new StaffUI(readingDialog(),this.staff,{lens:()=>this.lens,room:()=>this.room,changed:()=>{this.lens=access.lens(this.lens);onAccessChange?.();this.render(true);},receipts:id=>{this.staffUI.ui.close();this.accessUI.open(id);},trail:id=>{const t=this.discovery.startTrail(id);this.visit(t.stops[this.discovery.prefs().trail.index].room);}});}
  this.layerUI=new LayerUI(readingDialog(),access,{state:()=>({lens:this.lens}),changed:lens=>this.experienceChanged(lens)});
  this.accessSignature='';this.expiryTimer=setInterval(()=>{if(this.root.hidden)return;const p=permission(ROOMS[this.room],this.lens),signature=p.visible+':'+p.scope;if(this.accessSignature&&signature!==this.accessSignature){if(!p.canLook){this.accessUI?.ui.close();this.layerUI?.ui.close();this.staffUI?.ui.close();this.communityUI?.ui.close();}this.render(true);}this.accessSignature=signature;},1000);
  this.scrollHandler=()=>{this.root.querySelector('.page-lens-bar')?.classList.toggle('compact',window.scrollY>180);};window.addEventListener('scroll',this.scrollHandler,{passive:true});
  this.unsubscribe=contentStore.subscribe(id=>{if(id===this.room&&!this.root.hidden)this.render(true);});
 }
 open(room=this.initialRoom){document.body.classList.add('page-mode');this.root.hidden=false;document.getElementById('loading')?.classList.add('done');document.getElementById('sheet')?.setAttribute('hidden','');document.getElementById('veil')?.setAttribute('hidden','');document.body.classList.remove('panel-open');this.visit(ROOMS[room]?room:'studio');}
 close(){window.removeEventListener('scroll',this.scrollHandler);stopMedia();this.root.hidden=true;document.body.classList.remove('page-mode');this.unsubscribe?.();clearInterval(this.expiryTimer);this.accessUI?.ui.destroy?.();this.communityUI?.ui.destroy?.();this.staffUI?.ui.destroy?.();this.layerUI?.ui.destroy?.();this.root.replaceChildren();}
 changed(){this.approved.clear();this.approved.add('studio');this.softApproved.clear();this.onLensChange?.(this.lens);this.visit(this.room);}
 experienceChanged(lens){this.lens=lens;this.onLensChange?.(lens);this.render(true);}
 render(preserve=false){
  const settingsExpanded=[...this.root.querySelectorAll('#page-settings-dialog details[open]')].map(d=>d.className);const scroll=window.scrollY,settingsWasOpen=this.root.querySelector('#page-settings-dialog')?.open,settingsFocus=this.root.querySelector('#page-settings-dialog')?.contains(document.activeElement)?document.activeElement?.id:null;mediaContext({mode:'page',room:this.room,lens:this.lens});if(this.access)this.lens=this.access.lens(this.lens);if(!roomVisible(this.room,this.lens))this.room=Object.keys(ROOMS).find(id=>id!=='family'&&roomEntry(id,this.lens,EDGES).state!=='hidden')??'family';
  const r=viewRoom(ROOMS[this.room],this.lens),presentation=presentationFor(r),access=accessSettings(this.lens),privateRoom=r.visibility==='private'||!permission(r,this.lens).canLook;
  const destinations=Object.entries(ROOMS).filter(([id])=>roomEntry(id,this.lens,EDGES).state!=='hidden');
  mediaContext({mode:'page',room:this.room,lens:this.lens});const pending=this.pending,rights=permission(r,this.lens);this.accessSignature=rights.visible+':'+rights.scope;
  this.root.dataset.theme=presentation.theme;this.root.style.setProperty('--page-accent',presentation.accent);
  this.root.innerHTML=`<header class="page-header"><a href="./">Living Atlas</a><span>Read / explore</span><button id="page-places">Places</button>${this.communityUI?'<button id="page-discover">Discover</button>':''}<button id="page-diagnostics">Diagnostics</button>${this.on3D?'<button id="page-to-3d">Return to 3D</button>':`<a href="?safe&form=3d&room=${encodeURIComponent(this.room)}">Try safe 3D</a>`}</header>
   <nav class="page-lens-bar" aria-label="Reading lens"><button id="page-depth-quick"><small>Depth</small><strong>${esc(this.lens.depth??'Standard')}</strong></button><button id="page-content-quick"><small>Content</small><strong>${esc(appliedPreset(this.lens))}</strong></button><button id="page-layers-quick"><small>Layers</small><strong>${esc(this.lens.layerMode??'Core only')}</strong></button><button id="page-settings-open" aria-label="Open Page settings">⚙<span> Settings</span></button></nav>
   ${this.lens.testMode?'<p class="reason">TEST MODE · simulated identity and access</p>':''}<p class="page-status">${esc(identityBadge(this.lens))} · ${esc(appliedPreset(this.lens))}${access.cap?' · Access ceilings still apply':''}${roomEntry(this.room,this.lens,EDGES).type==='window'?' · View-only connection':''}</p>
   ${this.lens.age===0&&!this.lens.testMode?'<form id="page-setup" class="page-settings"><label>First visit · your age<input name="age" type="number" min="0" max="120" step="1" required inputmode="numeric"></label><button type="submit">Set up reading profile</button><p>Self-reported age never verifies you. Adult settings stay capped at Teen.</p><p id="page-setup-error" role="alert"></p></form>':''}
   <dialog id="page-settings-dialog" class="page-settings-dialog"><header><h2>Your reading view</h2><button id="page-settings-close">Done ×</button></header><p>These controls use the same profile, access and content limits as your walk.</p><section class="page-settings" aria-label="Page lens"><label>Room<select id="page-room">${destinations.map(([id,r])=>`<option value="${id}" ${id===(pending?.id??this.room)?'selected':''}>${esc(roomTitle(r,this.lens))}</option>`).join('')}</select></label><label>Content lens<select id="page-lens">${[...Object.keys(PRESETS),...(this.lens.preset==='Custom'?['Custom']:[])].map(p=>`<option ${p===this.lens.preset?'selected':''}>${p}</option>`).join('')}</select></label><label>Depth<select id="page-depth">${['Glance','Standard','Deep'].map(d=>`<option ${d===(this.lens.depth??'Standard')?'selected':''}>${d}</option>`).join('')}</select></label></section><details class="page-layer-settings"><summary>Layers & type filters</summary>${layerSettings(this.lens)}</details><details class="page-lens-more"><summary>Show me, Trust from & advanced limits</summary><div class="page-settings"><label>Trust from<select id="page-trust">${['Author','Vouched','Academic','Community'].map(t=>`<option ${t===(this.lens.trustFrom??'Author')?'selected':''}>${t}</option>`).join('')}</select></label>${['real','pseudonym','anonymous','agent'].map(k=>`<label><input type="checkbox" data-page-show="${k}" ${this.lens.show[k]?'checked':''}> ${k==='agent'?'Agents (dim only)':k}</label>`).join('')}</div><p>Core author content stays labeled; Trust from filters supporting blocks by their recorded reviews.</p>${DIMENSIONS.map(([k,label])=>`<div class="page-limit"><label>${label}<input data-page-limit="${k}" type="range" min="0" max="3" value="${this.lens.limits[k]}"></label><button data-page-lock="${k}">${this.lens.hard[k]===null?'Soft limit':'Hard limit '+this.lens.hard[k]} · ${this.lens.hard[k]===null?'Lock':'Unlock'}</button></div>`).join('')}</details></dialog>
   ${pending?`<section class="page-preview"><h2>Preview: ${esc(roomTitle(ROOMS[pending.id],this.lens))}</h2><p>${pending.result.reasons.map(esc).join('<br>')||'A doorway connects these places. Confirm to continue.'}</p><button data-enter>Enter this Page</button><button data-stay>Stay here</button></section>`:''}
   ${this.access?'<button id="page-access">Access & room receipts</button>':''}${this.staffUI?'<button id="page-staff">Staff & helpers</button>':''}<article style="--item-accent:${itemStyle(r,this.lens).accent}" data-look="${itemStyle(r,this.lens).preset}">${privateRoom?`<h1>${esc(roomTitle(r,this.lens))}</h1><p>Private space, something is here.</p>`:`${heroHTML(r,this.lens)}${pending?.id===this.room?'<p>Confirm the preview above to read at these limits.</p>':articleHTML(this.room,this.lens,{approved:this.approved.has(this.room),softApproved:this.softApproved})}${experienceHTML(this.room,this.lens)}${r.geo?`<details class="geo-note"><summary>Real-world location · to verify</summary><p>${r.geo.lat}, ${r.geo.lng} · heading ${r.geo.heading}° · approximate elevation ${r.geo.elevation} m</p><p>${esc(r.geo.note??'Approximate reference coordinates; not surveyed.')}</p></details>`:''}`}</article>
   <nav class="page-connections" aria-label="Room connections"><h2>Connections</h2>${EDGES.filter(e=>e.from===this.room&&roomEntry(e.to,this.lens,EDGES).state!=='hidden').map(e=>`<button data-room="${e.to}">${esc(roomTitle(ROOMS[e.to],this.lens))} · ${roomEntry(e.to,this.lens,EDGES).type}</button>`).join('')||'<p>Select another permitted room above.</p>'}</nav>`;
  if(this.communityUI)this.root.querySelector('#page-discover').onclick=()=>this.communityUI.open('board');
  const settings=this.root.querySelector('#page-settings-dialog'),openSettings=part=>{if(!settings.open)settings.showModal();if(part==='layers')settings.querySelector('.page-layer-settings').open=true;if(part==='content')settings.querySelector('#page-lens').focus();if(part==='room')settings.querySelector('#page-room').focus();};
  this.root.querySelector('#page-settings-open').onclick=()=>openSettings();this.root.querySelector('#page-places').onclick=()=>openSettings('room');this.root.querySelector('#page-content-quick').onclick=()=>openSettings('content');this.root.querySelector('#page-layers-quick').onclick=()=>openSettings('layers');this.root.querySelector('#page-settings-close').onclick=()=>settings.close();settings.onclick=event=>{if(event.target===settings)settings.close();};
  this.root.querySelector('#page-depth-quick').onclick=()=>{const depths=['Glance','Standard','Deep'];this.lens.depth=depths[(depths.indexOf(this.lens.depth)+1)%3];this.onLensChange?.(this.lens);this.render(true);};
  bindLayerSettings(this.root,this.lens,lens=>this.experienceChanged(lens));bindExperience(this.root,this.room,this.lens,{peek:(room,layer)=>this.layerUI.peek(room,layer),changed:lens=>this.experienceChanged(lens),message:text=>this.layerUI.ui.toast(text)});
  this.root.querySelector('#page-diagnostics').onclick=()=>{this.diagnostics.panel.hidden=false;document.body.classList.add('diagnostics-open');this.diagnostics.refresh();};
  if(this.staffUI)this.root.querySelector('#page-staff').onclick=()=>this.staffUI.open(this.room);
  if(this.access)this.root.querySelector('#page-access').onclick=()=>this.accessUI.open(this.room);
  this.root.querySelector('#page-room').onchange=e=>{settings.close();this.visit(e.target.value);};
  this.root.querySelector('#page-lens').onchange=e=>{if(e.target.value!=='Custom')setPreset(this.lens,e.target.value);this.changed();};
  this.root.querySelector('#page-depth').onchange=e=>{this.lens.depth=e.target.value;this.onLensChange?.(this.lens);this.render(true);};
  this.root.querySelector('#page-trust').onchange=e=>{this.lens.trustFrom=e.target.value;this.onLensChange?.(this.lens);this.render(true);};
  this.root.querySelectorAll('[data-page-show]').forEach(b=>b.onchange=()=>{this.lens.show[b.dataset.pageShow]=b.checked;this.changed();});
  this.root.querySelectorAll('[data-page-limit]').forEach(b=>b.onchange=()=>{this.lens.limits[b.dataset.pageLimit]=+b.value;this.lens.preset='Custom';this.changed();});
  this.root.querySelectorAll('[data-page-lock]').forEach(b=>b.onclick=()=>{const k=b.dataset.pageLock;this.lens.hard[k]=this.lens.hard[k]===null?this.lens.limits[k]:null;this.lens.preset='Custom';this.changed();});
  this.root.querySelectorAll('[data-room]').forEach(b=>b.onclick=()=>this.visit(b.dataset.room));
  if(pending){this.root.querySelector('[data-enter]').onclick=()=>{this.approved.add(pending.id);this.room=pending.id;this.pending=null;this.visited(this.room);if(pending.goal&&pending.goal!==this.room)this.visit(pending.goal);else this.render();window.scrollTo(0,0);};this.root.querySelector('[data-stay]').onclick=()=>{this.pending=null;if(roomEntry(this.room,this.lens,EDGES).state==='door')this.room='studio';this.render();};}
  if(this.on3D)this.root.querySelector('#page-to-3d').onclick=()=>{this.close();this.on3D(this.room);};
  const setup=this.root.querySelector('#page-setup');if(setup)setup.onsubmit=async e=>{e.preventDefault();try{const age=Number(new FormData(setup).get('age'));if(!Number.isInteger(age)||age<0||age>120)throw new Error('Enter an age from 0 to 120.');const first=!this.profiles?.completed;const updated=await this.onAgeChange?.(age);if(first){this.room='square';this.approved.add('square');}if(updated)this.lens=updated;else{this.lens.age=age;setPreset(this.lens,age<13?'Kids':'Teen');}this.changed();}catch(error){this.root.querySelector('#page-setup-error').textContent=error.message;}};
  this.root.querySelectorAll('.layer-notes').forEach(d=>d.open=innerWidth>=1180);
  this.root.querySelectorAll('.content-block').forEach(section=>{const credit=section.querySelector('.contributor-credit');if(credit){const note=document.createElement('details');note.className='page-layer-note';const summary=document.createElement('summary');summary.textContent=credit.textContent;note.append(summary);while(section.firstChild)note.append(section.firstChild);section.append(note);}});
  bindBlocks(this.root,{related:id=>this.visit(id),allow:id=>{this.softApproved.add(id);this.render(true);}});
  if(settingsWasOpen){openSettings();settingsExpanded.forEach(c=>{const d=settings.querySelector('.'+c);if(d)d.open=true;});if(settingsFocus)this.root.querySelector('#'+settingsFocus)?.focus();}if(preserve)window.scrollTo(0,scroll);this.scrollHandler();
 }
 visited(id){this.onVisit?.(id);this.discovery?.progress({room:id,reading:true});if(this.access&&!this.lens.preview&&permission(ROOMS[id],this.lens).canLook){this.access.use(id,'look',this.lens).catch(()=>this.render(true));this.access.recent(id,this.lens);}}
 visit(id){
  if(!ROOMS[id])return;const result=roomEntry(id,this.lens,EDGES);this.pending=null;
  if(result.state==='hidden'){this.render();return;}
  const route=graphRoute(this.room,id,this.lens),door=route?.find(e=>visibleEdge(e,this.lens).type==='door');
  if(door){this.pending={id:door.to,goal:id,result:visibleEdge(door,this.lens)};this.render();window.scrollTo(0,0);return;}
  if(result.type==='door'&&result.state!=='private'&&!this.approved.has(id)&&this.room!==id){this.pending={id,result};this.render();window.scrollTo(0,0);return;}
  this.room=id;this.visited(id);this.render();window.scrollTo(0,0);
 }

}
export function openFallbackPage(options){const page=new PageRenderer(options);page.open();return page;}
