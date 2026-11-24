import { readBytes, SourceFault } from './handler.js';

const BUCKET = 'atlas-user-uploads';

export class Storage {
  constructor({ url, role, fetcher = fetch }) {
    this.url = new URL('/storage/v1/object/', url).href;
    this.headers = { Authorization: 'Bearer ' + role, apikey: role };
    this.fetcher = fetcher;
  }

  async request(path, init = {}) {
    try {
      return await this.fetcher(this.url + path, {
        ...init,
        headers: { ...this.headers, ...init.headers },
        redirect: 'error',
        signal: AbortSignal.timeout(15000),
      });
    } catch {
      throw new SourceFault('SOURCE_STORAGE_UNAVAILABLE', 503);
    }
  }

  async put(path, bytes, contentType) {
    const response = await this.request(BUCKET + '/' + path, {
      method: 'POST', body: bytes,
      headers: { 'Content-Type': contentType, 'Cache-Control': 'no-store', 'x-upsert': 'false' },
    });
    if (response.ok) {
      await response.body?.cancel();
      return true;
    }
    const problem = await response.json().catch(() => null);
    if (response.status === 409 || problem?.error === 'Duplicate' ||
        problem?.code === 'ResourceAlreadyExists') return false;
    throw new SourceFault('SOURCE_STORAGE_UNAVAILABLE', 503);
  }

  async read(path, length) {
    const response = await this.request('authenticated/' + BUCKET + '/' + path);
    if (!response.ok) {
      const problem = await response.json().catch(() => null);
      if (response.status === 404 || String(problem?.statusCode) === '404') return null;
      throw new SourceFault('SOURCE_STORAGE_UNAVAILABLE', 503);
    }
    try {
      return await readBytes(response.body, length, length);
    } catch {
      throw new SourceFault('SOURCE_STORAGE_UNAVAILABLE', 503);
    }
  }

  async remove(paths) {
    const response = await this.request(BUCKET, {
      method: 'DELETE', body: JSON.stringify({ prefixes: paths }),
      headers: { 'Content-Type': 'application/json' },
    });
    await response.body?.cancel();
    if (!response.ok) throw new SourceFault('SOURCE_STORAGE_UNAVAILABLE', 503);
  }
}
