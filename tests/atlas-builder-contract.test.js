import assert from 'node:assert/strict';
import test from 'node:test';
import { atlasIntent } from '../src/atlas-intents.js';
import { ATLAS_RECORDS_KEY, AtlasRecords } from '../src/atlas-records.js';
import { registerProjection } from '../src/build-projection.js';
import { BUILDER_STORAGE, Builder } from '../src/builder.js';
import { ConnectedSources, connectionPlanFingerprint } from '../src/connected-sources.js';
import { PRESETS, ROOMS } from '../src/data.js';
import { appendEntry, verifyChain } from '../src/ledger.js';
import { scores } from '../src/scores.js';

const asked = { requested: true };
const words = 'Connect the simulated Drive and map its folders.';
const grantError = /grant|scope/i;

function fixture(t) {
  const actorId = `owner-${crypto.randomUUID()}`;
  const visitorId = `visitor-${crypto.randomUUID()}`;
  const lens = { ...structuredClone(PRESETS.Adult), profileId: actorId, age: 30 };
  const visitor = { ...lens, profileId: visitorId };
  const placeId = `atlas-extension-${crypto.randomUUID()}`;
  const otherPlaceId = `atlas-extension-${crypto.randomUUID()}`;
  for (const [id, ownerId] of [[placeId, actorId], [otherPlaceId, visitorId]]) {
    registerProjection({
      projection: { schemaVersion: 2, rootPlaceId: id, rooms: [{
        placeId: id, parentPlaceId: null, pathIds: [], pieces: [], behaviors: [], layout: { kind: 'courtyard' }
      }] },
      changes: [{ op: 'create', kind: 'Place', ref: { placeId: id }, fields: {
        title: 'Extension test studio', content: scores(), visibility: 'public', blocks: []
      } }]
    }, { ownerId });
    t.after(() => { delete ROOMS[id]; });
  }
  const saved = new Map();
  const storage = () => ({ getItem: key => saved.get(key), setItem: (key, value) => saved.set(key, value) });
  return { lens, visitor, actorId, visitorId, placeId, otherPlaceId, storage,
    records: new AtlasRecords(storage), sources: new ConnectedSources({ storage }) };
}

async function approve(records, lens, value, wording = 'Set the requested authority for this test.') {
  const proposal = await records.propose(lens, value, wording);
  const outcome = await records.confirm(lens, proposal.id);
  return { id: proposal.id, receipt: outcome.receipt };
}

const grant = (records, lens, areas, scope = 'edit', durationMs = null) =>
  approve(records, lens, { kind: 'grant', areas, scope, durationMs });

const envelope = (records, lens, areas, posture = 'Conversational') =>
  approve(records, lens, {
    kind: 'envelope', areas, posture, specification: `${posture} for ${areas.join(' and ')}.`,
    unasked: posture === 'Proactive' ? 'Inspect this area for possible improvements.' : '',
    alwaysAsk: posture === 'Proactive' ? 'Ask before applying anything.' : '',
    watch: posture === 'Proactive' ? ['Pending placement or connection changes.'] : []
  });

async function connection(fixture, mode = 'indexed') {
  const { placeId, actorId: owner } = fixture;
  const plan = fixture.sources.planConnection({ placeId, owner, kind: 'drive', syncMode: mode }, { actorId: owner });
  const { sourceId, kind, syncMode, recipe } = plan;
  return { plan, act: { area: 'sources', action: 'connect-and-map', placeId,
    payload: { sourceId, kind, syncMode, recipe, planFingerprint: await connectionPlanFingerprint(plan) } } };
}

