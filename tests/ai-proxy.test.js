import test,{before,after,beforeEach} from 'node:test';
import assert from 'node:assert/strict';
import {readFile,writeFile,stat,mkdir,mkdtemp,rm} from 'node:fs/promises';
import {resolve} from 'node:path';
import {createServer} from 'node:net';
import EmbeddedPostgres from 'embedded-postgres';
import postgres from 'postgres';
import Ajv2020 from 'ajv/dist/2020.js';
import {Store} from '../supabase/functions/ai-proxy/store.js';
import {createHandler} from '../supabase/functions/ai-proxy/handler.js';
import {ORIGIN,GUIDE_SCHEMA,MODEL_SCHEMA,BUILDER_SCHEMA,FAILURE_CLASSES,id,token,digest,envelope} from '../supabase/functions/ai-proxy/core.js';
import {catalog,builderSchema,prepare,validateBuilder,validateAnswer,allowedBlocks} from '../supabase/functions/ai-proxy/protocol.js';
import {modelCheck,normalizeUsage,generate} from '../supabase/functions/ai-proxy/providers.js';
import {prepareModelCheck} from '../supabase/operators/prepare-model-check.mjs';
import {runModelCheck} from '../supabase/operators/run-model-check.mjs';
import {revokeModelCheck} from '../supabase/operators/revoke-model-check.mjs';
import {Staff} from '../src/staff.js';
import {AccessStore} from '../src/access-store.js';
import {seedProfiles} from '../src/profiles.js';
import {createAI} from '../src/ai.js';
import {createProxyTransport} from '../src/ai-proxy.js';
let pg,sql,store,dir;
const migration=await readFile(new URL('../supabase/migrations/20261113120000_atlas_ai.sql',import.meta.url),'utf8');
const rollback=await readFile(new URL('../supabase/migrations/rollback/20261113120000_atlas_ai.rollback.sql',import.meta.url),'utf8');
const diagnosticsMigration=await readFile(new URL('../supabase/migrations/20261113204500_ai_failure_class.sql',import.meta.url),'utf8');
const diagnosticsRollback=await readFile(new URL('../supabase/migrations/rollback/20261113204500_ai_failure_class.rollback.sql',import.meta.url),'utf8');
const diagnosticsVerify=await readFile(new URL('../supabase/operators/verify-failure-diagnostics.sql',import.meta.url),'utf8');
// Hand-authored Anthropic-shaped fixture using public catalog text, never a
// capture of Silver's deleted live response. Token counts are synthetic.
const docentFixture=JSON.parse(await readFile(new URL('./fixtures/docent-haiku-response.json',import.meta.url),'utf8'));
// Documented default omitted-thinking envelope; synthetic signature and counts.
const docentThinkingFixture=JSON.parse(await readFile(new URL('./fixtures/docent-haiku-thinking-response.json',import.meta.url),'utf8'));
const docentJSON=docentFixture.content[0].text.slice('```json\n'.length,-'\n```'.length);
const docentAnswer=JSON.parse(docentJSON);
const validateBuilderSchema=new Ajv2020({strict:false}).compile(builderSchema);
const dimensions=['violence','sexual','language','disturbing','viewpoint','sensory'];
const lens=()=>({limits:Object.fromEntries(dimensions.map(d=>[d,1])),hard:Object.fromEntries(dimensions.map(d=>[d,2])),depth:'Deep',trustFrom:'Author',show:{real:true,pseudonym:true,anonymous:true,agents:true},audience:'teen'});
const request=()=>({requestId:id(),job:'guide',agentId:'docent-silver',schemaId:GUIDE_SCHEMA,context:{placeId:'boycott',catalogRevision:catalog.revision,visibleBlockIds:['lead'],lens:lens(),question:'What is this Place?'}});
const usage={input_tokens:100,output_tokens:20,cache_read_tokens:0,cache_write_tokens:0,reasoning_tokens:0};
const secrets=n=>n==='ALLOWED_ORIGINS'?ORIGIN:'mock-value-never-a-provider-key';
const req=(path,body={},credential=null,origin=ORIGIN)=>new Request('https://example.test/functions/v1/ai-proxy'+path,{method:'POST',headers:{Origin:origin,'Content-Type':'application/json',...(credential?{Authorization:'Bearer '+credential}:{})},body:JSON.stringify(body)});
const handler=(fetchImpl=()=>{throw new Error('Unexpected provider call');})=>createHandler({store,getSecret:secrets,fetchImpl,validateBuilderSchema});
const reserve=(s,r=request())=>store.reserve(s.session,r,prepare(r).prompt);
async function enabled(){
 await sql`UPDATE atlas_ai.runtime_config SET enabled=true`;
 await sql`UPDATE atlas_ai.routing_config SET model_id='mock-model',model_verified_at=now(),pricing_source_url='https://example.test/pricing',input_microusd_per_million=1000000,output_microusd_per_million=2000000,cache_read_microusd_per_million=1000000,cache_write_microusd_per_million=1000000,billing_contract=${sql.json({api:'anthropic-messages',input_tokens_per_byte:1,overhead_tokens:50,evidence_url:'https://example.test/bounds',output_includes_reasoning:true})},enabled=true WHERE provider='anthropic'`;
}
async function paid(s,r=request()){const a=await reserve(s,r);assert.equal(await store.dispatch(a.id),true);await store.settle(a.id,{usage,accepted:true});return a;}
async function legacyReceipt(accepted=false){
 const [r]=await sql`INSERT INTO atlas_ai.call_receipts(id,time,job,model,agent,input_tokens,output_tokens,cost_microusd,cost_basis,validation_passed,result) VALUES(${id()},now(),'guide','local-fixture-model','docent-silver',100,20,140,'measured',${accepted},${accepted?'accepted':'rejected'}) RETURNING *`;
 return r;
}
// Independent benchmark fixture: never repurpose a metadata grant or its template.
async function benchmarkGrant(){
 const session=token(),hid=id(),gid=id();
 await sql.begin(async tx=>{
  await tx`INSERT INTO atlas_ai.holder_leases(id,token_sha256,created_at,expires_at) VALUES(${hid},${await digest(token())},now(),now()+interval '24 hours')`;
  const [g]=await tx`INSERT INTO atlas_ai.grants(id,holder_id,scope,jobs,agent_ids,place_ids,schema_ids,max_calls,max_microusd,created_at,expires_at) VALUES(${gid},${hid},'suggest',ARRAY['builder'],ARRAY['gus-benchmark'],ARRAY['boycott'],ARRAY[${BUILDER_SCHEMA}],40,10000000,now(),now()+interval '24 hours') RETURNING *`;
  await tx`INSERT INTO atlas_ai.session_leases(id,holder_id,grant_id,token_sha256,created_at,expires_at) VALUES(${id()},${hid},${gid},${await digest(session)},now(),now()+interval '30 minutes')`;
  await store.grantReceipt(tx,g,'issued',Date.now(),'owner-approved-benchmark');
 });
 return {session,grantId:gid,holderId:hid};
}
async function preparedModelGrant(){
 const folder=await mkdtemp(dir+'/operator-');await prepareModelCheck(folder);
 const g=JSON.parse(await readFile(folder+'/grant.json','utf8'));
 const grantSQL=await readFile(folder+'/issue-model-check.sql','utf8');
 await sql.unsafe(grantSQL);return {folder,g,grantSQL};
}
async function assertModelGrant(grantId){
 const [g]=grantId?await sql`SELECT * FROM atlas_ai.grants WHERE id=${grantId}`:await sql`SELECT * FROM atlas_ai.grants`;
 assert.equal(g.scope,'look');assert.deepEqual(g.jobs,['model-check']);assert.deepEqual(g.agent_ids,['operator-model-check']);
 assert.deepEqual(g.place_ids,['ai-proxy']);assert.deepEqual(g.schema_ids,[MODEL_SCHEMA]);assert.equal(g.max_calls,4);assert.equal(Number(g.max_microusd),0);
 const [r]=await sql`SELECT * FROM atlas_ai.grant_receipts WHERE grant_id=${g.id} AND action='issued'`;
 assert.equal(r.authority,'operator-model-check');assert.equal(r.scope,'look');assert.deepEqual(r.jobs,['model-check']);
}
const expectCode=code=>e=>e.code===code;
before(async()=>{
 await mkdir('work',{recursive:true});dir=await mkdtemp(resolve('work/ai-proxy-pg-'));
 const socket=createServer();await new Promise(r=>socket.listen(0,'127.0.0.1',r));const port=socket.address().port;await new Promise(r=>socket.close(r));
 pg=new EmbeddedPostgres({databaseDir:dir+'/db',user:'atlas_test',password:'local-fixture',port,persistent:false,postgresFlags:['-h','127.0.0.1'],onLog:()=>{},onError:()=>{}});
 await pg.initialise();await pg.start();
 // This suite constructs its own loopback connection. It never reads a DB URL,
 // linked Supabase project, provider key or any production environment variable.
 sql=postgres({host:'127.0.0.1',port,user:'atlas_test',password:'local-fixture',database:'postgres',max:12,prepare:false,onnotice:()=>{}});store=new Store(sql);
 await sql`CREATE ROLE anon`;await sql`CREATE ROLE authenticated`;
 await sql`CREATE TABLE public.sentinel(id integer)`;await sql`INSERT INTO public.sentinel VALUES(7)`;
});
after(async()=>{await sql?.end();await pg?.stop();if(dir)await rm(dir,{recursive:true,force:true});});
beforeEach(async()=>{await sql.unsafe('DROP SCHEMA IF EXISTS atlas_ai CASCADE');await sql.unsafe(migration);await sql.unsafe(diagnosticsMigration);});

