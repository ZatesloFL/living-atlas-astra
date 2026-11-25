import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import { mkdir, mkdtemp, readFile, rm } from 'node:fs/promises';
import { createServer } from 'node:net';
import { resolve } from 'node:path';
import test, { after, before } from 'node:test';
import EmbeddedPostgres from 'embedded-postgres';
import postgres from 'postgres';
import { GUIDE_SCHEMA, ORIGIN, digest } from '../supabase/functions/ai-proxy/core.js';
import { createHandler } from '../supabase/functions/ai-proxy/handler.js';
import { PHOTO_AGENT, PHOTO_MODEL, PHOTO_PURPOSE, PHOTO_SCHEMA } from '../supabase/functions/ai-proxy/photo.js';
import { catalog } from '../supabase/functions/ai-proxy/protocol.js';
import { Store } from '../supabase/functions/ai-proxy/store.js';

const migrations = await Promise.all([
  '20261113120000_atlas_ai.sql',
  '20261113204500_ai_failure_class.sql',
  '20261124180017_atlas_connected_sources.sql',
  '20261125051804_atlas_photo_proposals.sql'
].map(file => readFile(new URL('../supabase/migrations/' + file, import.meta.url), 'utf8')));
const original = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRr0AAAAASUVORK5CYII=', 'base64');
const preview = Buffer.from('independent preview fixture');
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const dimensions = ['violence', 'sexual', 'language', 'disturbing', 'viewpoint', 'sensory'];
const ratings = (amount, graphicness) => Object.fromEntries(dimensions.map(key => [key, { amount, graphicness }]));
const imageResult = {
  scores: { ...ratings(0, 0), viewpoint: { amount: 2, graphicness: 0 } },
  observation: 'The fixture shows sample visual evidence.',
  descriptionDisagrees: true
};
const usage = {
  input_tokens: 4950, output_tokens: 60, cache_read_input_tokens: 3,
  cache_creation_input_tokens: 5, output_tokens_details: { thinking_tokens: 0 }
};
const storageOrigin = 'https://fixture-storage.invalid';
const secret = name => ({
  ALLOWED_ORIGINS: ORIGIN, SUPABASE_URL: storageOrigin,
  SUPABASE_SERVICE_ROLE_KEY: 'fixture-storage-role', ANTHROPIC_API_KEY: 'fixture-anthropic-key'
})[name];
const ownerDescription = 'Owner description canary';
let cluster, sql, fixtureDir, store;

before(async () => {
  await mkdir('work', { recursive: true });
  fixtureDir = await mkdtemp(resolve('work/atlas-photo-proxy-'));
  const socket = createServer();
  await new Promise(done => socket.listen(0, '127.0.0.1', done));
  const { port } = socket.address();
  await new Promise(done => socket.close(done));
  cluster = new EmbeddedPostgres({
    databaseDir: fixtureDir + '/db', user: 'atlas_test', password: 'local-fixture', port, persistent: false,
    postgresFlags: ['-h', '127.0.0.1'], onLog: () => {}, onError: () => {}
  });
  await cluster.initialise();
  await cluster.start();
  sql = postgres({
    host: '127.0.0.1', port, user: 'atlas_test', password: 'local-fixture', database: 'postgres',
    max: 8, prepare: false, onnotice: () => {}
  });
  store = new Store(sql);
  await sql.unsafe(`
    CREATE ROLE anon;
    CREATE ROLE authenticated;
    CREATE SCHEMA storage;
    CREATE TABLE storage.buckets (
      id text PRIMARY KEY, name text NOT NULL, public boolean NOT NULL, file_size_limit bigint, allowed_mime_types text[]
    );
    CREATE TABLE storage.objects (
      bucket_id text REFERENCES storage.buckets(id), name text, metadata jsonb, PRIMARY KEY (bucket_id, name)
    );
    ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;
  `);
  for (const migration of migrations) await sql.unsafe(migration);
  const evidence = sql.json({
    api: 'anthropic-messages', input_tokens_per_byte: 1, overhead_tokens: 50,
    evidence_url: 'https://platform.claude.com/docs/en/about-claude/pricing', output_includes_reasoning: true
  });
  await sql`UPDATE atlas_ai.routing_config SET
      model_id=${PHOTO_MODEL}, model_verified_at=now(), pricing_source_url='https://platform.claude.com/docs/en/about-claude/pricing',
      input_microusd_per_million=100000, output_microusd_per_million=500000,
      cache_read_microusd_per_million=10000, cache_write_microusd_per_million=125000,
      billing_contract=${evidence}, enabled=true,
      output_token_cap=CASE WHEN route_key='guide' THEN 2048 ELSE output_token_cap END
    WHERE route_key IN ('guide','background')`;
  await sql`UPDATE atlas_ai.runtime_config SET enabled=true`;
});

