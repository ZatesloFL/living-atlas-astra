import { appendEntry, canonical, verifyChain } from './ledger.js';
import { scores } from './scores.js';
import { SOURCE_CONVERSATION_KEY } from './source-conversation.js';
import { videoReference } from './source-media.js';
import { mockEditorURL, mockGallery, mockItems, mockSourceSpecs } from './source-mocks.js';

export const SOURCE_KEY = 'living-atlas.mock-sources.v1';
export const SOURCE_CACHE_MS = 30_000;
export const SYNC_MODES = ['live', 'indexed', 'snapshot'];
export const WRITE_OPERATIONS = ['rename', 'move', 'comment'];
export const mockGalleryOrganization = mockGallery.organization;
export const catalogSourceSpecs = mockSourceSpecs;

const nowISO = now => new Date(now).toISOString();
const validText = (value, limit) => typeof value === 'string' && value.trim().length > 0 && value.length <= limit;
const canSeeSource = (source, actorId) => source.scope.visibility === 'public' || source.owner === actorId;
const canSeeItem = (item, source, actorId) => source.owner === actorId ||
  item.visibility === 'public' && item.rights !== 'private';
const available = item => item && item.available !== false && ['public-domain', 'rights-reserved', 'private'].includes(item.rights);
const currentMetadata = item => ({
  id: item.id, kind: item.kind, title: item.title, folderId: item.folderId, date: item.date ?? null,
  rights: item.rights, visibility: item.visibility, lastModified: item.lastModified ?? null
});
const clone = value => structuredClone(value);
const byDate = (a, b) => String(a.date ?? '').localeCompare(String(b.date ?? '')) || a.id.localeCompare(b.id);
const emptyState = () => ({ version: 1, sources: {}, ledgers: {} });
const unsignedPublicId = value => typeof value === 'string' && /^[a-z0-9][a-z0-9_/-]*$/i.test(value);
const findSource = (state, id) => Object.hasOwn(state.sources, id) ? state.sources[id] : null;
const blockId = (source, itemId) => 'source-' + source.id + '/item-' + itemId;
const modeLabels = { live: 'Live reference', indexed: 'Fed by the source', snapshot: 'Simulated snapshot' };
const recipeLabels = {
  'gallery-plinths': 'One plinth for each gallery record in this Place.',
  'drive-alcoves': 'Each folder becomes an alcove in this Place, with file previews inside.'
};

export function layoutSourcePlacements(placements, offset = 0) {
  return placements.map((piece, index) => {
    const slot = offset + index;
    return { ...piece, position: [((slot % 3) - 1) * 2.9, -Math.floor(slot / 3) * 2.8 - 1.5] };
  });
}

async function contentHash(value) {
  const bytes = new TextEncoder().encode(canonical(value));
  const hash = await crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(hash)].map(byte => byte.toString(16).padStart(2, '0')).join('');
}

export const connectionPlanFingerprint = plan => contentHash(plan);

async function mappingConsent(storage, plan, actorId, proposalReceiptId, confirmationReceiptId) {
  const validRef = ref => typeof ref === 'string' && /^source-conversation:[a-f0-9]{64}$/.test(ref);
  if (!validRef(proposalReceiptId) || !validRef(confirmationReceiptId)) return false;
  let state;
  try { state = JSON.parse(storage?.getItem(SOURCE_CONVERSATION_KEY) ?? 'null'); }
  catch { return false; }
  const receipts = state?.receipts;
  if (state?.version !== 1 || !Array.isArray(receipts) || !(await verifyChain(receipts)).valid) return false;
  const byRef = ref => receipts.find(entry => 'source-conversation:' + entry.hash === ref);
  const proposal = byRef(proposalReceiptId), confirmation = byRef(confirmationReceiptId);
  if (proposal?.action !== 'source_conversation_proposed' || proposal.actor !== 'atlas' ||
    confirmation?.action !== 'source_conversation_confirmed' || confirmation.actor !== actorId ||
    proposal.id >= confirmation.id) return false;
  const proposed = proposal.diff, confirmed = confirmation.diff;
  if (proposed?.kind !== 'mapping' || confirmed?.kind !== 'mapping' || proposed.id !== confirmed.id ||
    confirmed.proposalReceiptId !== proposalReceiptId || proposed.grantId !== confirmed.grantId ||
    proposed.placeId !== plan.placeId || confirmed.placeId !== plan.placeId ||
    proposed.ownerId !== actorId || confirmed.ownerId !== actorId) return false;
  const { sourceId, kind, syncMode, recipe } = plan;
  if (canonical(proposed.data) !== canonical({ sourceId, kind, syncMode, recipe,
    planFingerprint: await connectionPlanFingerprint(plan) })) return false;
  const grant = receipts.find(entry => entry.action === 'source_conversation_granted' &&
    entry.actor === actorId && entry.diff?.grantId === proposed.grantId && entry.diff.placeId === plan.placeId &&
    entry.diff.scope === 'suggest' && Array.isArray(entry.diff.actions) && entry.diff.actions.includes('mapping'));
  return !!grant && grant.id < proposal.id && !receipts.some(entry => entry.id > proposal.id &&
    entry.diff?.grantId === proposed.grantId && (entry.action === 'source_conversation_revoked' ||
      entry.diff.id === proposed.id && (entry.action === 'source_conversation_proposed' ||
        entry.action === 'source_conversation_declined' ||
        entry.id > confirmation.id && ['source_conversation_confirmed','source_conversation_outcome'].includes(entry.action))));
}

