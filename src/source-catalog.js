import { registerProjection } from './build-projection.js';
import { BUILDER_PIECES, isHostedSourceKind, makeBuilderPiece, validateBuilderPiece } from './builder-pieces.js';
import { connectedSources, layoutSourcePlacements, mockGalleryOrganization } from './connected-sources.js';
import { contentStore } from './content.js';
import { ROOMS } from './data.js';
import { permission, personId } from './permissions.js';
import { configureSourceMedia, isUploadSource, sourceStateMessage, sourceVisible, videoReference } from './source-media.js';
import { currentUploadHolder, uploadClient } from './source-session.js';
import { scores } from './scores.js';

export const GALLERY_PLACE = 'source-gallery';
const GALLERY_OWNER = 'simulated-gallery-owner';
const uploadInventory = new Map();
const refreshing = new Set();
const hostedSourceListeners = new Set();

function badge(source) {
  return {
    sourceId: source.sourceId ?? source.id, label: source.label,
    syncedAt: source.syncedAt ?? source.lastSync ?? null,
    rights: source.rights ?? source.rightsDefault,
    syncMode: source.syncMode ?? source.mode, status: source.status ?? 'ready',
    simulated: !!source.simulated
  };
}

function withSourceBadge(block) {
  return {...block, sourceBadge: badge(block.source)};
}

export function installGallery() {
  if (ROOMS[GALLERY_PLACE]) return GALLERY_PLACE;
  const source = connectedSources.ensureGallery({placeId: GALLERY_PLACE, owner: GALLERY_OWNER});
  const {blocks, mapping} = connectedSources.view(source.id);
  const fields = {
    title: mockGalleryOrganization.name,
    district: 'history',
    author: mockGalleryOrganization,
    organizationBadge: mockGalleryOrganization.organizationBadge,
    visibility: 'public',
    permissions: {style: 'open', substance: 'none', embed: 'approved'},
    styleControl: 'open',
    content: scores(),
    substance: {summary: 'A simulated collection. Source metadata supplies the plinths and rights for each Thing.'},
    sources: [source],
    sourceBadge: badge(source),
    mapping: mapping.id ?? source.id + '/mapping',
    blocks: blocks.map(block => ({...withSourceBadge(block), projectedSource: true}))
  };
  // The gallery is source catalog data. Arrival and discovery keep their own seeds.
  const pathId = 'source-gallery-square';
  const projection = {
    schemaVersion: 2, rootPlaceId: GALLERY_PLACE,
    rooms: [{
      placeId: GALLERY_PLACE, parentPlaceId: null, pathIds: [pathId], pieces: [], behaviors: [],
      layout: {
        kind: 'courtyard', model: 'none', scene: GALLERY_PLACE, slot: [0, 0], approach: [0, 6],
        sign: [mockGalleryOrganization.name, 'VERIFIED ORGANIZATION · SIMULATION', [0, 2, -8]]
      }
    }]
  };
  registerProjection({projection, changes: [
    {op: 'create', kind: 'Place', ref: {placeId: GALLERY_PLACE}, fields},
    {op: 'create', kind: 'Path', ref: {pathId}, fields: {
      from: GALLERY_PLACE, to: ROOMS.square.id, type: 'door', position: [5, 2], before: [4, 2], axis: 'x', contextPriority: -1
    }}
  ]}, {ownerId: GALLERY_OWNER});
  return GALLERY_PLACE;
}

function readsOwnedSources(room, lens) {
  return !!room?.ownerId && !!lens && room.ownerId === personId(lens) && !lens.isAgent;
}
const ownedRoom = (room, lens) => readsOwnedSources(room, lens) && !lens.preview;
const hostedPhoto = item => item?.contentType?.startsWith('image/') && !!item.declarationReceiptId;

function uploadBlock(item, room) {
  const kind = item.contentType.split('/')[0];
  const id = item.sourceId;
  const state = item.state === 'deleted' || item.state === 'deleting' ? 'deleted' : 'ready';
  const content = item.scores;
  return {
    id, type: kind === 'image' ? 'image' : kind === 'audio' ? 'audio' : 'text', importance: 'core',
    ...(state === 'ready' ? {body: item.filename} : {}), content, ownerId: room.ownerId, author: room.author, styleControl: 'fixed',
    recordVersionId: item.sha256,
    standing: {
      declarationRef: { versionId: item.sha256, receiptRef: item.declarationReceiptId },
      measurementRecordsRef: null, declarationRecordReadingRef: null
    },
    state,
    source: {
      sourceId: id, itemId: item.id, placeId: room.id, kind: 'upload', label: 'Atlas Storage', url: null,
      owner: room.ownerId, visibility: 'private', rights: 'Owner-supplied copy · owner access',
      syncMode: 'snapshot', mode: 'snapshot', uploadedAt: item.uploadedAt, syncedAt: item.uploadedAt,
      status: state, sha256: item.sha256, snapshotReceiptRef: item.snapshotReceiptId
    },
    sourceMedia: {kind: kind === 'image' || kind === 'audio' ? kind : 'text'}
  };
}

