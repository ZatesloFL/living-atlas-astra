import {Builder} from './builder.js';
import {exhibitSpace} from './interior-kit.js';
import {ROOMS,EDGES} from './data.js';
import {TRAILS,CLUBS} from './community-data.js';
import {discoveryState} from './discovery-state.js';
import {permission,personId} from './permissions.js';
import {roomEntry} from './content.js';
export {SORTS,memberOf,reachable,curatorsFor,visiblePeople,availableTrail,eventsFor} from './discovery-policy.js';
import {reachable,curatorsFor,visiblePeople,availableTrail,availableEvent,eventsFor} from './discovery-policy.js';
import {queryIndex} from './discovery-index.js';
export function boardCards(lens,{from='square',club=null,standing}={}){return queryIndex(lens,{board:club?.id??'noticeboard'},{from,standing}).results;}
export function allowedClubs(lens){return CLUBS.filter(c=>reachable(c.hall,lens));}
export class Discovery {
 constructor(profiles,access,api={}){if(!access.communitySaved){access.communitySaved=true;access.ready.then(valid=>{if(valid)access.persist();});}this.profiles=profiles;this.access=access;this.api=api;this.builder=api.builder??new Builder();this.notified=new Set();}
 lens(){return this.api.lens?.()??this.access.lens(this.profiles.current());}
 query(query={},options={}){return queryIndex(this.lens(),query,{standing:this.access.standing,...options});}
 preview(id,query={},options={}){const card=this.query(query,options).results.find(c=>c.id===id||c.indexId===id);if(!card)throw new Error('This result no longer fits your current Lens or door terms.');return card;}
 canEndorse(card){if(!['room','thing'].includes(card.type))return false;try{this.builder.vouchTarget(card.room,this.lens(),card.type==='thing'?card.target:null,this.builder.data.receipts);return true;}catch{return false;}}
 async endorse(card,query={},options={}){
  const current=this.preview(card.id,query,options);
  if(current.node.recordVersionId!==card.node.recordVersionId)throw new Error('This version changed. Preview it again before endorsing.');
  try{return await this.builder.vouch(card.room,this.lens(),{thingId:card.type==='thing'?card.target:null});}
  catch(error){throw new Error(error.message.replace(/\bvouch\b/gi,'endorse'));}
 }
 prefs(){return discoveryState(this.lens().discovery);}
 save(changes){const lens=this.lens();if(lens.preview)throw new Error('Exit Preview as before changing discovery.');lens.discovery=discoveryState({...lens.discovery,...changes,...(Object.hasOwn(changes,'curators')?{curatorChoice:'holder'}:{})});this.profiles.preferences(lens);if(changes.privacy){for(const p of this.access.data.presence)if(p.person===personId(lens))p.privacy=changes.privacy;this.access.persist();}this.api.changed?.(lens);return lens.discovery;}
 follow(id){const p=this.prefs();if(!p.followed.includes(id)&&!curatorsFor(this.lens()).some(c=>c.id===id)&&!visiblePeople(this.lens()).some(person=>person.id===id&&person.followable))throw new Error('This presentation cannot be followed in your current view.');this.save({followed:p.followed.includes(id)?p.followed.filter(x=>x!==id):[...p.followed,id]});}
 join(id){const person=visiblePeople(this.lens(),{located:true}).find(p=>p.id===id);if(!person)throw new Error('This location is no longer shared with your current view.');return person.room;}
 startTrail(id){const t=TRAILS.find(t=>t.id===id);if(!t||!availableTrail(t,this.lens()))throw new Error('This trail is outside your current Lens or access.');const previous=this.prefs().trail,index=previous?.id===id&&previous.index<t.stops.length?previous.index:0;this.save({trail:{id,index,done:index?previous.done:[],seen:index?previous.seen:[],skipped:index?previous.skipped:[],active:true,finishedAt:null}});this.api.waypoint?.(t.stops[index].room);return t;}
 stopTrail(){const t=this.prefs().trail;if(t)this.save({trail:{...t,active:false}});this.api.clearWaypoint?.();}
 progress({room,scene,position,reading=false}){if(this.lens().preview)return false;const progress=this.prefs().trail,t=TRAILS.find(t=>t.id===progress?.id),stop=t?.stops[progress?.index];if(!progress?.active||!stop||!availableTrail(t,this.lens()))return false;const target=ROOMS[stop.room],layout=exhibitSpace(target),p=layout.approach;const arrived=reading?room===stop.room:scene===layout.scene&&position&&Math.hypot(position.x-p[0],position.z-p[1])<2.4;if(!arrived)return false;
  this.advanceTrail('visited');return true;
 }
 advanceTrail(choice){
  if(!['visited','seen','skipped'].includes(choice)||this.lens().preview)throw new Error('Choose a trail action in your own profile.');
  const progress=this.prefs().trail,t=TRAILS.find(t=>t.id===progress?.id),stop=t?.stops[progress?.index];if(!progress?.active||!stop)return false;
  const field=choice==='visited'?'done':choice,index=progress.index+1,finished=index===t.stops.length;
  const next={...progress,index,[field]:[...new Set([...(progress[field]??[]),stop.room])],active:!finished,finishedAt:finished?new Date().toISOString():null};this.save({trail:next});
  if(!finished)this.api.waypoint?.(t.stops[index].room);
  else {this.api.clearWaypoint?.();if(next.done.length===t.stops.length)this.access.standing.completeTour(t,this.lens()).catch(error=>this.api.message?.(error.message));this.api.finished?.(t,next);}
  this.api.message?.(finished?'Trail finished · open your ending card':`Stop ${choice==='visited'?'visited':choice==='seen'?'marked seen':'skipped'} · next: ${ROOMS[t.stops[index].room].title}`);return true;
 }

 rsvp(id){const p=this.prefs();if(!eventsFor(this.access.data).some(e=>e.id===id&&availableEvent(e,this.lens())))throw new Error('This event is not available.');this.save({rsvps:p.rsvps.includes(id)?p.rsvps.filter(x=>x!==id):[...p.rsvps,id]});}
 reminders(now=Date.now()){const p=this.prefs();return eventsFor(this.access.data,now).filter(e=>p.rsvps.includes(e.id)&&!p.dismissed.includes(e.id)&&now>=e.start&&now<=e.end&&availableEvent(e,this.lens()));}
 remember(place){if(this.lens().preview)return;const p=this.prefs();this.save({lastPlace:place});}
}