function activity(record, actorId, now) {
  const grant = record.grants.findLast(item => item.to.person === actorId && !item.revokedAt &&
    Date.parse(item.expires) > now);
  return grant ? [...grant.operations] : [];
}

function publicSource(record, actorId, now) {
  const operations = record.source.syncMode === 'snapshot' ? [] : activity(record, actorId, now);
  return { ...record.source, writeEnabled: operations.length > 0, writeOperations: operations };
}

function projectItem(item, source, syncedAt) {
  const image = item.kind === 'artwork';
  const folder = item.kind === 'folder';
  const description = item.available === false ? 'The source item is unavailable or its rights have changed.' :
    item.description ?? (folder ? 'A folder in the simulated archive.' : 'The source has not supplied a preview.');
  const block = {
    id: blockId(source, item.id), type: image ? 'image' : 'text', importance: 'core', content: scores(),
    body: folder ? item.title + ' · mock folder' : image ? item.title : description,
    reps: { text: description, ...(image ? { alt: description } : {}) },
    styleControl: item.rights === 'public-domain' ? 'open' : 'fixed',
    sources: [], state: item.available === false ? 'unavailable' : 'ready',
    source: {
      sourceId: source.id, itemId: item.id, url: null, syncedAt, rights: item.rights,
      label: source.label, mode: source.syncMode, simulated: true, kind: source.kind,
      owner: source.owner, visibility: item.visibility, status: item.available === false ? 'unavailable' : 'ready'
    }
  };
  if (image && item.available !== false && Number.isInteger(item.scene)) {
    block.sourceMedia = { kind: 'procedural-gallery', scene: item.scene };
  }
  return block;
}

function presentItem(item, source) {
  const result = {
    ...currentMetadata(item),
    available: item.available !== false,
    preview: item.description ?? null,
    comments: item.comments ?? [],
    editorURL: null
  };
  if (source.kind === 'drive' && source.syncMode !== 'snapshot' && result.available && item.kind === 'document') {
    result.editorURL = mockEditorURL(source, item.id);
  }
  return result;
}

function placement(block, item) {
  return { itemId: item.id, blockId: block.id, kind: item.kind === 'folder' ? 'alcove' : 'plinth', facing: 0 };
}

function mockRecord({ id, placeId, owner, kind, label }) {
  const spec = mockSourceSpecs[kind];
  const drive = kind === 'drive';
  const source = {
    id, owner, placeId, kind, label: label?.trim() ?? spec.label, simulated: true,
    connector: drive ? 'mock-drive' : 'mock-gallery',
    scope: { visibility: drive ? 'private' : 'public', selection: drive ? 'the mock folder' : 'mock collection' },
    syncMode: spec.syncMode, rightsDefault: spec.rightsDefault, status: 'mapping-pending', lastSync: null
  };
  return { source, mapping: null, proposal: null, index: [], snapshot: null, overrides: {}, grants: [] };
}

