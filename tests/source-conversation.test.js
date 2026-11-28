import test from 'node:test';
import assert from 'node:assert/strict';
import {AtlasRecords,ATLAS_RECORDS_KEY} from '../src/atlas-records.js';
import {SourceConversation,SOURCE_CONVERSATION_KEY} from '../src/source-conversation.js';
import {SourceConversationUI} from '../src/source-conversation-ui.js';
import {SourcesUI} from '../src/sources-ui.js';
import {ROOMS} from '../src/data.js';
import {scores} from '../src/scores.js';
import {PHOTO_SCORE_MODEL} from '../src/upload-scores.js';
import {verifyChain} from '../src/ledger.js';

const uploadId = '10000000-0000-4000-8000-000000000001';
const assessmentReceiptId = '10000000-0000-4000-8000-000000000002';
const declaration = {itemId:uploadId,scores:scores(),assessmentReceiptId};
const placement = {reference:{kind:'upload',sourceId:'source-example',itemId:uploadId},position:[2,0,0]};
const quotedPhoto = {id:uploadId,filename:'Study.png',contentType:'image/png',state:'uploaded',sourceId:'source-example'};

function fixture(t){
  const legacy = '{"version":1,"receipts":[{"historical":true}]}';
  const values = new Map([[SOURCE_CONVERSATION_KEY,legacy]]);
  const room = {id:`home/fixture-${crypto.randomUUID()}/drive`,ownerId:'owner',title:'Drive Room'};
  ROOMS[room.id] = room;
  t.after(() => { delete ROOMS[room.id]; });
  const lens = {profileId:room.ownerId,age:30};
  const storage = {getItem:key=>values.get(key)??null,setItem:(key,value)=>values.set(key,value)};
  const records = new AtlasRecords(()=>storage);
  const chain = () => JSON.parse(storage.getItem(ATLAS_RECORDS_KEY) ?? '{"receipts":[]}').receipts;
  const grant = async (areas,scope) => {
    const proposal = await records.propose(lens,{kind:'grant',areas,scope,durationMs:null},'Fixture grant');
    await records.confirm(lens,proposal.id);
    return proposal.id;
  };
  return {room,lens,storage,records,chain,grant,legacy};
}

test('Source proposals, amendments, confirmation, and outcome use the shared Atlas chain',async t=>{
  const {room,lens,storage,records,chain,grant,legacy} = fixture(t);
  const conversation = new SourceConversation(records);
  assert.throws(()=>conversation.begin(room,{profileId:'guest'}),/own/);
  assert.throws(()=>conversation.begin(room,{...lens,isAgent:true}),/own/);
  conversation.begin(room,lens);
  await assert.rejects(conversation.requireScope(),/active suggest grant for sources/i);
  assert.deepEqual(chain(),[]);
  await grant(['sources'],'edit');
  const original = await conversation.propose('declaration',declaration,'Photo assessment');
  const edited = {...declaration,scores:scores({violence:{amount:2,graphicness:0}})};
  const updated = await conversation.amend(edited,'Owner requested an edit');
  assert.notEqual(updated.receipt,original.receipt);
  const result = await conversation.confirm(async proposal=>{
    assert.equal(proposal.kind,'declaration');
    assert.deepEqual(proposal.data,edited);
    const saved = chain().at(-1);
    assert.equal(saved.action,'atlas_confirmed');
    assert.equal(saved.actor,lens.profileId);
    assert.equal(saved.diff.proposalReceipt,updated.receipt);
    assert.equal(saved.hash,proposal.confirmationReceipt);
    return {receiptId:'remote-declaration-fixture',privateDetails:'Local result only'};
  });
  await conversation.end();
  assert.ok((await verifyChain(chain())).valid);
  assert.equal(chain().at(-1).action,'atlas_applied');
  assert.equal(chain().at(-1).diff.result.appliedReceipt,'remote-declaration-fixture');
  assert.doesNotMatch(storage.getItem(ATLAS_RECORDS_KEY),/Local result only/);
  assert.equal(result.receipt,chain().at(-1).hash);
  assert.equal(storage.getItem(SOURCE_CONVERSATION_KEY),legacy);
  assert.equal(records.state(lens).grants.filter(grant=>grant.active).length,1);
});

test('Revoked edit permission blocks applying a prior proposal after preview',async t=>{
  const {room,lens,records,chain,grant} = fixture(t);
  const conversation = new SourceConversation(records);
  conversation.begin(room,lens);
  const grantId = await grant(['sources','build'],'edit');
  await conversation.propose('placement',placement,'Preview a placement');
  await records.revoke(lens,grantId);
  await assert.rejects(conversation.confirm(()=>assert.fail('A revoked grant applied the edit')),/active edit grant for sources/i);
  assert.equal(chain().at(-1).action,'atlas_grant_revoked');
  const pending = conversation.pending;
  await conversation.end();
  assert.equal(chain().at(-1).action,'atlas_declined');
  assert.equal(chain().at(-1).diff.proposalReceipt,pending.receipt);
  assert.equal(chain().filter(row=>row.action==='atlas_confirmed').length,1);
});