test('Atlas source proposals require an explicit request, scoped grant, and the active Place owner', async t => {
  const f = fixture(t);
  const { records, lens, visitor, placeId, otherPlaceId } = f;
  const { act } = await connection(f);
  await envelope(records, lens, ['sources'], 'Proactive');
  await assert.rejects(() => records.requireInitiative(lens, 'sources', 'suggest', asked), grantError);
  await assert.rejects(() => records.proposeExtension(lens, act, words, asked), grantError);
  await grant(records, lens, ['sources'], 'look');
  await assert.rejects(() => records.proposeExtension(lens, act, words, asked), grantError);
  await grant(records, lens, ['sources'], 'suggest');
  await assert.rejects(() => records.requireInitiative(lens, 'sources', 'suggest', { requested: false }), /ask|request/i);
  await assert.rejects(() => records.proposeExtension(lens, act, words, { requested: false }), /ask|request/i);
  await assert.rejects(() => records.proposeExtension(lens, act, words), /ask|request/i);
  const p = await records.proposeExtension(lens, act, words, asked);
  await assert.rejects(() => records.confirm(lens, p.id, () => assert.fail('Suggest grants cannot apply')), grantError);

  await grant(records, visitor, ['sources']);
  await envelope(records, visitor, ['sources']);
  await assert.rejects(() => records.proposeExtension(visitor, { ...act, placeId }, words, asked), /own|Place/i);
  await assert.rejects(() => records.proposeExtension(lens, { ...act, placeId: otherPlaceId }, words, asked), /own|Place/i);
  for (const profile of [{ ...lens, preview: true }, { ...lens, isAgent: true }]) {
    await assert.rejects(async () => records.proposeExtension(profile, act, words, asked), /own|profile|Preview/i);
  }
  assert.equal(f.sources.view(act.payload.sourceId, { actorId: f.actorId }), null);
  assert.ok(!records.state(lens).receipts.some(entry => entry.action === 'atlas_confirmed' && entry.diff.id === p.id));
});

test('Only a matching live Atlas confirmation can apply the source plan, and both Receipt chains survive reopen', async t => {
  const f = fixture(t);
  const { records, lens, visitor, actorId, placeId, otherPlaceId, sources, storage } = f;
  const grantRecord = await grant(records, lens, ['sources']);
  const initiative = await envelope(records, lens, ['sources']);
  const { plan, act } = await connection(f);
  const { plan: differentPlan } = await connection(f, 'snapshot');
  const pending = await records.proposeExtension(lens, act, words, asked);
  const recordScope = { area: act.area, action: act.action, placeId, proposalReceipt: pending.receipt };
  const bogus = '0'.repeat(64);
  await assert.rejects(() => sources.commitConnection(plan, { lens, records, proposalReceipt: pending.receipt, confirmationReceipt: bogus }));
  assert.equal(sources.view(plan.sourceId, { actorId }), null);

  const reopened = new AtlasRecords(storage);
  assert.equal(reopened.state(lens).proposals.find(p => p.id === pending.id).receipt, pending.receipt);
  await assert.rejects(() => reopened.confirm(visitor, pending.id, () => assert.fail('Another Lens cannot confirm')), /profile|open|proposal/i);
  let receipts;
  const applied = await reopened.confirm(lens, pending.id, async (_value, confirmed) => {
    receipts = confirmed;
    const proof = { ...recordScope, ...confirmed };
    assert.equal(proof.proposalReceipt, pending.receipt);
    for (const patch of [
      { area: 'build' }, { action: 'declare-upload' }, { placeId: otherPlaceId },
      { proposalReceipt: bogus }, { confirmationReceipt: bogus }
    ]) {
      await assert.rejects(() => reopened.verifyExtension(lens, { ...proof, ...patch }));
    }
    await assert.rejects(() => reopened.verifyExtension(visitor, proof));
    await assert.rejects(() => new AtlasRecords(storage).verifyExtension(lens, proof));
    assert.deepEqual(await reopened.verifyExtension(lens, proof), act.payload);
    await assert.rejects(() => sources.commitConnection(differentPlan, { lens, records: reopened, ...confirmed }), /match/i);
    return sources.commitConnection(plan, { lens, records: reopened, ...confirmed });
  });
  assert.equal(applied.result.mapping.approvedBy, actorId);
  assert.equal(applied.result.mapping.status, 'approved');
  await assert.rejects(() => reopened.verifyExtension(lens, { ...recordScope, ...receipts }));
  await assert.rejects(() => new AtlasRecords(storage).confirm(lens, pending.id, () => assert.fail('An applied proposal cannot replay')));

  const connected = new ConnectedSources({ storage });
  assert.equal(connected.view(plan.sourceId, { actorId }).source.simulated, true);
  const entries = records.state(lens).receipts;
  const proposed = entries.find(entry => entry.hash === pending.receipt);
  const confirmed = entries.find(entry => entry.hash === receipts.confirmationReceipt);
  const outcome = entries.find(entry => entry.hash === applied.receipt);
  assert.equal(proposed.actor, 'atlas');
  assert.equal(confirmed.actor, actorId);
  assert.equal(confirmed.diff.proposalReceipt, proposed.hash);
  assert.equal(outcome.actor, 'atlas');
  assert.equal(outcome.diff.proposalReceipt, proposed.hash);
  assert.equal(outcome.diff.confirmationReceipt, confirmed.hash);
  assert.deepEqual(proposed.diff.basis, {
    requested: true, grants: { sources: grantRecord.id }, envelopes: { sources: initiative.receipt }
  });
  assert.equal((await verifyChain(records.read().receipts)).valid, true);
  const sourceReceipts = connected.receipts(plan.sourceId, { actorId });
  assert.equal((await verifyChain(sourceReceipts)).valid, true);
  assert.equal(sourceReceipts.find(entry => entry.action === 'source_mapping_proposed').diff.proposalReceiptId, proposed.hash);
  assert.equal(sourceReceipts.find(entry => entry.action === 'source_mapping_approved').diff.confirmationReceiptId, confirmed.hash);
});