function prepareMockRecord(state, { placeId, owner, kind, label, id }, actorId) {
  if (!Object.hasOwn(mockSourceSpecs, kind) || owner !== actorId || !unsignedPublicId(owner) || !unsignedPublicId(placeId)) {
    throw new Error('Choose a mock source and its approving owner.');
  }
  const sourceId = id ?? placeId + '/source-' + (kind === 'drive' ? 'drive' : 'gallery');
  const formerOwner = Object.hasOwn(state.ledgers, sourceId) ? state.ledgers[sourceId][0]?.actor : null;
  if (!unsignedPublicId(sourceId) || sourceId in state.sources || formerOwner && formerOwner !== owner ||
    label != null && !validText(label, 100)) {
    throw new Error('This mock source is already attached or has invalid metadata.');
  }
  return mockRecord({ id: sourceId, placeId, owner, kind, label });
}

export class ConnectedSources {
  constructor({ storage = () => globalThis.localStorage, clock = () => Date.now(), gallery = mockGallery } = {}) {
    this.storage = typeof storage === 'function' ? storage : () => storage;
    this.clock = clock;
    this.gallery = gallery;
    this.state = emptyState();
    this.cache = new Map();
    this.known = new Map();
    this.served = new Map();
    this.queue = Promise.resolve();
    this.raw = null;
    try {
      const serialized = this.storage()?.getItem(SOURCE_KEY) ?? null;
      this.raw = serialized;
      if (serialized) {
        const state = JSON.parse(serialized);
        if (state.version !== 1 || !state.sources || !state.ledgers) throw new Error('Unknown source data');
        this.state = state;
      }
    } catch {
      this.warning = 'Saved mock sources could not be loaded. The catalog is session only.';
    }
    this.ready = Promise.all(Object.values(this.state.ledgers).map(verifyChain))
      .then(results => results.every(result => result.valid)).catch(() => false);
  }

  transaction(operation, { requireStorage = false } = {}) {
    const write = async () => {
      if (!await this.ready) throw new Error('Mock source Receipts failed verification.');
      let storage;
      try { storage = this.storage(); }
      catch { this.warning = 'Browser storage is blocked. Mock source changes stay in this session.'; }
      const assertFresh = () => {
        if (!storage) return;
        let latest;
        try { latest = storage.getItem(SOURCE_KEY) ?? null; }
        catch {
          storage = null;
          this.warning = 'Browser storage is blocked. Mock source changes stay in this session.';
          return;
        }
        if (latest !== this.raw) throw new Error('Sources changed in another tab. Reload before changing them.');
      };
      assertFresh();
      const staged = clone(this.state);
      const result = await operation(staged);
      assertFresh();
      if (storage) {
        try {
          const serialized = JSON.stringify(staged);
          storage.setItem(SOURCE_KEY, serialized);
          this.raw = serialized;
        } catch {
          storage = null;
          this.warning = 'Browser storage is blocked. Mock source changes stay in this session.';
        }
      }
      if (requireStorage && !storage) throw new Error('Browser storage is needed to keep this connection and its Receipts.');
      this.state = staged;
      this.cache.clear();
      for (const key of this.known.keys()) if (!findSource(staged, key)) this.known.delete(key);
      return clone(result);
    };
    const job = this.queue.then(() => globalThis.navigator?.locks
      ? navigator.locks.request(SOURCE_KEY, write) : write());
    this.queue = job.catch(() => {});
    return job;
  }

  owner(state, sourceId, actorId) {
    const record = findSource(state, sourceId);
    if (!record || record.source.owner !== actorId) throw new Error('Only the source owner can change this connection.');
    return record;
  }

  ledger(state, sourceId) {
    return state.ledgers[sourceId] ??= [];
  }

  provider(record) {
    return mockItems(record.source, this.gallery).map(item => ({ ...item, ...record.overrides[item.id] }));
  }

  syncRecord(record, now) {
    record.source.lastSync = nowISO(now);
    const index = new Map(record.index.map(item => [item.id, item]));
    for (const item of this.provider(record)) index.set(item.id, currentMetadata(item));
    record.index = [...index.values()];
  }

