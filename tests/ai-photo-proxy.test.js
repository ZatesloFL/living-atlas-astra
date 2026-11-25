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
import { UPLOAD_REVIEW_PURPOSE, AUDIO_TRANSCRIPT_SCHEMA, AUDIO_SCORES_SCHEMA, TRANSCRIPTION_MODEL,
  pcmDurationMs } from '../supabase/functions/ai-proxy/audio.js';
import { catalog } from '../supabase/functions/ai-proxy/protocol.js';
import { Store } from '../supabase/functions/ai-proxy/store.js';

const migrations = await Promise.all([
  '20261113120000_atlas_ai.sql',
  '20261113204500_ai_failure_class.sql',
  '20261124180017_atlas_connected_sources.sql',
  '20261125051804_atlas_photo_proposals.sql',
  '20261125143000_atlas_audio_review.sql'
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
  SUPABASE_SERVICE_ROLE_KEY: 'fixture-storage-role', ANTHROPIC_API_KEY: 'fixture-anthropic-key',
  OPENAI_API_KEY: 'fixture-openai-key'
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
  return { holderId: holder.id, holder: guide.holder, guide: guide.session, photo: photo.session, uploadId };
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

function pcmWave(seconds) {
  const sampleBytes = seconds * 16000 * 2;
  const wave = Buffer.alloc(44 + sampleBytes);
  wave.write('RIFF');
  wave.writeUInt32LE(wave.length - 8, 4);
  wave.write('WAVEfmt ', 8);
  wave.writeUInt32LE(16, 16);
  wave.writeUInt16LE(1, 20);
  wave.writeUInt16LE(1, 22);
  wave.writeUInt32LE(16000, 24);
  wave.writeUInt32LE(32000, 28);
  wave.writeUInt16LE(2, 32);
  wave.writeUInt16LE(16, 34);
  wave.write('data', 36);
  wave.writeUInt32LE(sampleBytes, 40);
  return wave;
}

const audioSpec = (uploadId, schemaId, description = ownerDescription) => ({
  requestId: randomUUID(), job: 'background', agentId: PHOTO_AGENT, schemaId,
  context: schemaId === AUDIO_TRANSCRIPT_SCHEMA ? { uploadId } : { uploadId, description },
});

async function insertAudio(ownerId, wave, type = 'audio/wav') {
  const uploadId = randomUUID();
  await sql`SELECT atlas_sources.reserve_upload(${ownerId}, ${uploadId}::uuid, 'fixture/audio-space',
    ${'upload-' + uploadId}, 'synthetic.wav', ${type}, ${hash(wave)}, ${wave.length})`;
  await sql`INSERT INTO storage.objects (bucket_id, name, metadata)
    VALUES ('atlas-user-uploads', ${uploadId + '/original'}, ${sql.json({ size: wave.length, mimetype: type })})`;
  await sql`SELECT atlas_sources.finish_upload(${ownerId}, ${uploadId}::uuid)`;
  return uploadId;
}

async function reviewFor(handle, holder) {
  const review = await handle(request('/session', { holder, purpose: UPLOAD_REVIEW_PURPOSE }));
  assert.equal(review.status, 200, await review.clone().text());
  return (await review.json()).session;
}

async function ownerWithAudio(handle, wave, type) {
  const response = await handle(request('/session', {}));
  assert.equal(response.status, 200, await response.clone().text());
  const guide = await response.json();
  const [holder] = await sql`SELECT id FROM atlas_ai.holder_leases WHERE token_sha256=${await digest(guide.holder)}`;
  const uploadId = await insertAudio(holder.id, wave, type);
  const review = await reviewFor(handle, guide.holder);
  return { holderId: holder.id, guide: guide.session, review, uploadId };
}

const speech = 'Synthetic transcript canary: People protest a proposed bus schedule.';
const audioOutcome = {
  scores: { ...ratings(0, 0), viewpoint: { amount: 2, graphicness: 0 } },
  observation: 'The spoken words discuss a public protest.', descriptionDisagrees: true,
};
const transcribedModel = 'openai/' + TRANSCRIPTION_MODEL;
const assessedModel = 'anthropic/' + PHOTO_MODEL;

function audioStub(wave, { transcript = speech, transcriptionUsage = { type: 'duration', seconds: 2 } } = {}) {
  const calls = { storage: [], transcription: [], assessment: [] };
  const fetchImpl = async (input, options) => {
    const url = new URL(input);
    if (url.origin === storageOrigin) {
      calls.storage.push(url.pathname);
      return new Response(wave, { headers: { 'Content-Length': wave.length } });
    }
    if (url.href === 'https://api.openai.com/v1/audio/transcriptions') {
      assert.equal(options.headers.Authorization, 'Bearer fixture-openai-key');
      const file = options.body.get('file');
      assert.equal(file.name, 'recording.wav');
      assert.equal(file.type, 'audio/wav');
      assert.deepEqual(Buffer.from(await file.arrayBuffer()), wave);
      assert.equal(options.body.get('model'), TRANSCRIPTION_MODEL);
      assert.equal(options.body.get('response_format'), 'json');
      calls.transcription.push(url.href);
      return Response.json({ text: transcript, usage: transcriptionUsage });
    }
    assert.equal(url.href, 'https://api.anthropic.com/v1/messages');
    calls.assessment.push(JSON.parse(options.body));
    return Response.json({ stop_reason: 'end_turn', usage: { input_tokens: 250, output_tokens: 60 },
      content: [{ type: 'text', text: JSON.stringify(audioOutcome) }] });
  };
  return { handle: handler(fetchImpl), calls };
}

test('Audio review uses verified bytes and pays each provider once across proposal and transcription replays', async () => {
  const wave = pcmWave(2);
  assert.equal(pcmDurationMs(wave), 2000);
  const { handle, calls } = audioStub(wave);
  const owner = await ownerWithAudio(handle, wave);
  const before = await publicQuota();
  const routes = await sql`SELECT * FROM atlas_ai.routing_config ORDER BY route_key`;
  const transcription = audioSpec(owner.uploadId, AUDIO_TRANSCRIPT_SCHEMA);
  const assessment = audioSpec(owner.uploadId, AUDIO_SCORES_SCHEMA);
  const wait = await handle(request('/request', assessment, owner.review));
  assert.equal(wait.status, 409);
  assert.equal((await wait.json()).code, 'TRANSCRIPT_UNAVAILABLE');

  const transcriptResponse = await handle(request('/request', transcription, owner.review));
  const transcript = await transcriptResponse.json();
  assert.equal(transcriptResponse.status, 200, JSON.stringify(transcript));
  assert.equal(transcript.model, transcribedModel);
  assert.equal(transcript.receiptData.result, 'transcribed');
  assert.equal(transcript.receiptData.receiptId, transcript.transcriptionReceiptId);
  assert.equal(transcript.receiptData.audioDurationMs, 2000);
  assert.doesNotMatch(JSON.stringify(transcript), /Synthetic transcript canary/);
  const first = await receiptFor(transcript.transcriptionReceiptId);
  assert.equal(first.result, 'accepted');
  assert.equal(first.cost_basis, 'measured');
  assert.equal(Number(first.audio_duration_ms), 2000);
  assert.equal(Number(first.cost_microusd), 150);
  assert.equal(first.input_tokens, null);
  const [privateText] = await sql`SELECT transcript FROM atlas_sources.audio_transcripts WHERE upload_id=${owner.uploadId}`;
  assert.equal(privateText.transcript, speech);

  const scoreResponse = await handle(request('/request', assessment, owner.review));
  const result = await scoreResponse.json();
  assert.equal(scoreResponse.status, 200, JSON.stringify(result));
  assert.equal(result.model, assessedModel);
  assert.equal(result.receiptData.transcriptionReceiptId, transcript.transcriptionReceiptId);
  assert.deepEqual(result.proposal, { kind: 'upload-scores', basis: 'audio-transcript', ...audioOutcome });
  const second = await receiptFor(result.receiptData.receiptId);
  assert.equal(second.result, 'accepted');
  assert.equal(second.audio_duration_ms, null);
  assert.equal(second.cost_basis, 'measured');
  assert.equal(Number(second.cost_microusd), 55);
  const [erased] = await sql`SELECT transcript FROM atlas_sources.audio_transcripts WHERE upload_id=${owner.uploadId}`;
  assert.equal(erased.transcript, null);
  assert.match(calls.assessment[0].messages[0].content, /Synthetic transcript canary/);
  assert.match(calls.assessment[0].messages[0].content, /Owner description for comparison only/);
  assert.equal(calls.assessment[0].max_tokens, 1024);
  assert.deepEqual(calls.assessment[0].thinking, { type: 'disabled' });

  const after = await publicQuota();
  assert.equal(after.calls_used - before.calls_used, 2);
  assert.equal(Number(after.spent_microusd) - Number(before.spent_microusd), 205);
  assert.equal(Number(after.reserved_microusd), 0);
  const [openaiSpend] = await sql`SELECT spent_microusd FROM atlas_ai.quota_windows WHERE bucket='provider:openai'`;
  assert.ok(Number(openaiSpend.spent_microusd) >= 150);
  const [holder] = await sql`SELECT calls_used, spent_microusd FROM atlas_ai.quota_windows WHERE bucket=${'holder:' + owner.holderId}`;
  assert.equal(holder.calls_used, 2);
  assert.equal(Number(holder.spent_microusd), 205);
  const [meter] = await sql`SELECT served_bytes FROM atlas_sources.egress_totals WHERE owner_id=${owner.holderId}`;
  assert.equal(Number(meter.served_bytes), wave.length);
  assert.deepEqual(await sql`SELECT * FROM atlas_ai.routing_config ORDER BY route_key`, routes);

  const reopenedTranscript = await (await handle(request('/request', { ...transcription, requestId: randomUUID() }, owner.review))).json();
  assert.equal(reopenedTranscript.transcriptionReceiptId, transcript.transcriptionReceiptId);
  assert.equal(reopenedTranscript.receiptData.cached, true);
  const reopenedProposal = await (await handle(request('/request', { ...assessment, requestId: randomUUID() }, owner.review))).json();
  assert.deepEqual(reopenedProposal, { ...result, receiptData: { ...result.receiptData, cached: true } });
  assert.equal(calls.storage.length, 1);
  assert.equal(calls.transcription.length, 1);
  assert.equal(calls.assessment.length, 1);
  assert.deepEqual(await publicQuota(), after);
  const leases = await sql`SELECT accounting FROM atlas_ai.call_leases WHERE id IN
   (${transcript.transcriptionReceiptId}::uuid,${result.receiptData.receiptId}::uuid)`;
  assert.doesNotMatch(JSON.stringify({ first, second, leases }), /Synthetic transcript canary|Owner description canary/);
});

test('An upload-review lease upgrades only the idle old photo lease and still assesses photos', async () => {
  const { handle, calls } = stub();
  const owner = await ownerWithPhoto(handle);
  const wave = pcmWave(2);
  const audioId = await insertAudio(owner.holderId, wave);
  const rejected = await handle(request('/request', audioSpec(audioId, AUDIO_TRANSCRIPT_SCHEMA), owner.photo));
  assert.equal(rejected.status, 403);
  const review = await reviewFor(handle, owner.holder);
  const [oldPhoto] = await sql`SELECT revoked_at FROM atlas_ai.session_leases WHERE token_sha256=${await digest(owner.photo)}`;
  const [guide] = await sql`SELECT revoked_at FROM atlas_ai.session_leases WHERE token_sha256=${await digest(owner.guide)}`;
  assert.ok(oldPhoto.revoked_at);
  assert.equal(guide.revoked_at, null);
  const response = await handle(request('/request', photoSpec(owner.uploadId), review));
  assert.equal(response.status, 200, await response.clone().text());
  assert.equal((await response.json()).proposal.basis, 'image');
  assert.equal(calls.provider.length, 1);
});

test('Audio admission validates ownership and the bounded PCM original before any transcription dispatch', async () => {
  const wave = pcmWave(31);
  const { handle, calls } = audioStub(wave);
  const owner = await ownerWithAudio(handle, wave);
  const foreign = await ownerWithAudio(handle, wave);
  const wrongOwner = await handle(request('/request', audioSpec(owner.uploadId, AUDIO_TRANSCRIPT_SCHEMA), foreign.review));
  assert.equal(wrongOwner.status, 404);
  assert.equal((await wrongOwner.json()).code, 'AUDIO_UNAVAILABLE');
  const unsupportedId = await insertAudio(owner.holderId, wave, 'audio/mpeg');
  const unsupported = await handle(request('/request', audioSpec(unsupportedId, AUDIO_TRANSCRIPT_SCHEMA), owner.review));
  assert.equal(unsupported.status, 422);
  assert.equal((await unsupported.json()).code, 'AUDIO_FORMAT_UNSUPPORTED');
  assert.deepEqual(calls.storage, []);

  const tooLong = await handle(request('/request', audioSpec(owner.uploadId, AUDIO_TRANSCRIPT_SCHEMA), owner.review));
  const tooLongBody = await tooLong.json();
  assert.equal(tooLong.status, 413);
  assert.equal(tooLongBody.code, 'AUDIO_TOO_LONG');
  const receipt = await receiptFor(tooLongBody.receiptId);
  assert.equal(receipt.cost_basis, 'not-dispatched');
  assert.equal(Number(receipt.cost_microusd), 0);
  assert.equal(calls.storage.length, 1);
  assert.deepEqual(calls.transcription, []);
  assert.deepEqual(calls.assessment, []);
});

test('Token-only transcription usage retains the reserve and cannot trigger another paid stage', async () => {
  const wave = pcmWave(2);
  const { handle, calls } = audioStub(wave, { transcriptionUsage: { type: 'tokens', input_tokens: 20, output_tokens: 5 } });
  const owner = await ownerWithAudio(handle, wave);
  const first = await handle(request('/request', audioSpec(owner.uploadId, AUDIO_TRANSCRIPT_SCHEMA), owner.review));
  const failure = await first.json();
  assert.equal(first.status, 502);
  assert.equal(failure.code, 'TRANSCRIPTION_FAILED');
  assert.equal(failure.failureClass, 'provider_usage_invalid');
  const receipt = await receiptFor(failure.receiptId);
  assert.equal(receipt.cost_basis, 'reserved');
  assert.equal(Number(receipt.cost_microusd), 4500);
  assert.equal(receipt.audio_duration_ms, null);
  const retried = await handle(request('/request', audioSpec(owner.uploadId, AUDIO_TRANSCRIPT_SCHEMA), owner.review));
  assert.equal(retried.status, 409);
  assert.deepEqual(await retried.json(), { code: 'REQUEST_COMPLETED', receiptId: failure.receiptId });
  const assessed = await handle(request('/request', audioSpec(owner.uploadId, AUDIO_SCORES_SCHEMA), owner.review));
  assert.equal(assessed.status, 409);
  assert.equal((await assessed.json()).code, 'TRANSCRIPT_UNAVAILABLE');
  assert.equal(calls.transcription.length, 1);
  assert.deepEqual(calls.assessment, []);
});
