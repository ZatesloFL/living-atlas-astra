import {DIMENSIONS,scoreText} from './scores.js';
import {standingState,targetRef,readingsFor,declarationSnapshot} from './standing-records.js';
import {visibilityOf} from './permissions.js';
export const standingEscape=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export function readingTable(ref,node,room,lens){
 const state=standingState(lens),scope={publishedOnly:visibilityOf(room,lens)==='public'},declared=declarationSnapshot(state,ref,node,room,scope),reading=readingsFor(state,ref,scope);
 return `<div class="standing-table-wrap"><table class="standing-table"><caption>Declared · Steward · Audience</caption><thead><tr><th>Dimension</th><th>Declared</th><th>Steward</th><th>Audience</th></tr></thead><tbody>${DIMENSIONS.map(([key,label])=>`<tr><th>${label}</th><td>${scoreText(declared.scores[key])}</td><td>${reading.steward?scoreText(reading.steward[key]):'unmeasured'}</td><td>${reading.audienceReading?scoreText(reading.audienceReading[key]):'unmeasured'}</td></tr>`).join('')}</tbody></table></div>`;
}
export function readingCard(room,lens,block=null){
 const ref=targetRef(room,block);
 return `<details class="standing-card"><summary>Declared · Steward · Audience${block?' · this Thing':''}</summary>${readingTable(ref,block??room,room,lens)}<button type="button" data-standing-open="${standingEscape(JSON.stringify(ref))}">Readings & record</button></details>`;
}
export function bindReadingLinks(root,open){root.querySelectorAll('[data-standing-open]').forEach(button=>button.onclick=()=>open(JSON.parse(button.dataset.standingOpen)));}
