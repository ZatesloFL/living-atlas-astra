import {artSVG,artURL} from './kit-art.js';

const escapeHTML=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const youtubeHosts=new Set(['youtube.com','www.youtube.com','m.youtube.com','youtu.be','www.youtu.be','youtube-nocookie.com','www.youtube-nocookie.com']);
const vimeoHosts=new Set(['vimeo.com','www.vimeo.com','player.vimeo.com']);
const modes={live:'Live reference',indexed:'Fed by the source',snapshot:'Snapshot'};
const sourceActor=lens=>lens?.profileId??lens?.id??'visitor';
const failedStates={
 pending:'Source content is arriving.',
 loading:'Source content is arriving.',
 dead:'Source reference is unavailable.',
 unavailable:'Source reference is unavailable.',
 missing:'Source reference is unavailable.',
 error:'Source content could not be loaded.',
 revoked:'Source access was revoked.',
 forbidden:'Source access was revoked.',
 deleted:'The owner deleted this uploaded copy.',
 offline:'Source is offline.'
};

let mediaOptions={};
export function configureSourceMedia(options={}){mediaOptions={...options};}

function webURL(input,base=undefined){
 if(typeof input!=='string'||!input.trim())return null;
 try{
  const url=new URL(input,base);
  return ['https:','http:'].includes(url.protocol)&&!url.username&&!url.password?url:null;
 }catch{return null;}
}

export function videoReference(input){
 const url=webURL(input);
 if(!url||url.port)return null;
 const [first,second,extra]=url.pathname.split('/').slice(1);
 if(youtubeHosts.has(url.hostname)){
  let id=null;
  if(url.hostname==='youtu.be'||url.hostname==='www.youtu.be')id=extra===undefined&&second===undefined?first:null;
  else if(first==='watch'&&second===undefined&&!url.hostname.includes('nocookie'))id=url.searchParams.get('v');
  else if(['embed','shorts','live'].includes(first)&&extra===undefined)id=second;
  if(!/^[\w-]{11}$/.test(id??''))return null;
  return {provider:'YouTube',id,url:'https://www.youtube.com/watch?v='+id,embedURL:'https://www.youtube-nocookie.com/embed/'+id};
 }
 if(vimeoHosts.has(url.hostname)){
  const player=url.hostname==='player.vimeo.com';
  if(extra!==undefined||player&&first!=='video')return null;
  const id=player?second:first,hash=player?url.searchParams.get('h'):second;
  if(!/^\d{1,16}$/.test(id??'')||hash&&!/^[a-f\d]{6,64}$/i.test(hash))return null;
  return {provider:'Vimeo',id,url:'https://vimeo.com/'+id+(hash?'/'+hash:''),embedURL:'https://player.vimeo.com/video/'+id+(hash?'?h='+hash:'')};
 }
 return null;
}

export const isUploadSource=source=>source?.kind==='upload'||!!source?.uploadedAt;
export function connectedSource(block){
 const p=block?.source;
 return !!p&&(!!block.sourceMedia||!!p.syncMode||!!p.mode||!!p.simulated||!!p.status||isUploadSource(p));
}

export function sourceVisible(block,room,lens){
 if(!connectedSource(block))return true;
 const source=block.source;
 const actor=sourceActor(lens);
 if((isUploadSource(source)||source.visibility==='private')&&(!source.owner||source.owner!==actor))return false;
 if(isUploadSource(source)&&lens?.isAgent)return false;
 try{return !mediaOptions.canRead||mediaOptions.canRead({block,room,lens})===true;}catch{return false;}
}

export function sourceStateMessage(block){
 if(!connectedSource(block))return '';
 const source=block.source;
 return (Object.hasOwn(failedStates,source.status)?failedStates[source.status]:null)??(Object.hasOwn(failedStates,block.state)?failedStates[block.state]:'');
}

export function uploadedCopyLabel(source){
 const timestamp=source.uploadedAt??source.syncedAt;
 const date=typeof timestamp==='string'&&/^\d{4}-\d{2}-\d{2}(?:T|$)/.test(timestamp)?timestamp.slice(0,10):null;
 return date?'uploaded copy, as of '+date:'uploaded copy · upload date unavailable';
}