after(async () => {
  await sql?.end();
  await cluster?.stop();
  if (fixtureDir) await rm(fixtureDir, { recursive: true, force: true });
});

function request(path, body, credential) {
  const headers = { Origin: ORIGIN, 'Content-Type': 'application/json' };
  if (credential) headers.Authorization = 'Bearer ' + credential;
  return new Request('https://fixture.invalid/functions/v1/ai-proxy' + path, {
    method: 'POST', headers, body: JSON.stringify(body)
  });
}

const handler = fetchImpl => createHandler({ store, getSecret: secret, fetchImpl });
const photoSpec = uploadId => ({
  requestId: randomUUID(), job: 'background', agentId: PHOTO_AGENT, schemaId: PHOTO_SCHEMA,
  context: { uploadId, description: ownerDescription }
});
const guideSpec = () => ({
  requestId: randomUUID(), job: 'guide', agentId: 'docent-silver', schemaId: GUIDE_SCHEMA,
  context: { placeId: 'boycott', catalogRevision: catalog.revision, visibleBlockIds: ['lead'],
    lens: { limits: ratings(1, 1), hard: ratings(2, 2), depth: 'Deep', trustFrom: 'Author',
      show: { real: true, pseudonym: true, anonymous: true, agents: true }, audience: 'teen' },
    question: 'What is this Place?' }
});

async function insertPhoto(ownerId) {
  const uploadId = randomUUID();
  await sql`SELECT atlas_sources.reserve_upload(${ownerId}, ${uploadId}::uuid, 'fixture/photo-space',
    ${'upload-' + uploadId}, 'synthetic.png', 'image/png', ${hash(original)}, ${original.length},
    ${preview.length}, ${hash(preview)})`;
  for (const [variant, bytes, mimetype] of [['original', original, 'image/png'], ['preview', preview, 'image/jpeg']]) {
    await sql`INSERT INTO storage.objects (bucket_id, name, metadata)
      VALUES ('atlas-user-uploads', ${uploadId + '/' + variant}, ${sql.json({ size: bytes.length, mimetype })})`;
  }
  await sql`SELECT atlas_sources.finish_upload(${ownerId}, ${uploadId}::uuid)`;
  return uploadId;
}

async function ownerWithPhoto(handle) {
  const response = await handle(request('/session', {}));
  assert.equal(response.status, 200);
  const guide = await response.json();
  const [holder] = await sql`SELECT id FROM atlas_ai.holder_leases WHERE token_sha256=${await digest(guide.holder)}`;
  const uploadId = await insertPhoto(holder.id);
  const authorized = await handle(request('/session', { holder: guide.holder, purpose: PHOTO_PURPOSE }));
  assert.equal(authorized.status, 200);
  const photo = await authorized.json();
  return { holderId: holder.id, guide: guide.session, photo: photo.session, uploadId };
}

function stub({ bytes = original, beforeReply = async () => {} } = {}) {
  const calls = { storage: [], provider: [] };
  const fetchImpl = async (input, options) => {
    const url = new URL(input);
    if (url.origin === storageOrigin) {
      calls.storage.push({ path: url.pathname, headers: options.headers });
      return new Response(bytes, { headers: { 'Content-Length': bytes.length } });
    }
    assert.equal(url.href, 'https://api.anthropic.com/v1/messages');
    calls.provider.push(JSON.parse(options.body));
    await beforeReply();
    return Response.json({ stop_reason: 'end_turn', usage,
      content: [{ type: 'text', text: JSON.stringify(imageResult) }] });
  };
  return { handle: handler(fetchImpl), calls };
}

const receiptFor = async receiptId => (await sql`SELECT * FROM atlas_ai.call_receipts WHERE id=${receiptId}`)[0];
const publicQuota = async () => (await sql`SELECT * FROM atlas_ai.quota_windows WHERE bucket='public' ORDER BY window_start DESC LIMIT 1`)[0];

