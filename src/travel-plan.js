import {ROOMS} from './data.js';
import {graphEdges} from './navigation.js';
import {visibleEdge} from './rules.js';
import {permission,personId} from './permissions.js';
export function planRoute(from,to,lens){
 if(!ROOMS[from]||!ROOMS[to]||!permission(ROOMS[to],lens).visible||visibleEdge({to,type:'seamless'},lens).state==='hidden')return null;if(from===to)return [];
 const queue=[from],seen=new Map([[from,null]]),edges=graphEdges();
 for(let i=0;i<queue.length;i++)for(const e of edges.filter(e=>e.from===queue[i])){
  const gate=visibleEdge(e,lens);if(seen.has(e.to)||gate.state==='hidden'||gate.type==='window'&&!(e.to===to&&gate.rights?.canEnter))continue;
  seen.set(e.to,e);if(e.to===to){const result=[];for(let at=to;at!==from;){const edge=seen.get(at);result.unshift(edge);at=edge.from;}return result;}queue.push(e.to);
 }return null;
}
export function travelPlan(from,target,lens,{confirmed=new Set(),invites=new Set()}={}){
 const route=planRoute(from,target,lens);if(!route)return {route:null,rows:[],ready:false};const rows=[];
 for(const edge of route){
  const room=ROOMS[edge.to],gate=visibleEdge(edge,lens),p=permission(room,lens),request=[...(lens.access?.requests??[])].reverse().find(q=>q.room===room.id&&q.by===personId(lens)&&q.status!=='cancelled');
  if(!p.canEnter){rows.push({id:'access:'+edge.id,kind:'access',edge,state:request?.status==='pending'?'Waiting on owner':'Needs you',request,reason:request?.status==='declined'?'Request declined. Knock again or leave.':p.reason});continue;}
  if(p.grant&&p.grant.id!=='owner'){
   const accepted=p.grant.kind!=='invite'||invites.has(p.grant.id)||(lens.access?.ledgers?.[room.id]??[]).some(r=>r.action==='invite_opened'&&r.actor===personId(lens)&&r.diff.grant===p.grant.id);
   rows.push({id:'grant:'+p.grant.id,kind:p.grant.kind==='invite'?'invite':'pass',edge,grant:p.grant,state:accepted?'Ready':'Needs you',reason:`${p.scope} pass${p.grant.expires?' · expires '+new Date(p.grant.expires).toLocaleTimeString():''}`});
  }
  if(gate.type==='door')rows.push({id:'door:'+edge.id,kind:'door',edge,state:confirmed.has(edge.id)?'Ready':'Needs you',reason:gate.reasons.join(' · ')||'Confirm this doorway before departure.'});
  if(gate.type==='window')rows.push({id:'window:'+edge.id,kind:'window',edge,state:'Ready',reason:'View-only stop: arrive outside the window.'});
 }
 return {route,rows,ready:rows.every(r=>r.state==='Ready')};
}
