// Authored content and placement only. Geometry is provided by reusable renderers.
const citation=(label,url)=>({label,url,status:'to verify'});
const sources=[citation('Florida Memory: civil-rights collections','https://www.floridamemory.com/'),citation('Florida A&M University: historical research starting point','https://www.famu.edu/'),citation('Tallahassee historical research starting point','https://www.talgov.com/')];
const b=(id,type,importance,body,extra={})=>({id,type,importance,body,reps:{text:typeof body==='string'?body:'',alt:''},sources:[],...extra});
export const BOYCOTT_BLOCKS=[
 b('sample','text','core','SAMPLE ARTICLE · TO VERIFY. This is a draft for testing the Atlas, not a reviewed historical account. Dates, descriptions and source matches need checking against primary records.'),
 b('facts','infobox','core',{Topic:'Tallahassee bus boycott',Period:'1956–1957 (to verify)',Place:'Tallahassee, Florida',Focus:'Community organizing against segregated public transport',Status:'Sample content · every historical claim to verify'}),
 b('lead','text','core','In 1956, Black residents of Tallahassee organized a boycott of the city’s segregated bus service. The campaign linked students, church communities and other residents in a sustained challenge to unequal treatment. This draft follows the everyday work of organizing transport as well as the public dispute over segregation. It avoids graphic detail and requires source review before use as a historical reference.',{sources}),
 b('context-heading','heading','supporting','1. A segregated city'),
 b('context','text','supporting','Racial segregation shaped access to public spaces and services in mid-century Tallahassee. Bus travel was part of daily life: reaching work, classes, shops and family required time, money and reliable transport. The boycott makes more sense when read alongside that everyday geography. This account needs locally specific evidence about routes, ridership and the rules enforced in 1956.',{sources:[sources[0]]}),
 b('spark-heading','heading','supporting','2. From an arrest to a collective response'),
 b('spark','text','supporting','Historical summaries connect the beginning of the boycott to the arrest of Florida A&M students Wilhelmina Jakes and Carrie Patterson after a dispute over bus seating in May 1956. Students and community members responded by refusing to ride. The precise sequence, wording of the charges and contemporary accounts remain to verify; this draft does not reproduce unverified quotations.',{sources:[sources[0],sources[1]]}),
 b('bus-model','model','supporting','A simplified bus silhouette represents public transport; it is not a reconstruction of a documented vehicle.',{reps:{model:'procedural:bus',alt:'Generated cream-colored bus with blue windows, shown without passengers or period markings.',text:'A simple bus-shaped exhibit stands beside the walking path. No archival vehicle model is loaded.'}}),
 b('organizing-heading','heading','supporting','3. Organizing the daily journey'),
 b('organizing','text','supporting','Boycotting a transport system meant finding other ways to move. Community organizing included shared rides, walking and coordination among people who still needed to reach jobs and classes. Historical accounts describe the Inter-Civic Council as a central organizing body. Its membership, decisions and support networks should be checked through records that preserve participants’ own perspectives.',{sources}),
 b('route-map','map','detail',{lat:30.4383,lng:-84.2807,label:'Downtown Tallahassee reference point only',status:'to verify',note:'Illustrative location, not a reconstruction of boycott routes.'},{reps:{text:'Downtown Tallahassee, approximately 30.4383° N, 84.2807° W. Route research is still needed.',alt:'Placeholder map with a single reference point; no historical route is asserted.'}}),
 b('archive-image','image','supporting','Archive photograph placeholder',{state:'unavailable',reps:{alt:'Reserved for a properly sourced and licensed street or bus photograph from Tallahassee during the boycott.',text:'No archival photograph has been attached. Selection, date, location, creator and rights remain to verify.'},source:{sourceId:'research-placeholder',itemId:'photo-pending',url:'https://www.floridamemory.com/',syncedAt:null,rights:'Unconfirmed · no media copied'}}),
 b('outcomes-heading','heading','supporting','4. Pressure, negotiations and change'),
 b('outcomes','text','supporting','The campaign placed economic and political pressure on the segregated bus system. Legal disputes and changes in local transport policy unfolded over time rather than in a single moment. A full account should distinguish the boycott’s organizing milestones, court decisions and the experience of riders after formal changes. This prototype deliberately leaves that detailed chronology provisional.',{sources:[sources[0],sources[2]]}),
 b('timeline','timeline','supporting',[
  {date:'May 1956 · to verify',text:'Student arrests and the beginning of a boycott, as described in historical summaries.'},
  {date:'Mid-1956 · to verify',text:'Community organizing and alternative transport sustain the campaign.'},
  {date:'Late 1956 · to verify',text:'Legal and political disputes over segregated public transport continue.'},
  {date:'1957 and after · to verify',text:'Follow the implementation of policy changes and participants’ later accounts.'}
 ]),
 b('oral-history','audio','detail','Oral-history placeholder',{state:'unavailable',reps:{alt:'Reserved for an authorized recording of a participant or historian.',transcript:'No recording or transcript is attached. Do not mistake this placeholder for a participant’s testimony.',text:'Oral histories should retain speaker consent, date, archive reference and a full transcript.'}}),
 b('film','video','detail','Documentary placeholder',{state:'unavailable',reps:{alt:'Reserved for a licensed archival or explanatory video with captions.',transcript:'No video is attached. A future transcript should distinguish contemporary footage, later interviews and narration.',text:'Poster and transcript are used when video cannot load.'}}),
 b('memory-heading','heading','supporting','5. Reading the legacy carefully'),
 b('memory','text','supporting','The boycott belongs to a wider history of the civil-rights movement, but its local story should not be reduced to a copy of events elsewhere. Comparing newspapers, public records and oral histories can reveal different vantage points and gaps. The Capitol and Cascades Park are linked below as other public places to explore; those links do not claim that either was a specific boycott event site.',{sources}),
 b('research-note','quote','detail',{text:'Which voices are present in the archive, and whose daily work is missing?',attribution:'Editorial research question written for this prototype; not a historical quotation.'}),
 b('related-capitol','link','supporting',{room:'capitol',label:'Explore the two Capitols',note:'Another public place in Tallahassee; no boycott-site claim.'}),
 b('related-cascades','link','supporting',{room:'cascades',label:'Explore Cascades Park',note:'A related city place, not a claimed event location.'}),
 b('references-heading','heading','detail','Sources to verify'),
 ...sources.map((s,i)=>b('citation-'+i,'citation','detail',{...s,note:'Research starting point only. Locate item-level evidence before marking any claim verified.'},{sources:[s]}))
];
// slot is [x,z] in scene metres; facing is radians; approach is a walkable reader return point.
export const LAYOUTS={
 studio:{root:true,kind:'courtyard',slot:[0,0],approach:[0,5.6],scene:'studio',landmark:'none',sign:false},
 workbench:{kind:'plinth',slot:[-2.8,-4],approach:[-2.8,-2.5],model:'workbench',sign:['SECOND LOOK','WORKBENCH · BRANCH ALLOWED',[-.35,2.5,-.35]]},
 silver:{kind:'plinth',slot:[-2.8,-4],approach:[-2.8,-2.5],model:'agent',sign:['◇ SILVER','AGENT · VERIFIED OPERATOR',[0,3.15,-.3]]},
 governance:{kind:'plinth',slot:[-7,-8],approach:[-7,-6.5],model:'desk',sign:['STERLING','GOVERNANCE · SUGGEST ONLY',[0,2.5,0]]},
 research:{kind:'gallery-wall',slot:[-10,-3],approach:[-10,-1.8],sign:['RESEARCH','THREADS + SOURCES',[0,3.2,0]]},
 civic:{kind:'courtyard',slot:[6,4],approach:[6,6],model:'table',sign:['CIVIC TABLE','COMMUNITY · OPEN SUBSTANCE',[0,2.35,0]]},
 family:{kind:'panorama',slot:[-12,-8],model:'boundary',sign:['PRIVATE SPACE','tlh/studio/family',[0,3.4,0]]},
 lab:{kind:'booth',slot:[7,-6.7],approach:[7,-3],model:'network',sign:false},
 broadcast:{kind:'booth',slot:[-8,1.7],approach:[-8,3.5],model:'broadcast',sign:['ON AIR','DANGEROUSLY REASONABLE',[0,3.3,2.2]]},
 listening:{kind:'booth',slot:[-8,.3],approach:[-8,1.3],model:'listening',sign:false},
 commons:{kind:'courtyard',slot:[13,1],approach:[15,1],landmark:'none',sign:['THE COMMONS','FOLLOW THE GREEN PATH →',[0,2.1,0]]},
 market:{kind:'booth',slot:[22,-9],approach:[22,-6.7],model:'market',sign:['NIGHT MARKET','LANTERNS + LATE CONVERSATIONS',[0,3.35,0]]},
 night:{kind:'panorama',slot:[32,2],approach:[30.5,2],model:'night',sign:['AFTER DARK','VERIFIED ADULTS · SIMULATED',[0,3.5,0]]},
 tallahassee:{root:true,kind:'courtyard',slot:[0,0],approach:[0,5.6],scene:'history',landmark:'none',sign:false},
 canopy:{kind:'path-stops',slot:[-2.1,1],approach:[0,1],scene:'history',landmark:'none',sign:['CANOPY ROADS','A CITY AT WALKING SPEED',[0,1.3,0]]},
 capitol:{kind:'panorama',slot:[0,-15],approach:[0,-11],scene:'history',model:'capitols',sign:['THE TWO CAPITOLS','HISTORIC CAPITOL + MODERN TOWER',[0,4.9,.5]]},
 mission:{kind:'panorama',slot:[-9,-4],approach:[-9,-.9],scene:'history',model:'mission',sign:['MISSION SAN LUIS','APALACHEE + SPANISH HISTORY',[0,4.6,0]]},
 boycott:{kind:'path-stops',slot:[9,-6],approach:[8,-4.5],scene:'history',model:'bus',sign:['1956 · BUS BOYCOTT','SAMPLE HISTORY · SOURCES TO VERIFY',[-1.4,3.4,.9]]},
 cascades:{kind:'courtyard',slot:[9,7],approach:[6,7],scene:'history',model:'fountain',sign:['CASCADES PARK','WATER + OPEN SKY',[0,2.7,0]]}
};
export const GEO={
 canopy:{lat:30.495,lng:-84.269,heading:0,elevation:45,status:'to verify',note:'Approximate canopy-road reference point, not a surveyed route.'},
 capitol:{lat:30.4381,lng:-84.2816,heading:0,elevation:65,status:'to verify'},
 mission:{lat:30.4555,lng:-84.3196,heading:0,elevation:55,status:'to verify'},
 boycott:{lat:30.4383,lng:-84.2807,heading:0,elevation:60,status:'to verify',note:'Downtown reference only, not an asserted arrest or event site.'},
 cascades:{lat:30.4334,lng:-84.2794,heading:0,elevation:25,status:'to verify'}
};
export function enrichRooms(rooms){
 for(const [id,r] of Object.entries(rooms)){
  r.layout={scale:1,facing:0,scene:r.district==='history'?'history':'studio',...(LAYOUTS[id]??{kind:'plinth',slot:[0,0]}),...r.layout};
  if(r.visibility==='private')continue;
  r.sources??=[];r.mapping??=null;r.forms=['3d','card','page'];
  r.blocks??=[b('lead','text','core',r.substance.summary),...(r.substance.body!==r.substance.summary?[b('body','text','supporting',r.substance.body)]:[]),...r.substance.claims.map((c,i)=>b('citation-'+i,'citation','supporting',{label:c.text,url:c.source,status:'to verify'},{sources:[citation(c.text,c.source)]}))];
  if(GEO[id])r.geo=GEO[id];
 }
 rooms.boycott.blocks=BOYCOTT_BLOCKS;rooms.boycott.sources=[{id:'research-placeholder',label:'Research references · not connected',status:'not connected'}];
}
