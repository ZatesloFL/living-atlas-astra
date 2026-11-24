import {ROOMS,EDGES} from './data.js';
import {CURATORS,TRAILS,PEOPLE,EVENTS} from './community-data.js';
import {permission,personId} from './permissions.js';
import {roomEntry,blockAccess} from './content.js';
import {viewRoom} from './audience.js';
import {planRoute,planRoutes} from './travel-plan.js';
import {identityOf} from './identity.js';
export const SORTS={curator:'Curator’s order',newest:'Newest',vouched:'Most vouched',nearest:'Nearest',followed:'From people I follow'};
export function memberOf(group,lens){const record=lens.access?.groups?.find(g=>g.id===group);return (!['tallahassee-resident','neighborhood'].includes(group)&&record?.kind!=='credential'||lens.identity?.backing==='verified')&&((lens.groups??[]).includes(group)||(record?.members??[]).includes(personId(lens)));}
export function discoveryGate(id,lens){const gate=roomEntry(id,lens,EDGES);return gate.state!=='hidden'&&gate.state!=='private'&&!gate.admission?.blocked&&gate.rights?.canLook?gate:null;}
export function discoveryRoute(from,to,lens){return planRoute(from,to,lens,{passable:(edge,gate)=>gate.state!=='private'&&!gate.admission?.blocked&&gate.rights?.canEnter});}
export function discoveryRoutes(from,lens){return planRoutes(from,lens,{passable:(edge,gate)=>gate.state!=='private'&&!gate.admission?.blocked&&gate.rights?.canEnter});}
export function reachable(id,lens,from='square'){if(!discoveryGate(id,lens))return false;return discoveryRoute(from,id,lens)!==null;}

export function curatorsFor(lens){return CURATORS.filter(c=>(!c.credential||memberOf(c.credential,lens)&&lens.identity?.backing==='verified')&&(c.author.isAgent||lens.show?.[identityOf(c.author).display]!==false));}
export function visiblePeople(lens,{located=false}={}){const local=(lens.access?.presence??[]).filter(p=>p.person!==personId(lens)&&Date.parse(p.expires??new Date(Date.parse(p.at)+5*60000).toISOString())>Date.now()).map(p=>({id:p.person,name:p.name??'Visitor',author:{name:p.name??'Visitor',identity:p.identity??{display:'anonymous',backing:'none'},isAgent:!!p.agent},room:Object.keys(ROOMS).find(id=>ROOMS[id].id===p.room),privacy:p.privacy??'nobody',groups:p.groups??[],offset:[1.5,2]}));return [...PEOPLE,...local].filter(p=>p.author.isAgent||lens.show?.[identityOf(p.author).display]!==false).map(p=>{const allowed=p.privacy==='everyone'||p.privacy==='groups'&&p.groups.some(g=>memberOf(g,lens));const room=allowed&&reachable(p.room,lens)?p.room:null;return {...p,room,locationVisible:!!room};}).filter(p=>!located||p.room);}
const communityAllowed=(node,key,lens)=>{const room=ROOMS[key];if(!room)return false;const gate=blockAccess(node,viewRoom(room,lens),lens);return !gate.hidden&&!gate.withheld;};
export function availableTrail(trail,lens){return communityAllowed(trail,trail.stops[0]?.room,lens)&&trail.stops.every(s=>reachable(s.room,lens));}
export function availableEvent(event,lens){return event.state!=='Ended'&&communityAllowed(event,event.room,lens)&&reachable(event.room,lens);}
export function eventsFor(access,now=Date.now()){const epoch=access?.community?.epoch??now;return EVENTS.map(event=>{const start=epoch+event.startsAfter,end=start+event.duration;return {...event,start,end,state:now<start?'Upcoming':now<=end?'Happening now':'Ended',sample:true};});}
