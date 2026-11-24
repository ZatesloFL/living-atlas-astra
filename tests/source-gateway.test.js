import test from 'node:test';
import assert from 'node:assert/strict';
import { createHandler, ORIGIN, sha256 } from '../supabase/functions/atlas-sources/handler.js';
import { Storage } from '../supabase/functions/atlas-sources/storage.js';

const ownerToken = 'a'.repeat(64), strangerToken = 'b'.repeat(64);
const id = '11111111-1111-4111-8111-111111111111';
const endpoint = 'https://atlas.invalid/functions/v1/atlas-sources';
const jpeg = Buffer.from('/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAMCAgICAgMCAgIDAwMDBAYEBAQEBAgGBgUGCQgKCgkICQkKDA8MCgsOCwkJDRENDg8QEBEQCgwSExIQEw8QEBD/2wBDAQMDAwQDBAgEBAgQCwkLEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBD/wAARCAAGAAYDAREAAhEBAxEB/8QAFAABAAAAAAAAAAAAAAAAAAAAB//EABQQAQAAAAAAAAAAAAAAAAAAAAD/xAAVAQEBAAAAAAAAAAAAAAAAAAAGCP/EABQRAQAAAAAAAAAAAAAAAAAAAAD/2gAMAwEAAhEDEQA/ABo7So//2Q==', 'base64');
const scores = Object.fromEntries(['violence', 'sexual', 'language', 'disturbing', 'viewpoint', 'sensory']
  .map(key => [key, { amount: key === 'sensory' ? 1 : 0, graphicness: 0 }]));
const encoded = text => new TextEncoder().encode(text);

function databaseError(message, code = 'P0001') {
  return Object.assign(new Error(message), { code });
}

async function fixture({ allotmentBytes = 1000000000 } = {}) {
  const holders = new Map([
    [await sha256(encoded(ownerToken)), 'owner'], [await sha256(encoded(strangerToken)), 'stranger'],
  ]);
  const rows = new Map(), blobs = new Map(), egress = [];
  const counters = { writes: 0, reservations: 0, reads: 0 };
  const settings = { failPreview: false };
  const find = (owner, id) => {
    const row = rows.get(id);
    return row?.owner_id === owner ? row : null;
  };
  const known = (owner, id) => {
    const row = find(owner, id);
    if (!row) throw databaseError('UPLOAD_NOT_FOUND', 'P0002');
    return row;
  };
  const ownerRows = owner => [...rows.values()].filter(row => row.owner_id === owner);
  const usage = owner => {
    const result = { allotmentBytes, usedBytes: 0, reservedBytes: 0 };
    for (const row of ownerRows(owner)) {
      if (row.state === 'reserved') result.reservedBytes += row.original_bytes + row.preview_bytes;
      else if (row.state !== 'deleted') result.usedBytes += row.original_bytes + row.preview_bytes;
    }
    return result;
  };
  const store = {
    authorize: hash => holders.get(hash), lockUpload: (id, run) => run(),
    list: ownerRows, find, usage,
    metrics: owner => ({ ...usage(owner), served: egress.filter(row => row.owner === owner).map(({ owner, ...row }) => row) }),
    reserve(owner, data) {
      counters.reservations++;
      const existing = rows.get(data.id);
      if (existing) {
        if (existing.owner_id !== owner || existing.content_sha256 !== data.contentSha256 ||
            existing.preview_sha256 !== data.previewSha256) throw databaseError('UPLOAD_CONFLICT');
        return existing;
      }
      const account = usage(owner), total = data.originalBytes + data.previewBytes;
      if (account.usedBytes + account.reservedBytes + total > account.allotmentBytes) throw databaseError('ALLOTMENT_EXCEEDED');
      const row = {
        id: data.id, owner_id: owner, place_id: data.placeId, source_id: data.sourceId, filename: data.filename,
        content_type: data.contentType, content_sha256: data.contentSha256, preview_sha256: data.previewSha256,
        original_bytes: data.originalBytes, preview_bytes: data.previewBytes, state: 'reserved',
      };
      rows.set(row.id, row);
      return row;
    },
    finishUpload(owner, id) {
      return Object.assign(known(owner, id), { state: 'uploaded', snapshot_receipt_id: 'receipt-upload', uploaded_at: '2026-11-24' });
    },
    publish(owner, id, scores) {
      const row = known(owner, id);
      if (row.state !== 'uploaded' && row.state !== 'published') throw databaseError('UPLOAD_STATE_CONFLICT');
      return Object.assign(row, { state: 'published', scores, declaration_receipt_id: 'receipt-declare' });
    },
    beginDelete(owner, id) {
      const row = known(owner, id);
      if (row.state !== 'deleted') row.state = 'deleting';
      return row;
    },
    finishDelete(owner, id) {
      return Object.assign(known(owner, id), { state: 'deleted', delete_receipt_id: 'receipt-delete' });
    },
    recordEgress(owner, id, variant, servedBytes) {
      const row = known(owner, id);
      const existing = egress.find(item => item.sourceId === row.source_id);
      if (existing) existing.servedBytes += servedBytes;
      else egress.push({ owner, placeId: row.place_id, sourceId: row.source_id, servedBytes });
    },
  };
  const storage = {
    put(path, bytes) {
      counters.writes++;
      if (settings.failPreview && path.endsWith('/preview')) throw new Error('Interrupted transfer');
      if (blobs.has(path)) return false;
      blobs.set(path, Uint8Array.from(bytes));
      return true;
    },
    read(path) {
      counters.reads++;
      return blobs.get(path) ?? null;
    },
    remove(paths) {
      for (const path of paths) blobs.delete(path);
    },
  };
  return { handler: createHandler({ store, storage }), counters, settings, rows, blobs };
}

