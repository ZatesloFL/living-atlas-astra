import test from 'node:test';
import assert from 'node:assert/strict';
import {catalog,allowedBlocks,checkRequest,validateAnswer} from '../supabase/functions/ai-proxy/protocol.js';
import legacy from '../supabase/functions/ai-proxy/catalog-legacy.js';
import {DIMENSIONS,pair,scores} from '../src/scores.js';
const context=()=>({placeId:'boycott',catalogRevision:catalog.revision,question:'What was the boycott?',visibleBlockIds:catalog.versions.flatMap(v=>v.blocks.map(b=>b.id)),lens:{limits:scores(Object.fromEntries(DIMENSIONS.map(([k])=>[k,pair(1,1)]))),hard:scores(Object.fromEntries(DIMENSIONS.map(([k])=>[k,pair(2,2)]))),audience:'teen',depth:'Deep',trustFrom:'Author',show:{real:true,pseudonym:true,anonymous:true,agents:true}}});
const spec=context=>({requestId:crypto.randomUUID(),job:'guide',agentId:'docent-silver',schemaId:'atlas-evidence-answer-v1',context});
test('Proxy checks both paired axes independently, including hard locks, and rejects mixed or partial dials',()=>{
 const c=context();assert(allowedBlocks(c).some(b=>b.id==='lead'));
 for(const axis of ['amount','graphicness']){
  const blocked=structuredClone(c);blocked.lens.limits.disturbing[axis]=0;assert(!allowedBlocks(blocked).some(b=>b.id==='lead'));
  const hard=structuredClone(c);hard.lens.hard.disturbing[axis]=0;assert(!allowedBlocks(hard).some(b=>b.id==='lead'));
 }
 for(const value of [1,{amount:1},{amount:1,graphicness:4},{amount:1,graphicness:1,peak:0}]){const bad=structuredClone(c);bad.lens.limits.disturbing=value;assert.throws(()=>allowedBlocks(bad));}
 const blocks=allowedBlocks(c);assert.throws(()=>validateAnswer({excerpts:[{blockId:'lead',quote:'Invented unsupported claim.'}]},blocks));
});
test('Existing deployed clients retain only their exact legacy catalog contract; catalogs and Lens shapes cannot be crossed',()=>{
 const old=context();old.catalogRevision=legacy.revision;for(const k of ['limits','hard'])old.lens[k]=Object.fromEntries(DIMENSIONS.map(([d])=>[d,k==='limits'?1:2]));
 assert.equal(checkRequest(spec(old)).context.catalogRevision,legacy.revision);assert(allowedBlocks(old).some(b=>b.id==='lead'));
 const mixed=structuredClone(old);mixed.catalogRevision=catalog.revision;assert.throws(()=>allowedBlocks(mixed));
 const reverse=context();reverse.catalogRevision=legacy.revision;assert.throws(()=>allowedBlocks(reverse));
 assert.throws(()=>checkRequest(spec({...old,catalogRevision:'unknown'})));
});
