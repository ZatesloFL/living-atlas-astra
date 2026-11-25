import test from 'node:test';
import assert from 'node:assert/strict';
import {ConversationJournal,SOURCE_CONVERSATION_KEY} from '../src/source-conversation.js';
import {verifyChain} from '../src/ledger.js';

function fixture(){
  let raw=null;
  const room={id:'home/example/drive',ownerId:'owner'};
  const lens={profileId:'owner'};
  const store={getItem:()=>raw,setItem:(key,value)=>{assert.equal(key,SOURCE_CONVERSATION_KEY);raw=value;}};
  return {room,lens,store,records:()=>JSON.parse(raw).receipts};
}

test('A scoped Atlas proposal and the owner’s confirmation are separate, with edits preserved',async()=>{
  const {room,lens,store,records}=fixture(), journal=new ConversationJournal(store);
  assert.throws(()=>journal.begin(room,{profileId:'guest'}),/own/);
  assert.throws(()=>journal.begin(room,{profileId:'owner',isAgent:true}),/own/);
  journal.begin(room,lens);
  const original=await journal.propose('declaration',{dials:{amount:0,graphicness:0}},'Photo assessment');
  const updated=await journal.amend({dials:{amount:1,graphicness:0}},'Owner requested an edit');
  assert.notEqual(updated.receiptId,original.receiptId);
  const result=await journal.confirm(async proposal=>{
    assert.deepEqual(proposal.data.dials,{amount:1,graphicness:0});
    assert.equal(records().at(-1).action,'source_conversation_confirmed');
    assert.equal(records().at(-1).actor,'owner');
    assert.equal(records().at(-1).diff.proposalReceiptId,updated.receiptId);
    return {receiptId:'remote-declaration-fixture'};
  });
  await journal.end();
  assert.ok((await verifyChain(records())).valid);
  assert.equal(records().find(r=>r.action==='source_conversation_granted').diff.scope,'suggest');
  assert.equal(records().find(r=>r.action==='source_conversation_outcome').diff.appliedReceiptId,'remote-declaration-fixture');
  assert.equal(records().at(-1).action,'source_conversation_revoked');
  assert.equal(typeof result.receiptId,'string');
});

test('Declining and failed execution leave no applied record',async()=>{
  const {room,lens,store,records}=fixture(), journal=new ConversationJournal(store);
  journal.begin(room,lens);
  await journal.propose('mapping',{kind:'drive'},'Folders become alcoves');
  await journal.dismiss();
  await assert.rejects(journal.confirm(()=>assert.fail('An owner already declined this proposal')),/no proposal/);
  await journal.propose('placement',{thingId:'sample'},'Place the photo');
  await assert.rejects(journal.confirm(async()=>{throw new Error('The source became unavailable');}),/became unavailable/);
  assert.equal(records().at(-1).diff.outcome,'failed');
  assert.ok(journal.pending);
  assert.equal(records().filter(r=>r.diff.outcome==='applied').length,0);
});
