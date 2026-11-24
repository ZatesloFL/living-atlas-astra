import {pair} from '../src/scores.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import {ROOMS,DIMENSIONS,DISTRICTS} from '../src/data.js';
import {seedProfiles} from '../src/profiles.js';
import {crossing} from '../src/rules.js';
import {blockAccess,selectContent} from '../src/content.js';
import {blockHTML} from '../src/block-renderer.js';
import {AccessStore} from '../src/access-store.js';
import {accessSettings} from '../src/identity.js';
import {doorPolicy,containingPlaces} from '../src/admission.js';
import {verifyChain} from '../src/ledger.js';
const lens=()=>({...seedProfiles()[0],profileId:'seed-me',playAs:'visitor'});
const memory=()=>{const m=new Map();return {getItem:k=>m.get(k),setItem:(k,v)=>m.set(k,v)};};

test('Every nested Place uses its own measured rating, and blocked ancestors/cycles cannot be skipped',()=>{
 const l=lens();l.limits.disturbing=1;l.hard.disturbing=3;
 const rooms=Object.fromEntries(['root','room','bay','thing'].map((id,i)=>[id,{...structuredClone(ROOMS.canopy),id,parentPlaceId:i?['root','room','bay'][i-1]:null}]));rooms.thing.measured.disturbing=3;
 const gate=crossing({from:'bay',to:'thing',type:'seamless'},l,rooms);assert.equal(gate.state,'door');assert.match(gate.reasons.join(' '),/Disturbing themes amount: 3/);
 assert.deepEqual(containingPlaces('thing',rooms),['root','room','bay','thing']);l.hard.disturbing=2;assert.equal(crossing({to:'thing',type:'seamless'},l,rooms).state,'hidden');
 rooms.room.minAge=99;assert.equal(crossing({to:'bay',type:'seamless'},l,rooms).state,'hidden');rooms.room.minAge=0;rooms.root.parentPlaceId='thing';assert.equal(crossing({to:'thing',type:'seamless'},l,rooms).state,'hidden');rooms.root.parentPlaceId='missing';assert.equal(crossing({to:'thing',type:'seamless'},l,rooms).state,'hidden');
 assert(Object.values(DISTRICTS).every(d=>!('max' in d)));
});
test('Owner threshold blocks entry until met; filtered admission withholds instead of rewriting, including measured block scores',()=>{
 const l=lens();l.limits.disturbing=1;l.hard.disturbing=2;const r={...structuredClone(ROOMS.canopy),admission:{mode:'threshold',minimum:{disturbing:pair(2,2)}},blocks:[{id:'hot',type:'text',importance:'core',body:'RAW_CANARY',content:{disturbing:pair(0,0)},measured:{disturbing:pair(3,3)}},{id:'mild',type:'text',importance:'core',body:'Readable',content:{disturbing:pair(0,0)}}]};
 assert.equal(crossing({to:'room',type:'seamless'},l,{room:r}).admission.blocked,true);r.admission.mode='filtered';r.measured.disturbing=3;
 assert.equal(crossing({to:'room',type:'seamless'},l,{room:r}).admission.filtered,true);assert.equal(doorPolicy(r,l).blocked,false);
 r.admission.measuredMinimum={disturbing:pair(2,2)};const override={...l,access:{policies:{[r.id]:{admission:{mode:'threshold',minimum:{disturbing:pair(0,0)}}}}}};assert.deepEqual(doorPolicy(r,override).minimum.disturbing,pair(2,2));assert.equal(doorPolicy(r,override).blocked,true);
 const result=selectContent(r,l);assert.equal(result.omitted.content,1);assert(!JSON.stringify(result).includes('RAW_CANARY'));assert.equal(result.blocks[1].body,'Readable');assert.match(blockHTML(result.blocks[0],r,l),/Filtered view.*withheld/);
 assert.equal(blockAccess(r.blocks[0],r,l).hidden,true);r.minAge=99;assert.equal(crossing({to:'room',type:'door'},l,{room:r}).state,'hidden');
});
test('At-door raises are exact-Place, receipted, bounded, expire on departure, and never survive reload',async()=>{
 const storage=memory(),store=new AccessStore(()=>storage),l=lens();l.limits.disturbing=0;l.hard.disturbing=2;
 const original=structuredClone(l),g=await store.raiseForVisit('canopy',{disturbing:pair(2,2)},l);
 assert.deepEqual(accessSettings(store.lens(l),ROOMS.canopy).limits.disturbing,pair(2,2));assert.deepEqual(accessSettings(store.lens(l),ROOMS.boycott).limits.disturbing,pair(0,0));assert.deepEqual(l,original);
 await assert.rejects(store.raiseForVisit('canopy',{disturbing:pair(3,3)},l),/hard limit/);await assert.rejects(store.raiseForVisit('canopy',{invented:1},l));await assert.rejects(store.raiseForVisit('canopy',{disturbing:pair(1,1)},{...l,isAgent:true}));
 await store.use('canopy','enter',l);assert.equal(g.state,'active');await store.use('capitol','enter',l);assert.equal(store.visitGrants.length,0);assert.deepEqual(accessSettings(store.lens(l),ROOMS.canopy).limits.disturbing,pair(0,0));
 const actions=store.data.ledgers[ROOMS.canopy.id].map(e=>e.action);for(const a of ['visit_lens_raised','visit_lens_started','visit_lens_expired'])assert(actions.includes(a));assert((await verifyChain(store.data.ledgers[ROOMS.canopy.id])).valid);
 await store.raiseForVisit('canopy',{disturbing:pair(1,1)},l);const reloaded=new AccessStore(()=>storage);await reloaded.ready;assert.deepEqual(reloaded.visitGrants,[]);assert.deepEqual(accessSettings(reloaded.lens(l),ROOMS.canopy).limits.disturbing,pair(0,0));
});
test('Policy edits preserve visibility, threshold checks bind direct use and travel, and grants cannot override legal floors',async()=>{
 const store=new AccessStore(()=>memory()),l=lens(),owner={...l,playAs:'owner'};await store.admission('canopy',{mode:'threshold',minimum:{sensory:pair(2,2)}},owner);await store.policy('canopy','public',owner);
 assert.deepEqual(store.data.policies[ROOMS.canopy.id].admission.minimum.sensory,pair(2,2));l.limits.sensory=0;l.hard.sensory=2;
 await assert.rejects(store.use('canopy','enter',l),/Access changed/);let committed=false;
 await assert.rejects(store.commitTravel([{key:'canopy',scope:'enter'}],l,{arrival:{choice:'inside',room:'canopy'},commit:()=>committed=true}));assert.equal(committed,false);
 await store.raiseForVisit('canopy',{sensory:pair(2,2)},l);await store.use('canopy','enter',l);await store.endVisits(l);assert.equal(store.visitGrants.length,0);
 const child={...l,age:10};await assert.rejects(store.raiseForVisit('night',{sexual:pair(3,3)},child),/ceiling/);
});

