import { addArrivals } from './arrivals.js';
import { DISTRICTS, EDGES, ROOMS } from './data.js';
import { defineInterior } from './interior-kit.js';
import { KIT_SCHEMAS, validateComponent } from './kit.js';
import { canonical } from './ledger.js';
import { validateScores } from './standing-records.js';

const registered = new Map();
const pathTypes = new Set(['seamless', 'door', 'window', 'embedded']);
const recordKinds = new Set(['Place', 'Thing', 'Path', 'helper']);
const isRecord = value => value !== null && typeof value === 'object' && Object.getPrototypeOf(value) === Object.prototype;
const isId = value => typeof value === 'string' && /^[a-z0-9][a-z0-9_-]*(\/[a-z0-9][a-z0-9_-]*)*$/i.test(value);
const point = (value, length) => Array.isArray(value) && value.length === length && value.every(Number.isFinite);
const fail = message => { throw new Error('Invalid kit projection: ' + message); };

function checkData(value, ancestors = new Set()) {
  if (value === null || typeof value === 'string' || typeof value === 'boolean' || Number.isFinite(value)) return;
  if ((!isRecord(value) && !Array.isArray(value)) || ancestors.has(value)) fail('records must be JSON data');
  ancestors.add(value);
  for (const item of Array.isArray(value) ? value : Object.values(value)) checkData(item, ancestors);
  ancestors.delete(value);
}

function readChanges(changes) {
  const records = { Place: new Map(), Thing: new Map(), Path: new Map(), helper: new Map() };
  for (const change of changes) {
    if (change?.op !== 'create' || !recordKinds.has(change.kind) || !isRecord(change.fields)) {
      fail('initial registration takes authored create records');
    }
    const ref = change.ref;
    const kind = change.kind;
    if (!isRecord(ref)) fail('missing record reference');
    const id = kind === 'Path' ? ref.pathId : kind === 'helper' ? ref.actorId : ref.placeId;
    if (!isId(id) || kind === 'Thing' && !isId(ref.thingId)) fail('invalid record ID');
    const key = kind === 'Thing' ? id + ':' + ref.thingId : id;
    if (records[kind].has(key)) fail('duplicate ' + kind + ' record ' + key);
    records[kind].set(key, change);
  }
  return records;
}

function readRooms(projection) {
  const rooms = new Map();
  for (const room of projection.rooms) {
    if (!isId(room?.placeId) || rooms.has(room.placeId) || !isRecord(room.layout) ||
      !Array.isArray(room.pathIds) || !Array.isArray(room.pieces) || !Array.isArray(room.behaviors)) {
      fail('invalid or duplicate room');
    }
    rooms.set(room.placeId, room);
  }
  const root = rooms.get(projection.rootPlaceId);
  if (!root || root.parentPlaceId !== null) fail('one root room is required');
  const checked = new Set([root.placeId]);
  for (const room of rooms.values()) {
    const chain = new Set();
    let id = room.placeId;
    while (!checked.has(id)) {
      if (!rooms.has(id) || chain.has(id)) fail('invalid containment at ' + room.placeId);
      chain.add(id);
      id = rooms.get(id).parentPlaceId;
    }
    for (const ancestor of chain) checked.add(ancestor);
  }
  return rooms;
}

function runtimeLayout(room, rootPlaceId) {
  const layout = { scene: rootPlaceId, slot: [0, 0], facing: 0, scale: 1, ...room.layout };
  layout.root = room.placeId === rootPlaceId;
  if (typeof layout.kind !== 'string' || !layout.kind || typeof layout.scene !== 'string' ||
    !point(layout.slot, 2) || !Number.isFinite(layout.facing) || !Number.isFinite(layout.scale) || layout.scale <= 0 ||
    layout.approach !== undefined && !point(layout.approach, 2)) fail('invalid layout for ' + room.placeId);
  if (layout.arrivals !== undefined && !['outside', 'door', 'inside'].every(key =>
    point(layout.arrivals?.[key]?.position, 2) && Number.isFinite(layout.arrivals[key].facing))) {
    fail('invalid arrival points for ' + room.placeId);
  }
  return layout;
}

