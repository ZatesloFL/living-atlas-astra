import { DIMENSIONS, validPair } from './scores.js';

export const UPLOAD_SCORE_SCHEMA = Object.freeze({name: 'atlas-upload-scores-v1'});
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
  if (context.action !== 'declare-upload' || !['text', 'description', 'unread'].includes(context.uploadBasis) ||
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
  if (proposal?.kind !== 'upload-scores' || proposal.basis !== basis ||
    Object.keys(proposal).length !== 3 || Object.keys(proposal.scores ?? {}).length !== DIMENSIONS.length ||
    DIMENSIONS.some(([key]) => !validPair(proposal.scores[key]))) throw new Error('Invalid upload score proposal.');
}

export async function proposeUploadScores(ai, {file, item, room, signal, description = ''}) {
  const mime = item.contentType ?? item.content_type ?? file?.type ?? '';
  let body = '', basis = 'unread';
  if (mime.startsWith('text/') && file) {
    // Decode a bounded leading sample. No file bytes or text go to the live guide.
    body = (await file.slice(0, MAX_TASTE).text()).slice(0, MAX_TASTE);
    basis = 'text';
  } else if (description.trim()) {
    body = description.trim().slice(0, MAX_TASTE);
    basis = 'description';
  }
  const {proposal, model} = await ai.request({
    job: 'background', agentId: 'upload-declaration-helper', schema: UPLOAD_SCORE_SCHEMA, signal,
    context: {action: 'declare-upload', uploadBasis: basis, place: {key: room.id}, blocks: body ? [{body}] : []}
  });
  const provenance = {
    text: 'Simulated · keyword proposal from a local text sample. Review the entire Thing before declaring.',
    description: 'Simulated · keyword proposal from your description or transcript. The media itself has not been inspected.',
    unread: 'Simulated · media was not inspected. Review the file and set both dials before declaring.'
  }[proposal.basis];
  return {scores: proposal.scores, model, provenance};
}