  ensureGallery({ placeId, owner, id = placeId + '/source-gallery' }) {
    if (![placeId, owner, id].every(unsignedPublicId)) throw new Error('The gallery seed has invalid source IDs.');
    const existing = findSource(this.state, id);
    if (existing) {
      if (existing.source.kind !== 'collection-db' || existing.source.placeId !== placeId || existing.source.owner !== owner) {
        throw new Error('The gallery seed conflicts with an existing source.');
      }
      if (existing.seeded && existing.source.syncMode === 'indexed') this.syncRecord(existing, this.clock());
      return clone(existing.source);
    }
    if (id in this.state.sources) throw new Error('The gallery source ID is reserved.');
    const record = mockRecord({ id, placeId, owner, kind: 'collection-db' });
    record.seeded = true;
    // A hand-authored demo recipe is supplied with the collection. Subsequent owner approvals are receipted.
    record.mapping = { id: id + '/mapping', recipe: 'gallery-plinths', status: 'approved', seeded: true, sourceId: id, receiptRef: null };
    record.source.status = 'ready';
    this.syncRecord(record, this.clock());
    this.state.sources[id] = record;
    return clone(record.source);
  }

  list(placeId, { actorId } = {}) {
    return clone(Object.values(this.state.sources).filter(record => record.source.placeId === placeId &&
      canSeeSource(record.source, actorId)).map(record => publicSource(record, actorId, this.clock())));
  }

  receipts(sourceId, { actorId } = {}) {
    const record = findSource(this.state, sourceId);
    const receipts = Object.hasOwn(this.state.ledgers, sourceId) ? this.state.ledgers[sourceId] : [];
    const owner = record?.source.owner ?? receipts[0]?.actor;
    return owner && owner === actorId ? clone(receipts) : [];
  }

  liveItems(record, actorId, now, remember = true) {
    const source = record.source;
    const current = this.provider(record);
    const currentById = new Map(current.map(item => [item.id, item]));
    const known = this.known.get(source.id) ?? [];
    const cacheKey = source.id + ':' + (actorId ?? 'public');
    const indexed = source.syncMode === 'indexed';
    let cache = indexed || !remember ? null : this.cache.get(cacheKey);
    if (!indexed && remember && (!cache || cache.expires <= now)) {
      cache = { capturedAt: nowISO(now), expires: now + SOURCE_CACHE_MS, items: current.filter(
        item => available(item) && canSeeItem(item, source, actorId)
      ) };
      this.cache.set(cacheKey, cache);
    }
    const cached = new Map((cache?.items ?? []).map(item => [item.id, item]));
    const candidates = indexed ? record.index : [...new Map([...record.index, ...known, ...current.map(currentMetadata)]
      .map(item => [item.id, item])).values()];
    if (!indexed && remember) this.known.set(source.id, candidates);
    const items = candidates.flatMap(prior => {
      const item = currentById.get(prior.id);
      if (!canSeeItem(item ?? prior, source, actorId)) return [];
      if (!available(item)) return [{ ...prior, title: 'Source item unavailable', rights: 'unavailable', available: false }];
      const cachedItem = cached.get(prior.id);
      const useCached = !indexed && cachedItem?.rights === item.rights &&
        cachedItem?.visibility === item.visibility && cachedItem?.lastModified === item.lastModified;
      return [useCached ? cachedItem : item];
    });
    return { items, syncedAt: cache?.capturedAt ?? source.lastSync };
  }

  view(sourceId, { actorId, includeExcluded = false } = {}) {
    const record = findSource(this.state, sourceId);
    if (!record || !canSeeSource(record.source, actorId)) return null;
    return clone(this.viewRecord(record, actorId, this.clock(), { includeExcluded }));
  }

