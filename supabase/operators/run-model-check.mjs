// Silver's metadata-only runner. No automatic issuance, deployment or generation.
import {readFile} from 'node:fs/promises';
import {resolve} from 'node:path';
export async function runModelCheck(endpoint,file,openaiSolId,fetchImpl=fetch){
 const url=new URL(endpoint);
 if(url.protocol!=='https:'||url.username||url.password||url.search||url.hash||!url.pathname.endsWith('/functions/v1/ai-proxy'))throw new Error('Expected the approved function HTTPS URL');
 const grant=JSON.parse(await readFile(file,'utf8'));if(!/^[a-f0-9]{64}$/.test(grant.session))throw new Error('Invalid private grant file');
 const response=await fetchImpl(url.href+'/models',{method:'POST',headers:{Origin:'https://zateslofl.github.io','Content-Type':'application/json',Authorization:'Bearer '+grant.session},body:JSON.stringify(openaiSolId?{openaiSolId}:{}),redirect:'error',signal:AbortSignal.timeout(30000)});
 if(!response.ok){await response.body?.cancel();throw new Error('Model check refused; inspect status and grant expiry. HTTP '+response.status);}
 const data=await response.json();if(!Array.isArray(data.models)||data.models.some(m=>typeof m.name!=='string'||!['available','unavailable','unknown'].includes(m.availability)))throw new Error('Invalid metadata response');
 return data.models.map(({name,availability})=>({name,availability}));
}
if(process.argv[1]&&import.meta.url===new URL('file://'+resolve(process.argv[1])).href){
 try{if(process.argv.length<4||process.argv.length>5)throw new Error('Usage: node run-model-check.mjs <approved-function-url> <private-grant.json> [documented-exact-sol-id]');
 console.log(JSON.stringify(await runModelCheck(process.argv[2],process.argv[3],process.argv[4]),null,2));
 }catch{console.error('Model check failed. No provider details or credentials were logged.');process.exitCode=1;}
}