export function sourceBadgeHTML(block){
 const source=block?.source;
 if(!source)return '';
 const label=source.label??source.name??source.sourceId??'Source';
 const state=sourceStateMessage(block),mode=source.syncMode??source.mode;
 const href=state||isUploadSource(source)?null:webURL(source.url,globalThis.location?.href??'https://atlas.invalid/');
 const sourceName=href?'<a href="'+escapeHTML(href.href)+'" target="_blank" rel="noopener noreferrer">'+escapeHTML(label)+' ↗</a>':escapeHTML(label);
 const pieces=[
  'Source: '+sourceName+(source.itemId===undefined||state?'':' / '+escapeHTML(source.itemId)),
  isUploadSource(source)?escapeHTML(uploadedCopyLabel(source)):Object.hasOwn(modes,mode)?modes[mode]:null,
  source.simulated?'Simulated source':null,
  source.syncedAt?'Synced '+escapeHTML(source.syncedAt):'Not synced',
  'Rights: '+escapeHTML(source.rights??'Unknown')
 ];
 return '<p class="source-pointer">'+pieces.filter(Boolean).join(' · ')+'</p>';
}

export function videoReferenceHTML(block){
 const ref=videoReference(block?.sourceMedia?.url??block?.reps?.video??block?.source?.url);
 const message=sourceStateMessage(block);
 if(!ref||message)return '<p class="block-load-status" role="status">'+escapeHTML(message||'Video reference unavailable. Use a YouTube or Vimeo link.')+'</p>';
 const title=String(typeof block.body==='string'?block.body:block?.reps?.alt??'');
 return '<figure class="source-media"><div data-source-player="'+escapeHTML(ref.embedURL)+'" data-source-title="'+escapeHTML(title||ref.provider+' video')+'"><button type="button" data-source-play>Play '+ref.provider+' video</button></div>'+
  '<figcaption>'+escapeHTML(title||ref.provider+' video')+' · Hosted by '+ref.provider+'<br><a href="'+escapeHTML(ref.url)+'" target="_blank" rel="noopener noreferrer">Open on '+ref.provider+' ↗</a></figcaption></figure>';
}

function uploadHTML(block,room){
 const kind=block.sourceMedia?.kind??block.type;
 if(!['image','audio','text'].includes(kind))return '<p class="block-load-status" role="status">Uploaded media type unavailable.</p>';
 const source=block.source;
 const shortLabel=kind==='image'?'Open original photo':kind==='audio'?'Load audio':'Read uploaded text';
 const target=kind==='image'?'<img data-source-object hidden alt="'+escapeHTML(block.reps?.alt??String(block.body??'Uploaded photo'))+'">':kind==='audio'?'<audio data-source-object hidden controls preload="none"></audio>':'<pre data-source-text class="source-text-preview" hidden></pre>';
 return '<figure class="source-media" data-managed-source="'+kind+'" data-source-place="'+escapeHTML(room.id)+'" data-source-id="'+escapeHTML(source.sourceId)+'" data-source-item="'+escapeHTML(source.itemId)+'">'+
  target+'<figcaption>'+escapeHTML(typeof block.body==='string'?block.body:'Uploaded '+kind)+'</figcaption><p data-source-message class="block-load-status" role="status"></p><button type="button" data-source-request="original">'+shortLabel+'</button></figure>';
}

export function connectedMediaHTML(block,room){
 if(isUploadSource(block.source))return uploadHTML(block,room);
 if(block.sourceMedia?.kind==='procedural-gallery'){
  const title=String(block.body??'Simulated gallery item'),alt=block.reps?.alt??title;
  return '<figure class="source-media"><img loading="lazy" width="720" height="440" src="'+escapeHTML(artURL(block.sourceMedia.scene,title))+'" alt="'+escapeHTML(alt)+'"><figcaption>'+escapeHTML(title)+' · Simulated illustration</figcaption></figure>';
 }
 const video=block.sourceMedia?.url??block.reps?.video??block.source?.url;
 if(block.type==='video'&&!block.exhibit&&(connectedSource(block)||videoReference(video)))return videoReferenceHTML(block);
 return null;
}

