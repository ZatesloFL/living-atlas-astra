import { MAX_ORIGINAL_BYTES, MAX_PREVIEW_BYTES, isMedia, mediaType, smallPreview } from './media.js';

export const ORIGIN = 'https://zateslofl.github.io';
const routes = new Set(['/list', '/upload', '/publish', '/delete', '/media']);
const corsHeaders = new Set(['authorization', 'content-type', 'x-atlas-upload']);
const dimensions = ['violence', 'sexual', 'language', 'disturbing', 'viewpoint', 'sensory'];
const idPattern = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/;
const placePattern = /^[a-zA-Z0-9][a-zA-Z0-9._-]*(?:\/[a-zA-Z0-9][a-zA-Z0-9._-]*)*$/;
const viewable = new Set(['uploaded', 'published']);
const databaseFaults = new Map([
  ['ALLOTMENT_EXCEEDED', 409], ['UPLOAD_NOT_FOUND', 404], ['UPLOAD_CONFLICT', 409],
  ['UPLOAD_STATE_CONFLICT', 409], ['UPLOAD_OBJECTS_INCOMPLETE', 503], ['UPLOAD_OBJECTS_REMAIN', 503],
  ['UPLOAD_INVALID', 400], ['SCORES_INVALID', 400],
  ['PHOTO_ASSESSMENT_REQUIRED', 409], ['PHOTO_ASSESSMENT_MISMATCH', 409], ['AUDIO_ASSESSMENT_UNAVAILABLE', 409],
]);

export class SourceFault extends Error {
  constructor(code, status) {
    super(code);
    this.status = status;
  }
}
const fail = (code, status = 400) => { throw new SourceFault(code, status); };

const exact = (value, keys) => !!value && typeof value === 'object' && !Array.isArray(value) &&
  Object.keys(value).length === keys.length && keys.every(key => Object.hasOwn(value, key));

export async function sha256(bytes) {
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(digest)].map(byte => byte.toString(16).padStart(2, '0')).join('');
}

export async function readBytes(body, limit, length) {
  if (!body) fail('BAD_REQUEST');
  const reader = body.getReader();
  const output = length === undefined ? null : new Uint8Array(length);
  const chunks = [];
  let total = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      const offset = total;
      total += value.byteLength;
      if (total > limit) fail('PAYLOAD_TOO_LARGE', 413);
      if (output) output.set(value, offset);
      else chunks.push(value);
    }
  } catch (error) {
    void reader.cancel().catch(() => {});
    throw error;
  } finally {
    reader.releaseLock();
  }
  if (output) {
    if (total !== output.length) fail('SIZE_MISMATCH');
    return output;
  }
  const result = new Uint8Array(total);
  let at = 0;
  for (const chunk of chunks) {
    result.set(chunk, at);
    at += chunk.length;
  }
  return result;
}

async function requestJSON(request, keys, optional = []) {
  if (!/^application\/json(?:\s*;|$)/i.test(request.headers.get('content-type') ?? '')) {
    fail('BAD_REQUEST');
  }
  const bytes = await readBytes(request.body, 4 * 1024);
  let body;
  try {
    body = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
  } catch {
    fail('BAD_REQUEST');
  }
  const provided = optional.filter(key => body != null && Object.hasOwn(body, key));
  if (!exact(body, [...keys, ...provided])) fail('BAD_REQUEST');
  if (keys.includes('id') && (typeof body.id !== 'string' || !idPattern.test(body.id))) fail('BAD_REQUEST');
  return body;
}

