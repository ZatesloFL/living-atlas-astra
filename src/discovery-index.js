import {ROOMS,DIMENSIONS} from './data.js';
import {AXES} from './scores.js';
import {viewRoom,versionLabel} from './audience.js';
import {sourcedRoom} from './source-catalog.js';
import {sourceVisible,sourceStateMessage} from './source-media.js';
import {selectContent,blockAccess} from './content.js';
import {rating,doorPolicy} from './admission.js';
import {accessSettings,authorName,identityOf} from './identity.js';
import {permission,visibilityOf} from './permissions.js';
import {standingState,targetRef,readingsFor,declarationSnapshot} from './standing-records.js';
import {deriveStanding,readingSummary,FACETS} from './standing-facets.js';
import {standingLensPolicy} from './standing-policy.js';
import {CURATORS,TRAILS,BOARD_CARDS,CLUBS} from './community-data.js';
import {layerAccess} from './layers.js';
import {discoveryState} from './discovery-state.js';
import {SORTS,discoveryGate,discoveryRoutes,curatorsFor,visiblePeople,eventsFor} from './discovery-policy.js';

const fold = value => String(value??'').normalize('NFKC').toLocaleLowerCase();
const words = value => fold(value).match(/[\p{L}\p{N}]+/gu)??[];
const validTime = value => typeof value==='string'&&Number.isFinite(Date.parse(value))?Date.parse(value):null;
const publicName = author => author?authorName(author):'Owner not supplied';
const pairRanges = ranges => DIMENSIONS.flatMap(([key,label])=>AXES.filter(axis=>ranges?.[key]?.[axis]).map(axis=>({key,label,axis,...ranges[key][axis]})));

