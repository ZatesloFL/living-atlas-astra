import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { loadBuildStamp } from '../src/diagnostics.js';

test('Diagnostics reads the full deployed commit from its own site', async () => {
  const commit = 'e770d3a8a4d06c71dbde55b51e3419cf5a4f3a56';
  const stamp = await loadBuildStamp(async function (url, options) {
    assert.equal(this, globalThis);
    assert.equal(url.href, new URL('../build-stamp.json', import.meta.url).href);
    assert.deepEqual(options, { cache: 'no-cache', mode: 'same-origin' });
    return Response.json({ commit });
  });
  assert.equal(stamp, commit);
});

test('An unbuilt local template, bad stamp, or unavailable response leaves diagnostics unstamped', async () => {
  const localTemplate = await readFile(new URL('../build-stamp.json', import.meta.url), 'utf8');
  assert.equal(await loadBuildStamp(async () => new Response(localTemplate)), null);
  assert.equal(await loadBuildStamp(async () => Response.json({ commit: 'old-build' })), null);
  assert.equal(await loadBuildStamp(async () => new Response('', { status: 404 })), null);
  assert.equal(await loadBuildStamp(async () => { throw new Error('offline'); }), null);
});
