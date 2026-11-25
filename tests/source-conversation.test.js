import test from 'node:test';
import assert from 'node:assert/strict';
import {AtlasRecords,ATLAS_RECORDS_KEY} from '../src/atlas-records.js';
import {SourceConversation,SOURCE_CONVERSATION_KEY} from '../src/source-conversation.js';
import {SourceConversationUI} from '../src/source-conversation-ui.js';
import {SourcesUI} from '../src/sources-ui.js';
import {ROOMS} from '../src/data.js';
import {scores} from '../src/scores.js';
import {verifyChain} from '../src/ledger.js';

const uploadId = '10000000-0000-4000-8000-000000000001';
const assessmentReceiptId = '10000000-0000-4000-8000-000000000002';
const declaration = {itemId:uploadId,scores:scores(),assessmentReceiptId};
const placement = {reference:{kind:'upload',sourceId:'source-example',itemId:uploadId},position:[2,0,0]};

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