const authHeaders = (token = ownerToken, origin = ORIGIN) => ({ Origin: origin, Authorization: 'Bearer ' + token });
const call = (handle, path, body, token) => handle(new Request(endpoint + path, {
  method: 'POST', body: JSON.stringify(body), headers: { ...authHeaders(token), 'Content-Type': 'application/json' },
}));
const put = (handle, original, type, preview = new Uint8Array(), changes = {}, headers = {}) => handle(new Request(endpoint + '/upload', {
  method: 'POST', body: new Blob([original, preview]),
  headers: {
    ...authHeaders(),
    'Content-Type': type,
    'X-Atlas-Upload': encodeURIComponent(JSON.stringify({
      id, placeId: 'home/local/drive', filename: 'Example · uploaded copy', originalBytes: original.length,
      previewBytes: preview.length, ...changes,
    })),
    ...headers,
  },
}));

test('stages, confirms, meters and deletes the same private immutable upload', async () => {
  const { handler, counters, blobs } = await fixture();
  const original = encoded('Synthetic archive note');
  const staged = await (await put(handler, original, 'text/plain')).json();
  assert.equal(staged.item.state, 'uploaded');
  assert.equal(staged.item.sha256, await sha256(original));
  assert.equal(staged.item.snapshotReceiptId, 'receipt-upload');
  assert.equal(staged.usage.usedBytes, original.length);
  assert.equal((await call(handler, '/publish', { id, scores: {} })).status, 400);

  const declared = await (await call(handler, '/publish', { id, scores })).json();
  assert.equal(declared.item.state, 'published');
  assert.equal(declared.item.declarationReceiptId, 'receipt-declare');
  assert.deepEqual(declared.item.scores, scores);
  await put(handler, original, 'text/plain');
  assert.equal(counters.writes, 1);

  const media = await call(handler, '/media', { id, variant: 'original' });
  assert.equal(media.headers.get('content-type'), 'text/plain');
  assert.equal(media.headers.get('cache-control'), 'private, no-store');
  assert.deepEqual(new Uint8Array(await media.arrayBuffer()), original);
  const listing = await (await call(handler, '/list', {})).json();
  assert.deepEqual(listing.metrics.served, [{ placeId: 'home/local/drive', sourceId: 'upload-' + id, servedBytes: original.length }]);
  assert.equal((await call(handler, '/media', { id, variant: 'preview' })).status, 404);
  const other = await (await call(handler, '/list', {}, strangerToken)).json();
  assert.deepEqual(other.items, []);
  assert.deepEqual(other.metrics.served, []);
  for (const [route, body] of [['/media', { id, variant: 'original' }], ['/publish', { id, scores }], ['/delete', { id }]]) {
    assert.equal((await call(handler, route, body, strangerToken)).status, 404);
  }
  const deleted = await (await call(handler, '/delete', { id })).json();
  assert.equal(deleted.item.state, 'deleted');
  assert.equal(deleted.item.deleteReceiptId, 'receipt-delete');
  assert.equal(deleted.usage.usedBytes, 0);
  assert.equal(blobs.size, 0);
  assert.equal((await call(handler, '/media', { id, variant: 'original' })).status, 404);
});

