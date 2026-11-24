import {DIALS,pair} from './scores.js';
import {ROOMS,DIMENSIONS} from './data.js';
import {accessSettings} from './identity.js';
import {doorPolicy} from './admission.js';
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export function doorControls(id,lens){
 const room=ROOMS[id];if(!room)return '';const p=doorPolicy(room,lens),a=accessSettings(lens,room),canRaise=DIALS.some(([k,axis])=>a.limits[k][axis]<(a.hard[k][axis]??3));
 return `<div class="door-policy" data-admission-mode="${p.mode}"><p>${esc(p.description)}</p>${p.filtered?'<p class="reason">Filtered view · Things above your Lens will be visibly withheld. Their original records stay unchanged.</p>':''}${p.blocked?`<p class="reason">${p.canRaise?'This entrance needs higher dimensions. You can choose them just for this visit.':'This entrance exceeds your hard limits. It cannot be opened by a visit exception.'}</p>`:''}${canRaise&&!lens.isAgent&&!lens.preview?`<details class="door-raise" data-raise-place="${esc(id)}"><summary>Adjust dimensions for this Place only</summary><p>Applies to ${esc(room.title)} for this visit. Ends when you leave; hard limits and legal floors stay fixed. A receipt records your choice.</p>${DIALS.map(([k,axis,label])=>{const current=a.limits[k][axis],max=a.hard[k][axis]??3,value=Math.min(max,Math.max(current,p.minimum[k][axis]));return `<label>${label} · now ${current}, maximum ${max}<input type="range" data-raise-dimension="${k}" data-axis="${axis}" min="${current}" max="${max}" step="1" value="${value}" aria-label="${label} for this visit"><output>${value}</output></label>`;}).join('')}<p data-raise-error role="alert"></p><button type="button" data-raise-submit>Use these limits for this visit</button></details>`:''}</div>`;
}
export function bindDoorControls(root,store,getLens,changed){
 if(!store){root.querySelectorAll('[data-raise-place]').forEach(box=>box.remove());return;}
 root.querySelectorAll('[data-raise-place]').forEach(box=>{
  box.querySelectorAll('[data-raise-dimension]').forEach(input=>input.oninput=()=>input.nextElementSibling.textContent=input.value);
  box.querySelector('[data-raise-submit]').onclick=async e=>{e.currentTarget.disabled=true;try{await store.raiseForVisit(box.dataset.raisePlace,[...box.querySelectorAll('[data-raise-dimension]')].reduce((out,i)=>{(out[i.dataset.raiseDimension]??=pair())[i.dataset.axis]=Number(i.value);return out;},{}),getLens());await changed();}catch(error){box.querySelector('[data-raise-error]').textContent=error.message;}finally{if(e.target.isConnected)e.target.disabled=false;}};
 });
}