function runtimePlace(fields, room, layout, ownerId) {
  const { placeId, parentPlaceId, pieces, behaviors } = room;
  if (typeof fields.title !== 'string' || !fields.title.trim() || fields.ownerId != null && fields.ownerId !== ownerId ||
    fields.visibility !== undefined && !['public', 'listed', 'hidden', 'private', 'verified-only'].includes(fields.visibility) ||
    fields.district !== undefined && !Object.hasOwn(DISTRICTS, fields.district) ||
    fields.blocks !== undefined && !Array.isArray(fields.blocks) ||
    fields.aliases !== undefined && (!Array.isArray(fields.aliases) || !fields.aliases.every(isId))) {
    fail('invalid authored Place ' + placeId);
  }
  // The caller supplies the approved local owner. Grants and history belong to the access store.
  const { grants, history, ...authored } = fields;
  if (grants !== undefined || history !== undefined) fail('access records are separate from the projection');
  if (Object.hasOwn(fields, 'builderStructure')) fail('structural placement is assigned by the publisher');
  return {
    address: 'tlh/' + placeId,
    district: 'makers',
    visibility: 'hidden',
    minAge: 0,
    author: { name: 'Place owner', identity: { display: 'pseudonym', backing: 'none' } },
    substance: { summary: '', body: '', claims: [] },
    style: { preset: 'Studio', palette: 'dusk', shape: 'pavilion', scale: 1 },
    forms: ['3d', 'card', 'page'],
    blocks: [],
    backing_ref: null,
    ...authored,
    id: placeId, ownerId, parentPlaceId, layout, kitPieces: pieces, kitBehaviors: behaviors
  };
}

function attachPieces(staged, placesById, records) {
  for (const place of staged.values()) {
    const pieces = new Set();
    const blocks = new Map();
    for (const block of place.blocks) {
      if (!isId(block?.id) || blocks.has(block.id)) fail('invalid or duplicate Thing in ' + place.id);
      blocks.set(block.id, block);
    }
    const components = [];
    for (const piece of place.kitPieces) {
      const { id, kind, ref, transform, settings, behaviors } = piece ?? {};
      if (!isId(id) || pieces.has(id) || typeof kind !== 'string' || !kind || !isRecord(settings) ||
        !Array.isArray(behaviors) || !point(transform?.position, 3) || !Number.isFinite(transform.yaw) ||
        !Number.isFinite(transform.scale) || transform.scale <= 0 || !isRecord(ref)) fail('invalid piece in ' + place.id);
      pieces.add(id);
      if (Object.hasOwn(ref, 'actorId')) {
        const actor = records.helper.get(ref.actorId);
        if (Object.keys(ref).length !== 1 || !actor || actor.fields.placeId !== place.id) fail('unknown helper on ' + place.id);
        continue;
      }
      if (kind === 'thing-reference') {
        const origin = placesById.get(ref.placeId);
        if (Object.keys(ref).length !== 2 || !isId(ref.thingId) || !origin?.blocks?.some(block => block.id === ref.thingId)) {
          fail('unknown Thing reference in ' + place.id);
        }
        continue;
      }
      if (ref.placeId !== place.id) fail('cross-Place piece in ' + place.id);
      if (Object.hasOwn(ref, 'thingId')) {
        const block = blocks.get(ref.thingId);
        if (Object.keys(ref).length !== 2 || !block) fail('unknown Thing in ' + place.id);
        if (!Object.hasOwn(KIT_SCHEMAS, kind)) continue;
        const [x, , z] = transform.position;
        const exhibit = { id, kind, settings, position: [x, z], facing: transform.yaw, behaviors };
        validateComponent(exhibit);
        if (components.some(component => component.block === block.id)) fail('duplicate exhibit placement for ' + block.id);
        block.exhibit = exhibit;
        components.push({ block: block.id, position: exhibit.position, facing: exhibit.facing });
      } else if (Object.keys(ref).length !== 1) fail('invalid Place piece in ' + place.id);
    }
    if (components.length) place.layout.components = components;
  }
}

