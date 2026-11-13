import {ROOMS,EDGES} from './data.js';
import {CURATORS,TRAILS,PEOPLE,BOARD_CARDS,CLUBS} from './community-data.js';
import {discoveryState} from './discovery-state.js';
import {permission,personId} from './permissions.js';
import {roomEntry} from './content.js';
import {planRoute} from './travel-plan.js';
import {layerAccess} from './layers.js';
import {identityOf} from './identity.js';
export const SORTS={curator:'Curator’s order',newest:'Newest',vouched:'Most vouched',nearest:'Nearest',followed:'From people I follow'};
export function memberOf(group,lens){const record=lens.access?.groups?.find(g=>g.id===group);return (!['tallahassee-resident','neighborhood'].includes(group)&&record?.kind!=='credential'||lens.identity?.backing==='verified')&&((lens.groups??[]).includes(group)||(record?.members??[]).includes(personId(lens)));}
export function reachable(id,lens,from='square'){if(!ROOMS[id]||!permission(ROOMS[id],lens).canEnter||roomEntry(id,lens,EDGES).state==='hidden')return false;const route=planRoute(from,id,lens);return route!==null&&route.every(e=>permission(ROOMS[e.to],lens).canEnter);}
export function curatorsFor(lens){return CURATORS.filter(c=>(!c.credential||memberOf(c.credential,lens)&&lens.identity?.backing==='verified')&&(c.author.isAgent||lens.show?.[identityOf(c.author).display]!==false));}
export function visiblePeople(lens,{located=false}={}){const local=(lens.access?.presence??[]).filter(p=>p.person!==personId(lens)&&Date.parse(p.expires??new Date(Date.parse(p.at)+5*60000).toISOString())>Date.now()).map(p=>({id:p.person,name:p.name??'Visitor',author:{name:p.name??'Visitor',identity:p.identity??{display:'anonymous',backing:'none'},isAgent:!!p.agent},room:Object.keys(ROOMS).find(id=>ROOMS[id].id===p.room),privacy:p.privacy??'nobody',groups:p.groups??[],offset:[1.5,2]}));return [...PEOPLE,...local].filter(p=>p.author.isAgent||lens.show?.[identityOf(p.author).display]!==false).map(p=>{const allowed=p.privacy==='everyone'||p.privacy==='groups'&&p.groups.some(g=>memberOf(g,lens));const room=allowed&&reachable(p.room,lens)?p.room:null;return {...p,room,locationVisible:!!room};}).filter(p=>!located||p.room);}
export function availableTrail(trail,lens){return trail.stops.every(s=>reachable(s.room,lens));}
export function eventsFor(access,now=Date.now()){const epoch=access?.community?.epoch??now;return [{id:'sample-tour',title:'A walk through the exhibition',room:'boycott',curator:'docent-silver',start:epoch+2*60000,end:epoch+47*60000},{id:'sample-table',title:'An open table for ideas',room:'civic',curator:'editors',start:epoch+2*86400000,end:epoch+2*86400000+3600000}].map(e=>({...e,state:now<e.start?'Upcoming':now<=e.end?'Happening now':'Ended',sample:true}));}
export function boardCards(lens,{from='square',club=null}={}){
 const prefs=discoveryState(lens.discovery),curators=curatorsFor(lens).filter(c=>prefs.curators.includes(c.id)),people=visiblePeople(lens),events=eventsFor(lens.access);let cards=[];
 for(const card of BOARD_CARDS){const curator=curators.find(c=>c.id===card.curator);if(!curator||club&&card.curator!==club.curator)continue;let room,allowed=false;
  if(card.type==='room'){room=card.target;allowed=reachable(room,lens);}
  if(card.type==='trail'){const trail=TRAILS.find(t=>t.id===card.target);room=trail?.stops[0].room;allowed=trail&&availableTrail(trail,lens);}
  if(card.type==='event'){const event=events.find(e=>e.id===card.target);room=event?.room;allowed=event&&reachable(room,lens)&&event.state!=='Ended';}
  if(card.type==='layer'){room=card.room;const layer=ROOMS[room]?.layers.find(l=>l.id===card.target);allowed=reachable(room,lens)&&layer&&layerAccess(ROOMS[room],layer,lens).visible;}
  if(card.type==='person'){const person=people.find(p=>p.id===card.target);room=person?.room;allowed=!!person&&!!room;}
  const curated=(lens.access?.staffState?.proposals??[]).find(p=>p.status==='approved'&&Date.parse(p.publishedUntil)>Date.now()&&p.proposal.kind==='curation'&&p.proposal.cards.includes(card.id));if(allowed)cards.push({...card,room,curationReceipt:curated?`Helper curation approved by a person · ${curated.model}`:null,curatorRecord:curator,distance:planRoute(from,room,lens)?.length??999,why:`${curator.name} selected this: ${card.rule.toLowerCase()}. You chose this curator. Your current Lens and grants permit the destination. Order: ${SORTS[prefs.sort]}.`});
 }
 if(prefs.sort==='followed')cards=cards.filter(c=>prefs.followed.includes(c.curator)||prefs.followed.includes(c.target));
 return cards.sort(prefs.sort==='newest'?(a,b)=>a.age-b.age:prefs.sort==='vouched'?(a,b)=>b.vouches-a.vouches:prefs.sort==='nearest'?(a,b)=>a.distance-b.distance:()=>0);
}
export function allowedClubs(lens){return CLUBS.filter(c=>reachable(c.hall,lens));}
export class Discovery {
 constructor(profiles,access,api={}){if(!access.communitySaved){access.communitySaved=true;access.ready.then(valid=>{if(valid)access.persist();});}this.profiles=profiles;this.access=access;this.api=api;this.notified=new Set();}
 lens(){return this.api.lens?.()??this.access.lens(this.profiles.current());}
 prefs(){return discoveryState(this.lens().discovery);}
 save(changes){const lens=this.lens();if(lens.preview)throw new Error('Exit Preview as before changing discovery.');lens.discovery=discoveryState({...lens.discovery,...changes});this.profiles.preferences(lens);if(changes.privacy){for(const p of this.access.data.presence)if(p.person===personId(lens))p.privacy=changes.privacy;this.access.persist();}this.api.changed?.(lens);return lens.discovery;}
 follow(id){const p=this.prefs();this.save({followed:p.followed.includes(id)?p.followed.filter(x=>x!==id):[...p.followed,id]});}
 startTrail(id){const t=TRAILS.find(t=>t.id===id);if(!t||!availableTrail(t,this.lens()))throw new Error('This trail is outside your current Lens or access.');const previous=this.prefs().trail,index=previous?.id===id&&previous.index<t.stops.length?previous.index:0;this.save({trail:{id,index,done:previous?.id===id?previous.done:[],active:true}});this.api.waypoint?.(t.stops[index].room);return t;}
 stopTrail(){const t=this.prefs().trail;if(t)this.save({trail:{...t,active:false}});this.api.clearWaypoint?.();}
 progress({room,scene,position,reading=false}){if(this.lens().preview)return false;const progress=this.prefs().trail,t=TRAILS.find(t=>t.id===progress?.id),stop=t?.stops[progress?.index];if(!progress?.active||!stop||!reachable(stop.room,this.lens()))return false;const target=ROOMS[stop.room],p=target.layout.approach;const arrived=reading?room===stop.room:scene===target.layout.scene&&position&&Math.hypot(position.x-p[0],position.z-p[1])<2.4;if(!arrived)return false;
  const index=progress.index+1;this.save({trail:{...progress,index,done:[...new Set([...progress.done,stop.room])],active:index<t.stops.length}});if(index<t.stops.length)this.api.waypoint?.(t.stops[index].room);else this.api.clearWaypoint?.();this.api.message?.(index<t.stops.length?`Trail ${index}/${t.stops.length} · next: ${ROOMS[t.stops[index].room].title}`:'Trail complete · progress saved to this profile');return true;
 }
 rsvp(id){const p=this.prefs();if(!eventsFor(this.access.data).some(e=>e.id===id&&reachable(e.room,this.lens())))throw new Error('This event is not available.');this.save({rsvps:p.rsvps.includes(id)?p.rsvps.filter(x=>x!==id):[...p.rsvps,id]});}
 reminders(now=Date.now()){const p=this.prefs();return eventsFor(this.access.data,now).filter(e=>p.rsvps.includes(e.id)&&!p.dismissed.includes(e.id)&&now>=e.start-10*60000&&now<=e.end&&reachable(e.room,this.lens()));}
 remember(place){if(this.lens().preview)return;const p=this.prefs();this.save({lastPlace:place});}
}
