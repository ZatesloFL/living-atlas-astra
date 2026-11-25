import test from 'node:test';
import assert from 'node:assert/strict';
import { AtlasRecords } from '../src/atlas-records.js';
import { registerProjection } from '../src/build-projection.js';
import { ConnectedSources, SOURCE_CACHE_MS, SOURCE_KEY, connectionPlanFingerprint } from '../src/connected-sources.js';
import { mockGallery } from '../src/source-mocks.js';
import { appendEntry, verifyChain } from '../src/ledger.js';
import { scores } from '../src/scores.js';

const owner = { actorId: 'test-owner' };
const other = { actorId: 'test-visitor' };
const ownerLens = { profileId: owner.actorId, age: 30 };

function fixture({ gallery = structuredClone(mockGallery) } = {}) {
  const memory = new Map();
  const storage = { getItem: key => memory.get(key), setItem: (key, value) => memory.set(key, value) };
  let now = Date.parse('2026-11-24T17:00:00Z');
  const make = () => new ConnectedSources({ storage, gallery, clock: () => now });
  return { service: make(), make, memory, storage, gallery, advance: ms => { now += ms; } };
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

async function atlasForPlace(storage, placeId) {
  registerProjection({
    projection:{schemaVersion:2,rootPlaceId:placeId,rooms:[{
      placeId,parentPlaceId:null,pathIds:[],pieces:[],behaviors:[],layout:{kind:'courtyard'}
    }]},
    changes:[{op:'create',kind:'Place',ref:{placeId},fields:{
      title:'Source test Place',visibility:'hidden',content:scores(),blocks:[]
    }}]
  },{ownerId:owner.actorId});
  const records = new AtlasRecords(() => storage);
  const grant = await records.propose(ownerLens,{kind:'grant',areas:['sources'],scope:'edit',durationMs:null},
    'Give the Atlas standing edit access for sources.');
  await records.confirm(ownerLens,grant.id);
  return records;
}

async function proposeConnection(records, plan) {
  const {placeId,sourceId,kind,syncMode,recipe} = plan;
  return records.proposeExtension(ownerLens,{
    area:'sources',action:'connect-and-map',placeId,payload:{
      sourceId,kind,syncMode,recipe,planFingerprint:await connectionPlanFingerprint(plan)
    }
  },'Connect this simulated source and apply its mapping.',{requested:true});
}

function confirmConnection(records, proposal, service, plan) {
  return records.confirm(ownerLens,proposal.id,(_value,proof)=>service.commitConnection(plan,{
    lens:ownerLens,records,...proof
  }));
}

test('The connection preview is read-only and an exact scoped confirmation attaches and approves atomically', async () => {
  const {service,storage,memory,advance,make} = fixture();
  const existing = await attach(service, 'collection-db');
  const placeId = existing.placeId;
  const input = {placeId,owner:owner.actorId,kind:'drive',syncMode:'live'};
  const before = memory.get(SOURCE_KEY);
  const plan = service.planConnection(input,owner);
  assert.deepEqual(plan.placements.map(item=>item.position), [[-2.9,-4.3],[0,-4.3]]);
  assert.match(plan.recipeLabel, /folder becomes an alcove/);
  assert.ok(plan.blocks.every(block=>block.source.syncedAt===null && block.source.simulated));
  assert.equal(memory.get(SOURCE_KEY),before);
  assert.equal(service.cache.size,0);
  assert.equal(service.view(plan.sourceId,owner),null);
  assert.deepEqual(service.receipts(plan.sourceId,owner),[]);
  assert.throws(()=>service.planConnection(input,other),/approving owner/);
  await assert.rejects(service.commitConnection(plan,owner),/Atlas Receipts/);

  const records = await atlasForPlace(storage,placeId);
  let proposal = await proposeConnection(records,plan);
  assert.equal(service.view(plan.sourceId,owner),null);
  advance(SOURCE_CACHE_MS+1);
  assert.deepEqual(service.planConnection(input,owner),plan);
  await assert.rejects(confirmConnection(records,proposal,service,{...plan,recipe:'gallery-plinths'}),/preview changed/);
  proposal = await proposeConnection(records,plan);
  const wrongMode = service.planConnection({...input,syncMode:'indexed'},owner);
  await assert.rejects(confirmConnection(records,proposal,service,wrongMode),/does not match this source preview/);
  assert.equal(memory.get(SOURCE_KEY),before);
  proposal = await proposeConnection(records,plan);
  const result = await confirmConnection(records,proposal,service,plan);
  assert.match(result.result.receipt.id,/^source:[a-f0-9]{64}$/);
  assert.equal(result.result.source.syncMode,'live');
  assert.equal(result.result.mapping.status,'approved');
  assert.equal(result.result.mapping.approvedBy,owner.actorId);
  assert.equal(await make().ready,true);
  assert.equal(make().view(plan.sourceId,owner).blocks.length,4);
  assert.equal(make().view(plan.sourceId,other),null);
  const receipts = service.receipts(plan.sourceId,owner);
  assert.deepEqual(receipts.map(entry=>[entry.action,entry.actor]),[
    ['source_attached',owner.actorId],['source_mapping_proposed','atlas'],['source_mapping_approved',owner.actorId]
  ]);
  const applied = records.read().receipts.find(entry=>entry.hash===result.receipt);
  assert.equal(receipts.at(-1).diff.confirmationReceiptId,applied.diff.confirmationReceipt);
  assert.equal(receipts[1].diff.proposalReceiptId,applied.diff.proposalReceipt);
  assert.equal((await verifyChain(receipts)).valid,true);
});

test('A proposed snapshot captures only after confirmation and exclusion changes only the Place mapping', async () => {
  const {service,storage,gallery,make} = fixture();
  const placeId = 'source-snapshot-proposal';
  const input = {placeId,owner:owner.actorId,kind:'collection-db',syncMode:'snapshot'};
  const records = await atlasForPlace(storage,placeId);
  const first = service.planConnection(input,owner);
  const stale = await proposeConnection(records,first);
  gallery.items[0].title = 'Updated before the owner confirmed';
  await assert.rejects(confirmConnection(records,stale,service,first),/preview changed/);
  assert.equal(service.view(first.sourceId,owner),null);
  const fresh = service.planConnection(input,owner);
  const proposal = await proposeConnection(records,fresh);
  await confirmConnection(records,proposal,service,fresh);
  const initial = service.view(fresh.sourceId,other);
  const id = initial.items[0].id;
  const hash = initial.snapshot.hash;
  await assert.rejects(service.setItemExcluded(fresh.sourceId,id,true,other),/source owner/);
  await service.setItemExcluded(fresh.sourceId,id,true,owner);
  const reload = make(), management = reload.view(fresh.sourceId,{...owner,includeExcluded:true});
  assert.equal(management.snapshot.hash,hash);
  assert.equal(management.items.find(item=>item.id===id).excluded,true);
  assert.ok(!management.blocks.some(block=>block.source.itemId===id));
  assert.ok(!reload.view(fresh.sourceId,{...other,includeExcluded:true}).items.some(item=>item.id===id));
  assert.ok(!reload.view(fresh.sourceId,other).placements.some(placement=>placement.itemId===id));
  assert.equal(reload.markServed(fresh.sourceId,id,32,other),false);
  await reload.setItemExcluded(fresh.sourceId,id,false,owner);
  assert.deepEqual(reload.view(fresh.sourceId,other).blocks,initial.blocks);
  await reload.remove(fresh.sourceId,owner);
  assert.equal(reload.view(fresh.sourceId,other),null);
  assert.equal(reload.receipts(fresh.sourceId,owner).at(-1).action,'source_detached');
});

test('A competing source change or failed storage write cannot publish a confirmed partial connection', async () => {
  const {service,storage,make,memory} = fixture();
  const placeId = 'concurrent-source-approval';
  const input = {placeId,owner:owner.actorId,kind:'drive',syncMode:'live'};
  const records = await atlasForPlace(storage,placeId), stale = make(), plan = stale.planConnection(input,owner);
  const proposal = await proposeConnection(records,plan);
  await attach(service,'collection-db');
  await assert.rejects(confirmConnection(records,proposal,stale,plan),/changed in another tab/);
  const lastGood = memory.get(SOURCE_KEY);
  const blocked = new ConnectedSources({storage:{
    getItem:storage.getItem,
    setItem:()=>{throw new Error('Storage full');}
  }});
  const next = await proposeConnection(records,plan);
  await assert.rejects(confirmConnection(records,next,blocked,plan),/needed to keep this connection/);
  assert.equal(memory.get(SOURCE_KEY),lastGood);
  assert.equal(blocked.view(plan.sourceId,owner),null);
  assert.deepEqual(blocked.receipts(plan.sourceId,owner),[]);
});

test('Legacy source approvals stay readable and the old journal cannot authorize a new mapping', async () => {
  const {service,storage,memory,make} = fixture();
  const gallery = await attach(service,'collection-db');
  const stored = JSON.parse(memory.get(SOURCE_KEY));
  const historical = stored.ledgers[gallery.id];
  const oldProposal = 'source-conversation:' + 'a'.repeat(64);
  const oldConfirmation = 'source-conversation:' + 'b'.repeat(64);
  const archived = [];
  for (const receipt of historical) {
    const proposal = receipt.action==='source_mapping_proposed';
    const approved = receipt.action==='source_mapping_approved';
    await appendEntry(archived,proposal?'atlas':receipt.actor,receipt.action,{
      ...receipt.diff,
      ...(proposal?{proposalReceiptId:oldProposal}:{}),
      ...(approved?{confirmationReceiptId:oldConfirmation}:{})
    });
  }
  stored.ledgers[gallery.id] = archived;
  stored.sources[gallery.id].mapping.receiptRef = archived.at(-1).hash;
  memory.set(SOURCE_KEY,JSON.stringify(stored));
  const current = make();
  assert.equal(await current.ready,true);
  assert.equal(current.view(gallery.id,other).mapping.receiptRef,archived.at(-1).hash);
  assert.deepEqual(current.receipts(gallery.id,owner),archived);

  const pending = current.planConnection({placeId:gallery.placeId,owner:owner.actorId,kind:'drive'},owner);
  const {placeId,sourceId,kind,syncMode,recipe} = pending;
  const legacy = [], grantId = 'legacy-grant', id = 'legacy-proposal';
  await appendEntry(legacy,owner.actorId,'source_conversation_granted',{grantId,placeId,scope:'suggest',actions:['mapping']});
  const proposed = await appendEntry(legacy,'atlas','source_conversation_proposed',{
    grantId,placeId,ownerId:owner.actorId,kind:'mapping',id,data:{
      sourceId,kind,syncMode,recipe,planFingerprint:await connectionPlanFingerprint(pending)
    }
  });
  const proposalReceiptId = 'source-conversation:' + proposed.hash;
  const confirmed = await appendEntry(legacy,owner.actorId,'source_conversation_confirmed',{
    grantId,placeId,ownerId:owner.actorId,kind:'mapping',id,proposalReceiptId
  });
  const confirmationReceiptId = 'source-conversation:' + confirmed.hash;
  memory.set('living-atlas.source-conversation.v1',JSON.stringify({version:1,receipts:legacy}));
  const records = await atlasForPlace(storage,placeId);
  await assert.rejects(current.commitConnection(pending,{...owner,proposalReceiptId,confirmationReceiptId}),/Atlas Receipts/);
  await assert.rejects(current.commitConnection(pending,{lens:ownerLens,records,
    proposalReceipt:proposalReceiptId,confirmationReceipt:confirmationReceiptId}));
  assert.equal(current.view(sourceId,owner),null);
  assert.deepEqual(current.receipts(gallery.id,owner),archived);
});
