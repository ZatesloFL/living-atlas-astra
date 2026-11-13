import postgres from 'postgres';
import {Ajv2020} from 'ajv/dist/2020.js';
import {Store} from './store.js';
import {ORIGIN} from './core.js';
import {builderSchema} from './protocol.js';
import {createHandler} from './handler.js';
// Existing platform-injected binding. Never create/print this value or put it in
// client configuration. No fallback to a public RPC, REST key or extra secret.
let instance: ReturnType<typeof createHandler> | null = null;
Deno.serve(async (request: Request) => {
 try {
  if(request.headers.get('origin')!==ORIGIN) return new Response(JSON.stringify({code:'ORIGIN_DENIED'}),{status:403,headers:{'Content-Type':'application/json','Cache-Control':'no-store','Vary':'Origin'}});
  if(Deno.env.get('ALLOWED_ORIGINS')!==ORIGIN) return new Response(JSON.stringify({code:'AI_OFF',message:'AI is off'}),{status:503,headers:{'Content-Type':'application/json','Cache-Control':'no-store','Vary':'Origin'}});
  if (!instance) {
   const connection = Deno.env.get('SUPABASE_DB_URL');
   if (!connection) return new Response(JSON.stringify({code:'AI_OFF',message:'AI is off'}),{status:503,headers:{'Content-Type':'application/json','Cache-Control':'no-store'}});
   const sql=postgres(connection,{prepare:false,ssl:'verify-full',max:2,idle_timeout:20,connect_timeout:5,onnotice:()=>{},debug:false});
   const ajv=new Ajv2020({strict:false,allErrors:false});
   instance=createHandler({store:new Store(sql),getSecret:(name:string)=>Deno.env.get(name),validateBuilderSchema:ajv.compile(builderSchema)});
  }
  return await instance(request);
 } catch {
  return new Response(JSON.stringify({code:'LIVE_UNAVAILABLE'}),{status:503,headers:{'Content-Type':'application/json','Cache-Control':'no-store'}});
 }
});
