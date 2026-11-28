import {allowedClubs} from './discovery.js';
import {visiblePeople} from './discovery-policy.js';
import {ROOMS} from './data.js';
// Answers use the same visible catalog and privacy-filtered records as Discovery.
// A sample presence is never evidence that a Place is busy in real life.
export function indexQuestionAnswer({topic},discovery,{from='square'}={}){
 const lens=discovery.lens(),result={rule:'Visible records; no inferred activity',matches:[]};
 if(topic==='clubs'){
  const clubs=allowedClubs(lens);
  return {...result,text:clubs.length?'Groups with halls in your view: '+clubs.map(c=>`${c.name} — ${c.description} Hall: ${ROOMS[c.hall].title}.`).join(' ')+' Open Discovery → Clubs to inspect membership and the hall’s door. No membership has been granted.':'No group with a hall you can reach is on file in this view.'};
 }
 if(topic==='people'){
  const people=visiblePeople(lens,{located:true}),named=people.filter(p=>p.followable),real=people.filter(p=>!p.simulation);
  return {...result,text:(real.length?`${real.length} shared presence records are current in your view. `:'There is no connected live crowd count here, so I cannot tell you who is here now or promise a busy Place. ')+(named.length?'Visible '+(!real.length?'sample ':'')+'records you can follow: '+named.map(p=>p.name+' at '+ROOMS[p.room].title).join('; ')+'. Open Discovery → People to inspect or follow.':'No followable shared presence is visible under your Lens and privacy rules.')};
 }
 const entries=discovery.query({sort:'newest'},{from}).results.filter(c=>c.dateAt!=null&&c.dateLabel!=='Scheduled').slice(0,5);
 return {...result,rule:'Newest dated visible records',text:'I do not have a saved comparison point for your previous visit, so I can list dated records but cannot say which are new to you. '+(entries.length?'The latest dated records in your view are: '+entries.map(c=>`${c.title} (${c.dateLabel.toLowerCase()} ${new Date(c.dateAt).toISOString().slice(0,10)})`).join('; ')+'.':'No publication or update dates are on file for the visible catalog records. Event windows are schedules, not publication dates.')};
}