test('Authority is checked fresh after narrowing, revocation, lease expiry, and when a proposal is superseded', async t => {
  const f = fixture(t);
  const { records, lens, placeId } = f;
  const { act } = await connection(f);
  await envelope(records, lens, ['sources']);
  const first = await grant(records, lens, ['sources']);
  const narrowed = await records.proposeExtension(lens, act, words, asked);
  await records.narrow(lens, first.id, { areas: ['sources'], scope: 'suggest' });
  await assert.rejects(() => records.confirm(lens, narrowed.id, () => assert.fail('Narrowed grant applied')), grantError);
  const next = await grant(records, lens, ['sources']);
  const revoked = await records.proposeExtension(lens, act, words, asked);
  await records.revoke(lens, next.id);
  await grant(records, lens, ['sources']);
  await assert.rejects(() => records.confirm(lens, revoked.id, () => assert.fail('Revoked grant applied')), grantError);
  const leased = await grant(records, lens, ['sources'], 'edit', 60_000);
  const timed = await records.proposeExtension(lens, act, words, asked);
  const expiry = Date.parse(records.state(lens).grants.find(g => g.id === leased.id).expires);
  const clock = t.mock.method(Date, 'now', () => expiry + 1);
  await assert.rejects(() => records.confirm(lens, timed.id, () => assert.fail('Expired grant applied')), grantError);
  clock.mock.restore();

  await grant(records, lens, ['sources']);
  const beforePostureChange = await records.proposeExtension(lens, act, words, asked);
  await envelope(records, lens, ['sources'], 'Quiet');
  await assert.rejects(() => records.confirm(lens, beforePostureChange.id, () => assert.fail('Changed initiative applied')), /initiative/i);
  const old = await records.proposeExtension(lens, act, words, asked);
  const { act: refreshed } = await connection(f, 'snapshot');
  const replacement = await records.proposeExtension(lens, refreshed, 'Use this updated connection plan.', { ...asked, supersedes: old.id });
  await assert.rejects(() => records.confirm(lens, old.id, () => assert.fail('Superseded proposal applied')), /proposal|open|supersed/i);
  await records.confirm(lens, replacement.id, async (value, refs) => {
    assert.deepEqual(await records.verifyExtension(lens, { ...refs, area: refreshed.area, action: refreshed.action, placeId }), refreshed.payload);
  });
});

