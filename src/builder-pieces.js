import { defineInterior } from './interior-kit.js';
import { behavior, interpret, KIT_SCHEMAS, validateComponent } from './kit.js';
import { DIMENSIONS, scores, validPair } from './scores.js';
import { ROLE_ACTIONS, helperScope } from './staff-data.js';

// Full-quality Visit scenes have used this ceiling since the interior landing.
export const BUILDER_DRAW_CEILING = 22;
export const BUILDER_GRID_METRES = 0.5;
const limits = { minScale: 0.5, maxScale: 1.25 };
const titleField = { key: 'title', label: 'Title', type: 'text', maxLength: 160 };
const field = (key, label, type, more = {}) => ({ key, label, type, ...more });
const rule = (when, then) => behavior(when, then);
const readMedia = [rule('tap', 'toggle'), rule('leave', 'pause'), rule('seek', 'seek')];
const sampleText = 'Sample content. Replace this with your own material.';
const textDefaults = title => ({ title, text: '' });
const fixturesCost = (instances, drawCalls = 1) => ({ instances, atlasTiles: 0, liveTextures: 0, drawCalls });
const space = (label, model, instances, drawCalls) => ({
  label, category: 'Spaces', recordKind: 'Place', model, cost: fixturesCost(instances, drawCalls),
  defaultSettings: { title: label }, settingsFields: [titleField], behaviorChoices: [],
});
const exhibit = (kind, label, blockType, defaults, fields, choices) => ({
  label, category: 'Exhibits', recordKind: 'Thing', blockType,
  cost: { ...KIT_SCHEMAS[kind].cost, drawCalls: kind === 'seatMap' ? 1 : 2 },
  accessibility: [...KIT_SCHEMAS[kind].accessibility],
  defaultSettings: { title: label, ...defaults },
  settingsFields: [titleField, ...fields], behaviorChoices: choices, defaultBehaviors: choices,
});
const fixture = (label, model, instances, drawCalls = 1) => ({
  label, category: 'Fixtures', recordKind: 'Thing', blockType: 'text', model,
  cost: fixturesCost(instances, drawCalls), defaultSettings: textDefaults(label),
  settingsFields: [titleField, field('text', 'Text', 'text', { maxLength: 240 })], behaviorChoices: [],
});
const doorway = (label, type) => ({
  label, category: 'Fixtures', recordKind: 'Path', pathType: type, cost: fixturesCost(11, 2),
  defaultSettings: { title: label }, settingsFields: [titleField], behaviorChoices: [],
});
const helper = role => ({
  label: role, category: 'Helpers', recordKind: 'helper', role, cost: fixturesCost(1, 1),
  capabilities: [...ROLE_ACTIONS[role]], defaultSettings: { title: role }, settingsFields: [titleField], behaviorChoices: [],
});

const definitions = {
  courtyard: space('Courtyard', 'courtyard', 7, 2),
  'gallery-wall': space('Gallery wall', 'gallery-wall', 13, 1),
  booth: space('Room shell', 'booth', 3, 2),
  'path-stops': space('Walkway', 'path-stops', 11, 2),
  'interior-shell': space('Exhibit hall', 'exhibit-hall', 24, 3),
  screen: exhibit('screen', 'Screen', 'video', {
    slides: [{ title: 'Sample scene', caption: sampleText, scene: 0 }],
    transcript: sampleText, secondsPerSlide: 3,
  }, [field('slides', 'Captioned slides', 'list'), field('transcript', 'Transcript', 'text', { maxLength: 3000 }),
    field('secondsPerSlide', 'Seconds per slide', 'number', { min: 1, max: 30 })], readMedia),
  photoWall: exhibit('photoWall', 'Photo wall', 'image', {
    photos: [{ title: 'Sample illustration', scene: 4, alt: 'A procedural sample illustration.',
      caption: sampleText, credit: 'Generated illustration by Living Atlas · sample media' }],
  }, [field('photos', 'Photos with captions, descriptions, and credits', 'list')], [rule('photo', 'photo')]),
  listening: exhibit('listening', 'Listening station', 'audio', {
    cues: [sampleText], transcript: sampleText,
  }, [field('cues', 'Timed narration text', 'list'), field('transcript', 'Transcript', 'text', { maxLength: 3000 })], readMedia),
  newspaper: exhibit('newspaper', 'Reading stand', 'image', {
    headline: 'An example front page', columns: ['Fictional sample copy. Replace it with material you can share.'],
  }, [field('headline', 'Headline', 'text', { maxLength: 160 }), field('columns', 'Article columns', 'list')], [rule('zoom', 'zoom')]),
  seatMap: exhibit('seatMap', 'Seat map', 'model', {
    seats: [{ label: 'Seat one', caption: 'Sample seat story. Add your own caption here.' }],
  }, [field('seats', 'Seats and their stories', 'list')], [rule('seat', 'seat')]),
  lantern: fixture('Lantern', 'lantern', 3, 2),
  sign: fixture('Sign', 'sign', 2, 1),
  bench: fixture('Bench', 'bench', 3, 1),
  plant: fixture('Plant', 'plant', 4, 2),
  plinth: fixture('Plinth', 'plinth', 2, 1),
  door: doorway('Door', 'door'),
  window: doorway('Window', 'window'),
  portal: doorway('Portal', 'door'),
  docent: helper('Docent'),
  curator: helper('Curator'),
  maintainer: helper('Maintainer'),
  steward: helper('Steward'),
  'thing-reference': {
    label: 'Thing reference', category: null, recordKind: 'reference', cost: fixturesCost(2, 1),
    defaultSettings: {}, settingsFields: [], behaviorChoices: [],
  },
};

