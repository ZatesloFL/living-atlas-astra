import test from 'node:test';
import assert from 'node:assert/strict';
import {ROOMS} from '../src/data.js';
import {Staff} from '../src/staff.js';
import {AccessStore} from '../src/access-store.js';
import {seedProfiles} from '../src/profiles.js';
const memory=()=>{const m=new Map();return {getItem:k=>m.get(k),setItem:(k,v)=>m.set(k,v)};};
test('the owner inbox spans actual owned Places without a role toggle; decisions use existing scoped receipts',async()=>{
 const storage=memory(),store=new AccessStore(()=>storage),staff=new Staff(store),seed={...seedProfiles()[0],profileId:'seed-me',playAs:'owner'};await staff.ready;await staff.pendingSamples(seed);
 const oldBoycott=ROOMS.boycott.ownerId,oldSquare=ROOMS.square.ownerId,owner={...seed,profileId:'actual-owner',playAs:'visitor'};
 try{
  ROOMS.boycott.ownerId=owner.profileId;ROOMS.square.ownerId=owner.profileId;
  const proposals=staff.ownerProposals(store.lens(owner));assert(proposals.some(p=>p.proposal.room==='boycott'&&p.agentId==='maintainer-archive'));assert(proposals.some(p=>p.proposal.room==='square'));assert(proposals.every(p=>['boycott','square'].includes(p.proposal.room)));
  const notes=proposals.filter(p=>p.proposal.kind==='note');for(const [record,decision] of [[notes[0],'why'],[notes[0],'approve'],[notes[1],'reject']]){const before=store.data.ledgers[ROOMS.boycott.id].length;await staff.decide(record.id,decision,owner);assert.equal(store.data.ledgers[ROOMS.boycott.id].length,before+1);}
  assert.equal(notes[0].status,'approved');assert.equal(notes[1].status,'rejected');assert.equal(staff.ownerProposals({...owner,isAgent:true}).length,0);assert.equal(staff.ownerProposals({...owner,preview:true}).length,0);
  await assert.rejects(staff.decide(notes[1].id,'why',{...owner,profileId:'not-the-owner'}),/owner/);
 }finally{oldBoycott===undefined?delete ROOMS.boycott.ownerId:ROOMS.boycott.ownerId=oldBoycott;oldSquare===undefined?delete ROOMS.square.ownerId:ROOMS.square.ownerId=oldSquare;}
});