function runtimePaths(rooms, staged, keys, placesById, changes, replacePaths) {
  const existing = new Set(EDGES.filter(path => !replacePaths.has(path)).map(path => path.id));
  const paths = new Map();
  for (const room of rooms.values()) {
    for (const pathId of room.pathIds) {
      const change = changes.get(pathId);
      const fields = change?.fields;
      if (!fields || paths.has(pathId) || existing.has(pathId) || fields.from !== room.placeId ||
        fields.from === fields.to || !keys.has(fields.to) || !pathTypes.has(fields.type)) {
        fail('invalid, unknown, or occupied Path ' + pathId);
      }
      const origin = placesById.get(fields.from);
      const target = placesById.get(fields.to);
      const scene = origin.layout.interior?.scene ?? origin.layout.scene;
      const targetScene = target.layout.interior?.scene ?? target.layout.scene;
      const { from, to, type, position = origin.layout.approach ?? origin.layout.slot, before, after,
        zone, axis, host, consent, contextPriority = 0 } = fields;
      if (!point(position, 2) || (before !== undefined && !point(before, 2)) || (after !== undefined && !point(after, 2)) ||
        (host !== undefined && !keys.has(host)) || !Number.isFinite(contextPriority)) fail('invalid Path geometry for ' + pathId);
      paths.set(pathId, {
        id: pathId, from: keys.get(from), to: keys.get(to), type, scene, position, contextPriority,
        ...(before ? { before } : {}), ...(after ? { after } : {}), ...(zone ? { zone } : {}),
        ...(axis ? { axis } : {}), ...(host ? { host: keys.get(host) } : {}),
        ...(consent !== undefined ? { consent } : {}),
        ...(change.provenanceRef !== undefined ? { provenanceRef: change.provenanceRef } : {}),
        ...(scene === targetScene ? {} : { destination: targetScene, portal: true }),
        ...(staged.has(to) ? {} : { reference: { placeId: to } })
      });
    }
  }
  if (paths.size !== changes.size) fail('unplaced Path record');
  for (const room of rooms.values()) {
    if (room.parentPlaceId !== null && ![...paths.values()].some(path =>
      path.from === keys.get(room.parentPlaceId) && path.to === keys.get(room.placeId))) {
      fail('missing parent Path for ' + room.placeId);
    }
  }
  return [...paths.values()];
}

function stageProjection(projection, changes, ownerId, { anchor, replaceRooms = new Set(), replacePaths = new Set() } = {}) {
  const records = readChanges(changes);
  const rooms = readRooms(projection);
  if (rooms.size - (anchor ? 1 : 0) !== records.Place.size) fail('each new room requires one authored Place');
  const staged = new Map();
  const keys = new Map();
  const placesById = new Map();
  const addresses = new Set();
  const interiorScenes = new Set();
  for (const [key, place] of Object.entries(ROOMS)) {
    if (replaceRooms.has(key)) continue;
    keys.set(place.id, key);
    placesById.set(place.id, place);
    for (const name of [key, place.id, place.address, ...place.aliases ?? []]) addresses.add(name.toLowerCase());
    if (place.layout?.interior) interiorScenes.add(place.layout.interior.scene);
  }
  if (anchor) placesById.set(anchor.id, anchor);
  for (const room of rooms.values()) {
    if (room.placeId === anchor?.id) continue;
    const change = records.Place.get(room.placeId);
    if (!change || keys.has(room.placeId) || !replaceRooms.has(room.placeId) && room.placeId in ROOMS) {
      fail('unknown or occupied Place ' + room.placeId);
    }
    const place = runtimePlace(change.fields, room, runtimeLayout(room, projection.rootPlaceId), ownerId);
    if (change.provenanceRef !== undefined) place.provenanceRef = change.provenanceRef;
    const names = [place.id, place.address, ...place.aliases ?? []];
    if (!names.every(name => isId(name) && !addresses.has(name.toLowerCase()))) fail('invalid or occupied Place address ' + room.placeId);
    for (const name of names) addresses.add(name.toLowerCase());
    const scene = place.layout.interior?.scene;
    if (scene !== undefined) {
      if (interiorScenes.has(scene)) fail('occupied interior scene ' + scene);
      interiorScenes.add(scene);
    }
    staged.set(place.id, place);
    keys.set(place.id, place.id);
    placesById.set(place.id, place);
  }
  for (const { ref, fields, provenanceRef = null } of records.Thing.values()) {
    const place = staged.get(ref.placeId);
    if (!place || typeof fields.type !== 'string') fail('invalid authored Thing ' + ref.thingId);
    place.blocks.push({ importance: 'core', sources: [], backing_ref: null, ...fields, id: ref.thingId, provenanceRef });
  }
  for (const { ref, fields, provenanceRef = null } of records.helper.values()) {
    if (!staged.has(fields.placeId)) fail('helper must attach to a Place in the projection');
    const place = staged.get(fields.placeId);
    (place.kitHelpers ??= []).push({ backing_ref: null, ...fields, id: ref.actorId, provenanceRef });
  }
  attachPieces(staged, placesById, records);
  const paths = runtimePaths(rooms, staged, keys, placesById, records.Path, replacePaths);
  for (const place of staged.values()) {
    const interior = place.layout.interior;
    if (interior) {
      if (!paths.some(path => path.id === interior.edge && path.to === place.id && path.from === keys.get(interior.parent))) {
        fail('interior entry Path is missing for ' + place.id);
      }
      place.layout.interior = defineInterior({ ...interior, parent: keys.get(interior.parent) });
    }
  }
  const entries = Object.fromEntries(staged);
  addArrivals(entries, paths);
  return { entries, paths };
}

