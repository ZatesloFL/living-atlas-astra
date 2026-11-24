import test from 'node:test';
import assert from 'node:assert/strict';
import { ConnectedSources, SOURCE_CACHE_MS, SOURCE_KEY } from '../src/connected-sources.js';
import { mockGallery } from '../src/source-mocks.js';
import { verifyChain } from '../src/ledger.js';

const owner = { actorId: 'test-owner' };
const other = { actorId: 'test-visitor' };

function fixture({ gallery = structuredClone(mockGallery) } = {}) {
  const memory = new Map();
  const storage = { getItem: key => memory.get(key), setItem: (key, value) => memory.set(key, value) };
  let now = Date.parse('2026-11-24T17:00:00Z');
  const make = () => new ConnectedSources({ storage, gallery, clock: () => now });
  return { service: make(), make, memory, gallery, advance: ms => { now += ms; } };
}

async function attach(service, kind) {
  const placeId = 'mock-test-place';
  const source = await service.create({ owner: owner.actorId, placeId, kind }, owner);
  assert.equal(service.view(source.id, owner).status, 'mapping-pending');
  assert.deepEqual(service.view(source.id, owner).blocks, []);
  const proposal = await service.proposeMapping(source.id, kind === 'drive' ? 'drive-alcoves' : 'gallery-plinths', owner);
  await assert.rejects(service.approveMapping(source.id, proposal.id, other));
  await service.approveMapping(source.id, proposal.id, owner);
  return source;
}

test('Gallery mapping indexes metadata and adds a plinth for a new source record', async () => {
  const { service, memory, gallery } = fixture();
  const source = await attach(service, 'collection-db');
  const first = service.view(source.id, other);
  assert.equal(first.placements.length, 3);
  assert.deepEqual(first.blocks.map(block => block.styleControl), ['open', 'open', 'fixed']);
  assert.equal(first.blocks[0].source.simulated, true);
  assert.equal(first.blocks[0].source.mode, 'indexed');
  assert.equal(first.blocks[0].sourceMedia.kind, 'procedural-gallery');
  assert.equal(first.blocks[0].source.rights, 'public-domain');
  assert.ok(first.blocks[0].source.syncedAt);
  const index = JSON.parse(memory.get(SOURCE_KEY)).sources[source.id].index;
  assert.ok(index.every(item => !('description' in item) && !('scene' in item)));

  gallery.items.push({ id: 'new-original', kind: 'artwork', date: '1984', title: 'A new work',
    rights: 'public-domain', description: 'A new synthetic source record', scene: 3 });
  await service.sync(source.id, owner);
  assert.equal(service.view(source.id, other).placements.length, 4);
  assert.ok(service.view(source.id, other).placements.some(item => item.itemId === 'new-original' && item.kind === 'plinth'));
  assert.ok(service.markServed(source.id, 'new-original', 2048, other));
  assert.deepEqual(service.meters(other), [{ placeId: source.placeId, sourceId: source.id, servedBytes: 2048, simulated: true }]);
});

test('Live cache is short-lived, while rights and removed sources fail closed immediately', async () => {
  const { service, gallery, advance } = fixture();
  const source = await attach(service, 'collection-db');
  await service.setMode(source.id, 'live', owner);
  const itemId = gallery.items[0].id;
  const block = () => service.view(source.id, other).blocks.find(item => item.source.itemId === itemId);
  assert.equal(block().state, 'ready');
  gallery.items[0].description = 'Updated provider preview';
  assert.notEqual(block().reps.alt, 'Updated provider preview');
  advance(SOURCE_CACHE_MS + 1);
  assert.equal(block().reps.alt, 'Updated provider preview');
  gallery.items[0].rights = 'rights-reserved';
  assert.equal(block().styleControl, 'fixed');
  gallery.items[0].rights = 'revoked';
  assert.equal(block().state, 'unavailable');
  assert.equal(block().sourceMedia, undefined);
  assert.notEqual(block().reps.text, 'Updated provider preview');
  gallery.items[0].rights = 'private';
  assert.equal(block(), undefined);

  gallery.items[0].rights = 'rights-reserved';
  await service.setMode(source.id, 'indexed', owner);
  gallery.items.shift();
  assert.equal(block().state, 'unavailable');
  await service.sync(source.id, owner);
  assert.equal(block().state, 'unavailable');
});