  viewRecord(record, actorId, now, { remember = true, includeExcluded = false } = {}) {
    const source = publicSource(record, actorId, now);
    const sourceId = source.id;
    const isExcluded = item => record.excludedItems?.includes(item.id) === true;
    const management = includeExcluded && source.owner === actorId;
    if (source.kind === 'public-api') {
      const { id, title, url } = record.video;
      const item = { id, title, kind: 'video', rights: source.rightsDefault, available: true };
      if (isExcluded(item)) {
        return { source, mapping: record.mapping, items: management ? [{ ...item, excluded: true }] : [],
          blocks: [], placements: [], status: 'ready' };
      }
      const block = {
        id: blockId(source, id), type: 'video', importance: 'core', body: title,
        content: scores(), styleControl: 'fixed', reps: { video: url, alt: title }, sources: [],
        source: { sourceId, itemId: id, url, syncedAt: null, rights: source.rightsDefault, label: source.label,
          mode: 'live', kind: 'public-api', status: 'ready', visibility: source.scope.visibility, owner: source.owner },
        sourceMedia: { kind: 'video', url }, state: 'ready'
      };
      return { source, mapping: record.mapping, items: [item], blocks: [block], placements: [], status: 'ready' };
    }
    if (!record.mapping) {
      return { source, mapping: null, pendingMapping: source.owner === actorId ? record.proposal : null,
        items: [], blocks: [], placements: [], status: 'mapping-pending' };
    }
    const frozen = source.syncMode === 'snapshot';
    const { items, syncedAt } = frozen
      ? { items: (record.snapshot?.items ?? []).filter(item => canSeeItem(item, source, actorId)),
        syncedAt: record.snapshot?.capturedAt ?? null }
      : this.liveItems(record, actorId, now, remember);
    source.lastSync = syncedAt;
    const ordered = source.kind === 'collection-db' ? items.slice().sort(byDate) : items;
    const included = ordered.filter(item => !isExcluded(item));
    const blocks = included.map(item => projectItem(item, source, syncedAt));
    const placed = included.flatMap((item, index) => item.kind === 'document' ? [] : [placement(blocks[index], item)]);
    return { source, mapping: record.mapping, pendingMapping: source.owner === actorId ? record.proposal : null,
      items: (management ? ordered : included).map(item => isExcluded(item)
        ? { ...currentMetadata(item), available: item.available !== false, excluded: true } : presentItem(item, source)),
      blocks, placements: placed, status: 'ready',
      snapshot: frozen && record.snapshot ? { hash: record.snapshot.hash, capturedAt: record.snapshot.capturedAt } : null };
  }

  connectionPlan(state, { placeId, owner, kind, syncMode }, actorId) {
    const record = prepareMockRecord(state, { placeId, owner, kind }, actorId);
    const source = record.source;
    if (syncMode !== undefined && !SYNC_MODES.includes(syncMode)) throw new Error('Choose a feeding mode for this simulated source.');
    source.syncMode = syncMode ?? source.syncMode;
    const recipe = mockSourceSpecs[kind].recipe;
    const { id: sourceId, label: sourceLabel } = source;
    const mapping = { sourceId, recipe, status: 'pending' };
    record.mapping = mapping;
    // Project through the normal adapter without touching storage, caches, or Receipts.
    const current = this.provider(record), now = this.clock();
    record.index = current.map(currentMetadata);
    if (source.syncMode === 'snapshot') record.snapshot = { items: current.filter(available), capturedAt: null };
    const { blocks, items, placements } = this.viewRecord(record, actorId, now, { remember: false });
    const offset = Object.values(state.sources).filter(candidate =>
      candidate.source.placeId === placeId && canSeeSource(candidate.source, actorId))
      .reduce((count, candidate) => count + this.viewRecord(candidate, actorId, now, { remember: false }).placements.length, 0);
    return {
      placeId, owner, kind, sourceId, sourceLabel, syncMode: source.syncMode, modeLabel: modeLabels[source.syncMode],
      scope: source.scope, recipe, recipeLabel: recipeLabels[recipe], mapping, blocks, items,
      placements: layoutSourcePlacements(placements, offset), simulated: true
    };
  }

  planConnection(input = {}, { actorId } = {}) {
    return clone(this.connectionPlan(this.state, input, actorId));
  }

  commitConnection(plan, { actorId, proposalReceiptId, confirmationReceiptId } = {}) {
    return this.transaction(async state => {
      if (!plan) throw new Error('Confirm the connection proposal before applying it.');
      const expected = this.connectionPlan(state, plan, actorId);
      if (canonical(plan) !== canonical(expected)) throw new Error('The source preview changed. Review a new proposal.');
      if (!await mappingConsent(this.storage(), expected, actorId, proposalReceiptId, confirmationReceiptId)) {
        throw new Error('Confirm this connection proposal with its scoped conversation Receipt.');
      }
      const { owner, kind, placeId, recipe, sourceId, syncMode } = expected;
      const record = mockRecord({ id: sourceId, placeId, owner, kind });
      record.source.syncMode = syncMode;
      const ledger = this.ledger(state, sourceId);
      if (Object.values(state.ledgers).some(entries => entries.some(entry =>
        entry.action === 'source_mapping_proposed' && entry.diff.proposalReceiptId === proposalReceiptId))) {
        throw new Error('That proposal Receipt has already been used.');
      }
      await appendEntry(ledger, actorId, 'source_attached', { sourceId, placeId, kind, simulated: true, syncMode });
      const proposal = { id: crypto.randomUUID(), recipe, status: 'pending', proposer: 'atlas', sourceId };
      await appendEntry(ledger, 'atlas', 'source_mapping_proposed',
        { sourceId, proposalId: proposal.id, recipe, proposalReceiptId });
      const receipt = await this.approveRecord(ledger, record, proposal, actorId, { confirmationReceiptId });
      state.sources[sourceId] = record;
      return { source: record.source, mapping: record.mapping,
        receipt: { id: 'source:' + receipt.hash, hash: receipt.hash, action: receipt.action, actor: receipt.actor } };
    }, { requireStorage: true });
  }

