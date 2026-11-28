// A readable projection of Mara's checked record, not historical evidence or a
// new grant. The server catalog uses the same seed; the client rechecks its live
// attachment and grant before and after every request.
export const DOCENT_GRANT_ID='helper-grant';
export function docentGrantEvidence(actor,grant,room){
 if(actor?.id!=='docent-silver'||!actor.places?.includes('boycott')||actor.revokedAt||grant?.scope!=='look'||grant.revokedAt||grant.denied)return null;
 const capabilities=actor.declaredCapabilities??actor.capabilities??[];
 const actions=[capabilities.includes('answer')?'answer questions':null,capabilities.includes('tour')?'propose tours':null].filter(Boolean);
 if(!actions.length)return null;
 const body=`${actor.name} may ${actions.join(' and ')} in this Place under a look grant. ${grant.expires?'This grant is leased':'This grant is standing'}, revocable, and does not allow changes to the Place. Travel still checks every door and your Lens.`;
 return {id:DOCENT_GRANT_ID,title:`${actor.name}’s helper grant`,type:'text',importance:'core',body,content:room.content,author:room.author,sources:[]};
}
