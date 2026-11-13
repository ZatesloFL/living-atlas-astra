// One provider boundary. The shipped singleton is local-only; an explicit
// transport can be supplied after separate activation approval.
export const PROPOSAL_SCHEMA={name:'atlas-crossing-proposal-v1',required:['kind','room','reason'],kinds:['answer','tour','note','score','curation','connection']};
export function validateProposal(value,schema=PROPOSAL_SCHEMA){
 if(!value||typeof value!=='object'||Array.isArray(value)||schema.name!==PROPOSAL_SCHEMA.name)throw new Error('Invalid proposal schema');if(schema.required.some(k=>typeof value[k]!=='string')||!schema.kinds.includes(value.kind)||value.reason.length>2000)throw new Error('Malformed proposal');
 const keys={answer:['text','citations'],tour:['trail'],note:['blockId','text','sources','version'],score:['dimension','declared','measured','value'],curation:['cards','trail'],connection:['target']};if(Object.keys(value).some(k=>!['kind','room','reason',...keys[value.kind]].includes(k)))throw new Error('Unexpected proposal field');
 if(['answer','note'].includes(value.kind)&&(typeof value.text!=='string'||value.text.length>3000))throw new Error('Invalid proposed text');if(value.kind==='answer'&&(!Array.isArray(value.citations)||value.citations.some(c=>typeof c!=='string')))throw new Error('Invalid citations');if(value.kind==='note'&&(!Array.isArray(value.sources)||typeof value.blockId!=='string'||typeof value.version!=='string'))throw new Error('Invalid note');if(value.kind==='tour'&&typeof value.trail!=='string'||value.kind==='connection'&&typeof value.target!=='string')throw new Error('Invalid path proposal');if(value.kind==='score'&&(!Number.isInteger(value.value)||value.value<0||value.value>3||value.dimension!=='sensory'))throw new Error('Invalid score');if(value.kind==='curation'&&(!Array.isArray(value.cards)||value.cards.some(id=>typeof id!=='string')||typeof value.trail!=='string'))throw new Error('Invalid curation');return true;
}
function simulated(context){const room=context.place.key,reason='Simulated proposal from scoped structured context; a person decides whether to use it.';
 switch(context.action){
 case 'answer':{if(!['overview','sources','rules'].includes(context.question))return {kind:'answer',room,reason,text:"I don't know from the blocks available in this view.",citations:[]};const b=context.blocks.find(b=>b.type==='text'&&!/SAMPLE ARTICLE|TEXTBOOK SAMPLE/.test(b.body))??context.blocks[0];const text=context.question==='sources'?'The visible blocks and source pointers are sample material. Claims and archive matches remain to verify. '+(b?.body??'No readable block is in scope.'):context.question==='rules'?'This helper reads only the permitted Things in this Place. Its look grant allows it to propose answers and tours, not changes to the Place. A person decides whether to use them. Travel still checks every door and your hard limits.':b?.body??'No readable block is within the current grant and Lens. Confirm a preview or choose another Place.';return {kind:'answer',room,reason,text:String(text).slice(0,1400),citations:b?[b.id]:[]};}
 case 'tour':return {kind:'tour',room,reason,trail:context.availableTrails[0]??''};
 case 'note':return {kind:'note',room,reason:context.variant===1?'The gallery must not be mistaken for archival photography.':'The chronology is provisional and needs item-level primary evidence.',blockId:context.variant===1?'archive-image':'timeline',text:context.variant===1?'Sample clarification: these images are generated illustrations. No archive photograph, historical scene or rights clearance is asserted.':'Research note (sample): this timeline remains provisional. Compare each milestone with item-level records before changing its verification status.',sources:[{label:'Florida Memory · research starting point, item-level match pending',url:'https://www.floridamemory.com/',status:'to verify'}],version:'documentary'};
 case 'flag':return {kind:'score',room,reason:`Declared Sensory ${context.declared.sensory}; measured Sensory ${context.measured.sensory}. Propose matching the declaration to the measured value. The effective limit already uses the higher score.`,dimension:'sensory',declared:context.declared.sensory,measured:context.measured.sensory,value:context.measured.sensory};
 case 'curate':return {kind:'curation',room,reason:'These already-reachable Things form a transparent first-visit board and studio trail.',cards:context.allowedCards.slice(0,4),trail:context.availableTrails.find(t=>t==='inside-studio')??context.availableTrails[0]??''};
 case 'connect':return {kind:'connection',room,reason:'A related public Place may help readers compare sources and public memory. This is a suggested link, not an assertion of a historical event site.',target:context.destinations.find(id=>id==='capitol')??context.destinations[0]??''};
 default:throw new Error('No simulated proposal for this crossing');
 }
}
export function createAI({transport=null}={}){return {provider:transport?'proxy':'simulated',async request({job,context,schema=PROPOSAL_SCHEMA,agentId,signal,isCurrent=()=>true}){
 if(!['builder','guide','background','heavy'].includes(job)||typeof agentId!=='string'||!context?.place||!Array.isArray(context.blocks))throw new Error('Incomplete structured context');
 const snapshot=JSON.stringify(context),copy=structuredClone(context);
 const current=()=>{if(signal?.aborted||!isCurrent()||JSON.stringify(context)!==snapshot)throw new DOMException('Request cancelled','AbortError');};
 current();let fallback=null;
 if(transport?.eligible({job,agentId,context:copy})){
  try{const result=await transport.request({job,agentId,context:copy,signal});current();validateProposal(result.proposal,schema);
   if(result.agentId!==agentId||result.proposal.kind!=='answer'||result.proposal.room!==copy.place.key||result.proposal.citations.some(id=>!copy.blocks.some(b=>b.id===id))||typeof result.model!=='string'||result.model.length>200||typeof result.receiptData?.receiptId!=='string'||!/^[a-f0-9-]{36}$/.test(result.receiptData.receiptId))throw new Error('Invalid live proposal');
   return {proposal:result.proposal,model:result.model,agentId,receiptData:{provider:'proxy',job,model:result.model,agentId,result:'proposed',receiptId:result.receiptData.receiptId}};
  }catch(error){current();transport.failed?.();fallback=error.code==='LIVE_LIMIT_REACHED'?'LIVE_LIMIT_REACHED':'LIVE_UNAVAILABLE';}
 }
 current();const proposal=simulated(copy);validateProposal(proposal,schema);
 return {proposal,model:'simulated-v1',agentId,receiptData:{provider:'simulated',job,model:'simulated-v1',agentId,result:'proposed',...(fallback?{fallbackReason:fallback}:{})}};
}};}
export const ai=createAI();
