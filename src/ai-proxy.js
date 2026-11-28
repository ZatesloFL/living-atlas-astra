import {boycottQuestionKind} from './boycott-question-policy.js';
import {DIMENSIONS,asPair,asHard} from './scores.js';
// Public function endpoint only. Provider credentials never enter this client.
import {HELPER_NAMES} from './staff-data.js';
import {AI_CATALOG_REVISION} from './ai-catalog-revision.js';
import {PRESET_QUESTIONS,typedQuestionBlockIds,normalizeQuestion} from './docent-questions.js';
const ORIGIN='https://zateslofl.github.io';
export const AI_PROXY_ENDPOINT='https://ftnxmuenqfqkodizyekk.supabase.co/functions/v1/ai-proxy';
const unavailable=(code,retry=60)=>Object.assign(new Error(code),{code,retry});
export function docentBlockIds(context){
 const kind=boycottQuestionKind(context.question);
 if(kind&&context.place?.key==='boycott')return typedQuestionBlockIds(context);
 if(!Object.hasOwn(PRESET_QUESTIONS,context.question))return typedQuestionBlockIds(context);
 // Narrow to authored Things relevant to the selected question. Sending the
 // entire article exceeds the approved input envelope; never raise that cap.
 const priorities=context.question==='sources'?['sample','research-note','kids-label','kids-citation','citation-0','citation-1','citation-2']:
  context.question==='rules'?['sample','kids-label']:['place-overview','lead','kids-lead','sample','kids-label'];
 return priorities.filter(id=>context.blocks.some(b=>b.id===id)).slice(0,6);
}
export function createProxyTransport({endpoint,fetchImpl=globalThis.fetch,storage=null,now=Date.now,timeoutMs=20000}){
 const url=new URL(endpoint);
 if(url.protocol!=='https:'||url.username||url.password||url.search||url.hash||!url.pathname.endsWith('/ai-proxy'))throw new Error('Invalid AI endpoint');
 let session=null,expires=0,holder=null,busy=false,blockedUntil=0,blockedReason='LIVE_UNAVAILABLE';
 let diagnostic={stage:'ready',status:null};
 try{holder=storage?.getItem('atlas-ai-anonymous-holder')??null;}catch{/* session-only */}
 if(!/^[a-f0-9]{64}$/.test(holder??''))holder=null;
 return {
  diagnostics(){return {...diagnostic};},
  failed(error){blockedUntil=Math.max(blockedUntil,now()+60000);if(!error?.code)diagnostic={stage:'validation',status:diagnostic.status};},
  eligible({job,agentId,context}){return job==='guide'&&agentId==='docent-silver'&&context?.place?.key==='boycott'&&context.action==='answer';},
  async request({job,agentId,context,signal}){
   if(now()<blockedUntil)throw unavailable(blockedReason,Math.ceil((blockedUntil-now())/1000));
   if(busy)throw unavailable('LIVE_UNAVAILABLE');busy=true;
   const controller=new AbortController(),abort=()=>controller.abort();
   signal?.addEventListener('abort',abort,{once:true});if(signal?.aborted)abort();
   const timer=setTimeout(abort,timeoutMs);
   const post=async(path,body,credential)=>{
    diagnostic={stage:path==='/session'?'session':'request',status:null};
    const r=await fetchImpl(url.href+path,{method:'POST',mode:'cors',credentials:'omit',cache:'no-store',redirect:'error',headers:{'Content-Type':'application/json',...(credential?{Authorization:'Bearer '+credential}:{})},body:JSON.stringify(body),signal:controller.signal});
    diagnostic.status=r.status;
    if(!r.ok){const retry=Math.min(86400,Math.max(60,Number(r.headers.get('Retry-After'))||60));if(r.status===401){session=null;expires=0;}
     await r.body?.cancel();throw unavailable(r.status===429?'LIVE_LIMIT_REACHED':'LIVE_UNAVAILABLE',retry);}
    // Enforce response bounds before parsing untrusted remote JSON.
    const reader=r.body.getReader(),chunks=[];let length=0;
    try{while(true){const {done,value}=await reader.read();if(done)break;length+=value.length;if(length>16384)throw unavailable('LIVE_UNAVAILABLE');chunks.push(value);}}finally{await reader.cancel().catch(()=>{});}
    const data=new Uint8Array(length);let p=0;for(const c of chunks){data.set(c,p);p+=c.length;}return JSON.parse(new TextDecoder().decode(data));
   };
   try{
    if(!session||expires<=now()){
     if(!holder)try{const saved=storage?.getItem('atlas-ai-anonymous-holder');if(/^[a-f0-9]{64}$/.test(saved??''))holder=saved;}catch{/* session-only */}
     const r=await post('/session',holder?{holder}:{});
     if(!/^[a-f0-9]{64}$/.test(r.session??'')||!/^[a-f0-9]{64}$/.test(r.holder??'')||!Number.isFinite(Date.parse(r.expiresAt))||Date.parse(r.expiresAt)<=now())throw unavailable('LIVE_UNAVAILABLE');
     session=r.session;holder=r.holder;expires=Date.parse(r.expiresAt);
     try{storage?.setItem('atlas-ai-anonymous-holder',holder);}catch{/* keep in memory */}
    }
    controller.signal.throwIfAborted();
    const l=context.lens,child=l.ageBand==='child';
    const lens={limits:Object.fromEntries(DIMENSIONS.map(([k])=>[k,asPair(l.limits?.[k])])),hard:Object.fromEntries(DIMENSIONS.map(([k])=>[k,asHard(l.hard?.[k])])),depth:l.depth??'Standard',trustFrom:l.trustFrom??'Author',show:{real:l.show?.real??true,pseudonym:l.show?.pseudonym??true,anonymous:l.show?.anonymous??true,agents:l.show?.agent??l.show?.agents??true},audience:child?'child':'teen'};
    const question=normalizeQuestion(PRESET_QUESTIONS[context.question]??context.question);
    return await post('/request',{requestId:crypto.randomUUID(),job,agentId,schemaId:'atlas-evidence-answer-v1',context:{placeId:'boycott',catalogRevision:AI_CATALOG_REVISION,visibleBlockIds:docentBlockIds(context),lens,question}},session);
   }catch(e){if(signal?.aborted)throw new DOMException('Request cancelled','AbortError');blockedUntil=now()+Math.max(60,e.retry??60)*1000;blockedReason=e.code==='LIVE_LIMIT_REACHED'?e.code:'LIVE_UNAVAILABLE';throw unavailable(blockedReason,e.retry);}
   finally{clearTimeout(timer);signal?.removeEventListener('abort',abort);busy=false;}
  },
  origin:ORIGIN
 };
}
export function createBrowserTransport({location=globalThis.location,storage,fetchImpl=globalThis.fetch}={}){
 // Local previews and ?ai=local stay completely local. An arbitrary query or
 // stored preference can never redirect bearer leases to another endpoint.
 if(location?.origin!==ORIGIN||new URLSearchParams(location.search).get('ai')==='local')return null;
 if(storage===undefined)try{storage=globalThis.localStorage;}catch{storage=null;}
 return createProxyTransport({endpoint:AI_PROXY_ENDPOINT,storage,fetchImpl});
}
export function browserLocalReason(location=globalThis.location){
 return new URLSearchParams(location?.search).get('ai')==='local'?'local_selected':location?.origin!==ORIGIN?'preview_origin':null;
}
export function routeExplanation(reason){return ({
 place_local:`This Place uses local answers. Live answers are available from ${HELPER_NAMES.Docent.boycott} in the boycott exhibition.`,
 helper_local:`This helper uses local answers. ${HELPER_NAMES.Docent.boycott} is the live Docent at the boycott exhibition.`,
 action_local:'Tours use local authored paths and checked grants.',
 local_selected:'Local-only mode is selected in this link. Open the same Pages link without ai=local to use live help at the boycott.',
 preview_origin:'This preview uses local answers. Live help is available on the published Atlas at the boycott exhibition.'
})[reason]??'';}