test('Chat cannot prepare mapping or upload, and the inspector cannot assess, before the Sources grant',async t=>{
  const {room,lens,records,chain,grant} = fixture(t);
  const blocked = name => () => assert.fail(`${name} reached an actuator`);
  const context = {room,lens,actorId:lens.profileId,placeId:room.id};
  const ui = new SourcesUI({records,proposeScores:blocked('Assessment'),uploads:{media:blocked('Media')}});
  ui.context = context;
  const host = {records,context,uploads:{upload:blocked('Upload')},sources:{planConnection:blocked('Mapping')},emit:blocked('Stage')};
  const chat = new SourceConversationUI(host);
  chat.begin(room,lens);
  await assert.rejects(chat.ask('Connect my mock Drive'),/active suggest grant for sources/i);
  await assert.rejects(chat.attach(new Blob(['private'])),/active suggest grant for sources/i);
  await assert.rejects(ui.score({id:uploadId,contentType:'text/plain'}),/active suggest grant for sources/i);
  assert.deepEqual(chain(),[]);
  await grant(['sources'],'edit');
  await assert.rejects(chat.ask('Place the photo on the left'),/active suggest grant for build/i);
  await assert.rejects(chat.ask('Publish draft'),/active suggest grant for build/i);
});

test('Chat grants require their own yes and closing the Place preserves the shared grant',async t=>{
  const {room,lens,records,chain} = fixture(t);
  const chat = new SourceConversationUI({records,context:{room,lens}});
  chat.begin(room,lens);
  await chat.ask('Give Atlas standing edit access for my sources and Build');
  assert.equal(records.state(lens).grants.length,0);
  assert.equal(chat.conversation.grantProposal.value.scope,'edit');
  assert.deepEqual(new Set(chat.conversation.grantProposal.value.areas),new Set(['build','sources']));
  await chat.ask('Yes.');
  await chat.end();
  assert.equal(records.state(lens).grants.filter(grant=>grant.active).length,1);
  assert.deepEqual(chain().map(row=>row.action),['atlas_proposed','atlas_confirmed','atlas_applied']);
});

test('An edit grant confirmed in a chat cannot authorize a proposal made under a suggest grant',async t=>{
  const {room,lens,records,grant,chain} = fixture(t);
  await grant(['sources'],'suggest');
  const chat = new SourceConversationUI({records,context:{room,lens},publishUpload:()=>assert.fail('The stale proposal reached upload publication')});
  chat.begin(room,lens);
  const prior = await chat.conversation.propose('declaration',declaration,'Declare this photo');
  await assert.rejects(chat.ask('Yes.'),/active edit grant/);
  await chat.ask('Give Atlas standing edit access for my sources');
  await chat.ask('Yes.');
  assert.equal(chat.conversation.pending,null);
  assert.equal(records.state(lens).proposals.find(p=>p.id===prior.id).status,'declined');
  assert.equal(chain().filter(row=>row.action==='atlas_confirmed').length,2);
  assert.match(chat.messages.at(-1).text,/Ask again/);
});

test('An explicit private request applies through the live shared proof, and a visible publication still asks',async t=>{
  const {room,lens,records,chain,storage} = fixture(t);
  room.visibility='hidden';
  await records.ensureStarter(lens);
  const applied=[];
  const context={room,lens,actorId:lens.profileId,placeId:room.id};
  const previewReceiptId='builder:'+ 'a'.repeat(64);
  const host={context,records,storage,hostedItems:[{...quotedPhoto,state:'published'}],
    sources:{list:()=>[]},emit:async(type,detail)=>{
      if(type==='source-preview')return {piece:{transform:{position:detail.position}}};
      if(type==='source-publish-preview')return {checks:{canEnter:false},receipt:{id:previewReceiptId}};
      if(type==='source-placed'||type==='source-publish-confirmed'){
        const action=type==='source-placed'?'place-source':'publish-draft';
        const verified=await records.verifyExtension(lens,{area:'sources',action,placeId:room.id,
          proposalReceipt:detail.proposalReceipt,confirmationReceipt:detail.confirmationReceipt});
        applied.push({action,payload:verified});
        return action==='publish-draft'?{receipt:{id:previewReceiptId}}:{draft:{}};
      }
    }};
  const chat=new SourceConversationUI(host);
  chat.begin(room,lens);
  assert.doesNotMatch(chat.messages[0].text,/give me permission|standing edit access/i);
  const request='Place Study.png on the left';
  await chat.ask(request);
  await chat.ask('Publish draft');
  assert.equal(chat.conversation.pending,null);
  assert.deepEqual(applied,[
    {action:'place-source',payload:{...placement,position:[-2,0,0]}},
    {action:'publish-draft',payload:{previewReceiptId}}]);
  const confirmed=chain().filter(row=>row.action==='atlas_confirmed');
  assert.deepEqual(confirmed.map(row=>row.diff.source),['holder request','holder request']);
  assert.deepEqual(confirmed.map(row=>row.diff.words),[request,'Publish draft']);

  room.visibility='public';
  await chat.ask('Publish draft');
  assert.equal(applied.length,2);
  assert.match(chat.conversation.boundary().reason,/other people can see or enter/);
  await chat.ask('Yes.');
  assert.equal(applied.length,3);
  assert.equal(chain().at(-2).diff.source,'confirmation');
});

