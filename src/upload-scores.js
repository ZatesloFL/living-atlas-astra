import { DIMENSIONS, validPair } from './scores.js';

export const UPLOAD_SCORE_SCHEMA = Object.freeze({name: 'atlas-upload-scores-v1'});
export const PHOTO_DESCRIPTION_LIMIT = 1500;
export const PHOTO_OBSERVATION_LIMIT = 380;
export const PHOTO_SCORE_MODEL = 'anthropic/claude-haiku-5-5';
export const validPhotoRecordId = value => typeof value === 'string' &&
  /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(value);
export const validPhotoObservation = value => typeof value === 'string' && !!value.trim() &&
  [...value].length <= PHOTO_OBSERVATION_LIMIT && !/[\p{Cc}\u061c\u200e\u200f\u202a-\u202e\u2066-\u2069]/u.test(value);
const MAX_TASTE = 24000;
const terms = {
  violence: [/\b(?:attack|fight|war|killed?|weapon|shooting)\b/gi, /\b(?:gore|dismember|graphic violence|execution)\b/gi],
  sexual: [/\b(?:nudity|nude|sex|sexual|erotic)\b/gi, /\b(?:pornographic|explicit sex)\b/gi],
  language: [/\b(?:damn|hell|crap)\b/gi, /\b(?:fuck\w*|shit\w*|explicit slur)\b/gi],
  disturbing: [/\b(?:death|grief|trauma|abuse|torture|suicide|atrocity)\b/gi, /\b(?:graphic injury|graphic torture|graphic death)\b/gi],
  viewpoint: [/\b(?:political|propaganda|ideology|disputed claim|perspective)\b/gi, /\b(?:racial hatred|hate speech)\b/gi],
  sensory: [/\b(?:flashing|strobe|loud|rapid motion|shouting)\b/gi, /\b(?:rapid flashes|strobe effect|sudden loud)\b/gi]
};

export function simulatedUploadScores(context) {
  if (context.action !== 'declare-upload' || context.uploadBasis !== 'text' ||
    context.blocks.length > 1 || context.blocks.some(block => typeof block.body !== 'string' || block.body.length > MAX_TASTE)) {
    throw new Error('Invalid upload score context.');
  }
  const sample = context.blocks[0]?.body ?? '';
  const scores = Object.fromEntries(DIMENSIONS.map(([key]) => {
    const [ordinary, explicit] = terms[key];
    const plain = [...sample.matchAll(ordinary)].length;
    const strong = [...sample.matchAll(explicit)].length;
    const count = plain + strong;
    return [key, {amount: count === 0 ? 0 : count < 4 ? 1 : count < 12 ? 2 : 3, graphicness: strong ? 3 : plain ? 1 : 0}];
  }));
  return {kind: 'upload-scores', basis: context.uploadBasis, scores};
}

export function validateUploadScores(proposal, basis) {
  if (!['text', 'image'].includes(basis) || proposal?.kind !== 'upload-scores' || proposal.basis !== basis ||
    Object.keys(proposal).length !== (basis === 'image' ? 5 : 3) ||
    Object.keys(proposal.scores ?? {}).length !== DIMENSIONS.length ||
    DIMENSIONS.some(([key]) => !validPair(proposal.scores[key]))) throw new Error('Invalid upload score proposal.');
  if (basis === 'image' && (!validPhotoObservation(proposal.observation) || typeof proposal.descriptionDisagrees !== 'boolean')) {
    throw new Error('Invalid photo score proposal. Your upload is still unpublished.');
  }
}

export function uploadScoreBasis(contentType) {
  if (contentType?.startsWith('image/')) return 'image';
  if (contentType?.startsWith('text/')) return 'text';
  return null;
}

export async function proposeUploadScores(ai, {file, item, room, signal, description = ''}) {
  const mime = item.contentType ?? item.content_type ?? file?.type ?? '';
  const basis = uploadScoreBasis(mime);
  if (!basis) throw new Error('Audio scoring is unavailable. Your upload is still unpublished.');
  const context = {action: 'declare-upload', uploadBasis: basis, place: {key: room.id}, blocks: []};
  if (basis === 'image') {
    if (!validPhotoRecordId(item.id)) throw new Error('This photo has no hosted upload record.');
    context.uploadId = item.id;
    context.description = [...description.trim()].slice(0, PHOTO_DESCRIPTION_LIMIT).join('');
  } else {
    if (!file) throw new Error('The text sample is unavailable. Your upload is still unpublished.');
    // Decode a bounded leading sample. No file bytes or text go to the live guide.
    const body = (await file.slice(0, MAX_TASTE).text()).slice(0, MAX_TASTE);
    if (body) context.blocks.push({body});
  }
  const {proposal, model, receiptData} = await ai.request({
    job: 'background', agentId: 'upload-declaration-helper', schema: UPLOAD_SCORE_SCHEMA, signal,
    context
  });
  validateUploadScores(proposal, basis);
  if (basis === 'image') {
    if (receiptData?.provider !== 'anthropic' || !validPhotoRecordId(receiptData.receiptId)) {
      throw new Error('The live photo proposal has no valid Receipt. Your upload is still unpublished.');
    }
    return {
      basis, scores: proposal.scores, model, provenance: receiptData.cached===true
        ? 'Live · recovered the existing image assessment and its original description comparison.'
        : 'Live · proposed from the uploaded image.',
      proposalReceiptId: receiptData.receiptId, observation: proposal.observation,
      descriptionDisagrees: proposal.descriptionDisagrees
    };
  }
  return {
    basis, scores: proposal.scores, model,
    provenance: 'Simulated · keyword proposal from a local text sample. Review the entire Thing before declaring.'
  };
}
