import {positions,mapTitles,layoutAtlasLabels} from './atlas-layout.js';
import { ROOMS, EDGES, DISTRICTS, DIMENSIONS, PRESETS } from './data.js';
import { visibleEdge, crossing, roomVisible, contentScore, presetForIdentity, setPreset } from './rules.js';
const $=id=>document.getElementById(id);
export const escapeHTML=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const icon={seamless:'≈',door:'∩',embedded:'◎',window:'▧'};
const tierText={verified:'✓ Verified person',named:'Named',anonymous:'Anonymous',agent:'◇ Agent'};
const substanceText={none:'View only · substance locked',suggest:'Suggest changes · author decides',branch:'Fork allowed · original stays intact',open:'Open to substance edits'};
const atlasLabels=layoutAtlasLabels();
const internal=[{id:'map-workbench',from:'studio',to:'workbench',type:'seamless'},{id:'map-family',from:'studio',to:'family',type:'door'}];
export class UI {
  constructor(api){
    this.api=api;this.mode=null;this.sheet=$('sheet');this.content=$('sheet-content');this.lastFocus=null;this.showOthers=false;
    $('sheet-close').onclick=()=>this.close();$('veil').onclick=()=>this.close();
    $('lens-button').onclick=()=>this.lens();$('atlas-button').onclick=()=>this.atlas();$('location').onclick=()=>this.guide();
    $('build-button').onclick=()=>{this.open('build','A work in progress','Build');this.content.innerHTML='<p>First, get to know the place.</p><p>Tier 1 is about walking, looking, and choosing your lens. Style, substance edits, and connection proposals arrive in tier 2, after the walk feels right.</p><button class="primary" id="explore-again">Keep exploring</button>';$('explore-again').onclick=()=>this.close();};
    $('perf-toggle').onclick=()=>{$('performance').hidden=!$('performance').hidden;};
    $('fullscreen').onclick=async()=>{try{if(document.fullscreenElement)await document.exitFullscreen();else if(document.documentElement.requestFullscreen)await document.documentElement.requestFullscreen();else this.toast('Fullscreen is unavailable in this browser.');}catch{this.toast('Fullscreen was not granted. You can keep exploring.');}};
    document.addEventListener('fullscreenchange',()=>{$('fullscreen').setAttribute('aria-label',document.fullscreenElement?'Exit fullscreen':'Enter fullscreen');});
    document.addEventListener('keydown',e=>{if(e.key==='Escape'){this.close();return;}if(e.key==='Tab'&&this.mode){const nodes=[...this.sheet.querySelectorAll('button:not(:disabled),input,a[href],summary,[tabindex="0"]')].filter(el=>!el.closest('[hidden]'));if(!nodes.length)return;const i=nodes.indexOf(document.activeElement);if(e.shiftKey&&(i<=0)){nodes.at(-1).focus();e.preventDefault();}else if(!e.shiftKey&&(i===nodes.length-1)){nodes[0].focus();e.preventDefault();}}});
  }
  open(mode,eyebrow,title){
    if(!this.mode)this.lastFocus=document.activeElement;
    this.api.pause();this.mode=mode;$('sheet-title').textContent=title;$('sheet-eyebrow').textContent=eyebrow;this.sheet.hidden=false;$('veil').hidden=false;document.body.classList.add('panel-open');
    for(const id of ['topbar','bottom-bar','joystick','edge-prompt'])$(id).inert=true;
    this.content.scrollTop=0;$('sheet-close').focus({preventScroll:true});
  }
  close(){this.mode=null;this.sheet.hidden=true;$('veil').hidden=true;document.body.classList.remove('panel-open');for(const id of ['topbar','bottom-bar','joystick','edge-prompt'])$(id).inert=false;this.lastFocus?.focus?.({preventScroll:true});this.api.pause();}
  toast(message){$('toast').textContent=message;$('toast').classList.add('visible');clearTimeout(this.toastTimer);this.toastTimer=setTimeout(()=>$('toast').classList.remove('visible'),4500);}
  location(context){
    const r=ROOMS[context.room]??ROOMS.studio,d=DISTRICTS[r.district];$('district-name').textContent=context.inside?`Inside: ${context.inside}`:d.name.toUpperCase();$('district-name').style.color=d.color;$('breadcrumb').textContent=r.address.replaceAll('/',' / ');document.querySelector('.district-dot').style.background=d.color;
  }
  title(kind){$('scene-title').classList.remove('faded');$('scene-kicker').textContent=kind==='studio'?'01 / MAKERS ROW':'02 / HISTORY QUARTER';$('scene-heading').innerHTML=kind==='studio'?'A place for<br><em>ideas.</em>':'Under the<br><em>canopy.</em>';$('scene-subtitle').textContent=kind==='studio'?'Nic’s Studio · Tallahassee':'Public places. Shared histories.';clearTimeout(this.titleTimer);this.titleTimer=setTimeout(()=>$('scene-title').classList.add('faded'),10000);}
  prompt(edge){const b=$('edge-prompt');if(!edge){b.hidden=true;return;}b.hidden=false;const r=ROOMS[edge.to];b.innerHTML=`${icon[edge.result.type]} &nbsp; ${escapeHTML(r.title)}<small>${edge.result.reasons.length?escapeHTML(edge.result.reasons[0]):edge.result.type==='seamless'?'Walk through · tap to read':edge.result.type==='window'?'Look through · viewing only':'Tap to preview the crossing'} &nbsp; ↗</small>`;b.onclick=()=>this.edge(edge);}
  lens(keepScroll=false){
    const scroll=keepScroll?this.content.scrollTop:0,l=this.api.state().lens;
    if(!keepScroll)this.open('lens','The world, through your eyes','Your lens');
    const viewChoices=[['me','Me'],['verified','Verified adult'],['visitor','Unverified visitor'],['child','Child'],['agent','An agent']];
    const simulated=l.viewAs==='me'?'Me is an unverified adult in this prototype. No identity is checked.':l.viewAs==='verified'?'Simulated verified adult · not real identity verification.':l.viewAs==='child'?'Simulated age 10 · Kids preset. Age rules still apply if you change content settings.':l.viewAs==='agent'?'Structured room and crossing records below show what an AI visitor reads.':'Simulated unverified adult · Teen content preset.';
    const results=EDGES.map(e=>visibleEdge(e,l)),hidden=results.filter(r=>r.state==='hidden').length,doors=results.filter(r=>r.type==='door').length;
    this.content.innerHTML=`
      <span class="section-label">View as</span><div class="chips">${viewChoices.map(([k,t])=>`<button data-view="${k}" class="${l.viewAs===k?'active':''}" aria-pressed="${l.viewAs===k}">${t}</button>`).join('')}</div>
      <p class="muted">${simulated}</p><p class="summary" aria-live="polite">${hidden} connection${hidden===1?'':'s'} hidden · ${doors} doors in your Atlas.<br>Change the lens. The place changes around you.</p>
      ${l.viewAs==='agent'?`<span class="section-label">An agent’s view · read-only</span><pre id="agent-view">${escapeHTML(JSON.stringify({visitor:{identity:'agent',preset:l.preset,limits:l.limits,hardLimits:l.hard},rooms:Object.entries(ROOMS).filter(([id,r])=>r.visibility!=='private'&&roomVisible(id,l)).map(([id,r])=>({id:r.id,address:r.address,author:r.author,summary:r.substance.summary,content:r.content,measured:r.measured,permissions:r.permissions})),crossings:EDGES.filter(e=>visibleEdge(e,l).state!=='hidden').map(e=>({from:ROOMS[e.from].id,to:ROOMS[e.to].id,...visibleEdge(e,l)}))},null,2))}</pre>`:''}
      <span class="section-label">Content</span><div class="chips">${Object.keys(PRESETS).map(k=>`<button data-preset="${k}" class="${l.preset===k?'active':''}" aria-pressed="${l.preset===k}">${k}</button>`).join('')}</div>
      <p class="muted">The higher of declared and measured scores governs each crossing.</p>
      <button id="advanced-toggle" class="secondary" aria-expanded="${this.advanced??false}">Advanced · six dimensions ${this.advanced?'−':'＋'}</button>
      <div id="advanced" ${this.advanced?'':'hidden'}>${DIMENSIONS.map(([k,label])=>`<div class="advanced-row"><label for="limit-${k}">${label}</label><output id="value-${k}">${l.limits[k]}</output><input id="limit-${k}" data-limit="${k}" aria-label="${label} limit" type="range" min="0" max="3" step="1" value="${l.limits[k]}"><button data-lock="${k}" class="lock-button ${l.hard[k]!==null?'active':''}" aria-pressed="${l.hard[k]!==null}">${l.hard[k]!==null?'Locked at '+l.hard[k]:'Soft limit'}<br>${l.hard[k]!==null?'Unlock':'Lock here'}</button></div>`).join('')}<p class="muted">Above a soft limit: a preview door. Above a locked limit: no connection. A lock stays at its own value until you unlock it.</p></div>
      <span class="section-label">Show me</span><div class="chips">${[['verified','Verified'],['named','Named'],['anonymous','Anonymous'],['agent','Agents']].map(([k,t])=>`<button data-show="${k}" class="${l.show[k]?'active':''}" aria-pressed="${l.show[k]}">${t}${k==='agent'?`<small>${l.show.agent?'Visible':'Dimmed'}</small>`:''}</button>`).join('')}</div><p class="muted">Agents are always visible. Their switch only dims them.</p>
      <button id="lens-done" class="primary">Walk this version of the world ↗</button>`;
    this.content.querySelectorAll('[data-view]').forEach(b=>b.onclick=()=>{presetForIdentity(l,b.dataset.view);this.lensChange();});
    this.content.querySelectorAll('[data-preset]').forEach(b=>b.onclick=()=>{setPreset(l,b.dataset.preset);this.lensChange();});
    this.content.querySelectorAll('[data-show]').forEach(b=>b.onclick=()=>{l.show[b.dataset.show]=!l.show[b.dataset.show];this.lensChange();});
    this.content.querySelectorAll('[data-lock]').forEach(b=>b.onclick=()=>{const k=b.dataset.lock;l.hard[k]=l.hard[k]===null?l.limits[k]:null;l.preset='Custom';this.lensChange();});
    this.content.querySelectorAll('[data-limit]').forEach(i=>{i.oninput=()=>{$('value-'+i.dataset.limit).textContent=i.value;};i.onchange=()=>{l.limits[i.dataset.limit]=+i.value;l.preset='Custom';this.lensChange();};});
    $('advanced-toggle').onclick=()=>{this.advanced=!this.advanced;this.lens(true);};$('lens-done').onclick=()=>this.close();this.content.scrollTop=scroll;
  }
  lensChange(){const old=this.content.scrollTop;this.api.lensChanged();$('lens-badge').textContent=this.api.state().lens.preset;this.lens(true);this.content.scrollTop=old;}
  info(id){
    const r=ROOMS[id];if(!r)return;
    if(r.visibility==='private'){this.open('info','Boundary','Private space');this.content.innerHTML='<p>Private space, something is here.</p><p class="address">tlh/studio/family</p>';return;}
    if(!roomVisible(id,this.api.state().lens))return;
    this.open('info',DISTRICTS[r.district].name,r.title);
    const authors=r.authors??[r.author];const chips=DIMENSIONS.filter(([k])=>contentScore(r,k)>0).map(([k,t])=>`<span class="score-chip">${t} ${contentScore(r,k)}${(r.measured[k]??0)>(r.content[k]??0)?` · declared ${r.content[k]}`:''}</span>`).join('');
    this.content.innerHTML=`<p class="address">${escapeHTML(r.address)}</p><div class="identity">${authors.map(a=>`<span>${escapeHTML(a.name)}</span><span class="badge ${a.isAgent?'agent':''}">${tierText[a.tier]}</span>`).join('')}</div>${r.author.isAgent?`<p class="muted">Operated by a verified person: ${r.author.verifiedHuman?'yes':'no'}. Simulated identity.</p>`:''}
      <p>${escapeHTML(r.substance.summary)}</p><div class="chips">${chips||'<span class="score-chip">All six dimensions · 0</span>'}</div>
      ${id==='market'?'<p class="reason">Night Market reads louder than it says: Sensory 2, declared 1.</p>':''}
      <div class="info-grid"><div class="info-box"><small>Substance</small>${substanceText[r.permissions.substance]}</div><div class="info-box"><small>Style</small>${r.permissions.style==='open'?'Restyle your own view':'Author-controlled style'}</div></div>
      <p class="muted">${r.forks.length?`${r.forks.length} seeded fork · `:''}Available now: 3D scene · this info card.<br>Ratings: ${r.district==='history'?'Academic: not reviewed. ':''}Author: sample account · Community: sample · No vouches.</p>
      ${r.substance.claims.map(c=>`<div class="info-box"><small>${escapeHTML(c.text)}</small><a href="${escapeHTML(c.source)}" target="_blank" rel="noopener noreferrer">${escapeHTML(new URL(c.source).hostname)} ↗</a></div>`).join('')}
      <button id="info-close" class="primary">Back to the walk</button>`;
    $('info-close').onclick=()=>this.close();
  }
  edge(edge){
    const result=visibleEdge(edge,this.api.state().lens);if(result.state==='hidden'){this.toast('This connection is outside your current lens.');return;}
    const room=ROOMS[edge.to];this.open('edge',`${icon[result.type]} ${result.type} crossing`,room.title);
    this.content.innerHTML=`<p class="address">${escapeHTML(room.address)}</p><p>${escapeHTML(room.substance.summary)}</p>
      ${result.reasons.map(r=>`<p class="reason">${escapeHTML(r)}</p>`).join('')}
      ${result.oddness.length?`<p class="summary">Reads differently: ${escapeHTML(result.oddness.join(' · '))}.</p>`:''}
      <p class="muted">${result.type==='window'?'A view-only connection. You can look through and read the card; you cannot cross.':result.type==='embedded'?'Inside the Broadcast booth. The host’s rules also apply here.':result.type==='seamless'?'An open connection. Ground and light blend as you walk through.':result.reasons.length?'Preview this crossing before choosing to enter. Your overall lens stays unchanged.':'A threshold between places. The target owner has approved this connection.'}</p>
      <button id="edge-read" class="secondary">Read the room card</button>
      ${result.type!=='window'?`<button id="edge-enter" class="primary">${result.type==='seamless'?'Continue walking':`Enter ${escapeHTML(room.title)}`} ↗</button>`:''}`;
    $('edge-read').onclick=()=>this.info(edge.to);
    if($('edge-enter'))$('edge-enter').onclick=()=>{this.close();if(result.type==='seamless')this.toast('Follow the open path. No threshold to confirm.');else this.api.enter({...edge,result});};
  }
  atlas(){
    this.open('atlas','A graph, shaped by your lens','Your Atlas');this.renderAtlas();
  }
  renderAtlas(){
    const {lens,context}=this.api.state(),all=[...EDGES,...internal];let paths='',nodes='';
    const reachable=new Set(['studio']);for(let n=0;n<5;n++)for(const e of all){if(reachable.has(e.from)&&visibleEdge(e,lens).state!=='hidden')reachable.add(e.to);}
    for(const e of all){if(!positions[e.from]||!positions[e.to])continue;const r=visibleEdge(e,lens),[x1,y1]=positions[e.from],[x2,y2]=positions[e.to];const hidden=r.state==='hidden'||!reachable.has(e.from),downgraded=r.type!==e.type;if(hidden&&!this.showOthers)continue;
      const c=hidden?'#627184':r.type==='door'?'#f2bc73':r.type==='embedded'?'#9ebeff':r.type==='window'?'#dfaae5':'#6dd6bf';
      const dash=hidden?'3 7':r.type==='window'?'6 5':'';
      paths+=`<g data-map-edge="${e.id}" role="button" tabindex="0" aria-label="${escapeHTML(ROOMS[e.to].title)} crossing"><path d="M${x1} ${y1} L${x2} ${y2}" stroke="transparent" stroke-width="22"/><path d="M${x1} ${y1} L${x2} ${y2}" stroke="${c}" stroke-width="${r.type==='seamless'?6:2}" stroke-opacity="${hidden?.45:.6}" stroke-dasharray="${dash}"/><text x="${(x1+x2)/2}" y="${(y1+y2)/2}" text-anchor="middle" style="font-size:18px;paint-order:stroke;stroke:#152332;stroke-width:4;fill:${c}">${icon[hidden?e.type:r.type]}</text>${this.showOthers&&downgraded&&!hidden?`<path d="M${x1+5} ${y1} L${x2+5} ${y2}" stroke="#7d8898" stroke-width="2" stroke-dasharray="2 5"/>`:''}</g>`;
    }
    for(const [id,[x,y]] of Object.entries(positions)){
      const visible=reachable.has(id);if(!visible&&!this.showOthers)continue;const r=ROOMS[id],color=DISTRICTS[r.district].color,isHere=id===context.room||id==='tallahassee'&&this.api.state().kind==='history'&&context.room==='tallahassee';
      const title=mapTitles[id],label=atlasLabels[id];
      nodes+=`<g class="map-node" data-map-node="${id}" role="button" tabindex="0" aria-label="${escapeHTML(r.title)}${visible?'':', hidden'}"><circle cx="${x}" cy="${y}" r="22" fill="transparent"/>${isHere?`<circle cx="${x}" cy="${y}" r="16" fill="none" stroke="#fff" stroke-width="1.5"/>`:''}<circle cx="${x}" cy="${y}" r="${id==='studio'?10:7}" fill="${visible?color:'#465367'}" stroke="${visible?'#d4e4ec':'#8c99a9'}" stroke-width="1.2"/><g class="atlas-label" opacity="${visible?1:.6}"><rect x="${label.x}" y="${label.y}" width="${label.w}" height="${label.h}" rx="5" fill="#122332"/><text x="${label.x+label.w/2}" y="${label.y+15}" text-anchor="middle">${title}</text></g></g>`;
    }
    this.content.innerHTML=`<div class="row"><label for="show-others">Show what others see</label><button id="show-others" role="switch" aria-checked="${this.showOthers}" class="${this.showOthers?'active':''}">${this.showOthers?'On':'Off'}</button></div><p class="muted">Faint connections show what your lens hides or changes. Tap a line or a place for its reason.</p><div class="map-wrap"><svg id="atlas-map" viewBox="0 0 440 660" aria-label="Room graph" role="group">${paths}${nodes}</svg></div><div class="legend"><span data-symbol="≈">Seamless</span><span data-symbol="∩">Door</span><span data-symbol="◎">Embedded</span><span data-symbol="▧">Window</span></div><div id="map-detail" aria-live="polite">You are in ${escapeHTML(ROOMS[context.room].title)}. The map shows connections, not walking distances.</div>`;
    $('show-others').onclick=()=>{this.showOthers=!this.showOthers;this.renderAtlas();};
    const selectEdge=e=>{const r=visibleEdge(e,lens);$('map-detail').innerHTML=`<strong>${escapeHTML(ROOMS[e.from].title)} → ${escapeHTML(ROOMS[e.to].title)}</strong><br>${r.state==='hidden'?'Hidden':r.type!==e.type?`${e.type} → ${r.type}`:r.type} · ${escapeHTML(r.reasons.join(' · ')||r.oddness.join(' · ')||'Within your lens')}`;};
    this.content.querySelectorAll('[data-map-edge]').forEach(el=>{const select=()=>selectEdge(all.find(e=>e.id===el.dataset.mapEdge));el.onclick=select;el.onkeydown=e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();select();}};});
    this.content.querySelectorAll('[data-map-node]').forEach(el=>{const select=()=>{const id=el.dataset.mapNode,e=all.find(e=>e.to===id);if(e)selectEdge(e);else $('map-detail').textContent=ROOMS[id].title+' · Your homestead root';};el.onclick=select;el.onkeydown=e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();select();}};});
  }
  guide(){
    this.open('guide','The first walk','Welcome to the studio');this.content.innerHTML=`<p>Left thumb to walk. Drag the scene with your right thumb to look. Tap an object or a glowing threshold to explore.</p><div class="info-box"><small>Find your way</small>Straight ahead: the amber door to Tallahassee.<br>Left: Silver and the workbench.<br>Right: the view-only lab window.<br>Along the left side: the blue listening booth.<br>Follow the green path right to the Commons and Night Market.</div><p class="muted">Try Teen, then Child in Your lens. Open the Atlas to see which connections changed. The small ◈ button below reveals frame rate and draw calls.</p><button class="primary" id="guide-close">Let’s walk</button><button class="secondary" id="return-home">Return to studio entrance</button>`;$('guide-close').onclick=()=>this.close();$('return-home').onclick=()=>{this.close();this.api.home();};
  }
  performance({fps,calls,ratio,kind}){if($('performance').hidden)return;$('performance').textContent=`${Math.round(fps)} fps  ·  ${calls} draws\n${kind==='studio'?'Studio':'Tallahassee'} · DPR ${ratio.toFixed(2)}\n60 fps target · measured here`;}
}
