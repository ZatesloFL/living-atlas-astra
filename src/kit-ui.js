import {artURL} from './kit-art.js';
import {SAMPLE_LABEL} from './exhibit-data.js';
import {interpret} from './kit.js';
import {mediaPlayer,stopMedia,setMediaGuard,players} from './kit-media.js';
import {ROOMS} from './data.js';
import {viewRoom} from './audience.js';
import {blockAccess,selectContent} from './content.js';
import {roomVisible} from './rules.js';
import {permission} from './permissions.js';
const e=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const catalog=new Map();let current={mode:'page'};
if(globalThis.document&&!document.querySelector('[data-kit-style]')){const link=document.createElement('link');link.rel='stylesheet';link.href=new URL('../kit.css',import.meta.url).href;link.dataset.kitStyle='';document.head.append(link);}
export function mediaContext(context){current=context;for(const p of players.values())if(!canPlay(p))p.dispatch('leave');}
function canPlay(p){const original=ROOMS[p.room];if(!original||!current.lens)return false;const room=viewRoom(original,current.lens),block=selectContent(room,current.lens).blocks.find(b=>b.exhibit?.id===p.component.id);if(!roomVisible(p.room,current.lens)||!permission(room,current.lens).canLook||!block||blockAccess(block,room,current.lens).hidden)return false;
 if(current.mode==='page')return current.room===p.room;const pos=p.component.position??[0,0],slot=room.layout.slot;return current.scene===room.layout.scene&&Math.hypot(current.position.x-slot[0]-pos[0],current.position.z-slot[1]-pos[1])<7;
}
setMediaGuard(canPlay);
export function kitHTML(block,room){
 const c=block.exhibit,s=c.settings,key=room.id+':'+c.id;catalog.set(key,{room:Object.keys(ROOMS).find(k=>ROOMS[k].id===room.id),component:c});let body='';
 if(c.kind==='screen')body=`<div class="kit-screen"><video playsinline muted controls preload="none" poster="${artURL(0,s.slides[0].title)}" aria-label="Generated sample slide sequence"></video><p class="kit-captions" aria-live="polite">${e(s.slides[0].caption)}</p></div><div class="kit-transport"><button data-kit-event="tap">Play sample film</button><output data-player-state>Ready · captions on</output><label>Position in film<input data-kit-event="seek" type="range" min="0" max="${s.slides.length*s.secondsPerSlide}" step=".2" value="0"></label></div><details><summary>Captions & transcript · to verify</summary><ol class="kit-transcript">${s.slides.map((x,i)=>`<li data-cue="${i}">${e(x.caption)}</li>`).join('')}</ol></details>`;
 if(c.kind==='photoWall')body=`<div class="kit-gallery">${s.photos.map((p,i)=>`<button data-kit-event="photo" data-value="${i}" aria-label="Open ${e(p.title)}"><img src="${artURL(p.scene,p.title)}" alt="${e(p.alt)}" loading="lazy"><span>${e(p.title)}</span></button>`).join('')}</div>`;
 if(c.kind==='listening')body=`<div class="kit-wave" aria-hidden="true">${Array.from({length:32},(_,i)=>`<i style="--wave:${25+(i*37)%70}%;--delay:${i*.045}s"></i>`).join('')}</div><div class="kit-transport"><button data-kit-event="tap">Listen to sample narration</button><output data-player-state>Device speech synthesis · no witness recording</output></div><ol class="kit-transcript">${s.cues.map((text,i)=>`<li data-cue="${i}">${e(text)} <small>Sample · to verify</small></li>`).join('')}</ol>`;
 if(c.kind==='newspaper')body=`<div class="clipping-tools"><button data-kit-event="zoom" data-value="1">Fit</button><button data-kit-event="zoom" data-value="1.4">140%</button><button data-kit-event="zoom" data-value="1.8">180%</button><span>Scroll to pan when zoomed</span></div><div class="clipping-window" tabindex="0" aria-label="Scrollable sample newspaper"><div class="kit-clipping"><p class="clipping-masthead">THE SAMPLE RECORD</p><p class="clipping-date">FICTIONAL EDITION · PROTOTYPE ONLY · NO ARCHIVAL CLAIM</p><h4>${e(s.headline)}</h4><div class="clipping-columns">${s.columns.map(p=>`<p>${e(p)}</p>`).join('')}</div><p class="clipping-foot">All copy invented for this display. Real sources not connected.</p></div></div>`;
 if(c.kind==='seatMap')body=`<p class="muted">Conceptual diagram · not a reconstructed vehicle or exact seating policy.</p><div class="seat-diagram"><span>FRONT / DRIVER →</span>${s.seats.map((seat,i)=>`<button data-kit-event="seat" data-value="${i}">${e(seat.label)}<span aria-hidden="true"> ▣ ▣</span></button>`).join('')}</div><p class="seat-story" aria-live="polite">Tap a labeled area to read its sample caption.</p>`;
 return `<div class="kit-exhibit" data-kit="${e(key)}" data-kind="${c.kind}"><p class="sample-media">${SAMPLE_LABEL}</p><h3>${e(s.title)}</h3>${body}${block.state==='ready'?`<p class="kit-late-copy">${e(block.body)}</p><p>${e(block.reps?.text)}</p>`:''}<p class="kit-credit">${c.kind==='listening'?'Synthetic voice reads authored sample text; no impersonation.':'Generated in code for Living Atlas; no archival material is presented.'} Captions and historical context: to verify.</p></div>`;
}
function lightbox(photo,origin){
 const d=document.createElement('dialog');d.className='kit-lightbox';d.innerHTML=`<button autofocus>Close image ×</button><figure><img src="${artURL(photo.scene,photo.title)}" alt="${e(photo.alt)}"><figcaption><strong>${e(photo.title)}</strong><p>${e(photo.caption)}</p><p>${e(photo.credit)}</p><p>${SAMPLE_LABEL} · Source: archive-to-connect · Not synced</p></figcaption></figure>`;document.body.append(d);d.querySelector('button').onclick=()=>d.close();d.onclose=()=>{d.remove();origin.focus();};d.onclick=ev=>{if(ev.target===d)d.close();};d.showModal();
}
export function bindKit(root){for(const node of root.querySelectorAll('[data-kit]')){
 const entry=catalog.get(node.dataset.kit);if(!entry)continue;const {component:c,room}=entry,player=['screen','listening'].includes(c.kind)?mediaPlayer(room,c):null;
 const act=(event,value,origin)=>{const ops=interpret(c,event,{canView:true,value});for(const op of ops){if(op.action==='photo'){const photo=c.settings.photos[value];if(photo)lightbox(photo,origin);}else if(op.action==='seat'){const seat=c.settings.seats[value];if(seat){node.querySelector('.seat-story').textContent=seat.caption;node.querySelectorAll('[data-kit-event=seat]').forEach(b=>b.setAttribute('aria-pressed',String(b===origin)));}}else if(op.action==='zoom')node.querySelector('.kit-clipping').style.width=(Math.max(1,Math.min(1.8,+value))*100)+'%';}if(player)player.dispatch(event,value);};
 node.querySelectorAll('[data-kit-event]').forEach(b=>{if(b.type==='range')b.oninput=()=>act(b.dataset.kitEvent,b.value,b);else b.onclick=()=>act(b.dataset.kitEvent,b.dataset.value,b);});
 if(player){const video=node.querySelector('video');let changing=false;
  const update=p=>{node.dataset.playing=String(p.playing);node.querySelector('[data-kit-event=tap]').textContent=p.playing?'Pause':c.kind==='screen'?'Play sample film':'Listen to sample narration';node.querySelector('[data-player-state]').textContent=p.status;node.querySelectorAll('[data-cue]').forEach(el=>{el.classList.toggle('current',+el.dataset.cue===p.cue);el.setAttribute('aria-current',+el.dataset.cue===p.cue?'true':'false');});
   if(video){node.querySelector('.kit-captions').textContent=c.settings.slides[p.cue].caption;node.querySelector('input[type=range]').value=p.time;changing=true;if(p.playing){const stream=p.stream();if(stream){if(video.srcObject!==stream)video.srcObject=stream;video.play().catch(()=>{p.pause('Video playback unavailable · captions and transcript remain');});}else{video.poster=artURL(c.settings.slides[p.cue].scene,c.settings.slides[p.cue].title);}}else video.pause();changing=false;}
  };player.views.add({root:node,update,dispose:()=>{if(video){video.onpause=null;video.onplay=null;video.pause();video.srcObject=null;}}});update(player);if(video){video.onplay=()=>{if(!changing&&!player.playing)player.dispatch('tap');};video.onpause=()=>{if(!changing&&player.playing)player.dispatch('tap');};}
 }
}}
export {stopMedia};
