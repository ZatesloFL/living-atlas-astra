import {recordLabel} from './record-copy.js';
import {kitHTML,bindKit} from './kit-ui.js';
import {readingCard} from './standing-view.js';
import {roomVisible} from './rules.js';
import {viewRoom,versionLabel} from './audience.js';
import {layerSelection,mergedLayers,layerBlock,layerConsentKey} from './layers.js';
import {permission} from './permissions.js';
import {ROOMS} from './data.js';
import {doorPolicy} from './admission.js';
import {blockAccess,blockNeedsPreview,selectContent,contentStore} from './content.js';
import {installGallery,sourcedRoom} from './source-catalog.js';
import {bindSourceMedia,connectedMediaHTML,sourceActivityAttributes,sourceBadgeHTML,sourceStateMessage,sourceVisible} from './source-media.js';
installGallery();
export const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export function safeURL(value){if(typeof value!=='string'||!value.trim())return null;try{const url=new URL(value,globalThis.location?.href??'https://atlas.invalid/');return ['https:','http:'].includes(url.protocol)?url.href:null;}catch{return null;}}
const link=(label,url)=>{const href=safeURL(url);return href?`<a href="${esc(href)}" target="_blank" rel="noopener noreferrer">${esc(label)} ↗</a>`:esc(label);};
function sourceHTML(block){
 const cites=(block.type==='citation'?[]:block.sources??[]).map(s=>`<li>${link(s.label,s.url)} · ${esc(s.status??'to verify')}</li>`).join('');
 return `${cites?`<ul class="block-sources">${cites}</ul>`:''}${sourceBadgeHTML(block)}`;
}
function media(block){
 const r=block.reps??{},fallback=r.transcript||r.text||r.alt||'No media representation is available.';
 const image=safeURL(r.image||r.poster),unavailable=block.state&&block.state!=='ready';
 const illustration=`<svg class="media-placeholder" role="img" aria-label="${esc(r.alt||fallback)}" viewBox="0 0 600 200"><rect width="600" height="200" rx="14" fill="#203e49"/><path d="M0 170 150 105 230 160 390 60 600 160V200H0Z" fill="#496e6c"/><circle cx="460" cy="58" r="20" fill="#d8c79c"/><path d="M35 35h135M35 48h80" stroke="#86b1ac" stroke-width="3"/></svg>`;
 let visual=image&&!unavailable?`<img src="${esc(image)}" alt="${esc(r.alt||fallback)}" loading="lazy" data-media-fallback="${esc(fallback)}">`:illustration;
 const file=safeURL(r[block.type]);
 if(['audio','video'].includes(block.type)&&file&&!unavailable)visual=`<${block.type} controls preload="metadata" src="${esc(file)}" ${image?`poster="${esc(image)}"`:''} data-media-fallback="${esc(fallback)}"></${block.type}>`;
 return `<figure>${visual}<figcaption>${esc(block.body)} · ${(image||file)&&!unavailable?'Media representation':'Generated placeholder, not archival media'}<br>Credit: ${esc((image||file)&&!unavailable?r.credit??'Not supplied · to verify':'Generated placeholder by Living Atlas')}</figcaption><p>${esc(fallback)}</p>${r.alt?`<p class="muted">Description: ${esc(r.alt)}</p>`:''}</figure>`;
}
export function blockHTML(block,room,lens,{approved=false,softApproved=new Set()}={}){
 if(block.filtered)return `<section class="content-block block-withheld" data-block-id="${esc(block.id)}"><p>${block.filteredBy?`Excluded from display by ${esc(block.displayBy??'Place Steward')} · receipted Place choice. The original and its readings are unchanged.`:'Filtered view · this Thing is withheld by your Lens. The original has not been changed.'}</p></section>`;
 if(!sourceVisible(block,room,lens))return '';
 const access=blockAccess(block,room,lens);if(access.withheld)return blockHTML({id:block.id,filtered:true,...(access.displayExcluded?{filteredBy:'Place Steward',displayBy:access.displayBy}:{})},room,lens);if(access.hidden)return '';
 if(blockNeedsPreview(block,room,lens,{approved,softApproved}))return `<section class="content-block block-preview" data-block-id="${esc(block.id)}"><p>Preview required · ${esc(access.reasons.join(', '))} exceeds your soft limit.</p><button data-allow-block="${esc(block.id)}">Show this block</button></section>`;
 const sourceState=sourceStateMessage(block);
 if(sourceState)return `<section class="content-block" data-block-id="${esc(block.id)}" data-block-type="${esc(block.type)}"><p class="block-load-status" role="status">${esc(sourceState)}</p>${sourceBadgeHTML(block)}</section>`;
 const body=block.body;let html='';
 if(block.state==='pending'||block.state==='error'||block.state==='unavailable')html+=`<p class="block-load-status" role="status">${block.state==='pending'?'Content is arriving. Showing the available fallback.':block.state==='error'?'Content could not be loaded. Showing the available fallback.':'Media is not attached. Showing the available fallback.'}</p>`;
 const sourcedMedia=connectedMediaHTML(block,room),provenance=sourceHTML(block);
 const editorialKit=sourcedMedia===null&&block.exhibit&&block.exhibitEditorial===true;
 if(sourcedMedia!==null)html+=sourcedMedia;else if(block.exhibit)html+=kitHTML(block,room,{provenance:editorialKit?provenance:''});else switch(block.type){
 case 'heading':html+=`<h2>${esc(body)}</h2>`;break;
 case 'text':html+=`${block.sectionHeading?`<h2>${esc(block.title)}</h2>`:''}<p>${esc(body??block.reps?.text??'Content not yet available.')}</p>`;break;
 case 'infobox':html+=`<dl class="article-infobox">${Object.entries(body??{}).map(([k,v])=>`<div><dt>${esc(k)}</dt><dd>${esc(v)}</dd></div>`).join('')}</dl>`;break;
 case 'timeline':html+=`<ol class="article-timeline">${(Array.isArray(body)?body:[]).map(e=>`<li><strong>${esc(e.date)}</strong><p>${esc(e.text)}</p></li>`).join('')}</ol>`;break;
 case 'quote':html+=`<blockquote><p>${esc(body?.text??body)}</p><footer>${esc(body?.attribution??'')}</footer></blockquote>`;break;
 case 'data':html+=`<div class="article-table"><table>${(Array.isArray(body)?body:[]).map(row=>`<tr>${(Array.isArray(row)?row:Object.values(row)).map(v=>`<td>${esc(v)}</td>`).join('')}</tr>`).join('')}</table></div>`;break;
 case 'map':html+=`<div class="article-map"><span aria-hidden="true">⌖</span><strong>${esc(body?.label)}</strong><p>${esc(body?.lat)}, ${esc(body?.lng)} · ${esc(body?.status??'to verify')}</p><p>${esc(body?.note??block.reps?.text)}</p></div>`;break;
 case 'link':html+=body?.room?`<button class="related-room" data-related="${esc(body.room)}">${esc(body.label??ROOMS[body.room]?.title)} ↗</button><p class="muted">${esc(body.note)}</p>`:link(body?.label,body?.url);break;
 case 'citation':html+=`<p class="article-citation">${link(body?.label,body?.url)} · <span class="citation-status">${esc(body?.status??'to verify')}</span><br>${esc(body?.note??'Source to verify')}</p>`;break;
 case 'image':case 'video':case 'audio':case 'model':html+=media(block);break;
 default:html+=`<p>${esc(block.reps?.text??block.reps?.alt??'Content representation not yet available.')}</p>`;
 }
 return `<section class="content-block" data-block-id="${esc(block.id)}" data-block-type="${esc(block.type)}"${sourceActivityAttributes(block,room,lens)}>${html}${block.contribution?`<p class="contributor-credit">${block.contribution.merged?'Official contribution':'Integrated layer'} · ${esc(block.contribution.type)} · credited to ${esc(block.contribution.name)}</p>`:''}${editorialKit?'':provenance}${block.content&&!block.contribution?readingCard(room,lens,block):''}</section>`;
}
export function articleHTML(id,lens,options={}){
 const original=ROOMS[id],visible=original&&viewRoom(original,lens);if(!visible||visible.visibility==='private'||!permission(visible,lens).canLook)return '<p>Private space, something is here.</p>';if(!roomVisible(id,lens))return '<p>This room is outside your lens.</p>';
 if(doorPolicy(visible,lens).blocked)return '<p>Entrance threshold not met. Review this Place’s doorway before reading.</p>';
 const room=sourcedRoom(visible,lens);
 const merged=mergedLayers(room,lens),accepted=layerSelection(room,lens).filter(x=>x.accepted&&!merged.includes(x.layer)).map(x=>x.layer);
 const softApproved=new Set([...(options.softApproved??[]),...accepted.filter(l=>lens.layerConsents?.[l.id]===layerConsentKey(lens)).map(l=>'layer-'+l.id)]);
 const view=selectContent(room,lens,[...contentStore.blocks(id,room.blocks),...merged.map(l=>layerBlock(l,true)),...accepted.map(l=>layerBlock(l))]);
 return `${versionLabel(room,lens)?`<p class="audience-label">${esc(versionLabel(room,lens))}</p>`:''}${view.omitted.trust?`<p class="reason">Supporting records from ${esc(recordLabel(lens.trustFrom))}: ${view.omitted.trust} supporting blocks lack that review and are omitted. Core author content remains visible; it is not independently verified.</p>`:''}${view.blocks.map(b=>blockHTML(b,room,lens,{...options,softApproved})).join('')||'<p>No blocks match this Lens and Depth.</p>'}`;
}
export function bindBlocks(root,{related,allow}={}){
 bindKit(root);
 bindSourceMedia(root);
 root.querySelectorAll('[data-related]').forEach(b=>b.onclick=()=>related?.(b.dataset.related));root.querySelectorAll('[data-allow-block]').forEach(b=>b.onclick=()=>allow?.(b.dataset.allowBlock));
 root.querySelectorAll('[data-media-fallback]').forEach(el=>el.addEventListener('error',()=>{const p=document.createElement('p');p.className='block-load-status';p.textContent='Media unavailable. '+el.dataset.mediaFallback;el.replaceWith(p);},{once:true}));
}
