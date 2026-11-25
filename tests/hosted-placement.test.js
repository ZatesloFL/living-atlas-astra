import test from 'node:test';
import assert from 'node:assert/strict';
import {articleHTML} from '../src/block-renderer.js';
import {registerProjection} from '../src/build-projection.js';
import {validateBuilderPiece} from '../src/builder-pieces.js';
import {Builder,BUILDER_STORAGE} from '../src/builder.js';
import {connectedSources} from '../src/connected-sources.js';
import {PRESETS,ROOMS} from '../src/data.js';
import {scores} from '../src/scores.js';
import {makeSourcePiece,recordUploadInventory,sourcedRoom,subscribeHostedSourceChanges} from '../src/source-catalog.js';

function place(){
  const id='hosted-place-'+crypto.randomUUID(), ownerId='test-owner-'+crypto.randomUUID();
  registerProjection({
    projection:{schemaVersion:2,rootPlaceId:id,rooms:[{placeId:id,parentPlaceId:null,
      pathIds:[],pieces:[],behaviors:[],layout:{kind:'courtyard'}}]},
    changes:[{op:'create',kind:'Place',ref:{placeId:id},fields:{
      title:'Hosted source studio',visibility:'public',content:scores(),blocks:[]
    }}]
  },{ownerId});
  const lens={...structuredClone(PRESETS.Adult),profileId:ownerId,depth:'Deep',age:30,
    show:{real:true,pseudonym:true,anonymous:true,agent:true}};
  return {id,ownerId,lens,room:ROOMS[id]};
}

function uploadedPhoto(placeId){
  return {id:crypto.randomUUID(),placeId,sourceId:'photo-'+crypto.randomUUID(),filename:'Photo of the Atlas courtyard',
    contentType:'image/jpeg',state:'published',scores:scores({viewpoint:{amount:1,graphicness:0}}),
    snapshotReceiptId:'snapshot-receipt',declarationReceiptId:'declaration-receipt',
    sha256:'a'.repeat(64),uploadedAt:'2026-11-24T17:00:00Z'};
}