test('Chat asks before hosted transfer and paid photo assessment, then holds the resulting declaration for review',async t=>{
  const {room,lens,records,storage} = fixture(t);
  await records.ensureStarter(lens);
  const calls=[];
  const uploads={upload:async ({id,placeId})=>{
    calls.push('upload');
    return {item:{...quotedPhoto,id,placeId}};
  },publish:()=>assert.fail('The declaration was never confirmed')};
  const ui=new SourcesUI({uploads,records,storage,proposeScores:async request=>{
    calls.push('provider');
    assert.equal(request.description,'A test photograph.');
    return {basis:'image',model:PHOTO_SCORE_MODEL,scores:scores(),observation:'A photograph of a plant.',
      descriptionDisagrees:false,proposalReceiptId:assessmentReceiptId};
  }});
  ui.context={room,lens,actorId:lens.profileId,placeId:room.id};
  const chat=new SourceConversationUI(ui);
  chat.begin(room,lens);
  const file=new File(['test photograph'],'Study.png',{type:'image/png'});
  await chat.attach(file);
  assert.deepEqual(calls,[]);
  assert.match(chat.render(),/Upload to Atlas storage\?/);
  await chat.ask('Yes.');
  assert.deepEqual(calls,['upload']);
  await chat.ask('Skipping an unnecessary call.');
  assert.match(chat.render(),/metered AI budget/);
  await chat.ask('No.');
  assert.deepEqual(calls,['upload']);
  assert.equal(ui.hostedItems[0].state,'uploaded');
  await chat.ask('Review Study.png');
  await chat.ask('A test photograph.');
  assert.deepEqual(calls,['upload']);
  await chat.ask('Yes.');
  assert.deepEqual(calls,['upload','provider']);
  assert.equal(chat.conversation.pending.data.assessmentReceiptId,assessmentReceiptId);
  assert.match(chat.render(),/What the Atlas saw/);
  assert.equal(ui.hostedItems[0].state,'uploaded');
});

test('Hosted assessment approval binds the active upload, expires on use, and gates hosted text retrieval',async t=>{
  const {room,lens,records,storage} = fixture(t);
  await records.ensureStarter(lens);
  let mediaReads=0, reviews=0;
  const audio={id:uploadId,filename:'Speech.wav',contentType:'audio/wav',state:'uploaded',placeId:room.id};
  const text={...audio,id:assessmentReceiptId,filename:'Notes.txt',contentType:'text/plain'};
  const ui=new SourcesUI({records,storage,uploads:{media:async()=>{mediaReads++;return new Blob(['sample']);}},
    proposeScores:async ({item})=>{
      reviews++;
      return item===audio?{basis:'audio-transcript',model:PHOTO_SCORE_MODEL,scores:scores(),observation:'A person is speaking.',
        descriptionDisagrees:false,proposalReceiptId:assessmentReceiptId,transcriptionReceiptId:uploadId}:
        {basis:'text',scores:scores()};
    }});
  ui.context={room,lens,actorId:lens.profileId,placeId:room.id};
  ui.hosted={items:[audio,text]};
  await assert.rejects(ui.score(audio),/confirm this metered review/i);
  await assert.rejects(ui.score(text),/confirm this metered review/i);
  assert.deepEqual([mediaReads,reviews],[0,0]);
  const approval=ui.approveAssessment(audio);
  await ui.score(audio,undefined,'',{approval});
  await assert.rejects(ui.score(audio,undefined,'',{approval}),/confirm this metered review/i);
  assert.equal(reviews,1);
  await ui.score(text,new Blob(['local sample']));
  assert.deepEqual([mediaReads,reviews],[0,2]);
  await ui.score(text,undefined,'',{approval:ui.approveAssessment(text)});
  assert.deepEqual([mediaReads,reviews],[1,3]);

  const revokedToken=ui.approveAssessment(audio);
  await records.revoke(lens,records.state(lens).grants[0].id);
  await assert.rejects(ui.score(audio,undefined,'',{approval:revokedToken}),/active suggest grant/i);
  assert.deepEqual([mediaReads,reviews],[1,3]);
});
