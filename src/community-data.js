import {scores,pair} from './scores.js';
import {SEED_HELPERS,HELPER_NAMES,operator} from './staff-data.js';
// Authored local simulation. No live presence, recommendations or calendar service.
const author=(name,display='real',backing='verified',isAgent=false)=>({name,identity:{display,backing},isAgent,verifiedHuman:backing==='verified'});
export const CURATORS=[
 {id:'editors',name:'Living Atlas editors',kind:'People',author:author('Living Atlas editors'),description:'Public places selected for a first visit.'},
 {id:'history-stewards',name:'History Quarter stewards',kind:'Group',author:author('History Quarter stewards'),description:'History reading paths and source-checking methods.'},
 {id:'neighbors',name:'Tallahassee neighbors',kind:'Credential group',credential:'tallahassee-resident',author:author('Tallahassee neighbors'),description:'Visible to simulated verified Tallahassee residents.'},
 ...['docent-silver','docent-guide','curator-studio'].map(id=>{const a=SEED_HELPERS.find(a=>a.id===id);return {id,name:a.name,kind:'Agent',author:{id:a.id,...author(a.name,'pseudonym','verified',true),operator:{...operator}},description:'Local '+a.role+' at '+a.places[0]+'. Operator information is in the helper record.'};})
];
export const TRAILS=[
 {id:'civil-rights',content:scores({violence:pair(1,1),disturbing:pair(1,1),viewpoint:pair(1,1)}),title:'Civil rights in Tallahassee',curator:'history-stewards',agentCredit:'docent-silver',intro:'Six stops: the boycott, the Capitol, then four explicitly virtual research stations. These placeholders make no claim to be historical event sites.',stops:[
  {room:'boycott',intro:'Begin with the sample bus boycott exhibition. Read the source and media labels.'},
  {room:'capitol',intro:'Consider public institutions and public memory. No specific boycott event is claimed at this building.'},
  {room:'route-research',intro:'Placeholder: compare transport records. Research still to do.'},
  {room:'organizing-records',intro:'Placeholder: seek records of everyday organizing, with source attribution.'},
  {room:'oral-archive',intro:'Placeholder: ask whose voices are represented and whether permission covers their reuse.'},
  {room:'legacy-notes',intro:'Placeholder: record disagreements, missing sources and questions for later research.'}
 ]},
 {id:'inside-studio',content:scores({sensory:pair(1,1)}),title:'Inside Nic’s studio',curator:'curator-studio',intro:'Four stops through work, governance, broadcasting and the observation window.',stops:[
  {room:'workbench',intro:'Second Look: agent setups with a person in charge.'},{room:'governance',intro:'Read how permissions and receipts keep decisions accountable.'},{room:'broadcast',intro:'Visit the booth. Its nested listening room inherits the host rules.'},{room:'lab',intro:'Finish outside the lab window. This is a view-only stop; the trail never enters it.'}
 ]}
];
export const EVENTS=[
 {id:'sample-tour',title:'A walk through the exhibition',intro:'A sample guided walk through the boycott exhibits.',room:'boycott',curator:'docent-silver',repeatEvery:7*86400000,startsAfter:2*60000,duration:45*60000,content:scores({violence:pair(1,1),disturbing:pair(1,1),viewpoint:pair(1,1)})},
 {id:'sample-table',title:'An open table for ideas',intro:'A sample open table in the civic hall.',room:'civic',curator:'editors',repeatEvery:7*86400000,startsAfter:2*86400000,duration:3600000,content:scores()}
];
export const PEOPLE=[
 {id:'visitor-river',name:'River (sample)',author:author('River (sample)','pseudonym','none'),room:'square',privacy:'everyone',groups:[],offset:[-2,2]},
 {id:'visitor-editor',name:'Atlas editor (sample)',author:author('Atlas editor (sample)'),room:'boycott',privacy:'everyone',groups:[],offset:[-3,3]},
 {id:'visitor-neighbor',name:'Tallahassee neighbor (sample)',author:author('Tallahassee neighbor (sample)'),room:'square',privacy:'groups',groups:['tallahassee-resident'],offset:[2,3]},
 {id:'visitor-anon',name:'Anonymous reader (sample)',author:author('Anonymous reader (sample)','anonymous','none'),room:'capitol',privacy:'everyone',groups:[],offset:[-4,4]},
 {id:'visitor-private',name:'Quiet visitor (sample)',author:author('Quiet visitor (sample)','pseudonym','none'),room:'writing',privacy:'nobody',groups:['writing-circle'],offset:[1,2]},
 {id:'docent-guide',name:HELPER_NAMES.Docent.guide,author:{id:'docent-guide',...author(HELPER_NAMES.Docent.guide,'pseudonym','verified',true),operator:{...operator}},room:'guide',privacy:'everyone',groups:[],offset:[1,1]}
];
export const BOARD_CARDS=[
 {id:'board-boycott',type:'room',target:'boycott',curator:'editors',title:'Explore the 1956 exhibition',rule:'A public exhibition for a first visit',vouches:5,age:2},
 {id:'board-mara-boycott',type:'room',target:'boycott',curator:'docent-silver',title:'The boycott with '+HELPER_NAMES.Docent.boycott,rule:'The attached Docent’s own exhibition',vouches:1,age:2},
 {id:'board-civil',type:'trail',target:'civil-rights',curator:'history-stewards',title:'Civil rights in Tallahassee · 6 stops',rule:'A source-aware history trail',vouches:4,age:1},
 {id:'board-studio',type:'trail',target:'inside-studio',curator:'curator-studio',title:'Tour the studio with '+HELPER_NAMES.Curator.studio,rule:'An agent-curated introduction to the studio',vouches:3,age:3},
 {id:'board-event',type:'event',target:'sample-tour',curator:'editors',title:'A walk through the exhibition',rule:'An upcoming sample public event',vouches:2,age:0},
 {id:'board-layer',type:'layer',room:'boycott',target:'boycott-detail',curator:'history-stewards',title:'How to read a timeline',rule:'A layer with a source-comparison method',vouches:3,age:4},
 {id:'board-person',type:'person',target:'docent-guide',curator:'docent-guide',title:'Meet '+HELPER_NAMES.Docent.guide,rule:'The square’s guide, visibly badged as an agent',vouches:1,age:5},
 {id:'board-neighbors',type:'room',target:'civic',curator:'neighbors',title:'The neighborhood table',rule:'Your verified Tallahassee resident credential',vouches:2,age:1},
 {id:'board-night',type:'room',target:'night',curator:'editors',title:'After Dark',rule:'Your verified adult Lens permits this district',vouches:0,age:6}
];
export const CLUBS=[{id:'writing-circle',name:'Writing circle',hall:'civic',curator:'editors',description:'A sample made group with a public hall and a selected board.'}];
export function addCommunityRooms(rooms,edges,room,scores){
 rooms.square=room('square','Town Square','commons','Choose your own front door: curators, trails and people. Every recommendation explains why it is here.',{layout:{root:true,kind:'courtyard',scene:'square',slot:[0,0],approach:[0,6],landmark:'none',sign:false},presentation:{theme:'notebook',accent:'#367366',heroBlock:null}});
 for(const [id,title,model,slot,summary] of [
  ['noticeboard','Noticeboard','gallery-wall',[-5,-4],'Choose whose recommendations you see, and how they are ordered.'],
  ['events-board','Events board','gallery-wall',[5,-4],'Two local sample events. RSVP stays in your profile.'],
  ['trails-kiosk','Trails','desk',[-5,3],'A curated sequence of places, with an introduction at every stop.'],
  ['guide',HELPER_NAMES.Docent.guide+' · Docent','agent',[3,1],'Ask this Place’s Docent about the catalog or start a tour. Operator information is in the helper record.']]){
  rooms[id]=room('square/'+id,title,'commons',summary,{layout:{kind:'plinth',scene:'square',slot,approach:[slot[0],slot[1]+2],model,sign:[title.toUpperCase(),id==='guide'?'HELPER · OPERATOR RECORD':'TAP TO EXPLORE',[0,2.8,0]]},...(id==='guide'?{author:CURATORS.find(c=>c.id==='docent-guide').author}:{})});
  edges.push({id:'square-'+id,from:'square',to:id,type:'seamless',scene:'square',position:[slot[0],slot[1]+2],render:false,contextPriority:0,zone:{x:[slot[0]-1.5,slot[0]+1.5],z:[slot[1]-.5,slot[1]+2.5]}});
 }
 for(const [id,title,slot] of [['route-research','Transport records · placeholder',[-10,7]],['organizing-records','Organizing records · placeholder',[-10,2]],['oral-archive','Listening archive · placeholder',[10,2]],['legacy-notes','Legacy notes · placeholder',[-10,-12]]]){
  rooms[id]=room('tallahassee/'+id,title,'history','Virtual research station · sample placeholder, not an asserted historical site. Sources and interpretation remain to verify.',{layout:{kind:'plinth',scene:'history',slot,approach:[slot[0],slot[1]+1.8],model:'plinth',sign:[title,'VIRTUAL RESEARCH STATION',[0,2,0]]},geo:{lat:30.4383,lng:-84.2807,heading:0,elevation:60,status:'to verify',note:'District reference only. This fictional station has no physical historical location.'}});
  edges.push({id:'city-'+id,from:'tallahassee',to:id,type:'seamless',scene:'history',position:[slot[0],slot[1]+1.8],render:false,contextPriority:0,zone:{x:[slot[0]-1.3,slot[0]+1.3],z:[slot[1]-.4,slot[1]+2.2]}});
 }
 for(const [to,position,axis] of [['studio',[0,-9]],['tallahassee',[-9,-2],'x'],['commons',[9,-2],'x'],['night',[8,7],'x']])edges.push({id:'square-portal-'+to,from:'square',to,type:'door',scene:'square',position,axis,destination:rooms[to].layout.scene,portal:true,zone:axis==='x'?{x:[position[0]-.3,position[0]+.3],z:[position[1]-1.5,position[1]+1.5]}:{x:[-1.5,1.5],z:[-10,-8.8]}});
 edges.push({id:'studio-square',from:'studio',to:'square',type:'door',scene:'studio',position:[0,11],before:[0,9.3],destination:'square',portal:true});
 for(const [id,r] of Object.entries(rooms))if(!r.blocks&&r.visibility!=='private'){r.forms=['3d','card','page'];r.sources=[];r.layers=[];r.styleControl='open';r.layout={scale:1,facing:0,...r.layout};r.blocks=[{id:'lead',type:'text',importance:'core',body:r.substance.summary,reps:{text:r.substance.summary},sources:[]}];}
}
