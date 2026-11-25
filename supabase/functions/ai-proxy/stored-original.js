import {fail} from './core.js';

export const uploadIdPattern = /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i;

// The caller has already checked the owner, source kind, state and byte limit.
// Read the one immutable object key and check it against its upload Receipt.
export async function loadStoredOriginal(upload, {getSecret,fetchImpl=fetch}, unavailable) {
  const length=Number(upload.original_bytes);
  const role=getSecret('SUPABASE_SERVICE_ROLE_KEY'),url=getSecret('SUPABASE_URL');
  if (!role || !url) fail(unavailable,503);
  const path=new URL('/storage/v1/object/authenticated/atlas-user-uploads/'+upload.id+'/original',url);
  let response;
  try {
    response=await fetchImpl(path,{headers:{Authorization:'Bearer '+role,apikey:role},
      redirect:'error',signal:AbortSignal.timeout(12000)});
  } catch {
    fail(unavailable,503);
  }
  if (!response.ok || !response.body ||
      (response.headers.has('content-length') && Number(response.headers.get('content-length'))!==length)) {
    await response.body?.cancel().catch(()=>{});
    fail(unavailable,503);
  }
  const original=new Uint8Array(length),reader=response.body.getReader();
  let offset=0;
  try {
    for (;;) {
      const {value,done}=await reader.read();
      if (done) break;
      if (offset+value.length>length) fail(unavailable,503);
      original.set(value,offset);
      offset+=value.length;
    }
  } catch {
    fail(unavailable,503);
  } finally {
    await reader.cancel().catch(()=>{});
  }
  const hash=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',original)),n=>n.toString(16).padStart(2,'0')).join('');
  if (offset!==length || hash!==upload.content_sha256) fail(unavailable,503);
  return original;
}
