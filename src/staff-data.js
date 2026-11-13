export const ROLE_ACTIONS={Docent:['answer','tour'],Curator:['curate','connect'],Maintainer:['note'],Steward:['flag','contest']};
export const SEED_HELPERS=[
 {id:'docent-silver',name:'Docent Silver',role:'Docent',places:['square','guide','boycott','studio','workbench','governance','broadcast','lab','capitol','route-research','organizing-records','oral-archive','legacy-notes'],capabilities:['answer','tour']},
 {id:'curator-silver',name:'Docent Silver · Curator',role:'Curator',places:['square','boycott','capitol','studio','workbench','governance','broadcast','lab'],capabilities:['curate','connect']},
 {id:'maintainer-archive',name:'Archive Maintainer',role:'Maintainer',places:['boycott'],capabilities:['note']},
 {id:'steward-market',name:'Market Steward',role:'Steward',places:['market'],capabilities:['flag','contest']}
];
export const operator={name:'Nic',backing:'verified',simulated:true};
export function helperRecord({id,name,role,places,capabilities},expires){return {primitive:'Thing',kind:'helper',id,name,role,places,declaredCapabilities:capabilities,measuredCapabilities:[],identity:{display:'pseudonym',backing:'verified'},badge:'Agent',isAgent:true,operator:{...operator},expires,revokedAt:null};}