test('Explicit mock snapshot remains frozen and records a verified hash receipt', async () => {
  const { service, make, gallery } = fixture();
  const source = await attach(service, 'collection-db');
  await service.setMode(source.id, 'snapshot', owner);
  const first = service.view(source.id, owner);
  assert.match(first.snapshot.hash, /^[a-f0-9]{64}$/);
  assert.equal(first.blocks[0].source.mode, 'snapshot');
  gallery.items[0].title = 'Provider changed';
  assert.deepEqual(make().view(source.id, owner).blocks, first.blocks);
  const receipts = service.receipts(source.id, owner);
  assert.equal(receipts.at(-1).action, 'source_snapshot_created');
  assert.equal(receipts.at(-1).diff.hash, first.snapshot.hash);
  assert.equal((await verifyChain(receipts)).valid, true);
});

test('Mock Drive requires source access and an active operation-specific write grant', async () => {
  const { service, advance } = fixture();
  const source = await attach(service, 'drive');
  assert.equal(service.view(source.id, other), null);
  assert.deepEqual(service.list(source.placeId, other), []);
  assert.deepEqual(service.receipts(source.id, other), []);
  assert.equal(service.view('__proto__', owner), null);
  assert.equal(service.view(source.id, owner).placements.filter(item => item.kind === 'alcove').length, 2);
  const document = () => service.view(source.id, owner).items.find(item => item.id === 'observations');
  const editorURL = new URL(document().editorURL, 'https://atlas.invalid/');
  assert.equal(editorURL.searchParams.get('returnTo'), source.placeId);
  await assert.rejects(service.patch(source.id, 'observations', { op: 'rename', value: 'Changed' }, owner));
  const grant = await service.grantWrite(source.id, { holderId: owner.actorId, operations: ['rename'] }, owner);
  await service.patch(source.id, 'observations', { op: 'rename', value: 'Changed' }, owner);
  assert.equal(document().title, 'Changed');
  await assert.rejects(service.patch(source.id, 'observations', { op: 'move', value: 'reference' }, owner));
  await service.revokeWrite(source.id, grant.id, owner);
  assert.equal(service.view(source.id, owner).source.writeEnabled, false);
  await service.grantWrite(source.id, { holderId: owner.actorId }, owner);
  await service.patch(source.id, 'observations', { op: 'move', value: 'reference' }, owner);
  await service.patch(source.id, 'observations', { op: 'comment', value: 'Sample note' }, owner);
  assert.equal(document().folderId, 'reference');
  assert.equal(document().comments[0].text, 'Sample note');
  assert.ok(service.receipts(source.id, owner).every(receipt => !JSON.stringify(receipt.diff).includes('Sample note')));
  advance(86_400_001);
  await assert.rejects(service.patch(source.id, 'observations', { op: 'rename', value: 'Expired' }, owner));
  await service.setMockAvailability(source.id, 'observations', false, owner);
  assert.equal(document().available, false);
  assert.equal(document().editorURL, null);
});

test('Hosted video records contain only a normalized reference and cannot consume Atlas preview bytes', async () => {
  const { service } = fixture();
  const input = { placeId: 'mock-test-place', owner: owner.actorId, title: 'Hosted sample', url: 'https://youtu.be/M7lc1UVf-VE' };
  const source = await service.addVideoReference(input, owner);
  const { blocks: [video] } = service.view(source.id, owner);
  assert.equal(video.reps.video, 'https://www.youtube.com/watch?v=M7lc1UVf-VE');
  assert.equal(video.source.kind, 'public-api');
  assert.equal(video.source.mode, 'live');
  assert.equal(service.view(source.id, other), null);
  assert.equal(service.markServed(source.id, video.source.itemId, 32, owner), false);
  await assert.rejects(service.setMode(source.id, 'snapshot', owner));
  await assert.rejects(service.addVideoReference({ ...input, url: 'https://example.org/video' }, owner));
});
