export const DIMENSIONS = [
  ['violence', 'Violence'], ['sexual', 'Sexual content'], ['language', 'Language'],
  ['disturbing', 'Disturbing themes'], ['viewpoint', 'Viewpoint'], ['sensory', 'Sensory'],
];
export const scores = (changes = {}) => Object.assign(Object.fromEntries(DIMENSIONS.map(([k]) => [k, 0])), changes);
export const DISTRICTS = {
  makers: { name: 'Makers Row', color: '#f2a541', max: scores({ violence:1, sexual:1, language:1, disturbing:1, viewpoint:1, sensory:2 }) },
  commons: { name: 'Commons', color: '#7bd389', max: scores({ violence:1, sexual:1, language:1, disturbing:1, viewpoint:1, sensory:1 }) },
  history: { name: 'History Quarter', color: '#7aa7ff', max: scores({ violence:1, sexual:1, language:1, disturbing:2, viewpoint:2, sensory:1 }) },
  night: { name: 'After Dark', color: '#e58be8', max: scores({ violence:3, sexual:3, language:3, disturbing:3, viewpoint:3, sensory:3 }) },
};
const nic = { name: 'Nic', tier: 'verified', verifiedHuman: true, isAgent: false };
const named = name => ({ name, tier: 'named', verifiedHuman: false, isAgent: false });
const anonymous = { name:'Anonymous contributor', tier:'anonymous', verifiedHuman:false, isAgent:false };
const agent = { name:'Silver', tier:'agent', verifiedHuman:true, isAgent:true };
function room(id, title, district, summary, extra = {}) {
  return { id, address:`tlh/${id}`, title, district, author:nic,
    substance:{summary, body:summary, claims:[]}, style:{preset:'Studio', palette:'dusk', shape:'pavilion', scale:1},
    forms:['3d','card'], content:scores(), measured:scores(), minAge:0,
    permissions:{substance:'none',style:'open',embed:'approved'},
    ratings:{author:'Sample account',vouched:[],academic:'Not reviewed',community:'Sample'},
    visibility:'public', history:[], forks:[], ...extra };
}
const sample = (text, source) => ({summary:text,body:text,claims:[{text:'Sample content · source to verify',source}]});
export const ROOMS = {
  studio:room('studio', "Nic’s Studio", 'makers', 'A small home for ideas in progress. Everything here has an author; every connection has a rule.'),
  workbench:room('studio/workbench','Second Look workbench','makers','Agent setups, with a person in charge. Silver keeps the light on.',{
    permissions:{substance:'branch',style:'open',embed:'approved'},forks:[{id:'dana-workbench',author:named('Dana (sample)'),basedOn:'workbench-original',substance:{summary:'A quieter workspace for a small team.'},style:{preset:'Gallery'},history:[]}]}),
  silver:room('studio/silver','Silver','makers','An agent, operated by a verified person. Agents stay visible in every lens.',{author:agent}),
  governance:room('studio/governance','Governance desk','makers','Sterling: approvals and receipts for human authority over AI agents.',{permissions:{substance:'suggest',style:'open',embed:'approved'}}),
  research:room('studio/research','Research wall','makers','Research threads, with their sources kept close.',{substance:sample('Research threads, with their sources kept close.','https://www.talgov.com/')}),
  lab:room('studio/lab','Lab bench','makers','Sixteen mesh nodes, one wave. Look through the observation window; this edge is view-only.',{content:scores({sensory:1}),measured:scores({sensory:1})}),
  broadcast:room('studio/broadcast','Broadcast booth','makers','Dangerously Reasonable. A daily news briefing, with a smaller listening room inside.',{content:scores({sensory:1}),measured:scores({sensory:1})}),
  listening:room('studio/listening','Listening booth','makers','A quiet space nested inside the broadcast booth. It inherits the host’s rules.',{content:scores({sensory:1}),measured:scores({sensory:1})}),
  civic:room('studio/civic','Civic table','makers','A community-owned civic data hub: a place to put public knowledge together.',{author:named('Civic contributors (sample)'),permissions:{substance:'open',style:'open',embed:'anyone'}}),
  // Deliberately no private interior, people, body, scores, or provenance in the public payload.
  family:{id:'studio/family',address:'tlh/studio/family',title:'Private space',visibility:'private',district:'makers'},
  commons:room('commons','The Commons','commons','Paths meet here. Your lens decides which connections appear.'),
  market:room('commons/market','Night Market','commons','Lanterns and late conversations. Visitors say it is livelier than its author declares.',{author:named('Market collective (sample)'),content:scores({sensory:1}),measured:scores({sensory:2})}),
  night:room('after-dark','After Dark','night','An adults-only district. This is a simulated identity check, not real verification.',{minAge:18,visibility:'verified-only',content:scores({viewpoint:2,sensory:2}),measured:scores({viewpoint:2,sensory:2})}),
  tallahassee:room('tallahassee','Welcome to Tallahassee','history','A small walk through canopy roads, public places, and shared history. All stops are sample content; verify the sources.'),
  canopy:room('tallahassee/canopy','Canopy roads','history','Live oaks shelter the road. A city seen at walking speed.',{substance:sample('Live oaks shelter the road. A city seen at walking speed.','https://www.leoncountyfl.gov/'),authors:[nic,named('Local contributor (sample)')]}),
  capitol:room('tallahassee/capitol','The two Capitols','history','The historic Capitol and the modern tower share a skyline.',{substance:sample('The historic Capitol and the modern tower share a skyline.','https://www.flhistoriccapitol.gov/'),authors:[nic,anonymous]}),
  mission:room('tallahassee/mission','Mission San Luis','history','A place to learn about Apalachee and Spanish life in the seventeenth century.',{substance:sample('A place to learn about Apalachee and Spanish life in the seventeenth century.','https://www.missionsanluis.org/'),authors:[nic,named('History contributor (sample)')]}),
  boycott:room('tallahassee/boycott','The 1956 bus boycott','history','A community’s campaign against segregated public transport. This sample discusses racial injustice.',{content:scores({disturbing:2,viewpoint:1}),measured:scores({disturbing:2,viewpoint:1}),substance:sample('A community’s campaign against segregated public transport. This sample discusses racial injustice.','https://www.floridamemory.com/'),authors:[nic,named('Archive contributor (sample)'),anonymous]}),
  cascades:room('tallahassee/cascades','Cascades Park','history','Water, open sky, and a place to gather.',{substance:sample('Water, open sky, and a place to gather.','https://www.talgov.com/'),authors:[nic,anonymous]}),
};
export const EDGES = [
  {id:'studio-city',from:'studio',to:'tallahassee',type:'door',scene:'studio',position:[0,-12],destination:'history',consent:'Target owner approved'},
  {id:'studio-commons',from:'studio',to:'commons',type:'seamless',scene:'studio',position:[12,1],axis:'x',consent:'Both owners approved'},
  {id:'commons-market',from:'commons',to:'market',type:'seamless',scene:'studio',position:[22,-5],consent:'Both owners approved'},
  {id:'commons-night',from:'commons',to:'night',type:'door',scene:'studio',position:[29,2],axis:'x',consent:'Verified adults only'},
  {id:'studio-broadcast',from:'studio',to:'broadcast',type:'seamless',scene:'studio',position:[-8,4]},
  {id:'broadcast-listening',from:'broadcast',to:'listening',type:'embedded',scene:'studio',position:[-8,2],host:'broadcast',consent:'Host approved'},
  {id:'studio-lab',from:'studio',to:'lab',type:'window',scene:'studio',position:[7,-4],consent:'Viewing approved'},
  {id:'city-canopy',from:'tallahassee',to:'canopy',type:'seamless',scene:'history',position:[0,3]},
  {id:'canopy-capitol',from:'canopy',to:'capitol',type:'seamless',scene:'history',position:[0,-9]},
  {id:'city-mission',from:'tallahassee',to:'mission',type:'seamless',scene:'history',position:[-8,-1]},
  {id:'city-boycott',from:'tallahassee',to:'boycott',type:'seamless',scene:'history',position:[8,-3]},
  {id:'city-cascades',from:'tallahassee',to:'cascades',type:'seamless',scene:'history',position:[8,7]},
];
export const EXHIBITS = [
  {id:'workbench',x:-4.7,z:-2}, {id:'silver',x:-4.7,z:-2}, {id:'governance',x:-7,z:-8},
  {id:'research',x:-10,z:-3}, {id:'civic',x:6,z:4}, {id:'family',x:-12,z:-8},
];
export const PRESETS = {
  Kids:{limits:scores({sensory:1}),hard:scores({sensory:1})},
  Teen:{limits:scores({violence:1,sexual:1,language:2,disturbing:1,viewpoint:1,sensory:1}),hard:scores({violence:2,sexual:2,language:2,disturbing:2,viewpoint:2,sensory:2})},
  Adult:{limits:scores({violence:2,sexual:2,language:2,disturbing:2,viewpoint:2,sensory:2}),hard:Object.fromEntries(DIMENSIONS.map(([k])=>[k,null]))},
  Everything:{limits:scores({violence:3,sexual:3,language:3,disturbing:3,viewpoint:3,sensory:3}),hard:Object.fromEntries(DIMENSIONS.map(([k])=>[k,null]))},
};
export function createLens() {
  return {viewAs:'me',preset:'Adult',limits:{...PRESETS.Adult.limits},hard:{...PRESETS.Adult.hard},show:{verified:true,named:true,anonymous:true,agent:true}};
}