test('Manual edits and source mapping remain available to the owner without an Atlas grant', async t => {
  const { records, lens, visitor, actorId, visitorId, placeId, storage, sources } = fixture(t);
  const builder = new Builder({ storage });
  assert.deepEqual(records.state(lens).grants, []);
  const draft = await builder.add(placeId, lens, 'bench');
  assert.equal(draft.pieces.find(piece => piece.kind === 'bench').kind, 'bench');
  await assert.rejects(() => builder.add(placeId, visitor, 'bench'), /owner/);
  await assert.rejects(() => sources.create({ placeId, owner: actorId, kind: 'drive' }, { actorId: visitorId }), /owner/);
  const source = await sources.create({ placeId, owner: actorId, kind: 'drive' }, { actorId });
  const mapping = await sources.proposeMapping(source.id, 'drive-alcoves', { actorId });
  await assert.rejects(() => sources.approveMapping(source.id, mapping.id, { actorId: visitorId }), /owner/);
  assert.equal((await sources.approveMapping(source.id, mapping.id, { actorId })).approvedBy, actorId);
  assert.equal(records.state(lens).receipts.length, 0);
});

test('Placing a source and publishing a draft require edit authority for both Sources and Build', async t => {
  const { records, lens, placeId } = fixture(t);
  const spokenGrant = atlasIntent('Give Atlas standing edit access for Build and Sources.');
  assert.deepEqual(spokenGrant, { kind: 'grant', areas: ['build', 'sources'], scope: 'edit', durationMs: null });
  const sourceGrant = await grant(records, lens, ['sources']);
  const sourceEnvelope = await envelope(records, lens, ['sources']);
  const buildEnvelope = await envelope(records, lens, ['build'], 'Proactive');
  const actions = [
    { action: 'place-source', payload: {
      reference: { kind: 'upload', sourceId: 'fixture-upload', itemId: crypto.randomUUID() }, position: [-2.5, 0, -1.5]
    } },
    { action: 'publish-draft', payload: { previewReceiptId: 'builder:' + 'a'.repeat(64) } }
  ].map(act => ({ ...act, area: 'sources', placeId }));
  for (const act of actions) {
    await assert.rejects(() => records.proposeExtension(lens, act, words, asked), /build/i);
  }
  const buildGrant = await grant(records, lens, ['build']);
  const pending = await Promise.all(actions.map(act => records.proposeExtension(lens, act, words, asked)));
  for (const p of pending) {
    assert.deepEqual(p.basis, { requested: true, grants: { sources: sourceGrant.id, build: buildGrant.id },
      envelopes: { sources: sourceEnvelope.receipt, build: buildEnvelope.receipt } });
  }
  await records.narrow(lens, buildGrant.id, { areas: ['build'], scope: 'suggest' });
  for (const p of pending) {
    await assert.rejects(() => records.confirm(lens, p.id, () => assert.fail('Build authority is required')), /build|grant/i);
  }
  await records.narrow(lens, sourceGrant.id, { areas: ['sources'], scope: 'suggest' });
  await grant(records, lens, ['build']);
  for (const act of actions) {
    const p = await records.proposeExtension(lens, act, words, asked);
    await assert.rejects(() => records.confirm(lens, p.id, () => assert.fail('Sources authority is required')), /sources|grant/i);
  }
  await grant(records, lens, ['sources']);
  const declaration = await records.proposeExtension(lens, { area: 'sources', action: 'declare-upload', placeId,
    payload: { itemId: crypto.randomUUID(), scores: scores(), assessmentReceiptId: crypto.randomUUID() } }, words, asked);
  await records.confirm(lens, declaration.id, async (value, refs) => {
    const confirmed = await records.verifyExtension(lens, { area: value.area, action: value.action, placeId, ...refs });
    assert.deepEqual(confirmed, declaration.value.payload);
  });
});

test('Corrupt Atlas Receipts deny an otherwise active grant before work starts', async t => {
  const f = fixture(t);
  const { records, lens, storage } = f;
  await grant(records, lens, ['sources']);
  const data = records.read();
  data.receipts[0].actor = 'unknown';
  const raw = JSON.stringify(data);
  storage().setItem(ATLAS_RECORDS_KEY, raw);
  const reopened = new AtlasRecords(storage);
  const { act } = await connection(f);
  await assert.rejects(() => reopened.requireInitiative(lens, 'sources', 'suggest', asked), /receipt verification/i);
  await assert.rejects(() => reopened.proposeExtension(lens, act, words, asked), /receipt verification/i);
  assert.equal(storage().getItem(ATLAS_RECORDS_KEY), raw);
});

