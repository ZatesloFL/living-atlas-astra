import test from 'node:test';import assert from 'node:assert/strict';
import {ROOMS} from '../src/data.js';import {placeOverview} from '../src/place-evidence.js';
import {typedQuestionBlockIds} from '../src/docent-questions.js';
import {allowedBlocks,validateAnswer,catalog} from '../supabase/functions/ai-proxy/protocol.js';
import {PRESETS} from '../src/data.js';
const context=question=>({placeId:'boycott',catalogRevision:catalog.revision,question,lens:{limits:PRESETS.Teen.limits,hard:PRESETS.Teen.hard,audience:'teen',show:{real:true,pseudonym:true,anonymous:true,agents:true},trustFrom:'Author',depth:'Standard'}});
test('Place overview is authored exact evidence, including when no exhibit body matches hall',()=>{
 const overview=placeOverview(ROOMS.boycott),ctx=context('What is this hall about?');ctx.visibleBlockIds=typedQuestionBlockIds({question:ctx.question,blocks:[...ROOMS.boycott.blocks,overview]});assert.ok(ctx.visibleBlockIds.includes('place-overview'));const blocks=allowedBlocks(ctx),body=blocks.find(b=>b.id==='place-overview').body;assert.ok(body.includes(ROOMS.boycott.substance.summary));const answer=validateAnswer({excerpts:[{blockId:'place-overview',quote:ROOMS.boycott.substance.summary}]},blocks);assert.deepEqual(answer.citations,['place-overview']);assert.throws(()=>validateAnswer({excerpts:[{blockId:'place-overview',quote:'A made-up account of the hall.'}]},blocks));assert.deepEqual(validateAnswer({excerpts:[]},blocks).citations,[]);
});
test('Overview evidence follows the same Lens, author visibility and catalog boundary',()=>{const ctx=context('What is this hall about?');ctx.visibleBlockIds=['place-overview'];ctx.lens.show.real=false;assert.deepEqual(allowedBlocks(ctx),[]);});
