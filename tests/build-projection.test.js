import test from 'node:test';
import assert from 'node:assert/strict';
import {AccessStore} from '../src/access-store.js';
import {registerProjection} from '../src/build-projection.js';
import {DIMENSIONS, EDGES, ROOMS} from '../src/data.js';
import {spatialArrival} from '../src/interior-space.js';
import {graphEdges} from '../src/navigation.js';

const ownerId = 'builder-test-owner';
const pairedScores = (amount = 0, graphicness = 0) => Object.fromEntries(
  DIMENSIONS.map(([key]) => [key, key === 'sensory' ? {amount, graphicness} : {amount: 0, graphicness: 0}]),
);

function starter(t, schemaVersion = 2) {
  const home = `builder-test-${schemaVersion}`;
  const drive = `${home}/drive`;
  const workshop = `${home}/workshop`;
  const civic = ROOMS.civic.id;
  const note = 'hobby-note';
  const civicPath = `${home}-civic`;
  const edgeIds = new Set([civicPath, `${home}-drive`, `${home}-workshop`]);
  t.after(() => {
    for (const place of [home, drive, workshop]) delete ROOMS[place];
    for (let i = EDGES.length - 1; i >= 0; i--) {
      if (edgeIds.has(EDGES[i].id)) EDGES.splice(i, 1);
    }
  });

  const room = (placeId, parentPlaceId, slot, pathIds = [], pieces = []) => ({
    placeId, parentPlaceId, pathIds, pieces, behaviors: [],
    layout: {kind: 'booth', scene: 'studio', slot, approach: [slot[0], slot[1] + 2], scale: 1, facing: 0},
  });
  const piece = (id, kind, ref) => ({
    id, kind, ref, transform: {position: [1, 0, 2], yaw: 0, scale: 1}, settings: {}, behaviors: [],
  });
  const change = (kind, ref, fields) => ({op: 'create', kind, ref, fields, provenanceRef: null});
  const path = (pathId, to) => change('Path', {pathId}, {from: home, to, type: 'door', consent: 'Fixture consent reference'});
  const content = pairedScores(2, 1);
  const measured = pairedScores(1, 2);
  const fields = (title) => ({title, district: 'makers', visibility: 'hidden', minAge: 0, content, measured});
  const admission = {mode: 'filtered', minimum: pairedScores(1, 2), measuredMinimum: pairedScores(2, 1)};
  const ref = {placeId: civic, thingId: 'lead'};

  return {
    home, drive, workshop, civic, note, civicPath, ref,
    draft: {
      projection: {
        schemaVersion, rootPlaceId: home,
        rooms: [
          room(home, null, [8, 6], [...edgeIds], [piece('civic-reading', 'thing-reference', ref)]),
          room(drive, home, [5, 6]),
          room(workshop, home, [8, 9]),
        ],
      },
      changes: [
        change('Place', {placeId: home}, {...fields('Starter Place'), admission}),
        change('Place', {placeId: drive}, fields('Drive')),
        change('Place', {placeId: workshop}, fields('Workshop')),
        {...change('Thing', {placeId: home, thingId: note}, {
          type: 'text', importance: 'core', body: 'Synthetic starter note.',
          reps: {text: 'Synthetic starter note.'}, sources: [], content: pairedScores(1, 2),
        }), provenanceRef: 'synthetic-approval-receipt'},
        path(`${home}-drive`, drive),
        path(`${home}-workshop`, workshop),
        path(civicPath, civic),
      ],
    },
  };
}

