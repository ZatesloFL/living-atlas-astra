import {PLACE_OVERVIEW_ID} from './place-evidence.js';
export const QUESTION_LIMIT=600;
export const DONT_KNOW="I don't know from the blocks available in this view.";
export const PRESET_QUESTIONS={overview:'What is this Place?',sources:'What needs verification?',rules:'What can this helper do?'};
export function normalizeQuestion(value){
 if(typeof value!=='string'||!value.trim())throw new Error('Type a question first.');
 const question=value.trim();if([...question].length>QUESTION_LIMIT)throw new Error(`Keep your question to ${QUESTION_LIMIT} characters.`);
 return question;
}
const stop=new Set('a an the i me my we you your it its this that these those to of for from in on at with and or is are was were be been do does did can could would should what which who when where why how please tell about'.split(' '));
const words=s=>String(s).toLowerCase().match(/[\p{L}\p{N}]+/gu)??[];
const stem=s=>s.length>4?s.replace(/(?:ing|ed|es|s)$/,'').replace(/e$/,''):s;
export function rankedQuestionBlocks(context){
 const terms=[...new Set(words(context.question).filter(w=>!stop.has(w)).map(stem))];
 if(!terms.length)return [];
 return context.blocks.map((block,index)=>{const body=new Set(words(block.body??'').map(stem));return {block,index,score:terms.filter(w=>body.has(w)).length,terms:terms.length};})
  .filter(x=>x.score>0).sort((a,b)=>b.score/b.terms-a.score/a.terms||a.index-b.index);
}
export function localQuestionAnswer(context){
 // Conservative extractive lookup, not generated prose or invented facts.
 // All meaningful question terms must occur in the same readable block.
 const passages=context.blocks.flatMap(b=>typeof b.body==='string'?(b.body.match(/[^\n]{1,800}/gu)??[]).map(body=>({...b,body})):[]);
 const match=rankedQuestionBlocks({...context,blocks:passages}).find(x=>x.score===x.terms);
 if(!match)return {text:DONT_KNOW,citations:[]};
 return {text:match.block.body.slice(0,800),citations:[match.block.id]};
}
export function typedQuestionBlockIds(context){
 // Send IDs only. Keep a small byte allowance for selected bodies, leaving room
 // for the unchanged server prompt, schema, question and accounting overhead.
 let remaining=Math.max(800,3000-new TextEncoder().encode(context.question).length);
 const ids=[];
 // The current Place's own words are always available, even when an overview
 // question has no keyword in an exhibit body. Other selection stays exact.
 const overview=context.blocks.find(block=>block.id===PLACE_OVERVIEW_ID);
 for(const {block} of [...(overview?[{block:overview}]:[]),...rankedQuestionBlocks(context).filter(({block})=>block!==overview)]){
  const size=new TextEncoder().encode(JSON.stringify({body:block.body,sources:block.sources??[]})).length+100;
  if(size>remaining)continue;ids.push(block.id);remaining-=size;if(ids.length===3)break;
 }
 return ids;
}

export function quotedQuestionCoverage(context,proposal){
 if(proposal.text===DONT_KNOW)return false;
 if(Object.hasOwn(PRESET_QUESTIONS,context.question))return true;
 // A Place overview is an explicit evidence kind, not keyword fuzziness.
 if(/^what (?:is|are) (?:this|the) (?:place|hall|exhibition|exhibit)(?: about)?[?.!]*$/i.test(context.question.trim()))return proposal.citations.includes(PLACE_OVERVIEW_ID);
 // Exact quotations establish source fidelity, not that all parts of a question
 // were answered. Apply the local lookup's conservative coverage floor as well.
 const cited=context.blocks.filter(block=>proposal.citations.includes(block.id));
 return rankedQuestionBlocks({...context,blocks:cited}).some(match=>match.score===match.terms);
}