// Returned values are an ephemeral projection of the current catalog and receipts.
// Neither query nor preview mutates the catalog, grants, profile or visiting history.
function recordMetadata(node,room,lens,standing,ref=targetRef(room,node===room?null:node)) {
 const subject={placeId:ref.placeId,...(ref.thingId?{thingId:ref.thingId}:{})};
 const references={
  declarationRef:node.standing?.declarationRef??null,
  measurementRecordsRef:node.standing?.measurementRecordsRef??{kind:'atlas-measurements-v1',subject},
  declarationRecordReadingRef:node.standing?.declarationRecordReadingRef??{kind:'atlas-declaration-reading-v1',subject}
 };
 const state=standingState(lens),publishedOnly=visibilityOf(room,lens)==='public';
 const reading=standing?standing.resolveMeasurements(references.measurementRecordsRef,lens):readingsFor(state,ref,{publishedOnly});
 const record=standing?standing.resolveReading(references.declarationRecordReadingRef,lens):deriveStanding(state,{target:ref});
 const declared=declarationSnapshot(state,ref,node,room,{publishedOnly});
 return {ref,references,declaration:declared.scores,declarationSource:declared.source,versionLabel:versionLabel(room,lens),
  readings:{declared:declared.scores,steward:reading.steward,audience:reading.audienceReading},
  facets:readingSummary(record)};
}
function gapsFor(node,room,lens) {
 const a=accessSettings(lens,room),gaps=[];
 for(const [key,label] of DIMENSIONS)for(const axis of AXES){const value=rating(node,key,node===room?null:room,lens)[axis];if(value>a.limits[key][axis])gaps.push(`${label} ${axis}: ${value}, your limit ${a.limits[key][axis]}`);}
 const record=standingLensPolicy(room,lens);if(record.warning)gaps.push(record.warning);
 return gaps;
}
function terms(room,lens) {
 const policy=doorPolicy(room,lens);
 return {placeId:room.id,title:room.title,mode:policy.mode,description:policy.description,minimum:policy.minimum,
  ageRule:policy.ageRule,ageDescription:policy.age.description,standingRules:policy.standing.rules,price:policy.price,
  priceState:policy.price===null?'No price declared':'Declared price; settlement is not connected'};
}
function ownerOf(room) {
 const author=room.author,anonymous=author&&identityOf(author).display==='anonymous'&&!author.isAgent;
 return {id:anonymous?null:room.ownerId??null,name:publicName(author),presentation:anonymous?'anonymous':identityOf(author??{}).display};
}
function baseEntry(key,lens,{paths,standing}) {
 const gate=discoveryGate(key,lens);if(!gate)return null;
 const path=paths.get(key);if(!path)return null;
 const room=sourcedRoom(viewRoom(ROOMS[key],lens),lens),owner=ownerOf(room);
 const routeRooms=[...new Set([...path.map(e=>e.to),key])];
 const softGaps=[...new Set(routeRooms.flatMap(id=>gapsFor(viewRoom(ROOMS[id],lens),viewRoom(ROOMS[id],lens),lens)))];
 return {id:'place:'+room.id,type:'room',target:key,room:key,title:room.title,summary:room.substance?.summary??'',
  node:room,view:room,owner,gate,distance:path.length,softGaps,doorTerms:routeRooms.map(id=>terms(viewRoom(ROOMS[id],lens),lens)),
  publishedAt:validTime(room.publishedAt),vouches:Number.isInteger(room.vouches)&&room.vouches>=0?room.vouches:null,
  sourceBadge:room.sourceBadge??null,...recordMetadata(room,room,lens,standing)};
}
function communityEntry(type,node,places,lens) {
 const keys=type==='trail'?node.stops.map(stop=>stop.room):[node.room],targets=keys.map(key=>places.get(key));
 if(targets.some(target=>!target))return null;
 const first=targets[0],room=first.view,gate=blockAccess(node,room,lens);if(gate.hidden||gate.withheld)return null;
 // Trails/events are authored catalog data. Their own readings are unmeasured until a subject is published through the registrar.
 return {...first,id:type+':'+node.id,type,target:node.id,title:node.title,summary:node.intro,node,view:room,community:true,
  ref:null,references:null,declaration:node.content,declarationSource:'authored community catalog',versionLabel:'',
  readings:{declared:node.content,steward:null,audience:null},facets:Object.fromEntries(Object.keys(FACETS).map(key=>[key,'unmeasured'])),
  curator:node.curator,curatorRecord:CURATORS.find(c=>c.id===node.curator),owner:{id:null,name:'Owner not supplied',presentation:'pseudonym'},publishedAt:null,vouches:null,sourceBadge:node.sourceBadge??null,
  softGaps:[...new Set([...targets.flatMap(t=>t.softGaps),...gapsFor(node,room,lens)])],
  doorTerms:[...new Map(targets.flatMap(t=>t.doorTerms).map(t=>[t.placeId,t])).values()]};
}
export function catalogIndex(lens,{from='square',standing,now=Date.now()}={}) {
 const entries=[],places=new Map(),paths=discoveryRoutes(from,lens);
 for(const key of Object.keys(ROOMS)){
  if(visibilityOf(ROOMS[key],lens)!=='public')continue;
  const entry=baseEntry(key,lens,{paths,standing});if(!entry)continue;places.set(key,entry);entries.push(entry);
  for(const block of selectContent(entry.view,lens).blocks){
   if(block.filtered||!sourceVisible(block,entry.view,lens))continue;
   entries.push({...entry,...recordMetadata(block,entry.view,lens,standing),id:'thing:'+entry.view.id+':'+(entry.view.version?.id??'original')+':'+block.id,
    type:'thing',target:block.id,node:block,title:block.title??block.label??(block.source&&typeof block.body==='string'?block.body:`${entry.title} · ${block.id.replace(/[-_]/g,' ')}`),summary:'',sourceState:sourceStateMessage(block),
    // The card contains metadata only. A soft preview never discloses the Thing body.
    publishedAt:validTime(block.publishedAt),vouches:Number.isInteger(block.vouches)&&block.vouches>=0?block.vouches:null,
    softGaps:[...new Set([...entry.softGaps,...gapsFor(block,entry.view,lens)])],sourceBadge:block.sourceBadge??entry.sourceBadge,
    doorTerms:[...entry.doorTerms,...(block.admission?[terms({...block,title:block.title??block.id},lens)]:[])]});
  }
 }
 for(const trail of TRAILS){const entry=communityEntry('trail',trail,places,lens);if(entry)entries.push(entry);}
 for(const event of eventsFor(lens.access,now).filter(e=>e.state!=='Ended')){const entry=communityEntry('event',event,places,lens);if(entry)entries.push(entry);}
 for(const card of BOARD_CARDS.filter(c=>['layer','person'].includes(c.type))){
  const node=card.type==='layer'?ROOMS[card.room]?.layers?.find(l=>l.id===card.target):visiblePeople(lens,{located:true}).find(p=>p.id===card.target);
  const room=card.room??node?.room,entry=places.get(room);
  if(!entry||!node||card.type==='layer'&&!layerAccess(entry.view,node,lens).visible)continue;
  const metadata=card.type==='layer'?{ref:null,references:null,versionLabel:'',declaration:node.content,readings:{declared:node.content,steward:null,audience:null},facets:Object.fromEntries(Object.keys(FACETS).map(key=>[key,'unmeasured'])),metadataFrom:'Layer declaration · layer readings unmeasured',softGaps:[...new Set([...entry.softGaps,...gapsFor(node,entry.view,lens)])]}:
   {metadataFrom:'Venue declaration and readings · facets refer to the presented person',facets:standing?readingSummary(standing.actorRecord(node.id,lens,{place:room,...(node.author.isAgent?{helperId:node.id}:{})})):Object.fromEntries(Object.keys(FACETS).map(key=>[key,null]))};
  entries.push({...entry,...metadata,id:card.type+':'+card.target,type:card.type,target:card.target,title:card.title,node});
 }
 return entries;
}
function carried(entry,lens) {
 const allowed=curatorsFor(lens);
 const carriers=BOARD_CARDS.filter(card=>card.type===entry.type&&card.target===entry.target).flatMap(card=>{
  const curator=allowed.find(c=>c.id===card.curator);return curator?[{...card,curatorRecord:curator}]:[];
 });
 const curator=allowed.find(c=>c.id===entry.curator);
 if(curator&&!carriers.some(c=>c.curator===curator.id))carriers.push({id:'curated:'+entry.id,type:entry.type,target:entry.target,title:entry.title,curator:curator.id,curatorRecord:curator,rule:`Curator credited in this authored ${entry.type} record`});
 return carriers;
}
export function queryIndex(lens,query={},options={}) {
 const prefs=discoveryState(lens.discovery),sort=Object.hasOwn(SORTS,query.sort)?query.sort:prefs.sort;
 const tokens=words(query.words),ranges=pairRanges(query.ranges),conditions=Object.entries(query.facets??{}),club=CLUBS.find(c=>c.id===query.board);
 if(ranges.some(r=>[r.min??0,r.max??3].some(n=>!Number.isInteger(n)||n<0||n>3)||(r.min??0)>(r.max??3))||conditions.some(([key,value])=>!Object.hasOwn(FACETS,key)||!['held','gap','contested','unmeasured'].includes(value)))throw new Error('Choose valid dial ranges and record conditions.');
 let results=[];
 for(const entry of catalogIndex(lens,options)){
  const carriers=carried(entry,lens),selected=carriers.filter(c=>prefs.curators.includes(c.curator)&&(!club||c.curator===club.curator));
  const matching=query.curator?carriers.filter(c=>c.curator===query.curator):query.board?selected:carriers;
  if((query.board||query.curator)&&!matching.length)continue;
  const searchFields={title:entry.title,summary:entry.summary,owner:entry.owner.name,curator:matching.map(c=>c.curatorRecord.name).join(' ')};
  const matches=tokens.map(term=>({term,fields:Object.entries(searchFields).filter(([,value])=>fold(value).includes(term)).map(([key])=>key)}));
  if(matches.some(match=>!match.fields.length)||ranges.some(({key,axis,min=0,max=3})=>entry.declaration[key][axis]<min||entry.declaration[key][axis]>max)||conditions.some(([key,value])=>entry.facets[key]!==value))continue;
  if(sort==='followed'&&!prefs.followed.includes(entry.target)&&!prefs.followed.includes(entry.owner.id)&&!matching.some(c=>prefs.followed.includes(c.curator)))continue;
  const card=query.board?matching[0]:null;
  const reasons=[...matching.map(c=>`${c.curatorRecord.name} selected this: ${c.rule}. ${prefs.curators.includes(c.curator)?'You chose this curator.':'Published on this curator’s board.'}`),
   ...matches.map(m=>`“${m.term}” matches ${m.fields.join(', ')}.`),
   ...ranges.map(r=>`Declared ${r.label.toLowerCase()} ${r.axis} ${entry.declaration[r.key][r.axis]} matches ${r.min??0}–${r.max??3}.`),
   ...conditions.map(([key,value])=>`${FACETS[key]}: ${value}.`),
   ...(entry.softGaps.length?['Shown with a soft gap; crossing still requires the ordinary door review.']:['Current crossing checks permit this result.']),
   `Order: ${SORTS[sort]}.`];
  const curated=(lens.access?.staffState?.proposals??[]).find(p=>p.status==='approved'&&Date.parse(p.publishedUntil)>Date.now()&&p.proposal.kind==='curation'&&matching.some(c=>p.proposal.cards.includes(c.id)));
  results.push({...entry,...(card?{id:card.id,title:card.title,curator:card.curator,curatorRecord:card.curatorRecord,vouches:card.vouches??null,sampleVouches:Number.isInteger(card.vouches),sampleAge:card.age}:{}),
   indexId:entry.id,carriers:matching,reasons,why:reasons.join(' '),curationReceipt:curated?`Helper curation approved by a person · ${curated.model}`:null,
   orderPosition:Math.min(...matching.map(c=>{const index=BOARD_CARDS.findIndex(b=>b.id===c.id);return index<0?Infinity:index;}),Infinity)});
 }
 const compare=(a,b)=>sort==='newest'?(b.publishedAt??-Infinity)-(a.publishedAt??-Infinity)||((a.sampleAge??Infinity)-(b.sampleAge??Infinity)):
  sort==='vouched'?(b.vouches??-1)-(a.vouches??-1):sort==='nearest'?a.distance-b.distance:a.orderPosition-b.orderPosition;
 results.sort((a,b)=>compare(a,b)||a.title.localeCompare(b.title)||a.id.localeCompare(b.id));
 return {results,sort,sortLabel:SORTS[sort],query};
}
