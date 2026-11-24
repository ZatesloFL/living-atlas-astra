import test from 'node:test';
import assert from 'node:assert/strict';
import {ROOMS} from '../src/data.js';
import {scores,pair} from '../src/scores.js';
import {seedProfiles} from '../src/profiles.js';
import {AccessStore,ACCESS_KEY} from '../src/access-store.js';
import {permission} from '../src/permissions.js';
import {crossing} from '../src/rules.js';
import {selectContent} from '../src/content.js';
import {events,targetRef,readingsFor} from '../src/standing-records.js';
import {deriveStanding} from '../src/standing-facets.js';
import {standingDoorPolicy,standingLensPolicy,stewardGrants} from '../src/standing-policy.js';
import {verifyChain} from '../src/ledger.js';
import {Staff} from '../src/staff.js';
const person=(id='owner',extra={})=>({...seedProfiles()[0],profileId:id,profileName:id,identity:{display:'pseudonym',backing:'verified'},...extra});
const rule=extra=>({facet:'declaration',requires:'held',appliesTo:'everyone',unmeasured:'allow',effect:'require',...extra});
function fixture(){const memory=new Map(),storage={getItem:k=>memory.get(k),setItem:(k,v)=>memory.set(k,v)},keys=['place-','door-'].map(prefix=>prefix+crypto.randomUUID());for(const [n,key] of keys.entries())ROOMS[key]={...structuredClone(ROOMS.canopy),id:key,ownerId:n?'door-owner':'owner',creatorId:n?'door-owner':'owner',versions:undefined,parentPlaceId:null,blocks:[{id:'piece',type:'text',body:'BODY_CANARY',importance:'core',content:scores()}],content:scores(),measured:scores()};const store=new AccessStore(()=>storage);return {store,storage,key:keys[0],door:keys[1],ref:targetRef(ROOMS[keys[0]]),thing:targetRef(ROOMS[keys[0]],ROOMS[keys[0]].blocks[0]),cleanup:()=>keys.forEach(k=>delete ROOMS[k])};}
const measure=(f,ref,values={},who=person('checker'))=>f.store.standing.measure(ref,scores(values),who,{method:'Synthetic direct inspection'});

