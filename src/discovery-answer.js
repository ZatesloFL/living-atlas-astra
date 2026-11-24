import {DIMENSIONS} from './scores.js';
import {normalizeQuestion} from './docent-questions.js';
export const DISCOVERY_UNKNOWN="I don't know from the indexed results in this view.";
export function discoveryQuestionQuery(question,query={}){
 const text=normalizeQuestion(question).toLowerCase().replace(/[’']/g,'');
 if((text.match(/[?？]/g)??[]).length>1)throw new Error('Ask one question at a time.');
 if(['whats here?','what is here?','whats it like?','what is it like?','what fits my lens?','here','like','lens'].includes(text))return {...query};
 const words=text.replace(/[?.,!]/g,' ').split(/\s+/).filter(word=>word&&!['what','whats','where','is','are','a','an','the','can','i','find','show','me','about','tell','please'].includes(word)).join(' ');
 return {...query,words};
}
export function discoveryEvidence(result){
 return result.results.map(card=>({id:card.indexId,type:'text',sources:[],body:[
  card.title,
  `Declared: ${DIMENSIONS.map(([key,label])=>label+' '+card.declaration[key].amount+' × '+card.declaration[key].graphicness).join('; ')}.`,
  `Declaration record: ${card.facets.declaration??'shared at a knock or door'}. Steward: ${card.readings.steward?'measured':'unmeasured'}. Audience: ${card.readings.audience?'measured':'unmeasured'}.`,
  ...(card.softGaps.length?['Lens gap: '+card.softGaps.join('; ')+'.']:[]),
  card.why
 ].join('\n')}));
}
export function answerFromIndex(context){
 const selected=[];let length=0;
 for(const block of context.blocks.slice(0,3)){
  if(length+block.body.length+(selected.length?2:0)>3000)break;
  selected.push(block);length+=block.body.length+(selected.length>1?2:0);
 }
 return {text:selected.map(block=>block.body).join('\n\n')||DISCOVERY_UNKNOWN,citations:selected.map(block=>block.id)};
}
export function validateIndexAnswer(proposal,context){
 const cited=context.blocks.filter(block=>proposal.citations.includes(block.id));
 if(proposal.citations.some(id=>!cited.some(block=>block.id===id))||
  (cited.length?!proposal.text.split('\n\n').every(part=>cited.some(block=>part===block.body)):proposal.text!==DISCOVERY_UNKNOWN))throw new Error('Discovery answer must quote the current index evidence exactly.');
}