  create(input = {}, { actorId } = {}) {
    return this.transaction(async state => {
      const record = prepareMockRecord(state, input, actorId);
      const { id: sourceId, placeId, kind } = record.source;
      state.sources[sourceId] = record;
      await appendEntry(this.ledger(state, sourceId), actorId, 'source_attached', { sourceId, placeId, kind, simulated: true });
      return record.source;
    });
  }

  addVideoReference({ placeId, owner, title, url, visibility = 'private' } = {}, { actorId } = {}) {
    return this.transaction(async state => {
      const ref = videoReference(url);
      if (!ref || !validText(title, 150) || !unsignedPublicId(placeId) || !unsignedPublicId(owner) ||
        actorId !== owner || !['private', 'public'].includes(visibility)) {
        throw new Error('Choose an approved YouTube or Vimeo reference and its Place.');
      }
      const id = placeId + '/video-' + crypto.randomUUID();
      const source = { id, owner, placeId, kind: 'public-api', label: ref.provider,
        connector: ref.provider.toLowerCase(), scope: { visibility }, rightsDefault: 'hosted by ' + ref.provider,
        syncMode: 'live', status: 'ready', lastSync: null, simulated: false };
      const receipt = await appendEntry(this.ledger(state, id), actorId, 'source_video_referenced', { sourceId: id, placeId, provider: ref.provider });
      state.sources[id] = { source, video: { id: ref.id, title: title.trim(), url: ref.url }, grants: [],
        mapping: { id: id + '/mapping', recipe: 'hosted-video', status: 'approved', approvedBy: actorId, receiptRef: receipt.hash } };
      return source;
    });
  }

  proposeMapping(sourceId, recipe, { actorId } = {}) {
    return this.transaction(async state => {
      const record = this.owner(state, sourceId, actorId);
      if (recipe !== mockSourceSpecs[record.source.kind]?.recipe || !recipe) throw new Error('Choose the recipe for this mock source.');
      const proposal = { id: crypto.randomUUID(), recipe, status: 'pending', proposer: actorId, sourceId };
      record.proposal = proposal;
      await appendEntry(this.ledger(state, sourceId), actorId, 'source_mapping_proposed', { sourceId, proposalId: proposal.id, recipe });
      return proposal;
    });
  }

  approveMapping(sourceId, proposalId, { actorId } = {}) {
    return this.transaction(async state => {
      const record = this.owner(state, sourceId, actorId);
      const proposal = record.proposal;
      if (!proposal || proposal.id !== proposalId) throw new Error('That mapping proposal is unavailable.');
      await this.approveRecord(this.ledger(state, sourceId), record, proposal, actorId);
      return record.mapping;
    });
  }

  async approveRecord(ledger, record, proposal, actorId, references = {}) {
    const { id: sourceId, syncMode } = record.source;
    const receipt = await appendEntry(ledger, actorId, 'source_mapping_approved',
      { sourceId, proposalId: proposal.id, recipe: proposal.recipe, ...references });
    record.mapping = { ...proposal, status: 'approved', approvedBy: actorId, receiptRef: receipt.hash };
    record.proposal = null;
    record.source.status = 'ready';
    if (syncMode === 'snapshot') await this.captureSnapshot(ledger, record, actorId, this.clock());
    else this.syncRecord(record, this.clock());
    return receipt;
  }

  sync(sourceId, { actorId } = {}) {
    return this.transaction(async state => {
      const record = this.owner(state, sourceId, actorId);
      if (record.source.kind === 'public-api' || !record.mapping || record.source.syncMode === 'snapshot') {
        throw new Error('Choose a live or indexed mock source with an approved mapping.');
      }
      this.syncRecord(record, this.clock());
      await appendEntry(this.ledger(state, sourceId), actorId, 'source_synced',
        { sourceId, lastSync: record.source.lastSync, mode: record.source.syncMode });
      return record.source;
    });
  }

