export const ORIGIN='https://zateslofl.github.io';
export const GUIDE_SCHEMA='atlas-evidence-answer-v1';
export const MODEL_SCHEMA='atlas-model-check-v1';
export const BUILDER_SCHEMA='atlas-kit-proposal-v1';
export class Fault extends Error {
 constructor(code,status=400,retry=0){super(code);this.code=code;this.status=status;this.retry=retry;}
}
export const fail=(code,status=400,retry=0)=>{throw new Fault(code,status,retry);};
export const bytes=s=>new TextEncoder().encode(s);
export const id=()=>crypto.randomUUID();
export const iso=n=>new Date(n).toISOString();
export const token=()=>Array.from(crypto.getRandomValues(new Uint8Array(32)),n=>n.toString(16).padStart(2,'0')).join('');
export async function digest(s){return new Uint8Array(await crypto.subtle.digest('SHA-256',bytes(s)));}
export function bearer(req){const s=req.headers.get('authorization');if(!/^Bearer [a-f0-9]{64}$/.test(s??''))fail('UNAUTHORIZED',401);return s.slice(7);}
export function exact(value,keys,required=keys){
 if(!value||typeof value!=='object'||Array.isArray(value)||Object.keys(value).some(k=>!keys.includes(k))||required.some(k=>!Object.hasOwn(value,k)))fail('BAD_REQUEST');
}
export async function readJSON(input,max){
 const n=input.headers.get('content-length');if(n&&(!/^\d+$/.test(n)||Number(n)>max))fail('BODY_TOO_LARGE',413);
 const reader=input.body?.getReader();if(!reader)fail('BAD_REQUEST');let size=0,parts=[];
 try {while(true){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>max)fail('BODY_TOO_LARGE',413);parts.push(value);}} finally {await reader.cancel().catch(()=>{});}
 const all=new Uint8Array(size);let offset=0;for(const p of parts){all.set(p,offset);offset+=p.length;}
 try{return JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(all));}catch{fail('BAD_REQUEST');}
}
export function cost(counts,route){
 const rates=['input','output','cache_read','cache_write'].map(k=>Number(route[k+'_microusd_per_million']));
 if(rates.some(n=>!Number.isSafeInteger(n)||n<0))fail('LIVE_UNAVAILABLE',503);
 let total=0n;['input','output','cache_read','cache_write'].forEach((k,i)=>{total+=BigInt(counts[k+'_tokens']??0)*BigInt(rates[i]);});
 return Number((total+999999n)/1000000n);
}
export function envelope(route,prompt,syntheticPromptHash=null){
 const b=route.billing_contract;
 if(!b||b.api!==(route.provider==='anthropic'?'anthropic-messages':'openai-responses')||!Number.isFinite(b.input_tokens_per_byte)||b.input_tokens_per_byte<1||b.input_tokens_per_byte>16||!Number.isSafeInteger(b.overhead_tokens)||b.overhead_tokens<0||!/^https:\/\//.test(b.evidence_url??'')||b.output_includes_reasoning!==true)fail('LIVE_UNAVAILABLE',503);
 // Only fixed synthetic benchmark prompts may use documented exact bounds.
 // Visitor questions are never hashed or persisted.
 const fixed=syntheticPromptHash?b.synthetic_input_bounds?.[syntheticPromptHash]:null;
 const input=fixed!==null&&fixed!==undefined&&Number.isSafeInteger(fixed)&&fixed>0?fixed:Math.ceil(bytes(prompt).length*b.input_tokens_per_byte)+b.overhead_tokens;
 if(input>route.input_token_cap)fail('CONTEXT_TOO_LARGE',413);
 const rate=Math.max(...['input','cache_read','cache_write'].map(k=>Number(route[k+'_microusd_per_million'])));
 const reserved=cost({input_tokens:input,output_tokens:route.output_token_cap},{...route,input_microusd_per_million:rate});
 if(!Number.isSafeInteger(reserved)||reserved<=0)fail('LIVE_UNAVAILABLE',503);
 return {input,reserved};
}
export function receipt(attempt,usage,accepted,amount,basis,time){
 const r={id:attempt.id,time:iso(time),job:attempt.accounting.job,model:attempt.accounting.model,agent:attempt.accounting.agent};
 for(const k of ['input','output','cache_read','cache_write','reasoning'])r[k+'_tokens']=usage?.[k+'_tokens']??null;
 return {...r,cost_microusd:amount,cost_basis:basis,validation_passed:accepted,result:accepted?'accepted':'rejected'};
}
