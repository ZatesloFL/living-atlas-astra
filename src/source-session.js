import { AI_PROXY_ENDPOINT } from './ai-proxy.js';
import { UploadClient } from './upload-client.js';

const ORIGIN = 'https://zateslofl.github.io';
const HOLDER_KEY = 'atlas-ai-anonymous-holder';
const PHOTO_SESSION_KEY = 'atlas-upload-photo-session';
const HOLDER = /^[a-f0-9]{64}$/i;
const endpoint = AI_PROXY_ENDPOINT.replace(/\/ai-proxy$/, '/atlas-sources');
const enabled = () => globalThis.location?.origin === ORIGIN &&
  new URLSearchParams(location.search).get('ai') !== 'local';
let bootstrap;
let photoBootstrap;

export function currentUploadHolder() {
  if (!enabled()) return null;
  try {
    const value = localStorage.getItem(HOLDER_KEY);
    return HOLDER.test(value ?? '') ? value : null;
  } catch {
    return null;
  }
}

export async function ensureLiveUploadHolder({signal} = {}) {
  if (!enabled()) return null;
  signal?.throwIfAborted();
  const existing = currentUploadHolder();
  if (existing) return existing;
  bootstrap ??= (async () => {
    const storage = globalThis.localStorage;
    // Hosted files need a recoverable browser holder before bytes can be staged.
    storage.setItem('atlas-upload-storage-check', '1');
    storage.removeItem('atlas-upload-storage-check');
    const response = await fetch(AI_PROXY_ENDPOINT + '/session', {
      method: 'POST', credentials: 'omit', cache: 'no-store', redirect: 'error',
      headers: {'Content-Type': 'application/json'}, body: '{}',
      signal: AbortSignal.timeout(15000)
    });
    if (!response.ok) throw new Error('Dev upload access could not be opened. Try again later.');
    const data = await response.json();
    if (!HOLDER.test(data.holder ?? '')) throw new Error('Dev upload access could not be opened.');
    storage.setItem(HOLDER_KEY, data.holder);
    return data.holder;
  })().finally(() => {bootstrap = undefined;});
  const holder = await bootstrap;
  signal?.throwIfAborted();
  return holder;
}

export const uploadClient = new UploadClient({endpoint, getHolder: ensureLiveUploadHolder, enabled});

const photoErrors = {
  PHOTO_TOO_LARGE: 'Photo assessment requires an original of 7 MiB or less. The uploaded copy stays unpublished.',
  PHOTO_DIMENSIONS_UNSUPPORTED: 'Photo assessment supports images up to 8,000 pixels on each side. The uploaded copy stays unpublished.',
  CONTEXT_TOO_LARGE: 'Use a shorter description so the image and comparison fit the existing assessment limit.',
  REQUEST_PENDING: 'This photo is already being assessed. Try again after the current request finishes.',
  RATE_LIMITED: 'Photo assessment has reached its limit. Try again later. The photo stays unpublished.',
  PHOTO_UNAVAILABLE: 'The stored original could not be loaded for assessment. The photo stays unpublished.'
};

async function photoPost(path, body, signal, credential) {
  const response = await globalThis.fetch(AI_PROXY_ENDPOINT + path, {
    method: 'POST', cache: 'no-store', credentials: 'omit', redirect: 'error', signal,
    headers: {'Content-Type':'application/json', ...(credential?{Authorization:'Bearer '+credential}:{})},
    body: JSON.stringify(body)
  });
  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    const code = payload?.code;
    throw Object.assign(new Error(photoErrors[code] ??
      'Live photo assessment is unavailable. The photo stays unpublished.'), {code, status:response.status});
  }
  return payload;
}

async function photoSession(holder, signal) {
  const hash = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',
    new TextEncoder().encode(holder))),byte=>byte.toString(16).padStart(2,'0')).join('');
  try {
    const cached=JSON.parse(globalThis.sessionStorage.getItem(PHOTO_SESSION_KEY));
    if (cached?.holderHash===hash && HOLDER.test(cached.session) && Date.parse(cached.expiresAt)>Date.now()+5000) {
      return cached.session;
    }
  } catch { /* A session can be issued without session storage. */ }
  photoBootstrap ??= (async () => {
    const lease=await photoPost('/session',{holder,purpose:'upload-photo'},AbortSignal.timeout(15000));
    if (!HOLDER.test(lease?.session ?? '') || Date.parse(lease.expiresAt)<=Date.now()) {
      throw new Error('The photo assessment session could not be opened.');
    }
    try {
      globalThis.sessionStorage.setItem(PHOTO_SESSION_KEY,JSON.stringify({
        holderHash:hash,session:lease.session,expiresAt:lease.expiresAt
      }));
    } catch { /* The current request still has its session. */ }
    return lease.session;
  })().finally(()=>{photoBootstrap=undefined;});
  const session=await photoBootstrap;
  signal?.throwIfAborted();
  return session;
}

export async function requestPhotoScores({id,description,signal}) {
  const holder=await ensureLiveUploadHolder({signal});
  if (!holder) throw new Error('Live photo assessment is unavailable in this session.');
  const session=await photoSession(holder,signal);
  const timeout=AbortSignal.timeout(55000);
  try {
    return await photoPost('/request',{
      requestId:crypto.randomUUID(),job:'background',agentId:'upload-declaration-helper',
      schemaId:'atlas-upload-photo-scores-v1',context:{uploadId:id,description}
    },signal?AbortSignal.any([signal,timeout]):timeout,session);
  } catch(error) {
    if(error.status===401)try{globalThis.sessionStorage.removeItem(PHOTO_SESSION_KEY);}catch{}
    throw error;
  }
}
