import { AI_PROXY_ENDPOINT } from './ai-proxy.js';
import { UploadClient } from './upload-client.js';

const ORIGIN = 'https://zateslofl.github.io';
const HOLDER_KEY = 'atlas-ai-anonymous-holder';
const HOLDER = /^[a-f0-9]{64}$/i;
const endpoint = AI_PROXY_ENDPOINT.replace(/\/ai-proxy$/, '/atlas-sources');
const enabled = () => globalThis.location?.origin === ORIGIN &&
  new URLSearchParams(location.search).get('ai') !== 'local';
let bootstrap;

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
