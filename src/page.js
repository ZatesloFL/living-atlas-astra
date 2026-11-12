// A0's independent reading surface. A6 extends these shared data records with
// typed blocks; this module deliberately imports no WebGL, world, UI, or controls.
import {ROOMS,EDGES,PRESETS,DIMENSIONS,createLens} from './data.js';
import {visibleEdge,roomVisible,setPreset} from './rules.js';
import {identityBadge,accessSettings,appliedPreset} from './identity.js';
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export class PageRenderer {
  constructor({lens,room='studio',onLensChange,on3D,diagnostics}={}){
    this.lens=lens??{...createLens(),age:0,identity:{display:'anonymous',backing:'none'}};this.room=room;this.onLensChange=onLensChange;this.on3D=on3D;this.diagnostics=diagnostics;
    this.root=document.getElementById('page-form')||document.createElement('main');this.root.id='page-form';if(!this.root.parentNode)document.body.append(this.root);this.root.hidden=true;
  }
  open(room=this.room){this.room=ROOMS[room]?room:'studio';document.body.classList.add('page-mode');this.root.hidden=false;document.getElementById('loading')?.classList.add('done');document.getElementById('sheet')?.setAttribute('hidden','');document.getElementById('veil')?.setAttribute('hidden','');document.body.classList.remove('panel-open');this.render();}
  render(){
    if(this.room!=='family'&&!roomVisible(this.room,this.lens))this.room='studio';
    const r=ROOMS[this.room],access=accessSettings(this.lens),privateRoom=r.visibility==='private';
    const destinations=Object.entries(ROOMS).filter(([id])=>roomVisible(id,this.lens));
    this.root.innerHTML=`<header class="page-header"><a href="./">Living Atlas</a><span>Page form</span>${this.on3D?'<button id="page-to-3d">Return to 3D</button>':'<a href="?safe">Try safe 3D</a>'}</header>
      <section class="page-settings" aria-label="Page lens"><label>Room<select id="page-room">${destinations.map(([id,r])=>`<option value="${id}" ${id===this.room?'selected':''}>${esc(r.title)}</option>`).join('')}</select></label>
      <label>Content lens<select id="page-lens">${Object.keys(PRESETS).map(p=>`<option ${p===this.lens.preset?'selected':''}>${p}</option>`).join('')}</select></label><label>Depth<select id="page-depth">${['Glance','Standard','Deep'].map(d=>`<option ${d===(this.lens.depth??'Standard')?'selected':''}>${d}</option>`).join('')}</select></label></section>
      ${this.lens.testMode?'<p class="reason">TEST MODE · simulated identity and access</p>':''}<p class="page-status">${esc(identityBadge(this.lens))} · ${esc(appliedPreset(this.lens))}${access.cap?' · Access ceilings still apply':''}</p>
      <article><p class="address">${esc(r.address)}</p><h1>${esc(r.title)}</h1>${privateRoom?'<p>Private space, something is here.</p>':`<p class="page-author">${esc(r.author.name)} · ${esc(identityBadge(r.author))}</p><p class="page-lead">${esc(r.substance.summary)}</p>${this.lens.depth==='Glance'?'':`<p>${esc(r.substance.body)}</p>${(r.substance.claims??[]).map(c=>`<p class="page-citation">${esc(c.text)} · <a href="${esc(c.source)}" target="_blank" rel="noopener noreferrer">Source ↗</a></p>`).join('')}`}<div class="chips">${DIMENSIONS.filter(([k])=>Math.max(r.content[k],r.measured[k])>0).map(([k,t])=>`<span class="score-chip">${t} ${Math.max(r.content[k],r.measured[k])}</span>`).join('')}</div>`}</article>
      <nav class="page-connections" aria-label="Room connections"><h2>Connections</h2>${EDGES.filter(e=>e.from===this.room&&visibleEdge(e,this.lens).state!=='hidden').map(e=>`<button data-room="${e.to}">${esc(ROOMS[e.to].title)} · ${visibleEdge(e,this.lens).type}</button>`).join('')||'<p>Select another permitted room above.</p>'}</nav>`;
    this.root.querySelector('#page-room').onchange=e=>this.visit(e.target.value);
    this.root.querySelector('#page-lens').onchange=e=>{setPreset(this.lens,e.target.value);this.onLensChange?.(this.lens);this.render();};
    this.root.querySelector('#page-depth').onchange=e=>{this.lens.depth=e.target.value;this.onLensChange?.(this.lens);this.render();};
    this.root.querySelectorAll('[data-room]').forEach(b=>b.onclick=()=>this.visit(b.dataset.room));
    if(this.on3D)this.root.querySelector('#page-to-3d').onclick=()=>{document.body.classList.remove('page-mode');this.root.hidden=true;this.on3D();};
  }
  visit(id){
    if(!ROOMS[id])return;
    const e=EDGES.find(e=>e.to===id),result=e?visibleEdge(e,this.lens):null;
    if(result?.state==='hidden')return;
    if(result?.type==='door'){this.showPreview(id,result);return;}
    this.room=id;this.render();window.scrollTo(0,0);
  }
  showPreview(id,result){
    const preview=document.createElement('section');preview.className='page-preview';preview.innerHTML=`<h2>Preview: ${esc(ROOMS[id].title)}</h2><p>${result.reasons.map(esc).join('<br>')}</p><button data-enter>${result.type==='window'?'Read this view-only room':'Enter this Page'}</button><button data-stay>Stay here</button>`;
    this.root.prepend(preview);preview.querySelector('[data-enter]').onclick=()=>{this.room=id;this.render();};preview.querySelector('[data-stay]').onclick=()=>preview.remove();window.scrollTo(0,0);
  }
}
export function openFallbackPage(options){const page=new PageRenderer(options);page.open();return page;}