export function sourceActivityAttributes(block,room,lens){
 if(!block.source?.simulated||sourceStateMessage(block)||!mediaOptions.recordEgress)return '';
 const preview=block.sourceMedia?.kind==='procedural-gallery'?artSVG(block.sourceMedia.scene,String(block.body??'Simulated gallery item')):block.reps?.text??block.body??'';
 const bytes=new TextEncoder().encode(typeof preview==='string'?preview:JSON.stringify(preview)).byteLength;
 return ' data-simulated-bytes="'+bytes+'" data-source-place="'+escapeHTML(room.id)+'" data-source-id="'+escapeHTML(block.source.sourceId)+'" data-source-item="'+escapeHTML(block.source.itemId)+'" data-source-actor="'+escapeHTML(sourceActor(lens))+'"';
}

async function fetchSourceBytes({placeId,sourceId,itemId},variant,signal){
 const fetchBytes=mediaOptions.fetchBytes;
 if(!fetchBytes)throw new Error('Hosted media is unavailable in this session.');
 signal?.throwIfAborted();
 const response=await fetchBytes({placeId,sourceId,itemId,variant,signal});
 if(response instanceof Response&&!response.ok)throw new Error('Source unavailable.');
 const blob=response instanceof Response?await response.blob():response;
 if(!(blob instanceof Blob)||!blob.size)throw new Error('Empty source data.');
 signal?.throwIfAborted();
 return blob;
}

export async function readHostedPhotoPreview(block,room,lens,{signal}={}){
 if(block?.type!=='image'||!isUploadSource(block.source)||sourceStateMessage(block)||!sourceVisible(block,room,lens)){
  throw new Error('The hosted photo is unavailable.');
 }
 const {sourceId,itemId}=block.source;
 const bytes=await fetchSourceBytes({placeId:room.id,sourceId,itemId},'preview',signal);
 if(!/^image\/(?:jpe?g|png|webp)$/i.test(bytes.type))throw new Error('The preview is unavailable.');
 return bytes;
}

const roots=new WeakMap();
const inView=el=>el.isConnected&&!el.closest('[hidden]');
const attribution=el=>({placeId:el.dataset.sourcePlace,sourceId:el.dataset.sourceId,itemId:el.dataset.sourceItem});

