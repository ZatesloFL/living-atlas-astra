// Independent reading surface: no engine, world geometry, controls or 3D UI imports.
import {ROOMS,EDGES,PRESETS,DIMENSIONS,createLens} from './data.js';
import {roomVisible,setPreset} from './rules.js';
import {roomEntry,contentStore} from './content.js';
import {identityBadge,accessSettings,appliedPreset} from './identity.js';
import {esc,articleHTML,bindBlocks} from './block-renderer.js';
export class PageRenderer {
 constructor({lens,room='studio',onLensChange,onAgeChange,on3D,onVisit,diagnostics,approvedRooms=[]}={}){
  this.lens=lens??{...createLens(),age:0,identity:{display:'anonymous',backing:'none'}};this.room='studio';this.initialRoom=room;this.onLensChange=onLensChange;this.onAgeChange=onAgeChange;this.on3D=on3D;this.onVisit=onVisit;this.diagnostics=diagnostics;this.approved=new Set(['studio',...approvedRooms]);this.softApproved=new Set();
  this.root=document.getElementById('page-form')||document.createElement('main');this.root.id='page-form';if(!this.root.parentNode)document.body.append(this.root);this.root.hidden=true;
  this.unsubscribe=contentStore.subscribe(id=>{if(id===this.room&&!this.root.hidden)this.render(true);});
 }
 open(room=this.initialRoom){document.body.classList.add('page-mode');this.root.hidden=false;document.getElementById('loading')?.classList.add('done');document.getElementById('sheet')?.setAttribute('hidden','');document.getElementById('veil')?.setAttribute('hidden','');document.body.classList.remove('panel-open');this.visit(ROOMS[room]?room:'studio');}
 close(){this.root.hidden=true;document.body.classList.remove('page-mode');this.unsubscribe?.();}
 changed(){this.approved.clear();this.approved.add('studio');this.softApproved.clear();this.onLensChange?.(this.lens);this.visit(this.room);}
 render(preserve=false){
  const scroll=window.scrollY;if(!roomVisible(this.room,this.lens))this.room=Object.keys(ROOMS).find(id=>id!=='family'&&roomEntry(id,this.lens,EDGES).state!=='hidden')??'family';
  const r=ROOMS[this.room],access=accessSettings(this.lens),privateRoom=r.visibility==='private';
  const destinations=Object.entries(ROOMS).filter(([id])=>roomEntry(id,this.lens,EDGES).state!=='hidden');
  const pending=this.pending;
  this.root.innerHTML=`<header class="page-header"><a href="./">Living Atlas</a><span>Page form</span>${this.on3D?'<button id="page-to-3d">Return to 3D</button>':`<a href="?safe&form=3d&room=${encodeURIComponent(this.room)}">Try safe 3D</a>`}</header>
   <section class="page-settings" aria-label="Page lens"><label>Room<select id="page-room">${destinations.map(([id,r])=>`<option value="${id}" ${id===(pending?.id??this.room)?'selected':''}>${esc(r.title)}</option>`).join('')}</select></label><label>Content lens<select id="page-lens">${[...Object.keys(PRESETS),...(this.lens.preset==='Custom'?['Custom']:[])].map(p=>`<option ${p===this.lens.preset?'selected':''}>${p}</option>`).join('')}</select></label><label>Depth<select id="page-depth">${['Glance','Standard','Deep'].map(d=>`<option ${d===(this.lens.depth??'Standard')?'selected':''}>${d}</option>`).join('')}</select></label></section>
   ${this.lens.testMode?'<p class="reason">TEST MODE · simulated identity and access</p>':''}<p class="page-status">${esc(identityBadge(this.lens))} · ${esc(appliedPreset(this.lens))}${access.cap?' · Access ceilings still apply':''}${roomEntry(this.room,this.lens,EDGES).type==='window'?' · View-only connection':''}</p>
   ${this.lens.age===0&&!this.lens.testMode?'<form id="page-setup" class="page-settings"><label>First visit · your age<input name="age" type="number" min="0" max="120" step="1" required inputmode="numeric"></label><button type="submit">Set up reading profile</button><p>Self-reported age never verifies you. Adult settings stay capped at Teen.</p><p id="page-setup-error" role="alert"></p></form>':''}
   <details class="page-lens-more"><summary>Show me, Trust from & advanced limits</summary><div class="page-settings"><label>Trust from<select id="page-trust">${['Author','Vouched','Academic','Community'].map(t=>`<option ${t===(this.lens.trustFrom??'Author')?'selected':''}>${t}</option>`).join('')}</select></label>${['real','pseudonym','anonymous','agent'].map(k=>`<label><input type="checkbox" data-page-show="${k}" ${this.lens.show[k]?'checked':''}> ${k==='agent'?'Agents (dim only)':k}</label>`).join('')}</div><p>Core author content stays labeled; Trust from filters supporting blocks by their recorded reviews.</p>${DIMENSIONS.map(([k,label])=>`<div class="page-limit"><label>${label}<input data-page-limit="${k}" type="range" min="0" max="3" value="${this.lens.limits[k]}"></label><button data-page-lock="${k}">${this.lens.hard[k]===null?'Soft limit':'Hard limit '+this.lens.hard[k]} · ${this.lens.hard[k]===null?'Lock':'Unlock'}</button></div>`).join('')}</details>
   ${pending?`<section class="page-preview"><h2>Preview: ${esc(ROOMS[pending.id].title)}</h2><p>${pending.result.reasons.map(esc).join('<br>')||'A doorway connects these places. Confirm to continue.'}</p><button data-enter>Enter this Page</button><button data-stay>Stay here</button></section>`:''}
   <article><p class="address">${esc(r.address)}</p><h1>${esc(r.title)}</h1>${privateRoom?'<p>Private space, something is here.</p>':`${r.author?`<p class="page-author">${esc(r.author.name)} · ${esc(identityBadge(r.author))}</p>`:''}${pending?.id===this.room?'<p>Confirm the preview above to read at these limits.</p>':articleHTML(this.room,this.lens,{approved:this.approved.has(this.room),softApproved:this.softApproved})}${r.geo?`<details class="geo-note"><summary>Real-world location · to verify</summary><p>${r.geo.lat}, ${r.geo.lng} · heading ${r.geo.heading}° · approximate elevation ${r.geo.elevation} m</p><p>${esc(r.geo.note??'Approximate reference coordinates; not surveyed.')}</p></details>`:''}`}</article>
   <nav class="page-connections" aria-label="Room connections"><h2>Connections</h2>${EDGES.filter(e=>e.from===this.room&&roomEntry(e.to,this.lens,EDGES).state!=='hidden').map(e=>`<button data-room="${e.to}">${esc(ROOMS[e.to].title)} · ${roomEntry(e.to,this.lens,EDGES).type}</button>`).join('')||'<p>Select another permitted room above.</p>'}</nav>`;
  this.root.querySelector('#page-room').onchange=e=>this.visit(e.target.value);
  this.root.querySelector('#page-lens').onchange=e=>{if(e.target.value!=='Custom')setPreset(this.lens,e.target.value);this.changed();};
  this.root.querySelector('#page-depth').onchange=e=>{this.lens.depth=e.target.value;this.onLensChange?.(this.lens);this.render(true);};
  this.root.querySelector('#page-trust').onchange=e=>{this.lens.trustFrom=e.target.value;this.onLensChange?.(this.lens);this.render(true);};
  this.root.querySelectorAll('[data-page-show]').forEach(b=>b.onchange=()=>{this.lens.show[b.dataset.pageShow]=b.checked;this.changed();});
  this.root.querySelectorAll('[data-page-limit]').forEach(b=>b.onchange=()=>{this.lens.limits[b.dataset.pageLimit]=+b.value;this.lens.preset='Custom';this.changed();});
  this.root.querySelectorAll('[data-page-lock]').forEach(b=>b.onclick=()=>{const k=b.dataset.pageLock;this.lens.hard[k]=this.lens.hard[k]===null?this.lens.limits[k]:null;this.lens.preset='Custom';this.changed();});
  this.root.querySelectorAll('[data-room]').forEach(b=>b.onclick=()=>this.visit(b.dataset.room));
  if(pending){this.root.querySelector('[data-enter]').onclick=()=>{this.approved.add(pending.id);this.room=pending.id;this.pending=null;this.onVisit?.(this.room);this.render();window.scrollTo(0,0);};this.root.querySelector('[data-stay]').onclick=()=>{this.pending=null;if(roomEntry(this.room,this.lens,EDGES).state==='door')this.room='studio';this.render();};}
  if(this.on3D)this.root.querySelector('#page-to-3d').onclick=()=>{this.close();this.on3D(this.room);};
  const setup=this.root.querySelector('#page-setup');if(setup)setup.onsubmit=async e=>{e.preventDefault();try{const age=Number(new FormData(setup).get('age'));if(!Number.isInteger(age)||age<0||age>120)throw new Error('Enter an age from 0 to 120.');const updated=await this.onAgeChange?.(age);if(updated)this.lens=updated;else{this.lens.age=age;setPreset(this.lens,age<13?'Kids':'Teen');}this.changed();}catch(error){this.root.querySelector('#page-setup-error').textContent=error.message;}};
  bindBlocks(this.root,{related:id=>this.visit(id),allow:id=>{this.softApproved.add(id);this.render(true);}});
  if(preserve)window.scrollTo(0,scroll);
 }
 visit(id){
  if(!ROOMS[id])return;const result=roomEntry(id,this.lens,EDGES);this.pending=null;
  if(result.state==='hidden'){this.render();return;}
  if(result.type==='door'&&result.state!=='private'&&!this.approved.has(id)){this.pending={id,result};this.render();window.scrollTo(0,0);return;}
  this.room=id;this.onVisit?.(id);this.render();window.scrollTo(0,0);
 }
}
export function openFallbackPage(options){const page=new PageRenderer(options);page.open();return page;}
