import {DIMENSIONS,scoreText} from './scores.js';
import {standingState,targetRef,readingsFor,declarationSnapshot} from './standing-records.js';
import {visibilityOf} from './permissions.js';
import {deriveStanding} from './standing-facets.js';
export const standingEscape=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export function readingTable(ref,node,room,lens){
 const state=standingState(lens),scope={publishedOnly:visibilityOf(room,lens)==='public'},declared=declarationSnapshot(state,ref,node,room,scope),reading=readingsFor(state,ref,scope);
 return `<div class="standing-table-wrap"><table class="standing-table"><caption>Declared · Steward · Audience</caption><thead><tr><th>Dimension</th><th>Declared</th><th>Steward</th><th>Audience</th></tr></thead><tbody>${DIMENSIONS.map(([key,label])=>`<tr><th>${label}</th><td>${scoreText(declared.scores[key])}</td><td>${reading.steward?scoreText(reading.steward[key]):'unmeasured'}</td><td>${reading.audienceReading?scoreText(reading.audienceReading[key]):'unmeasured'}</td></tr>`).join('')}</tbody></table></div>`;
}
export function readingCard(room,lens,block=null){
 const ref=targetRef(room,block);
 const reading=deriveStanding(standingState(lens),{target:ref}).facets.declaration.reading;
 return `<details class="standing-card"><summary>Declared · Steward · Audience${block?' · this Thing':''}</summary><p>Declaration record · ${reading}</p>${readingTable(ref,block??room,room,lens)}<button type="button" data-standing-open="${standingEscape(JSON.stringify(ref))}">Readings & record</button></details>`;
}
export function bindReadingLinks(root,open){root.querySelectorAll('[data-standing-open]').forEach(button=>button.onclick=()=>open(JSON.parse(button.dataset.standingOpen)));}
export function facetPanels(record,{place=false}={}){
 return `<div class="standing-facets">${Object.entries(record.facets).filter(([key])=>!place||key==='declaration').map(([key,facet])=>`<section class="standing-facet" data-facet="${key}"><h3>${facet.label} · ${facet.reading??'shared at a knock or door'}</h3><details><summary>Full record</summary>${facet.history.map(e=>`<article><strong>${standingEscape(e.outcome)} · ${standingEscape(e.title)}</strong><p>${standingEscape(e.time)}</p>${e.source?`<p>${standingEscape(e.source)}</p>`:''}${e.outcome==='gap'&&e.title==='AI proxy validation'?`<p>${standingEscape(e.failureClass??'Failure classification unavailable')}</p>`:''}<code>${standingEscape(e.receipt)}</code>${e.receipts?`<p>Evidence: ${e.receipts.map(standingEscape).join(' · ')}</p>`:''}${e.review?`<p>Re-measurement: ${standingEscape(e.review)}</p>`:''}</article>`).join('')||`<p>${facet.reading===null?'Full browsing is the holder’s choice.':facet.reading==='unmeasured'?'unmeasured':'Full browsing is the holder’s choice; the reading is unchanged.'}</p>`}</details></section>`).join('')}</div>`;
}
