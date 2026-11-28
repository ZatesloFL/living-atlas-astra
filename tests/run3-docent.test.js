import test from 'node:test';
import assert from 'node:assert/strict';
import {ROOMS} from '../src/data.js';
import {evidenceText,readableAnswer} from '../src/place-evidence.js';
import {localQuestionAnswer,typedQuestionBlockIds,DONT_KNOW} from '../src/docent-questions.js';
import {thingTitle} from '../src/thing-subject.js';
import {provenanceLabel} from '../src/ai.js';
test('Both boycott questions quote a titled Thing from the readable audience version',()=>{
 const room=ROOMS.boycott;
 const outcomes=room.blocks.find(block=>block.id==='outcomes');
 assert(outcomes.aliases.includes('outcomes-heading'));
 assert(!room.blocks.some(block=>block.id==='outcomes-heading'));
 for(const version of room.versions){
  const blocks=version.blocks.map(block=>({...block,body:evidenceText(block)}));
  for(const [question,id,text] of [
   ['Who led this','oral-history',/Inter-Civic Council led.*Rev\. C\. K\. Steele/],
   ['Did it work?','outcomes',/January .*1957.*summer 1957/i],
  ]){
   const context={question,blocks};
   assert(typedQuestionBlockIds(context).includes(id));
   const answer=localQuestionAnswer(context);
   assert.deepEqual(answer.citations,[id]);
   assert.match(answer.text,text);
   const source=version.blocks.find(block=>block.id===id);
   assert(source.body.includes(answer.text));
   assert.notEqual(thingTitle(source),id);
  }
  assert.equal(localQuestionAnswer({blocks,question:'did it actually work and how many unicorns rode the bus?'}).text,DONT_KNOW);
 }
});
test('structured facts have readable authored evidence and JSON cannot be labelled grounded',()=>{
 const text=evidenceText({type:'infobox',body:{Place:'Tallahassee, Florida'}});assert.equal(text,'Place: Tallahassee, Florida');assert(readableAnswer(text));
 for(const text of ['{"Place":"Tallahassee, Florida"}','"Place":"Tallahassee, Florida"'])assert.equal(provenanceLabel({provider:'proxy'},{text,citations:['facts']}),'Live · no supported answer');
});
test('four real v9 proxy captures replay with their accepted receipts and honest abstentions',async()=>{
 const {readFile}=await import('node:fs/promises'),{allowedBlocks}=await import('../supabase/functions/ai-proxy/protocol.js'),{createAI}=await import('../src/ai.js');
 const capture=JSON.parse(await readFile(new URL('./fixtures/docent-proxy-live-run3.json',import.meta.url),'utf8'));assert.equal(capture.edgeFunctionVersion,9);assert.equal(capture.captures.length,4);
 for(const [index,wire] of capture.captures.entries()){
  const context={place:{key:'boycott'},action:'answer',question:wire.request.context.question,blocks:allowedBlocks(wire.request.context)},client=createAI({transport:{eligible:()=>true,request:async()=>structuredClone(wire.response)}}),answer=await client.request({job:'guide',agentId:'docent-silver',context});
  assert.equal(wire.httpStatus,200);assert.deepEqual(answer,wire.clientResult);assert.equal(answer.receiptData.receiptId,wire.response.receiptData.receiptId);
  if(index<2)assert(answer.proposal.citations.length);else assert.equal(answer.proposal.text,DONT_KNOW);
 }
});
