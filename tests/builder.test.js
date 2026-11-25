import test from 'node:test';
import assert from 'node:assert/strict';
import {Builder, BUILDER_STORAGE} from '../src/builder.js';
import {registerProjection} from '../src/build-projection.js';
import {ROOMS, EDGES, PRESETS} from '../src/data.js';
import {scores} from '../src/scores.js';
import {verifyChain} from '../src/ledger.js';

const storage=()=>{
  const entries=new Map();
  return {getItem:key=>entries.get(key)??null,setItem:(key,value)=>entries.set(key,value)};
};
function starter(){
  const roomKey='builder-test-'+crypto.randomUUID(), ownerId=roomKey+'-owner';
  registerProjection({
    projection:{schemaVersion:2,rootPlaceId:roomKey,rooms:[{placeId:roomKey,parentPlaceId:null,layout:{kind:'courtyard'},pathIds:[],pieces:[],behaviors:[]}]},
    changes:[{op:'create',kind:'Place',ref:{placeId:roomKey},fields:{
      title:'Cold starter',visibility:'hidden',content:scores(),blocks:[{id:'original',type:'text',importance:'core',body:'Kept starter text'}]
    }}]
  },{ownerId});
  const lens={...structuredClone(PRESETS.Adult),profileId:ownerId,age:30,minAge:0,playAs:'owner',depth:'Deep',show:{real:true,pseudonym:true,anonymous:true,agent:true},identity:{display:'pseudonym',backing:'verified'}};
  return {roomKey,ownerId,lens};
}

test('Owner draft, scripted proposal, preview and publish keep their distinct receipts', async()=>{
  const {roomKey,ownerId,lens}=starter(),disk=storage(),builder=new Builder({storage:()=>disk});
  const baseline=ROOMS[roomKey], paths=EDGES.length;
  assert.throws(()=>builder.open(roomKey,{...lens,profileId:'another'}),/owner/);
  assert.throws(()=>builder.open(roomKey,{...lens,preview:true}),/owner/);
  assert.throws(()=>builder.open(roomKey,{...lens,isAgent:true}),/owner/);
  const grant=await builder.atlasRecords.propose(lens,{kind:'grant',areas:['build'],scope:'edit',durationMs:null},'Standing Build edit');
  await builder.atlasRecords.confirm(lens,grant.id);
  await assert.rejects(builder.propose(roomKey,lens,'Move the bench left'),/no longer/);
  const proposal=await builder.propose(roomKey,lens,'Place a bench');
  assert.equal(builder.open(roomKey,lens).pieces.length,0);
  const draft=await builder.accept(roomKey,lens,proposal.id), [bench]=draft.pieces;
  assert.equal(bench.kind,'bench');
  assert.equal(builder.roomFor(roomKey,lens).blocks.length,2);
  assert.equal(ROOMS[roomKey],baseline);
  await assert.rejects(builder.publish(roomKey,lens),/Preview/);
  const outsider=await builder.preview(roomKey,lens,{...lens,profileId:'another',playAs:'visitor'});
  assert.equal(outsider.checks.canEnter,false);
  assert.deepEqual(outsider.checks.shown,[]);
  const ownView=await builder.preview(roomKey,lens,lens);
  assert.equal(ownView.checks.canEnter,true);
  assert.ok(ownView.checks.shown.includes(bench.id));
  const publication=await builder.publish(roomKey,lens);
  assert.equal(publication.receipt.actor,ownerId);
  assert.equal(publication.draft.dirty,false);
  assert.equal(ROOMS[roomKey].blocks[0].id,'original');
  assert.ok(ROOMS[roomKey].blocks[1].recordVersionId);
  assert.equal(EDGES.length,paths);
  const {receipts}=JSON.parse(disk.getItem(BUILDER_STORAGE));
  assert.deepEqual(receipts.map(e=>[e.action,e.actor]),[
    ['build_proposal_accepted',ownerId],['build_previewed',ownerId],
    ['build_previewed',ownerId],['build_published',ownerId]]);
  assert.ok((await verifyChain(receipts)).valid);
  assert.equal(receipts[0].diff.proposalReceipt,proposal.receiptId);
  const confirmations=builder.atlasRecords.state(lens).receipts;
  assert.ok(confirmations.some(r=>r.action==='atlas_confirmed'&&r.hash===receipts[0].diff.confirmationReceipt));

  // Starting from the same registered initial claim on a reload.
  ROOMS[roomKey]=baseline;
  const recovered=new Builder({storage:()=>disk});
  await recovered.recover(lens);
  assert.equal(ROOMS[roomKey].blocks[1].id,bench.id);
  const edited=await recovered.update(roomKey,lens,bench.id,{transform:{position:[-3,0,3]},block:{style:{preset:'Gallery'}}});
  assert.equal(edited.pieces[0].block.authorLook,'Gallery');
  assert.equal(edited.preview,null);
  await recovered.preview(roomKey,lens,lens);
  await recovered.publish(roomKey,lens);
  const [newer,older]=recovered.history(roomKey,lens);
  assert.notEqual(newer.revisionId,older.revisionId);
  await recovered.restore(roomKey,lens,older.revisionId);
  const restored=recovered.open(roomKey,lens).pieces[0];
  assert.deepEqual(restored.transform,bench.transform);
  assert.equal(recovered.history(roomKey,lens).length,2);
});

test('Named room limits block publication and edits invalidate an earlier preview',async()=>{
  const {roomKey,lens}=starter(), disk=storage(),builder=new Builder({storage:()=>disk});
  await builder.add(roomKey,lens,'screen');
  await builder.preview(roomKey,lens,lens);
  await builder.add(roomKey,lens,'screen');
  assert.equal(builder.open(roomKey,lens).preview,null);
  for (let i=0;i<4;i++) await builder.add(roomKey,lens,'screen');
  await builder.preview(roomKey,lens,lens);
  assert.ok(builder.budget(roomKey,lens).over.some(use=>use.key==='behaviors'));
  await assert.rejects(builder.publish(roomKey,lens),/Room budget exceeded.*behaviors/);
  assert.equal(ROOMS[roomKey].blocks.length,1);
  assert.deepEqual(builder.history(roomKey,lens),[]);
});

test('Failed persistence cannot expose a published draft',async()=>{
  const {roomKey,lens}=starter(), disk=storage(),builder=new Builder({storage:()=>disk});
  await builder.add(roomKey,lens,'lantern');
  await builder.preview(roomKey,lens,lens);
  disk.setItem=()=>{throw new Error('Storage full');};
  await assert.rejects(builder.publish(roomKey,lens),/Storage full/);
  assert.equal(ROOMS[roomKey].blocks.length,1);
  assert.deepEqual(builder.history(roomKey,lens),[]);
});
