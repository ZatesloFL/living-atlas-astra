import {artURL} from './kit-art.js';
import {SAMPLE_LABEL} from './exhibit-data.js';
import {interpret} from './kit.js';
import {mediaPlayer,stopMedia,setMediaGuard,players} from './kit-media.js';
import {ROOMS} from './data.js';
import {viewRoom} from './audience.js';
import {blockAccess,selectContent} from './content.js';
import {roomVisible} from './rules.js';
import {permission} from './permissions.js';
import {itemStyle} from './item-style.js';
import {exhibitPlacement} from './kit-placement.js';
const e=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const catalog=new Map();let current={mode:'page'},openLightbox=null,lensKey=null;
if(globalThis.document)new MutationObserver(()=>{if(openLightbox&&!openLightbox.origin.isConnected)openLightbox.dialog.close();}).observe(document,{childList:true,subtree:true});
if(globalThis.document&&!document.querySelector('[data-kit-style]')){const link=document.createElement('link');link.rel='stylesheet';link.href=new URL('../kit.css',import.meta.url).href;link.dataset.kitStyle='';document.head.append(link);}
export function mediaContext(context){
 const l=context.lens,key=JSON.stringify([l?.profileId,l?.identity,l?.age,l?.limits,l?.hard,l?.depth,l?.trustFrom,l?.show]);
 // A changed Lens requires a fresh tap, including changes to soft limits.
 if(lensKey!==null&&key!==lensKey){stopMedia();openLightbox?.dialog.close();}
 lensKey=key;current=context;
 for(const p of players.values())if(!canPlay(p))p.dispatch('leave');
 if(openLightbox&&!canView(openLightbox.entry))openLightbox.dialog.close();
}
function canView(p){
 const original=ROOMS[p.room];if(!original||!current.lens)return false;
 const room=viewRoom(original,current.lens),block=selectContent(room,current.lens).blocks.find(b=>b.exhibit?.id===p.component.id);
 return roomVisible(p.room,current.lens)&&permission(room,current.lens).canLook&&!!block&&!blockAccess(block,room,current.lens).hidden&&(current.mode==='page'?current.room===p.room:current.scene===room.layout.scene);
}
function canPlay(p){
 if(!canView(p))return false;if(current.mode==='page')return [...p.views].some(v=>v.root.isConnected);
 const room=viewRoom(ROOMS[p.room],current.lens),placement=room.layout.components?.find(c=>c.block===p.component.id)??p.component;
 const layout=exhibitPlacement({...room.layout,scale:(room.layout.scale??1)*itemStyle(room,current.lens).scale},placement);
 return Math.hypot(current.position.x-layout.slot[0],current.position.z-layout.slot[1])<7;
}
setMediaGuard(canPlay);
export function kitHTML(block,room){
 const c=block.exhibit,s=c.settings,key=room.id+':'+c.id;catalog.set(key,{room:Object.keys(ROOMS).find(k=>ROOMS[k].id===room.id),component:c,source:block.source});let body='';
 if(c.kind==='screen')body=`<div class="kit-screen"><video playsinline muted controls preload="none" poster="${artURL(s.slides[0].scene,s.slides[0].title)}" aria-label="Generated sample slide sequence"></video><p class="kit-captions" aria-live="polite">${e(s.slides[0].caption)}</p></div><div class="kit-transport"><button data-kit-event="tap">Play sample film</button><output data-player-state>Ready · captions on</output><label>Position in film<input data-kit-event="seek" type="range" min="0" max="${s.slides.length*s.secondsPerSlide}" step=".2" value="0"></label></div><details><summary>Captions & transcript · to verify</summary><ol class="kit-transcript">${s.slides.map((x,i)=>`<li data-cue="${i}">${e(x.caption)}</li>`).join('')}</ol></details>`;
 if(c.kind==='photoWall')body=`<div class="kit-gallery">${s.photos.map((p,i)=>`<button data-kit-event="photo" data-value="${i}" aria-label="Open ${e(p.title)}"><img src="${artURL(p.scene,p.title)}" alt="${e(p.alt)}" loading="lazy"><span>${e(p.title)}</span></button>`).join('')}</div>`;
 if(c.kind==='listening')body=`<div class="kit-wave" aria-hidden="true">${Array.from({length:32},(_,i)=>`<i style="--wave:${25+(i*37)%70}%;--delay:${i*.045}s"></i>`).join('')}</div><div class="kit-transport"><button data-kit-event="tap">Listen to sample narration</button><output data-player-state>Device speech synthesis · no witness recording</output></div><ol class="kit-transcript">${s.cues.map((text,i)=>`<li data-cue="${i}">${e(text)} <small>Sample · to verify</small></li>`).join('')}</ol>`;
 if(c.kind==='newspaper')body=`<div class="clipping-tools"><button data-kit-event="zoom" data-value="1" aria-pressed="true">Fit</button><button data-kit-event="zoom" data-value="1.4" aria-pressed="false">140%</button><button data-kit-event="zoom" data-value="1.8" aria-pressed="false">180%</button><span>Scroll to pan when zoomed</span></div><div class="clipping-window" tabindex="0" aria-label="Scrollable sample newspaper"><div class="kit-clipping"><p class="clipping-masthead">THE SAMPLE RECORD</p><p class="clipping-date">FICTIONAL EDITION · PROTOTYPE ONLY · NO ARCHIVAL CLAIM</p><h4>${e(s.headline)}</h4><div class="clipping-columns">${s.columns.map(p=>`<p>${e(p)}</p>`).join('')}</div><p class="clipping-foot">All copy invented for this display. Real sources not connected.</p></div></div>`;
 if(c.kind==='seatMap')body=`<p class="muted">Conceptual diagram · not a reconstructed vehicle or exact seating policy.</p><div class="seat-diagram"><span>FRONT / DRIVER →</span>${s.seats.map((seat,i)=>`<button data-kit-event="seat" data-value="${i}" aria-pressed="false">${e(seat.label)}<span aria-hidden="true"> ▣ ▣</span></button>`).join('')}</div><p class="seat-story" aria-live="polite">Tap a labeled area to read its sample caption.</p>`;
 return `<div class="kit-exhibit" data-kit="${e(key)}" data-kind="${c.kind}"><p class="sample-media">${SAMPLE_LABEL}</p><h3>${e(s.title)}</h3>${body}${block.state==='ready'?`<p class="kit-late-copy">${e(block.body)}</p><p>${e(block.reps?.text)}</p>`:''}<p class="kit-credit">${c.kind==='listening'?'Synthetic voice reads authored sample text; no impersonation.':'Generated in code for Living Atlas; no archival material is presented.'} Captions and historical context: to verify.</p></div>`;
}
function lightbox(photo,origin,entry){
 openLightbox?.dialog.close();const source=entry.source;
 const d=document.createElement('dialog');d.className='kit-lightbox';d.innerHTML=`<button autofocus>Close image ×</button><figure><img src="${artURL(photo.scene,photo.title)}" alt="${e(photo.alt)}"><figcaption><strong>${e(photo.title)}</strong><p>${e(photo.caption)}</p><p>${e(photo.credit)}</p><p>${SAMPLE_LABEL} · Source: ${e(source?.sourceId??'No archive connected')} / ${e(source?.itemId??'')} · ${source?.syncedAt?'Synced '+e(source.syncedAt):'Not synced'}</p></figcaption></figure>`;document.body.append(d);d.querySelector('button').onclick=()=>d.close();d.onclose=()=>{if(openLightbox?.dialog===d)openLightbox=null;d.remove();if(origin.isConnected)origin.focus();};d.onclick=ev=>{if(ev.target===d)d.close();};openLightbox={dialog:d,origin,entry};d.showModal();
}
export function bindKit(root){for(const node of root.querySelectorAll('[data-kit]')){
 const entry=catalog.get(node.dataset.kit);if(!entry)continue;const {component:c,room}=entry,player=['screen','listening'].includes(c.kind)?mediaPlayer(room,c):null;
 const act=(event,value,origin)=>{const ops=interpret(c,event,{canView:node.isConnected&&canView(entry),value});for(const op of ops){if(op.action==='photo'){const photo=c.settings.photos[value];if(photo)lightbox(photo,origin,entry);}else if(op.action==='seat'){const seat=c.settings.seats[value];if(seat){node.querySelector('.seat-story').textContent=seat.caption;node.querySelectorAll('[data-kit-event=seat]').forEach(b=>b.setAttribute('aria-pressed',String(b===origin)));}}else if(op.action==='zoom'){const zoom=Math.max(1,Math.min(1.8,+value)),clipping=node.querySelector('.kit-clipping');clipping.style.width=zoom*100+'%';clipping.style.zoom=zoom;node.querySelectorAll('[data-kit-event=zoom]').forEach(b=>b.setAttribute('aria-pressed',String(b===origin)));}}if(player)player.dispatch(event,value);};
 node.querySelectorAll('[data-kit-event]').forEach(b=>{if(b.type==='range')b.oninput=()=>act(b.dataset.kitEvent,b.value,b);else b.onclick=()=>act(b.dataset.kitEvent,b.dataset.value,b);});
 if(player){
  player.pruneViews();const video=node.querySelector('video');let playAttempt=null;
  const update=p=>{
   node.dataset.playing=String(p.playing);node.querySelector('[data-kit-event=tap]').textContent=p.playing?'Pause':c.kind==='screen'?'Play sample film':'Listen to sample narration';node.querySelector('[data-player-state]').textContent=p.status;
   node.querySelectorAll('[data-cue]').forEach(el=>{el.classList.toggle('current',+el.dataset.cue===p.cue);el.setAttribute('aria-current',+el.dataset.cue===p.cue?'true':'false');});
   if(!video)return;
   const slide=c.settings.slides[p.cue];node.querySelector('.kit-captions').textContent=slide.caption;node.querySelector('input[type=range]').value=p.time;
   if(p.playing){
    const stream=p.stream();
    if(stream){
     if(video.srcObject!==stream)video.srcObject=stream;
     if(video.paused&&!playAttempt){
      const generation=p.generation;
      playAttempt=video.play().catch(()=>{if(node.isConnected&&p.playing&&p.generation===generation)p.pause('Video playback unavailable · captions and transcript remain');}).finally(()=>{playAttempt=null;});
     }
    }else video.poster=artURL(slide.scene,slide.title);
   }else{
    video.pause();
    if(!p.streamObject){video.srcObject=null;video.poster=artURL(slide.scene,slide.title);}
   }
  };
  player.views.add({root:node,update,dispose:()=>{if(video){video.onpause=null;video.onplay=null;video.pause();video.srcObject=null;}}});update(player);
  // Media events are asynchronous. Recheck the current element state instead of
  // toggling on an old pause event from a disposed/replaced video.
  if(video){
   video.onplay=()=>{if(node.isConnected&&!video.paused&&!player.playing)player.dispatch('tap');};
   video.onpause=()=>{if(node.isConnected&&video.paused&&player.playing&&video.srcObject===player.streamObject)player.pause();};
  }
 }
}}
export {stopMedia};
