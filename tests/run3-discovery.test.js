import test from 'node:test';
import assert from 'node:assert/strict';
import {atlasIntent,validateAtlasIntent} from '../src/atlas-intents.js';
import {recordDates} from '../src/discovery-index.js';
import {indexQuestionAnswer} from '../src/atlas-index-answers.js';
import {PRESETS} from '../src/data.js';
const lens={...structuredClone(PRESETS.Teen),profileId:'test',age:34,identity:{display:'pseudonym',backing:'none'},show:{real:true,pseudonym:true,anonymous:true,agent:true}};
test('record questions do not become literal Place searches; unsupported activity is explicit',()=>{
 for(const [query,topic] of [["What's new since I was last here?",'news'],['What clubs or groups can I join here?','clubs'],['Is anyone else here right now? Who can I follow?','people'],['Take me somewhere busy','people']]){
  const intent=atlasIntent(query);validateAtlasIntent(intent);assert.equal(intent.kind,'index');assert.equal(intent.topic,topic);
  const answer=indexQuestionAnswer(intent,{lens:()=>lens,query:()=>({results:[]})});assert(!answer.text.includes('find a Place'));assert(answer.text.length>40);
 }
 assert.equal(atlasIntent('Why is the sky green?').kind,'clarify');assert.equal(atlasIntent('take me to the bus boycott').kind,'destination');
});
test('publication, update and schedule dates retain their actual meanings; missing dates stay missing',()=>{
 assert.equal(recordDates({}).dateAt,null);
 const node={publishedAt:'2026-11-20T12:00:00Z',updatedAt:'2026-11-27T12:00:00Z'};assert.equal(recordDates(node).dateLabel,'Updated');assert.equal(recordDates(node).dateAt,Date.parse(node.updatedAt));
 assert.equal(recordDates({start:1795872000000}).dateLabel,'Scheduled');assert.equal(recordDates({start:1795872000000}).publishedAt,null);
});
test('starting curator selections do not claim the holder chose them',async()=>{
 const {queryIndex}=await import('../src/discovery-index.js');const {discoveryDefaults}=await import('../src/discovery-state.js');
 const view={...lens,discovery:discoveryDefaults()},cards=queryIndex(view,{board:'noticeboard'}).results;assert(cards.length);assert(cards.every(c=>!c.why.includes('You chose')));assert(cards.some(c=>c.why.includes('starting board selection')));
 view.discovery.curatorChoice='holder';assert(queryIndex(view,{board:'noticeboard'}).results.some(c=>c.why.includes('You selected these board settings')));
});
