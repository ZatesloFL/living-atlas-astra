// Explicit manual synthetic verification. Never run in npm test; no provider credentials.
if(process.env.ATLAS_ALLOW_LIVE!=='1')throw new Error('Set ATLAS_ALLOW_LIVE=1 for this authorized synthetic run.');
import {spawnSync} from 'node:child_process';import {writeFileSync} from 'node:fs';import assert from 'node:assert/strict';
import {createAI,provenanceLabel} from '../src/ai.js';import {createProxyTransport,AI_PROXY_ENDPOINT} from '../src/ai-proxy.js';
import {Staff} from '../src/staff.js';import {AccessStore} from '../src/access-store.js';import {PRESETS} from '../src/data.js';import {DONT_KNOW} from '../src/docent-questions.js';
const output=process.env.ATLAS_LIVE_OUTPUT||'work/run3-docent-live.json',record={captureType:'real deployed proxy responses, synthetic questions; not raw provider envelopes',startedAt:new Date().toISOString(),edgeFunctionVersion:9,transport:'Application client through verified-TLS HTTP transport; not a phone browser capture',captures:[]};
const save=()=>writeFileSync(output,JSON.stringify(record,null,2)+'\n');
const fetchImpl=async(url,options)=>{
 const child=spawnSync('python3',['-c',`import sys,json,urllib.request,urllib.error
x=json.load(sys.stdin)
r=urllib.request.Request(x['url'],data=x['body'].encode(),headers=x['headers'],method='POST')
try:
 with urllib.request.urlopen(r,timeout=50) as z: print(json.dumps({'status':z.status,'body':z.read().decode()}))
except urllib.error.HTTPError as z: print(json.dumps({'status':z.code,'body':z.read().decode()}))
`],{input:JSON.stringify({url,body:options.body,headers:{...options.headers,Origin:'https://zateslofl.github.io'}}),encoding:'utf8'});
 if(child.status!==0)throw new Error('Verified HTTP transport failed.');const response=JSON.parse(child.stdout);
 if(url.endsWith('/request')){record.captures.push({at:new Date().toISOString(),request:JSON.parse(options.body),httpStatus:response.status,response:JSON.parse(response.body)});save();}
 return new Response(response.body,{status:response.status});
};
const memory=new Map(),storage={getItem:k=>memory.get(k),setItem:(k,v)=>memory.set(k,v)},store=new AccessStore(()=>storage),staff=new Staff(store);await staff.ready;
const client=createAI({transport:createProxyTransport({endpoint:AI_PROXY_ENDPOINT,fetchImpl,timeoutMs:60000})}),lens={...structuredClone(PRESETS.Teen),profileId:'synthetic-run3-holder',age:34,identity:{display:'pseudonym',backing:'none'},show:{real:true,pseudonym:true,anonymous:true,agent:true}};
try{for(const [index,question] of ['What bus service did residents boycott?','What is this hall about?','did it actually work','What is the airspeed of a swallow?'].entries()){
 if(index<Number(process.env.ATLAS_LIVE_START_AT??0))continue;
 if(index)await new Promise(resolve=>setTimeout(resolve,20000));
 const context=staff.context(staff.actor('docent-silver'),'boycott','answer',lens,{question}),result=await client.request({job:'guide',agentId:'docent-silver',context}),capture=record.captures.at(-1);if(capture){capture.clientResult=result;capture.label=provenanceLabel(result.receiptData,result.proposal);}save();
 console.log(JSON.stringify({index:index+1,receipt:result.receiptData.receiptId,label:provenanceLabel(result.receiptData,result.proposal)}));assert.equal(result.receiptData.provider,'proxy');
 if(index<2)assert(result.proposal.citations.length);else if(index===2){capture.partialEvidence='The authored outcomes passage is selected; success is not asserted. A supported quote or honest abstention is valid.';}else {assert.equal(result.proposal.text,DONT_KNOW);assert(!provenanceLabel(result.receiptData,result.proposal).includes('grounded'));}
 }record.passed=true;
}catch(error){record.error=error.message;throw error;}finally{save();}
