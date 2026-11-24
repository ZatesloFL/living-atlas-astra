import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { mkdir, mkdtemp, readFile, rm } from 'node:fs/promises';
import { createServer } from 'node:net';
import { resolve } from 'node:path';
import test, { after, before } from 'node:test';
import EmbeddedPostgres from 'embedded-postgres';
import postgres from 'postgres';
import { pair } from '../src/scores.js';

const migration = await readFile(new URL('../supabase/migrations/20261124180017_atlas_connected_sources.sql', import.meta.url), 'utf8');
const rollback = await readFile(new URL('../supabase/migrations/rollback/20261124180017_atlas_connected_sources.rollback.sql', import.meta.url), 'utf8');
const bucket = 'atlas-user-uploads';
const originalHash = 'a'.repeat(64);
const previewHash = 'b'.repeat(64);
const dimensions = ['violence', 'sexual', 'language', 'disturbing', 'viewpoint', 'sensory'];
let pg, sql, folder;

// This isolated fixture mimics Storage's metadata schema for SQL tests. Actual
// bucket writes and deletes are only issued through the Storage API by the gateway.
before(async () => {
  await mkdir('work', { recursive: true });
  folder = await mkdtemp(resolve('work/atlas-sources-pg-'));
  const socket = createServer();
  await new Promise(resolve => socket.listen(0, '127.0.0.1', resolve));
  const { port } = socket.address();
  await new Promise(resolve => socket.close(resolve));
  pg = new EmbeddedPostgres({
    databaseDir: folder + '/db', user: 'atlas_test', password: 'local-fixture', port, persistent: false,
    postgresFlags: ['-h', '127.0.0.1'], onLog: () => {}, onError: () => {}
  });
  await pg.initialise();
  await pg.start();
  sql = postgres({ host: '127.0.0.1', port, user: 'atlas_test', password: 'local-fixture', database: 'postgres', max: 8, prepare: false, onnotice: () => {} });
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
    GRANT USAGE ON SCHEMA storage TO anon, authenticated;
    GRANT SELECT, INSERT, UPDATE, DELETE ON storage.objects TO anon, authenticated;
    CREATE POLICY fixture_permissive ON storage.objects
      FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);
    INSERT INTO storage.buckets (id, name, public) VALUES ('fixture-existing', 'fixture-existing', true);
    INSERT INTO storage.objects (bucket_id, name) VALUES ('fixture-existing', 'original');
  `);
  await sql.unsafe(migration);
});
after(async () => {
  await sql?.end();
  await pg?.stop();
  if (folder) await rm(folder, { recursive: true, force: true });
});

const reserve = async ({ owner, id = randomUUID(), bytes = 8, previewBytes = 0, previewSha = null, type = 'image/png' }) =>
  (await sql`SELECT r.* FROM atlas_sources.reserve_upload(
    ${owner}, ${id}, 'fixture/drive', 'upload-source', 'synthetic.png', ${type}, ${originalHash}, ${bytes}, ${previewBytes}, ${previewSha}
  ) r`)[0];
const usage = async owner => (await sql`SELECT atlas_sources.storage_usage(${owner}) AS result`)[0].result;
const byRole = (role, run) => sql.begin(async tx => {
  await tx.unsafe('SET LOCAL ROLE ' + role);
  return run(tx);
});
const asFixtureStorage = (id, variant, bytes, mimetype = 'image/png') => sql`
  INSERT INTO storage.objects (bucket_id, name, metadata) VALUES (${bucket}, ${id + '/' + variant}, ${sql.json({ size: bytes, mimetype })})
  ON CONFLICT (bucket_id, name) DO UPDATE SET metadata = EXCLUDED.metadata`;
const failure = message => error => error.message === message;

test('migration provisions one private bucket, protects it even with a separate permissive policy, and rolls back unused', async () => {
  const [info] = await sql`SELECT * FROM storage.buckets WHERE id = ${bucket}`;
  assert.equal(info.public, false);
  assert(!info.allowed_mime_types.some(mime => mime.startsWith('video/')));
  assert.deepEqual(await usage(randomUUID()), { allotmentBytes: 1000000000, usedBytes: 0, reservedBytes: 0 });

  const id = randomUUID();
  await asFixtureStorage(id, 'original', 8);
  for (const role of ['anon', 'authenticated']) {
    await assert.rejects(byRole(role, tx => tx`SELECT * FROM atlas_sources.list_uploads('any')`), error => error.code === '42501');
    const objects = await byRole(role, tx => tx`SELECT bucket_id FROM storage.objects ORDER BY bucket_id`);
    assert.deepEqual(objects.map(object => object.bucket_id), ['fixture-existing']);
    await assert.rejects(byRole(role, tx => tx`INSERT INTO storage.objects VALUES (${bucket}, 'attempt', '{}')`), error => error.code === '42501');
  }
  await sql`DELETE FROM storage.objects WHERE bucket_id = ${bucket}`;
  await sql.unsafe(rollback);
  assert.equal((await sql`SELECT id FROM storage.buckets WHERE id = ${bucket}`).length, 0);
  assert.equal((await sql`SELECT name FROM storage.objects WHERE bucket_id = 'fixture-existing'`)[0].name, 'original');
  await sql.unsafe(migration);
});

test('concurrent reservations serialize on one owner allotment and preserve replay identity', async () => {
  const owner = randomUUID();
  const otherOwner = randomUUID();
  await sql`INSERT INTO atlas_sources.owner_allotments VALUES (${owner}, 100)`;
  const results = await Promise.allSettled([
    reserve({ owner, bytes: 60 }), reserve({ owner, bytes: 60 })
  ]);
  const accepted = results.filter(result => result.status === 'fulfilled');
  const denied = results.filter(result => result.status === 'rejected');
  assert.equal(accepted.length, 1);
  assert.equal(denied.length, 1);
  assert.equal(denied[0].reason.message, 'ALLOTMENT_EXCEEDED');
  const { id } = accepted[0].value;
  assert.equal((await reserve({ owner, id, bytes: 60 })).id, id);
  await assert.rejects(reserve({ owner, id, bytes: 61 }), failure('UPLOAD_CONFLICT'));
  await assert.rejects(reserve({ owner: otherOwner, id, bytes: 60 }), failure('UPLOAD_CONFLICT'));
  await assert.rejects(reserve({ owner, bytes: 1, type: 'video/mp4' }), failure('UPLOAD_INVALID'));
  assert.deepEqual(await usage(owner), { allotmentBytes: 100, usedBytes: 0, reservedBytes: 60 });
  assert.deepEqual(await usage(otherOwner), { allotmentBytes: 1000000000, usedBytes: 0, reservedBytes: 0 });
});

test('stored copy, declaration, serving, and deletion cover real quota and remain replay safe', async () => {
  const owner = randomUUID();
  const stranger = randomUUID();
  const { id } = await reserve({ owner, previewBytes: 4, previewSha: previewHash });
  const finishUpload = () => sql`SELECT r.* FROM atlas_sources.finish_upload(${owner}, ${id}) r`.then(rows => rows[0]);
  const scores = Object.fromEntries(dimensions.map(key => [key, pair(1, 2)]));
  const confirm = s => sql`SELECT r.* FROM atlas_sources.publish_upload(${owner}, ${id}, ${sql.json(s)}) r`.then(rows => rows[0]);
  const beginDelete = () => sql`SELECT r.* FROM atlas_sources.begin_delete(${owner}, ${id}) r`.then(rows => rows[0]);
  const finishDelete = () => sql`SELECT r.* FROM atlas_sources.finish_delete(${owner}, ${id}) r`.then(rows => rows[0]);
  const meter = (variant, bytes) => sql`SELECT atlas_sources.record_egress(${owner}, ${id}, ${variant}, ${bytes})`;
  const metrics = async () => (await sql`SELECT atlas_sources.storage_metrics(${owner}) AS result`)[0].result;

  assert.equal((await usage(owner)).reservedBytes, 12);
  await assert.rejects(reserve({ owner, id, previewBytes: 4, previewSha: originalHash }), failure('UPLOAD_CONFLICT'));
  await assert.rejects(confirm(scores), failure('UPLOAD_STATE_CONFLICT'));
  await asFixtureStorage(id, 'original', 8);
  await asFixtureStorage(id, 'preview', 4, 'text/plain');
  await assert.rejects(finishUpload(), failure('UPLOAD_OBJECTS_INCOMPLETE'));
  assert.equal((await usage(owner)).reservedBytes, 12);
  await asFixtureStorage(id, 'preview', 4, 'image/jpeg');
  const uploaded = await finishUpload();
  assert.equal(uploaded.state, 'uploaded');
  assert.equal(uploaded.snapshot_receipt_id, (await finishUpload()).snapshot_receipt_id);
  assert.deepEqual(await usage(owner), { allotmentBytes: 1000000000, usedBytes: 12, reservedBytes: 0 });
  await assert.rejects(confirm({ ...scores, sensory: { amount: 4, graphicness: 1 } }), failure('SCORES_INVALID'));
  await assert.rejects(confirm({ ...scores, extra: pair(1, 2) }), failure('SCORES_INVALID'));
  const published = await confirm(scores);
  assert.equal(published.state, 'published');
  assert.equal(published.declaration_receipt_id, (await confirm(scores)).declaration_receipt_id);
  await assert.rejects(confirm({ ...scores, sensory: pair(2, 1) }), failure('UPLOAD_CONFLICT'));
  assert.equal((await sql`SELECT * FROM atlas_sources.list_uploads(${stranger})`).length, 0);
  await assert.rejects(sql`SELECT * FROM atlas_sources.begin_delete(${stranger}, ${id})`, failure('UPLOAD_NOT_FOUND'));
  await assert.rejects(meter('preview', 8), failure('UPLOAD_INVALID'));
  await Promise.all([meter('original', 8), meter('preview', 4)]);
  const served = [{ placeId: 'fixture/drive', sourceId: 'upload-source', servedBytes: 12 }];
  assert.deepEqual((await metrics()).served, served);

  assert.equal((await beginDelete()).state, 'deleting');
  assert.equal((await beginDelete()).state, 'deleting');
  await assert.rejects(meter('original', 8), failure('UPLOAD_STATE_CONFLICT'));
  await assert.rejects(finishDelete(), failure('UPLOAD_OBJECTS_REMAIN'));
  assert.equal((await usage(owner)).usedBytes, 12);
  await sql`DELETE FROM storage.objects WHERE bucket_id = ${bucket} AND name IN (${id + '/original'}, ${id + '/preview'})`;
  const deleted = await finishDelete();
  assert.equal(deleted.state, 'deleted');
  assert.equal(deleted.delete_receipt_id, (await finishDelete()).delete_receipt_id);
  assert.equal((await reserve({ owner, id, previewBytes: 4, previewSha: previewHash })).state, 'deleted');
  assert.deepEqual(await metrics(), { allotmentBytes: 1000000000, usedBytes: 0, reservedBytes: 0, served });
  const receipts = await sql`SELECT action, content_sha256, preview_sha256 FROM atlas_sources.upload_receipts WHERE upload_id = ${id} ORDER BY time`;
  assert.deepEqual(receipts.map(receipt => receipt.action), ['snapshot', 'declared', 'deleted']);
  assert(receipts.every(receipt => receipt.content_sha256 === originalHash && receipt.preview_sha256 === previewHash));

  const connection = await sql.reserve();
  try {
    await assert.rejects(connection.unsafe(rollback), /preserve the schema/);
    await connection.unsafe('ROLLBACK');
  } finally { connection.release(); }
  assert.equal((await sql`SELECT * FROM atlas_sources.upload_receipts WHERE upload_id = ${id}`).length, 3);
});
