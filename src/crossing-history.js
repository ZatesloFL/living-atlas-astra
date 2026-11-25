import {ROOMS} from './data.js';
import {personId,permission} from './permissions.js';
import {verifyChain} from './ledger.js';
import {esc} from './block-renderer.js';

export function holderCrossings(access,lens){
 if(lens.preview)return [];
 const actor=personId(lens);
 return Object.entries(access.data.ledgers).flatMap(([placeId,entries])=>entries
  .filter(e=>e.actor===actor&&['access_used','thing_crossed'].includes(e.action))
  .map(receipt=>{const room=Object.values(ROOMS).find(r=>r.id===placeId),readable=room&&permission(room,access.lens(lens)).canLook;
   return {placeId,title:readable?room.title:placeId,receipt};}))
  .sort((a,b)=>b.receipt.time.localeCompare(a.receipt.time)||b.receipt.id-a.receipt.id||a.placeId.localeCompare(b.placeId));
}

export async function openCrossingHistory(ui,access,getLens){
 await access.ready;await access.queue;
 const lens=getLens(),actor=personId(lens),rows=holderCrossings(access,lens);
 ui.open('crossing-receipts','Your private visiting history','Your crossing receipts');
 const root=ui.content;
 root.innerHTML=`<p>Only this profile’s recorded crossings, newest first. Stored in this browser; visiting history is private. Reading this list records no new crossing.</p>${lens.preview?'<p>Exit Preview as to open your own receipts.</p>':`<p>${rows.length} crossing receipts on file.</p><button id="verify-crossings">Verify receipt chains</button><p id="crossing-verification" role="status"></p><div class="receipts">${rows.map(({placeId,title,receipt:r})=>`<article class="crossing-receipt"><h3>${esc(title)}</h3><time datetime="${esc(r.time)}">${esc(r.time.replace('T',' ').replace('Z',' UTC'))}</time><p>${r.action==='thing_crossed'?'Thing · '+esc(r.diff.target.thingId):r.diff.scope==='look'?'Look crossing':'Enter crossing'}${r.diff.via?' · '+esc(r.diff.via):''}</p><p>Place: ${esc(placeId)}${r.diff.grant?' · Grant: '+esc(r.diff.grant):''}</p><code>${esc(r.hash)}</code><details><summary>Receipt contents</summary><pre>${esc(JSON.stringify(r,null,2))}</pre></details></article>`).join('')||'<p>No crossing receipts on file for this profile.</p>'}</div>`}`;
 root.querySelector('#verify-crossings')?.addEventListener('click',async()=>{
  const result=root.querySelector('#crossing-verification');
  if(getLens().preview||personId(getLens())!==actor){result.textContent='The active profile changed. Open its receipts again.';return;}
  const chains=[...new Set(rows.map(r=>r.placeId))];
  const checks=await Promise.all(chains.map(id=>verifyChain(structuredClone(access.data.ledgers[id]))));
  if(result.isConnected)result.textContent=checks.every(c=>c.valid)?`Verified ${chains.length} complete Place receipt chains. Only your ${rows.length} crossings are displayed.`:'Verification failed. These records are preserved; their integrity could not be confirmed.';
 });
}
