import {ROOMS} from './data.js';
import {LEGACY_SEED_HELPERS,HELPER_NAMES,seedHelperId} from './staff-data.js';

// Identity migration, not a new approval. Rebind the existing grant recipient
// per Place, retaining its ID and all authority/status fields. Append the
// mapping to the ledger; never rewrite historical receipts or provenance.
export async function migrateHelperIdentities(store){
 const data=store.data.staffState;if(data.placeIdentities===1)return;
 const helpers=[],mappings=[];
 for(const old of data.helpers){
  const seed=LEGACY_SEED_HELPERS.find(s=>s.id===old.id);
  const group=old.coverageGroup??(seed?'seed-'+seed.role.toLowerCase():'legacy-'+old.id);
  for(const place of [...new Set(old.places)]){
   const known=seed?.places.includes(place);
   const id=known?seedHelperId(seed.role,place):old.places.length===1?old.id:old.id+'--'+place;
   const name=known?HELPER_NAMES[seed.role][place]:`${/\bSilver\b/i.test(old.name)?old.role:old.name} · ${ROOMS[place]?.title??place}`;
   const actor={...structuredClone(old),id,name,places:[place],coverageGroup:group};helpers.push(actor);
   const grants=store.data.grants.filter(g=>g.to?.person===old.id&&g.room===ROOMS[place]?.id);
   for(const grant of grants)grant.to={...grant.to,person:id};
   const proposals=data.proposals.filter(p=>p.agentId===old.id&&p.proposal.room===place);
   for(const p of proposals){p.identityOrigin??={agentId:p.agentId,agentName:p.agentName};p.agentId=id;p.agentName=name;}
   mappings.push({place,from:old.id,to:id,name,grants:grants.map(g=>g.id),proposals:proposals.map(p=>p.id)});
  }
 }
 for(const mapping of mappings)await store.record(mapping.place,{profileId:'helper-identity-upgrade'},'helper_identity_reissued',mapping);
 data.helpers=helpers;data.placeIdentities=1;
}