  setMode(sourceId, mode, { actorId } = {}) {
    return this.transaction(async state => {
      const record = this.owner(state, sourceId, actorId);
      if (record.source.kind === 'public-api' || !record.mapping || !SYNC_MODES.includes(mode)) {
        throw new Error('Choose a sync mode for the approved mock source.');
      }
      if (record.source.syncMode === mode) return record.source;
      const now = this.clock();
      if (mode === 'snapshot') {
        await this.captureSnapshot(this.ledger(state, sourceId), record, actorId, now);
      } else {
        record.snapshot = null;
        this.syncRecord(record, now);
        await appendEntry(this.ledger(state, sourceId), actorId, 'source_mode_changed', { sourceId, mode });
      }
      record.source.syncMode = mode;
      return record.source;
    });
  }

  async captureSnapshot(ledger, record, actorId, now) {
    const { id: sourceId } = record.source;
    const items = this.provider(record).filter(item => available(item) && canSeeItem(item, record.source, actorId));
    const capturedAt = nowISO(now);
    const hash = await contentHash({ sourceId, capturedAt, items });
    const receipt = await appendEntry(ledger, actorId, 'source_snapshot_created',
      { sourceId, capturedAt, hash, itemCount: items.length, simulated: true });
    record.snapshot = { items, capturedAt, hash, receiptRef: receipt.hash };
    record.source.lastSync = capturedAt;
  }

  grantWrite(sourceId, { holderId, operations = WRITE_OPERATIONS, expiresAt } = {}, { actorId } = {}) {
    return this.transaction(async state => {
      const record = this.owner(state, sourceId, actorId);
      const now = this.clock();
      const expires = expiresAt ?? nowISO(now + 86_400_000);
      if (record.source.kind !== 'drive' || !record.mapping || holderId !== record.source.owner ||
        !Array.isArray(operations) || !operations.length || operations.some(op => !WRITE_OPERATIONS.includes(op)) ||
        !Number.isFinite(Date.parse(expires)) || Date.parse(expires) <= now) {
        throw new Error('Choose a grant for the mock Drive holder, its operations and an expiry.');
      }
      const grant = { id: crypto.randomUUID(), room: record.source.placeId, to: { person: holderId }, scope: 'edit',
        sourceId, operations: [...new Set(operations)], expires, approvedBy: actorId, createdAt: nowISO(now), revokedAt: null };
      record.grants.push(grant);
      await appendEntry(this.ledger(state, sourceId), actorId, 'source_write_granted', { ...grant });
      return grant;
    });
  }

  revokeWrite(sourceId, grantId, { actorId } = {}) {
    return this.transaction(async state => {
      const record = this.owner(state, sourceId, actorId);
      const grant = record.grants.find(item => item.id === grantId && !item.revokedAt);
      if (!grant) throw new Error('That source grant is inactive.');
      grant.revokedAt = nowISO(this.clock());
      await appendEntry(this.ledger(state, sourceId), actorId, 'source_write_revoked', { sourceId, grantId });
      return grant;
    });
  }

  patch(sourceId, itemId, { op, value } = {}, { actorId } = {}) {
    return this.transaction(async state => {
      const record = findSource(state, sourceId);
      const now = this.clock();
      if (!record || !record.mapping || record.source.syncMode === 'snapshot' || !activity(record, actorId, now).includes(op)) {
        throw new Error('That write requires an active, scoped mock Drive grant.');
      }
      const items = this.provider(record);
      const item = items.find(candidate => candidate.id === itemId);
      if (!available(item) || !canSeeItem(item, record.source, actorId) || item.kind === 'folder') {
        throw new Error('This mock document is unavailable for editing.');
      }
      const update = record.overrides[itemId] ??= {};
      if (op === 'rename' && validText(value, 120)) update.title = value.trim();
      else if (op === 'move' && (value === null || items.some(folder =>
        folder.id === value && folder.kind === 'folder' && available(folder) && canSeeItem(folder, record.source, actorId)))) {
        update.folderId = value;
      } else if (op === 'comment' && validText(value, 1000)) {
        update.comments = [...(item.comments ?? []), { text: value.trim(), actorId, at: nowISO(now) }];
      } else throw new Error('The edit does not fit the allowed operation.');
      update.lastModified = nowISO(now);
      this.syncRecord(record, now);
      await appendEntry(this.ledger(state, sourceId), actorId, 'source_item_' + op,
        { sourceId, itemId, mode: record.source.syncMode });
      return presentItem({ ...item, ...update }, record.source);
    });
  }