test('Builder saves and republishes hosted placement references and resolves current dials and source rights',async()=>{
  const {id,ownerId,lens,room}=place(), other={...lens,profileId:'another'};
  const photo=uploadedPhoto(id);
  const video=await connectedSources.addVideoReference({
    placeId:id,owner:ownerId,title:'Video of the Atlas courtyard',url:'https://youtu.be/dQw4w9WgXcQ',visibility:'public'
  },{actorId:ownerId});
  const videoBlock=connectedSources.view(video.id).blocks[0];
  const photoRef={kind:'upload',sourceId:photo.sourceId,itemId:photo.id};
  const videoRef={kind:'video',sourceId:video.id,itemId:videoBlock.source.itemId};

  recordUploadInventory([{...photo,state:'uploaded',declarationReceiptId:null}],lens);
  assert.throws(()=>makeSourcePiece(room,lens,photoRef),/unavailable/);
  recordUploadInventory([photo],lens);
  assert.throws(()=>makeSourcePiece(room,other,photoRef),/your Place/);
  assert.throws(()=>makeSourcePiece({...room,id:'another-place'},lens,photoRef),/unavailable/);
  assert.throws(()=>makeSourcePiece(room,lens,{...photoRef,itemId:crypto.randomUUID()}),/unavailable/);

  let saved=null;
  const disk={getItem:key=>key===BUILDER_STORAGE?saved:null,setItem:(key,value)=>{saved=value;}};
  const builder=new Builder({storage:()=>disk});
  await builder.placeSource(id,lens,photoRef);
  await builder.placeSource(id,lens,videoRef);
  const draft=builder.open(id,lens);
  const [placedPhoto,placedVideo]=draft.pieces;
  assert.deepEqual(placedPhoto.ref,{placeId:id,thingId:photo.sourceId});
  assert.deepEqual(placedVideo.ref,{placeId:id,thingId:videoBlock.id});
  assert.equal(placedPhoto.kind,'hosted-photo');
  assert.equal(placedVideo.kind,'hosted-video');
  assert.throws(()=>validateBuilderPiece({...placedPhoto,block:{...placedPhoto.block,reps:{image:'https://invalid.example/photo'}}},{placeId:id}),/only reference/);
  assert.throws(()=>validateBuilderPiece({...placedPhoto,block:{...placedPhoto.block,content:photo.scores}},{placeId:id}),/only reference/);
  assert.throws(()=>validateBuilderPiece({...placedPhoto,ref:{...placedPhoto.ref,placeId:'another-place'}},{placeId:id}),/only reference/);

  const actualDraft=sourcedRoom(builder.roomFor(id,lens),{...lens,preview:true});
  assert.deepEqual(actualDraft.blocks.find(block=>block.id===photo.sourceId).content.viewpoint,{amount:1,graphicness:0});
  assert.equal(actualDraft.blocks.find(block=>block.id===photo.sourceId).standing.declarationRef.receiptRef,'declaration-receipt');
  assert.equal(actualDraft.builderFixtures.filter(fixture=>fixture.block===photo.sourceId).length,1);
  const guestDraft=sourcedRoom(builder.roomFor(id,lens),{...other,preview:true});
  assert.ok(!guestDraft.blocks.some(block=>block.id===photo.sourceId||block.id===placedPhoto.id));
  assert.deepEqual(guestDraft.builderFixtures.map(fixture=>fixture.block),[videoBlock.id]);

  await builder.duplicate(id,lens,placedPhoto.id);
  await builder.preview(id,lens,lens);
  await builder.publish(id,lens);
  const read=sourcedRoom(ROOMS[id],lens);
  assert.equal(read.blocks.filter(block=>block.id===photo.sourceId).length,1);
  assert.equal(read.builderFixtures.filter(fixture=>fixture.block===photo.sourceId).length,2);
  assert.match(articleHTML(id,lens),/uploaded copy, as of 2026-11-24/);
  assert.match(articleHTML(id,other),/data-source-player="https:\/\/www\.youtube-nocookie\.com\/embed\//);
  assert.doesNotMatch(articleHTML(id,other),/Photo of the Atlas courtyard|data-managed-source/);
  assert.doesNotMatch(saved,/Photo of the Atlas courtyard|Video of the Atlas courtyard|youtube\.com|snapshot-receipt|declaration-receipt/);

  await connectedSources.setItemExcluded(video.id,videoBlock.source.itemId,true,{actorId:ownerId});
  assert.ok(!sourcedRoom(ROOMS[id],lens).builderFixtures.some(fixture=>fixture.block===videoBlock.id));
  assert.doesNotMatch(articleHTML(id,lens),/Video of the Atlas courtyard|Source reference is unavailable/);
  await connectedSources.setItemExcluded(video.id,videoBlock.source.itemId,false,{actorId:ownerId});

  recordUploadInventory([{...photo,state:'deleted'}],lens);
  await connectedSources.remove(video.id,{actorId:ownerId});
  const deleted=sourcedRoom(ROOMS[id],lens);
  assert.equal(deleted.blocks.find(block=>block.id===photo.sourceId).state,'deleted');
  assert.equal(deleted.blocks.find(block=>block.id===videoBlock.id).state,'unavailable');
  assert.equal(deleted.builderFixtures.length,3);
  const missingHTML=articleHTML(id,lens);
  assert.match(missingHTML,/owner deleted this uploaded copy/);
  assert.match(missingHTML,/Source reference is unavailable/);
  assert.doesNotMatch(missingHTML,/Photo of the Atlas courtyard|Video of the Atlas courtyard|data-managed-source|data-source-player/);
  assert.match(articleHTML(id,other),/Source reference is unavailable/);
  assert.doesNotMatch(articleHTML(id,other),/uploaded copy|Video of the Atlas courtyard|data-source-player/);
  ROOMS[id]=room;
  await new Builder({storage:()=>disk}).recover(lens);
  assert.equal(sourcedRoom(ROOMS[id],lens).blocks.find(block=>block.id===photo.sourceId).state,'deleted');
  assert.equal(sourcedRoom(ROOMS[id],lens).builderFixtures.length,3);
});

test('Hosted preview refresh scopes inventory changes to the Place, including when only the draft refers to it',async()=>{
  const {id,lens}=place(), photo=uploadedPhoto(id), changes=[];
  const unsub=subscribeHostedSourceChanges(key=>changes.push(key));
  try {
    recordUploadInventory([{...photo,state:'uploaded',declarationReceiptId:null}],lens);
    assert.deepEqual(changes,[]);
    recordUploadInventory([photo],lens);
    let saved=null;
    const builder=new Builder({storage:()=>({getItem:()=>saved,setItem:(key,value)=>{saved=value;}})});
    await builder.placeSource(id,lens,{kind:'upload',sourceId:photo.sourceId,itemId:photo.id});
    assert.equal(builder.open(id,lens).pieces.length,1);
    assert.equal(ROOMS[id].builderFixtures,undefined);
    recordUploadInventory([structuredClone(photo)],lens);
    recordUploadInventory([{...photo,state:'deleted'}],lens);
    assert.deepEqual(changes,[id,id]);
  } finally {unsub();}
});
