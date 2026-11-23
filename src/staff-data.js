export const ROLE_ACTIONS={Docent:['answer','tour'],Curator:['curate','connect'],Maintainer:['note'],Steward:['flag','contest']};
// Old identities are migration policy only, never display records.
export const LEGACY_SEED_HELPERS=[
 {id:'docent-silver',name:'Docent Silver',role:'Docent',places:['square','guide','boycott','studio','workbench','governance','broadcast','lab','capitol','route-research','organizing-records','oral-archive','legacy-notes'],capabilities:['answer','tour']},
 {id:'curator-silver',name:'Docent Silver · Curator',role:'Curator',places:['square','boycott','capitol','studio','workbench','governance','broadcast','lab'],capabilities:['curate','connect']},
 {id:'maintainer-archive',name:'Archive Maintainer',role:'Maintainer',places:['boycott'],capabilities:['note']},
 {id:'steward-market',name:'Market Steward',role:'Steward',places:['market'],capabilities:['flag','contest']}
];
export const HELPER_NAMES={
 Docent:{square:'Rowan',guide:'Wren',boycott:'Mara',studio:'Ellis',workbench:'Kit',governance:'Ada',broadcast:'Remy',lab:'Vega',capitol:'Iris','route-research':'Theo','organizing-records':'June','oral-archive':'Nell','legacy-notes':'Sage'},
 Curator:{square:'Piper',boycott:'Cora',capitol:'Leon',studio:'Milo',workbench:'Finch',governance:'Aster',broadcast:'Lark',lab:'Orion'},
 Maintainer:{boycott:'Quinn'},Steward:{market:'Tess'}
};
// Preserve the boycott's proxy/receipt contract; IDs are not display names.
export const seedHelperId=(role,place)=>place==='boycott'&&['Docent','Curator'].includes(role)?role.toLowerCase()+'-silver':role==='Maintainer'?'maintainer-archive':role==='Steward'?'steward-market':role.toLowerCase()+'-'+place;
export const SEED_HELPERS=LEGACY_SEED_HELPERS.flatMap(a=>a.places.map(place=>({...a,id:seedHelperId(a.role,place),name:HELPER_NAMES[a.role][place],places:[place],coverageGroup:'seed-'+a.role.toLowerCase()})));
export const operator={name:'Nic',backing:'verified',backing_ref:null,simulated:true};
export function helperRecord({id,name,role,places,capabilities,coverageGroup},expires){return {primitive:'Thing',backing_ref:null,kind:'helper',id,name,role,places,...(coverageGroup?{coverageGroup}:{}),declaredCapabilities:capabilities,measuredCapabilities:[],identity:{display:'pseudonym',backing:'verified'},badge:'Agent',isAgent:true,operator:{...operator},expires,revokedAt:null};}

export const helperScope=actor=>{const actions=actor.declaredCapabilities??actor.capabilities??[];return actions.length&&actions.every(a=>['answer','tour'].includes(a))?'look':'suggest';};
