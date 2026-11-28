import test from 'node:test';
import assert from 'node:assert/strict';
import {boycottQuestionKind,boycottQuoteAnswers} from '../src/boycott-question-policy.js';
import {localQuestionAnswer,typedQuestionBlockIds,quotedQuestionCoverage,partialOutcomePassage,DONT_KNOW} from '../src/docent-questions.js';
import {docentGrantEvidence} from '../src/docent-grant-evidence.js';
import {createAI,provenanceLabel} from '../src/ai.js';
import {Staff} from '../src/staff.js';
import {AccessStore} from '../src/access-store.js';
import {seedProfiles} from '../src/profiles.js';
import {prepare,validateAnswer} from '../supabase/functions/ai-proxy/protocol.js';
import {docentBlockIds} from '../src/ai-proxy.js';
import {AI_CATALOG_REVISION} from '../src/ai-catalog-revision.js';
const context=(question,blocks)=>({place:{key:'boycott'},action:'answer',question,blocks});
// Deliberately fictional evidence for the relevance attack; not a live capture.
const who={id:'organizing',body:'The town held a transport boycott. Ada Example led the Example Council during the boycott.'};
test('a who-answer must name who in the quoted words; relevant words elsewhere in a Thing cannot rescue it',async()=>{
 const ctx=context('Who led this',[who,{id:'place-overview',body:'The town held a transport boycott.'}]);
 assert.deepEqual(typedQuestionBlockIds(ctx),['organizing']);
 for(const text of ['The town held a transport boycott.','Ada Example led the Example Council during the boycott.']){
  const proposal=validateAnswer({excerpts:[{blockId:who.id,quote:text}]},[who]);
  const result=await createAI({transport:{eligible:()=>true,request:async()=>({proposal,agentId:'docent-silver',model:'synthetic/relevance-fixture',receiptData:{receiptId:crypto.randomUUID()}})}}).request({job:'guide',agentId:'docent-silver',context:ctx});
  assert.equal(result.proposal.text,text.startsWith('Ada')?text:DONT_KNOW);
  assert.equal(provenanceLabel(result.receiptData,result.proposal),text.startsWith('Ada')?'Live · grounded answer':'Live response · answer withheld');
 }
 assert.equal(localQuestionAnswer({...ctx,blocks:ctx.blocks.slice(1)}).text,DONT_KNOW);
 assert.equal(quotedQuestionCoverage(ctx,{text:'Ada Example',citations:['organizing']}),false);
 assert.equal(boycottQuestionKind('Who led this and what is the airspeed of a swallow?'),null);
});
test('a pressure passage stays partial; a recorded outcome replaces that path without manufacturing a conclusion',()=>{
 const pressure={id:'outcomes',body:'The campaign placed economic and political pressure on the bus system.'};
 const ctx=context('Did it work?',[pressure]);
 assert.equal(localQuestionAnswer(ctx).text,DONT_KNOW);
 assert.equal(partialOutcomePassage(ctx).text,pressure.body);
 const outcome={id:'outcomes',body:'The bus service was desegregated after the campaign. The date remains to verify.'};
 assert.equal(localQuestionAnswer({...ctx,blocks:[outcome]}).text,outcome.body);
 assert.equal(partialOutcomePassage({...ctx,blocks:[outcome]}),null);
 assert.equal(boycottQuoteAnswers('outcome',pressure.body,'outcomes'),false);
});
test('Mara’s checked grant is citable, scoped, exact, and absent after revocation; other Places gain no evidence',async()=>{
 const map=new Map(),store=new AccessStore(()=>({getItem:k=>map.get(k),setItem:(k,v)=>map.set(k,v)})),staff=new Staff(store);await staff.ready;
 const lens={...seedProfiles().find(p=>p.id==='seed-me'),profileId:'seed-me',playAs:'owner'},actor=staff.actor('docent-silver');
 const ctx=staff.context(actor,'boycott','answer',lens,{question:'What can this helper do?'}),block=ctx.blocks.find(b=>b.id==='helper-grant');
 assert.match(block.body,/Mara may answer questions and propose tours.*look grant/);assert.match(block.body,/standing, revocable/);
 assert.deepEqual(docentBlockIds(ctx),['helper-grant']);
 const l=ctx.lens,spec={requestId:crypto.randomUUID(),job:'guide',agentId:actor.id,schemaId:'atlas-evidence-answer-v1',context:{placeId:'boycott',catalogRevision:AI_CATALOG_REVISION,visibleBlockIds:docentBlockIds(ctx),question:ctx.question,lens:{limits:l.limits,hard:l.hard,depth:l.depth,trustFrom:l.trustFrom,show:{...l.show,agents:l.show.agent},audience:'teen'}}};delete spec.context.lens.show.agent;
 const prepared=prepare(spec);assert.equal(prepared.blocks[0].body,block.body);assert(prepared.prompt.includes('look grant'));
 const answer=localQuestionAnswer(ctx);assert(quotedQuestionCoverage(ctx,answer));assert(block.body.includes(answer.text));
 assert(!staff.context(staff.actor('docent-studio'),'studio','answer',lens).blocks.some(b=>b.id==='helper-grant'));
 assert.equal(docentGrantEvidence(actor,{scope:'look',revokedAt:'2026-11-28'},{}),null);
 await staff.revoke(actor.id,lens);assert.throws(()=>staff.context(actor,'boycott','answer',lens),/revoked|Grant/);
});
test('typed questions and presets share evidence; the date discrepancy only enters a Deep view',async()=>{
 const map=new Map(),staff=new Staff(new AccessStore(()=>({getItem:k=>map.get(k),setItem:(k,v)=>map.set(k,v)})));await staff.ready;
 const profile=seedProfiles().find(p=>p.id==='seed-me'),actor=staff.actor('docent-silver');
 for(const depth of ['Standard','Deep']){
  const lens={...profile,profileId:profile.id,depth};
  for(const [typed,preset] of [['What is this Place?','overview'],['What needs verification?','sources'],['What can this helper do?','rules']]){
   const ctx=staff.context(actor,'boycott','answer',lens,{question:typed});
   assert.deepEqual(docentBlockIds(ctx),docentBlockIds({...ctx,question:preset}));
   if(preset==='sources'){
    if(depth==='Standard'){assert.deepEqual(docentBlockIds(ctx),[]);assert.equal(localQuestionAnswer(ctx).text,DONT_KNOW);}
    else{assert.deepEqual(docentBlockIds(ctx),['memory']);assert.match(localQuestionAnswer(ctx).text,/May 26.*May 27/);}
   }
  }
 }
});
test('nineteen real proxy captures replay with stable verdicts, named leadership, qualified outcomes and receipted abstentions',async()=>{
 const {readFile}=await import('node:fs/promises'),{allowedBlocks}=await import('../supabase/functions/ai-proxy/protocol.js');
 const capture=JSON.parse(await readFile(new URL('./fixtures/docent-proxy-live-boycott-stability.json',import.meta.url),'utf8'));
 assert.match(capture.captureType,/real deployed proxy/);assert.equal(capture.edgeFunctionVersion,11);assert.equal(capture.captures.length,19);assert.equal(capture.passed,true);
 assert(capture.stability.every(s=>s.agree&&s.verdicts.length===3));const receipts=new Set();
 for(const wire of capture.captures){
  const receipt=wire.serverReceipt;assert.equal(receipt.id,wire.response.receiptData.receiptId);receipts.add(receipt.id);assert.equal(receipt.result,'accepted');assert.equal(receipt.validation_passed,true);assert.equal(receipt.failure_class,null);assert.equal(receipt.cost_basis,'measured');assert(receipt.output_tokens<=2048);
  const ctx=context(wire.request.context.question,allowedBlocks(wire.request.context));
  assert.deepEqual(docentBlockIds(ctx),wire.request.context.visibleBlockIds);
  const answer=await createAI({transport:{eligible:()=>true,request:async()=>structuredClone(wire.response)}}).request({job:'guide',agentId:'docent-silver',context:ctx});
  assert.deepEqual(answer,wire.clientResult);assert.equal(provenanceLabel(answer.receiptData,answer.proposal),wire.label);
  if(ctx.question==='Who led this')assert.match(answer.proposal.text,/Inter-Civic Council.*Rev\. C\. K\. Steele/s);
  if(ctx.question==='Did it work?'){assert.match(answer.proposal.text,/January 7, 1957.*still faced arrest.*summer 1957/s);assert.equal(partialOutcomePassage(ctx),null);}
  if(wire.verdict==='no-supported-answer'){assert.equal(answer.proposal.text,DONT_KNOW);assert.deepEqual(answer.proposal.citations,[]);assert(!wire.label.includes('grounded'));}
 }
 assert.equal(receipts.size,19);
});
