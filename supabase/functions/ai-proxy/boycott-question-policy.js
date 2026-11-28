// Question facets for the boycott Docent. This selects citable evidence; it
// never supplies a historical answer, rewrites a quote, or relaxes grounding.
export function boycottQuestionKind(value){
 const q=String(value).trim().replace(/[?.!]+$/,'').toLowerCase();
 if(q==='overview'||/^what (?:is|are) (?:this|the) (?:place|hall|exhibition|exhibit)(?: about)?$/.test(q))return 'overview';
 if(q==='sources'||q==='what needs verification')return 'verification';
 if(q==='rules'||q==='what can this helper do')return 'capabilities';
 if(/^who (?:led|leads|organized|organised) (?:this|it|the boycott|the campaign)$/.test(q)||/^who (?:were|are) the (?:boycott )?leaders$/.test(q))return 'leadership';
 if(/^(?:did (?:it|the boycott|the campaign) (?:actually )?work|was (?:it|the boycott) successful|what (?:changed|were the outcomes|was the outcome))$/.test(q))return 'outcome';
 if(q==='what bus service did residents boycott')return 'bus-service';
 return null;
}
export const BOYCOTT_ANSWER_RULES={
 overview:'Explain the subject of this Place from its authored overview. Quote its summary, not just its title or location.',
 leadership:'Name who led or organized the boycott. Quote a complete passage containing the named leader or organizing body AND their leadership role. A general description of what the boycott was does not answer who.',
 outcome:'Quote the recorded outcome: what happened to the bus service and whether segregation ended. Pressure or negotiations alone do not establish an outcome. Keep any qualifications in the passage.',
 verification:'Quote what remains to verify or check against sources, including the record’s qualifications.',
 capabilities:'Quote what this helper may do under its look grant, including its limits. Historical facts do not answer this question.',
 'bus-service':'Quote which bus service residents boycotted.'
};
const leadership=/\b(?:led|leads|leaders?|leadership|president|headed|organized|organised|organizers?|organisers?)\b/i;
const name=/\b[A-Z][\p{L}.’.-]*(?:[ -]+[A-Z][\p{L}.’.-]*)+/u;
export function boycottQuoteAnswers(kind,text,id){
 if(typeof text!=='string'||!text.trim())return false;
 switch(kind){
 case 'overview':return ['place-overview','lead','kids-lead'].includes(id)&&text.trim().split(/\s+/).length>=5;
 case 'leadership':return leadership.test(text)&&name.test(text);
 case 'outcome':return /\b(?:desegregat\w*|integrat\w*|succeed\w*|success\w*|ended|won|resum\w*|achieved)\b/i.test(text)&&/\b(?:bus\w*|boycott|segregat\w*|service|campaign)\b/i.test(text);
 case 'verification':return /\b(?:verify|verification|unverified|checking|checked|pending)\b/i.test(text);
 case 'capabilities':return id==='helper-grant'&&/\b(?:answer questions|propose tours)\b/.test(text)&&/\blook grant\b/.test(text);
 case 'bus-service':return /\bbus service\b/i.test(text)&&/\b(?:segregated|boycott)\b/i.test(text);
 default:return false;
 }
}
export function boycottEvidenceMatches(kind,block){
 // The source must carry the requested facet in its body, not only its title.
 const body=typeof block.body==='string'?block.body:'';
 return boycottQuoteAnswers(kind,body,block.id);
}