export function recordUploadInventory(items, lens) {
  if (!Array.isArray(items) || !personId(lens) || lens.preview || lens.isAgent) return;
  const actor = personId(lens);
  const previous = new Map((uploadInventory.get(actor) ?? []).map(item => [item.id, item]));
  const next = structuredClone(items);
  const incoming = new Map(next.map(item => [item.id, item]));
  const changed = new Set();
  for (const id of new Set([...previous.keys(), ...incoming.keys()])) {
    const before = previous.get(id), after = incoming.get(id);
    if ((!hostedPhoto(before) && !hostedPhoto(after)) || JSON.stringify(before)===JSON.stringify(after)) continue;
    if (before?.placeId) changed.add(before.placeId);
    if (after?.placeId) changed.add(after.placeId);
  }
  uploadInventory.set(actor, next);
  for (const [key, room] of Object.entries(ROOMS)) {
    if (!ownedRoom(room, lens)) continue;
    contentStore.emit(key);
    if (changed.has(room.id)) {
      for (const listener of hostedSourceListeners) listener(key);
    }
  }
}

export function subscribeHostedSourceChanges(listener) {
  hostedSourceListeners.add(listener);
  return () => hostedSourceListeners.delete(listener);
}

function refreshUploads(lens) {
  const actor = personId(lens);
  if (refreshing.has(actor) || uploadInventory.has(actor) || !currentUploadHolder()) return;
  refreshing.add(actor);
  void uploadClient.list().then(result => recordUploadInventory(result.items, lens)).catch(() => {
    // The Sources panel retries explicit inventory requests and reports failures.
    if (!uploadInventory.has(actor)) uploadInventory.set(actor, []);
  }).finally(() => refreshing.delete(actor));
}

function availableSources(room, lens) {
  const actorId = personId(lens);
  const views = connectedSources.list(room.id, {actorId}).map(source => connectedSources.view(source.id, {actorId})).filter(Boolean);
  if (ownedRoom(room, lens)) refreshUploads(lens);
  const uploads = readsOwnedSources(room, lens) ? (uploadInventory.get(actorId) ?? []).filter(item =>
    item.placeId === room.id && item.declarationReceiptId && ['published', 'deleting', 'deleted'].includes(item.state)) : [];
  const uploadedBlocks = uploads.map(item => withSourceBadge(uploadBlock(item, room)));
  const blocks = [...views.flatMap(view => view.blocks.map(withSourceBadge)), ...uploadedBlocks];
  return {views, uploadedBlocks, blocks};
}

function sourceMatchesKind(block, kind) {
  if (!block?.source) return false;
  return kind === 'hosted-photo'
    ? block.type==='image' && isUploadSource(block.source)
    : block.type==='video' && block.source.kind==='public-api' && !!videoReference(block.sourceMedia?.url);
}

/** A placement refers to the current source Thing. Its draft block is a marker, never a media copy. */
export function makeSourcePiece(room, lens, {kind,sourceId,itemId} = {}, {id,position,yaw,scale} = {}) {
  if (!room || !ownedRoom(room,lens) || !['upload','video'].includes(kind) ||
    typeof sourceId!=='string' || kind==='upload' && typeof itemId!=='string') {
    throw new Error('Choose a published source Thing in your Place.');
  }
  const fixture = kind==='upload'?'hosted-photo':'hosted-video';
  const source = availableSources(room,lens).blocks.find(block => block.source?.sourceId===sourceId &&
    (itemId===undefined || block.source.itemId===itemId) && sourceMatchesKind(block,fixture) &&
    block.state==='ready' && !sourceStateMessage(block) && sourceVisible(block,room,lens));
  if (!source) throw new Error('That source Thing is unavailable.');
  const piece = makeBuilderPiece(fixture,{placeId:room.id,thingId:source.id,id,position,yaw,scale});
  const {label,blockType} = BUILDER_PIECES[fixture];
  piece.block = {id:piece.id,type:blockType,title:label,body:label,importance:'core',content:scores(),sources:[],backing_ref:null};
  validateBuilderPiece(piece,{placeId:room.id});
  return piece;
}

