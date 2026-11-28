import {boycottQuestionKind} from './boycott-question-policy.js';
import {readableAnswer} from './place-evidence.js';
import {validPair,scoreText} from './scores.js';
import {ATLAS_INTENT_SCHEMA,atlasIntent,validateAtlasIntent} from './atlas-intents.js';
// One provider boundary with validated simulation when live help is unavailable.
import {createBrowserTransport,browserLocalReason} from './ai-proxy.js';
import {localQuestionAnswer,quotedQuestionCoverage,DONT_KNOW} from './docent-questions.js';
import {PHOTO_DESCRIPTION_LIMIT,PHOTO_SCORE_MODEL,UPLOAD_SCORE_SCHEMA,simulatedUploadScores,validPhotoRecordId,validateUploadScores} from './upload-scores.js';
import {requestAudioScores,requestPhotoScores} from './source-session.js';
import {answerFromIndex,validateIndexAnswer} from './discovery-answer.js';
export const PROPOSAL_SCHEMA={name:'atlas-crossing-proposal-v1',required:['kind','room','reason'],kinds:['answer','tour','note','score','curation','connection']};
export function validateProposal(value,schema=PROPOSAL_SCHEMA){
 if(!value||typeof value!=='object'||Array.isArray(value)||schema.name!==PROPOSAL_SCHEMA.name)throw new Error('Invalid proposal schema');if(schema.required.some(k=>typeof value[k]!=='string')||!schema.kinds.includes(value.kind)||value.reason.length>2000)throw new Error('Malformed proposal');
 const keys={answer:['text','citations'],tour:['trail'],note:['blockId','text','sources','version'],score:['dimension','declared','measured','value'],curation:['cards','trail'],connection:['target']};if(Object.keys(value).some(k=>!['kind','room','reason',...keys[value.kind]].includes(k)))throw new Error('Unexpected proposal field');
 if(['answer','note'].includes(value.kind)&&(typeof value.text!=='string'||value.text.length>3000))throw new Error('Invalid proposed text');if(value.kind==='answer'&&(!Array.isArray(value.citations)||value.citations.some(c=>typeof c!=='string')))throw new Error('Invalid citations');if(value.kind==='note'&&(!Array.isArray(value.sources)||typeof value.blockId!=='string'||typeof value.version!=='string'))throw new Error('Invalid note');if(value.kind==='tour'&&typeof value.trail!=='string'||value.kind==='connection'&&typeof value.target!=='string')throw new Error('Invalid path proposal');if(value.kind==='score'&&(!validPair(value.value)||!validPair(value.declared)||!validPair(value.measured)||value.dimension!=='sensory'))throw new Error('Invalid score');if(value.kind==='curation'&&(!Array.isArray(value.cards)||value.cards.some(id=>typeof id!=='string')||typeof value.trail!=='string'))throw new Error('Invalid curation');return true;
}
function simulated(context){const room=context.place.key,reason='Simulated proposal from scoped structured context; a person decides whether to use it.';
 switch(context.action){
 case 'answer':{if(context.place.key==='boycott'&&!context.discovery&&boycottQuestionKind(context.question))return {kind:'answer',room,reason:'Local exact excerpt from the visible record for this question; no live model call.',...localQuestionAnswer(context)};if(context.discovery)return {kind:'answer',room,reason:'Local index lookup. The first results in the visible ordering are quoted exactly; every door still applies.',...answerFromIndex(context)};if(!['overview','sources','rules'].includes(context.question))return {kind:'answer',room,reason:'Local excerpt lookup in the readable blocks; no conversation history is used.',...localQuestionAnswer(context)};const b=context.blocks.find(b=>b.type==='text'&&!/SAMPLE ARTICLE|TEXTBOOK SAMPLE/.test(b.body))??context.blocks[0];const text=context.question==='sources'?'The visible blocks and source pointers are sample material. Claims and archive matches remain to verify. '+(b?.body??'No readable block is in scope.'):context.question==='rules'?'This helper reads only the permitted Things in this Place. Its look grant allows it to propose answers and tours, not changes to the Place. A person decides whether to use them. Travel still checks every door and your hard limits.':b?.body??'No readable block is within the current grant and Lens. Confirm a preview or choose another Place.';return {kind:'answer',room,reason,text:String(text).slice(0,1400),citations:b?[b.id]:[]};}
 case 'tour':return {kind:'tour',room,reason,trail:context.availableTrails[0]??''};
 case 'note':return {kind:'note',room,reason:context.variant===1?'The gallery must not be mistaken for archival photography.':'The chronology is provisional and needs item-level primary evidence.',blockId:context.variant===1?'archive-image':'timeline',text:context.variant===1?'Sample clarification: these images are generated illustrations. No archive photograph, historical scene or rights clearance is asserted.':'Research note (sample): this timeline remains provisional. Compare each milestone with item-level records before changing its verification status.',sources:[{label:'Florida Memory · research starting point, item-level match pending',url:'https://www.floridamemory.com/',status:'to verify'}],version:'documentary'};
 case 'flag':return {kind:'score',room,reason:`Declared Sensory ${scoreText(context.declared.sensory)}; measured Sensory ${scoreText(context.measured.sensory)}. Propose matching the declaration to the measured value. The effective limit already uses the higher score.`,dimension:'sensory',declared:context.declared.sensory,measured:context.measured.sensory,value:context.measured.sensory};
 case 'curate':return {kind:'curation',room,reason:'These already-reachable Things form a transparent first-visit board and studio trail.',cards:context.allowedCards.slice(0,4),trail:context.availableTrails.find(t=>t==='inside-studio')??context.availableTrails[0]??''};
 case 'connect':return {kind:'connection',room,reason:'A related public Place may help readers compare sources and public memory. This is a suggested link, not an assertion of a historical event site.',target:context.destinations.find(id=>id==='capitol')??context.destinations[0]??''};
 default:throw new Error('No simulated proposal for this crossing');
 }
}
export function createAI({transport=null,requestPhotoScores,requestAudioScores,localReason=browserLocalReason()}={}){
 const eligible=request=>!request.context?.discovery&&transport?.eligible(request);
 const route=({job,agentId,context})=>context?.discovery?'discovery_local':eligible({job,agentId,context})?'live':context?.action!=='answer'?'action_local':context?.place?.key!=='boycott'?'place_local':agentId!=='docent-silver'?'helper_local':localReason??'preview_origin';
 return {provider:transport?'proxy':'simulated',route,async request({job,context,schema=PROPOSAL_SCHEMA,agentId,signal,isCurrent=()=>true}){
 if(!['builder','guide','background','heavy'].includes(job)||typeof agentId!=='string'||!context?.place||!Array.isArray(context.blocks))throw new Error('Incomplete structured context');
 const snapshot=JSON.stringify(context),copy=structuredClone(context);
 const current=()=>{if(signal?.aborted||!isCurrent()||JSON.stringify(context)!==snapshot)throw new DOMException('Request cancelled','AbortError');};
 current();
 if(schema.name===ATLAS_INTENT_SCHEMA.name){
  if(agentId!=='atlas'||job!=='guide'||copy.action!=='personal-intent'||copy.blocks.length)throw new Error('Invalid personal Atlas context.');
  const proposal=atlasIntent(copy.question,{limits:copy.lensLimits});validateAtlasIntent(proposal);current();
  return {proposal,model:'local-atlas-intent-v1',agentId,receiptData:{provider:'simulated',job,model:'local-atlas-intent-v1',agentId,result:'proposed',localReason:'personal_intent_local'}};
 }
 if(job==='background'&&schema.name===UPLOAD_SCORE_SCHEMA.name){
  if(agentId!=='upload-declaration-helper')throw new Error('Invalid upload declaration helper.');
  if(copy.uploadBasis==='image'||copy.uploadBasis==='audio-transcript'){
   const audio=copy.uploadBasis==='audio-transcript',requestLive=audio?requestAudioScores:requestPhotoScores;
   if(copy.action!=='declare-upload'||!validPhotoRecordId(copy.uploadId)||copy.blocks.length||
    typeof copy.description!=='string'||[...copy.description].length>PHOTO_DESCRIPTION_LIMIT)throw new Error('Invalid upload score context.');
   if(typeof requestLive!=='function')throw new Error('Live '+(audio?'audio':'photo')+' scoring is unavailable. Your upload is still unpublished.');
   const result=await requestLive({id:copy.uploadId,description:copy.description,signal});
   current();
   validateUploadScores(result?.proposal,copy.uploadBasis);
   const {proposal,model,receiptData}=result;
   if(model!==PHOTO_SCORE_MODEL||receiptData?.provider!=='anthropic'||
    receiptData.job!==job||receiptData.model!==model||receiptData.agentId!==agentId||
    !validPhotoRecordId(receiptData.receiptId)||audio&&!validPhotoRecordId(receiptData.transcriptionReceiptId)||
    (!copy.description.trim()&&proposal.descriptionDisagrees&&receiptData.cached!==true)){
    throw new Error('Invalid live '+(audio?'audio':'photo')+' proposal Receipt. Your upload is still unpublished.');
   }
   return {proposal,model,agentId,receiptData:{provider:'anthropic',job,model,agentId,result:'proposed',
    receiptId:receiptData.receiptId,...(audio?{transcriptionReceiptId:receiptData.transcriptionReceiptId}:{}),...(receiptData.cached===true?{cached:true}:{})}};
  }
  const proposal=simulatedUploadScores(copy),model='simulated-upload-v1';
  validateUploadScores(proposal,copy.uploadBasis);
  return {proposal,model,agentId,receiptData:{provider:'simulated',job,model,agentId,result:'proposed'}};
 }
 let fallback=null;
 if(eligible({job,agentId,context:copy})){
  try{const result=await transport.request({job,agentId,context:copy,signal});current();validateProposal(result.proposal,schema);
   if(result.agentId!==agentId||result.proposal.kind!=='answer'||result.proposal.room!==copy.place.key||result.proposal.citations.some(id=>!copy.blocks.some(b=>b.id===id))||typeof result.model!=='string'||result.model.length>200||typeof result.receiptData?.receiptId!=='string'||!/^[a-f0-9-]{36}$/.test(result.receiptData.receiptId))throw new Error('Invalid live proposal');
   const cited=copy.blocks.filter(b=>result.proposal.citations.includes(b.id));
   if(cited.length?!result.proposal.text.split('\n\n').every(part=>part.trim()&&cited.some(b=>typeof b.body==='string'&&b.body.includes(part))):result.proposal.text!=="I don't know from the blocks available in this view.")throw new Error('Live answer no longer matches visible Things');
   const known=result.proposal.text!==DONT_KNOW,covered=known&&readableAnswer(result.proposal.text)&&quotedQuestionCoverage(copy,result.proposal);
   const proposal=known&&!covered?{...result.proposal,text:DONT_KNOW,citations:[],reason:'The live response contained exact source quotations, but coverage of this question was not established. The client withheld those excerpts as an answer.'}:result.proposal;
   return {proposal,model:result.model,agentId,receiptData:{provider:'proxy',job,model:result.model,agentId,result:'proposed',receiptId:result.receiptData.receiptId,...(!known?{answerEvidence:'none'}:!covered?{answerEvidence:'coverage-not-established'}:{})}};
  }catch(error){current();transport.failed?.(error);fallback=error.code==='LIVE_LIMIT_REACHED'?'LIVE_LIMIT_REACHED':'LIVE_UNAVAILABLE';}
 }
 current();const proposal=simulated(copy);validateProposal(proposal,schema);if(copy.discovery)validateIndexAnswer(proposal,copy);
 return {proposal,model:'simulated-v1',agentId,receiptData:{provider:'simulated',job,model:'simulated-v1',agentId,result:'proposed',...(fallback?{fallbackReason:fallback,diagnostic:transport.diagnostics?.()??null}:{localReason:route({job,agentId,context:copy})})}};
}};}
export function provenanceLabel(data,proposal){
 if(data?.provider==='proxy'&&(data.answerEvidence||proposal?.text===DONT_KNOW))return data.answerEvidence==='coverage-not-established'?'Live response · answer withheld':'Live · no supported answer';
 if(data?.provider==='proxy')return proposal?.citations?.length&&readableAnswer(proposal.text)?'Live · grounded answer':'Live · no supported answer';
 if(data?.fallbackReason==='LIVE_LIMIT_REACHED')return 'Simulated · live limit reached';
 if(data?.fallbackReason==='LIVE_UNAVAILABLE')return 'Simulated · live helper unavailable';
 return 'Simulated · local helper';
}
export const ai=createAI({transport:createBrowserTransport(),requestPhotoScores,requestAudioScores});
