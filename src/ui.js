import {permission,roomTitle} from './permissions.js';
import {graphEdges,graphRoute} from './navigation.js';
import {articleHTML,bindBlocks} from './block-renderer.js';
import {contentStore,roomEntry} from './content.js';
import {identityBadge,authorName,accessSettings,appliedPreset} from './identity.js';
import {positions,mapTitles,layoutAtlasLabels} from './atlas-layout.js';
import { ROOMS, EDGES, DISTRICTS, DIMENSIONS, PRESETS } from './data.js';
import { visibleEdge, roomVisible, contentScore, setPreset } from './rules.js';
const $=id=>document.getElementById(id);
export const escapeHTML=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const icon={seamless:'≈',door:'∩',embedded:'◎',window:'▧'};
const substanceText={none:'View only · substance locked',suggest:'Suggest changes · author decides',branch:'Fork allowed · original stays intact',open:'Open to substance edits'};
const atlasLabels=layoutAtlasLabels();
const internal=[{id:'map-workbench',from:'studio',to:'workbench',type:'seamless'},{id:'map-family',from:'studio',to:'family',type:'door'}];
export class UI {
  constructor(api){
    this.api=api;this.mode=null;this.sheet=$('sheet');this.content=$('sheet-content');this.lastFocus=null;this.showOthers=false;this.softApproved=new Set();contentStore.subscribe(id=>{if(this.mode==='info'&&this.infoId===id)this.info(id,true);});
    $('sheet-close').onclick=()=>this.close();$('veil').onclick=()=>this.close();
    $('lens-button').onclick=()=>this.lens();$('atlas-button').onclick=()=>this.atlas();$('location').onclick=()=>this.guide();
    $('build-button').onclick=()=>{this.open('build','A work in progress','Build');this.content.innerHTML='<p>First, get to know the place.</p><p>This is a place to explore through your saved lens. Round 2a starts with profiles. Travel and access come in Tier B; audience versions, style controls, and layers come in Tier C.</p><button class="primary" id="explore-again">Keep exploring</button>';$('explore-again').onclick=()=>this.close();};
    $('perf-toggle').onclick=()=>{$('performance').hidden=!$('performance').hidden;};
    $('fullscreen').onclick=async()=>{try{if(document.fullscreenElement)await document.exitFullscreen();else if(document.documentElement.requestFullscreen)await document.documentElement.requestFullscreen();else this.toast('Fullscreen is unavailable in this browser.');}catch{this.toast('Fullscreen was not granted. You can keep exploring.');}};
    document.addEventListener('fullscreenchange',()=>{$('fullscreen').setAttribute('aria-label',document.fullscreenElement?'Exit fullscreen':'Enter fullscreen');});
    document.addEventListener('keydown',e=>{if(e.key==='Escape'){this.close();return;}if(e.key==='Tab'&&this.mode){const nodes=[...this.sheet.querySelectorAll('button:not(:disabled),input,a[href],summary,[tabindex="0"]')].filter(el=>!el.closest('[hidden]'));if(!nodes.length)return;const i=nodes.indexOf(document.activeElement);if(e.shiftKey&&(i<=0)){nodes.at(-1).focus();e.preventDefault();}else if(!e.shiftKey&&(i===nodes.length-1)){nodes[0].focus();e.preventDefault();}}});
  }
  open(mode,eyebrow,title){
    if(!this.mode)this.lastFocus=document.activeElement;
    this.api.pause();this.mode=mode;$('sheet-close').hidden=mode==='setup';$('sheet-title').textContent=title;$('sheet-eyebrow').textContent=eyebrow;this.sheet.hidden=false;$('veil').hidden=false;document.body.classList.add('panel-open');
    for(const id of ['topbar','bottom-bar','joystick','edge-prompt'])$(id).inert=true;
    this.content.scrollTop=0;$('sheet-close').focus({preventScroll:true});this.api.panelChanged?.();
  }
  close(){if(this.mode==='setup'&&!this.api.state().profiles.completed)return;this.mode=null;this.sheet.hidden=true;$('veil').hidden=true;document.body.classList.remove('panel-open');for(const id of ['topbar','bottom-bar','joystick','edge-prompt'])$(id).inert=false;this.lastFocus?.focus?.({preventScroll:true});this.api.pause();this.api.panelChanged?.();}
  toast(message){$('toast').textContent=message;$('toast').classList.add('visible');clearTimeout(this.toastTimer);this.toastTimer=setTimeout(()=>$('toast').classList.remove('visible'),4500);}
  location(context){
    const r=ROOMS[context.room]??ROOMS.studio,d=DISTRICTS[r.district];$('district-name').textContent=context.inside?`Inside: ${context.inside}`:d.name.toUpperCase();$('district-name').style.color=d.color;$('breadcrumb').textContent=r.address.replaceAll('/',' / ');document.querySelector('.district-dot').style.background=d.color;
  }
  fadeTitle(){clearTimeout(this.titleTimer);$('scene-title').classList.add('faded');}
  title(kind){$('scene-title').classList.remove('faded');$('scene-kicker').textContent=kind==='studio'?'01 / MAKERS ROW':'02 / HISTORY QUARTER';$('scene-heading').innerHTML=kind==='studio'?'A place for<br><em>ideas.</em>':'Under the<br><em>canopy.</em>';$('scene-subtitle').textContent=kind==='studio'?'Nic’s Studio · Tallahassee':'Public places. Shared histories.';clearTimeout(this.titleTimer);this.titleTimer=setTimeout(()=>$('scene-title').classList.add('faded'),2400);}
  prompt(edge){const b=$('edge-prompt');if(!edge){b.hidden=true;return;}b.hidden=false;const r=ROOMS[edge.to];b.innerHTML=`${icon[edge.result.type]} &nbsp; ${escapeHTML(roomTitle(r,this.api.state().lens))}<small>${edge.result.reasons.length?escapeHTML(edge.result.reasons[0]):edge.result.type==='seamless'?'Walk through · tap to read':edge.result.type==='window'?'Look through · viewing only':'Tap to preview the crossing'} &nbsp; ↗</small>`;b.onclick=()=>this.edge(edge);}
  lens(keepScroll=false){
    const scroll=keepScroll?this.content.scrollTop:0,l=this.api.state().lens;
    if(!keepScroll)this.open('lens','The world, through your eyes','Your lens');
    const access=accessSettings(l),simulated=`${identityBadge(l)} · Age ${l.age}. ${access.cap?`${access.cap} ceiling applies; self-reported age cannot grant verified access.`:'Verified backing is simulated in this prototype.'}`;
    const results=EDGES.map(e=>visibleEdge(e,l)),hidden=results.filter(r=>r.state==='hidden').length,doors=results.filter(r=>r.type==='door').length;
    this.content.innerHTML=`
      <button id="lens-profiles" class="secondary">Viewing as: ${escapeHTML(l.profileName)} · Switch profile ↗</button>
      <p class="muted">${simulated}</p><p class="summary" aria-live="polite">${hidden} connection${hidden===1?'':'s'} hidden · ${doors} doors in your Atlas.<br>Change the lens. The place changes around you.</p>
      ${l.isAgent?`<span class="section-label">An agent’s view · read-only</span><pre id="agent-view">${escapeHTML(JSON.stringify({visitor:{identity:'agent',preset:l.preset,limits:access.limits,hardLimits:access.hard},rooms:Object.entries(ROOMS).filter(([id,r])=>r.visibility!=='private'&&roomVisible(id,l)&&permission(r,l).canLook).map(([id,r])=>({id:r.id,address:r.address,author:r.author,summary:r.substance.summary,content:r.content,measured:r.measured,permissions:r.permissions})),crossings:EDGES.filter(e=>visibleEdge(e,l).state!=='hidden').map(e=>({from:ROOMS[e.from].id,to:ROOMS[e.to].id,...visibleEdge(e,l)}))},null,2))}</pre>`:''}
      <span class="section-label">Content</span><div class="chips">${Object.keys(PRESETS).map(k=>`<button data-preset="${k}" class="${l.preset===k?'active':''}" aria-pressed="${l.preset===k}">${k}</button>`).join('')}</div>
      <p class="muted">The higher of declared and measured scores governs each crossing.</p>
      <button id="advanced-toggle" class="secondary" aria-expanded="${this.advanced??false}">Advanced · six dimensions ${this.advanced?'−':'＋'}</button>
      <div id="advanced" ${this.advanced?'':'hidden'}>${DIMENSIONS.map(([k,label])=>`<div class="advanced-row"><label for="limit-${k}">${label}</label><output id="value-${k}">${l.limits[k]}</output><input id="limit-${k}" data-limit="${k}" aria-label="${label} limit" type="range" min="0" max="3" step="1" value="${l.limits[k]}"><button data-lock="${k}" class="lock-button ${l.hard[k]!==null?'active':''}" aria-pressed="${l.hard[k]!==null}">${l.hard[k]!==null?'Locked at '+l.hard[k]:'Soft limit'}<br>${l.hard[k]!==null?'Unlock':'Lock here'}</button></div>`).join('')}<p class="muted">Above a soft limit: a preview door. Above a locked limit: no connection. A lock stays at its own value until you unlock it.</p></div>
      <span class="section-label">Show me</span><div class="chips">${[['real','Real names'],['pseudonym','Pseudonyms'],['anonymous','Anonymous'],['agent','Agents']].map(([k,t])=>`<button data-show="${k}" class="${l.show[k]?'active':''}" aria-pressed="${l.show[k]}">${t}${k==='agent'?`<small>${l.show.agent?'Visible':'Dimmed'}</small>`:''}</button>`).join('')}</div><p class="muted">Agents are always visible. Their switch only dims them.</p>
      <span class="section-label">Saved preferences</span><div class="settings-form form-columns"><label>Depth<select data-preference="depth">${['Glance','Standard','Deep'].map(v=>`<option ${l.depth===v?'selected':''}>${v}</option>`).join('')}</select></label><label>Trust from<select data-preference="trustFrom">${['Author','Vouched','Academic','Community'].map(v=>`<option ${l.trustFrom===v?'selected':''}>${v}</option>`).join('')}</select></label><label>Preferred form<select data-preference="form">${[['3d','3D'],['card','Cards'],['page','Page'],['narration','Narrate'],['text','Text']].map(([v,t])=>`<option value="${v}" ${l.form===v?'selected':''}>${t}</option>`).join('')}</select></label><label>Style preference<select data-preference="stylePreset">${['Studio','Documentary','Gallery','Kids'].map(v=>`<option ${l.stylePreset===v?'selected':''}>${v}</option>`).join('')}</select></label></div><p class="muted">Preferences travel with this profile. 3D, cards and Page use the same content. Narration and style controls remain queued.</p><button id="lens-done" class="primary">Walk this version of the world ↗</button>`;
    $('lens-profiles').onclick=()=>this.api.openProfiles();
    this.content.querySelectorAll('[data-preset]').forEach(b=>b.onclick=()=>{setPreset(l,b.dataset.preset);this.lensChange();});
    this.content.querySelectorAll('[data-show]').forEach(b=>b.onclick=()=>{l.show[b.dataset.show]=!l.show[b.dataset.show];this.lensChange();});
    this.content.querySelectorAll('[data-lock]').forEach(b=>b.onclick=()=>{const k=b.dataset.lock;l.hard[k]=l.hard[k]===null?l.limits[k]:null;l.preset='Custom';this.lensChange();});
    this.content.querySelectorAll('[data-limit]').forEach(i=>{i.oninput=()=>{$('value-'+i.dataset.limit).textContent=i.value;};i.onchange=()=>{l.limits[i.dataset.limit]=+i.value;l.preset='Custom';this.lensChange();};});
    this.content.querySelectorAll('[data-preference]').forEach(input=>input.onchange=()=>{l[input.dataset.preference]=input.value;if(input.dataset.preference==='form'&&input.value==='page'){this.api.openPage();return;}this.lensChange();});
    $('advanced-toggle').onclick=()=>{this.advanced=!this.advanced;this.lens(true);};$('lens-done').onclick=()=>this.close();this.content.scrollTop=scroll;
  }
  lensChange(){const old=this.content.scrollTop;this.api.lensChanged();$('lens-badge').textContent=appliedPreset(this.api.state().lens);this.lens(true);this.content.scrollTop=old;}
  info(id,preserve=false){
    const oldScroll=this.content.scrollTop;if(!preserve)this.softApproved.clear();this.infoId=id;
    const r=ROOMS[id];if(!r)return;
    if(r.visibility==='private'||!permission(r,this.api.state().lens).canLook){if(!permission(r,this.api.state().lens).visible){this.close();return;}this.open('info','Boundary','Private space');this.content.innerHTML=`<p>Private space, something is here.</p><p class="address">${escapeHTML(r.address)}</p><button id="boundary-access">Knock / manage access</button>`;$('boundary-access').onclick=()=>this.api.accessRoom(id);return;}
    if(!roomVisible(id,this.api.state().lens)){this.close();return;}
    this.open('info',DISTRICTS[r.district].name,r.title);
    const authors=r.authors??[r.author];const chips=DIMENSIONS.filter(([k])=>contentScore(r,k)>0).map(([k,t])=>`<span class="score-chip">${t} ${contentScore(r,k)}${(r.measured[k]??0)>(r.content[k]??0)?` · declared ${r.content[k]}`:''}</span>`).join('');
    this.content.innerHTML=`<p class="address">${escapeHTML(r.address)}</p><div class="identity">${authors.map(a=>`<span>${escapeHTML(authorName(a))}</span><span class="badge ${a.isAgent?'agent':''}">${escapeHTML(identityBadge(a))}</span>`).join('')}</div>${r.author.isAgent?`<p class="muted">Operated by a verified person: ${r.author.verifiedHuman?'yes':'no'}. Simulated identity.</p>`:''}
      ${articleHTML(id,this.api.state().lens,{approved:this.api.state().approvedRooms?.includes(id),softApproved:this.softApproved})}<div class="chips">${chips||'<span class="score-chip">All six dimensions · 0</span>'}</div>
      ${id==='market'?'<p class="reason">Night Market reads louder than it says: Sensory 2, declared 1.</p>':''}
      <div class="info-grid"><div class="info-box"><small>Substance</small>${substanceText[r.permissions.substance]}</div><div class="info-box"><small>Style</small>${r.permissions.style==='open'?'Restyle your own view':'Author-controlled style'}</div></div>
      <p class="muted">${r.forks.length?`${r.forks.length} seeded fork · `:''}Available now: 3D · this card · Page.<br>Ratings: ${r.district==='history'?'Academic: not reviewed. ':''}Author: sample account · Community: sample · No vouches.</p>
      <button id="info-access" class="secondary">Access & room receipts</button><button id="info-page" class="secondary">Read in Page form</button><button id="info-close" class="primary">Back to the walk</button>`;
    $('info-access').onclick=()=>this.api.accessRoom(id);$('info-close').onclick=()=>this.close();$('info-page').onclick=()=>this.api.openPage(id);
    bindBlocks(this.content,{related:next=>this.api.readRoom(next),allow:block=>{this.softApproved.add(block);this.info(id,true);}});if(preserve)this.content.scrollTop=oldScroll;
  }
  edge(edge){
    const result=visibleEdge(edge,this.api.state().lens);if(result.state==='hidden'){this.toast('This connection is outside your current lens.');return;}
    const room=ROOMS[edge.to];this.open('edge',`${icon[result.type]} ${result.type} crossing`,roomTitle(room,this.api.state().lens));
    this.content.innerHTML=`<p class="address">${escapeHTML(room.address)}</p><p>${result.rights?.canLook?escapeHTML(room.substance?.summary??'Private space, something is here.'):'Private space, something is here.'}</p>
      ${result.reasons.map(r=>`<p class="reason">${escapeHTML(r)}</p>`).join('')}
      ${result.oddness.length?`<p class="summary">Reads differently: ${escapeHTML(result.oddness.join(' · '))}.</p>`:''}
      <p class="muted">${result.type==='window'?'A view-only connection. You can look through and read the card; you cannot cross.':result.type==='embedded'?'Inside the Broadcast booth. The host’s rules also apply here.':result.type==='seamless'?'An open connection. Ground and light blend as you walk through.':result.reasons.length?'Preview this crossing before choosing to enter. Your overall lens stays unchanged.':'A threshold between places. The target owner has approved this connection.'}</p>
      ${result.rights?.canLook?'<button id="edge-read" class="secondary">Read the room card</button>':''}<button id="edge-access" class="secondary">Knock / manage access</button>
      ${edge.travel?'<button id="cancel-route" class="secondary">Cancel route</button>':''}
      ${result.type!=='window'&&result.rights?.canEnter?`<button id="edge-enter" class="primary">${result.type==='seamless'?'Continue walking':`Enter ${escapeHTML(room.title)}`} ↗</button>`:''}`;
    if($('cancel-route'))$('cancel-route').onclick=()=>{this.api.cancelTravel();this.close();};
    if($('edge-read'))$('edge-read').onclick=()=>this.info(edge.to);$('edge-access').onclick=()=>this.api.accessRoom(edge.to);
    if($('edge-enter'))$('edge-enter').onclick=()=>{this.close();if(edge.travel)this.api.enter({...edge,result});else if(result.type==='seamless')this.toast('Follow the open path. No threshold to confirm.');else this.api.enter({...edge,result});};
  }
  atlas(){
    this.open('atlas','A graph, shaped by your lens','Your Atlas');this.renderAtlas();
  }
  renderAtlas(){
    const {lens,context}=this.api.state(),all=graphEdges();let paths='',nodes='';
    const reachable=new Set(['studio']);for(let n=0;n<5;n++)for(const e of all){if(reachable.has(e.from)&&visibleEdge(e,lens).state!=='hidden')reachable.add(e.to);}
    for(const e of all){if(!permission(ROOMS[e.to],lens).visible||!permission(ROOMS[e.from],lens).visible)continue;if(!positions[e.from]||!positions[e.to])continue;const r=visibleEdge(e,lens),[x1,y1]=positions[e.from],[x2,y2]=positions[e.to];const hidden=r.state==='hidden'||!reachable.has(e.from),downgraded=r.type!==e.type;if(hidden&&!this.showOthers)continue;
      const c=hidden?'#627184':r.type==='door'?'#f2bc73':r.type==='embedded'?'#9ebeff':r.type==='window'?'#dfaae5':'#6dd6bf';
      const dash=hidden?'3 7':r.type==='window'?'6 5':'';
      paths+=`<g data-map-edge="${e.id}" role="button" tabindex="0" aria-label="${escapeHTML(ROOMS[e.to].title)} crossing"><path d="M${x1} ${y1} L${x2} ${y2}" stroke="transparent" stroke-width="22"/><path d="M${x1} ${y1} L${x2} ${y2}" stroke="${c}" stroke-width="${r.type==='seamless'?6:2}" stroke-opacity="${hidden?.45:.6}" stroke-dasharray="${dash}"/><text x="${(x1+x2)/2}" y="${(y1+y2)/2}" text-anchor="middle" style="font-size:18px;paint-order:stroke;stroke:#152332;stroke-width:4;fill:${c}">${icon[hidden?e.type:r.type]}</text>${this.showOthers&&downgraded&&!hidden?`<path d="M${x1+5} ${y1} L${x2+5} ${y2}" stroke="#7d8898" stroke-width="2" stroke-dasharray="2 5"/>`:''}</g>`;
    }
    for(const [id,[x,y]] of Object.entries(positions)){
      if(!permission(ROOMS[id],lens).visible)continue;const visible=reachable.has(id);if(!visible&&!this.showOthers)continue;const r=ROOMS[id],color=DISTRICTS[r.district].color,isHere=id===context.room||id==='tallahassee'&&this.api.state().kind==='history'&&context.room==='tallahassee';
      const title=permission(r,lens).canLook?mapTitles[id]:'Private',label=atlasLabels[id];
      nodes+=`<g class="map-node" data-map-node="${id}" role="button" tabindex="0" aria-label="${escapeHTML(r.title)}${visible?'':', hidden'}"><circle cx="${x}" cy="${y}" r="22" fill="transparent"/>${isHere?`<circle cx="${x}" cy="${y}" r="16" fill="none" stroke="#fff" stroke-width="1.5"/>`:''}<circle cx="${x}" cy="${y}" r="${id==='studio'?10:7}" fill="${visible?color:'#465367'}" stroke="${visible?'#d4e4ec':'#8c99a9'}" stroke-width="1.2"/><g class="atlas-label" opacity="${visible?1:.6}"><rect x="${label.x}" y="${label.y}" width="${label.w}" height="${label.h}" rx="5" fill="#122332"/><text x="${label.x+label.w/2}" y="${label.y+15}" text-anchor="middle">${title}</text></g></g>`;
    }
    const places=this.api.state().access?.places(lens)??{pins:[],recent:[]};
    const list=(ids)=>ids.filter(id=>ROOMS[id]&&roomEntry(id,lens,EDGES).state!=='hidden').map(id=>`<button data-place="${id}">${escapeHTML(roomTitle(ROOMS[id],lens))}</button>`).join('')||'<span class="muted">No places yet.</span>';
    this.content.innerHTML=`<form id="atlas-address" class="address-form"><label>Room address<input name="address" placeholder="tlh/tallahassee/1956" autocapitalize="off" spellcheck="false" required></label><button type="submit">Go</button></form><div class="atlas-saved"><button id="atlas-home">⌂ Home</button><details><summary>Pins</summary>${list(places.pins)}</details><details><summary>Recent places</summary>${list(places.recent)}</details></div>
      <div class="row"><label for="show-others">Show what others see</label><button id="show-others" role="switch" aria-checked="${this.showOthers}" class="${this.showOthers?'active':''}">${this.showOthers?'On':'Off'}</button></div><p class="muted">Tap a place to travel or set a waypoint. Doors still stop your route. Unknown hidden rooms are never revealed.</p><div class="map-wrap"><svg id="atlas-map" viewBox="0 0 440 660" aria-label="Room graph" role="group">${paths}${nodes}</svg></div><div class="legend"><span data-symbol="≈">Seamless</span><span data-symbol="∩">Door</span><span data-symbol="◎">Embedded</span><span data-symbol="▧">Window</span></div><details class="atlas-directory"><summary>Places & access</summary>${list(Object.keys(ROOMS))}</details><div id="map-detail" aria-live="polite">You are in ${escapeHTML(roomTitle(ROOMS[context.room],lens))}.</div>`;
    $('atlas-address').onsubmit=e=>{e.preventDefault();this.api.address(new FormData(e.currentTarget).get('address'));};$('atlas-home').onclick=()=>{this.close();this.api.travel('studio');};
    this.content.querySelectorAll('[data-place]').forEach(b=>b.onclick=()=>this.mapRoom(b.dataset.place));
    $('show-others').onclick=()=>{this.showOthers=!this.showOthers;this.renderAtlas();};
    this.content.querySelectorAll('[data-map-edge]').forEach(el=>{const select=()=>this.mapRoom(all.find(e=>e.id===el.dataset.mapEdge).to);el.onclick=select;el.onkeydown=e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();select();}};});
    this.content.querySelectorAll('[data-map-node]').forEach(el=>{const select=()=>this.mapRoom(el.dataset.mapNode);el.onclick=select;el.onkeydown=e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();select();}};});
  }
  mapRoom(id){
    const {lens,context,access}=this.api.state(),r=ROOMS[id],result=roomEntry(id,lens,EDGES),rights=permission(r,lens);if(!rights.visible)return;
    const route=graphRoute(context.room,id,lens),canGo=route!==null&&result.state!=='hidden',pinned=access?.places(lens).pins.includes(id);
    $('map-detail').innerHTML=`<strong>${escapeHTML(roomTitle(r,lens))}</strong><p>${result.state==='hidden'?'Hidden by this lens':result.type} · ${escapeHTML(result.reasons.join(' · ')||result.oddness?.join(' · ')||'Within your lens')}</p>
      ${canGo?'<button id="map-travel" class="primary">Travel here</button><button id="map-waypoint">Set waypoint</button>':''}
      ${result.state!=='hidden'&&rights.canLook?'<button id="map-read-page" class="secondary">Read in Page form</button>':''}
      ${result.state!=='hidden'?`<button id="map-access">${rights.canLook?'Access & receipts':'Knock'}</button>`:''}
      ${canGo?`<button id="map-pin">${pinned?'Unpin':'Pin this place'}</button>`:''}`;
    if($('map-travel'))$('map-travel').onclick=()=>{this.close();this.api.travel(id);};if($('map-waypoint'))$('map-waypoint').onclick=()=>{this.api.waypoint(id);this.close();};if($('map-read-page'))$('map-read-page').onclick=()=>this.api.openPage(id);if($('map-access'))$('map-access').onclick=()=>this.api.accessRoom(id);if($('map-pin'))$('map-pin').onclick=()=>{access.pin(id,lens);this.mapRoom(id);};$('map-detail').scrollIntoView({block:'nearest',behavior:'smooth'});
  }
  guide(){
    this.open('guide','The first walk','Welcome to the studio');this.content.innerHTML=`<p>Left thumb to walk. Drag the scene with your right thumb to look. Tap an object or a glowing threshold to explore.</p><div class="info-box"><small>Find your way</small>Straight ahead: the amber door to Tallahassee.<br>Left: Silver and the workbench.<br>Right: the view-only lab window.<br>Along the left side: the blue listening booth.<br>Follow the green path right to the Commons and Night Market.</div><p class="muted">Try Unverified visitor, then Child in the profile switcher. Built-in profiles show TEST MODE. Open the Atlas to see which connections changed. The small ◈ button below reveals frame rate and draw calls.</p><button class="primary" id="guide-close">Let’s walk</button><button class="secondary" id="return-home">Return to studio entrance</button>`;$('guide-close').onclick=()=>this.close();$('return-home').onclick=()=>{this.close();this.api.home();};
  }
  performance({fps,calls,ratio,kind,level}){if($('performance').hidden)return;$('performance').textContent=`${Math.round(fps)} fps  ·  ${calls} draws\n${kind==='studio'?'Studio':'Tallahassee'} · DPR ${ratio.toFixed(2)}\n${level??''}\n60 fps target · measured here`;}
}