test('Photo owner gets an original-image proposal on the existing background budget, with one charge across replay', async () => {
  const { handle, calls } = stub();
  const { holderId, photo, uploadId } = await ownerWithPhoto(handle);
  const spec = photoSpec(uploadId);
  const previousRoutes = await sql`SELECT * FROM atlas_ai.routing_config ORDER BY route_key`;
  const response = await handle(request('/request', spec, photo));
  const result = await response.json();
  assert.equal(response.status, 200, JSON.stringify(result));
  const model = 'anthropic/' + PHOTO_MODEL;
  const receiptId = result.receiptData.receiptId;
  assert.deepEqual(result, {
    proposal: { kind: 'upload-scores', basis: 'image', ...imageResult },
    model, agentId: PHOTO_AGENT,
    receiptData: { provider: 'anthropic', job: 'background', model, agentId: PHOTO_AGENT, result: 'proposed', receiptId }
  });
  assert.deepEqual(calls.storage.map(call => call.path), ['/storage/v1/object/authenticated/atlas-user-uploads/' + uploadId + '/original']);
  assert.equal(calls.storage[0].headers.Authorization, 'Bearer fixture-storage-role');
  const [sent] = calls.provider;
  assert.equal(sent.model, PHOTO_MODEL);
  assert.equal(sent.max_tokens, 1024);
  assert.deepEqual(sent.thinking, { type: 'disabled' });
  const content = sent.messages[0].content;
  const image = content.find(block => block.type === 'image');
  assert.deepEqual(image.source, { type: 'base64', media_type: 'image/png', data: original.toString('base64') });
  assert.notEqual(image.source.data, preview.toString('base64'));
  assert.match(content.find(block => block.type === 'text').text, /Owner description canary/);
  assert.doesNotMatch(JSON.stringify(sent), /synthetic\.png|fixture\/photo-space/);
  assert.deepEqual(await sql`SELECT * FROM atlas_ai.routing_config ORDER BY route_key`, previousRoutes);
  const [meter] = await sql`SELECT served_bytes FROM atlas_sources.egress_totals WHERE owner_id=${holderId}`;
  assert.equal(Number(meter.served_bytes), original.length);

  const [lease] = await sql`SELECT * FROM atlas_ai.call_leases WHERE id=${receiptId}`;
  assert.equal(lease.route_key, 'background');
  assert.equal(lease.accounting.route.input_token_cap, 6000);
  assert.ok(lease.accounting.inputBound <= 6000);
  assert.ok(lease.accounting.inputBound >= usage.input_tokens + usage.cache_read_input_tokens + usage.cache_creation_input_tokens);
  assert.equal(lease.state, 'completed');
  const receipt = await receiptFor(receiptId);
  assert.equal(receipt.result, 'accepted');
  assert.equal(receipt.cost_basis, 'measured');
  assert.equal(Number(receipt.cost_microusd), 526);
  assert.deepEqual([receipt.input_tokens, receipt.output_tokens, receipt.cache_read_tokens, receipt.cache_write_tokens, receipt.reasoning_tokens],
    [4950, 60, 3, 5, 0]);
  assert.equal(receipt.failure_class, null);
  const quota = await publicQuota();
  assert.equal(quota.calls_used, 1);
  assert.equal(Number(quota.reserved_microusd), 0);
  assert.equal(Number(quota.spent_microusd), Number(receipt.cost_microusd));
  const [holderQuota] = await sql`SELECT * FROM atlas_ai.quota_windows WHERE bucket=${'holder:' + holderId}`;
  assert.equal(holderQuota.calls_used, 1);
  assert.equal(Number(holderQuota.spent_microusd), 526);
  assert.doesNotMatch(JSON.stringify({ lease, receipt }), /Owner description canary|fixture shows sample|iVBORw0KGgo/);

  for (const replay of [spec, { ...spec, requestId: randomUUID() }]) {
    const replayed = await handle(request('/request', replay, photo));
    assert.equal(replayed.status, 200);
    assert.deepEqual(await replayed.json(), { ...result, receiptData: { ...result.receiptData, cached: true } });
  }
  assert.equal(calls.provider.length, 1);
  assert.equal(calls.storage.length, 1);
  assert.deepEqual(await publicQuota(), quota);
  const [stored] = await sql`SELECT * FROM atlas_sources.get_photo_proposal(${holderId}, ${uploadId}::uuid)`;
  assert.equal(stored.content_sha256, hash(original));
  assert.equal(stored.receipt_id, receiptId);
  assert.deepEqual(stored.proposal, result.proposal);

  const [provenance] = await sql`SELECT atlas_sources.photo_provenance(${holderId}, ${uploadId}::uuid, ${receiptId}::uuid) AS value`;
  assert.deepEqual(provenance.value, { provider: 'anthropic', model, receiptId, basis: 'image', route: 'background' });
  const different = await insertPhoto(holderId);
  await assert.rejects(sql`SELECT atlas_sources.publish_upload(${holderId}, ${different}::uuid,
    ${sql.json(imageResult.scores)}, ${sql.json(provenance.value)})`, /PHOTO_ASSESSMENT_MISMATCH/);
  const [published] = await sql`SELECT u.* FROM atlas_sources.publish_upload(${holderId}, ${uploadId}::uuid,
    ${sql.json(imageResult.scores)}, ${sql.json(provenance.value)}) u`;
  assert.equal(published.state, 'published');
  assert.deepEqual(published.proposal_provenance, provenance.value);
});