/**
 * Register an approved initial projection in the session catalog. Arrival and
 * the publisher supply the owner from their approved local claim, outside the
 * proposal. Replay the stored input on reload, before building a scene.
 */
export function registerProjection(input, { ownerId } = {}) {
  const { projection, changes } = structuredClone(input ?? {});
  if (typeof ownerId !== 'string' || !ownerId.trim() || ![1, 2].includes(projection?.schemaVersion) ||
    !Array.isArray(projection.rooms) || !Array.isArray(changes)) fail('missing owner, version, or records');
  checkData({ projection, changes });
  const signature = canonical({ ownerId, projection, changes });
  const prior = registered.get(projection.rootPlaceId);
  if (prior) {
    if (prior.signature !== signature) fail('the root already has an initial projection');
    return structuredClone(prior.result);
  }

  const { entries, paths } = stageProjection(projection, changes, ownerId);
  const rootKey = projection.rootPlaceId;
  const root = entries[rootKey];
  const result = {
    rootKey,
    roomKeys: Object.fromEntries(Object.keys(entries).map(id => [id, id])),
    arrival: {
      room: rootKey, scene: root.layout.interior?.scene ?? root.layout.scene, choice: 'inside',
      ...(root.layout.interior?.arrival ?? root.layout.arrivals.inside)
    }
  };

  // All validation and allocation happens before touching either live collection.
  Object.assign(ROOMS, entries);
  for (const path of paths) EDGES.push(path);
  registered.set(rootKey, { signature, result: structuredClone(result) });
  return structuredClone(result);
}

/** Validate a Builder parent's whole structural revision without exposing it.
 *  Apply synchronously after its Receipt is persisted, in the same catalog turn.
 */
export function prepareBuilderStructures(parentKey, parent, structures, {forPreview = false} = {}) {
  const live = Object.hasOwn(ROOMS, parentKey) ? ROOMS[parentKey] : null;
  if (!live?.ownerId || !parent?.layout || live.id !== parent.id || live.ownerId !== parent.ownerId || !Array.isArray(structures)) {
    fail('invalid structural publication parent');
  }
  const ownsPlacement = placement => placement.builderStructure?.parentPlaceId === parent.id;
  const replaceRooms = new Set(Object.entries(ROOMS).filter(([, room]) => ownsPlacement(room)).map(([key]) => key));
  const replacePaths = new Set(EDGES.filter(ownsPlacement));
  const anchor = { placeId: parent.id, parentPlaceId: null, layout: {}, pathIds: [], pieces: [], behaviors: [] };
  const projection = { schemaVersion: 2, rootPlaceId: parent.id, rooms: [anchor] };
  const changes = [];
  const roomKeys = new Map();
  const byDoor = new Map();
  const input = structuredClone(structures);
  checkData(input);
  for (const candidate of input) {
    const {pieceId, room, changes: submitted} = candidate ?? {};
    const interior = room?.layout?.interior;
    if (!isId(pieceId) || roomKeys.has(pieceId) || room?.parentPlaceId !== parent.id ||
      room.layout?.scene !== (parent.layout.interior?.scene ?? parent.layout.scene) ||
      interior?.parent !== parent.id || !Array.isArray(submitted)) fail('invalid structural child');
    const doors = submitted.filter(change => change?.kind === 'Path');
    const door = doors[0];
    if (doors.length !== 1 || door.ref?.pathId !== interior.edge || door.fields?.from !== parent.id ||
      door.fields?.to !== room.placeId || door.fields?.type !== 'door' ||
      door.fields.host !== undefined && door.fields.host !== parent.id) fail('a structural child needs its own containing door');
    const previous = replaceRooms.has(room.placeId) ? ROOMS[room.placeId] : null;
    if (previous && (previous.ownerId !== parent.ownerId || previous.builderStructure.pieceId !== pieceId)) {
      fail('occupied structural identity ' + room.placeId);
    }
    if ([...replaceRooms].some(key => key !== room.placeId && ROOMS[key].builderStructure.pieceId === pieceId)) {
      fail('a structural child keeps its Place identity when reprojection changes its layout');
    }
    const previousDoor = [...replacePaths].find(path => path.id === door.ref.pathId);
    if (previousDoor && previousDoor.builderStructure.pieceId !== pieceId) fail('occupied structural door ' + door.ref.pathId);
    if ([...replacePaths].some(path => path.id !== door.ref.pathId && path.builderStructure.pieceId === pieceId)) {
      fail('a structural child keeps its door identity when reprojection changes its layout');
    }
    roomKeys.set(pieceId, room.placeId);
    byDoor.set(door.ref.pathId, pieceId);
    anchor.pathIds.push(door.ref.pathId);
    projection.rooms.push(room);
    changes.push(...submitted);
  }
  const { entries, paths } = stageProjection(projection, changes, parent.ownerId, {anchor: parent, replaceRooms, replacePaths});
  const retired = new Set([...replaceRooms].filter(key => !Object.hasOwn(entries, key)));
  if (!forPreview && retired.size) {
    for (const room of Object.values(ROOMS)) {
      if (retired.has(room.parentPlaceId ?? room.parentId ?? room.parent)) fail('move the rooms inside this hall before removing it');
    }
    if (EDGES.some(path => !replacePaths.has(path) && [path.from, path.to, path.host].some(key => retired.has(key)))) {
      fail('this hall still has a separate Path attached');
    }
  }
  for (const [pieceId, key] of roomKeys) {
    validateScores(entries[key].content);
    entries[key].builderStructure = {parentPlaceId: parent.id, pieceId};
  }
  for (const path of paths) path.builderStructure = {parentPlaceId: parent.id, pieceId: byDoor.get(path.id)};
  if (forPreview) return {entries, paths, roomKeys};
  return {entries, paths, roomKeys, apply() {
    for (const key of retired) delete ROOMS[key];
    for (const key of roomKeys.values()) ROOMS[key] = entries[key];
    for (let i = EDGES.length - 1; i >= 0; i--) if (ownsPlacement(EDGES[i])) EDGES.splice(i, 1);
    for (const path of paths) EDGES.push(path);
  }};
}

