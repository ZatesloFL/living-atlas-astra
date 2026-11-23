import test from 'node:test';
import assert from 'node:assert/strict';
import {Staff} from '../src/staff.js';
import {SEED_HELPERS,LEGACY_SEED_HELPERS,seedHelperId,helperRecord} from '../src/staff-data.js';
import {AccessStore} from '../src/access-store.js';
import {ROOMS} from '../src/data.js';
import {seedProfiles} from '../src/profiles.js';
import {verifyChain} from '../src/ledger.js';
const memory=()=>{const m=new Map();return {getItem:k=>m.get(k),setItem:(k,v)=>m.set(k,v)};};
const owner={profileId:'sample-place-owner',playAs:'owner',isAgent:false};
const lens=()=>({...seedProfiles().find(p=>p.id==='seed-me'),profileId:'seed-me',playAs:'owner'});
async function legacy(){
 const storage=memory(),store=new AccessStore(()=>storage),expires=new Date(Date.now()+7*86400000).toISOString();
 await store.transaction(async()=>{
  for(const item of LEGACY_SEED_HELPERS){const actor=helperRecord(item,expires);store.data.staffState.helpers.push(actor);for(const place of actor.places)await store.issue(place,{person:actor.id},actor.role==='Docent'?'look':'suggest',expires,owner,'helper');}
  store.data.staffState.initialized=true;
 });return {storage,store,expires};
}

test('Loading an expired initialized store reissues seeded look grants once, preserves receipts and leaves suggest leases expired',async t=>{
 const {storage,store,expires}=await legacy(),old=structuredClone(store.data.grants),before=structuredClone(store.data.ledgers);
 t.mock.method(Date,'now',()=>Date.parse(expires)+86400000);
 const loaded=new AccessStore(()=>storage),staff=new Staff(loaded);await staff.ready;
 assert.equal(staff.actor('docent-silver').expires,null);assert.equal(staff.data.standingDocents,1);
 for(const g of old){
  const role=LEGACY_SEED_HELPERS.find(a=>a.id===g.to.person).role,place=Object.keys(ROOMS).find(k=>ROOMS[k].id===g.room);const current=loaded.data.grants.findLast(x=>x.to.person===seedHelperId(role,place)&&x.room===g.room);
  if(g.scope==='look'){assert.notEqual(current.id,g.id);assert.equal(current.expires,null);assert.ok(loaded.data.grants.find(x=>x.id===g.id).revokedAt);}
  else assert.deepEqual(current,{...g,to:{person:seedHelperId(role,place)}});
 }
 const expired=staff.attachments('boycott').filter(a=>a.expired);assert.deepEqual(expired.map(a=>a.actor.id).sort(),['curator-silver','maintainer-archive']);
 for(const [key,chain] of Object.entries(loaded.data.ledgers)){assert.deepEqual(chain.slice(0,before[key].length),before[key]);assert.equal((await verifyChain(chain)).valid,true);}
 const stable=JSON.stringify(loaded.data),again=new Staff(new AccessStore(()=>storage));await again.ready;assert.equal(JSON.stringify(again.store.data),stable);
 const answer=await staff.request('docent-silver','boycott','answer',lens());assert.equal(answer.status,'offered');assert.equal(loaded.data.ledgers[ROOMS.boycott.id].at(-1).action,'helper_proposed');
});
test('Standing helpers survive the passage of time; fresh suggest grants remain leased and cannot act after expiry',async t=>{
 const store=new AccessStore(()=>memory()),staff=new Staff(store);await staff.ready;
 const future=Date.now()+3650*86400000;t.mock.method(Date,'now',()=>future);
 assert.deepEqual(staff.helpers().map(a=>a.id),SEED_HELPERS.filter(a=>a.role==='Docent').map(a=>a.id));
 assert.equal(staff.attachments('boycott').find(a=>a.actor.id==='docent-silver').expired,false);
 assert.equal(staff.context(staff.actor('docent-silver'),'boycott','answer',lens()).grant.expires,null);
 await assert.rejects(staff.request('maintainer-archive','boycott','note',lens()),/expired/);
});
test('The on-load upgrade does not revive revoked/denied/missing attachments or supersede an owner override',async()=>{
 const {storage,store}=await legacy();
 const grant=place=>store.data.grants.find(g=>g.to.person==='docent-silver'&&g.room===ROOMS[place].id);
 await store.revoke(grant('lab').id,owner);
 await store.grant('boycott',{person:'docent-silver'},'look',null,lens(),'helper',true);
 const override=await store.grant('capitol',{person:'docent-silver'},'look',new Date(Date.now()+86400000).toISOString(),lens(),'helper');
 store.data.grants=store.data.grants.filter(g=>g.id!==grant('guide').id);store.persist();
 const loaded=new AccessStore(()=>storage),staff=new Staff(loaded);await staff.ready;
 for(const place of ['lab','boycott','guide']){assert.equal(staff.attachments(place).some(a=>a.actor.id===seedHelperId('Docent',place)),false);assert.throws(()=>staff.context(staff.actor(seedHelperId('Docent',place)),place,'answer',lens()),/Grant missing/);}
 assert.deepEqual(loaded.data.grants.findLast(g=>g.to.person==='docent-capitol'&&g.room===ROOMS.capitol.id),{...override,to:{person:'docent-capitol'}});
 await staff.revoke('docent-silver',lens());const revoked=JSON.stringify(loaded.data);
 const reload=new Staff(new AccessStore(()=>storage));await reload.ready;assert.equal(JSON.stringify(reload.store.data),revoked);assert.throws(()=>reload.actor('docent-silver'),/revoked/);
});
test('Legacy helper revocation and higher capabilities prevent automatic standing renewal',async()=>{
 for(const mode of ['revoked','higher-scope']){
  const {storage,store}=await legacy(),actor=store.data.staffState.helpers.find(a=>a.id==='docent-silver');
  if(mode==='revoked')actor.revokedAt=new Date().toISOString();else actor.declaredCapabilities.push('note');
  store.persist();const authority=grants=>grants.map(({to,...g})=>g);const old=JSON.stringify(authority(store.data.grants)),staff=new Staff(new AccessStore(()=>storage));await staff.ready;
  assert.equal(JSON.stringify(authority(staff.store.data.grants)),old);assert.ok(staff.data.helpers.find(a=>a.id===actor.id).expires);
 }
});
test('Receipt verification failure blocks the on-load reissue without altering saved data',async()=>{
 const {storage,store}=await legacy();store.data.ledgers[ROOMS.boycott.id][0].diff.scope='edit';store.persist();
 const saved=storage.getItem('living-atlas.access.v4'),staff=new Staff(new AccessStore(()=>storage));await assert.rejects(staff.ready,/receipts failed verification/);assert.equal(storage.getItem('living-atlas.access.v4'),saved);
});