test('migration creates exactly nine private RLS tables, disabled null routes; collisions abort without altering existing data',async()=>{
 const tables=await sql`SELECT relrowsecurity FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='atlas_ai' AND relkind='r'`;
 assert.equal(tables.length,9);assert(tables.every(t=>t.relrowsecurity));assert.equal((await store.config()).enabled,false);
 assert((await sql`SELECT * FROM atlas_ai.routing_config`).every(r=>!r.enabled&&r.model_id===null&&r.billing_contract===null));
 for(const role of ['anon','authenticated'])await assert.rejects(sql.begin(async tx=>{await tx.unsafe('SET LOCAL ROLE '+role);await tx`SELECT * FROM atlas_ai.call_receipts`;}),e=>e.code==='42501');
 const connection=await sql.reserve();try{await assert.rejects(connection.unsafe(migration));await connection.unsafe('ROLLBACK');}finally{connection.release();}
 assert.deepEqual(Array.from(await sql`SELECT * FROM public.sentinel`),[{id:7}]);
});
test('diagnostic migration preserves historical receipts and allows the previous bundle to omit the new column',async()=>{
 await sql.unsafe(diagnosticsRollback);await sql.unsafe(diagnosticsRollback);
 const rejected=await legacyReceipt(),accepted=await legacyReceipt(true);
 await sql.unsafe(diagnosticsMigration);await sql.unsafe(diagnosticsVerify);
 for(const original of [rejected,accepted]){
  const [r]=await sql`SELECT * FROM atlas_ai.call_receipts WHERE id=${original.id}`;
  const {failure_class,...priorFields}=r;assert.equal(failure_class,null);assert.deepEqual(priorFields,original);
 }
 assert.equal((await legacyReceipt()).failure_class,null);
 assert.equal((await legacyReceipt(true)).failure_class,null);
 const conn=await sql.reserve();try{await assert.rejects(conn.unsafe(diagnosticsMigration));await conn.unsafe('ROLLBACK');}finally{conn.release();}
 assert.equal((await sql`SELECT * FROM atlas_ai.call_receipts`).length,4);assert.equal((await sql`SELECT id FROM public.sentinel`)[0].id,7);
});
test('diagnostic SQL vocabulary accepts every fixed class and rejects arbitrary text or a failure on an accepted receipt',async()=>{
 const r=await legacyReceipt();
 for(const code of FAILURE_CLASSES)await sql`INSERT INTO atlas_ai.call_receipts ${sql({...r,id:id(),failure_class:code})}`;
 await assert.rejects(sql`INSERT INTO atlas_ai.call_receipts ${sql({...r,id:id(),failure_class:'PRIVATE_TEXT_CANARY'})}`,e=>e.code==='23514');
 await assert.rejects(sql`INSERT INTO atlas_ai.call_receipts ${sql({...r,id:id(),validation_passed:true,result:'accepted',failure_class:'proposal_json_invalid'})}`,e=>e.code==='23514');
 assert.equal((await sql`SELECT * FROM atlas_ai.call_receipts`).length,FAILURE_CLASSES.length+1);
});
test('new bundle refuses requests before a paid dispatch when its diagnostic migration is missing',async()=>{
 await enabled();const s=await store.bootstrap();await sql.unsafe(diagnosticsRollback);
 const counters=await sql`SELECT * FROM atlas_ai.quota_windows ORDER BY bucket`;let calls=0;
 const h=handler(async()=>{calls++;return Response.json(docentFixture);});
 for(const response of [await h(req('/request',request(),s.session)),await h(req('/session'))]){
  assert.equal(response.status,503);assert.equal((await response.json()).code,'LIVE_UNAVAILABLE');
 }
 assert.equal(calls,0);assert.equal((await sql`SELECT * FROM atlas_ai.call_leases`).length,0);assert.equal((await sql`SELECT * FROM atlas_ai.call_receipts`).length,0);
 assert.deepEqual(await sql`SELECT * FROM atlas_ai.quota_windows ORDER BY bucket`,counters);
 assert.equal((await sql`SELECT * FROM atlas_ai.session_leases`).length,1);
 await sql.unsafe(diagnosticsMigration);assert.equal((await h(req('/request',request(),s.session))).status,200);assert.equal(calls,1);
});
test('off state returns clean AI_OFF for session and request without a provider call or new lease',async()=>{
 for(const path of ['/request','/session']){const r=await handler()(req(path));assert.equal(r.status,503);assert.equal((await r.json()).message,'AI is off');}
 for(const table of ['holder_leases','session_leases','grants','call_leases','call_receipts','grant_receipts','quota_windows'])assert.equal((await sql`SELECT count(*)::int AS n FROM atlas_ai.${sql(table)}`)[0].n,0);
});
test('origin lock rejects missing, null, suffix, subdomain, multiple and malformed origins before store/provider work',async()=>{
 const h=createHandler({store:{config(){throw new Error('must not touch DB');}},getSecret:secrets});
 for(const origin of ['', 'null','https://zateslofl.github.io.evil.test','https://sub.zateslofl.github.io',ORIGIN+', https://evil.test',ORIGIN+'/',ORIGIN.toUpperCase()])assert.equal((await h(req('/request',{},null,origin))).status,403);
 const missing=req('/request');missing.headers.delete('origin');assert.equal((await h(missing)).status,403);
});
test('preflight allows only exact origin, POST and declared headers; responses are noncacheable',async()=>{
 const r=await handler()(new Request('https://example.test/ai-proxy/request',{method:'OPTIONS',headers:{Origin:ORIGIN,'Access-Control-Request-Method':'POST','Access-Control-Request-Headers':'authorization,content-type'}}));
 assert.equal(r.status,204);assert.equal(r.headers.get('Access-Control-Allow-Origin'),ORIGIN);assert.equal(r.headers.get('cache-control'),'no-store');
 assert.equal((await handler()(new Request('https://example.test/ai-proxy/request',{method:'OPTIONS',headers:{Origin:ORIGIN,'Access-Control-Request-Method':'DELETE'}}))).status,403);
 const h=createHandler({store,getSecret:()=>ORIGIN+', https://elsewhere.test'});assert.equal((await h(req('/request'))).status,503);
});
test('session tokens are 256-bit, stored only hashed, two sessions maximum, renewal preserves holder',async()=>{
 await enabled();const a=await store.bootstrap();const b=await store.bootstrap(a.holder);
 assert.match(a.session,/^[0-9a-f]{64}$/);assert.equal(a.holder,b.holder);assert.notEqual(a.session,b.session);
 await assert.rejects(store.bootstrap(a.holder),expectCode('RATE_LIMITED'));
 const [h]=await sql`SELECT * FROM atlas_ai.holder_leases`;assert.equal(h.backing_ref,null);assert.equal(h.token_sha256.length,32);
 const rows=JSON.stringify(await sql`SELECT row_to_json(s) FROM atlas_ai.session_leases s`);assert(!rows.includes(a.session));
 await assert.rejects(store.bootstrap(token()),expectCode('UNAUTHORIZED'));
});
test('new anonymous holder limit is atomic across concurrent registrations',async()=>{
 await enabled();await sql`UPDATE atlas_ai.runtime_config SET new_holders_per_day=1`;
 const results=await Promise.allSettled(Array.from({length:8},()=>store.bootstrap()));assert.equal(results.filter(r=>r.status==='fulfilled').length,1);
 assert.equal((await sql`SELECT * FROM atlas_ai.holder_leases`).length,1);
});
test('unknown bearer, expired holder/session and revoked grant cannot reserve',async()=>{
 await enabled();const s=await store.bootstrap();await assert.rejects(reserve({session:token()}),expectCode('UNAUTHORIZED'));
 await sql`UPDATE atlas_ai.grants SET revoked_at=now()`;await assert.rejects(reserve(s),expectCode('UNAUTHORIZED'));
 await sql`UPDATE atlas_ai.grants SET revoked_at=NULL`;await sql`UPDATE atlas_ai.session_leases SET expires_at=now()-interval '1 second',created_at=now()-interval '2 minutes'`;await assert.rejects(reserve(s),expectCode('UNAUTHORIZED'));
});
test('public grants cannot call metadata, builder, other Place or an arbitrary helper',async()=>{
 await enabled();const s=await store.bootstrap();await assert.rejects(store.modelsAllowed(s.session),expectCode('OUT_OF_SCOPE'));
 for(const patch of [{job:'builder',agentId:'gus-benchmark',schemaId:BUILDER_SCHEMA},{agentId:'forged-agent'}]){const r={...request(),...patch};await assert.rejects(store.reserve(s.session,r,'safe'),expectCode('OUT_OF_SCOPE'));}
 const r=request();r.context.placeId='family';assert.equal((await handler()(req('/request',r,s.session))).status,403);
});
test('strict envelopes reject role/schema injection, excessive questions, history and oversized streamed bodies',async()=>{
 await enabled();const s=await store.bootstrap();const h=handler();
 const cases=[{...request(),model:'claimed-model'},{...request(),schema:{type:'anything'}}];
 const long=request();long.context.question='😀'.repeat(601);cases.push(long);const history=request();history.context.history=['private'];cases.push(history);
 for(const r of cases)assert.equal((await h(req('/request',r,s.session))).status,400);
 assert.equal((await h(req('/request',{padding:'a'.repeat(49*1024)},s.session))).status,413);
 assert.equal((await h(req('/session',{padding:'a'.repeat(2100)}))).status,413);
 assert.equal((await sql`SELECT * FROM atlas_ai.call_leases`).length,0);
});
test('server catalog enforces unverified ceiling, child lens, hard locks, visible IDs, Depth, Trust and Show',()=>{
 const c=request().context;c.visibleBlockIds=catalog.versions.flatMap(v=>v.blocks.map(b=>b.id)).concat('immersive-placeholder','private');
 assert(!allowedBlocks(c).some(b=>['immersive-placeholder','private'].includes(b.id)));
 c.lens.audience='child';assert(allowedBlocks(c).every(b=>Object.values(b.content).every(v=>v<=1)));assert(allowedBlocks(c).some(b=>b.id==='kids-lead'));
 c.lens.show.real=false;assert.deepEqual(allowedBlocks(c),[]);c.lens.show.real=true;c.lens.depth='Glance';assert(allowedBlocks(c).every(b=>b.importance==='core'));
 c.lens.trustFrom='Academic';c.lens.depth='Deep';assert(allowedBlocks(c).every(b=>b.importance==='core'||b.trust.academic));
 c.lens.hard.disturbing=0;assert(allowedBlocks(c).every(b=>b.content.disturbing===0));
});
test('stale catalog and browser-provided source text are rejected before accounting',async()=>{
 await enabled();const s=await store.bootstrap(),r=request();r.context.catalogRevision='old';assert.equal((await handler()(req('/request',r,s.session))).status,409);
 r.context.catalogRevision=catalog.revision;r.context.blocks=[{body:'injected'}];assert.equal((await handler()(req('/request',r,s.session))).status,400);
 assert.equal((await sql`SELECT * FROM atlas_ai.call_leases`).length,0);
});
test('simultaneous duplicate UUIDs produce one reservation, one in-flight call and no extra counters',async()=>{
 await enabled();const s=await store.bootstrap(),r=request();const a=await Promise.all(Array.from({length:8},()=>reserve(s,r)));
 assert.equal(a.filter(a=>!a.duplicate).length,1);assert.equal((await sql`SELECT * FROM atlas_ai.call_leases`).length,1);
 assert((await sql`SELECT * FROM atlas_ai.quota_windows WHERE bucket<>'new-holders'`).every(q=>q.calls_used===1));
 await assert.rejects(reserve(s),expectCode('RATE_LIMITED'));
});
test('concurrent independent sessions competing for the final budget admit exactly one complete reservation',async()=>{
 await enabled();const s1=await store.bootstrap(),s2=await store.bootstrap();const r=request();const [route]=await sql`SELECT * FROM atlas_ai.routing_config WHERE route_key='guide'`;const amount=envelope(route,prepare(r).prompt).reserved;
 await sql`UPDATE atlas_ai.runtime_config SET all_jobs_day_microusd=${amount}`;
 const a=await Promise.allSettled([reserve(s1,r),reserve(s2,r)]);assert.equal(a.filter(x=>x.status==='fulfilled').length,1);
 const q=await sql`SELECT * FROM atlas_ai.quota_windows WHERE bucket LIKE 'holder:%'`;assert.equal(q.length,1);assert.equal(q[0].calls_used,1);
});
test('public global concurrency is four; disjoint holder sessions cannot exceed it',async()=>{
 await enabled();const sessions=[];for(let i=0;i<8;i++)sessions.push(await store.bootstrap());
 const r=await Promise.allSettled(sessions.map(s=>reserve(s)));assert.equal(r.filter(x=>x.status==='fulfilled').length,4);
});
test('four rolling-minute calls and ten per session remain enforced after settlement',async()=>{
 await enabled();const s=await store.bootstrap();for(let i=0;i<4;i++)await paid(s);
 await assert.rejects(reserve(s),expectCode('RATE_LIMITED'));
 await sql`UPDATE atlas_ai.call_leases SET created_at=now()-interval '61 seconds'`;
 for(let i=0;i<4;i++)await paid(s);
 await sql`UPDATE atlas_ai.call_leases SET created_at=now()-interval '61 seconds'`;
 for(let i=0;i<2;i++)await paid(s);
 await assert.rejects(reserve(s),expectCode('RATE_LIMITED'));
});
test('holder daily calls and cost survive session renewal; public and provider budgets reject atomically',async()=>{
 await enabled();const s=await store.bootstrap();await paid(s);const s2=await store.bootstrap(s.holder);
 await sql`UPDATE atlas_ai.quota_windows SET calls_used=20 WHERE bucket LIKE 'holder:%'`;await assert.rejects(reserve(s2),expectCode('RATE_LIMITED'));
 await sql`UPDATE atlas_ai.quota_windows SET calls_used=1,spent_microusd=250000 WHERE bucket LIKE 'holder:%'`;await assert.rejects(reserve(s2),expectCode('RATE_LIMITED'));
 await sql`UPDATE atlas_ai.quota_windows SET spent_microusd=0 WHERE bucket LIKE 'holder:%'`;
 await sql`UPDATE atlas_ai.quota_windows SET calls_used=100 WHERE bucket='public'`;await assert.rejects(reserve(s2),expectCode('RATE_LIMITED'));
 await sql`UPDATE atlas_ai.quota_windows SET calls_used=1,spent_microusd=1000000 WHERE bucket='public'`;await assert.rejects(reserve(s2),expectCode('RATE_LIMITED'));
 await sql`UPDATE atlas_ai.quota_windows SET spent_microusd=0 WHERE bucket='public'`;
 await sql`UPDATE atlas_ai.quota_windows SET spent_microusd=20000000 WHERE bucket='provider:anthropic'`;await assert.rejects(reserve(s2),expectCode('RATE_LIMITED'));
 assert.equal((await sql`SELECT * FROM atlas_ai.call_leases`).length,1);
});
test('route without verified prices or token-bound contract cannot dispatch',async()=>{
 await enabled();const s=await store.bootstrap();await sql`UPDATE atlas_ai.routing_config SET billing_contract='{}'::jsonb WHERE route_key='guide'`;
 await assert.rejects(reserve(s),expectCode('LIVE_UNAVAILABLE'));assert.equal((await sql`SELECT * FROM atlas_ai.call_leases`).length,0);
});
test('master disable or grant revoke after reservation prevents dispatch and releases only unspent reservation',async()=>{
 await enabled();const s=await store.bootstrap(),a=await reserve(s);await sql`UPDATE atlas_ai.runtime_config SET enabled=false`;
 assert.equal(await store.dispatch(a.id),false);const [r]=await sql`SELECT * FROM atlas_ai.call_receipts`;assert.equal(r.cost_basis,'not-dispatched');assert.equal(Number(r.cost_microusd),0);assert.equal(r.failure_class,'dispatch_recheck_failed');
 assert((await sql`SELECT * FROM atlas_ai.quota_windows`).every(q=>Number(q.reserved_microusd)===0));
});
test('settlement is idempotent, measured usage releases unused reserve, one minimal Receipt without visitor text',async()=>{
 await enabled();const s=await store.bootstrap(),a=await reserve(s);assert.equal(await store.dispatch(a.id),true);
 await Promise.all(Array.from({length:5},()=>store.settle(a.id,{usage,accepted:true})));
 const rows=await sql`SELECT * FROM atlas_ai.call_receipts`;assert.equal(rows.length,1);assert.equal(Number(rows[0].cost_microusd),140);
 assert.deepEqual(Object.keys(rows[0]).sort(),['id','time','job','model','agent','input_tokens','output_tokens','cache_read_tokens','cache_write_tokens','reasoning_tokens','cost_microusd','cost_basis','validation_passed','result','failure_class'].sort());assert.equal(rows[0].failure_class,null);
 assert((await sql`SELECT * FROM atlas_ai.quota_windows WHERE bucket<>'new-holders'`).every(q=>Number(q.reserved_microusd)===0&&Number(q.spent_microusd)===140));
 const all=JSON.stringify(await sql`SELECT accounting,quota_reservations FROM atlas_ai.call_leases`);assert(!all.includes('What is this Place?'));
});
test('timeout and crashed dispatch retain full reserved cost, null usage, no blind refund on cleanup',async()=>{
 await enabled();const s=await store.bootstrap(),a=await reserve(s);assert.equal(await store.dispatch(a.id),true);
 await sql`UPDATE atlas_ai.call_leases SET expires_at=now()-interval '1 second',created_at=now()-interval '2 minutes'`;
 await store.bootstrap(s.holder);const [r]=await sql`SELECT * FROM atlas_ai.call_receipts`;
 assert.equal(r.input_tokens,null);assert.equal(r.cost_basis,'reserved');assert.equal(Number(r.cost_microusd),Number(a.reserved_microusd));assert.equal(r.failure_class,'dispatch_outcome_unknown');
 assert((await sql`SELECT * FROM atlas_ai.quota_windows WHERE bucket<>'new-holders'`).every(q=>Number(q.spent_microusd)===Number(a.reserved_microusd)));
 assert.equal((await sql`SELECT state FROM atlas_ai.call_leases`)[0].state,'uncertain');
});
test('unexpected usage exceeding reserved envelope disables master and records actual measured spend',async()=>{
 await enabled();const s=await store.bootstrap(),a=await reserve(s);await store.dispatch(a.id);
 const r=await store.settle(a.id,{usage:{...usage,input_tokens:9000000},accepted:true});assert.equal(r.validation_passed,false);assert.equal((await store.config()).enabled,false);assert.equal(r.failure_class,'accounting_bound_exceeded');
 assert(Number(r.cost_microusd)>Number(a.reserved_microusd));
});
test('grounded answer accepts exact scoped excerpts, rejects fabricated quotes, and abstains honestly',()=>{
 const b=allowedBlocks(request().context);assert(b.length);const good={excerpts:[{blockId:b[0].id,quote:b[0].body.slice(0,100)}]};
 assert.equal(validateAnswer(good,b).kind,'answer');assert.throws(()=>validateAnswer({excerpts:[{blockId:'private',quote:'fabrication'}]},b));
 assert.throws(()=>validateAnswer({excerpts:[{blockId:b[0].id,quote:'unsupported assertion'}]},b));assert.match(validateAnswer({excerpts:[]},b).text,/I don't know/);
});
test('Docent grounded provider fixtures traverse reserved spend, dispatch, validation and one accepted receipt',async()=>{
 await enabled();await sql`UPDATE atlas_ai.routing_config SET model_id=${docentFixture.model} WHERE route_key='guide'`;
 const variants=[['bare',docentJSON],['json-fence',docentFixture.content[0].text],['unlabelled-fence','```\r\n'+docentJSON+'\r\n```']];
 for(const [name,text] of variants){
  const s=await store.bootstrap(),spec=request();let calls=0,attemptId;
  const h=handler(async(url,options)=>{
   calls++;assert.equal(String(url),'https://api.anthropic.com/v1/messages');assert.equal(options.method,'POST');
   const outgoing=JSON.parse(options.body),prompt=JSON.parse(outgoing.messages[0].content);
   assert.equal(outgoing.model,docentFixture.model);assert.equal(outgoing.max_tokens,512);
   assert.deepEqual(prompt.blocks.map(b=>b.blockId),['lead']);assert(prompt.blocks[0].body.includes(docentAnswer.excerpts[0].quote));
   assert(!('id' in prompt.blocks[0]));
   const [a]=await sql`SELECT * FROM atlas_ai.call_leases WHERE state='dispatched'`;
   assert(a);attemptId=a.id;assert(Number(a.reserved_microusd)>0);
   assert((await sql`SELECT * FROM atlas_ai.quota_windows WHERE reserved_microusd>0`).length>=5);
   assert.equal((await sql`SELECT * FROM atlas_ai.call_receipts WHERE id=${a.id}`).length,0);
   return Response.json({...docentFixture,content:[{type:'text',text}]});
  });
  const response=await h(req('/request',spec,s.session)),json=await response.json();assert.equal(response.status,200,name);assert.equal(calls,1);
  assert.equal(json.proposal.text,docentAnswer.excerpts[0].quote);assert.deepEqual(json.proposal.citations,['lead']);
  assert.equal(json.model,'anthropic/'+docentFixture.model);assert.equal(json.receiptData.receiptId,attemptId);
  const [r]=await sql`SELECT * FROM atlas_ai.call_receipts WHERE id=${attemptId}`;
  assert.equal(r.result,'accepted');assert.equal(r.validation_passed,true);assert.equal(r.cost_basis,'measured');assert.equal(r.failure_class,null);
  assert.equal(r.input_tokens,600);assert.equal(r.output_tokens,96);assert.equal(r.reasoning_tokens,null);assert.equal(Number(r.cost_microusd),792);
  assert(!JSON.stringify(r).includes(spec.context.question));assert(!JSON.stringify(r).includes(docentAnswer.excerpts[0].quote));
  assert.equal((await sql`SELECT state FROM atlas_ai.call_leases WHERE id=${attemptId}`)[0].state,'completed');
  assert((await sql`SELECT * FROM atlas_ai.quota_windows`).every(q=>Number(q.reserved_microusd)===0));
  assert.equal((await h(req('/request',spec,s.session))).status,409);assert.equal(calls,1);
 }
 assert.equal((await sql`SELECT * FROM atlas_ai.call_receipts`).length,variants.length);
});
test('shipped Staff context crosses the real client transport and handler with one session, accepted evidence and linked receipts',async()=>{
 await enabled();
 for(const profileId of ['seed-visitor','seed-child'])for(const question of ['overview','sources','rules']){
  const storage=new Map(),local=new AccessStore(()=>({getItem:k=>storage.get(k),setItem:(k,v)=>storage.set(k,v)}));
  let providerCalls=0,expected;const paths=[],outcomes=[];
  const h=handler(async(url,options)=>{
   providerCalls++;const prompt=JSON.parse(JSON.parse(options.body).messages[0].content),b=prompt.blocks.find(b=>b.blockId===(profileId==='seed-child'?'kids-lead':'lead'))??prompt.blocks[0];
   const value={excerpts:question==='rules'?[]:[{blockId:b.blockId,quote:b.body.slice(0,100)}]};expected=value.excerpts;
   return Response.json({...docentThinkingFixture,content:[docentThinkingFixture.content[0],{type:'text',text:JSON.stringify(value)}]});
  });
  const client=createAI({transport:createProxyTransport({endpoint:'https://example.test/functions/v1/ai-proxy',fetchImpl:async(url,options)=>{
   paths.push(new URL(url).pathname);const response=await h(new Request(url,{...options,headers:{...options.headers,Origin:ORIGIN}}));
   outcomes.push(response.ok?{status:response.status}:{status:response.status,...await response.clone().json()});return response;
  }})});
  const staff=new Staff(local,{aiClient:client}),profile=seedProfiles().find(p=>p.id===profileId),lens={...profile,profileId:profile.id};
  const offer=await staff.request('docent-silver','boycott','answer',lens,{question});
  assert.equal(offer.provenance.provider,'proxy',profileId+'/'+question+': '+JSON.stringify(outcomes));assert.equal(providerCalls,1);assert.deepEqual(paths,['/functions/v1/ai-proxy/session','/functions/v1/ai-proxy/request']);
  if(expected.length)assert.equal(offer.proposal.text,expected[0].quote);else assert.match(offer.proposal.text,/I don't know/);
  assert.deepEqual(offer.proposal.citations,expected.map(e=>e.blockId));
  const [r]=await sql`SELECT * FROM atlas_ai.call_receipts WHERE id=${offer.provenance.receiptId}`;assert.equal(r.result,'accepted');assert.equal(r.failure_class,null);
  assert.equal(local.data.ledgers[offer.placeId].at(-1).diff.receiptId,r.id);
 }
});
test('Docent thinking envelopes accept only grounded answer text and bill total output once without persisting metadata',async()=>{
 await enabled();await sql`UPDATE atlas_ai.routing_config SET model_id=${docentThinkingFixture.model} WHERE route_key='guide'`;
 const [thinking,answer]=docentThinkingFixture.content,redacted={type:'redacted_thinking',data:'SYNTHETIC_REDACTED_CANARY'};
 const variants=[
  ['default omitted thinking',docentThinkingFixture.content,204],
  ['thinking summary',[{...thinking,thinking:'SYNTHETIC_THINKING_CANARY'},answer],204],
  ['redacted thinking',[redacted,answer],204],
  ['both metadata types and fenced answer',[thinking,redacted,{type:'text',text:docentFixture.content[0].text}],204],
  ['split text',[thinking,{type:'text',text:answer.text.slice(0,50)},{type:'text',text:answer.text.slice(50)}],204],
  ['unknown thinking count',docentThinkingFixture.content,null]
 ];
 for(const [name,content,reasoning] of variants){
  const s=await store.bootstrap(),spec=request();spec.context.question='VISITOR_QUESTION_CANARY';let calls=0,attemptId;
  const h=handler(async(url,options)=>{
   calls++;assert.equal(String(url),'https://api.anthropic.com/v1/messages');
   const outgoing=JSON.parse(options.body);assert.deepEqual(Object.keys(outgoing).sort(),['max_tokens','messages','model']);
   assert.equal(outgoing.max_tokens,512);assert.equal(outgoing.model,docentThinkingFixture.model);
   const [a]=await sql`SELECT * FROM atlas_ai.call_leases WHERE state='dispatched'`;
   assert(a);attemptId=a.id;assert(Number(a.reserved_microusd)>1200);
   assert((await sql`SELECT * FROM atlas_ai.quota_windows WHERE reserved_microusd>0`).length>=5);
   assert.equal((await sql`SELECT * FROM atlas_ai.call_receipts WHERE id=${attemptId}`).length,0);
   return Response.json({...docentThinkingFixture,content,usage:{...docentThinkingFixture.usage,output_tokens_details:reasoning===null?undefined:{thinking_tokens:reasoning}}});
  });
  const response=await h(req('/request',spec,s.session)),json=await response.json();assert.equal(response.status,200,name);assert.equal(calls,1);
  assert.equal(json.proposal.text,docentAnswer.excerpts[0].quote);assert.deepEqual(json.proposal.citations,['lead']);assert.equal(json.receiptData.receiptId,attemptId);
  const [r]=await sql`SELECT * FROM atlas_ai.call_receipts WHERE id=${attemptId}`;
  assert.equal(r.result,'accepted');assert.equal(r.failure_class,null);assert.equal(r.cost_basis,'measured');assert.equal(r.reasoning_tokens,reasoning);
  assert.equal(r.input_tokens,600);assert.equal(r.output_tokens,300);assert.equal(Number(r.cost_microusd),1200);
  const leases=await sql`SELECT * FROM atlas_ai.call_leases WHERE id=${attemptId}`;assert.equal(leases[0].state,'completed');
  assert(!JSON.stringify([json,r,leases]).includes('CANARY'));assert(!JSON.stringify([r,leases]).includes(docentAnswer.excerpts[0].quote));
  assert((await sql`SELECT * FROM atlas_ai.quota_windows`).every(q=>Number(q.reserved_microusd)===0));
  assert.equal((await h(req('/request',spec,s.session))).status,409);assert.equal(calls,1);
 }
 assert.equal((await sql`SELECT * FROM atlas_ai.call_receipts`).length,variants.length);
 const [publicBudget]=await sql`SELECT * FROM atlas_ai.quota_windows WHERE bucket='public'`;
 assert.equal(publicBudget.calls_used,variants.length);assert.equal(Number(publicBudget.spent_microusd),1200*variants.length);
});
test('Docent ignores only well-formed thinking metadata and rejects tools, unknown blocks and metadata-only answers',async()=>{
 await enabled();const [thinking,answer]=docentThinkingFixture.content;
 const variants=[
  ['unrequested tool',[thinking,answer,{type:'tool_use',id:'fixture',name:'unrequested',input:{text:'TOOL_CANARY'}}]],
  ['unknown metadata',[thinking,answer,{type:'future_block',data:'UNKNOWN_CANARY'}]],
  ['missing thinking',[{type:'thinking',signature:'SIGNATURE_CANARY'},answer]],
  ['missing signature',[{type:'thinking',thinking:''},answer]],
  ['non-string thinking',[{...thinking,thinking:{text:'THINKING_CANARY'}},answer]],
  ['non-string signature',[{...thinking,signature:42},answer]],
  ['missing redaction',[{type:'redacted_thinking'},answer]],
  ['non-string redaction',[{type:'redacted_thinking',data:42},answer]],
  ['non-string answer',[thinking,{type:'text',text:{excerpts:[]}}]],
  ['foreign text type',[thinking,{type:'output_text',text:answer.text}]],
  ['null block',[thinking,null,answer]],
  ['null content',null],
  ['empty content',[]],
  ['answer in thinking only',[{...thinking,thinking:answer.text}]],
  ['answer in redaction only',[{type:'redacted_thinking',data:answer.text}]]
 ];
 for(const [name,content] of variants){
  const s=await store.bootstrap();let calls=0;
  const response=await handler(async()=>{calls++;return Response.json({...docentThinkingFixture,content});})(req('/request',request(),s.session));
  const json=await response.json();assert.equal(response.status,502,name);assert.equal(calls,1);assert.equal(json.failureClass,'provider_content_invalid',name);
  assert.deepEqual(Object.keys(json).sort(),['code','failureClass','receiptId']);
  const [r]=await sql`SELECT * FROM atlas_ai.call_receipts WHERE id=${json.receiptId}`;
  assert.equal(r.result,'rejected');assert.equal(r.failure_class,'provider_content_invalid');assert.equal(r.cost_basis,'measured');assert.equal(Number(r.cost_microusd),1200);
  assert(!JSON.stringify([json,r,await sql`SELECT * FROM atlas_ai.call_leases WHERE id=${json.receiptId}`]).includes('CANARY'));
 }
 assert.equal((await sql`SELECT * FROM atlas_ai.call_receipts`).length,variants.length);
 assert((await sql`SELECT * FROM atlas_ai.quota_windows`).every(q=>Number(q.reserved_microusd)===0));
});
test('thinking metadata cannot rescue invalid answer text, non-visible evidence or incomplete output',async()=>{
 await enabled();const [thinking,answer]=docentThinkingFixture.content;
 const variants=[
  ['valid JSON in thinking only','ANSWER_TEXT_CANARY','proposal_json_invalid'],
  ['surrounding prose','Here is the answer: '+answer.text,'proposal_json_invalid'],
  ['extra assertion',JSON.stringify({...docentAnswer,answer:'UNSUPPORTED_CANARY'}),'proposal_schema_invalid'],
  ['non-visible evidence',JSON.stringify({excerpts:[{blockId:'timeline',quote:docentAnswer.excerpts[0].quote}]}),'evidence_block_not_visible'],
  ['fabricated quote',JSON.stringify({excerpts:[{blockId:'lead',quote:'FABRICATED_CANARY'}]}),'evidence_quote_not_exact'],
  ['truncated output',answer.text,'provider_output_incomplete','max_tokens']
 ];
 for(const [name,text,expected,stop_reason='end_turn'] of variants){
  const s=await store.bootstrap();let calls=0;
  const content=[{...thinking,thinking:answer.text},{type:'text',text}];
  const response=await handler(async()=>{calls++;return Response.json({...docentThinkingFixture,content,stop_reason});})(req('/request',request(),s.session));
  const json=await response.json();assert.equal(response.status,502,name);assert.equal(json.failureClass,expected,name);assert.equal(calls,1);
  const [r]=await sql`SELECT * FROM atlas_ai.call_receipts WHERE id=${json.receiptId}`;
  assert.equal(r.result,'rejected');assert.equal(r.failure_class,expected);assert.equal(r.cost_basis,'measured');assert.equal(Number(r.cost_microusd),1200);
  assert(!JSON.stringify([json,r]).includes('CANARY'));
 }
 assert((await sql`SELECT * FROM atlas_ai.quota_windows`).every(q=>Number(q.reserved_microusd)===0));
});
test('thinking uses the existing total output cap even when visible answer text is short',async()=>{
 await enabled();const s=await store.bootstrap();let calls=0;
 const response=await handler(async(url,options)=>{
  calls++;assert.equal(JSON.parse(options.body).max_tokens,512);
  return Response.json({...docentThinkingFixture,usage:{...docentThinkingFixture.usage,output_tokens:513,output_tokens_details:{thinking_tokens:420}}});
 })(req('/request',request(),s.session));
 const json=await response.json();assert.equal(response.status,502);assert.equal(json.failureClass,'accounting_bound_exceeded');assert.equal(calls,1);
 const [r]=await sql`SELECT * FROM atlas_ai.call_receipts WHERE id=${json.receiptId}`;
 assert.equal(r.output_tokens,513);assert.equal(r.reasoning_tokens,420);assert.equal(Number(r.cost_microusd),1626);assert.equal(r.cost_basis,'measured');assert.equal(r.failure_class,'accounting_bound_exceeded');
 assert.equal((await store.config()).enabled,false);assert((await sql`SELECT * FROM atlas_ai.quota_windows`).every(q=>Number(q.reserved_microusd)===0));
});
test('malformed thinking usage rejects before answer parsing and retains the complete cost reservation',async()=>{
 await enabled();
 for(const details of [{thinking_tokens:301},{thinking_tokens:-1},{thinking_tokens:'204'},[],false]){
  const s=await store.bootstrap();let calls=0,reserved;
  const response=await handler(async()=>{
   calls++;const [a]=await sql`SELECT * FROM atlas_ai.call_leases WHERE state='dispatched'`;reserved=Number(a.reserved_microusd);
   return Response.json({...docentThinkingFixture,usage:{...docentThinkingFixture.usage,output_tokens_details:details}});
  })(req('/request',request(),s.session));
  const json=await response.json();assert.equal(response.status,502);assert.equal(json.failureClass,'provider_usage_invalid');assert.equal(calls,1);
  const [r]=await sql`SELECT * FROM atlas_ai.call_receipts WHERE id=${json.receiptId}`;
  assert.equal(r.cost_basis,'reserved');assert.equal(Number(r.cost_microusd),reserved);assert.equal(r.output_tokens,null);assert.equal(r.reasoning_tokens,null);assert.equal(r.failure_class,'provider_usage_invalid');
 }
 assert((await sql`SELECT * FROM atlas_ai.quota_windows`).every(q=>Number(q.reserved_microusd)===0));
});
test('Docent fence handling preserves schema, exact-quote, length and visible-evidence rejections',async()=>{
 await enabled();
 const quote=docentAnswer.excerpts[0].quote,withQuote=quote=>({excerpts:[{blockId:'lead',quote}]});
 const variants=[
  ['paraphrase',withQuote('This Place tells the story of the Tallahassee bus boycott.'),'evidence_quote_not_exact'],
  ['invented claim',withQuote(quote+' Everyone in the city participated.'),'evidence_quote_not_exact'],
  ['normalized punctuation',withQuote(quote.replace('city’s',"city's")),'evidence_quote_not_exact'],
  ['non-visible block',{excerpts:[{blockId:'timeline',quote}]},'evidence_block_not_visible'],
  ['source label',withQuote('Florida Memory: civil-rights collections'),'evidence_quote_not_exact'],
  ['wrong ID field',{excerpts:[{id:'lead',quote}]},'proposal_schema_invalid'],
  ['extra assertion',{...docentAnswer,answer:'An ungrounded explanation.'},'proposal_schema_invalid'],
  ['extra citation field',{excerpts:[{blockId:'lead',quote,citation:'outside-source'}]},'proposal_schema_invalid'],
  ['too many excerpts',{excerpts:Array(4).fill({blockId:'lead',quote})},'proposal_schema_invalid'],
  ['overlong quote',withQuote('x'.repeat(801)),'proposal_schema_invalid'],
  ['empty quote',withQuote(''),'proposal_schema_invalid'],
  ['not an excerpts array',{excerpts:quote},'proposal_schema_invalid']
 ];
 for(const [name,value,expected] of variants){
  const s=await store.bootstrap();let calls=0;
  const response=await handler(async()=>{calls++;return Response.json({...docentFixture,content:[{type:'text',text:'```json\n'+JSON.stringify(value)+'\n```'}]});})(req('/request',request(),s.session));
  const json=await response.json();assert.equal(response.status,502,name);assert.equal(json.code,'BAD_PROPOSAL');assert.equal(calls,1);
  assert.deepEqual(Object.keys(json).sort(),['code','failureClass','receiptId']);assert.equal(json.failureClass,expected,name);
  const [r]=await sql`SELECT * FROM atlas_ai.call_receipts WHERE id=${json.receiptId}`;
  assert.equal(r.result,'rejected');assert.equal(r.validation_passed,false);assert.equal(r.cost_basis,'measured');assert.equal(Number(r.cost_microusd),792);assert.equal(r.failure_class,expected,name);
 }
 assert.equal((await sql`SELECT * FROM atlas_ai.call_receipts`).length,variants.length);
 assert((await sql`SELECT * FROM atlas_ai.quota_windows`).every(q=>Number(q.reserved_microusd)===0));
 // Length remains a separate rejection even if the long text is an exact match.
 assert.throws(()=>validateAnswer({excerpts:[{blockId:'long',quote:'x'.repeat(801)}]},[{id:'long',body:'x'.repeat(802)}]));
});
test('Docent parsing never extracts JSON from prose, multiple documents, invalid fences or incomplete provider output',async()=>{
 await enabled();
 const variants=[
  ['preamble','Here is the answer:\n'+docentFixture.content[0].text],
  ['trailing prose',docentFixture.content[0].text+'\nSome extra explanation.'],
  ['two JSON objects','```json\n'+docentJSON+'\n'+docentJSON+'\n```'],
  ['two fences',docentFixture.content[0].text+'\n'+docentFixture.content[0].text],
  ['wrong language','```javascript\n'+docentJSON+'\n```'],
  ['invalid JSON','```json\n{"excerpts":\n```'],
  ['unclosed fence','```json\n'+docentJSON],
  ['truncated provider',docentJSON,{stop_reason:'max_tokens'},'provider_output_incomplete'],
  ['non-text provider block',docentJSON,{content:[{type:'tool_use',id:'local_fixture',name:'unrequested',input:{}}]},'provider_content_invalid']
 ];
 for(const [name,text,patch={},expected='proposal_json_invalid'] of variants){
  const s=await store.bootstrap();let calls=0;
  const response=await handler(async()=>{calls++;return Response.json({...docentFixture,content:[{type:'text',text}],...patch});})(req('/request',request(),s.session));
  const json=await response.json();assert.equal(response.status,502,name);assert.equal(json.code,'BAD_PROPOSAL');assert.equal(calls,1);assert.equal(json.failureClass,expected,name);
  const [r]=await sql`SELECT * FROM atlas_ai.call_receipts WHERE id=${json.receiptId}`;
  assert.equal(r.result,'rejected');assert.equal(r.cost_basis,'measured');assert.equal(Number(r.cost_microusd),792);assert.equal(r.failure_class,expected,name);
 }
 assert.equal((await sql`SELECT * FROM atlas_ai.call_receipts`).length,variants.length);
});
test('provider fence support is limited to guide and does not change the builder output contract',async()=>{
 const deps={getSecret:secrets,fetchImpl:async()=>Response.json(docentFixture)};
 const route={provider:'anthropic',model_id:docentFixture.model,output_token_cap:512};
 assert.deepEqual((await generate(deps,{...route,route_key:'guide'},'local fixture')).value,docentAnswer);
 assert.equal((await generate(deps,{...route,route_key:'builder'},'local fixture')).value,null);
});
test('provider and answer failures return only fixed diagnostic classes and never accept injected error labels or text',async()=>{
 await enabled();
 const variants=[
  ['HTTP failure',()=>new Response('PROVIDER_KEY_CANARY',{status:500}),'provider_request_failed','reserved'],
  ['outer JSON',()=>new Response('PROVIDER_BODY_CANARY'),'provider_response_invalid','reserved'],
  ['outer null',()=>Response.json(null),'provider_response_invalid','reserved'],
  ['invalid usage',()=>Response.json({...docentFixture,usage:{input_tokens:-1,output_tokens:20},failureClass:'PROVIDER_LABEL_CANARY'}),'provider_usage_invalid','reserved'],
  ['null proposal',()=>Response.json({...docentFixture,content:[{type:'text',text:'null'}]}),'proposal_schema_invalid','measured'],
  ['injected labels',()=>Response.json({...docentFixture,model:'MODEL_CANARY',failureClass:'provider_request_failed',error:'PROVIDER_ERROR_CANARY',content:[{type:'text',text:JSON.stringify({excerpts:[{blockId:'lead',quote:'ANSWER_CANARY'}]})}]}),'evidence_quote_not_exact','measured']
 ];
 for(const [name,mocked,expected,basis] of variants){
  const s=await store.bootstrap(),spec=request();spec.context.question='VISITOR_QUESTION_CANARY';let calls=0;
  const response=await handler(async()=>{calls++;return mocked();})(req('/request',spec,s.session));
  const json=await response.json();assert.equal(response.status,502,name);assert.equal(calls,1);assert.equal(json.failureClass,expected,name);
  const [r]=await sql`SELECT * FROM atlas_ai.call_receipts WHERE id=${json.receiptId}`;
  assert.equal(r.failure_class,expected);assert.equal(r.cost_basis,basis);assert(!JSON.stringify([json,r]).includes('CANARY'));
 }
});
test('both provider adapters classify output problems without exposing raw provider data',async()=>{
 const route={provider:'openai',route_key:'builder_challenger',model_id:'mock-openai',output_token_cap:512};
 const base={status:'completed',usage:{input_tokens:100,output_tokens:20},output:[{type:'message',content:[{type:'output_text',text:docentJSON}]}]};
 for(const [data,expected] of [[base,null],[{...base,status:'incomplete'},'provider_output_incomplete'],[{...base,output:{}},'provider_content_invalid'],[{...base,output:[{type:'message',content:[{type:'output_text',text:'OUTPUT_CANARY'}]}]},'proposal_json_invalid']]){
  const result=await generate({getSecret:secrets,fetchImpl:async()=>Response.json(data)},route,'public fixture');assert.equal(result.failureClass,expected);
  if(expected)assert(!JSON.stringify(result).includes('CANARY'));
 }
});
test('builder validation rejection uses its own fixed class without running a comparison',async()=>{
 await enabled();const b=await benchmarkGrant();
 const r={requestId:id(),job:'builder',agentId:'gus-benchmark',schemaId:BUILDER_SCHEMA,context:{placeId:'boycott',catalogRevision:catalog.revision,caseId:'01-seat-narration',candidate:'primary'}};
 const hash=Buffer.from(await digest(prepare(r).prompt)).toString('hex'),[route]=await sql`SELECT * FROM atlas_ai.routing_config WHERE route_key='builder'`;
 await sql`UPDATE atlas_ai.routing_config SET billing_contract=${sql.json({...route.billing_contract,synthetic_input_bounds:{[hash]:6000}})} WHERE route_key='builder'`;
 const h=handler(async()=>Response.json({...docentFixture,content:[{type:'text',text:'{"untrusted":"BUILDER_CANARY"}'}]}));
 const response=await h(req('/request',r,b.session)),json=await response.json();assert.equal(response.status,502);assert.equal(json.failureClass,'builder_validation_failed');
 const [receipt]=await sql`SELECT * FROM atlas_ai.call_receipts WHERE id=${json.receiptId}`;assert.equal(receipt.failure_class,'builder_validation_failed');assert(!JSON.stringify(receipt).includes('CANARY'));
});
test('settlement sanitizes unexpected diagnostic values and replay cannot change the first permanent class',async()=>{
 await enabled();const s=await store.bootstrap(),a=await reserve(s);await store.dispatch(a.id);
 const first=await store.settle(a.id,{usage,accepted:false,failureClass:'VISITOR_TEXT_CANARY'});
 assert.equal(first.failure_class,'unclassified_rejection');assert(!JSON.stringify(first).includes('CANARY'));
 const again=await store.settle(a.id,{usage,accepted:false,failureClass:'proposal_json_invalid'});assert.equal(again.failure_class,'unclassified_rejection');
 assert.equal((await sql`SELECT * FROM atlas_ai.call_receipts`).length,1);
});
test('handler success, replay, invalid provider JSON and provider failure never echo visitor text or raw errors',async()=>{
 await enabled();const s=await store.bootstrap(),r=request();r.context.question='VISITOR_CANARY';let calls=0;
 const h=handler(async()=>{calls++;return Response.json({stop_reason:'end_turn',content:[{type:'text',text:JSON.stringify({excerpts:[]})}],usage:{input_tokens:100,output_tokens:20}});});
 const response=await h(req('/request',r,s.session));assert.equal(response.status,200);assert.equal(calls,1);assert(!JSON.stringify(await response.json()).includes('VISITOR_CANARY'));
 assert.equal((await h(req('/request',r,s.session))).status,409);assert.equal(calls,1);
 const bad=handler(async()=>new Response('RAW_PROVIDER_ERROR_VISITOR_CANARY',{status:500}));
 const error=await bad(req('/request',request(),s.session));assert.equal(error.status,502);assert(!JSON.stringify(await error.json()).includes('CANARY'));
 assert.equal((await sql`SELECT * FROM atlas_ai.call_receipts`).length,2);
});
test('operator model check works with generation disabled; public bootstrap cannot mint its grant',async()=>{
 const t=token();await store.issueModelCheck(await digest(token()),await digest(t));let calls=[];
 await assertModelGrant();
 const h=handler(async(url,options)=>{calls.push([String(url),options.method]);return Response.json({data:[{id:String(url).includes('anthropic')?'claude-opus-5-5':'gpt-6.1-test-sol'}],has_more:false});});
 const r=await h(req('/models',{},t));assert.equal(r.status,200);const json=await r.json();assert(json.models.every(m=>Object.keys(m).join(',')==='name,availability'));
 assert(calls.every(([u,m])=>u.includes('/v1/models')&&m==='GET'));assert.equal(calls.length,2);
 assert.equal((await h(req('/request',request(),t))).status,503);assert.equal((await sql`SELECT * FROM atlas_ai.call_receipts`).length,0);
 await sql`UPDATE atlas_ai.grants SET revoked_at=now()`;assert.equal((await h(req('/models',{},t))).status,401);
});
test('metadata quota is atomic and limited to four checks across every session of the grant with zero spend',async()=>{
 const t=token(),second=token();await store.issueModelCheck(await digest(token()),await digest(t));
 const [g]=await sql`SELECT * FROM atlas_ai.grants`;
 await sql`INSERT INTO atlas_ai.session_leases(id,holder_id,grant_id,token_sha256,created_at,expires_at) VALUES(${id()},${g.holder_id},${g.id},${await digest(second)},now(),now()+interval '30 minutes')`;
 const results=await Promise.allSettled(Array.from({length:12},(_,i)=>store.modelsAllowed(i%2?t:second)));
 assert.equal(results.filter(r=>r.status==='fulfilled').length,4);
 assert(results.filter(r=>r.status==='rejected').every(r=>r.reason.code==='RATE_LIMITED'));
 const rows=await sql`SELECT * FROM atlas_ai.quota_windows`;assert.equal(rows.length,1);assert.equal(rows[0].bucket,'models:'+g.id);
 assert.equal(rows[0].calls_used,4);assert.equal(Number(rows[0].reserved_microusd),0);assert.equal(Number(rows[0].spent_microusd),0);
 assert.equal((await sql`SELECT * FROM atlas_ai.call_leases`).length,0);assert.equal((await sql`SELECT * FROM atlas_ai.call_receipts`).length,0);
});
test('metadata grant constraints reject generation capabilities and nonzero budgets; metadata cannot generate when enabled',async()=>{
 const t=token();await store.issueModelCheck(await digest(token()),await digest(t));
 for(const change of ["scope='suggest'","jobs=ARRAY['model-check','builder']","agent_ids=ARRAY['gus-benchmark']","place_ids=ARRAY['boycott']",`schema_ids=ARRAY['${MODEL_SCHEMA}','${BUILDER_SCHEMA}']`,'max_calls=5','max_microusd=1']){
  await assert.rejects(sql.unsafe('UPDATE atlas_ai.grants SET '+change),e=>e.code==='23514');
 }
 await enabled();const h=handler();assert.equal((await h(req('/request',request(),t))).status,403);
 const builder={requestId:id(),job:'builder',agentId:'gus-benchmark',schemaId:BUILDER_SCHEMA,context:{placeId:'boycott',catalogRevision:catalog.revision,caseId:'01-seat-narration',candidate:'primary'}};
 assert.equal((await h(req('/request',builder,t))).status,403);
 assert.equal((await sql`SELECT * FROM atlas_ai.call_leases`).length,0);assert.equal((await sql`SELECT * FROM atlas_ai.quota_windows`).length,0);
});
test('benchmark grants cannot list models or borrow the metadata schema and zero-dollar budget',async()=>{
 const b=await benchmarkGrant();await assert.rejects(store.modelsAllowed(b.session),expectCode('OUT_OF_SCOPE'));
 await assert.rejects(sql`UPDATE atlas_ai.grants SET schema_ids=ARRAY[${BUILDER_SCHEMA},${MODEL_SCHEMA}]::text[]`,e=>e.code==='23514');
 await assert.rejects(sql`UPDATE atlas_ai.grants SET max_microusd=0`,e=>e.code==='23514');
 assert.equal((await sql`SELECT authority FROM atlas_ai.grant_receipts`)[0].authority,'owner-approved-benchmark');
});
test('model listing paginates, distinguishes absent from unknown, never guesses Sol ID or follows redirects',async()=>{
 let n=0;const rows=await modelCheck({getSecret:secrets,fetchImpl:async(url,opts)=>{
  assert.equal(opts.method,'GET');assert.equal(opts.redirect,'error');n++;
  if(String(url).includes('openai'))return Response.json({data:[{id:'gpt-6.1-sol-test'},{id:'private-owner-field',owned_by:'DO_NOT_RETURN'}]});
  return Response.json(String(url).includes('after_id')?{data:[{id:'claude-haiku-5-5'}],has_more:false}:{data:[{id:'claude-opus-5-5'}],has_more:true,last_id:'claude-opus-5-5'});
 }});
 assert.equal(n,3);assert(rows.some(m=>m.name==='claude-fable-5-2'&&m.availability==='unavailable'));assert(rows.some(m=>m.name.startsWith('GPT-6.1 Sol')&&m.availability==='unknown'));
 assert(!JSON.stringify(rows).includes('DO_NOT_RETURN'));assert(!JSON.stringify(rows).includes('private-owner-field'));
 const failed=await modelCheck({getSecret:secrets,fetchImpl:async()=>Response.json({error:'DO_NOT_RETURN'},{status:401})},'gpt-6.1-sol-test');assert(failed.every(m=>m.availability==='unknown'));
});
test('builder output registry rejects invented behavior, forged backing and queued archive capability',()=>{
 const gap={schema_version:BUILDER_SCHEMA,place:'boycott',backing_ref:null,status:'capability_gap',reason:'Sources are queued.',changes:[],gaps:[{code:'connected_source_queued',reason:'No archive import.'}]};
 assert.deepEqual(validateBuilder(gap,validateBuilderSchema),gap);
 assert.throws(()=>validateBuilder({...gap,backing_ref:{system:'second-look',ref:'forged'}},validateBuilderSchema));
 const c=structuredClone(catalog.components[0]);delete c.position;delete c.facing;
 const proposed={...gap,status:'proposed',gaps:[],changes:[{op:'replace_component',thing:'film',component:c}]};
 c.behaviors[0].then='fetch';assert.throws(()=>validateBuilder(proposed,validateBuilderSchema));
});
test('usage handles cache and reasoning without double billing; malformed counts remain unknown',()=>{
 assert.deepEqual(normalizeUsage('openai',{input_tokens:100,output_tokens:20,input_tokens_details:{cached_tokens:30},output_tokens_details:{reasoning_tokens:10}}),{input_tokens:70,output_tokens:20,cache_read_tokens:30,cache_write_tokens:0,reasoning_tokens:10});
 assert.equal(normalizeUsage('openai',{input_tokens:10,output_tokens:20,input_tokens_details:{cached_tokens:30}}),null);assert.equal(normalizeUsage('anthropic',{}),null);
});
test('Anthropic usage reports optional thinking as part of total output, preserves cache counts and never infers thinking from content',()=>{
 const u={...docentThinkingFixture.usage,cache_read_input_tokens:30,cache_creation_input_tokens:50};
 assert.deepEqual(normalizeUsage('anthropic',u),{input_tokens:600,output_tokens:300,cache_read_tokens:30,cache_write_tokens:50,reasoning_tokens:204});
 for(const details of [undefined,null,{}, {thinking_tokens:null}])assert.equal(normalizeUsage('anthropic',{...u,output_tokens_details:details}).reasoning_tokens,null);
 assert.equal(normalizeUsage('anthropic',{...u,output_tokens_details:{thinking_tokens:0}}).reasoning_tokens,0);
 for(const details of [{thinking_tokens:301},{thinking_tokens:-1},{thinking_tokens:1.5},{thinking_tokens:'204'},[],false])assert.equal(normalizeUsage('anthropic',{...u,output_tokens_details:details}),null);
});
test('rollback is idempotent, disables routes and grants, preserves receipts, pending costs and unrelated resources',async()=>{
 await enabled();const s=await store.bootstrap();await paid(s);const a=await reserve(s);await store.dispatch(a.id);
 const before=await sql`SELECT * FROM atlas_ai.call_receipts`;const grants=await sql`SELECT * FROM atlas_ai.grant_receipts`;
 await sql.unsafe(rollback);await sql.unsafe(rollback);
 assert.equal((await store.config()).enabled,false);assert((await sql`SELECT * FROM atlas_ai.routing_config`).every(r=>r.model_id===null&&!r.enabled));
 assert.deepEqual(await sql`SELECT * FROM atlas_ai.call_receipts`,before);assert.equal((await sql`SELECT * FROM atlas_ai.grant_receipts`).length,grants.length+1);
 assert((await sql`SELECT * FROM atlas_ai.quota_windows`).some(q=>Number(q.reserved_microusd)>0));assert.deepEqual(Array.from(await sql`SELECT * FROM public.sentinel`),[{id:7}]);
});

test('operator preparation emits only digests in SQL and a private bearer file; issued grant works only for metadata',async()=>{
 const {folder,g,grantSQL}=await preparedModelGrant();assert(!grantSQL.includes(g.session));assert(!/builder|benchmark/.test(grantSQL));
 assert.equal((await stat(folder+'/grant.json')).mode&0o777,0o600);await assertModelGrant(g.grantId);await store.modelsAllowed(g.session);
 const models=await runModelCheck('https://example.test/functions/v1/ai-proxy',folder+'/grant.json',undefined,async(url,options)=>{
  assert.equal(new URL(url).pathname,'/functions/v1/ai-proxy/models');assert.equal(options.headers.Authorization,'Bearer '+g.session);
  return handler(async()=>Response.json({data:[],has_more:false}))(new Request(url,options));
 });assert(models.every(m=>Object.keys(m).length===2));
 await enabled();await assert.rejects(reserve({session:g.session}),expectCode('OUT_OF_SCOPE'));
});
test('generated revocation is targeted and idempotent, denies further checks and preserves receipts, counters and other grants',async()=>{
 const {folder,g}=await preparedModelGrant();await store.modelsAllowed(g.session);
 await enabled();const publicGrant=await store.bootstrap();await sql`UPDATE atlas_ai.runtime_config SET enabled=false`;
 const config=await store.config(),counters=await sql`SELECT * FROM atlas_ai.quota_windows ORDER BY bucket`;
 await revokeModelCheck(folder+'/grant.json');const revokeSQL=await readFile(folder+'/revoke-model-check.sql','utf8');
 assert(!revokeSQL.includes(g.session));assert(!/builder|benchmark/.test(revokeSQL));
 await sql.unsafe(revokeSQL);await sql.unsafe(revokeSQL);
 const receipts=await sql`SELECT action,authority FROM atlas_ai.grant_receipts WHERE grant_id=${g.grantId} ORDER BY time`;
 assert.deepEqual(Array.from(receipts),[{action:'issued',authority:'operator-model-check'},{action:'revoked',authority:'operator-model-check'}]);
 const [grant]=await sql`SELECT * FROM atlas_ai.grants WHERE id=${g.grantId}`;assert(grant.revoked_at);
 assert((await sql`SELECT revoked_at FROM atlas_ai.holder_leases WHERE id=${grant.holder_id}`)[0].revoked_at);
 assert((await sql`SELECT revoked_at FROM atlas_ai.session_leases WHERE grant_id=${g.grantId}`).every(s=>s.revoked_at));
 assert.equal((await handler()(req('/models',{},g.session))).status,401);
 const publicHash=await digest(publicGrant.session);await store.locked((tx,c,now)=>store.auth(tx,publicHash,now));
 assert.deepEqual(await store.config(),config);assert.deepEqual(await sql`SELECT * FROM atlas_ai.quota_windows ORDER BY bucket`,counters);
 assert.equal((await sql`SELECT * FROM atlas_ai.call_receipts`).length,0);
});
test('revocation generator rejects injected references and generated SQL refuses a non-metadata grant without side effects',async()=>{
 const folder=await mkdtemp(dir+'/revoke-'),file=folder+'/grant.json';
 await writeFile(file,JSON.stringify({grantId:"'; DROP SCHEMA atlas_ai; --"}));await assert.rejects(revokeModelCheck(file),/Invalid model-check grant reference/);
 const b=await benchmarkGrant();await writeFile(file,JSON.stringify({grantId:b.grantId}));await revokeModelCheck(file);
 const revokeSQL=await readFile(folder+'/revoke-model-check.sql','utf8');
 const conn=await sql.reserve();try{await assert.rejects(conn.unsafe(revokeSQL),/Refusing to revoke a non-model-check grant/);await conn.unsafe('ROLLBACK');}finally{conn.release();}
 assert.equal((await sql`SELECT revoked_at FROM atlas_ai.grants`)[0].revoked_at,null);assert.equal((await sql`SELECT * FROM atlas_ai.grant_receipts`).length,1);
});
test('access-off rollback records the metadata authority once and still prevents full undo after grant receipts',async()=>{
 await store.issueModelCheck(await digest(token()),await digest(token()));await sql.unsafe(rollback);await sql.unsafe(rollback);
 const rows=await sql`SELECT action,authority FROM atlas_ai.grant_receipts ORDER BY time`;
 assert.deepEqual(Array.from(rows),[{action:'issued',authority:'operator-model-check'},{action:'revoked',authority:'operator-model-check'}]);
 const undo=await readFile(new URL('../supabase/migrations/rollback/20261113120000_atlas_ai.full-undo.sql',import.meta.url),'utf8');
 const conn=await sql.reserve();try{await assert.rejects(conn.unsafe(undo),/permanent Receipts exist/);await conn.unsafe('ROLLBACK');}finally{conn.release();}
 assert.deepEqual(await sql`SELECT action,authority FROM atlas_ai.grant_receipts ORDER BY time`,rows);
});
test('all five unchanged components pass the frozen schema and host validation',async()=>{
 for(const c of catalog.components){const {position,facing,...component}=c;const proposal={schema_version:BUILDER_SCHEMA,place:'boycott',backing_ref:null,status:'proposed',reason:'Preserve sample Things.',changes:[{op:'replace_component',thing:c.id,component}],gaps:[]};
  assert(validateBuilderSchema(proposal));assert.deepEqual(validateBuilder(proposal,validateBuilderSchema),proposal);
 }
 assert.equal(await readFile(new URL('../src/kit.js',import.meta.url),'utf8'),await readFile(new URL('../supabase/functions/ai-proxy/kit.js',import.meta.url),'utf8'));
});
test('benchmark attempts enforce grant total of 40, dollar ceiling and global concurrency one',async()=>{
 await enabled();const {session:t}=await benchmarkGrant();
 const r={requestId:id(),job:'builder',agentId:'gus-benchmark',schemaId:BUILDER_SCHEMA,context:{placeId:'boycott',catalogRevision:catalog.revision,caseId:'01-seat-narration',candidate:'primary'}};
 const prompt=prepare(r).prompt,hash=Buffer.from(await digest(prompt)).toString('hex');const [route]=await sql`SELECT * FROM atlas_ai.routing_config WHERE route_key='builder'`;
 await sql`UPDATE atlas_ai.routing_config SET billing_contract=${sql.json({...route.billing_contract,synthetic_input_bounds:{[hash]:6000}})} WHERE route_key='builder'`;
 const a=await store.reserve(t,r,prompt);assert.equal(a.accounting.inputBound,6000);await assert.rejects(store.reserve(t,{...r,requestId:id()},prompt),expectCode('RATE_LIMITED'));
 await store.dispatch(a.id);await store.settle(a.id,{usage,accepted:true});
 await sql`UPDATE atlas_ai.quota_windows SET calls_used=40 WHERE bucket LIKE 'grant:%'`;await assert.rejects(store.reserve(t,{...r,requestId:id()},prompt),expectCode('RATE_LIMITED'));
 await sql`UPDATE atlas_ai.quota_windows SET calls_used=1,spent_microusd=10000000 WHERE bucket LIKE 'grant:%'`;await assert.rejects(store.reserve(t,{...r,requestId:id()},prompt),expectCode('RATE_LIMITED'));
});
test('lease expiry constraints, revoked holder and grant recheck prevent a late accepted response',async()=>{
 await enabled();const s=await store.bootstrap();await assert.rejects(sql`UPDATE atlas_ai.session_leases SET expires_at=created_at+interval '31 minutes'`);
 const a=await reserve(s);assert.equal(await store.dispatch(a.id),true);await sql`UPDATE atlas_ai.grants SET revoked_at=now()`;
 const r=await store.settle(a.id,{usage,accepted:true});assert.equal(r.validation_passed,false);assert.equal(r.cost_basis,'measured');assert.equal(r.failure_class,'result_recheck_failed');
 await sql`UPDATE atlas_ai.grants SET revoked_at=NULL`;await sql`UPDATE atlas_ai.holder_leases SET revoked_at=now()`;await assert.rejects(reserve(s),expectCode('UNAUTHORIZED'));
});
test('route changes between reserve and dispatch fail closed; missing key cannot dispatch',async()=>{
 await enabled();const s=await store.bootstrap(),a=await reserve(s);await sql`UPDATE atlas_ai.routing_config SET model_id='changed-model' WHERE route_key='guide'`;
 assert.equal(await store.dispatch(a.id),false);
 const h=createHandler({store,getSecret:n=>n==='ALLOWED_ORIGINS'?ORIGIN:undefined,validateBuilderSchema,fetchImpl:()=>{throw new Error('must not fetch');}});
 assert.equal((await h(req('/request',request(),s.session))).status,503);
 assert((await sql`SELECT * FROM atlas_ai.call_receipts`).every(r=>r.cost_basis==='not-dispatched'));
 assert.deepEqual((await sql`SELECT failure_class FROM atlas_ai.call_receipts ORDER BY time`).map(r=>r.failure_class),['dispatch_recheck_failed','provider_key_missing']);
});
test('oversized chunked body is stopped without trusting Content-Length',async()=>{
 await enabled();let cancelled=false;
 const stream=new ReadableStream({start(c){c.enqueue(new TextEncoder().encode('{"question":"'+'x'.repeat(49*1024)));},cancel(){cancelled=true;}});
 const r=await handler()(new Request('https://example.test/ai-proxy/request',{method:'POST',headers:{Origin:ORIGIN,'Content-Type':'application/json'},body:stream,duplex:'half'}));
 assert.equal(r.status,413);assert(cancelled);
});
test('malformed generation output is rejected with measured usage; provider timeout retains the reserve',async()=>{
 await enabled();const s=await store.bootstrap();
 const malformed=handler(async()=>Response.json({stop_reason:'end_turn',content:[{type:'text',text:'UNTRUSTED_OUTPUT'}],usage:{input_tokens:100,output_tokens:20}}));
 assert.equal((await malformed(req('/request',request(),s.session))).status,502);
 const timeout=handler(async()=>{throw new DOMException('UNTRUSTED_NETWORK_DETAIL','TimeoutError');});assert.equal((await timeout(req('/request',request(),s.session))).status,502);
 const rows=await sql`SELECT * FROM atlas_ai.call_receipts ORDER BY time`;
 assert.deepEqual(rows.map(r=>r.cost_basis),['measured','reserved']);assert.deepEqual(rows.map(r=>r.failure_class),['proposal_json_invalid','provider_request_failed']);assert(!JSON.stringify(rows).includes('UNTRUSTED'));
});
test('inactive monthly window cleanup never refunds uncertain spend or deletes permanent Receipts',async()=>{
 await enabled();const s=await store.bootstrap(),a=await reserve(s);await store.dispatch(a.id);await store.settle(a.id,{accepted:false});
 await sql`UPDATE atlas_ai.call_leases SET expires_at=now()-interval '1 second',created_at=now()-interval '2 minutes'`;
 await store.locked((tx,c,now)=>store.cleanup(tx,now));assert.equal((await sql`SELECT * FROM atlas_ai.call_receipts`).length,1);assert.equal((await sql`SELECT * FROM atlas_ai.call_leases`).length,1);
 assert((await sql`SELECT * FROM atlas_ai.quota_windows WHERE bucket<>'new-holders'`).every(q=>Number(q.spent_microusd)===Number(a.reserved_microusd)));
});
test('expired undispatched reservations get a distinct zero-cost diagnostic',async()=>{
 await enabled();const s=await store.bootstrap(),a=await reserve(s);
 await sql`UPDATE atlas_ai.call_leases SET expires_at=now()-interval '1 second',created_at=now()-interval '2 minutes' WHERE id=${a.id}`;
 await store.locked((tx,c,now)=>store.cleanup(tx,now));
 const [r]=await sql`SELECT * FROM atlas_ai.call_receipts WHERE id=${a.id}`;assert.equal(r.failure_class,'reservation_expired');assert.equal(r.cost_basis,'not-dispatched');assert.equal(Number(r.cost_microusd),0);
});
test('diagnostic rollback preserves recorded classifications, receipts, counters, config and grants',async()=>{
 await enabled();const s=await store.bootstrap();await handler(async()=>Response.json({...docentFixture,content:[{type:'text',text:'invalid JSON'}]}))(req('/request',request(),s.session));
 const receipts=await sql`SELECT * FROM atlas_ai.call_receipts`,counters=await sql`SELECT * FROM atlas_ai.quota_windows ORDER BY bucket`,config=await store.config(),grants=await sql`SELECT * FROM atlas_ai.grants`;
 await sql.unsafe(diagnosticsRollback);await sql.unsafe(diagnosticsRollback);await sql.unsafe(diagnosticsVerify);
 assert.deepEqual(await sql`SELECT * FROM atlas_ai.call_receipts`,receipts);assert.deepEqual(await sql`SELECT * FROM atlas_ai.quota_windows ORDER BY bucket`,counters);
 assert.deepEqual(await store.config(),config);assert.deepEqual(await sql`SELECT * FROM atlas_ai.grants`,grants);
});
test('diagnostic rollback keeps the column while a request is in flight even before any classified receipt',async()=>{
 await enabled();const s=await store.bootstrap(),a=await reserve(s);const counters=await sql`SELECT * FROM atlas_ai.quota_windows ORDER BY bucket`;
 await sql.unsafe(diagnosticsRollback);await sql.unsafe(diagnosticsVerify);
 assert.equal((await sql`SELECT * FROM atlas_ai.call_receipts`).length,0);assert.deepEqual(await sql`SELECT * FROM atlas_ai.quota_windows ORDER BY bucket`,counters);
 assert.equal(await store.dispatch(a.id),true);const r=await store.settle(a.id,{usage,accepted:true});assert.equal(r.failure_class,null);
});

test('full undo removes only an unused installation, is safe if absent, and permits ordered fresh reapply',async()=>{
 const undo=await readFile(new URL('../supabase/migrations/rollback/20261113120000_atlas_ai.full-undo.sql',import.meta.url),'utf8');
 await sql.unsafe(undo);assert.equal((await sql`SELECT to_regnamespace('atlas_ai') AS n`)[0].n,null);
 assert.equal((await sql`SELECT id FROM public.sentinel`)[0].id,7);
 await sql.unsafe(undo);await sql.unsafe(migration);await sql.unsafe(diagnosticsMigration);assert.equal((await store.config()).enabled,false);
 await sql.unsafe(await readFile(new URL('../supabase/operators/verify-stage-a.sql',import.meta.url),'utf8'));
 await sql.unsafe(diagnosticsVerify);
});
test('full undo refuses even one grant Receipt and leaves the complete schema and Receipt intact',async()=>{
 const undo=await readFile(new URL('../supabase/migrations/rollback/20261113120000_atlas_ai.full-undo.sql',import.meta.url),'utf8');
 await store.issueModelCheck(await digest(token()),await digest(token()));
 const conn=await sql.reserve();try{await assert.rejects(conn.unsafe(undo),/permanent Receipts exist/);await conn.unsafe('ROLLBACK');}finally{conn.release();}
 assert.equal((await sql`SELECT * FROM atlas_ai.grant_receipts`).length,1);assert.equal((await store.config()).enabled,false);
});
test('full undo aborts atomically on an unexpected schema dependency',async()=>{
 const undo=await readFile(new URL('../supabase/migrations/rollback/20261113120000_atlas_ai.full-undo.sql',import.meta.url),'utf8');
 await sql`CREATE TABLE atlas_ai.unexpected(id integer)`;
 const conn=await sql.reserve();try{await assert.rejects(conn.unsafe(undo));await conn.unsafe('ROLLBACK');}finally{conn.release();}
 assert.equal((await sql`SELECT count(*)::int AS n FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='atlas_ai' AND relkind='r'`)[0].n,10);
});
