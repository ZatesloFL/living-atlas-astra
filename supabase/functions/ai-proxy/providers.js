import {readJSON,fail} from './core.js';
const ANTHROPIC_VERSION='2026-10-21';
const safeName=s=>typeof s==='string'&&/^[a-zA-Z0-9][a-zA-Z0-9 ._:/-]{0,150}$/.test(s);
// Provider payloads/errors/headers are never returned or logged. Only the model
// names and tri-state availability below leave the metadata boundary.
export async function modelCheck({fetchImpl=fetch,getSecret},solId=null){
 if(solId!==null&&(!safeName(solId)||!solId.startsWith('gpt-')))fail('BAD_REQUEST');
 async function list(provider){
  const key=getSecret(provider==='anthropic'?'ANTHROPIC_API_KEY':'OPENAI_API_KEY');
  if(!key)return null;
  const names=new Set(),seen=new Set();let cursor=null;
  try{
   for(let page=0;page<20;page++){
    const url=new URL(provider==='anthropic'?'https://api.anthropic.com/v1/models':'https://api.openai.com/v1/models');
    if(provider==='anthropic'){url.searchParams.set('limit','1000');if(cursor)url.searchParams.set('after_id',cursor);}
    const res=await fetchImpl(url,{method:'GET',headers:provider==='anthropic'?{'x-api-key':key,'anthropic-version':ANTHROPIC_VERSION}:{Authorization:'Bearer '+key},redirect:'error',signal:AbortSignal.timeout(10000)});
    if(!res.ok){await res.body?.cancel();return null;}
    const json=await readJSON(res,1024*1024);if(!Array.isArray(json.data))return null;
    for(const m of json.data)if(safeName(m.id))names.add(m.id);
    if(!json.has_more)return names;
    if(provider!=='anthropic'||!safeName(json.last_id)||seen.has(json.last_id))return null;
    cursor=json.last_id;seen.add(cursor);
   }
  }catch{return null;}
  return null; // An incomplete listing must not claim a model is absent.
 }
 const [a,o]=await Promise.all([list('anthropic'),list('openai')]);
 const available=(set,name)=>set===null?'unknown':set.has(name)?'available':'unavailable';
 const rows=['claude-opus-5-5','claude-haiku-5-5','claude-fable-5-2'].map(name=>({name,availability:available(a,name)}));
 // OpenAI's list supplies IDs, not a dependable marketing-name mapping.
 // Return exact listed GPT-6.1 IDs for Silver to map using official docs.
 // A supplied exact ID is checked for membership, never guessed from "Sol".
 rows.push({name:solId??'GPT-6.1 Sol (exact ID unverified)',availability:solId?available(o,solId):'unknown'});
 if(!solId&&o)for(const name of [...o].sort().filter(n=>/^gpt-6[.]1(?:[._/-]|$)/i.test(n)).slice(0,100))rows.push({name,availability:'available'});
 return rows;
}
const count=v=>Number.isSafeInteger(v)&&v>=0&&v<=10000000;
export function normalizeUsage(provider,u){
 if(!u||!count(u.input_tokens)||!count(u.output_tokens))return null;
 let r;if(provider==='anthropic'){
  const details=u.output_tokens_details;
  if(details!=null&&(typeof details!=='object'||Array.isArray(details)))return null;
  // Haiku can think by default. Its reported thinking count is part of total
  // output, never an extra charge; an absent breakdown is unknown, not zero.
  r={input_tokens:u.input_tokens,output_tokens:u.output_tokens,cache_read_tokens:u.cache_read_input_tokens??0,cache_write_tokens:u.cache_creation_input_tokens??0,reasoning_tokens:details?.thinking_tokens??null};
 }else{
  const cache=u.input_tokens_details?.cached_tokens??0;
  r={input_tokens:u.input_tokens-cache,output_tokens:u.output_tokens,cache_read_tokens:cache,cache_write_tokens:0,reasoning_tokens:u.output_tokens_details?.reasoning_tokens??0};
 }
 const {reasoning_tokens,...billable}=r;
 return Object.values(billable).every(count)&&(reasoning_tokens===null||(count(reasoning_tokens)&&reasoning_tokens<=r.output_tokens))?r:null;
}
export async function generate({fetchImpl=fetch,getSecret},route,prompt){
 const provider=route.provider,key=getSecret(provider==='anthropic'?'ANTHROPIC_API_KEY':'OPENAI_API_KEY');
 const rejected=(failureClass,usage=null)=>({usage,value:null,failureClass});
 if(!key)return rejected('provider_key_missing');
 const anthropic=provider==='anthropic';
 const body=anthropic?{model:route.model_id,max_tokens:route.output_token_cap,messages:[{role:'user',content:prompt}]}:{model:route.model_id,max_output_tokens:route.output_token_cap,input:[{role:'user',content:prompt}],store:false};
 let response;
 try{response=await fetchImpl(anthropic?'https://api.anthropic.com/v1/messages':'https://api.openai.com/v1/responses',{method:'POST',headers:{'content-type':'application/json',...(anthropic?{'x-api-key':key,'anthropic-version':ANTHROPIC_VERSION}:{Authorization:'Bearer '+key})},body:JSON.stringify(body),redirect:'error',signal:AbortSignal.timeout(18000)});}catch{return rejected('provider_request_failed');}
 if(!response.ok){await response.body?.cancel().catch(()=>{});return rejected('provider_request_failed');}
 let data;
 try{data=await readJSON(response,256*1024);}catch{return rejected('provider_response_invalid');}
 if(!data||typeof data!=='object'||Array.isArray(data))return rejected('provider_response_invalid');
 const usage=normalizeUsage(provider,data.usage);
 if(!usage)return rejected('provider_usage_invalid');
 if(anthropic?data.stop_reason!=='end_turn':data.status!=='completed')return rejected('provider_output_incomplete',usage);
 try{
  let chunks;
  if(anthropic){
   if(!Array.isArray(data.content))return rejected('provider_content_invalid',usage);
   chunks=[];
   for(const block of data.content){
    if(!block||typeof block!=='object'||Array.isArray(block))return rejected('provider_content_invalid',usage);
    if(block.type==='text'&&typeof block.text==='string')chunks.push(block);
    // Documented metadata only: never parse, return, retain or reuse its
    // contents/signature/data. Empty thinking is valid with display omitted.
    else if(block.type==='thinking'&&typeof block.thinking==='string'&&typeof block.signature==='string')continue;
    else if(block.type==='redacted_thinking'&&typeof block.data==='string')continue;
    else return rejected('provider_content_invalid',usage);
   }
   if(!chunks.length)return rejected('provider_content_invalid',usage);
  }else{
   chunks=data.output?.flatMap(o=>o.type==='message'?o.content:[]);
   if(!Array.isArray(chunks)||chunks.some(c=>!c||!['text','output_text'].includes(c.type)||typeof c.text!=='string'))return rejected('provider_content_invalid',usage);
  }
  let text=chunks.map(c=>c.text).join('');
  // A guide may wrap its otherwise valid JSON in one Markdown code fence.
  // Unwrap only that entire document, never extract JSON from surrounding prose.
  // The same strict schema, scope and verbatim-evidence validator still runs.
  if(route.route_key==='guide'){
   text=text.trim();
   const fenced=/^```(?:json)?\r?\n([\s\S]*?)\r?\n```$/i.exec(text);
   if(fenced)text=fenced[1];
  }
  try{return {usage,value:JSON.parse(text),failureClass:null};}catch{return rejected('proposal_json_invalid',usage);}
 }catch{return rejected('provider_content_invalid',usage);}
}
