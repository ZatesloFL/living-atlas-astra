// Authored content and placement only. Geometry is provided by reusable renderers.
const citation=(label,url)=>({label,url,status:'to verify'});
import {BOYCOTT_ARTICLE} from './boycott-history.js';
const b=(id,type,importance,body,extra={})=>({id,type,importance,body,reps:{text:typeof body==='string'?body:'',alt:''},sources:[],...extra});

// slot is [x,z] in scene metres; facing is radians; approach is a walkable reader return point.
export const LAYOUTS={
 studio:{root:true,kind:'courtyard',slot:[0,0],approach:[0,5.6],scene:'studio',landmark:'none',sign:false},
 workbench:{kind:'plinth',slot:[-2.8,-4],approach:[-2.8,-2.5],model:'workbench',sign:['SECOND LOOK','WORKBENCH · BRANCH ALLOWED',[-.35,2.5,-.35]]},
 silver:{kind:'plinth',slot:[-2.8,-4],approach:[-2.8,-2.5],model:'agent',sign:['◇ STUDIO AGENT','HELPER · OPERATOR RECORD',[0,3.15,-.3]]},
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
 rooms.boycott.blocks=BOYCOTT_ARTICLE;
}
