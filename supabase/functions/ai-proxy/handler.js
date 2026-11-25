import {ORIGIN,Fault,fail,failureClass,exact,bearer,readJSON} from './core.js';
import {prepare,validateAnswer,validateBuilder} from './protocol.js';
import {modelCheck,generate} from './providers.js';
import {PHOTO_AGENT,PHOTO_PURPOSE,loadStoredPhoto,validatePhotoProposal} from './photo.js';
export function createHandler({store,getSecret,fetchImpl=fetch,validateBuilderSchema}){
 return async req=>{
  let cors=false;
  const respond=(status,value,extra={})=>new Response(value===null?null:JSON.stringify(value),{status,headers:{'Content-Type':'application/json','Cache-Control':'no-store','Vary':'Origin',...(cors?{'Access-Control-Allow-Origin':ORIGIN,'Access-Control-Allow-Methods':'POST, OPTIONS','Access-Control-Allow-Headers':'authorization, content-type','Access-Control-Expose-Headers':'Retry-After'}:{}),...extra}});
  try{
   if(req.headers.get('origin')!==ORIGIN)fail('ORIGIN_DENIED',403);
   if(getSecret('ALLOWED_ORIGINS')!==ORIGIN)fail('AI_OFF',503);
   cors=true;
   const url=new URL(req.url),path=url.pathname.replace(/^\/functions\/v1\/ai-proxy|^\/ai-proxy/,'');
   if(url.search||!['/session','/request','/models'].includes(path))fail('NOT_FOUND',404);
   if(req.method==='OPTIONS'){
    const headers=(req.headers.get('access-control-request-headers')??'').toLowerCase().split(',').map(x=>x.trim()).filter(Boolean);
    if(req.headers.get('access-control-request-method')!=='POST'||headers.some(h=>!['authorization','content-type'].includes(h)))fail('ORIGIN_DENIED',403);
    return respond(204,null);
   }
   if(req.method!=='POST')fail('METHOD_NOT_ALLOWED',405);
   const config=await store.config();
   if(!config||config.public_origin!==ORIGIN||+new Date(config.expires_at)<=Date.now()||path!=='/models'&&!config.enabled)fail('AI_OFF',503);
   if(req.headers.get('content-type')?.split(';')[0].trim().toLowerCase()!=='application/json'||req.headers.has('content-encoding'))fail('BAD_REQUEST');
   const body=await readJSON(req,path==='/request'?48*1024:2048);
   if(path==='/session'){
    exact(body,['holder','purpose'],[]);
    if(body.holder!==undefined&&!/^[a-f0-9]{64}$/.test(body.holder)||
      body.purpose!==undefined&&body.purpose!==PHOTO_PURPOSE)fail('BAD_REQUEST');
    return respond(200,await store.bootstrap(body.holder,body.purpose));
   }
   const credential=bearer(req);
   if(path==='/models'){
    exact(body,['openaiSolId'],[]);
    await store.modelsAllowed(credential);
    return respond(200,{models:await modelCheck({fetchImpl,getSecret},body.openaiSolId??null)});
   }
   const prepared=prepare(body);
   // Reservation contains accounting only; missing keys are settled as not dispatched.
   const attempt=await store.reserve(credential,body,prepared.prompt);
   if(attempt.cached){
    const c=attempt.cached;
    return respond(200,{proposal:c.proposal,model:c.model,agentId:PHOTO_AGENT,
     receiptData:{provider:c.provider,job:'background',model:c.model,agentId:PHOTO_AGENT,result:'proposed',receiptId:c.receipt_id,cached:true}});
   }
   if(attempt.duplicate)return respond(409,{code:['reserved','dispatched'].includes(attempt.state)?'REQUEST_PENDING':'REQUEST_COMPLETED',receiptId:attempt.id});
   if(!getSecret(attempt.accounting.route.provider==='anthropic'?'ANTHROPIC_API_KEY':'OPENAI_API_KEY')){
    await store.settle(attempt.id,{notDispatched:true,accepted:false,failureClass:'provider_key_missing'});fail('LIVE_UNAVAILABLE',503);
   }
   let image=null;
   if(prepared.photo)try{
    image=await loadStoredPhoto(attempt.upload,{fetchImpl,getSecret});
   }catch(error){
    await store.settle(attempt.id,{notDispatched:true,accepted:false,failureClass:'dispatch_recheck_failed'});
    if(error instanceof Fault)return respond(error.status,{code:error.code,receiptId:attempt.id,failureClass:'dispatch_recheck_failed'});
    fail('PHOTO_UNAVAILABLE',503);
   }
   if(!await store.dispatch(attempt.id))fail('AI_OFF',503);
   const result=await generate({fetchImpl,getSecret},attempt.accounting.route,prepared.prompt,image);
   let proposal=null,reason=result.failureClass;
   if(result.usage&&!reason)try{
    proposal=prepared.photo?validatePhotoProposal(result.value,body.context.description):body.job==='guide'?validateAnswer(result.value,prepared.blocks):validateBuilder(result.value,validateBuilderSchema);
   }catch(error){reason=body.job==='builder'?'builder_validation_failed':failureClass(error?.failureClass);}
   const r=await store.settle(attempt.id,{usage:result.usage,accepted:!!proposal,failureClass:reason,...(prepared.photo?{photoProposal:proposal}:{})});
   if(!r.validation_passed) return respond(502,{code:'BAD_PROPOSAL',receiptId:r.id,failureClass:r.failure_class});
   return respond(200,{proposal,model:r.model,agentId:body.agentId,receiptData:{provider:attempt.accounting.route.provider,job:r.job,model:r.model,agentId:r.agent,result:'proposed',receiptId:r.id}});
  }catch(error){
   const e=error instanceof Fault?error:new Fault('LIVE_UNAVAILABLE',503);
   return respond(e.status,{code:e.code,...(e.code==='AI_OFF'?{message:'AI is off'}:{}),...(e.retry?{retryAfter:e.retry}:{})},e.retry?{'Retry-After':String(e.retry)}:{});
  }
 };
}
