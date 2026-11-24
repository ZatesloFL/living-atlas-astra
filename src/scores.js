// File 20: amount and graphicness bind independently. Never reduce a pair to a scalar.
export const DIMENSIONS=[['violence','Violence'],['sexual','Sexual content'],['language','Language'],['disturbing','Disturbing themes'],['viewpoint','Viewpoint'],['sensory','Sensory']];
export const AXES=['amount','graphicness'];
export const DIALS=DIMENSIONS.flatMap(([key,label])=>AXES.map(axis=>[key,axis,`${label} · ${axis}`]));
export const pair=(amount=0,graphicness=amount)=>({amount,graphicness});
// Legacy local preferences retain their old ceiling on BOTH axes until edited.
// Authored seed records are re-declared explicitly, not passed through this migration.
export const asPair=value=>value&&typeof value==='object'?pair(value.amount??0,value.graphicness??0):pair(value??0);
export const asHard=value=>value===null?pair(null,null):value&&typeof value==='object'?pair(value.amount===null?null:value.amount??0,value.graphicness===null?null:value.graphicness??0):asPair(value);
export const validPair=(value,{nullable=false}={})=>!!value&&typeof value==='object'&&!Array.isArray(value)&&Object.keys(value).length===2&&AXES.every(a=>nullable&&value[a]===null||Number.isInteger(value[a])&&value[a]>=0&&value[a]<=3);
export const scores=(changes={})=>Object.fromEntries(DIMENSIONS.map(([k])=>[k,asPair(changes[k])]));
export const maxPair=(a,b)=>{const read=v=>{const p=asPair(v);return validPair(p)&&(!(v&&typeof v==='object')||validPair(v))?p:pair(NaN,NaN);};a=read(a);b=read(b);return pair(Math.max(a.amount,b.amount),Math.max(a.graphicness,b.graphicness));};
export const exceeds=(value,limit)=>{const v=asPair(value),l=asHard(limit);return AXES.some(a=>l[a]!==null&&v[a]>l[a]);};
export const scoreText=value=>{const p=asPair(value);return `amount ${p.amount} · graphicness ${p.graphicness}`;};
export const DIAL_HELP='Amount: 0 none · 1 trace or mention · 2 a real presence · 3 central or pervasive. Graphicness: 0 none · 1 mild or implied · 2 shown plainly · 3 graphic or explicit.';