test('Registers the three-room starter in the shared catalog and keeps public selections as references', (t) => {
  const {home, drive, workshop, civic, note, civicPath, ref, draft} = starter(t);
  const origin = ROOMS.civic;
  const result = registerProjection(draft, {ownerId});
  assert.equal(result.rootKey, home);
  assert.equal(result.roomKeys[home], home);
  assert.equal(result.roomKeys[drive], drive);
  assert.equal(result.roomKeys[workshop], workshop);
  assert.deepEqual(result.arrival, spatialArrival(home, 'inside'));

  const access = new AccessStore(() => null);
  for (const [place, parent] of [[home, null], [drive, home], [workshop, home]]) {
    assert.equal(access.room(place), ROOMS[place]);
    assert.equal(ROOMS[place].ownerId, ownerId);
    assert.equal(ROOMS[place].parentPlaceId, parent);
  }
  const root = ROOMS[home];
  assert.deepEqual(root.content.sensory, {amount: 2, graphicness: 1});
  assert.deepEqual(root.measured.sensory, {amount: 1, graphicness: 2});
  assert.deepEqual(root.admission.minimum.sensory, {amount: 1, graphicness: 2});
  assert.deepEqual(root.admission.measuredMinimum.sensory, {amount: 2, graphicness: 1});
  assert.deepEqual(root.blocks.map((block) => block.id), [note]);
  assert.deepEqual(root.blocks[0].content.sensory, {amount: 1, graphicness: 2});
  assert.equal(root.blocks[0].provenanceRef, 'synthetic-approval-receipt');
  assert.deepEqual(root.kitPieces.find(({id}) => id === 'civic-reading').ref, ref);
  assert.equal(ROOMS.civic, origin);
  assert.equal(ROOMS[civic], undefined);
  const edges = graphEdges();
  for (const [id, target] of [[`${home}-drive`, drive], [`${home}-workshop`, workshop]]) {
    const path = edges.find((candidate) => candidate.id === id);
    assert.equal(path.from, home);
    assert.equal(path.to, target);
    assert.equal(path.type, 'door');
    assert.equal(path.scene, 'studio');
    assert.equal(path.position.length, 2);
  }
  const edge = edges.find(({id}) => id === civicPath);
  assert.equal(edge.from, home);
  assert.equal(edge.to, 'civic');
  assert.equal(edge.type, 'door');
  assert.deepEqual(edge.reference, {placeId: civic});
  assert.equal(edge.consent, 'Fixture consent reference');
});

test('Rejects an invalid batch before mutating either shared collection', (t) => {
  const {drive, workshop, draft} = starter(t);
  const before = {rooms: Object.keys(ROOMS), edges: EDGES.map(({id}) => id)};
  for (const invalidate of [
    (copy) => { copy.projection.rooms[0].pieces[0].ref.thingId = 'missing-thing'; },
    (copy) => {
      copy.projection.rooms[1].parentPlaceId = workshop;
      copy.projection.rooms[2].parentPlaceId = drive;
    },
    (copy) => {
      const path = copy.changes.find(({kind}) => kind === 'Path');
      const index = copy.projection.rooms[0].pathIds.indexOf(path.ref.pathId);
      path.ref.pathId = EDGES[0].id;
      copy.projection.rooms[0].pathIds[index] = path.ref.pathId;
    },
  ]) {
    const copy = structuredClone(draft);
    invalidate(copy);
    assert.throws(() => registerProjection(copy, {ownerId}));
    assert.deepEqual(Object.keys(ROOMS), before.rooms);
    assert.deepEqual(EDGES.map(({id}) => id), before.edges);
  }
});

test('Accepts the version 1 envelope with paired scores and keeps repeat registration isolated from caller mutation', (t) => {
  const {home, draft} = starter(t, 1);
  const equivalent = structuredClone(draft);
  const initial = registerProjection(draft, {ownerId});
  const originalRoom = ROOMS[home];
  const pathCount = EDGES.length;

  draft.projection.rooms[0].layout.slot[0] = 300;
  draft.changes[0].fields.title = 'Changed input';
  draft.changes[0].fields.content.sensory.amount = 3;
  assert.deepEqual(ROOMS[home].layout.slot, [8, 6]);
  assert.equal(ROOMS[home].title, 'Starter Place');
  assert.deepEqual(ROOMS[home].content.sensory, {amount: 2, graphicness: 1});
  assert.deepEqual(registerProjection(equivalent, {ownerId}), initial);
  assert.equal(ROOMS[home], originalRoom);
  assert.equal(EDGES.length, pathCount);
  assert.throws(() => registerProjection(draft, {ownerId}));
  assert.equal(ROOMS[home], originalRoom);
  assert.equal(EDGES.length, pathCount);
});