function missingPlacedSource(room, lens, piece, visibility = 'private') {
  const photo = piece.kind==='hosted-photo';
  const label = photo?'Photo source':'Video source';
  const state = photo && !uploadInventory.has(personId(lens)) && currentUploadHolder()?'pending':'unavailable';
  return withSourceBadge({id:piece.ref.thingId,type:photo?'image':'video',title:label,importance:'core',
    content:scores(),styleControl:'fixed',state,source:{sourceId:piece.ref.thingId,owner:room.ownerId,
      visibility,label,syncMode:photo?'snapshot':'live',status:state,rights:'Unavailable'}});
}

/** Projects the current source and Lens into read/scene blocks without persisting the resolution. */
export function resolvePlacedSources(room, lens, sourceBlocks) {
  if (!room || !lens || !permission(room,lens).canLook) return {blocks:[],builderFixtures:[]};
  sourceBlocks ??= availableSources(room,lens).blocks;
  const pieces = (room.kitPieces ?? []).filter(piece => isHostedSourceKind(piece.kind));
  const placed = new Map(pieces.map(piece => [piece.id,piece]));
  const origins = new Map(sourceBlocks.map(block => [block.id,block]));
  const blocks = new Map(origins);
  const fixtures = (room.builderFixtures ?? []).flatMap(fixture => {
    if (!isHostedSourceKind(fixture.kind)) return [fixture];
    const piece = placed.get(fixture.id);
    if (!piece?.ref || piece.ref.placeId!==room.id || piece.kind!==fixture.kind) return [];
    const origin = origins.get(piece.ref.thingId);
    if (origin && (!sourceMatchesKind(origin,piece.kind) || !sourceVisible(origin,room,lens))) return [];
    if (!origin) {
      const former = piece.kind === 'hosted-video'
        ? connectedSources.videoPlacementState(room.id,piece.ref.thingId,{actorId:personId(lens)}) : null;
      const publiclyUnavailable = former === 'unavailable-public';
      if (former === 'excluded' || (!publiclyUnavailable && !readsOwnedSources(room,lens))) return [];
      if (!blocks.has(piece.ref.thingId)) {
        blocks.set(piece.ref.thingId,missingPlacedSource(room,lens,piece,publiclyUnavailable?'public':'private'));
      }
    }
    return [{...fixture,block:piece.ref.thingId}];
  });
  return {blocks:[...(room.blocks ?? []).filter(block => !block.projectedSource && !placed.has(block.id) && !blocks.has(block.id)),...blocks.values()],
    ...(room.builderFixtures?{builderFixtures:fixtures}:{})};
}

export function sourcedRoom(room, lens) {
  if (!room || !permission(room, lens).canLook) return room;
  const {views,uploadedBlocks,blocks} = availableSources(room,lens);
  if (!views.length && !uploadedBlocks.length && !room.kitPieces?.some(piece => isHostedSourceKind(piece.kind)) &&
    !room.blocks?.some(block => block.projectedSource)) return room;

  // Adapters contribute ordered candidates. Place them together so each source
  // occupies a different run of slots without moving the room's authored kit.
  const sourcePlacements = layoutSourcePlacements(views.flatMap(view => view.placements));

  return {
    ...room, ...resolvePlacedSources(room,lens,blocks),
    sources: [...(room.sources ?? []).filter(source => !views.some(view => view.source.id === source.id)),
      ...views.map(view => view.source), ...uploadedBlocks.map(block => ({
        id: block.source.sourceId, owner: room.ownerId, kind: 'upload', connector: 'atlas-storage',
        scope: {visibility: 'private'}, syncMode: 'snapshot', rightsDefault: block.source.rights,
        status: block.source.status, lastSync: block.source.syncedAt
      }))],
    mapping: views.find(view => view.mapping?.id)?.mapping.id ?? room.mapping,
    sourcePlacements
  };
}

configureSourceMedia({
  fetchBytes: ({itemId,variant,signal}) => uploadClient.media(itemId, variant, {signal}),
  recordEgress: ({sourceId,itemId,bytes,actorId}) => connectedSources.markServed(sourceId, itemId, bytes, {actorId})
});