function freezeData(value) {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    for (const item of Object.values(value)) freezeData(item);
    Object.freeze(value);
  }
  return value;
}

export const BUILDER_PIECES = freezeData(Object.fromEntries(Object.entries(definitions).map(([kind, definition]) =>
  [kind, { kind, limits, ...definition }])));

const isObject = value => value !== null && typeof value === 'object' && Object.getPrototypeOf(value) === Object.prototype;
const placeIdPattern = /^[a-z0-9][a-z0-9_-]*(\/[a-z0-9][a-z0-9_-]*)*$/i;
const pieceIdPattern = /^[a-z0-9-]{1,60}$/;
const isPlaceId = value => typeof value === 'string' && placeIdPattern.test(value);
const isPieceId = value => typeof value === 'string' && pieceIdPattern.test(value);
const isCoordinate = value => Number.isFinite(value) && Math.abs(value) <= 30;
const boundedText = (value, max, empty = false) => typeof value === 'string' &&
  (empty || value.trim().length > 0) && [...value].length <= max;
const isScene = value => Number.isInteger(value) && value >= 0 && value < 6;

const showActions = {
  'tap:toggle': 'When someone taps, play or pause the media they can see.',
  'leave:pause': 'When someone leaves, pause the media they could see.',
  'seek:seek': 'When someone changes position, seek within media they can see.',
  'photo:photo': 'When someone taps a photo they can see, show its caption and credit.',
  'zoom:zoom': 'When someone zooms a clipping they can see, change its magnification.',
  'seat:seat': 'When someone taps a seat they can see, show that seat’s story.',
};

export function describeBuilderBehavior(record) {
  return record?.if === 'canView' && record.target === 'self'
    ? showActions[record.when + ':' + record.then] ?? 'Behavior unavailable.'
    : 'Behavior unavailable.';
}

export function snapBuilderPosition(position) {
  if (!Array.isArray(position) || position.length !== 3 || !position.every(isCoordinate)) {
    throw new Error('Choose a valid placement.');
  }
  return position.map(coordinate => Math.round(coordinate / BUILDER_GRID_METRES) * BUILDER_GRID_METRES || 0);
}

function validItems(kind, settings) {
  const schema = KIT_SCHEMAS[kind];
  const fieldKey = { screen: 'slides', photoWall: 'photos', listening: 'cues', newspaper: 'columns', seatMap: 'seats' }[kind];
  const items = settings[fieldKey];
  if (!Array.isArray(items) || items.length < 1 || items.length > schema.maxItems) return false;
  if (kind === 'screen') return items.every(item => isObject(item) && Object.keys(item).length === 3 &&
    boundedText(item.title, 160) && boundedText(item.caption, 600) && isScene(item.scene));
  if (kind === 'photoWall') return items.every(item => isObject(item) && Object.keys(item).length === 5 &&
    boundedText(item.title, 160) && boundedText(item.caption, 600) && boundedText(item.alt, 400) &&
    boundedText(item.credit, 240) && isScene(item.scene));
  if (kind === 'seatMap') return items.every(item => isObject(item) && Object.keys(item).length === 2 &&
    boundedText(item.label, 100) && boundedText(item.caption, 600));
  return items.every(item => boundedText(item, 1500));
}

