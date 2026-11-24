import {artURL} from './kit-art.js';
import {selectContent,blockNeedsPreview} from './content.js';
import {identityBadge,authorName} from './identity.js';
import {esc,safeURL} from './block-renderer.js';
import {sourcedRoom} from './source-catalog.js';
import {connectedSource,isUploadSource,sourceBadgeHTML,sourceStateMessage,sourceVisible} from './source-media.js';

export function presentationFor(room){
 const preset=room.presentation??{};
 return {
  theme:['exhibition','editorial','notebook'].includes(preset.theme)?preset.theme:room.district==='history'?'editorial':'notebook',
  accent:/^#[0-9a-f]{6}$/i.test(preset.accent)?preset.accent:room.district==='history'?'#ab6441':'#367366',
  heroBlock:typeof preset.heroBlock==='string'?preset.heroBlock:room.blocks?.find(b=>['image','video'].includes(b.type))?.id??null
 };
}

export function heroHTML(room,lens,options={}){
 const resolved=sourcedRoom({...room,blocks:options.blocks??room.blocks},lens),p=presentationFor(resolved);
 const readable=selectContent(resolved,lens).blocks.filter(b=>sourceVisible(b,resolved,lens)&&!blockNeedsPreview(b,resolved,lens,options));
 // Never use the unversioned room summary: the dek is an excerpt of readable
 // authored prose, after audience, Show, Trust, Depth and consent filtering.
 const textBlocks=readable.filter(b=>b.type==='text'&&!sourceStateMessage(b)&&!isUploadSource(b.source));
 const lead=textBlocks.find(b=>/(^|-)lead$/.test(b.id))??textBlocks.find(b=>b.importance==='core');
 const text=String(lead?.body??lead?.reps?.text??'A place to read, explore and connect.');
 const dek=text.split(/(?<=[.!?])\s+/).slice(0,2).join(' ');
 const block=readable.find(b=>b.id===p.heroBlock),sourceState=sourceStateMessage(block),ready=block&&!sourceState&&(!block.state||block.state==='ready');
 const photo=ready?block.exhibit?.settings.photos?.[0]:null,slide=ready?block.exhibit?.settings.slides?.[0]:null;
 const represented=ready&&!isUploadSource(block.source)&&safeURL(block.reps?.image||block.reps?.poster);
 const title=photo?.title??slide?.title??room.title;
 const src=represented||artURL(photo?.scene??slide?.scene??(room.district==='history'?0:4),title);
 const alt=represented?block.reps?.alt:photo?.alt??(slide?'Generated sample scene: '+slide.title:'Generated illustration for '+room.title);
 const credit=represented?(block.reps?.credit??'Media credit not supplied · to verify'):photo?.credit??'Generated illustration by Living Atlas · not archival media or a historical reconstruction';
 const source=block?.source;
 const status=source&&!connectedSource(block)?`Source ${source.syncedAt?'synced '+source.syncedAt:'not synced'} · Rights: ${source.rights??'Unknown'}`:'';
 const unavailable=block?.state&&block.state!=='ready';
 const authors=room.authors??[room.author];
 const organization=room.organizationBadge?.label==='Verified organization'&&room.organizationBadge.simulated===true;
 const verification=organization?'Verified organization · Simulated source':`Sample exhibit · ${room.district==='history'?'historical claims and sources to verify':'content and identity signals are simulated'}`;
 return `<header class="article-hero"><p class="article-kicker">Living Atlas / ${p.theme==='exhibition'?'Digital exhibition':p.theme==='editorial'?'Places & perspectives':'Field notebook'}</p><p class="address">${esc(room.address)}</p><h1 id="page-article-title">${esc(room.title)}</h1><p class="article-dek">${esc(dek)}</p><div class="article-byline">${authors.filter(Boolean).map(a=>`<span><strong>${esc(authorName(a))}</strong><small>${esc(identityBadge(a))}</small></span>`).join('')}</div><p class="verification-badge">${verification}</p><figure class="article-hero-image"><img src="${esc(src)}" alt="${esc(alt??'Media description not supplied')}" width="720" height="440" fetchpriority="high" data-media-fallback="The article and its text descriptions remain available."><figcaption>${photo||slide?'Sample media · real archive to connect<br>':''}${esc(credit)}${status?`<br>${esc(status)}`:''}${connectedSource(block)?sourceBadgeHTML(block):''}${sourceState?`<span role="status">${esc(sourceState)}</span>`:unavailable?`<br><span role="status">${block.state==='pending'?'Hero media is arriving.':'Hero media is unavailable.'} Showing a generated illustration.</span>`:''}</figcaption></figure></header>`;
}