test('Amount and graphicness bind separately at every depth; one dial can never compensate for the other',()=>{
 const l=lens();l.limits.disturbing=pair(1,1);l.hard.disturbing=pair(3,3);
 for(const score of [pair(3,1),pair(1,3)]){
  const r={...structuredClone(ROOMS.canopy),content:{disturbing:score},measured:{disturbing:pair(0,0)}};
  assert.equal(crossing({to:'x',type:'seamless'},l,{x:r}).state,'door');
  const high=score.amount===3?'amount':'graphicness',other=high==='amount'?'graphicness':'amount';
  l.limits.disturbing[other]=3;assert.equal(crossing({to:'x',type:'seamless'},l,{x:r}).state,'door');
  l.hard.disturbing[high]=2;assert.equal(crossing({to:'x',type:'seamless'},l,{x:r}).state,'hidden');
  r.admission={mode:'filtered',minimum:{disturbing:pair(3,3)}};r.blocks=[{id:'piece',type:'text',importance:'core',body:'NO_LEAK',content:{disturbing:score}}];
  assert.equal(crossing({to:'x',type:'door'},l,{x:r}).admission.filtered,true);assert.equal(selectContent(r,l).blocks[0].filtered,true);
  l.limits.disturbing=pair(1,1);l.hard.disturbing=pair(3,3);
 }
 const mixed={content:{disturbing:pair(3,1)},measured:{disturbing:pair(1,3)}};
 assert.deepEqual(blockAccess(mixed,ROOMS.canopy,l).reasons,['Disturbing themes amount','Disturbing themes graphicness']);
});

test('A containing Place visit stays open in its child without raising the child Lens; leaving the tree expires it',async()=>{
 const root='visit-parent',child='visit-child',l=lens(),store=new AccessStore(()=>memory());
 ROOMS[root]={...structuredClone(ROOMS.canopy),id:root,admission:{mode:'threshold',minimum:{disturbing:pair(2,1)}}};
 ROOMS[child]={...structuredClone(ROOMS.canopy),id:child,parentPlaceId:root};l.limits.disturbing=pair(0,0);l.hard.disturbing=pair(3,3);
 try{await store.raiseForVisit(root,{disturbing:pair(2,1)},l);await store.use(root,'enter',l);await store.use(child,'enter',l);assert.equal(store.visitGrants[0].state,'active');assert.deepEqual(accessSettings(store.lens(l),ROOMS[child]).limits.disturbing,pair(0,0));assert.notEqual(crossing({to:child,type:'door'},store.lens(l)).state,'hidden');await store.use('capitol','enter',l);assert.equal(store.visitGrants.length,0);}finally{delete ROOMS[root];delete ROOMS[child];}
});
test('Malformed content scores fail closed at the Place and Thing boundaries',()=>{
 const l=lens(),r={...structuredClone(ROOMS.canopy),measured:{disturbing:{amount:'bad',graphicness:0}}};assert.equal(crossing({to:'bad',type:'door'},l,{bad:r}).state,'hidden');assert.equal(selectContent(ROOMS.canopy,l,[{id:'bad',type:'text',importance:'core',body:'NO_LEAK',content:r.measured}]).blocks.length,0);
});
