import test from 'node:test';
import assert from 'node:assert/strict';
import {ai,createAI,PROPOSAL_SCHEMA,provenanceLabel} from '../src/ai.js';
import {createProxyTransport,createBrowserTransport,AI_PROXY_ENDPOINT,docentBlockIds} from '../src/ai-proxy.js';
const context=()=>({place:{key:'boycott'},action:'answer',question:'overview',blocks:[{id:'lead',type:'text',body:'Sample source text.'}],lens:{limits:{violence:1},hard:{violence:2},ageBand:'teen'}});
const request=c=>({job:'guide',agentId:'docent-silver',schema:PROPOSAL_SCHEMA,context:c??context()});
const session=()=>Response.json({session:'a'.repeat(64),holder:'b'.repeat(64),expiresAt:new Date(Date.now()+1800000).toISOString()});
const good=()=>Response.json({proposal:{kind:'answer',room:'boycott',reason:'Permitted sample excerpts',text:'Sample source text.',citations:['lead']},agentId:'docent-silver',model:'anthropic/mock',receiptData:{receiptId:crypto.randomUUID()}});
const transport=fetchImpl=>createProxyTransport({endpoint:'https://example.test/functions/v1/ai-proxy',fetchImpl});
test('unconfigured ai.request stays simulated, with no network or account; unknown free questions abstain',async()=>{
 assert.equal(ai.provider,'simulated');assert.equal((await ai.request(request())).model,'simulated-v1');
 const c=context();c.question='Unrelated private question';assert.match((await ai.request(request(c))).proposal.text,/I don't know/);
});
test('AI off, unreachable, quota and provider errors fall back automatically and open a 60-second circuit',async()=>{
 for(const status of [401,403,429,502,503,'offline']){
  let calls=0;const t=transport(async()=>{calls++;if(status==='offline')throw new TypeError('network unavailable');return new Response('{}',{status});});
  const client=createAI({transport:t});const a=await client.request(request());assert.equal(a.model,'simulated-v1');assert.equal(a.receiptData.fallbackReason,status===429?'LIVE_LIMIT_REACHED':'LIVE_UNAVAILABLE');
  const second=await client.request(request());assert.equal(calls,1);assert.equal(second.receiptData.fallbackReason,a.receiptData.fallbackReason);
  assert.equal(provenanceLabel(second.receiptData),status===429?'Simulated · live limit reached':'Simulated · live helper unavailable');
 }
});
test('live envelope carries only structured public IDs and narrower lens; response remains a proposal',async()=>{
 const sent=[];const t=transport(async(url,opts)=>{sent.push(JSON.parse(opts.body));return url.endsWith('/session')?session():good();});
 const c=context();c.identity={privateName:'PRIVATE_CANARY'};c.blocks[0].body+=' LOCAL_ONLY_CANARY';c.lens.show={real:true,pseudonym:false,anonymous:true,agent:false};
 const a=await createAI({transport:t}).request(request(c));assert.equal(a.model,'anthropic/mock');assert.equal(a.receiptData.result,'proposed');
 assert(!JSON.stringify(sent).includes('CANARY'));assert.deepEqual(sent[1].context.visibleBlockIds,['lead']);assert.equal(sent[1].context.lens.audience,'teen');
 assert.equal(provenanceLabel(a.receiptData),'Live · grounded answer');
 assert.deepEqual(sent[1].context.lens.show,{real:true,pseudonym:false,anonymous:true,agents:false});
});
test('guide context selects relevant visible IDs without adding hidden Things or sending a whole article',()=>{
 const c=context();c.blocks.push({id:'sample'},{id:'facts'},...Array.from({length:50},(_,i)=>({id:'unrelated-'+i})));
 assert.deepEqual(docentBlockIds(c),['lead','facts','sample']);
 c.question='sources';assert.deepEqual(docentBlockIds(c),['sample']);
 c.question='rules';c.blocks=[];assert.deepEqual(docentBlockIds(c),[]);
 c.question='overview';c.blocks=[{id:'kids-lead'},{id:'kids-label'}];assert.deepEqual(docentBlockIds(c),['kids-lead','kids-label']);
});
test('ineligible helpers and Places stay simulated without requesting a session',async()=>{
 let n=0;const a=createAI({transport:transport(async()=>{n++;return session();})});
 const c=context();c.place.key='square';await a.request(request(c));assert.equal(n,0);
});
test('invalid provider output falls back and cannot change the Place or cite hidden Things',async()=>{
 for(const patch of [{room:'family'},{citations:['hidden']},{kind:'score',value:0,dimension:'sensory'},{text:'Invented evidence.'},{citations:[]}]){
  const a=createAI({transport:transport(async u=>u.endsWith('/session')?session():Response.json({...await good().json(),proposal:{...(await good().json()).proposal,...patch}}))});
  assert.equal((await a.request(request())).model,'simulated-v1');
 }
});
test('only the shipped Pages origin configures live help; explicit local mode and previews make no requests',async()=>{
 for(const location of [undefined,{origin:'http://localhost:8000',search:''},{origin:'https://example.test',search:''},{origin:'https://zateslofl.github.io',search:'?ai=local'}])assert.equal(createBrowserTransport({location}),null);
 let calls=0;const t=createBrowserTransport({location:{origin:'https://zateslofl.github.io',search:'?endpoint=https://evil.test'},storage:null,fetchImpl:async(url,options)=>{
  calls++;assert(url.startsWith(AI_PROXY_ENDPOINT+'/'));assert.equal(options.credentials,'omit');
  if(url.endsWith('/request'))assert.equal(options.headers.Authorization,'Bearer '+'a'.repeat(64));
  return url.endsWith('/session')?session():good();
 }});
 const result=await createAI({transport:t}).request(request());assert.equal(calls,2);assert.equal(result.receiptData.provider,'proxy');
});
test('live abstention is honest and provenance never comes from a model-looking string',async()=>{
 const a=createAI({transport:transport(async url=>url.endsWith('/session')?session():Response.json({...await good().json(),proposal:{kind:'answer',room:'boycott',reason:'No evidence',text:"I don't know from the blocks available in this view.",citations:[]}}))});
 assert.equal((await a.request(request())).receiptData.provider,'proxy');
 assert.equal(provenanceLabel({provider:'simulated',model:'anthropic/mock'}),'Simulated · local helper');
});
test('a cancelled session bootstrap never starts a paid request',async()=>{
 let complete,calls=0;const controller=new AbortController();
 const a=createAI({transport:transport(async()=>{calls++;return new Promise(r=>{complete=r;});})});
 const p=a.request({...request(),signal:controller.signal});while(!complete)await new Promise(r=>setImmediate(r));controller.abort();complete(session());
 await assert.rejects(p,e=>e.name==='AbortError');assert.equal(calls,1);
});
test('cancelled and stale contexts drop replies without manufacturing a fallback',async()=>{
 let complete;const a=createAI({transport:transport(u=>u.endsWith('/session')?session():new Promise(r=>{complete=r;}))});
 const c=context(),p=a.request(request(c));while(!complete)await new Promise(r=>setImmediate(r));c.place.key='square';complete(good());await assert.rejects(p,e=>e.name==='AbortError');
 const controller=new AbortController();controller.abort();await assert.rejects(a.request({...request(),signal:controller.signal}),e=>e.name==='AbortError');
});
test('timeout does not retry paid generation; blocked storage remains usable',async()=>{
 let calls=0;const a=createAI({transport:createProxyTransport({endpoint:'https://example.test/functions/v1/ai-proxy',timeoutMs:20,storage:{getItem(){throw new Error('blocked');},setItem(){throw new Error('blocked');}},fetchImpl:async(u,o)=>{calls++;if(u.endsWith('/session'))return session();return new Promise((resolve,reject)=>o.signal.addEventListener('abort',()=>reject(new Error('timeout'))));}})});
 assert.equal((await a.request(request())).model,'simulated-v1');await a.request(request());assert.equal(calls,2);
});