function bindPlayer(container,signal){
 const trigger=container.querySelector('[data-source-play]');
 if(!trigger)return;
 trigger.addEventListener('click',()=>{
  const ref=videoReference(container.dataset.sourcePlayer);
  if(!ref)return;
  const player=container.ownerDocument.createElement('iframe');
  player.title=container.dataset.sourceTitle;
  player.className='source-video-frame';
  player.setAttribute('allow','autoplay; encrypted-media; picture-in-picture; fullscreen');
  player.allowFullscreen=true;
  player.setAttribute('sandbox','allow-scripts allow-same-origin allow-presentation');
  player.referrerPolicy='strict-origin-when-cross-origin';
  const url=new URL(ref.embedURL);
  url.searchParams.set('autoplay','1');
  player.src=url.href;
  container.replaceChildren(player);
  player.focus({preventScroll:true});
 },{signal,once:true});
}
function observeVisible(el,fn,signal){
 if(typeof IntersectionObserver==='undefined'){if(inView(el))fn();return;}
 const observer=new IntersectionObserver(entries=>{
  if(!entries.some(entry=>entry.isIntersecting)||!inView(el))return;
  observer.disconnect();
  fn();
 });
 observer.observe(el);
 signal.addEventListener('abort',()=>observer.disconnect(),{once:true});
}
function bindUpload(el,controller,urls){
 const {signal}=controller;
 const kind=el.dataset.managedSource;
 const status=el.querySelector('[data-source-message]');
 const button=el.querySelector('[data-source-request]');
 const object=el.querySelector('[data-source-object]');
 const text=el.querySelector('[data-source-text]');
 let epoch=0,download=null,objectURL=null;
 const clearObject=()=>{
  if(objectURL){URL.revokeObjectURL(objectURL);urls.delete(objectURL);objectURL=null;}
  if(object){object.pause?.();object.removeAttribute('src');object.hidden=true;}
 };
 const load=async variant=>{
  const fetchBytes=mediaOptions.fetchBytes;
  if(!inView(el)||signal.aborted)return;
  if(!fetchBytes){status.textContent='Hosted media is unavailable in this session.';return;}
  const request=++epoch;
  download?.abort();
  download=new AbortController();
  status.textContent=variant==='preview'?'Loading sized photo preview…':'Loading uploaded copy…';
  if(variant==='original')button.disabled=true;
  try{
   const blob=await fetchSourceBytes(attribution(el),variant,download.signal);
   if(kind==='image'&&!/^image\/(?:jpeg|png|webp|gif|avif)$/i.test(blob.type)||kind==='audio'&&!/^audio\//i.test(blob.type)||kind==='text'&&!/^text\/plain(?:;|$)/i.test(blob.type))throw new Error('Unexpected media type.');
   const body=kind==='text'?await blob.text():null;
   if(epoch!==request||signal.aborted||!inView(el))return;
   if(object){
    clearObject();
    objectURL=URL.createObjectURL(blob);
    urls.add(objectURL);
    object.src=objectURL;
    object.hidden=false;
   }else{
    text.textContent=body;
    text.hidden=false;
   }
   status.textContent=variant==='preview'?'Sized photo preview.':'Uploaded copy loaded.';
   if(variant==='original')button.hidden=true;
  }catch{
   if(epoch!==request||signal.aborted||!inView(el))return;
   clearObject();
   status.textContent=variant==='preview'?'Sized photo preview unavailable. You can open the original.':'Uploaded media is unavailable or access has been revoked.';
  }finally{if(epoch===request&&!signal.aborted)button.disabled=false;}
 };
 signal.addEventListener('abort',()=>download?.abort(),{once:true});
 object?.addEventListener('error',()=>{
  if(!objectURL)return;
  clearObject();
  button.hidden=false;
  status.textContent='The uploaded media could not be displayed.';
 },{signal});
 button.addEventListener('click',()=>load('original'),{signal});
 if(kind==='image')observeVisible(el,()=>{if(epoch===0)load('preview');},signal);
}
export function bindSourceMedia(root){
 roots.get(root)?.();
 const players=[...root.querySelectorAll('[data-source-player]')],uploads=[...root.querySelectorAll('[data-managed-source]')],mock=[...root.querySelectorAll('[data-simulated-bytes]')];
 const elements=[...players,...uploads,...mock];
 if(!elements.length)return;
 const controller=new AbortController(),urls=new Set();
 const cleanup=()=>{
  controller.abort();
  for(const url of urls)URL.revokeObjectURL(url);
  for(const el of uploads)for(const target of el.querySelectorAll('[data-source-object],[data-source-text]')){
   target.pause?.();
   target.removeAttribute('src');target.textContent='';target.hidden=true;
  }
  for(const el of players)el.querySelector('iframe')?.remove();
  observer.disconnect();
  roots.delete(root);
 };
 const observer=new MutationObserver(()=>{
  if(root.hidden||elements.every(el=>!inView(el)))cleanup();
 });
 observer.observe(root,{childList:true,subtree:true,attributes:true,attributeFilter:['hidden']});
 roots.set(root,cleanup);
 for(const el of players)bindPlayer(el,controller.signal);
 for(const el of uploads)bindUpload(el,controller,urls);
 for(const el of mock)observeVisible(el,()=>{
  try{Promise.resolve(mediaOptions.recordEgress?.({...attribution(el),actorId:el.dataset.sourceActor,variant:'preview',bytes:Number(el.dataset.simulatedBytes),scope:'simulated'})).catch(()=>{});}catch{}
 },controller.signal);
}
