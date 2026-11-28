import test from 'node:test';
import assert from 'node:assert/strict';
import {ROOMS} from '../src/data.js';
import {evidenceText,readableAnswer} from '../src/place-evidence.js';
import {localQuestionAnswer,typedQuestionBlockIds,DONT_KNOW} from '../src/docent-questions.js';
import {thingTitle} from '../src/thing-subject.js';
import {provenanceLabel} from '../src/ai.js';
test('chapter heading and pressure passage are one named citable Thing; outcome asks quote, never infer success',()=>{
 const room=ROOMS.boycott,block=room.blocks.find(b=>b.id==='outcomes');
 assert.equal(block.title,'4. Pressure, negotiations and change');assert(block.aliases.includes('outcomes-heading'));assert(!room.blocks.some(b=>b.id==='outcomes-heading'));
 const context={question:'did it actually work',blocks:room.blocks.map(b=>({...b,body:evidenceText(b)}))};
 assert(typedQuestionBlockIds(context).includes('outcomes'));
 const answer=localQuestionAnswer(context);assert.deepEqual(answer.citations,['outcomes']);assert.match(answer.text,/economic and political pressure/);assert(evidenceText(block).includes(answer.text));
 assert.equal(localQuestionAnswer({...context,question:'did it actually work and how many unicorns rode the bus?'}).text,DONT_KNOW);
 for(const b of room.blocks)assert.notEqual(thingTitle(b),'Untitled Thing');
});
test('structured facts have readable authored evidence and JSON cannot be labelled grounded',()=>{
 const text=evidenceText({type:'infobox',body:{Place:'Tallahassee, Florida'}});assert.equal(text,'Place: Tallahassee, Florida');assert(readableAnswer(text));
 for(const text of ['{"Place":"Tallahassee, Florida"}','"Place":"Tallahassee, Florida"'])assert.equal(provenanceLabel({provider:'proxy'},{text,citations:['facts']}),'Live · no supported answer');
});
