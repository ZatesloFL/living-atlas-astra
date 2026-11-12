import {PRESETS} from './data.js';
import {GROUPS} from './profiles.js';
import {identityBadge,appliedPreset,accessSettings} from './identity.js';
import {verifyChain} from './ledger.js';
import {escapeHTML as esc} from './ui.js';
const $=id=>document.getElementById(id);
const options=(values,current)=>values.map(v=>`<option value="${v}" ${v===current?'selected':''}>${v}</option>`).join('');
export class ProfileUI {
  constructor(ui,store,api){
    this.ui=ui;this.store=store;this.api=api;this.wheelPage=0;
    $('profile-chip').onclick=()=>this.switcher();$('test-button').onclick=()=>this.testPanel();$('test-banner').onclick=()=>this.testPanel();
    const lens=$('lens-button');let timer,start,held=false,suppressReleaseClick=false;
    document.addEventListener('pointerdown',()=>{suppressReleaseClick=false;},true);
    document.addEventListener('click',e=>{if(suppressReleaseClick){suppressReleaseClick=false;e.preventDefault();e.stopImmediatePropagation();}},true);
    document.addEventListener('pointerup',()=>{if(suppressReleaseClick)setTimeout(()=>{suppressReleaseClick=false;},400);},true);
    lens.addEventListener('pointerdown',e=>{held=false;start={x:e.clientX,y:e.clientY};timer=setTimeout(()=>{held=true;suppressReleaseClick=true;this.wheel();},500);});
    lens.addEventListener('pointermove',e=>{if(start&&Math.hypot(e.clientX-start.x,e.clientY-start.y)>14)clearTimeout(timer);});
    for(const name of ['pointerup','pointercancel','lostpointercapture'])lens.addEventListener(name,()=>{clearTimeout(timer);start=null;});
    lens.addEventListener('contextmenu',e=>e.preventDefault());lens.onclick=e=>{if(held){e.preventDefault();held=false;return;}this.ui.lens();};
    this.refresh();
  }
  async run(fn){try{await fn();this.refresh();if(this.store.storageWarning)this.ui.toast(this.store.storageWarning);}catch(e){this.ui.toast(e.message);}}
  refresh(){
    const l=this.api.state().lens,p=this.store.active();$('profile-chip').textContent=`Viewing as: ${p?.name??'New visitor'} · ${appliedPreset(l)}`;$('profile-chip').title=identityBadge(l);$('lens-badge').textContent=appliedPreset(l);
    const test=this.store.testActive()||l.testMode||this.ui.mode==='test';$('test-banner').hidden=!test;document.body.classList.toggle('test-active',test);$('test-banner').textContent=`TEST MODE · ${this.store.testActive()||l.testMode?'Simulated identity / access':'Developer panel open'} · Manage`;
  }
  setup(){
    this.ui.open('setup','Welcome to your Atlas','Make yourself at home');
    this.ui.content.innerHTML=`<p>Choose how you’d like to visit. Your profile stays in this browser.</p><form id="setup-form" class="settings-form">
      <label>Profile name<input name="name" value="My visit" maxlength="40" required autocomplete="off"></label>
      <label>Your age<input name="age" type="number" min="0" max="120" step="1" required inputmode="numeric" autocomplete="off" placeholder="Age in years"></label>
      <label>Display<select name="display"><option value="anonymous">Anonymous</option><option value="pseudonym" selected>Pseudonym</option><option value="real">Real name</option></select></label>
      <p class="muted">Backing: none. Choosing a name or entering an age does not verify you.</p>
      <label>Default content lens<select name="preset">${options(Object.keys(PRESETS),'Teen')}</select></label>
      <p class="summary" id="setup-cap">Without verified backing, content is capped at Teen. Children under 13 are capped at Kids. After Dark remains hidden.</p>
      <div class="form-columns"><label>Depth<select name="depth">${options(['Glance','Standard','Deep'],'Standard')}</select></label><label>Preferred form<select name="form"><option value="3d">3D</option><option value="card">Cards</option><option value="page">Page</option><option value="narration">Narrate</option><option value="text">Text</option></select></label></div>
      <p class="muted">3D, cards and Page are available now. Narration and Text are saved for later.</p>
      ${this.store.storageWarning?`<p class="reason">${esc(this.store.storageWarning)}</p>`:''}<p id="setup-error" role="alert"></p><button class="primary" type="submit">Save profile & enter the Atlas ↗</button></form>`;
    $('setup-form').onsubmit=async e=>{e.preventDefault();const form=e.currentTarget,submit=form.querySelector('button[type=submit]');submit.disabled=true;
      try{const data=Object.fromEntries(new FormData(form));data.age=Number(data.age);await this.store.setup(data);await this.api.apply();this.ui.close();this.ui.title(this.api.state().kind);this.refresh();if(this.store.storageWarning)this.ui.toast(this.store.storageWarning);}
      catch(error){$('setup-error').textContent=error.message;}finally{submit.disabled=false;}
    };
    this.refresh();
  }
  async choose(id){await this.api.switchProfile(id);this.ui.close();this.refresh();}
  switcher(){
    this.ui.open('profiles','Saved ways of seeing','Your profiles');const current=this.store.active();
    const profiles=[...this.store.profiles].sort((a,b)=>Number(!!a.seed)-Number(!!b.seed));
    this.ui.content.innerHTML=`<p class="muted">Tap a profile to switch. Built-in profiles simulate identity and access; TEST MODE stays visible while you use them.</p>
      <div class="profile-list">${profiles.map(p=>`<button data-profile="${p.id}" class="profile-option ${p.id===this.store.activeId?'selected':''}" aria-pressed="${p.id===this.store.activeId}"><span><strong>${esc(p.name)}</strong><small>${esc(identityBadge(p))}</small></span><span class="profile-tag">${p.isTest?'TEST':esc(appliedPreset(p))}</span></button>`).join('')}</div>
      <span class="section-label">This profile</span><p class="muted">${esc(identityBadge(this.api.state().lens))} · Age ${this.api.state().lens.age}</p>
      <div class="settings-form"><label>Display<select id="profile-display"><option value="anonymous" ${current?.identity.display==='anonymous'?'selected':''}>Anonymous</option><option value="pseudonym" ${current?.identity.display==='pseudonym'?'selected':''}>Pseudonym</option><option value="real" ${current?.identity.display==='real'?'selected':''}>Real name</option></select></label>
      <label>Profile name<input id="profile-name" maxlength="40" value="${esc(current?.name??'My profile')}" autocomplete="off"></label></div>
      <button id="profile-save-as" class="primary">Save current view as a new profile</button>
      ${current&&!current.seed?'<div class="form-columns"><button id="profile-rename" class="secondary">Rename this profile</button><button id="profile-delete" class="secondary">Delete this profile</button></div>':''}
      <div id="delete-confirm"></div><button id="profile-history" class="secondary">Profile receipts · ${this.store.entries.filter(e=>e.action==='profile_switched').length} switches</button><button id="open-test" class="secondary">Developer test panel</button>
      ${this.store.storageWarning?`<p class="reason">${esc(this.store.storageWarning)}</p>`:''}`;
    this.ui.content.querySelectorAll('[data-profile]').forEach(b=>b.onclick=()=>this.run(()=>this.choose(b.dataset.profile)));
    $('profile-display').onchange=e=>this.run(async()=>{this.store.setDisplay(e.target.value);await this.api.apply();this.switcher();});
    $('profile-save-as').onclick=()=>this.run(async()=>{await this.store.saveAs($('profile-name').value);await this.api.apply();this.switcher();this.ui.toast('Profile saved.');});
    if($('profile-rename'))$('profile-rename').onclick=()=>this.run(async()=>{await this.store.rename(current.id,$('profile-name').value);await this.api.apply();this.switcher();});
    if($('profile-delete'))$('profile-delete').onclick=()=>{$('delete-confirm').innerHTML='<p class="reason">Delete this saved profile? Its existing receipts remain in history.</p><button id="delete-yes" class="secondary">Delete profile</button><button id="delete-no" class="secondary">Keep profile</button>';$('delete-no').onclick=()=>$('delete-confirm').replaceChildren();$('delete-yes').onclick=()=>this.run(async()=>{await this.store.remove(current.id);await this.api.apply();if(this.store.completed)this.switcher();else this.setup();});};
    $('profile-history').onclick=()=>this.history();$('open-test').onclick=()=>this.testPanel();this.refresh();
  }
  wheel(){
    if(!this.store.completed)return;
    this.ui.open('profiles-wheel','Hold Lens to return here','Choose a profile');
    const list=[...this.store.profiles].sort((a,b)=>Number(!!a.seed)-Number(!!b.seed)),pages=Math.ceil(list.length/6);this.wheelPage%=pages;
    const visible=list.slice(this.wheelPage*6,this.wheelPage*6+6);
    this.ui.content.innerHTML=`<p class="muted">Lift your thumb, then tap a saved view.</p><div class="profile-wheel"><div class="wheel-center">YOUR<br>ATLAS</div>${visible.map((p,i)=>{const angle=-Math.PI/2+i*Math.PI*2/visible.length;return `<button class="wheel-item ${p.id===this.store.activeId?'selected':''}" style="--wx:${50+Math.cos(angle)*33}%;--wy:${50+Math.sin(angle)*33}%" data-wheel="${p.id}"><strong>${esc(p.name)}</strong><small>${p.isTest?'TEST PROFILE':esc(appliedPreset(p))}</small></button>`;}).join('')}</div>${pages>1?`<button class="secondary" id="wheel-more">More profiles · ${this.wheelPage+1} / ${pages}</button>`:''}<button class="secondary" id="wheel-manage">Manage profiles</button>`;
    this.ui.content.querySelectorAll('[data-wheel]').forEach(b=>b.onclick=()=>this.run(()=>this.choose(b.dataset.wheel)));
    if($('wheel-more'))$('wheel-more').onclick=()=>{this.wheelPage++;this.wheel();};$('wheel-manage').onclick=()=>this.switcher();this.refresh();
  }
  testPanel(){
    this.ui.open('test','Developer tool · simulated only','Identity & access');const l=this.api.state().lens;
    this.ui.content.innerHTML=`<p class="reason">TEST MODE is visible while this panel is open or simulated identity/access is active. These switches do not verify anyone.</p>
      <div class="settings-form"><label>Simulated age<input id="test-age" type="number" min="0" max="120" step="1" inputmode="numeric" value="${l.age}"></label>
      <label>Display<select id="test-display"><option value="anonymous" ${l.identity.display==='anonymous'?'selected':''}>Anonymous</option><option value="pseudonym" ${l.identity.display==='pseudonym'?'selected':''}>Pseudonym</option><option value="real" ${l.identity.display==='real'?'selected':''}>Real name</option></select></label>
      <label>Backing<select id="test-backing"><option value="none" ${l.identity.backing==='none'?'selected':''}>None</option><option value="verified" ${l.identity.backing==='verified'?'selected':''}>Verified person (simulated)</option></select></label>
      <label>Visitor kind<select id="test-agent"><option value="person" ${!l.isAgent?'selected':''}>Person</option><option value="agent" ${l.isAgent?'selected':''}>Agent</option></select></label>
      <label>Play as<select id="test-role"><option value="visitor" ${l.playAs==='visitor'?'selected':''}>Visitor</option><option value="owner" ${l.playAs==='owner'?'selected':''}>Owner</option></select></label></div>
      <p class="summary" id="test-badge">${esc(identityBadge(l))}<br>Applied content: ${esc(appliedPreset(l))}. ${accessSettings(l).verified?'Age gates still apply.':'After Dark remains hidden.'}</p>
      <span class="section-label">Group memberships</span><div class="test-groups">${GROUPS.map(([id,name,kind])=>`<label><input type="checkbox" data-group="${id}" ${l.groups.includes(id)?'checked':''}><span>${name}<small>${kind==='made'?'Made group':'Credential group · simulated'}</small></span></label>`).join('')}</div>
      <p class="muted">Membership and owner status are saved in test profiles. Room grants and approvals are managed through Atlas → place → Access & receipts. Unsaved overrides end when you reload or switch profiles.</p><button id="test-exit" class="primary">Exit test mode & restore personal profile</button><button id="test-close" class="secondary">Close panel · keep test settings</button>`;
    const update=()=>this.run(async()=>{const age=Number($('test-age').value);if(!$('test-age').value||!Number.isInteger(age)||age<0||age>120)throw new Error('Age must be 0–120.');await this.api.override({age,identity:{display:$('test-display').value,backing:$('test-backing').value},isAgent:$('test-agent').value==='agent',playAs:$('test-role').value,groups:[...this.ui.content.querySelectorAll('[data-group]:checked')].map(i=>i.dataset.group)});const current=this.api.state().lens;$('test-badge').textContent=`${identityBadge(current)} · Applied content: ${appliedPreset(current)}`;});
    for(const id of ['test-age','test-display','test-backing','test-agent','test-role'])$(id).onchange=update;this.ui.content.querySelectorAll('[data-group]').forEach(i=>i.onchange=update);
    $('test-close').onclick=()=>{this.ui.close();this.refresh();};$('test-exit').onclick=()=>this.run(async()=>{await this.store.exitTest();await this.api.apply();this.ui.close();if(!this.store.completed)this.setup();this.refresh();});this.refresh();
  }
  history(){
    this.ui.open('receipts','Append-only · SHA-256','Profile receipts');
    this.ui.content.innerHTML=`<p class="muted">Each switch is linked to the preceding receipt. Stored locally; this is not a blockchain or real identity verification.</p><button class="primary" id="verify-profiles">Verify ${this.store.entries.length} receipts</button><p id="verify-result" role="status"></p><div class="receipts">${[...this.store.entries].reverse().map(e=>`<article><strong>${esc(e.action.replaceAll('_',' '))}</strong><small>${esc(new Date(e.time).toLocaleString())}</small><code>${esc(e.hash?.slice(0,20))}…</code><p>${esc(JSON.stringify(e.diff))}</p></article>`).join('')}</div>`;
    $('verify-profiles').onclick=()=>this.run(async()=>{await this.store.queue;const result=await verifyChain(this.store.entries);$('verify-result').textContent=result.valid?`Verified: all ${result.count} receipts match their hashes and previous links.`:`Verification failed at receipt ${result.index+1}.`;});this.refresh();
  }
}