test('keeps partial image bytes reserved and resumes immutable variants on retry', async () => {
  const tiny = await fixture({ allotmentBytes: 2 * jpeg.length - 1 });
  const over = await put(tiny.handler, jpeg, 'image/jpeg', jpeg);
  assert.equal((await over.json()).code, 'ALLOTMENT_EXCEEDED');
  assert.equal(tiny.counters.writes, 0);

  const { handler, counters, settings, blobs } = await fixture();
  settings.failPreview = true;
  assert.equal((await put(handler, jpeg, 'image/jpeg', jpeg)).status, 503);
  const pending = await (await call(handler, '/list', {})).json();
  assert.equal(pending.items[0].state, 'reserved');
  assert.equal(pending.usage.reservedBytes, 2 * jpeg.length);
  assert.equal(blobs.size, 1);
  settings.failPreview = false;
  const retried = await (await put(handler, jpeg, 'image/jpeg', jpeg)).json();
  assert.equal(retried.item.state, 'uploaded');
  assert.equal(retried.usage.usedBytes, 2 * jpeg.length);
  assert.equal(retried.usage.reservedBytes, 0);
  assert.equal(counters.reads, 1);

  const preview = await call(handler, '/media', { id, variant: 'preview' });
  assert.equal(preview.headers.get('content-type'), 'image/jpeg');
  assert.equal((await preview.arrayBuffer()).byteLength, jpeg.length);
  const listing = await (await call(handler, '/list', {})).json();
  assert.equal(listing.metrics.served[0].servedBytes, jpeg.length);
});

test('rejects video and disguised video before reservation, including a video track in an audio container', async () => {
  const { handler, counters } = await fixture();
  const box = (name, ...payload) => {
    const head = Buffer.alloc(8);
    head.writeUInt32BE(8 + payload.reduce((n, item) => n + item.length, 0));
    head.write(name, 4, 'ascii');
    return Buffer.concat([head, ...payload]);
  };
  const track = handler => box('trak', box('mdia', box('hdlr', Buffer.alloc(8), Buffer.from(handler))));
  const movie = (...tracks) => Buffer.concat([box('ftyp', Buffer.alloc(8)), box('moov', ...tracks), box('mdat', Buffer.from([1]))]);
  const disguised = movie(track('soun'), track('vide'));
  assert.equal((await (await put(handler, disguised, 'video/mp4')).json()).code, 'VIDEO_REFERENCE_REQUIRED');
  assert.equal((await (await put(handler, disguised, 'audio/mp4')).json()).code, 'BAD_MEDIA');
  assert.equal((await (await put(handler, disguised, 'text/plain')).json()).code, 'BAD_MEDIA');
  assert.equal(counters.reservations, 0);
  const audio = await put(handler, movie(track('soun')), 'audio/x-m4a');
  assert.equal((await audio.json()).item.contentType, 'audio/mp4');
});

test('authorizes before handling uploads and keeps malformed byte counts out of Storage', async () => {
  const { handler, counters } = await fixture();
  const original = encoded('note');
  assert.equal((await put(handler, original, 'text/plain', undefined, {}, { Origin: 'https://unrelated.invalid' })).status, 403);
  assert.equal((await put(handler, original, 'text/plain', undefined, {}, { Authorization: 'Bearer ' + 'e'.repeat(64) })).status, 401);
  assert.equal((await put(handler, original, 'text/plain', undefined, { originalBytes: 2 })).status, 413);
  assert.equal((await put(handler, original, 'text/plain', undefined, { originalBytes: 12 })).status, 400);
  assert.equal(counters.reservations, 0);
  const preflight = await handler(new Request(endpoint + '/upload', {
    method: 'OPTIONS', headers: {
      Origin: ORIGIN, 'Access-Control-Request-Method': 'POST',
      'Access-Control-Request-Headers': 'authorization,content-type,x-atlas-upload',
    },
  }));
  assert.equal(preflight.status, 204);
  assert.equal(preflight.headers.get('access-control-allow-origin'), ORIGIN);
});

test('Storage transport uses authenticated object fetch, immutable PUT, and exact deletion keys', async () => {
  const calls = [];
  const storage = new Storage({ url: 'https://project.invalid', role: 'synthetic-fixture-role', fetcher: async (url, options) => {
    calls.push({ url, options });
    if (options.method === 'POST') return new Response(JSON.stringify({ Key: 'fixture' }), { status: 200 });
    if (options.method === 'DELETE') return new Response('[]', { status: 200 });
    return new Response('note');
  } });
  const path = id + '/original';
  assert.equal(await storage.put(path, encoded('note'), 'text/plain'), true);
  assert.deepEqual(await storage.read(path, 4), encoded('note'));
  await storage.remove([path]);
  assert.equal(calls[0].options.headers['x-upsert'], 'false');
  assert.match(calls[1].url, /\/object\/authenticated\/atlas-user-uploads\//);
  assert.deepEqual(JSON.parse(calls[2].options.body), { prefixes: [path] });
});
