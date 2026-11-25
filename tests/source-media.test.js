import test from 'node:test';
import assert from 'node:assert/strict';
import {ROOMS,createLens} from '../src/data.js';
import {blockHTML} from '../src/block-renderer.js';
import {heroHTML} from '../src/presentation.js';
import {configureSourceMedia,readHostedPhotoPreview,videoReference,videoReferenceHTML} from '../src/source-media.js';

const l={...createLens(),profileId:'media-owner',depth:'Deep'};
const source={sourceId:'test-source',itemId:'test-item',label:'Source fixture',rights:'rights-reserved',mode:'live',status:'ready'};
const block={id:'live-fixture',type:'image',importance:'core',body:'Stale source body',reps:{image:'https://example.invalid/stale.jpg',alt:'Stale source art'},source};

test('Video embeds allowlist YouTube and Vimeo and defer host traffic until activation',()=>{
 const youtube=videoReference('https://youtu.be/dQw4w9WgXcQ?t=5');
 assert.deepEqual(youtube,{provider:'YouTube',id:'dQw4w9WgXcQ',url:'https://www.youtube.com/watch?v=dQw4w9WgXcQ',embedURL:'https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ'});
 assert.equal(videoReference('https://vimeo.com/123456/a2ca32e')?.embedURL,'https://player.vimeo.com/video/123456?h=a2ca32e');
 for(const value of ['https://youtube.com.attacker.invalid/watch?v=dQw4w9WgXcQ','https://user@youtu.be/dQw4w9WgXcQ','https://youtube.com:3000/watch?v=dQw4w9WgXcQ','https://example.net/movie.mp4','javascript:alert(1)']){
  assert.equal(videoReference(value),null,value);
 }
 const html=videoReferenceHTML({type:'video',source,reps:{video:youtube.url}});
 assert.match(html,/data-source-player="https:\/\/www.youtube-nocookie.com\/embed\//);
 assert.doesNotMatch(html,/<iframe|<video|\ssrc=/);
});

test('A dead or revoked reference shows its state without a stale body, representation, or source link',()=>{
 const room={...ROOMS.studio,presentation:{heroBlock:'live-fixture'}};
 for(const status of ['unavailable','revoked']){
  const changed={...block,source:{...source,status,url:'https://example.invalid/source'}};
  const html=blockHTML(changed,room,l,{approved:true});
  assert.match(html,status==='revoked'?/Source access was revoked/:/Source reference is unavailable/);
  assert.doesNotMatch(html,/Stale source|example.invalid/);
  const hero=heroHTML({...room,blocks:[changed]},l,{approved:true});
  assert.match(hero,status==='revoked'?/Source access was revoked/:/Source reference is unavailable/);
  assert.doesNotMatch(hero,/Stale source|example.invalid/);
 }
});

test('Hosted photos show upload date and a private byte-read control to their owner',()=>{
 const hosted={...block,body:'Your photo',sourceMedia:{kind:'image'},source:{...source,kind:'upload',owner:'media-owner',uploadedAt:'2026-11-24T14:00:00.000Z',mode:'snapshot'}};
 const html=blockHTML(hosted,ROOMS.studio,l,{approved:true});
 assert.match(html,/uploaded copy, as of 2026-11-24/);
 assert.match(html,/data-managed-source="image"/);
 assert.match(html,/Open original photo/);
 assert.doesNotMatch(html,/example.invalid|\ssrc=/);
 assert.equal(blockHTML(hosted,ROOMS.studio,{...l,profileId:'other'},{approved:true}),'');
 assert.equal(blockHTML(hosted,ROOMS.studio,{...l,isAgent:true},{approved:true}),'');
});

test('3D requests only the sized hosted preview after checking current source rights and availability',async()=>{
 const hosted={...block,source:{...source,kind:'upload',owner:'media-owner'}};
 const bytes=new Blob(['preview fixture'],{type:'image/jpeg'});
 const calls=[];
 configureSourceMedia({fetchBytes:async payload=>{calls.push(payload);return bytes;}});
 try {
  await assert.rejects(readHostedPhotoPreview(hosted,ROOMS.studio,{...l,profileId:'other'}),/unavailable/);
  await assert.rejects(readHostedPhotoPreview({...hosted,source:{...hosted.source,status:'deleted'}},ROOMS.studio,l),/unavailable/);
  await assert.rejects(readHostedPhotoPreview(hosted,ROOMS.studio,l,{signal:AbortSignal.abort()}),{name:'AbortError'});
  assert.deepEqual(calls,[]);
  assert.equal(await readHostedPhotoPreview(hosted,ROOMS.studio,l),bytes);
  assert.deepEqual(calls,[{placeId:ROOMS.studio.id,sourceId:'test-source',itemId:'test-item',variant:'preview',signal:undefined}]);
 } finally {configureSourceMedia();}
});