test('Builder place and move use live Atlas confirmations and leave old ungranted proposals inert', async t => {
  const { records, lens, visitor, actorId, placeId, storage } = fixture(t);
  const builder = new Builder({ storage, atlasRecords: records });
  await grant(records, lens, ['sources']);
  await assert.rejects(() => builder.propose(placeId, lens, 'Place a bench'), /build/i);
  const authority = await grant(records, lens, ['build']);
  await envelope(records, lens, ['build'], 'Quiet');
  const pending = await builder.propose(placeId, lens, 'Place a bench');
  assert.equal(builder.open(placeId, lens).pieces.length, 0);
  const placeRecord = records.state(lens).proposals.find(p => p.id === pending.id);
  assert.equal(placeRecord.value.action, 'place-piece');
  assert.deepEqual(placeRecord.value.payload, { kind: 'bench' });
  await assert.rejects(() => builder.accept(placeId, visitor, pending.id), /owner/i);

  const reopened = new Builder({ storage });
  const placed = await reopened.accept(placeId, lens, pending.id);
  const [piece] = placed.pieces;
  assert.equal(piece.kind, 'bench');
  assert.equal(placed.pieces.length, 1);
  await assert.rejects(() => reopened.accept(placeId, lens, pending.id), /pending|open/i);
  const initialPosition = piece.transform.position;
  const stale = await reopened.propose(placeId, lens, 'Move the bench left');
  await records.revoke(lens, authority.id);
  await grant(records, lens, ['build']);
  await assert.rejects(() => reopened.accept(placeId, lens, stale.id), grantError);
  assert.deepEqual(reopened.open(placeId, lens).pieces[0].transform.position, initialPosition);

  const move = await reopened.propose(placeId, lens, 'Move the bench left');
  assert.deepEqual(records.state(lens).proposals.find(p => p.id === move.id).value.payload, { pieceId: piece.id, move: [-1, 0] });
  const moved = await reopened.accept(placeId, lens, move.id);
  const movedPosition = [initialPosition[0] - 1, ...initialPosition.slice(1)];
  assert.deepEqual(moved.pieces[0].transform.position, movedPosition);
  const stored = JSON.parse(storage().getItem(BUILDER_STORAGE));
  const actual = stored.receipts.filter(r => r.action === 'build_proposal_accepted');
  assert.deepEqual(actual.map(r => r.diff.proposalReceipt), [pending.receiptId, move.receiptId]);
  for (const receipt of actual) {
    const shared = records.state(lens).receipts.find(r => r.hash === receipt.diff.confirmationReceipt);
    assert.equal(shared.action, 'atlas_confirmed');
    assert.equal(shared.actor, actorId);
    assert.equal(shared.diff.proposalReceipt, receipt.diff.proposalReceipt);
  }

  const legacy = { id: 'old-builder-proposal', text: 'Place a bench', summary: 'Place bench.',
    status: 'pending', change: { kind: 'bench' } };
  const prior = await appendEntry(stored.receipts, 'atlas', 'build_proposed', {
    roomKey: placeId, ownerId: actorId, proposalId: legacy.id, change: legacy.change, mode: 'scripted'
  });
  stored.drafts[placeId].proposals.push({ ...legacy, receiptId: 'builder:' + prior.hash });
  storage().setItem(BUILDER_STORAGE, JSON.stringify(stored));
  const existing = new Builder({ storage });
  await assert.rejects(() => existing.accept(placeId, lens, legacy.id), /pending|open/i);
  assert.equal(existing.open(placeId, lens).pieces.length, 1);
  assert.deepEqual(existing.open(placeId, lens).pieces[0].transform.position, movedPosition);
  assert.equal((await verifyChain(stored.receipts)).valid, true);
});
