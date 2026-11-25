import {DIMENSIONS,AXES,validPair} from './scores.js';

export const BUILDER_ATLAS_AREAS = {build:'Build',sources:'Sources'};
const id = value => typeof value==='string' && /^[a-z0-9][a-z0-9_/-]{0,199}$/i.test(value);
const uuid = value => typeof value==='string' && /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
const hash = value => typeof value==='string' && /^[0-9a-f]{64}$/.test(value);
function exact(value,required,optional=[]) {
 return value && Object.getPrototypeOf(value)===Object.prototype &&
  required.every(key=>Object.hasOwn(value,key)) &&
  Object.keys(value).every(key=>required.includes(key)||optional.includes(key));
}
const scores = value => exact(value,DIMENSIONS.map(([key])=>key)) &&
 DIMENSIONS.every(([key])=>exact(value[key],AXES)&&validPair(value[key]));

const actions = {
 'place-piece':{areas:['build'],check:p=>exact(p,['kind'])&&id(p.kind)},
 'move-piece':{areas:['build'],check:p=>exact(p,['pieceId','move'])&&id(p.pieceId)&&
  Array.isArray(p.move)&&p.move.length===2&&[[-1,0],[1,0],[0,-1],[0,1]].some(([x,z])=>p.move[0]===x&&p.move[1]===z)},
 'declare-upload':{areas:['sources'],check:p=>exact(p,['itemId','scores'],['assessmentReceiptId','transcriptionReceiptId'])&&
  uuid(p.itemId)&&scores(p.scores)&&
  (!Object.hasOwn(p,'assessmentReceiptId')||uuid(p.assessmentReceiptId))&&
  (!Object.hasOwn(p,'transcriptionReceiptId')||uuid(p.transcriptionReceiptId)&&uuid(p.assessmentReceiptId))},
 'connect-and-map':{areas:['sources'],check:p=>exact(p,['sourceId','kind','syncMode','recipe','planFingerprint'])&&
  id(p.sourceId)&&['live','indexed','snapshot'].includes(p.syncMode)&&
  (p.kind==='drive'&&p.recipe==='drive-alcoves'||p.kind==='collection-db'&&p.recipe==='gallery-plinths')&&hash(p.planFingerprint)},
 'place-source':{areas:['sources','build'],check:p=>exact(p,['reference','position'])&&
  exact(p.reference,['kind','sourceId','itemId'])&&['upload','video'].includes(p.reference.kind)&&id(p.reference.sourceId)&&
  typeof p.reference.itemId==='string'&&/^[\w-]{1,160}$/.test(p.reference.itemId)&&Array.isArray(p.position)&&
  p.position.length===3&&p.position.every(n=>Number.isFinite(n)&&Math.abs(n)<=30)},
 'publish-draft':{areas:['sources','build'],check:p=>exact(p,['previewReceiptId'])&&
  typeof p.previewReceiptId==='string'&&p.previewReceiptId.startsWith('builder:')&&hash(p.previewReceiptId.slice(8))}
};

export function extensionAreas(value) {
 const action=Object.hasOwn(actions,value?.action)?actions[value.action]:null;
 if(!exact(value,['kind','area','action','placeId','payload'])||value.kind!=='extension'||
   !action||value.area!==action.areas[0]||!id(value.placeId)||!action.check(value.payload)) {
  throw new Error('Invalid Atlas Build or Sources proposal.');
 }
 return action.areas;
}
