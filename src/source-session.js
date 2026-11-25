import { AI_PROXY_ENDPOINT } from './ai-proxy.js';
import { UploadClient } from './upload-client.js';
import { AUDIO_TRANSCRIPTION_MODEL, validPhotoRecordId } from './upload-scores.js';

const ORIGIN = 'https://zateslofl.github.io';
const HOLDER_KEY = 'atlas-ai-anonymous-holder';
const REVIEW_SESSION_KEY = 'atlas-upload-review-session';
const HOLDER = /^[a-f0-9]{64}$/i;
const endpoint = AI_PROXY_ENDPOINT.replace(/\/ai-proxy$/, '/atlas-sources');
const enabled = () => globalThis.location?.origin === ORIGIN &&
  new URLSearchParams(location.search).get('ai') !== 'local';
let bootstrap;
let reviewBootstrap;

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

const reviewErrors = {
  PHOTO_TOO_LARGE: 'Photo assessment requires an original of 7 MiB or less. The uploaded copy stays unpublished.',
  PHOTO_DIMENSIONS_UNSUPPORTED: 'Photo assessment supports images up to 8,000 pixels on each side. The uploaded copy stays unpublished.',
  CONTEXT_TOO_LARGE: 'Use a shorter description so the image and comparison fit the existing assessment limit.',
  REQUEST_PENDING: 'This upload is already being assessed. Try again after the current request finishes.',
  RATE_LIMITED: 'Upload assessment has reached its limit. Try again later. The copy stays unpublished.',
  PHOTO_UNAVAILABLE: 'The stored original could not be loaded for assessment. The photo stays unpublished.',
  AUDIO_FORMAT_UNSUPPORTED: 'For live audio assessment, upload a short PCM WAV. This copy stays unpublished.',
  AUDIO_TOO_LONG: 'This clip exceeds the live transcription limit. The copy stays unpublished.',
  AUDIO_UNAVAILABLE: 'The stored audio could not be loaded. The copy stays unpublished.',
  TRANSCRIPT_UNAVAILABLE: 'A usable transcript is unavailable. The audio stays unpublished.',
  TRANSCRIPTION_FAILED: 'The Atlas could not transcribe the uploaded speech. The copy stays unpublished.'
};

async function reviewPost(path, body, signal, credential, unavailable) {
  const response = await globalThis.fetch(AI_PROXY_ENDPOINT + path, {
    method: 'POST', cache: 'no-store', credentials: 'omit', redirect: 'error', signal,
    headers: {'Content-Type':'application/json', ...(credential?{Authorization:'Bearer '+credential}:{})},
    body: JSON.stringify(body)
  });
  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    const code = payload?.code;
    throw Object.assign(new Error(reviewErrors[code] ?? unavailable), {code,status:response.status,receiptId:payload?.receiptId});
  }
  return payload;
}

async function reviewSession(holder, signal) {
  const hash = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',
    new TextEncoder().encode(holder))),byte=>byte.toString(16).padStart(2,'0')).join('');
  try {
    const cached=JSON.parse(globalThis.sessionStorage.getItem(REVIEW_SESSION_KEY));
    if (cached?.holderHash===hash && HOLDER.test(cached.session) && Date.parse(cached.expiresAt)>Date.now()+5000) {
      return cached.session;
    }
  } catch { /* A session can be issued without session storage. */ }
  const unavailable='The upload assessment session could not be opened.';
  reviewBootstrap ??= (async () => {
    const lease=await reviewPost('/session',{holder,purpose:'upload-review'},AbortSignal.timeout(15000),null,unavailable);
    if (!HOLDER.test(lease?.session ?? '') || Date.parse(lease.expiresAt)<=Date.now()) {
      throw new Error(unavailable);
    }
    try {
      globalThis.sessionStorage.setItem(REVIEW_SESSION_KEY,JSON.stringify({
        holderHash:hash,session:lease.session,expiresAt:lease.expiresAt
      }));
    } catch { /* The current request still has its session. */ }
    return lease.session;
  })().finally(()=>{reviewBootstrap=undefined;});
  const session=await reviewBootstrap;
  signal?.throwIfAborted();
  return session;
}

async function assessUpload(signal, work) {
  const holder=await ensureLiveUploadHolder({signal});
  if (!holder) throw new Error('Live upload assessment is unavailable in this session.');
  const session=await reviewSession(holder,signal);
  try {
    const request=(schemaId,context,unavailable)=>{
      const timeout=AbortSignal.timeout(55000);
      return reviewPost('/request',{
      requestId:crypto.randomUUID(),job:'background',agentId:'upload-declaration-helper',
      schemaId,context
      },signal?AbortSignal.any([signal,timeout]):timeout,session,unavailable);
    };
    return await work(request);
  } catch(error) {
    if(error.status===401)try{globalThis.sessionStorage.removeItem(REVIEW_SESSION_KEY);}catch{}
    throw error;
  }
}

export function requestPhotoScores({id,description,signal}) {
  return assessUpload(signal,request=>request('atlas-upload-photo-scores-v1',{uploadId:id,description},
    'Live photo assessment is unavailable. The photo stays unpublished.'));
}

export function requestAudioScores({id,description,signal}) {
  return assessUpload(signal,async request=>{
    const transcript=await request('atlas-upload-audio-transcription-v1',{uploadId:id},
      'The Atlas could not transcribe the uploaded speech. The audio stays unpublished.');
    const receipt=transcript?.transcriptionReceiptId;
    if(!validPhotoRecordId(receipt)||transcript.model!==AUDIO_TRANSCRIPTION_MODEL){
      throw new Error('The transcript has no valid Receipt. The audio stays unpublished.');
    }
    signal?.throwIfAborted();
    const result=await request('atlas-upload-audio-scores-v1',{uploadId:id,description},
      'The Atlas could not assess the transcript. The audio stays unpublished.');
    if(result?.receiptData?.transcriptionReceiptId!==receipt){
      throw new Error('The proposal does not match its transcription Receipt. The audio stays unpublished.');
    }
    return result;
  });
}
