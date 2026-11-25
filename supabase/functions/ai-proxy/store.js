import {ORIGIN,GUIDE_SCHEMA,MODEL_SCHEMA,BUILDER_SCHEMA,fail,id,iso,token,digest,envelope,cost,receipt} from './core.js';
import {PHOTO_AGENT,PHOTO_SCHEMA,PHOTO_SCOPE,PHOTO_PURPOSE,PHOTO_ROUTE,PHOTO_MODEL,PHOTO_INPUT_BOUND,MAX_PHOTO_BYTES} from './photo.js';
import {UPLOAD_REVIEW_PURPOSE,REVIEW_SCHEMAS,AUDIO_TRANSCRIPT_SCHEMA,AUDIO_SCORES_SCHEMA,AUDIO_TYPE,
 TRANSCRIPTION_ROUTE,TRANSCRIPTION_PRICE,MAX_AUDIO_BYTES,validTranscriptionRoute,transcriptionCost,audioPrompt} from './audio.js';
const DAY=86400000,MIN=60000;
const live=(r,now)=>r&&!r.revoked_at&&+new Date(r.expires_at)>now;
const day=n=>Math.floor(n/DAY)*DAY;
const month=n=>{const d=new Date(n);return Date.UTC(d.getUTCFullYear(),d.getUTCMonth(),1);};
const monthEnd=n=>{const d=new Date(n);return Date.UTC(d.getUTCFullYear(),d.getUTCMonth()+1,1);};
const num=n=>Number(n);
async function ownedPhoto(tx,ownerId,uploadId){
 const [photo]=await tx`SELECT id,owner_id,content_sha256,content_type,original_bytes FROM atlas_sources.uploads
  WHERE id=${uploadId}::uuid AND owner_id=${ownerId} AND state='uploaded'
    AND content_type IN ('image/jpeg','image/png','image/webp') FOR SHARE`;
 return photo;
}
async function ownedAudio(tx,ownerId,uploadId){
 const [audio]=await tx`SELECT id,owner_id,content_sha256,content_type,original_bytes FROM atlas_sources.uploads
  WHERE id=${uploadId}::uuid AND owner_id=${ownerId} AND state='uploaded' AND content_type LIKE 'audio/%' FOR SHARE`;
 return audio;
}
async function retirePhotoSession(tx,ownerId,now){
 // Upgrade one idle legacy photo session if necessary. Leave Docent sessions,
 // active paid calls, and the underlying grant available to existing clients.
 const [retired]=await tx`UPDATE atlas_ai.session_leases SET revoked_at=${iso(now)} WHERE id=(
  SELECT s.id FROM atlas_ai.session_leases s JOIN atlas_ai.grants g ON g.id=s.grant_id
  WHERE s.holder_id=${ownerId} AND s.revoked_at IS NULL AND s.expires_at>${iso(now)}
   AND g.scope='suggest' AND g.jobs=ARRAY['background']::text[]
   AND g.agent_ids=ARRAY[${PHOTO_AGENT}]::text[] AND g.place_ids=ARRAY[${PHOTO_SCOPE}]::text[]
   AND g.schema_ids=ARRAY[${PHOTO_SCHEMA}]::text[]
   AND NOT EXISTS(SELECT 1 FROM atlas_ai.call_leases a WHERE a.session_id=s.id AND a.state IN ('reserved','dispatched'))
  ORDER BY s.created_at,s.id LIMIT 1) RETURNING id`;
 return !!retired;
}
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
  // A partial deployment must fail before reservation or paid provider dispatch.
  const [{ready}]=await tx`SELECT EXISTS(SELECT 1 FROM pg_attribute WHERE attrelid='atlas_ai.call_receipts'::regclass AND attname='failure_class' AND atttypid='text'::regtype AND NOT attisdropped AND NOT attnotnull) AS ready`;
  if(!ready)fail('LIVE_UNAVAILABLE',503);
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
 async bootstrap(holderToken,purpose){
  const photo=purpose===PHOTO_PURPOSE,review=purpose===UPLOAD_REVIEW_PURPOSE,uploads=photo||review;
  if(uploads&&!holderToken)fail('UNAUTHORIZED',401);
  const holderHash=holderToken?await digest(holderToken):null;
  const ht=token(),st=token(),hh=await digest(ht),sh=await digest(st);
  return this.locked(async(tx,c,now)=>{
   this.ready(c,now);await this.cleanup(tx,now);
   let h;if(holderHash)[h]=await tx`SELECT * FROM atlas_ai.holder_leases WHERE token_sha256=${holderHash}`;
   // An invalid renewal never silently mints a replacement quota holder.
   if(holderHash&&!live(h,now))fail('UNAUTHORIZED',401);
   if(uploads){
    const [{exists}]=await tx`SELECT EXISTS(SELECT 1 FROM atlas_sources.uploads
     WHERE owner_id=${h.id} AND state='uploaded' AND
      (content_type IN ('image/jpeg','image/png','image/webp') OR (${review} AND content_type LIKE 'audio/%')))`;
    if(!exists)fail(review?'UPLOAD_UNAVAILABLE':'PHOTO_UNAVAILABLE',404);
   }
   if(!h){await this.bucket(tx,{key:'new-holders',start:day(now),end:day(now)+DAY,calls:Math.min(c.new_holders_per_day,100),money:0},0);
    [h]=await tx`INSERT INTO atlas_ai.holder_leases(id,token_sha256,created_at,expires_at) VALUES(${id()},${hh},${iso(now)},${iso(now+30*DAY)}) RETURNING *`;
   }
   const [{n}]=await tx`SELECT count(*)::int AS n FROM atlas_ai.session_leases WHERE holder_id=${h.id} AND revoked_at IS NULL AND expires_at>${iso(now)}`;
   if(n>=2&&(!review||!await retirePhotoSession(tx,h.id,now)))fail('RATE_LIMITED',429,1800);
   const scope=uploads?'suggest':'look',job=uploads?'background':'guide',agent=uploads?PHOTO_AGENT:'docent-silver',
    place=uploads?PHOTO_SCOPE:'boycott',schemas=review?REVIEW_SCHEMAS:[photo?PHOTO_SCHEMA:GUIDE_SCHEMA];
   let [g]=await tx`SELECT * FROM atlas_ai.grants WHERE holder_id=${h.id} AND scope=${scope}
    AND jobs=ARRAY[${job}]::text[] AND agent_ids=ARRAY[${agent}]::text[] AND place_ids=ARRAY[${place}]::text[]
    AND schema_ids=ARRAY(SELECT jsonb_array_elements_text(${tx.json(schemas)}::jsonb)) AND revoked_at IS NULL AND expires_at>${iso(now)} ORDER BY created_at DESC LIMIT 1`;
   if(!g){[g]=await tx`INSERT INTO atlas_ai.grants(id,holder_id,scope,jobs,agent_ids,place_ids,schema_ids,max_calls,max_microusd,created_at,expires_at) VALUES(${id()},${h.id},${scope},ARRAY[${job}]::text[],ARRAY[${agent}]::text[],ARRAY[${place}]::text[],ARRAY(SELECT jsonb_array_elements_text(${tx.json(schemas)}::jsonb)),40,10000000,${iso(now)},${iso(Math.min(now+DAY,+new Date(h.expires_at)))}) RETURNING *`;
    await this.grantReceipt(tx,g,'issued',now,review?'owner-upload-review-policy':photo?'owner-upload-photo-policy':'approved-public-docent-policy');
   }
   const end=Math.min(now+30*MIN,+new Date(g.expires_at),+new Date(h.expires_at));
   await tx`INSERT INTO atlas_ai.session_leases(id,holder_id,grant_id,token_sha256,created_at,expires_at) VALUES(${id()},${h.id},${g.id},${sh},${iso(now)},${iso(end)})`;
   return {session:st,holder:holderToken??ht,expiresAt:iso(end),backing_ref:null};
  });
 }
 async grantReceipt(tx,g,action,now,authority){await tx`INSERT INTO atlas_ai.grant_receipts(id,time,grant_id,action,scope,jobs,place_ids,expires_at,authority) VALUES(${id()},${iso(now)},${g.id},${action},${g.scope},${g.jobs},${g.place_ids},${g.expires_at},${authority})`;}
 // Internal issuance mirrors Silver's offline SQL; never exposed by the HTTP handler.
 async issueModelCheck(holderHash,sessionHash){return this.locked(async(tx,c,now)=>{
  this.ready(c,now,false);
  if(c.enabled)fail('AI_MUST_BE_OFF');
  const hid=id(),gid=id(),sid=id(),end=now+DAY;
  await tx`INSERT INTO atlas_ai.holder_leases(id,token_sha256,created_at,expires_at) VALUES(${hid},${holderHash},${iso(now)},${iso(end)})`;
  const [g]=await tx`INSERT INTO atlas_ai.grants(id,holder_id,scope,jobs,agent_ids,place_ids,schema_ids,max_calls,max_microusd,created_at,expires_at) VALUES(${gid},${hid},'look',ARRAY['model-check'],ARRAY['operator-model-check'],ARRAY['ai-proxy'],ARRAY[${MODEL_SCHEMA}],4,0,${iso(now)},${iso(end)}) RETURNING *`;
  await tx`INSERT INTO atlas_ai.session_leases(id,holder_id,grant_id,token_sha256,created_at,expires_at) VALUES(${sid},${hid},${gid},${sessionHash},${iso(now)},${iso(now+30*MIN)})`;
  await this.grantReceipt(tx,g,'issued',now,'operator-model-check');
 });}
 async modelsAllowed(bearerToken){const hash=await digest(bearerToken);return this.locked(async(tx,c,now)=>{
  this.ready(c,now,false);const {g}=await this.auth(tx,hash,now);
  const only=(values,value)=>values.length===1&&values[0]===value;
  if(g.scope!=='look'||!only(g.jobs,'model-check')||!only(g.agent_ids,'operator-model-check')||!only(g.place_ids,'ai-proxy')||!only(g.schema_ids,MODEL_SCHEMA)||g.max_calls!==4||num(g.max_microusd)!==0)fail('OUT_OF_SCOPE',403);
  // All sessions share this grant's four-check limit; no generation spend is reserved.
  await this.bucket(tx,{key:'models:'+g.id,start:+new Date(g.created_at),end:+new Date(g.expires_at),calls:g.max_calls,money:0},0);
 });}
 async reserve(bearerToken,spec,prompt){
  const hash=await digest(bearerToken);
  return this.locked(async(tx,c,now)=>{
   this.ready(c,now);await this.cleanup(tx,now);
   const {s,h,g}=await this.auth(tx,hash,now);
   const guide=spec.job==='guide',uploads=spec.job==='background',
    photo=uploads&&spec.schemaId===PHOTO_SCHEMA,transcription=uploads&&spec.schemaId===AUDIO_TRANSCRIPT_SCHEMA,
    audio=uploads&&spec.schemaId===AUDIO_SCORES_SCHEMA,publicCall=guide||uploads;
   if(!g.jobs.includes(spec.job)||!g.agent_ids.includes(spec.agentId)||!g.place_ids.includes(uploads?PHOTO_SCOPE:spec.context.placeId)||!g.schema_ids.includes(spec.schemaId)||g.scope!==(guide?'look':'suggest'))fail('OUT_OF_SCOPE',403);
   if(guide?(spec.agentId!=='docent-silver'||spec.schemaId!==GUIDE_SCHEMA):uploads?
    (spec.agentId!==PHOTO_AGENT||!REVIEW_SCHEMAS.includes(spec.schemaId)):
    (spec.job!=='builder'||spec.agentId!=='gus-benchmark'||spec.schemaId!==BUILDER_SCHEMA))fail('OUT_OF_SCOPE',403);
   if((audio||transcription)&&JSON.stringify(g.schema_ids)!==JSON.stringify(REVIEW_SCHEMAS))fail('OUT_OF_SCOPE',403);
   let upload,transcript,promptForAssessment;
   if(photo){
    upload=await ownedPhoto(tx,h.id,spec.context.uploadId);
    if(!upload)fail('PHOTO_UNAVAILABLE',404);
    if(num(upload.original_bytes)>MAX_PHOTO_BYTES)fail('PHOTO_TOO_LARGE',413);
    const [cached]=await tx`SELECT * FROM atlas_sources.get_photo_proposal(${h.id},${upload.id}::uuid)`;
    if(cached)return {cached};
    const [pending]=await tx`SELECT id,state FROM atlas_ai.call_leases WHERE route_key=${PHOTO_ROUTE}
     AND accounting->'photo'->>'uploadId'=${upload.id} AND state IN ('reserved','dispatched') LIMIT 1`;
    if(pending)return {duplicate:true,id:pending.id,state:pending.state};
   }
   if(audio||transcription){
    upload=await ownedAudio(tx,h.id,spec.context.uploadId);
    if(!upload)fail('AUDIO_UNAVAILABLE',404);
    if(upload.content_type!==AUDIO_TYPE||num(upload.original_bytes)>MAX_AUDIO_BYTES)fail('AUDIO_FORMAT_UNSUPPORTED',422);
    const [cached]=await tx`SELECT * FROM atlas_sources.get_audio_proposal(${h.id},${upload.id}::uuid)`;
    if(cached)return transcription?{cachedTranscription:{receipt_id:cached.transcription_receipt_id,
     provider:cached.transcription_provider,model:cached.transcription_model}}:{cached};
    [transcript]=await tx`SELECT * FROM atlas_sources.get_audio_transcript(${h.id},${upload.id}::uuid)`;
    if(transcription&&transcript)return {cachedTranscription:transcript};
    if(audio&&!transcript)fail('TRANSCRIPT_UNAVAILABLE',409);
    if(transcription){
     const [{exists}]=await tx`SELECT EXISTS(SELECT 1 FROM atlas_sources.audio_transcripts
      WHERE owner_id=${h.id} AND upload_id=${upload.id}::uuid AND content_sha256=${upload.content_sha256})`;
     if(exists)fail('TRANSCRIPT_UNAVAILABLE',409);
    }else promptForAssessment=audioPrompt(transcript.transcript,spec.context.description);
    const stage=transcription?'transcription':'audio';
    const [pending]=await tx`SELECT id,state FROM atlas_ai.call_leases
     WHERE accounting->${stage}::text->>'uploadId'=${upload.id}
      AND (state IN ('reserved','dispatched','uncertain') OR state='completed' AND settled_microusd>0) LIMIT 1`;
    if(pending)return {duplicate:true,id:pending.id,state:pending.state};
   }
   const key=await digest(s.id+':'+spec.requestId);
   const [prior]=await tx`SELECT id,state FROM atlas_ai.call_leases WHERE request_key=${key}`;
   if(prior)return {duplicate:true,id:prior.id,state:prior.state};
   const routeKey=guide?'guide':transcription?TRANSCRIPTION_ROUTE:uploads?PHOTO_ROUTE:spec.context.candidate==='challenger'?'builder_challenger':'builder';
   const [row]=transcription?await tx`SELECT to_jsonb(r) AS config FROM atlas_ai.transcription_config r WHERE id=true FOR UPDATE`:
    await tx`SELECT to_jsonb(r) AS config FROM atlas_ai.routing_config r WHERE route_key=${routeKey} FOR UPDATE`;
   const route=row?.config;
   if(transcription?!validTranscriptionRoute(route,now):
    (!route||!route.enabled||!route.model_id||!route.model_verified_at||+new Date(route.expires_at)<=now))fail('AI_OFF',503);
   if((photo||audio)&&(route.provider!=='anthropic'||route.model_id!==PHOTO_MODEL))fail('AI_OFF',503);
   const syntheticHash=publicCall?null:Array.from(await digest(prompt),n=>n.toString(16).padStart(2,'0')).join('');
   // Reserve up to a full billed minute for the bounded <=30-second PCM job.
   const {input,reserved}=transcription?{input:null,reserved:TRANSCRIPTION_PRICE}:
    envelope(route,promptForAssessment??prompt,syntheticHash,photo?PHOTO_INPUT_BOUND:0);
   const [{rolling,active,total,global_active}]=await tx`SELECT
    count(*) FILTER(WHERE session_id=${s.id} AND created_at>${iso(now-MIN)})::int AS rolling,
    count(*) FILTER(WHERE session_id=${s.id} AND state IN ('reserved','dispatched') AND expires_at>${iso(now)})::int AS active,
    count(*) FILTER(WHERE session_id=${s.id})::int AS total,
    count(*) FILTER(WHERE ${publicCall}=(accounting->>'job' IN ('guide','background')) AND state IN ('reserved','dispatched') AND expires_at>${iso(now)})::int AS global_active
    FROM atlas_ai.call_leases`;
   if(active>=1||global_active>=(publicCall?4:1)||publicCall&&(rolling>=4||total>=10))fail('RATE_LIMITED',429,60);
   const buckets=[{key:'all-jobs',start:day(now),end:day(now)+DAY,calls:2147483647,money:Math.min(num(c.all_jobs_day_microusd),10000000)},
    {key:'provider:'+route.provider,start:month(now),end:monthEnd(now),calls:2147483647,money:Math.min(num(c.provider_month_microusd),20000000)},
    {key:'grant:'+g.id,start:+new Date(g.created_at),end:+new Date(g.expires_at),calls:g.max_calls,money:num(g.max_microusd)}];
   if(publicCall)buckets.push({key:'holder:'+h.id,start:day(now),end:day(now)+DAY,calls:20,money:250000},{key:'public',start:day(now),end:day(now)+DAY,calls:Math.min(c.public_day_calls,100),money:Math.min(num(c.public_day_microusd),1000000)});
   for(const b of buckets.sort((a,b)=>a.key.localeCompare(b.key)))await this.bucket(tx,b,reserved);
   const accounting={job:spec.job,model:route.provider+'/'+route.model_id,agent:spec.agentId,route,inputBound:input,configRevision:String(c.revision),
    ...(photo?{photo:{uploadId:upload.id,contentSha256:upload.content_sha256}}:{}),
    ...(transcription?{transcription:{uploadId:upload.id,contentSha256:upload.content_sha256}}:{}),
    ...(audio?{audio:{uploadId:upload.id,contentSha256:upload.content_sha256,transcriptionReceiptId:transcript.receipt_id}}:{})};
   const [a]=await tx`INSERT INTO atlas_ai.call_leases(id,request_key,session_id,grant_id,route_key,accounting,quota_reservations,state,reserved_microusd,created_at,expires_at) VALUES(${id()},${key},${s.id},${g.id},${routeKey},${tx.json(accounting)},${tx.json(buckets.map(b=>({key:b.key,start:iso(b.start)})))},'reserved',${reserved},${iso(now)},${iso(now+60000)}) RETURNING *`;
   return photo||transcription?{...a,upload}:audio?{...a,prompt:promptForAssessment}:a;
  });
 }
 async dispatch(attemptId,verifiedDurationMs=null){return this.locked(async(tx,c,now)=>{
  const [a]=await tx`SELECT * FROM atlas_ai.call_leases WHERE id=${attemptId} FOR UPDATE`;
  if(!a||a.state!=='reserved')return false;
  const transcription=a.accounting.transcription,audio=a.accounting.audio;
  let valid=false,storedOriginal;
  try{this.ready(c,now);const [s]=await tx`SELECT * FROM atlas_ai.session_leases WHERE id=${a.session_id}`;
   const {h}=await this.auth(tx,s.token_sha256,now);
   const [r]=transcription?await tx`SELECT enabled,to_jsonb(r)=${tx.json(a.accounting.route)}::jsonb AS unchanged
     FROM atlas_ai.transcription_config r WHERE id=true`:
    await tx`SELECT *, to_jsonb(r)=${tx.json(a.accounting.route)}::jsonb AS unchanged FROM atlas_ai.routing_config r WHERE route_key=${a.route_key}`;
   valid=live(a,now)&&r?.enabled&&r.unchanged&&String(c.revision)===a.accounting.configRevision;
   if(valid&&a.accounting.photo){
    storedOriginal=await ownedPhoto(tx,h.id,a.accounting.photo.uploadId);
    valid=storedOriginal?.content_sha256===a.accounting.photo.contentSha256;
   }else if(valid&&(transcription||audio)){
    const ref=transcription??audio,original=await ownedAudio(tx,h.id,ref.uploadId);
    valid=original?.content_sha256===ref.contentSha256;
    if(valid&&transcription){
     valid=validTranscriptionRoute(a.accounting.route,now)&&Number.isSafeInteger(verifiedDurationMs)&&
      verifiedDurationMs>0&&verifiedDurationMs<=Number(a.accounting.route.max_duration_ms);
     if(valid)storedOriginal=original;
    }else if(valid){
     const [current]=await tx`SELECT * FROM atlas_sources.get_audio_transcript(${h.id},${original.id}::uuid)`;
     valid=current?.receipt_id===audio.transcriptionReceiptId;
    }
   }
  }catch{valid=false;}
  if(!valid){await this.settleTx(tx,a,{notDispatched:true,accepted:false,failureClass:'dispatch_recheck_failed'},now);return false;}
  // A verified Storage read contributes to the same Place/source byte meter.
  if(storedOriginal)await tx`SELECT atlas_sources.record_egress(${storedOriginal.owner_id},${storedOriginal.id}::uuid,'original',${storedOriginal.original_bytes})`;
  await tx`UPDATE atlas_ai.call_leases SET state='dispatched' WHERE id=${a.id}`;return true;
 });}
 async settle(attemptId,result){return this.locked(async(tx,c,now)=>{
  const [a]=await tx`SELECT * FROM atlas_ai.call_leases WHERE id=${attemptId} FOR UPDATE`;
  if(!a)fail('LIVE_UNAVAILABLE',503);
  if(result.accepted){try{
   this.ready(c,now);const [s]=await tx`SELECT * FROM atlas_ai.session_leases WHERE id=${a.session_id}`;
   const {h}=await this.auth(tx,s.token_sha256,now);
   if(a.accounting.photo){
    const photo=await ownedPhoto(tx,h.id,a.accounting.photo.uploadId);
    if(photo?.content_sha256!==a.accounting.photo.contentSha256||!result.photoProposal)fail('PHOTO_UNAVAILABLE',404);
    result={...result,photoOwner:h.id};
   }else if(a.accounting.transcription||a.accounting.audio){
    const ref=a.accounting.transcription??a.accounting.audio,original=await ownedAudio(tx,h.id,ref.uploadId);
    if(original?.content_sha256!==ref.contentSha256)fail('AUDIO_UNAVAILABLE',404);
    if(a.accounting.transcription){
     if(!result.transcript||a.state!=='dispatched')fail('AUDIO_UNAVAILABLE',404);
    }else{
     const [current]=await tx`SELECT * FROM atlas_sources.get_audio_transcript(${h.id},${original.id}::uuid)`;
     if(!result.audioProposal||current?.receipt_id!==ref.transcriptionReceiptId||a.state!=='dispatched')fail('AUDIO_TRANSCRIPTION_REQUIRED',409);
    }
    result={...result,audioOwner:h.id};
   }
  }catch{result={...result,accepted:false,failureClass:'result_recheck_failed'};}}
  return this.settleTx(tx,a,result,now);
 });}
 async settleTx(tx,a,result,now){
  const [prior]=await tx`SELECT * FROM atlas_ai.call_receipts WHERE id=${a.id}`;if(prior)return prior;
  const transcription=a.accounting.transcription;
  const known=!!result.usage,neverSent=result.notDispatched===true&&a.state==='reserved';
  const measuredCost=()=>transcription?transcriptionCost(result.usage.audio_duration_ms,a.accounting.route):cost(result.usage,a.accounting.route);
  const amount=neverSent?0:known?measuredCost():num(a.reserved_microusd);
  const exceeded=amount>num(a.reserved_microusd)||known&&(transcription?
   result.usage.audio_duration_ms>Number(a.accounting.route.max_duration_ms):
   (result.usage.input_tokens+result.usage.cache_read_tokens+result.usage.cache_write_tokens>a.accounting.inputBound||
    result.usage.output_tokens>a.accounting.route.output_token_cap));
  if(exceeded)await tx`UPDATE atlas_ai.runtime_config SET enabled=false,revision=revision+1 WHERE id=true`;
  for(const b of a.quota_reservations){
   const changed=await tx`UPDATE atlas_ai.quota_windows SET reserved_microusd=reserved_microusd-${a.reserved_microusd},spent_microusd=spent_microusd+${amount} WHERE bucket=${b.key} AND window_start=${b.start} RETURNING bucket`;
   if(changed.length!==1)fail('LIVE_UNAVAILABLE',503);
  }
  const basis=neverSent?'not-dispatched':known?'measured':'reserved';
  let r=receipt(a,result.usage,result.accepted===true&&!exceeded,amount,basis,now,exceeded?'accounting_bound_exceeded':result.failureClass);
  if(r.validation_passed&&(transcription||a.accounting.audio)){
   // A source change or the transcript's expiry can still prevent saving it.
   // The savepoint rolls back the tentative Receipt before recording rejection.
   try{
    await tx.savepoint(async save=>{
     await save`INSERT INTO atlas_ai.call_receipts ${save(r)}`;
     const audio=a.accounting.audio;
     const [proof]=transcription?await save`SELECT p.receipt_id FROM atlas_sources.save_audio_transcript(
      ${result.audioOwner},${transcription.uploadId}::uuid,${a.id}::uuid,${result.transcript}) p`:
      await save`SELECT p.receipt_id FROM atlas_sources.save_audio_proposal(
       ${result.audioOwner},${audio.uploadId}::uuid,${a.id}::uuid,${audio.transcriptionReceiptId}::uuid,
       ${save.json(result.audioProposal)}) p`;
     if(proof?.receipt_id!==a.id)fail('AUDIO_UNAVAILABLE',409);
    });
   }catch{
    r=receipt(a,result.usage,false,amount,basis,now,'result_recheck_failed');
    await tx`INSERT INTO atlas_ai.call_receipts ${tx(r)}`;
   }
  }else await tx`INSERT INTO atlas_ai.call_receipts ${tx(r)}`;
  if(r.validation_passed&&a.accounting.photo)await tx`SELECT atlas_sources.save_photo_proposal(
   ${result.photoOwner},${a.accounting.photo.uploadId}::uuid,${a.id}::uuid,${tx.json(result.photoProposal)})`;
  await tx`UPDATE atlas_ai.call_leases SET state=${known||neverSent?'completed':'uncertain'},settled_microusd=${amount},expires_at=${iso(now+DAY)} WHERE id=${a.id}`;
  return r;
 }
 async cleanup(tx,now){
  const stale=await tx`SELECT * FROM atlas_ai.call_leases WHERE state IN ('reserved','dispatched') AND expires_at<=${iso(now)} ORDER BY created_at LIMIT 20 FOR UPDATE`;
  for(const a of stale)await this.settleTx(tx,a,{accepted:false,notDispatched:a.state==='reserved',failureClass:a.state==='reserved'?'reservation_expired':'dispatch_outcome_unknown'},now);
  // Uncertain calls stay for explicit operator reconciliation; money never expires
  // out of an active quota window, even when an in-flight slot is released.
  await tx`DELETE FROM atlas_ai.call_leases WHERE id IN (SELECT id FROM atlas_ai.call_leases WHERE state='completed' AND expires_at<=${iso(now)} LIMIT 100)`;
  await tx`DELETE FROM atlas_ai.session_leases WHERE id IN (SELECT s.id FROM atlas_ai.session_leases s WHERE s.expires_at<=${iso(now)} AND NOT EXISTS(SELECT 1 FROM atlas_ai.call_leases a WHERE a.session_id=s.id) LIMIT 100)`;
  await tx`DELETE FROM atlas_ai.grants WHERE id IN (SELECT g.id FROM atlas_ai.grants g WHERE g.expires_at<=${iso(now)} AND NOT EXISTS(SELECT 1 FROM atlas_ai.session_leases s WHERE s.grant_id=g.id) AND NOT EXISTS(SELECT 1 FROM atlas_ai.call_leases a WHERE a.grant_id=g.id) LIMIT 100)`;
  await tx`DELETE FROM atlas_ai.holder_leases WHERE id IN (SELECT h.id FROM atlas_ai.holder_leases h WHERE h.expires_at<=${iso(now)} AND NOT EXISTS(SELECT 1 FROM atlas_ai.grants g WHERE g.holder_id=h.id) AND NOT EXISTS(SELECT 1 FROM atlas_ai.session_leases s WHERE s.holder_id=h.id) LIMIT 100)`;
  await tx`DELETE FROM atlas_ai.quota_windows WHERE (bucket,window_start) IN (SELECT bucket,window_start FROM atlas_ai.quota_windows WHERE expires_at<=${iso(now)} AND reserved_microusd=0 LIMIT 100)`;
  const [{available}]=await tx`SELECT to_regprocedure('atlas_sources.expire_audio_transcripts(integer)') IS NOT NULL AS available`;
  if(available)await tx`SELECT atlas_sources.expire_audio_transcripts(20)`;
 }
}
