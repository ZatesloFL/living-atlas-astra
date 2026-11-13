import {ORIGIN,GUIDE_SCHEMA,MODEL_SCHEMA,BUILDER_SCHEMA,fail,id,iso,token,digest,envelope,cost,receipt} from './core.js';
const DAY=86400000,MIN=60000;
const live=(r,now)=>r&&!r.revoked_at&&+new Date(r.expires_at)>now;
const day=n=>Math.floor(n/DAY)*DAY;
const month=n=>{const d=new Date(n);return Date.UTC(d.getUTCFullYear(),d.getUTCMonth(),1);};
const monthEnd=n=>{const d=new Date(n);return Date.UTC(d.getUTCFullYear(),d.getUTCMonth()+1,1);};
const num=n=>Number(n);
// Every writer takes the singleton config row first. At this prototype's limits
// this gives a simple cross-instance total order, including operator rollback.
// Transactions end before any provider I/O. Postgres row locks are not JS locks.
export class Store {
 constructor(sql){this.sql=sql;}
 async locked(fn){return this.sql.begin(async tx=>{
  await tx`SET LOCAL lock_timeout='3s'`;
  await tx`SET LOCAL statement_timeout='5s'`;
  const [config]=await tx`SELECT *, clock_timestamp() AS clock FROM atlas_ai.runtime_config WHERE id=true FOR UPDATE`;
  if(!config)fail('LIVE_UNAVAILABLE',503);
  return fn(tx,config,+new Date(config.clock));
 });}
 ready(c,now,paid=true){if(c.public_origin!==ORIGIN||+new Date(c.expires_at)<=now)fail('AI_OFF',503);if(paid&&!c.enabled)fail('AI_OFF',503);}
 async config(){const [c]=await this.sql`SELECT * FROM atlas_ai.runtime_config WHERE id=true`;return c;}
 async auth(tx,hash,now){
  const [s]=await tx`SELECT * FROM atlas_ai.session_leases WHERE token_sha256=${hash}`;
  if(!live(s,now))fail('UNAUTHORIZED',401);
  const [h]=await tx`SELECT * FROM atlas_ai.holder_leases WHERE id=${s.holder_id}`;
  const [g]=await tx`SELECT * FROM atlas_ai.grants WHERE id=${s.grant_id}`;
  if(!live(h,now)||!live(g,now)||g.holder_id!==h.id)fail('UNAUTHORIZED',401);
  return {s,h,g};
 }
 async bucket(tx,b,amount){
  await tx`INSERT INTO atlas_ai.quota_windows(bucket,window_start,expires_at) VALUES(${b.key},${iso(b.start)},${iso(b.end+DAY)}) ON CONFLICT DO NOTHING`;
  const [q]=await tx`SELECT * FROM atlas_ai.quota_windows WHERE bucket=${b.key} AND window_start=${iso(b.start)} FOR UPDATE`;
  if(num(q.calls_used)>=b.calls||num(q.reserved_microusd)+num(q.spent_microusd)+amount>b.money)fail('RATE_LIMITED',429,Math.max(1,Math.min(86400,Math.ceil((b.end-Date.now())/1000))));
  await tx`UPDATE atlas_ai.quota_windows SET calls_used=calls_used+1,reserved_microusd=reserved_microusd+${amount} WHERE bucket=${b.key} AND window_start=${iso(b.start)}`;
 }
 async bootstrap(holderToken){
  const holderHash=holderToken?await digest(holderToken):null;
  const ht=token(),st=token(),hh=await digest(ht),sh=await digest(st);
  return this.locked(async(tx,c,now)=>{
   this.ready(c,now);await this.cleanup(tx,now);
   let h;if(holderHash)[h]=await tx`SELECT * FROM atlas_ai.holder_leases WHERE token_sha256=${holderHash}`;
   // An invalid renewal never silently mints a replacement quota holder.
   if(holderHash&&!live(h,now))fail('UNAUTHORIZED',401);
   if(!h){await this.bucket(tx,{key:'new-holders',start:day(now),end:day(now)+DAY,calls:Math.min(c.new_holders_per_day,100),money:0},0);
    [h]=await tx`INSERT INTO atlas_ai.holder_leases(id,token_sha256,created_at,expires_at) VALUES(${id()},${hh},${iso(now)},${iso(now+30*DAY)}) RETURNING *`;
   }
   const [{n}]=await tx`SELECT count(*)::int AS n FROM atlas_ai.session_leases WHERE holder_id=${h.id} AND revoked_at IS NULL AND expires_at>${iso(now)}`;
   if(n>=2)fail('RATE_LIMITED',429,1800);
   let [g]=await tx`SELECT * FROM atlas_ai.grants WHERE holder_id=${h.id} AND scope='look' AND agent_ids=ARRAY['docent-silver']::text[] AND schema_ids=ARRAY[${GUIDE_SCHEMA}]::text[] AND revoked_at IS NULL AND expires_at>${iso(now)} ORDER BY created_at DESC LIMIT 1`;
   if(!g){[g]=await tx`INSERT INTO atlas_ai.grants(id,holder_id,scope,jobs,agent_ids,place_ids,schema_ids,max_calls,max_microusd,created_at,expires_at) VALUES(${id()},${h.id},'look',ARRAY['guide'],ARRAY['docent-silver'],ARRAY['boycott'],ARRAY[${GUIDE_SCHEMA}],40,10000000,${iso(now)},${iso(Math.min(now+DAY,+new Date(h.expires_at)))}) RETURNING *`;
    await this.grantReceipt(tx,g,'issued',now,'approved-public-docent-policy');
   }
   const end=Math.min(now+30*MIN,+new Date(g.expires_at),+new Date(h.expires_at));
   await tx`INSERT INTO atlas_ai.session_leases(id,holder_id,grant_id,token_sha256,created_at,expires_at) VALUES(${id()},${h.id},${g.id},${sh},${iso(now)},${iso(end)})`;
   return {session:st,holder:holderToken??ht,expiresAt:iso(end),backing_ref:null};
  });
 }
 async grantReceipt(tx,g,action,now,authority){await tx`INSERT INTO atlas_ai.grant_receipts(id,time,grant_id,action,scope,jobs,place_ids,expires_at,authority) VALUES(${id()},${iso(now)},${g.id},${action},${g.scope},${g.jobs},${g.place_ids},${g.expires_at},${authority})`;}
 // Called only by Silver's private operator script, never from the HTTP handler.
 async issueModelCheck(holderHash,sessionHash){return this.locked(async(tx,c,now)=>{
  this.ready(c,now,false);
  if(c.enabled)fail('AI_MUST_BE_OFF');
  const hid=id(),gid=id(),sid=id(),end=now+DAY;
  await tx`INSERT INTO atlas_ai.holder_leases(id,token_sha256,created_at,expires_at) VALUES(${hid},${holderHash},${iso(now)},${iso(end)})`;
  const [g]=await tx`INSERT INTO atlas_ai.grants(id,holder_id,scope,jobs,agent_ids,place_ids,schema_ids,max_calls,max_microusd,created_at,expires_at) VALUES(${gid},${hid},'suggest',ARRAY['builder'],ARRAY['gus-benchmark'],ARRAY['boycott'],ARRAY[${MODEL_SCHEMA}],40,10000000,${iso(now)},${iso(end)}) RETURNING *`;
  await tx`INSERT INTO atlas_ai.session_leases(id,holder_id,grant_id,token_sha256,created_at,expires_at) VALUES(${sid},${hid},${gid},${sessionHash},${iso(now)},${iso(now+30*MIN)})`;
  await this.grantReceipt(tx,g,'issued',now,'owner-approved-benchmark');
 });}
 async modelsAllowed(bearerToken){const hash=await digest(bearerToken);return this.locked(async(tx,c,now)=>{
  this.ready(c,now,false);const {s,g}=await this.auth(tx,hash,now);
  if(g.scope!=='suggest'||!g.jobs.includes('builder')||!g.agent_ids.includes('gus-benchmark')||!g.place_ids.includes('boycott')||!g.schema_ids.includes(MODEL_SCHEMA))fail('OUT_OF_SCOPE',403);
  await this.bucket(tx,{key:'models:'+s.id,start:+new Date(s.created_at),end:+new Date(s.expires_at),calls:4,money:0},0);
 });}
 async reserve(bearerToken,spec,prompt){
  const hash=await digest(bearerToken);
  return this.locked(async(tx,c,now)=>{
   this.ready(c,now);await this.cleanup(tx,now);
   const {s,h,g}=await this.auth(tx,hash,now);
   const publicCall=spec.job==='guide';
   if(!g.jobs.includes(spec.job)||!g.agent_ids.includes(spec.agentId)||!g.place_ids.includes(spec.context.placeId)||!g.schema_ids.includes(spec.schemaId)||g.scope!==(publicCall?'look':'suggest'))fail('OUT_OF_SCOPE',403);
   if(publicCall?(spec.agentId!=='docent-silver'||spec.schemaId!==GUIDE_SCHEMA):(spec.job!=='builder'||spec.agentId!=='gus-benchmark'||spec.schemaId!==BUILDER_SCHEMA))fail('OUT_OF_SCOPE',403);
   const key=await digest(s.id+':'+spec.requestId);
   const [prior]=await tx`SELECT id,state FROM atlas_ai.call_leases WHERE request_key=${key}`;
   if(prior)return {duplicate:true,id:prior.id,state:prior.state};
   const routeKey=publicCall?'guide':spec.context.candidate==='challenger'?'builder_challenger':'builder';
   const [row]=await tx`SELECT to_jsonb(r) AS config FROM atlas_ai.routing_config r WHERE route_key=${routeKey} FOR UPDATE`;
   const route=row?.config;
   if(!route||!route.enabled||!route.model_id||!route.model_verified_at||+new Date(route.expires_at)<=now)fail('AI_OFF',503);
   const syntheticHash=publicCall?null:Array.from(await digest(prompt),n=>n.toString(16).padStart(2,'0')).join('');
   const {input,reserved}=envelope(route,prompt,syntheticHash);
   const [{rolling,active,total,global_active}]=await tx`SELECT
    count(*) FILTER(WHERE session_id=${s.id} AND created_at>${iso(now-MIN)})::int AS rolling,
    count(*) FILTER(WHERE session_id=${s.id} AND state IN ('reserved','dispatched') AND expires_at>${iso(now)})::int AS active,
    count(*) FILTER(WHERE session_id=${s.id})::int AS total,
    count(*) FILTER(WHERE ${publicCall}=(accounting->>'job'='guide') AND state IN ('reserved','dispatched') AND expires_at>${iso(now)})::int AS global_active
    FROM atlas_ai.call_leases`;
   if(active>=1||global_active>=(publicCall?4:1)||publicCall&&(rolling>=4||total>=10))fail('RATE_LIMITED',429,60);
   const buckets=[{key:'all-jobs',start:day(now),end:day(now)+DAY,calls:2147483647,money:Math.min(num(c.all_jobs_day_microusd),10000000)},
    {key:'provider:'+route.provider,start:month(now),end:monthEnd(now),calls:2147483647,money:Math.min(num(c.provider_month_microusd),20000000)},
    {key:'grant:'+g.id,start:+new Date(g.created_at),end:+new Date(g.expires_at),calls:g.max_calls,money:num(g.max_microusd)}];
   if(publicCall)buckets.push({key:'holder:'+h.id,start:day(now),end:day(now)+DAY,calls:20,money:250000},{key:'public',start:day(now),end:day(now)+DAY,calls:Math.min(c.public_day_calls,100),money:Math.min(num(c.public_day_microusd),1000000)});
   for(const b of buckets.sort((a,b)=>a.key.localeCompare(b.key)))await this.bucket(tx,b,reserved);
   const accounting={job:spec.job,model:route.provider+'/'+route.model_id,agent:spec.agentId,route,inputBound:input,configRevision:String(c.revision)};
   const [a]=await tx`INSERT INTO atlas_ai.call_leases(id,request_key,session_id,grant_id,route_key,accounting,quota_reservations,state,reserved_microusd,created_at,expires_at) VALUES(${id()},${key},${s.id},${g.id},${routeKey},${tx.json(accounting)},${tx.json(buckets.map(b=>({key:b.key,start:iso(b.start)})))},'reserved',${reserved},${iso(now)},${iso(now+60000)}) RETURNING *`;
   return a;
  });
 }
 async dispatch(attemptId){return this.locked(async(tx,c,now)=>{
  const [a]=await tx`SELECT * FROM atlas_ai.call_leases WHERE id=${attemptId} FOR UPDATE`;
  if(!a||a.state!=='reserved')return false;
  let valid=false;
  try{this.ready(c,now);const [s]=await tx`SELECT * FROM atlas_ai.session_leases WHERE id=${a.session_id}`;
   await this.auth(tx,s.token_sha256,now);
   const [r]=await tx`SELECT *, to_jsonb(r)=${tx.json(a.accounting.route)}::jsonb AS unchanged FROM atlas_ai.routing_config r WHERE route_key=${a.route_key}`;
   valid=live(a,now)&&r?.enabled&&r.unchanged&&String(c.revision)===a.accounting.configRevision;
  }catch{valid=false;}
  if(!valid){await this.settleTx(tx,a,{notDispatched:true,accepted:false},now);return false;}
  await tx`UPDATE atlas_ai.call_leases SET state='dispatched' WHERE id=${a.id}`;return true;
 });}
 async settle(attemptId,result){return this.locked(async(tx,c,now)=>{
  const [a]=await tx`SELECT * FROM atlas_ai.call_leases WHERE id=${attemptId} FOR UPDATE`;
  if(!a)fail('LIVE_UNAVAILABLE',503);
  if(result.accepted){try{this.ready(c,now);const [s]=await tx`SELECT * FROM atlas_ai.session_leases WHERE id=${a.session_id}`;await this.auth(tx,s.token_sha256,now);}catch{result={...result,accepted:false};}}
  return this.settleTx(tx,a,result,now);
 });}
 async settleTx(tx,a,result,now){
  const [prior]=await tx`SELECT * FROM atlas_ai.call_receipts WHERE id=${a.id}`;if(prior)return prior;
  const known=!!result.usage,neverSent=result.notDispatched===true&&a.state==='reserved';
  const amount=neverSent?0:known?cost(result.usage,a.accounting.route):num(a.reserved_microusd);
  const exceeded=amount>num(a.reserved_microusd)||known&&(result.usage.input_tokens+result.usage.cache_read_tokens+result.usage.cache_write_tokens>a.accounting.inputBound||result.usage.output_tokens>a.accounting.route.output_token_cap);
  if(exceeded)await tx`UPDATE atlas_ai.runtime_config SET enabled=false,revision=revision+1 WHERE id=true`;
  for(const b of a.quota_reservations){
   const changed=await tx`UPDATE atlas_ai.quota_windows SET reserved_microusd=reserved_microusd-${a.reserved_microusd},spent_microusd=spent_microusd+${amount} WHERE bucket=${b.key} AND window_start=${b.start} RETURNING bucket`;
   if(changed.length!==1)fail('LIVE_UNAVAILABLE',503);
  }
  const r=receipt(a,result.usage,result.accepted===true&&!exceeded,amount,neverSent?'not-dispatched':known?'measured':'reserved',now);
  await tx`INSERT INTO atlas_ai.call_receipts ${tx(r)}`;
  await tx`UPDATE atlas_ai.call_leases SET state=${known||neverSent?'completed':'uncertain'},settled_microusd=${amount},expires_at=${iso(now+DAY)} WHERE id=${a.id}`;
  return r;
 }
 async cleanup(tx,now){
  const stale=await tx`SELECT * FROM atlas_ai.call_leases WHERE state IN ('reserved','dispatched') AND expires_at<=${iso(now)} ORDER BY created_at LIMIT 20 FOR UPDATE`;
  for(const a of stale)await this.settleTx(tx,a,{accepted:false,notDispatched:a.state==='reserved'},now);
  // Uncertain calls stay for explicit operator reconciliation; money never expires
  // out of an active quota window, even when an in-flight slot is released.
  await tx`DELETE FROM atlas_ai.call_leases WHERE id IN (SELECT id FROM atlas_ai.call_leases WHERE state='completed' AND expires_at<=${iso(now)} LIMIT 100)`;
  await tx`DELETE FROM atlas_ai.session_leases WHERE id IN (SELECT s.id FROM atlas_ai.session_leases s WHERE s.expires_at<=${iso(now)} AND NOT EXISTS(SELECT 1 FROM atlas_ai.call_leases a WHERE a.session_id=s.id) LIMIT 100)`;
  await tx`DELETE FROM atlas_ai.grants WHERE id IN (SELECT g.id FROM atlas_ai.grants g WHERE g.expires_at<=${iso(now)} AND NOT EXISTS(SELECT 1 FROM atlas_ai.session_leases s WHERE s.grant_id=g.id) AND NOT EXISTS(SELECT 1 FROM atlas_ai.call_leases a WHERE a.grant_id=g.id) LIMIT 100)`;
  await tx`DELETE FROM atlas_ai.holder_leases WHERE id IN (SELECT h.id FROM atlas_ai.holder_leases h WHERE h.expires_at<=${iso(now)} AND NOT EXISTS(SELECT 1 FROM atlas_ai.grants g WHERE g.holder_id=h.id) AND NOT EXISTS(SELECT 1 FROM atlas_ai.session_leases s WHERE s.holder_id=h.id) LIMIT 100)`;
  await tx`DELETE FROM atlas_ai.quota_windows WHERE (bucket,window_start) IN (SELECT bucket,window_start FROM atlas_ai.quota_windows WHERE expires_at<=${iso(now)} AND reserved_microusd=0 LIMIT 100)`;
 }
}
