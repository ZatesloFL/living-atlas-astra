import { DIMENSIONS, validPair } from './scores.js';

export const UPLOAD_SCORE_SCHEMA = Object.freeze({name: 'atlas-upload-scores-v1'});
export const PHOTO_DESCRIPTION_LIMIT = 1500;
export const PHOTO_OBSERVATION_LIMIT = 380;
export const PHOTO_SCORE_MODEL = 'anthropic/claude-haiku-5-5';
export const AUDIO_TRANSCRIPTION_MODEL = 'openai/gpt-transcribe';
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
  if (!['text', 'image', 'audio-transcript'].includes(basis) || proposal?.kind !== 'upload-scores' || proposal.basis !== basis ||
    Object.keys(proposal).length !== (basis === 'text' ? 3 : 5) ||
    Object.keys(proposal.scores ?? {}).length !== DIMENSIONS.length ||
    DIMENSIONS.some(([key]) => !validPair(proposal.scores[key]))) throw new Error('Invalid upload score proposal.');
  if (basis !== 'text' && (!validPhotoObservation(proposal.observation) || typeof proposal.descriptionDisagrees !== 'boolean')) {
    throw new Error('Invalid live score proposal. Your upload is still unpublished.');
  }
}

export function uploadScoreBasis(contentType) {
  if (contentType?.startsWith('image/')) return 'image';
  if (contentType?.startsWith('text/')) return 'text';
  if (contentType === 'audio/wav') return 'audio-transcript';
  return null;
}

export async function proposeUploadScores(ai, {file, item, room, signal, description = ''}) {
  const mime = item.contentType ?? item.content_type ?? file?.type ?? '';
  const basis = uploadScoreBasis(mime);
  if (!basis) throw new Error('Live assessment for this audio format is unavailable. Use a PCM WAV to request a proposal. Your upload stays unpublished.');
  const context = {action: 'declare-upload', uploadBasis: basis, place: {key: room.id}, blocks: []};
  if (basis !== 'text') {
    if (!validPhotoRecordId(item.id)) throw new Error('This file has no hosted upload record.');
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
  if (basis !== 'text') {
    const audio=basis==='audio-transcript';
    if (receiptData?.provider !== 'anthropic' || !validPhotoRecordId(receiptData.receiptId) ||
        audio && !validPhotoRecordId(receiptData.transcriptionReceiptId)) {
      throw new Error('The live proposal has incomplete Receipts. Your upload is still unpublished.');
    }
    return {
      basis, scores: proposal.scores, model, provenance: receiptData.cached===true
        ? 'Live · recovered the existing '+(audio?'transcript':'image')+' assessment and its original description comparison.'
        : audio?'Live · proposed from transcribed speech. Listen to the audio to review sound and intensity.':'Live · proposed from the uploaded image.',
      proposalReceiptId: receiptData.receiptId, observation: proposal.observation,
      ...(audio?{transcriptionReceiptId:receiptData.transcriptionReceiptId}:{}),
      descriptionDisagrees: proposal.descriptionDisagrees
    };
  }
  return {
    basis, scores: proposal.scores, model,
    provenance: 'Simulated · keyword proposal from a local text sample. Review the entire Thing before declaring.'
  };
}
