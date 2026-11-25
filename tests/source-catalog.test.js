import test from 'node:test';
import assert from 'node:assert/strict';
import { createAI } from '../src/ai.js';
import { interviewRecord } from '../src/arrival-records.js';
import { registerProjection } from '../src/build-projection.js';
import { articleHTML } from '../src/block-renderer.js';
import { connectedSources } from '../src/connected-sources.js';
import { EDGES, ROOMS } from '../src/data.js';
import { makeProfile } from '../src/profiles.js';
import { scores } from '../src/scores.js';
import { GALLERY_PLACE, recordUploadInventory, sourcedRoom } from '../src/source-catalog.js';
import { starterDraft } from '../src/starter-data.js';
import { proposeUploadScores } from '../src/upload-scores.js';

test('The simulated organization and its data-driven plinths use the shared Place and Page', () => {
  const visitor = makeProfile('Visitor');
  const gallery = ROOMS[GALLERY_PLACE];
  const view = sourcedRoom(gallery, visitor);
  assert.equal(gallery.organizationBadge.simulated, true);
  assert.ok(view.blocks.length > 0);
  assert.equal(view.sourcePlacements.length, view.blocks.length);
  assert.ok(view.sourcePlacements.every(piece => piece.kind === 'plinth' &&
    view.blocks.some(block => block.id === piece.blockId && block.source.simulated)));
  assert.match(articleHTML(GALLERY_PLACE, visitor), /Simulated source|simulated/i);
  assert.ok(EDGES.some(path => path.from === GALLERY_PLACE && path.to === 'square'));
});

test('A simulated Drive attaches to the registered Drive shell and the hosted declaration gates private copies', async () => {
  const owner = makeProfile('Synthetic holder');
  const interview = interviewRecord({}, {holderId: owner.id});
  const draft = starterDraft({profile: owner, interview, start: 'scratch'});
  const registration = registerProjection(draft, {ownerId: owner.id});
  const id = registration.rootKey + '/drive';
  const drive = ROOMS[id], actorId = owner.id;
  const {id: sourceId} = await connectedSources.create({placeId: id, owner: actorId, kind: 'drive'}, {actorId});
  const proposal = await connectedSources.proposeMapping(sourceId, 'drive-alcoves', {actorId});
  await connectedSources.approveMapping(sourceId, proposal.id, {actorId});
  const mapped = sourcedRoom(drive,owner);
  assert.equal(mapped.sourcePlacements.length, 2);
  assert.match(articleHTML(id, owner), /A page of observations|Sample notebook/i);
  assert.doesNotMatch(articleHTML(id, makeProfile('Other')), /Sample notebook/i);

  const item = {id: '00000000-aaaa-4aaa-8aaa-000000000001', placeId: id, sourceId: 'upload-example',
    filename: 'synthetic.txt', contentType: 'text/plain', state: 'uploaded', scores: null,
    snapshotReceiptId: 'synthetic-snapshot', declarationReceiptId: null,
    sha256: 'a'.repeat(64), uploadedAt: '2026-11-24T17:00:00Z'};
  recordUploadInventory([item], owner);
  assert.ok(!sourcedRoom(drive, owner).blocks.some(block => block.id === item.sourceId));
  const published = {...item, state:'published', scores:scores(), declarationReceiptId:'synthetic-declaration'};
  recordUploadInventory([published], owner);
  assert.equal(sourcedRoom(drive, owner).blocks.find(block => block.id === item.sourceId).standing.declarationRef.receiptRef, 'synthetic-declaration');
  assert.match(articleHTML(id, owner), /uploaded copy, as of/i);
  recordUploadInventory([{...published, state:'deleted'}], owner);
  assert.match(articleHTML(id, owner), /owner deleted/i);
});

test('Mapped sources share a Place grid without moving authored pieces', async () => {
  const owner = makeProfile('Synthetic catalog owner');
  const actor = {actorId: owner.id};
  const placeId = 'sources-shared-grid-' + owner.id;
  const room = {
    id: placeId, ownerId: owner.id, visibility: 'hidden', blocks: [],
    kitPieces: [{id: 'authored', kind: 'fixture', transform: {position: [4, 0, 6], yaw: 0, scale: 1}}],
    layout: {components: [{block: 'held', position: [5, 7], facing: 0}]},
  };
  const before = structuredClone(room);
  const attach = async (kind, recipe) => {
    const {id} = await connectedSources.create({placeId, owner: owner.id, kind}, actor);
    const proposal = await connectedSources.proposeMapping(id, recipe, actor);
    await connectedSources.approveMapping(id, proposal.id, actor);
  };

  await attach('collection-db', 'gallery-plinths');
  const initial = sourcedRoom(room, owner).sourcePlacements;
  await attach('drive', 'drive-alcoves');
  const mapped = sourcedRoom(room, owner);
  assert.deepEqual(mapped.sourcePlacements.slice(0, 3), initial);
  assert.deepEqual(mapped.sourcePlacements.map(piece => [piece.kind, piece.position]), [
    ['plinth', [-2.9, -1.5]], ['plinth', [0, -1.5]], ['plinth', [2.9, -1.5]],
    ['alcove', [-2.9, -4.3]], ['alcove', [0, -4.3]],
  ]);
  assert.deepEqual(mapped.kitPieces, before.kitPieces);
  assert.deepEqual(mapped.layout, before.layout);
  assert.deepEqual(room, before);
});

test('Text upload suggestions stay local and photos require live scoring', async () => {
  const model = createAI({transport:{eligible:()=>true,request:()=>assert.fail('Upload content reached the live guide')}});
  const suggestion = await proposeUploadScores(model, {
    file:new Blob(['A fictional story about war and graphic violence.'], {type:'text/plain'}),
    item:{contentType:'text/plain'}, room:{id:'example'}
  });
  assert.equal(suggestion.scores.violence.graphicness, 3);
  assert.match(suggestion.provenance, /Simulated/);
  await assert.rejects(proposeUploadScores(model, {
    item:{id:crypto.randomUUID(),contentType:'image/jpeg'}, room:{id:'example'}
  }), /live photo scoring is unavailable/i);
});