function validateSettings(definition, settings) {
  if (!isObject(settings)) throw new Error('Settings must be records.');
  const permitted = new Set(definition.settingsFields.map(setting => setting.key));
  // The runtime already accepts device-speech metadata on legacy stations.
  if (definition.kind === 'listening') permitted.add('voice');
  if (Object.keys(settings).some(key => !permitted.has(key))) throw new Error('Unknown setting for ' + definition.label + '.');
  for (const setting of definition.settingsFields) {
    const value = settings[setting.key];
    if (setting.type === 'text' && !boundedText(value, setting.maxLength, setting.key === 'text') ||
      setting.type === 'number' && (!Number.isFinite(value) || value < setting.min || value > setting.max)) {
      throw new Error(setting.label + ' is outside the kit limits.');
    }
  }
  if (Object.hasOwn(settings, 'voice') && settings.voice !== 'device speech synthesis') throw new Error('Unknown voice setting.');
  if (Object.hasOwn(KIT_SCHEMAS, definition.kind) && !validItems(definition.kind, settings)) {
    throw new Error(definition.label + ' needs bounded settings and readable alternatives.');
  }
}

function validateBehaviors(definition, records) {
  if (!Array.isArray(records) || records.length > 12) throw new Error('This piece has too many behaviors.');
  const choices = new Set(definition.behaviorChoices.map(choice => choice.when + ':' + choice.then));
  // Early exhibit records carry this inert rule on every exhibit.
  if (Object.hasOwn(KIT_SCHEMAS, definition.kind)) choices.add('leave:pause');
  const seen = new Set();
  for (const record of records) {
    const key = record?.when + ':' + record?.then;
    if (!isObject(record) || Object.keys(record).length !== 4 || record.if !== 'canView' ||
      record.target !== 'self' || !choices.has(key) || seen.has(key)) {
      throw new Error('Behavior is outside this piece’s controls.');
    }
    seen.add(key);
  }
}

function validateContent(content) {
  if (!isObject(content) || Object.keys(content).length !== DIMENSIONS.length ||
    DIMENSIONS.some(([key]) => !validPair(content[key]))) {
    throw new Error('Set amount and graphicness for all six dimensions.');
  }
}

export function validateBuilderPiece(piece, { placeId } = {}) {
  const definition = Object.hasOwn(BUILDER_PIECES, piece?.kind) ? BUILDER_PIECES[piece.kind] : null;
  if (!definition || definition.recordKind === 'Path' || !isPieceId(piece.id)) {
    throw new Error('Invalid kit piece.');
  }
  const { position, yaw, scale } = piece.transform ?? {};
  if (!Array.isArray(position) || position.length !== 3 ||
    !position.every(isCoordinate) ||
    !Number.isFinite(yaw) || !Number.isFinite(scale) || scale < definition.limits.minScale || scale > definition.limits.maxScale) {
    throw new Error('Placement is outside the kit limits.');
  }
  const ref = piece.ref;
  if (ref != null) {
    if (!isObject(ref) ||
      definition.recordKind === 'helper' && (Object.keys(ref).length !== 1 || !isPlaceId(ref.actorId)) ||
      definition.recordKind === 'Place' && (Object.keys(ref).length !== 1 || !isPlaceId(ref.placeId)) ||
      ['Thing', 'reference'].includes(definition.recordKind) && (Object.keys(ref).length !== 2 ||
        !isPlaceId(ref.placeId) || !isPlaceId(ref.thingId)) ||
      placeId && ['Thing', 'Place'].includes(definition.recordKind) && ref.placeId !== placeId) {
      throw new Error('This piece has an invalid record reference.');
    }
  }
  validateSettings(definition, piece.settings);
  validateBehaviors(definition, piece.behaviors);
  if (piece.block) validateContent(piece.block.content);
  if (Object.hasOwn(KIT_SCHEMAS, definition.kind)) {
    validateComponent({ id: piece.id, kind: piece.kind, position: [position[0], position[2]],
      settings: piece.settings, behaviors: piece.behaviors });
  }
  return true;
}

export function builderPieceCost(piece) {
  const definition = Object.hasOwn(BUILDER_PIECES, piece?.kind) ? BUILDER_PIECES[piece.kind] : null;
  if (!definition) throw new Error('Unknown kit piece.');
  return { ...definition.cost, behaviors: piece.behaviors?.length ?? 0 };
}

export function runBuilderBehaviors(piece, event, access) {
  validateBuilderPiece(piece);
  if (!Object.hasOwn(KIT_SCHEMAS, piece.kind)) return [];
  return interpret(piece, event, access);
}

