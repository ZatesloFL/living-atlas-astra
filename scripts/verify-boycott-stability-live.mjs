// Explicit synthetic acceptance only; never imported by npm test. No provider credentials.
import {spawnSync,execFileSync} from 'node:child_process';
import {writeFileSync,mkdirSync} from 'node:fs';
import {dirname} from 'node:path';
import {createAI,provenanceLabel} from '../src/ai.js';
import {createProxyTransport,AI_PROXY_ENDPOINT} from '../src/ai-proxy.js';
import {Staff} from '../src/staff.js';
import {AccessStore} from '../src/access-store.js';
import {PRESETS} from '../src/data.js';
import {DONT_KNOW} from '../src/docent-questions.js';

if(process.env.ATLAS_ALLOW_LIVE!=='1')throw new Error('Explicit live acceptance flag required.');
const evidenceCommit=process.env.ATLAS_EVIDENCE_COMMIT,edgeFunctionVersion=Number(process.env.ATLAS_EDGE_VERSION);
if(!/^[a-f0-9]{40}$/.test(evidenceCommit??'')||!Number.isInteger(edgeFunctionVersion)||edgeFunctionVersion<10)throw new Error('Name the landed evidence commit and deployed function version.');
execFileSync('git',['merge-base','--is-ancestor',evidenceCommit,'HEAD']);
const output=process.env.ATLAS_LIVE_OUTPUT||'work/boycott-stability/live.json';mkdirSync(dirname(output),{recursive:true});
const record={captureType:'real deployed proxy responses to synthetic questions; never raw provider envelopes',startedAt:new Date().toISOString(),evidenceCommit,clientCommit:execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim(),edgeFunctionVersion,transport:'Application client over verified TLS; not a physical phone test',sessionPolicy:'One holder, two sessions, at most nine calls per session, at least twenty seconds between calls. No retries.',sessions:[],captures:[]};
const save=()=>writeFileSync(output,JSON.stringify(record,null,2)+'\n');
const fetchImpl=async(url,options)=>{
 const child=spawnSync('python3',['-c',`import sys,json,urllib.request,urllib.error
x=json.load(sys.stdin)
r=urllib.request.Request(x['url'],data=x['body'].encode(),headers=x['headers'],method='POST')
try:
 with urllib.request.urlopen(r,timeout=50) as z: print(json.dumps({'status':z.status,'body':z.read().decode()}))
except urllib.error.HTTPError as z: print(json.dumps({'status':z.code,'body':z.read().decode()}))
`],{input:JSON.stringify({url,body:options.body,headers:{...options.headers,Origin:'https://zateslofl.github.io'}}),encoding:'utf8'});
 if(child.status!==0)throw new Error('Verified HTTP transport failed; no retry.');
 const response=JSON.parse(child.stdout);
 if(url.endsWith('/request'))record.captures.push({at:new Date().toISOString(),request:JSON.parse(options.body),httpStatus:response.status,response:JSON.parse(response.body)});
 else record.sessions.push({at:new Date().toISOString(),httpStatus:response.status,renewingSameHolder:!!JSON.parse(options.body).holder});
 save();return new Response(response.body,{status:response.status});
};
const memory=new Map(),storage={getItem:k=>memory.get(k),setItem:(k,v)=>memory.set(k,v)},store=new AccessStore(()=>storage),staff=new Staff(store);await staff.ready;
const makeClient=()=>createAI({transport:createProxyTransport({endpoint:AI_PROXY_ENDPOINT,fetchImpl,storage,timeoutMs:60000})});
let client=makeClient();
const lens={...structuredClone(PRESETS.Teen),profileId:'synthetic-boycott-stability',age:34,identity:{display:'pseudonym',backing:'none'},show:{real:true,pseudonym:true,anonymous:true,agent:true}};
const questions=['Who led this','What is this Place?','Did it work?','What needs verification?','What can this helper do?'];
const cases=Array.from({length:3},(_,round)=>questions.map(question=>({round:round+1,question}))).flat();
cases.push({round:1,question:'What is the airspeed of a swallow?'});
try{
 for(const [index,{question,round}] of cases.entries()){
  if(index)await new Promise(resolve=>setTimeout(resolve,20000));
  if(index===9)client=makeClient(); // Same holder and daily quota, second allowed session.
  const before=record.captures.length,context=staff.context(staff.actor('docent-silver'),'boycott','answer',lens,{question});
  const result=await client.request({job:'guide',agentId:'docent-silver',context});
  const capture=record.captures.length>before?record.captures.at(-1):null;
  const verdict=result.receiptData.provider!=='proxy'?'unavailable':result.proposal.text===DONT_KNOW?'no-supported-answer':'grounded-answer';
  if(capture)Object.assign(capture,{round,clientResult:result,label:provenanceLabel(result.receiptData,result.proposal),verdict});
  save();console.log(JSON.stringify({call:index+1,round,question,verdict,receipt:result.receiptData.receiptId??null}));
  if(!capture||result.receiptData.provider!=='proxy')throw new Error('Live acceptance stopped on unavailable/rejected response; no retry.');
 }
 record.stability=questions.map(question=>{const captures=record.captures.filter(c=>c.request.context.question===question);return {question,verdicts:captures.map(c=>c.verdict),receipts:captures.map(c=>c.response.receiptData.receiptId),agree:captures.length===3&&new Set(captures.map(c=>c.verdict)).size===1};});
 record.unsupportedAbstained=record.captures.at(-1).verdict==='no-supported-answer';
 record.passed=record.stability.every(s=>s.agree&&s.verdicts[0]==='grounded-answer')&&record.unsupportedAbstained;
 if(!record.passed)process.exitCode=1;
}catch(error){record.error=error.message;process.exitCode=1;}finally{record.finishedAt=new Date().toISOString();save();}
