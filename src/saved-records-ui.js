import {ROOMS,EDGES} from './data.js';
import {personId,permission} from './permissions.js';
import {roomEntry} from './content.js';
import {thingSubject} from './thing-subject.js';
import {readableAnswer} from './place-evidence.js';
import {esc} from './block-renderer.js';
export function savedRecords(access,lens){
 const who=personId(lens),visible=key=>ROOMS[key]&&permission(ROOMS[key],lens).canLook&&roomEntry(key,lens,EDGES).state!=='hidden';
 const places=access.places(lens),kept=Object.values(access.data.ledgers).flat().filter(r=>r.actor===who&&r.action==='helper_offer_accepted').flatMap(receipt=>{
  const answer=access.data.staffState.proposals.find(p=>p.id===receipt.diff.proposal&&p.proposal.kind==='answer');if(!answer)return [];
  const q=answer.proposal,readable=visible(q.room)&&readableAnswer(q.text)&&q.citations.every(id=>id==='place-overview'||thingSubject(q.room,id,lens));
  return [{answer,receipt,readable}];
 });
 return {pins:places.pins.filter(visible),recent:places.recent.filter(visible),kept};
}
export function openSavedRecords(ui,access,getLens,{go}={}){
 const records=savedRecords(access,access.lens(getLens()));ui.open('saved-records','This profile’s records','Your pins, recent Places & kept answers');
 const list=keys=>keys.map(key=>`<button data-saved-place="${esc(key)}">${esc(ROOMS[key].title)}</button>`).join('')||'<p>None in your current view.</p>';
 ui.content.innerHTML=`<h3>Pinned Places</h3>${list(records.pins)}<h3>Recent Places</h3>${list(records.recent)}<h3>Kept answers</h3>${records.kept.map(({answer:p,receipt,readable})=>`<article class="kept-answer"><h4>${readable?esc(ROOMS[p.proposal.room].title):'Answer unavailable in this view'}</h4><p>${readable?esc(p.proposal.text):'The saved answer cannot be shown under the current Lens or source state.'}</p><details><summary>Inspect kept-answer record</summary><p>Kept by this profile at ${esc(new Date(receipt.time).toLocaleString())}. Helper: ${esc(p.agentName)}.</p><p>Recorded answer, not a new model call.</p><code>${esc(receipt.hash)}</code></details></article>`).join('')||'<p>No answers kept by this profile yet.</p>'}`;
 ui.content.querySelectorAll('[data-saved-place]').forEach(b=>b.onclick=()=>{ui.close();go?.(b.dataset.savedPlace);});
}
