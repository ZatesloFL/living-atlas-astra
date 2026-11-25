import assert from 'node:assert/strict';
import test from 'node:test';
import {createAI} from '../src/ai.js';
import {scores,pair} from '../src/scores.js';
import {SourcesUI} from '../src/sources-ui.js';
import {proposeUploadScores} from '../src/upload-scores.js';

const uploadId = '835dafd2-e921-4c00-b9f6-dc1c1aaba4f4';
const receiptId = 'c741ddf8-2d29-4675-b250-6841c98c63d8';
const model = 'anthropic/claude-haiku-5-5';
const agentId = 'upload-declaration-helper';
const item = {id:uploadId,contentType:'image/png',state:'uploaded',filename:'held-photo.png'};
const room = {id:'home/example/drive'};
const dials = scores({violence:pair(2,1)});
const assessment = {
  proposal:{kind:'upload-scores',basis:'image',scores:dials,
    observation:'The photo shows two people practicing with padded swords.',descriptionDisagrees:true},
  model,
  receiptData:{provider:'anthropic',job:'background',model,agentId,receiptId}
};

test('Photo scoring sends a hosted record ID and the description through the shared AI boundary', async () => {
  const controller = new AbortController();
  const client = createAI({
    requestPhotoScores: async request => {
      assert.deepEqual(request,{id:uploadId,description:'Landscape only.',signal:controller.signal});
      return structuredClone(assessment);
    },
    transport:{eligible:()=>assert.fail('The photo reached the guide')}
  });
  const result = await proposeUploadScores(client,{
    file:{slice:()=>assert.fail('The photo was read by the browser scorer')},
    item, room, signal:controller.signal, description:' Landscape only. '
  });
  assert.equal(result.basis,'image');
  assert.deepEqual(result.scores,dials);
  assert.equal(result.proposalReceiptId,receiptId);
  assert.equal(result.observation,assessment.proposal.observation);
  assert.equal(result.descriptionDisagrees,true);
  assert.match(result.provenance,/Live/);
});

test('Photos stay unpublished if scoring is unavailable or the proposal has no valid live Receipt', async () => {
  const forbiddenGuide = {eligible:()=>assert.fail('The photo was routed to the guide')};
  const unavailable = createAI({
    requestPhotoScores:()=>{throw new Error('Live photo scoring unavailable.');},
    transport:forbiddenGuide
  });
  await assert.rejects(proposeUploadScores(unavailable,{item,room}),/live photo scoring unavailable/i);
  for (const receiptData of [undefined,{...assessment.receiptData,provider:'simulated'}]) {
    const forged = createAI({requestPhotoScores:()=>({...assessment,receiptData}),transport:forbiddenGuide});
    await assert.rejects(proposeUploadScores(forged,{item,room,description:'A landscape.'}),/invalid live photo proposal receipt/i);
  }
});

test('A recovered photo proposal identifies its original description comparison', async () => {
  const client = createAI({requestPhotoScores:()=>({...assessment,
    receiptData:{...assessment.receiptData,cached:true}})});
  const result = await proposeUploadScores(client,{item,room,description:''});
  assert.equal(result.proposalReceiptId,receiptId);
  assert.equal(result.descriptionDisagrees,true);
  assert.match(result.provenance,/original description comparison/);
});

test('Photo observations and disagreement flags are validated independently of the dials',async()=>{
  for (const proposal of [
    {...assessment.proposal,observation:'😀'.repeat(381)},
    {...assessment.proposal,observation:'  '},
    {...assessment.proposal,descriptionDisagrees:'true'},
    {...assessment.proposal,caption:'Invented field'}
  ]) {
    const client=createAI({requestPhotoScores:()=>({...assessment,proposal})});
    await assert.rejects(proposeUploadScores(client,{item,room,description:'A landscape.'}),/invalid .*proposal/i);
  }
});

test('Audio stays unpublished without requesting an AI proposal',async()=>{
  await assert.rejects(proposeUploadScores({request:()=>assert.fail('The audio reached an AI route')},{
    item:{...item,contentType:'audio/mpeg'},room,description:'An owner-supplied transcript.'
  }),/audio scoring is unavailable.*unpublished/i);
});

test('Owner review exposes the image observation and conflict, and rejects old simulated image suggestions',()=>{
  const ui=new SourcesUI({storage:{getItem:()=>null,setItem:()=>{}}});
  ui.context={actorId:'owner'};
  ui.saveProposal(uploadId,{scores:scores(),provenance:'Simulated · description only.'});
  assert.doesNotMatch(ui.renderUpload(item),/Confirm declaration and publish/);
  assert.match(ui.renderUpload(item),/Ask the Atlas to propose a declaration/);

  ui.saveProposal(uploadId,{
    basis:'image',scores:dials,model,provenance:'Live · proposed from the uploaded image.',
    proposalReceiptId:receiptId,observation:'A sword & shield.',descriptionDisagrees:true
  });
  const review=ui.renderUpload(item);
  assert.match(review,/Image and description disagree/);
  assert.match(review,/What the Atlas saw<\/strong> A sword &amp; shield/);
  assert.match(review,/Confirm declaration and publish/);
  assert.doesNotMatch(ui.renderUpload({...item,contentType:'audio/mpeg'}),/Confirm declaration and publish/);
});