test('Photo request admission requires the holder who uploaded it and the dedicated purpose grant', async () => {
  const { handle, calls } = stub();
  const owner = await ownerWithPhoto(handle);
  const stranger = await ownerWithPhoto(handle);
  const spec = photoSpec(owner.uploadId);
  const quota = await publicQuota();
  const cases = [
    [request('/session', { purpose: PHOTO_PURPOSE }), 401, 'UNAUTHORIZED'],
    [request('/request', spec, stranger.photo), 404, 'PHOTO_UNAVAILABLE'],
    [request('/request', spec, owner.guide), 403, 'OUT_OF_SCOPE'],
    [request('/request', guideSpec(), owner.photo), 403, 'OUT_OF_SCOPE'],
    [request('/request', { ...spec, context: { ...spec.context, url: 'https://forged.invalid' } }, owner.photo), 400, 'BAD_REQUEST']
  ];
  for (const [attempt, status, code] of cases) {
    const response = await handle(attempt);
    assert.equal(response.status, status);
    assert.equal((await response.json()).code, code);
  }
  assert.deepEqual(await publicQuota(), quota);
  assert.deepEqual(calls, { storage: [], provider: [] });
});

test('A mismatched Storage original is refused before forwarding any image or charging provider spend', async () => {
  const bytes = Buffer.from(original);
  bytes[bytes.length - 5] ^= 1;
  const { handle, calls } = stub({ bytes });
  const { photo, uploadId } = await ownerWithPhoto(handle);
  const prior = await publicQuota();
  const response = await handle(request('/request', photoSpec(uploadId), photo));
  const result = await response.json();
  assert.equal(response.status, 503);
  assert.equal(result.code, 'PHOTO_UNAVAILABLE');
  assert.equal(calls.storage.length, 1);
  assert.equal(calls.provider.length, 0);
  const receipt = await receiptFor(result.receiptId);
  assert.equal(receipt.cost_basis, 'not-dispatched');
  assert.equal(receipt.result, 'rejected');
  assert.equal(receipt.failure_class, 'dispatch_recheck_failed');
  assert.equal(Number(receipt.cost_microusd), 0);
  const quota = await publicQuota();
  assert.equal(Number(quota.spent_microusd), Number(prior?.spent_microusd ?? 0));
  assert.equal(Number(quota.reserved_microusd), 0);
});

test('Exhausted public budget refuses a photo before reading private Storage or dispatching generation', async () => {
  const { handle, calls } = stub();
  const { photo, uploadId } = await ownerWithPhoto(handle);
  const prior = await publicQuota();
  const [config] = await sql`SELECT public_day_microusd FROM atlas_ai.runtime_config`;
  try {
    await sql`UPDATE atlas_ai.runtime_config SET public_day_microusd=0`;
    const response = await handle(request('/request', photoSpec(uploadId), photo));
    assert.equal(response.status, 429);
    assert.equal((await response.json()).code, 'RATE_LIMITED');
    assert.deepEqual(await publicQuota(), prior);
    assert.deepEqual(calls, { storage: [], provider: [] });
  } finally {
    await sql`UPDATE atlas_ai.runtime_config SET public_day_microusd=${config.public_day_microusd}`;
  }
});

test('Deletion during provider work keeps the measured cost Receipt and prevents saving the proposal', async () => {
  let owner;
  const { handle, calls } = stub({ beforeReply: async () => {
    await sql`SELECT atlas_sources.begin_delete(${owner.holderId}, ${owner.uploadId}::uuid)`;
  } });
  owner = await ownerWithPhoto(handle);
  const response = await handle(request('/request', photoSpec(owner.uploadId), owner.photo));
  const result = await response.json();
  assert.equal(response.status, 502);
  assert.equal(result.code, 'BAD_PROPOSAL');
  assert.equal(result.failureClass, 'result_recheck_failed');
  assert.equal(calls.provider.length, 1);
  const receipt = await receiptFor(result.receiptId);
  assert.equal(receipt.result, 'rejected');
  assert.equal(receipt.cost_basis, 'measured');
  assert.equal(Number(receipt.cost_microusd), 526);
  assert.equal((await sql`SELECT * FROM atlas_sources.photo_proposals WHERE upload_id=${owner.uploadId}`).length, 0);
});
