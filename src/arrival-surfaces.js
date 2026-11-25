import {attachedArchiveSources,archiveSourceText} from './arrival-archive.js';
import {ROOMS} from './data.js';
import {permission,personId} from './permissions.js';
import {resolvePublicReference} from './public-references.js';
import {blockHTML,esc} from './block-renderer.js';
import {doorPolicy} from './admission.js';
export function bindArrivalSurfaces(root,room,lens,records,{related,changed}={}){
 root.querySelectorAll('.arrival-extras').forEach(e=>e.remove());if(!room?.arrivalSeed||!permission(room,lens).canLook||doorPolicy(room,lens).blocked)return;
 const area=document.createElement('section');area.className='arrival-extras';
 const children=Object.values(ROOMS).filter(r=>r.parentPlaceId===room.id&&permission(r,lens).visible);
 if(children.length)area.innerHTML='<h3>Your first rooms</h3>'+children.map(r=>`<button data-arrival-place="${esc(r.id)}">Enter ${esc(r.title)}</button>`).join('');
 if(room.parentPlaceId)area.innerHTML+=`<button data-arrival-place="${esc(room.parentPlaceId)}">Back to my space</button>`;
 area.innerHTML+='<button data-arrival-place="square">Explore Town Square</button>';
 if(room.includedReferences?.length)area.innerHTML+='<h3>Included by reference</h3>'+room.includedReferences.map(ref=>{const result=resolvePublicReference(ref,lens);if(!result.allowed)return '<p class="reason">Source reference unavailable · '+esc(result.reason)+'. Nothing was copied into this Place.</p>';return `<article><p>From ${esc(result.source.title)} · ${esc(result.source.author?.name??'source owner')} retains ownership, scores and standing.</p>${result.kind==='Thing'?blockHTML(result.block,result.source,lens):''}<button data-arrival-place="${esc(result.key)}">Visit the original Place</button></article>`;}).join('');
 if(room.id.endsWith('/drive')&&records&&room.ownerId===personId(lens)){
  const attached=attachedArchiveSources(room,lens);
  const sources=records.data.archive.filter(s=>s.holderId===personId(lens));area.innerHTML+=`<h3>Archive collections</h3>${attached.length?attached.map(s=>'<p class="archive-attached-source">'+esc(archiveSourceText(s))+'</p>').join(''):'<p>Archive not synced · organizing references does not import or upload files.</p>'}${sources.map(s=>`<form data-archive-source="${esc(s.id)}"><p>${esc(s.url)} · ${esc(s.state)}</p><label>Collection<input name="collection" maxlength="60" required value="${esc(s.collection)}"></label><button type="submit">Save collection</button><p role="status"></p></form>`).join('')||(attached.length?'':'<p>Inbox is empty. Sources are not set yet.</p>')}`;
 }
 const target=root.querySelector('.article-body')??root;target.append(area);
 area.querySelectorAll('[data-arrival-place]').forEach(b=>b.onclick=()=>related?.(b.dataset.arrivalPlace));
 area.querySelectorAll('[data-archive-source]').forEach(form=>form.onsubmit=async e=>{e.preventDefault();try{await records.organize(form.dataset.archiveSource,new FormData(form).get('collection'),personId(lens));form.querySelector('[role=status]').textContent='Collection saved. Source connection state is shown above.';changed?.();}catch(error){form.querySelector('[role=status]').textContent=error.message;}});
}
