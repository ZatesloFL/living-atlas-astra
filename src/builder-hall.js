import {createBuilderInterior, validateBuilderPiece} from './builder-pieces.js';
import {exhibitSpace} from './interior-kit.js';
import {exhibitPlacement} from './kit-placement.js';
import {scores} from './scores.js';
import {withinSceneBounds} from './world-bounds.js';

export function builderHallIdentity(parentPlaceId, pieceId) {
  const placeId = parentPlaceId + '/hall-' + pieceId;
  return {placeId, pathId: placeId + '/door'};
}

export function builderHallExteriorFootprint(hallRoom) {
  const {door, facing, width, depth, arrival, outside} = hallRoom.layout.interior.frontage;
  const cos = Math.cos(facing), sin = Math.sin(facing);
  const half = Math.max(width / 2 + .15, 2.2);
  const corners = [[-half,-depth-.2],[half,-depth-.2],[-half,2.3],[half,2.3]];
  return [arrival,outside,...corners.map(([x,z])=>[door[0] + cos * x + sin * z,door[1] + cos * z - sin * x])];
}

export function builderHallPlacementFits(parent, hallRoom) {
  return builderHallExteriorFootprint(hallRoom).every(([x,z])=>
    withinSceneBounds(hallRoom.layout.scene,parent.layout.interior,x,z));
}

export function validateBuilderHallPlacement(parent, hallRoom) {
  if (!builderHallPlacementFits(parent,hallRoom)) {
    throw new Error('Move the Exhibit hall so its frontage and arrival points fit inside the containing Place.');
  }
}

// A kit piece supplies the threshold in the containing Place. Inside, the
// authored hall has its own coordinate frame and can contain other kit pieces.
export function materializeBuilderHall(parent, piece, {visibility=parent.visibility==='public'?'public':'hidden'}={}) {
  if (piece?.kind !== 'interior-shell' || !piece.block) throw new Error('Choose an authored Exhibit hall.');
  validateBuilderPiece(piece, {placeId: parent.id});
  const {placeId, pathId} = builderHallIdentity(parent.id, piece.id);
  const [x, , z] = piece.transform.position;
  const {slot: door, facing} = exhibitPlacement(exhibitSpace(parent), {
    position: [x, z], facing: piece.transform.yaw,
  });
  const scale = piece.transform.scale;
  const offsetFromDoor = distance => [door[0] + Math.sin(facing) * distance, door[1] + Math.cos(facing) * distance];
  const frontage = {
    door, facing,
    width: Math.max(4, 6.4 * scale),
    height: Math.max(3.5, Math.min(4.45, 4.4 * scale)),
    depth: Math.max(3, 4.8 * scale),
    arrival: offsetFromDoor(2.7), outside: offsetFromDoor(4.1),
  };
  // Encode separators separately so different catalog paths cannot share a scene.
  const scene = 'hall:builder-' + placeId.toLowerCase().replace(/[-_/]/g, value => ({'-':'-d','_':'-u','/':'-s'})[value]);
  const interior = createBuilderInterior({placeId, parentPlaceId: parent.id, pathId, scene, frontage});
  const layout = {
    kind: 'exhibit-hall', scene: parent.layout.interior?.scene ?? parent.layout.scene,
    slot: door, facing, scale: 1, approach: frontage.arrival, interior,
    arrivals: {
      outside: {position: frontage.outside, facing}, door: {position: frontage.arrival, facing},
      inside: interior.arrival,
    },
  };
  const title = piece.block.title;
  const body = typeof piece.block.body === 'string' ? piece.block.body : title;
  const ref = {placeId};
  const fields = {
    title, district: parent.district??'makers', visibility,
    ...(parent.author ? {author: structuredClone(parent.author)} : {}),
    content: structuredClone(piece.block.content),
    standing: {
      declarationRef: null,
      measurementRecordsRef: {kind: 'atlas-measurements-v1', subject: ref},
      declarationRecordReadingRef: {kind: 'atlas-declaration-reading-v1', subject: ref},
    },
    admission: {mode: 'filtered', minimum: scores()},
    substance: {summary: body, body, claims: []},
    backing_ref: piece.block.backing_ref ?? null,
    sources: structuredClone(piece.block.sources ?? []),
    blocks: [],
  };
  const path = {from: parent.id, to: placeId, type: 'door',
    position: door, before: frontage.arrival, contextPriority: -1,
    ...(Math.abs(Math.sin(facing))>Math.abs(Math.cos(facing))?{axis:'x'}:{})};
  return {
    pieceId: piece.id,
    room: {placeId, parentPlaceId: parent.id, layout, pathIds: [], pieces: [], behaviors: []},
    changes: [
      {op: 'create', kind: 'Place', ref, fields, provenanceRef: null},
      {op: 'create', kind: 'Path', ref: {pathId}, fields: path, provenanceRef: null},
    ],
  };
}