// A Builder revision overlays the existing Place. Its recorded furnishings
// can change without replacing the original Place, Paths, or other records.
export function composeBuilderRoom(base, pieces, {structuralPieceIds, ...metadata} = {}) {
  const room = {
    ...base, ...metadata, layout: {...base.layout}, blocks: [...base.blocks ?? []],
    kitPieces: [...base.kitPieces ?? []], builderFixtures: []
  };
  const components = [...base.layout.components ?? []];
  const keys = new Set(room.blocks.map(block => block.id));
  for (const piece of structuredClone(pieces)) {
    const {block, ...placement} = piece;
    const builtPlace = structuralPieceIds?.get(piece.id);
    if (piece.kind === 'interior-shell' && builtPlace) {
      room.kitPieces.push({...placement, ref:{placeId:builtPlace}});
      continue;
    }
    if (!block || keys.has(block.id)) fail('occupied Builder Thing ' + block?.id);
    keys.add(block.id);
    const {position: [x, y, z], yaw, scale} = placement.transform;
    const location = {block: block.id, position: [x, z], elevation: y, facing: yaw, scale};
    if (Object.hasOwn(KIT_SCHEMAS, piece.kind)) {
      block.exhibit = {id:piece.id,kind:piece.kind,settings:piece.settings,position:[x,z],facing:yaw,behaviors:piece.behaviors};
      validateComponent(block.exhibit);
      components.push(location);
    } else {
      room.builderFixtures.push({...location, id:piece.id, kind:piece.kind, settings:piece.settings});
    }
    room.blocks.push(block);
    room.kitPieces.push({...placement, ref:piece.kind.startsWith('hosted-')?piece.ref:{placeId:base.id,thingId:block.id}});
  }
  if (components.length) room.layout.components = components;
  return room;
}

// The normal visitor policy reads the shared catalogs synchronously. Evaluate
// its ordinary path against just this draft, then restore the published record
// before returning control to any browser event or promise.
export function withBuilderRoom(key, draftRoom, inspect) {
  const live = ROOMS[key];
  if (!live || live.id !== draftRoom.id || live.ownerId !== draftRoom.ownerId) fail('draft identity changed');
  ROOMS[key] = draftRoom;
  try { return inspect(); } finally { ROOMS[key] = live; }
}