test('declared rules respond to a creator gap, allow unmeasured when declared, and ignore browsing privacy',async()=>{
 const f=fixture();try{
  assert.equal(standingDoorPolicy(ROOMS[f.key],f.store.lens(person())).rules.length,0);
  ROOMS[f.door].admission={mode:'threshold',standingRules:[rule({unmeasured:'knock'})]};assert(crossing({to:f.door,type:'door'},f.store.lens(person('newcomer'))).admission.blocked);delete ROOMS[f.door].admission;
  await f.store.standing.declare(f.ref,scores(),person());await measure(f,f.ref,{sensory:pair(1,0)});await f.store.standing.doorRules(f.key,[rule()],person());assert(crossing({to:f.key,type:'door'},f.store.lens(person())).admission.blocked);await f.store.standing.doorRules(f.key,[],person());
  await f.store.standing.doorRules(f.door,[rule()],person('door-owner'));
  const gate=()=>crossing({to:f.door,type:'door'},f.store.lens(person()));assert(gate().admission.blocked);assert.match(gate().reasons.join(' '),/Declaration record: gap/);
  await f.store.standing.browsing(false,person());assert(gate().admission.blocked);
  assert.equal(crossing({to:f.door,type:'door'},f.store.lens(person('newcomer'))).admission.blocked,false);
  await f.store.standing.doorRules(f.door,[rule({unmeasured:'knock'})],person('door-owner'));assert(crossing({to:f.door,type:'door'},f.store.lens(person('newcomer'))).admission.blocked);
  await assert.rejects(f.store.use(f.door,'enter',person()),/Access changed/);
 }finally{f.cleanup();}
});
test('automatic admission honors individual blocks, content hard limits and all other standing rules',async()=>{
 const f=fixture(),helper=person('clean-helper',{isAgent:true});try{
  await f.store.policy(f.door,'listed',person('door-owner'));
  await f.store.transaction(()=>f.store.standing.append(helper.profileId,'helper_result',{helper:helper.profileId,outcome:'held',source:'synthetic test',published:true}));
  await f.store.standing.doorRules(f.door,[rule({facet:'helper',appliesTo:'agents',effect:'admit',unmeasured:'knock'})],person('door-owner'));
  assert(permission(ROOMS[f.door],f.store.lens(helper)).canEnter);assert.match(crossing({to:f.door,type:'door'},f.store.lens(helper)).reasons.join(' '),/Helper record: held/);
  await f.store.grant(f.door,{person:helper.profileId},'look',null,person('door-owner'),'block',true);assert.equal(permission(ROOMS[f.door],f.store.lens(helper)).canEnter,false);
  await f.store.revoke(f.store.data.grants.at(-1).id,person('door-owner'));
  ROOMS[f.door].content=scores({violence:pair(3,3)});helper.hard.violence=pair(0,0);assert.equal(crossing({to:f.door,type:'door'},f.store.lens(helper)).state,'hidden');ROOMS[f.door].content=scores();
  await f.store.standing.doorRules(f.door,[rule({facet:'helper',effect:'admit'}),rule({facet:'commitment',unmeasured:'knock'})],person('door-owner'));assert(crossing({to:f.door,type:'door'},f.store.lens(helper)).admission.blocked);
 }finally{f.cleanup();}
});
test('Lens warns or filters a Place gap and audience readings are optional only until a Steward measures',async()=>{
 const f=fixture(),reader=person('reader');try{
  assert.deepEqual(standingLensPolicy(ROOMS[f.key],{...f.store.lens(reader),standingPreferences:{declaration:'warn'}}),{filter:false,warning:null});
  await f.store.standing.declare(f.ref,scores(),person());await measure(f,f.ref,{sensory:pair(1,0)});
  assert.match(standingLensPolicy(ROOMS[f.key],{...f.store.lens(reader),standingPreferences:{declaration:'warn'}}).warning,/gap/);
  assert.equal(crossing({to:f.key,type:'door'},{...f.store.lens(reader),standingPreferences:{declaration:'filter'}}).state,'hidden');
  await f.store.use(f.door,'enter',reader);await f.store.standing.measure(targetRef(ROOMS[f.door]),scores({sensory:pair(2,2)}),reader,{kind:'audience'});reader.hard.sensory=pair(1,1);
  assert.notEqual(crossing({to:f.door,type:'door'},f.store.lens(reader)).state,'hidden');
  reader.standingPreferences={audienceWhenUnmeasured:true};assert.equal(crossing({to:f.door,type:'door'},f.store.lens(reader)).state,'hidden');
  await measure(f,targetRef(ROOMS[f.door]));assert.notEqual(crossing({to:f.door,type:'door'},f.store.lens(reader)).state,'hidden');
 }finally{f.cleanup();}
});
test('template and human designates file attributed measurements with scoped, verified authority',async()=>{
 const f=fixture();try{
  const g=await f.store.standing.stewardship.appoint(f.key,{kind:'template-agent',name:'Juniper',powers:['measure','contest']},person());
  assert.equal(deriveStanding(f.store.standing.data,{actor:'owner'}).facets.commitment.reading,'unmeasured');
  const m=await f.store.standing.stewardship.measureAs(g.hash,f.ref,scores(),person(),{method:'Synthetic operator-entered inspection'}),entry=events(f.store.standing.data).find(e=>e.id===m.hash);
  assert.equal(entry.measurer.name,'Juniper');assert.equal(entry.measurer.relationship,'designate');assert.equal(entry.measurer.operator.id,'owner');assert.equal(entry.measurer.delegation[0].owner,'owner');assert.equal(entry.measurer.delegation[0].grant,g.hash);assert.equal(entry.measurer.delegation[0].placeId,f.key);assert.equal(deriveStanding(f.store.standing.data,{actor:'owner'}).facets.commitment.reading,'held');
  await assert.rejects(async()=>f.store.standing.stewardship.measureAs(g.hash,targetRef(ROOMS[f.door]),scores(),person(),{method:'Out of scope'}),/scope/);
  await assert.rejects(f.store.standing.stewardship.admit(g.hash,'visitor',person()),/power/);
  await assert.rejects(async()=>f.store.standing.stewardship.measureAs(g.hash,f.ref,scores(),person('stranger'),{method:'Wrong operator'}),/different/);
  for(const display of ['real','pseudonym']){const who=person('human-'+display,{identity:{display,backing:'verified'}});await f.store.standing.stewardship.appoint(f.key,{kind:'human',person:who,powers:['measure']},person());await measure(f,f.ref,{},who);assert.equal(readingsFor(f.store.standing.data,f.ref).stewards.at(-1).measurer.relationship,'designate');}
  await f.store.standing.stewardship.revoke(g.hash,person());await assert.rejects(async()=>f.store.standing.stewardship.measureAs(g.hash,f.ref,scores(),person(),{method:'Revoked'}),/revoked/);assert((await verifyChain(f.store.standing.data.receipts)).valid);
 }finally{f.cleanup();}
});
test('delegated admission ends with its parent grant and cannot override an owner block or a containing Place',async()=>{
 const f=fixture(),s=f.store.standing.stewardship,visitor=person('visitor');try{
  await f.store.policy(f.key,'listed',person());const g=await s.appoint(f.key,{kind:'template-agent',name:'Cedar',powers:['admit'],expires:new Date(Date.now()+60000).toISOString()},person());
  const admitted=await s.admit(g.hash,'visitor',person());assert.equal(admitted.expires,s.grants(f.key)[0].expires);const designate=s.grants(f.key)[0].designate.id;await f.store.grant(f.key,{person:designate},'look',null,person(),'block',true);await assert.rejects(s.admit(g.hash,'another',person()),/current access/);await f.store.grant(f.key,{person:designate},'look',null,person(),'steward');assert(permission(ROOMS[f.key],f.store.lens(visitor)).canEnter);
  assert.equal(permission(ROOMS[f.key],f.store.lens(visitor),Date.now()+120000).canEnter,false);assert(stewardGrants(f.store.standing.data,f.key,Date.now()+120000)[0].expired);
  await f.store.grant(f.key,{person:'blocked'},'look',null,person(),'block',true);await assert.rejects(s.admit(g.hash,'blocked',person()),/individual block/);
  await s.revoke(g.hash,person());assert.equal(permission(ROOMS[f.key],f.store.lens(visitor)).canEnter,false);
  const human=person('human');const g2=await s.appoint(f.key,{kind:'human',person:human,powers:['admit']},person());await s.admit(g2.hash,'visitor',human);ROOMS[f.key].parentPlaceId=f.door;await f.store.policy(f.door,'hidden',person('door-owner'));assert.equal(crossing({to:f.key,type:'door'},f.store.lens(visitor)).state,'hidden');
 }finally{f.cleanup();}
});
test('display exclusion is attributed and reversible without changing the original or independent readings',async()=>{
 const f=fixture(),s=f.store.standing.stewardship;try{
  await measure(f,f.thing,{sensory:pair(1,0)});const original=structuredClone(ROOMS[f.key].blocks[0]),g=await s.appoint(f.key,{kind:'template-agent',name:'Ash',powers:['exclude']},person());
  await s.display(f.thing,true,'Synthetic owner display choice',person(),{grantId:g.hash});const filtered=selectContent(ROOMS[f.key],f.store.lens(person('reader'))).blocks[0];assert.equal(filtered.type,'withheld');assert.equal(filtered.displayBy,'Ash');assert(!JSON.stringify(filtered).includes('BODY_CANARY'));assert.deepEqual(ROOMS[f.key].blocks[0],original);assert.equal(readingsFor(f.store.standing.data,f.thing).stewards.length,1);
  await s.revoke(g.hash,person());await s.display(f.thing,false,'Owner restores display',person());assert.equal(selectContent(ROOMS[f.key],f.store.lens(person('reader'))).blocks[0].body,'BODY_CANARY');
 }finally{f.cleanup();}
});
test('revoking one scoped appointment preserves another Place and an operated Docent’s existing look grant',async()=>{
 const f=fixture(),s=f.store.standing.stewardship,human=person('designate');try{
  await f.store.policy(f.key,'listed',person());await f.store.policy(f.door,'listed',person('door-owner'));
  const first=await s.appoint(f.key,{kind:'human',person:human,powers:['measure']},person());await s.appoint(f.door,{kind:'human',person:human,powers:['measure']},person('door-owner'));
  assert(permission(ROOMS[f.key],f.store.lens(human)).canLook);assert(permission(ROOMS[f.door],f.store.lens(human)).canLook);await s.revoke(first.hash,person());assert.equal(permission(ROOMS[f.key],f.store.lens(human)).canLook,false);assert(permission(ROOMS[f.door],f.store.lens(human)).canLook);
  f.store.data.staffState.helpers.push({id:'docent-fixture',name:'Iris',operator:{id:'owner',backing:'verified'},places:[f.key]});const original=await f.store.grant(f.key,{person:'docent-fixture'},'look',null,person(),'helper');
  const appointment=await s.appoint(f.key,{kind:'operated-agent',agentId:'docent-fixture',powers:['measure']},person());await s.measureAs(appointment.hash,f.ref,scores(),person(),{method:'Synthetic operator inspection'});await s.revoke(appointment.hash,person());assert.equal(original.revokedAt,null);assert.equal(original.expires,null);
 }finally{f.cleanup();}
});
test('knocks carry facets without Lens or visit history; anonymous presentation carries no record',async()=>{
 const f=fixture();try{
  const visitor=person('visitor',{standingPreferences:{declaration:'filter'}}),q=await f.store.knock(f.key,visitor);assert.equal(Object.keys(q.standing.facets).length,4);assert(!JSON.stringify(q.standing).includes('standingPreferences'));assert(!JSON.stringify(q.standing).includes('limits'));assert.equal(f.store.standing.actorRecord('visitor',person(),{knockId:q.id}).moment,true);
  const anon={...visitor,identity:{display:'anonymous',backing:'verified'}},anonymous=await f.store.knock(f.key,anon);assert.equal(anonymous.standing,null);assert.equal(anonymous.name,'Visitor');assert.equal(f.store.standing.actorRecord('visitor',person(),{knockId:anonymous.id}).moment,false);
  await assert.rejects(measure(f,f.ref,{},anon),/Anonymous presentation/);
 }finally{f.cleanup();}
});
test('tampered standing receipts block crossings and no authored Place ships standing requirements',async()=>{
 const f=fixture();try{
  assert(Object.values(ROOMS).every(room=>!room.standingRules?.length));await f.store.standing.doorRules(f.key,[rule()],person());const raw=JSON.parse(f.storage.getItem(ACCESS_KEY));raw.standingState.receipts[0].diff.rules=[];f.storage.setItem(ACCESS_KEY,JSON.stringify(raw));const broken=new AccessStore(()=>f.storage);await broken.ready;assert.equal(broken.valid,false);assert(crossing({to:f.key,type:'door'},broken.lens(person('visitor'))).admission.blocked);await assert.rejects(broken.use(f.key,'enter',person('visitor')),/verification/);
 }finally{f.cleanup();}
});
test('an attached Docent obeys its own standing rules and excluded Things never enter its answer context',async()=>{
 const f=fixture();try{
  const staff=new Staff(f.store);await staff.ready;const owner=person('owner',{playAs:'owner'}),visitor=person('reader'),actor=staff.actor('docent-square');
  await f.store.standing.doorRules('square',[rule({facet:'helper',appliesTo:'helpers',unmeasured:'knock'})],owner);
  assert.throws(()=>staff.context(actor,'square','answer',visitor),/standing rules/);
  await f.store.standing.doorRules('square',[],owner);assert(staff.context(actor,'square','answer',visitor).blocks.length);
  const block=ROOMS.square.blocks[0];await f.store.standing.stewardship.display(targetRef(ROOMS.square,block),true,'Synthetic source exclusion',owner);
  const context=staff.context(actor,'square','answer',visitor);assert(!context.visibleThings.includes(block.id));assert(!context.blocks.some(b=>b.id===block.id));
  await f.store.policy(f.key,'listed',person());const grant=await f.store.standing.stewardship.appoint(f.key,{kind:'template-agent',name:'Elm',powers:['admit']},person());const agent=f.store.standing.stewardship.grants(f.key)[0].designate.id;await f.store.standing.stewardship.admit(grant.hash,'reader',person());assert(permission(ROOMS[f.key],f.store.lens(visitor)).canEnter);await staff.revoke(agent,person());assert(f.store.standing.stewardship.grants(f.key)[0].revoked);assert.equal(permission(ROOMS[f.key],f.store.lens(visitor)).canEnter,false);
 }finally{f.cleanup();}
});