function authoredThing(piece, content, definition) {
  const { settings } = piece;
  const id = piece.ref?.thingId ?? piece.id;
  const text = settings.text?.trim() || settings.transcript || settings.title;
  const alt = settings.photos?.map(photo => photo.alt).join(' ') || settings.title;
  return {
    id, type: definition.blockType, title: settings.title, importance: 'core', body: text,
    reps: { text, alt, ...(settings.transcript ? { transcript: settings.transcript } : {}) },
    sources: [], content, backing_ref: null,
    standing: { declarationRef: null, measurementRecordsRef: null, declarationRecordReadingRef: null },
  };
}

export function makeBuilderPiece(kind, {
  placeId, id = crypto.randomUUID(), position = [0, 0, 0], yaw = 0, scale = 1, settings, behaviors, content,
  thingId, originPlaceId = placeId,
} = {}) {
  const definition = Object.hasOwn(BUILDER_PIECES, kind) ? BUILDER_PIECES[kind] : null;
  if (!definition || definition.recordKind === 'Path') throw new Error('Choose a kit piece you can place here.');
  let ref = null;
  if (definition.recordKind === 'helper') ref = { actorId: id };
  else if (definition.recordKind === 'reference' && originPlaceId) ref = { placeId: originPlaceId, thingId: thingId ?? id };
  else if (placeId) ref = definition.recordKind === 'Place' ? { placeId } : { placeId, thingId: thingId ?? id };
  const piece = {
    id, kind, ref,
    transform: { position: snapBuilderPosition(position), yaw, scale },
    settings: { ...structuredClone(definition.defaultSettings), ...structuredClone(settings ?? {}) },
    behaviors: structuredClone(behaviors ?? definition.defaultBehaviors ?? []),
  };
  validateBuilderPiece(piece, { placeId });
  if (definition.recordKind === 'Thing') {
    const declaration = structuredClone(content ?? scores());
    validateContent(declaration);
    piece.block = authoredThing(piece, declaration, definition);
  }
  return piece;
}

export function createBuilderPiece(kind, { placeId, targetPlaceId, ...options } = {}) {
  if (!isPlaceId(placeId)) throw new Error('Choose a Place for this piece.');
  const definition = Object.hasOwn(BUILDER_PIECES, kind) ? BUILDER_PIECES[kind] : null;
  if (!definition) throw new Error('Unknown kit piece.');
  if (definition.recordKind === 'Path') {
    const id = options.id ?? crypto.randomUUID();
    if (!isPieceId(id) || !isPlaceId(targetPlaceId) || targetPlaceId === placeId) {
      throw new Error('Choose the destination for this crossing.');
    }
    const [x, , z] = snapBuilderPosition(options.position ?? [0, 0, 0]);
    return { piece: null, change: { op: 'create', kind: 'Path', ref: { pathId: id },
      fields: { from: placeId, to: targetPlaceId, type: definition.pathType, position: [x, z] }, provenanceRef: null } };
  }
  const { block, ...piece } = makeBuilderPiece(kind, { placeId, ...options });
  if (block) return { piece, change: { op: 'create', kind: 'Thing', ref: piece.ref, fields: block, provenanceRef: null } };
  if (definition.recordKind === 'helper') {
    const fields = { placeId, name: piece.settings.title, role: definition.role,
      declaredCapabilities: [...definition.capabilities], backing_ref: null };
    return { piece, change: { op: 'create', kind: 'helper', ref: piece.ref,
      fields: { ...fields, requestedScope: helperScope(fields) }, provenanceRef: null } };
  }
  return { piece, change: null };
}

export function createBuilderInterior({ placeId, parentPlaceId, pathId, frontage, bays = [], partitions = [] }) {
  if (!isPlaceId(placeId) || !isPlaceId(parentPlaceId) || !isPlaceId(pathId) || placeId === parentPlaceId) {
    throw new Error('An exhibit hall needs its own Place, containing Place, and door.');
  }
  const scene = 'hall:' + placeId.toLowerCase().replace(/[^a-z0-9-]+/g, '-');
  return defineInterior({
    kind: 'exhibit-hall', scene, parent: parentPlaceId, edge: pathId, width: 18, depth: 24, height: 4.8,
    frontage: { width: 6.4, height: 4.4, depth: 4.8, door: [0, 0], arrival: [0, 3], outside: [0, 5], ...frontage },
    arrival: { position: [0, 8.4], facing: 0 }, exit: [0, 11.65], bays, partitions,
  });
}