function readUploadMetadata(request) {
  const header = request.headers.get('x-atlas-upload') ?? '';
  if (header.length > 3000) fail('BAD_REQUEST');
  let metadata;
  try {
    metadata = JSON.parse(decodeURIComponent(header));
  } catch {
    fail('BAD_REQUEST');
  }
  const keys = ['id', 'placeId', 'filename', 'originalBytes', 'previewBytes'];
  if (!exact(metadata, keys) || typeof metadata.id !== 'string' || !idPattern.test(metadata.id) ||
      typeof metadata.placeId !== 'string' || metadata.placeId.length > 160 || !placePattern.test(metadata.placeId) ||
      typeof metadata.filename !== 'string' || !metadata.filename.trim() ||
      [...metadata.filename].length > 160 || /[\p{Cc}\p{Cf}/\\]/u.test(metadata.filename) ||
      !Number.isSafeInteger(metadata.originalBytes) || metadata.originalBytes < 1 ||
      !Number.isSafeInteger(metadata.previewBytes) || metadata.previewBytes < 0) fail('BAD_REQUEST');
  if (metadata.originalBytes > MAX_ORIGINAL_BYTES || metadata.previewBytes > MAX_PREVIEW_BYTES) {
    fail('PAYLOAD_TOO_LARGE', 413);
  }
  const headerType = request.headers.get('content-type') ?? '';
  if (/^video\//i.test(headerType)) fail('VIDEO_REFERENCE_REQUIRED', 415);
  const contentType = mediaType(headerType);
  if (!contentType) fail('BAD_MEDIA', 415);
  if (contentType.startsWith('image/') && !metadata.previewBytes) fail('IMAGE_PREVIEW_REQUIRED', 400);
  if (!contentType.startsWith('image/') && metadata.previewBytes) fail('BAD_MEDIA', 415);
  const size = metadata.originalBytes + metadata.previewBytes;
  const contentLength = request.headers.get('content-length');
  if (contentLength !== null && contentLength !== String(size)) fail('SIZE_MISMATCH');
  return { ...metadata, contentType, size };
}

function validScores(scores) {
  if (!exact(scores, dimensions)) return false;
  return dimensions.every(dimension => {
    const pair = scores[dimension];
    return exact(pair, ['amount', 'graphicness']) &&
      [pair.amount, pair.graphicness].every(dial => Number.isInteger(dial) && dial >= 0 && dial <= 3);
  });
}

function item(row) {
  if (!row) fail('UPLOAD_NOT_FOUND', 404);
  return {
    id: row.id,
    placeId: row.place_id,
    sourceId: row.source_id,
    filename: row.filename,
    contentType: row.content_type,
    sha256: row.content_sha256,
    originalBytes: Number(row.original_bytes),
    previewBytes: Number(row.preview_bytes),
    state: row.state,
    scores: row.scores ?? null,
    proposalProvenance: row.proposal_provenance ?? null,
    snapshotReceiptId: row.snapshot_receipt_id ?? null,
    declarationReceiptId: row.declaration_receipt_id ?? null,
    deleteReceiptId: row.delete_receipt_id ?? null,
    uploadedAt: row.uploaded_at ?? null,
  };
}

const usageOf = ({ allotmentBytes, usedBytes, reservedBytes }) => ({ allotmentBytes, usedBytes, reservedBytes });
const objectPath = (id, variant) => id + '/' + variant;

async function storeObject(storage, path, bytes, type, digest) {
  if (await storage.put(path, bytes, type)) return;
  // A previous request may have written the object before losing its connection.
  // A same-name object is reusable only when its bytes match this reservation.
  const prior = await storage.read(path, bytes.length);
  if (!prior || prior.length !== bytes.length || await sha256(prior) !== digest) {
    fail('UPLOAD_OBJECTS_INCOMPLETE', 503);
  }
}

async function publishUpload(store, owner, id, scores, proposalReceiptId) {
  const row = await store.find(owner, id);
  if (!row) fail('UPLOAD_NOT_FOUND', 404);
  if (row.state === 'published') {
    const provenance = row.proposal_provenance ?? null;
    if (proposalReceiptId && proposalReceiptId !== provenance?.receiptId) fail('UPLOAD_CONFLICT', 409);
    return store.publish(owner, id, scores, provenance);
  }
  if (row.state !== 'uploaded') fail('UPLOAD_STATE_CONFLICT', 409);
  if (row.content_type.startsWith('audio/')) fail('AUDIO_ASSESSMENT_UNAVAILABLE', 409);
  if (!row.content_type.startsWith('image/')) {
    if (proposalReceiptId) fail('BAD_REQUEST');
    return store.publish(owner, id, scores, null);
  }
  if (!proposalReceiptId) fail('PHOTO_ASSESSMENT_REQUIRED', 409);
  const provenance = await store.photoProvenance(owner, id, proposalReceiptId);
  if (!provenance) fail('PHOTO_ASSESSMENT_MISMATCH', 409);
  return store.publish(owner, id, scores, provenance);
}

export function createHandler({ store, storage, origin = ORIGIN }) {
  return async request => {
    const grantedOrigin = request.headers.get('origin') === origin;
    const headers = {
      'Cache-Control': 'private, no-store',
      'Vary': 'Origin',
      'X-Content-Type-Options': 'nosniff',
      ...(grantedOrigin ? {
        'Access-Control-Allow-Origin': origin,
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Access-Control-Allow-Headers': [...corsHeaders].join(', '),
      } : {}),
    };
    const json = (value, status = 200) => new Response(JSON.stringify(value), {
      status, headers: { ...headers, 'Content-Type': 'application/json' },
    });
    try {
      if (!grantedOrigin) fail('ORIGIN_DENIED', 403);
      const url = new URL(request.url);
      const path = url.pathname.replace(/^\/(?:functions\/v1\/)?atlas-sources(?=\/|$)/, '');
      if (!routes.has(path) || url.search) fail('NOT_FOUND', 404);
      if (request.method === 'OPTIONS') {
        const requested = (request.headers.get('access-control-request-headers') ?? '')
          .toLowerCase().split(',').map(header => header.trim()).filter(Boolean);
        if (request.headers.get('access-control-request-method') !== 'POST' ||
            requested.some(header => !corsHeaders.has(header))) fail('ORIGIN_DENIED', 403);
        return new Response(null, { status: 204, headers });
      }
      if (request.method !== 'POST') fail('METHOD_NOT_ALLOWED', 405);
      const bearer = request.headers.get('authorization') ?? '';
      if (!/^Bearer [a-f0-9]{64}$/.test(bearer)) fail('UNAUTHORIZED', 401);
      const credentialHash = await sha256(new TextEncoder().encode(bearer.slice(7)));
      const authorize = async () => {
        const owner = await store.authorize(credentialHash);
        if (!owner) fail('UNAUTHORIZED', 401);
        return owner;
      };
      const owner = await authorize();
      const withUpload = (id, act) => store.lockUpload(id, async () => {
        if (await authorize() !== owner) fail('UNAUTHORIZED', 401);
        return act();
      });
      const withUsage = async row => ({ item: item(row), usage: await store.usage(owner) });

      if (path === '/list') {
        await requestJSON(request, []);
        const [rows, metrics] = await Promise.all([store.list(owner), store.metrics(owner)]);
        return json({ items: rows.map(item), usage: usageOf(metrics), metrics });
      }

      if (path === '/upload') {
        const spec = readUploadMetadata(request);
        const bytes = await readBytes(request.body, spec.size, spec.size);
        const original = bytes.subarray(0, spec.originalBytes);
        const preview = bytes.subarray(spec.originalBytes);
        if (!isMedia(original, spec.contentType) || (preview.length && !smallPreview(preview))) fail('BAD_MEDIA', 415);
        const [contentSha256, previewSha256] = await Promise.all([
          sha256(original), preview.length ? sha256(preview) : null,
        ]);
        const upload = await withUpload(spec.id, async () => {
          const row = await store.reserve(owner, { ...spec, sourceId: 'upload-' + spec.id, contentSha256, previewSha256 });
          if (viewable.has(row.state)) return row;
          if (row.state !== 'reserved') fail('UPLOAD_STATE_CONFLICT', 409);
          await storeObject(storage, objectPath(row.id, 'original'), original, spec.contentType, contentSha256);
          if (preview.length) await storeObject(storage, objectPath(row.id, 'preview'), preview, 'image/jpeg', previewSha256);
          return store.finishUpload(owner, row.id);
        });
        return json(await withUsage(upload));
      }

      if (path === '/publish') {
        const { id, scores, proposalReceiptId } = await requestJSON(request, ['id', 'scores'], ['proposalReceiptId']);
        if (proposalReceiptId !== undefined && (typeof proposalReceiptId !== 'string' || !idPattern.test(proposalReceiptId))) {
          fail('BAD_REQUEST');
        }
        if (!validScores(scores)) fail('SCORES_INVALID');
        return json(await withUsage(await withUpload(id, () => publishUpload(store, owner, id, scores, proposalReceiptId))));
      }

      if (path === '/delete') {
        const { id } = await requestJSON(request, ['id']);
        const deleted = await withUpload(id, async () => {
          const row = await store.beginDelete(owner, id);
          if (row.state === 'deleted') return row;
          await storage.remove([objectPath(id, 'original'), objectPath(id, 'preview')]);
          return store.finishDelete(owner, id);
        });
        return json(await withUsage(deleted));
      }

      const { id, variant } = await requestJSON(request, ['id', 'variant']);
      if (variant !== 'preview' && variant !== 'original') fail('BAD_REQUEST');
      const media = await withUpload(id, async () => {
        const row = await store.find(owner, id);
        if (!row) fail('UPLOAD_NOT_FOUND', 404);
        if (!viewable.has(row.state)) fail('MEDIA_UNAVAILABLE', 404);
        const isPreview = variant === 'preview';
        const expected = Number(isPreview ? row.preview_bytes : row.original_bytes);
        if (!expected) fail('PREVIEW_UNAVAILABLE', 404);
        const body = await storage.read(objectPath(id, variant), expected);
        if (!body || body.length !== expected) fail('MEDIA_UNAVAILABLE', 404);
        await store.recordEgress(owner, id, variant, body.length);
        return { body, type: isPreview ? 'image/jpeg' : row.content_type };
      });
      return new Response(media.body, { headers: { ...headers, 'Content-Type': media.type } });
    } catch (error) {
      if (error instanceof SourceFault) return json({ code: error.message }, error.status);
      const status = databaseFaults.get(error instanceof Error ? error.message : '');
      if (status && (error.code === 'P0001' || error.code === 'P0002')) return json({ code: error.message }, status);
      return json({ code: 'SOURCE_STORAGE_UNAVAILABLE' }, 503);
    }
  };
}
