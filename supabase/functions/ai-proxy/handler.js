import {ORIGIN,Fault,fail,exact,bearer,readJSON} from './core.js';
import {prepare,validateAnswer,validateBuilder} from './protocol.js';
import {modelCheck,generate} from './providers.js';
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
    exact(body,['holder'],[]);if(body.holder!==undefined&&!/^[a-f0-9]{64}$/.test(body.holder))fail('BAD_REQUEST');
    return respond(200,await store.bootstrap(body.holder));
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
   if(attempt.duplicate)return respond(409,{code:['reserved','dispatched'].includes(attempt.state)?'REQUEST_PENDING':'REQUEST_COMPLETED',receiptId:attempt.id});
   if(!getSecret(attempt.accounting.route.provider==='anthropic'?'ANTHROPIC_API_KEY':'OPENAI_API_KEY')){
    await store.settle(attempt.id,{notDispatched:true,accepted:false});fail('LIVE_UNAVAILABLE',503);
   }
   if(!await store.dispatch(attempt.id))fail('AI_OFF',503);
   const result=await generate({fetchImpl,getSecret},attempt.accounting.route,prepared.prompt);
   let proposal=null;
   if(result.value&&result.usage)try{proposal=body.job==='guide'?validateAnswer(result.value,prepared.blocks):validateBuilder(result.value,validateBuilderSchema);}catch{/* fixed failure only */}
   const r=await store.settle(attempt.id,{usage:result.usage,accepted:!!proposal});
   if(!r.validation_passed) return respond(502,{code:'BAD_PROPOSAL',receiptId:r.id});
   return respond(200,{proposal,model:r.model,agentId:body.agentId,receiptData:{provider:attempt.accounting.route.provider,job:r.job,model:r.model,agentId:r.agent,result:'proposed',receiptId:r.id}});
  }catch(error){
   const e=error instanceof Fault?error:new Fault('LIVE_UNAVAILABLE',503);
   return respond(e.status,{code:e.code,...(e.code==='AI_OFF'?{message:'AI is off'}:{}),...(e.retry?{retryAfter:e.retry}:{})},e.retry?{'Retry-After':String(e.retry)}:{});
  }
 };
}
