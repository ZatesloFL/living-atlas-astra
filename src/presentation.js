import {artURL} from './kit-art.js';
import {selectContent,blockNeedsPreview} from './content.js';
import {identityBadge,authorName} from './identity.js';
import {esc,safeURL} from './block-renderer.js';

export function presentationFor(room){
 const preset=room.presentation??{};
 return {
  theme:['exhibition','editorial','notebook'].includes(preset.theme)?preset.theme:room.district==='history'?'editorial':'notebook',
  accent:/^#[0-9a-f]{6}$/i.test(preset.accent)?preset.accent:room.district==='history'?'#ab6441':'#367366',
  heroBlock:typeof preset.heroBlock==='string'?preset.heroBlock:room.blocks?.find(b=>['image','video'].includes(b.type))?.id??null
 };
}

export function heroHTML(room,lens,options={}){
 const p=presentationFor(room);
 const readable=selectContent(room,lens,options.blocks??room.blocks).blocks.filter(b=>!blockNeedsPreview(b,room,lens,options));
 // Never use the unversioned room summary: the dek is an excerpt of readable
 // authored prose, after audience, Show, Trust, Depth and consent filtering.
 const lead=readable.find(b=>b.type==='text'&&/(^|-)lead$/.test(b.id))??readable.find(b=>b.type==='text'&&b.importance==='core');
 const text=String(lead?.body??lead?.reps?.text??'A place to read, explore and connect.');
 const dek=text.split(/(?<=[.!?])\s+/).slice(0,2).join(' ');
 const block=readable.find(b=>b.id===p.heroBlock),ready=block&&(!block.state||block.state==='ready');
 const photo=ready?block.exhibit?.settings.photos?.[0]:null,slide=ready?block.exhibit?.settings.slides?.[0]:null;
 const represented=ready&&safeURL(block.reps?.image||block.reps?.poster);
 const title=photo?.title??slide?.title??room.title;
 const src=represented||artURL(photo?.scene??slide?.scene??(room.district==='history'?0:4),title);
 const alt=represented?block.reps?.alt:photo?.alt??(slide?'Generated sample scene: '+slide.title:'Generated illustration for '+room.title);
 const credit=represented?(block.reps?.credit??'Media credit not supplied · to verify'):photo?.credit??'Generated illustration by Living Atlas · not archival media or a historical reconstruction';
 const source=block?.source;
 const status=source?`Source ${source.syncedAt?'synced '+source.syncedAt:'not synced'} · Rights: ${source.rights??'Unknown'}`:'';
 const unavailable=block?.state&&block.state!=='ready';
 const authors=room.authors??[room.author];
 return `<header class="article-hero"><p class="article-kicker">Living Atlas / ${p.theme==='exhibition'?'Digital exhibition':p.theme==='editorial'?'Places & perspectives':'Field notebook'}</p><p class="address">${esc(room.address)}</p><h1 id="page-article-title">${esc(room.title)}</h1><p class="article-dek">${esc(dek)}</p><div class="article-byline">${authors.filter(Boolean).map(a=>`<span><strong>${esc(authorName(a))}</strong><small>${esc(identityBadge(a))}</small></span>`).join('')}</div><p class="verification-badge">Sample exhibit · ${room.district==='history'?'historical claims and sources to verify':'content and identity signals are simulated'}</p><figure class="article-hero-image"><img src="${esc(src)}" alt="${esc(alt??'Media description not supplied')}" width="720" height="440" fetchpriority="high" data-media-fallback="The article and its text descriptions remain available."><figcaption>${photo||slide?'Sample media · real archive to connect<br>':''}${esc(credit)}${status?`<br>${esc(status)}`:''}${unavailable?`<br><span role="status">${block.state==='pending'?'Hero media is arriving.':'Hero media is unavailable.'} Showing a generated illustration.</span>`:''}</figcaption></figure></header>`;
}