  setMockAvailability(sourceId, itemId, isAvailable, { actorId } = {}) {
    return this.transaction(async state => {
      const record = this.owner(state, sourceId, actorId);
      if (record.source.kind === 'public-api' || !record.mapping || typeof isAvailable !== 'boolean' ||
        !this.provider(record).some(item => item.id === itemId)) {
        throw new Error('Choose a simulated source item.');
      }
      const update = record.overrides[itemId] ??= {};
      update.available = isAvailable;
      update.lastModified = nowISO(this.clock());
      await appendEntry(this.ledger(state, sourceId), actorId, 'mock_source_availability_changed',
        { sourceId, itemId, available: isAvailable, simulated: true });
      return true;
    });
  }

  setItemExcluded(sourceId, itemId, excluded, { actorId } = {}) {
    return this.transaction(async state => {
      const record = this.owner(state, sourceId, actorId);
      if (typeof excluded !== 'boolean' || !this.viewRecord(record, actorId, this.clock(),
        { remember: false, includeExcluded: true }).items.some(item => item.id === itemId)) {
        throw new Error('Choose a source item in this Place.');
      }
      const items = new Set(record.excludedItems ?? []);
      if (items.has(itemId) === excluded) return true;
      if (excluded) items.add(itemId);
      else items.delete(itemId);
      record.excludedItems = [...items];
      await appendEntry(this.ledger(state, sourceId), actorId, 'source_item_exclusion_changed',
        { sourceId, placeId: record.source.placeId, itemId, excluded });
      return true;
    });
  }

  videoPlacementState(placeId, thingId, { actorId } = {}) {
    if (typeof thingId !== 'string' || !thingId.startsWith('source-')) return null;
    const separator = thingId.lastIndexOf('/item-');
    if (separator < 0) return null;
    const sourceId = thingId.slice('source-'.length, separator);
    const record = findSource(this.state, sourceId);
    if (record) {
      const source = record.source;
      if (!record.video || source.placeId !== placeId || !canSeeSource(source, actorId) ||
        blockId(source, record.video.id) !== thingId) return null;
      return record.excludedItems?.includes(record.video.id) ? 'excluded' : null;
    }
    const receipt = Object.hasOwn(this.state.ledgers, sourceId) ? this.state.ledgers[sourceId].at(-1) : null;
    const video = receipt?.diff.videoPlacement;
    if (receipt?.action !== 'source_detached' || receipt.diff.placeId !== placeId || video?.thingId !== thingId ||
      (video.visibility !== 'public' && receipt.actor !== actorId)) return null;
    return video.excluded ? 'excluded' : video.visibility === 'public' ? 'unavailable-public' : 'unavailable';
  }

  markServed(sourceId, itemId, bytes, { actorId } = {}) {
    const view = this.view(sourceId, { actorId });
    const item = view?.items.find(candidate => candidate.id === itemId);
    if (!view?.source.simulated || !item?.available || !Number.isSafeInteger(bytes) || bytes <= 0) return false;
    this.served.set(sourceId, (this.served.get(sourceId) ?? 0) + bytes);
    return true;
  }

  meters({ actorId } = {}) {
    return Object.values(this.state.sources).filter(record => canSeeSource(record.source, actorId))
      .map(({ source }) => ({ placeId: source.placeId, sourceId: source.id, servedBytes: this.served.get(source.id) ?? 0, simulated: source.simulated }));
  }

  remove(sourceId, { actorId } = {}) {
    return this.transaction(async state => {
      const record = this.owner(state, sourceId, actorId);
      const { source, video } = record;
      const diff = { sourceId, placeId: source.placeId };
      if (video) diff.videoPlacement = {
        thingId: blockId(source, video.id), visibility: source.scope.visibility,
        excluded: record.excludedItems?.includes(video.id) === true
      };
      await appendEntry(this.ledger(state, sourceId), actorId, 'source_detached', diff);
      delete state.sources[sourceId];
      return true;
    });
  }
}

export const connectedSources = new ConnectedSources();
