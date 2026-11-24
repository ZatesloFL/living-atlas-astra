import test from 'node:test';
import assert from 'node:assert/strict';
import {ROOMS} from '../src/data.js';
import {seedProfiles,ProfileStore} from '../src/profiles.js';
import {AccessStore} from '../src/access-store.js';
import {visiblePeople,presenceBadge} from '../src/discovery-policy.js';
import {Discovery} from '../src/discovery.js';
const memory=()=>{const m=new Map();return {getItem:k=>m.get(k),setItem:(k,v)=>m.set(k,v)};};
test('anonymous presentation hides the account name and stable identity, cannot be followed, and rechecks Join privacy',async()=>{
 const storage=memory(),access=new AccessStore(()=>storage),profiles=new ProfileStore(()=>storage);await access.ready;
 const lens={...seedProfiles()[0],profileId:'viewer'},d=new Discovery(profiles,access,{lens:()=>access.lens(lens)});
 access.data.presence.push({person:'ACCOUNT_ID_CANARY',name:'ACCOUNT_NAME_CANARY',identity:{display:'anonymous',backing:'verified'},room:ROOMS.civic.id,privacy:'everyone',groups:[],expires:new Date(Date.now()+60000).toISOString()});
 const people=visiblePeople(d.lens()),anon=people.find(p=>p.room==='civic');assert(anon);assert(!JSON.stringify(people).includes('ACCOUNT_'));
 assert.equal(anon.followable,false);assert.match(presenceBadge(anon),/account details private.*simulation/);assert.throws(()=>d.follow(anon.id),/cannot be followed/);assert.equal(d.join(anon.id),'civic');
 access.data.presence[0].privacy='nobody';assert.throws(()=>d.join(anon.id),/no longer shared/);
});
test('presence keeps per-person group privacy, viewer Lens and explicit simulation labels',()=>{
 const lens={...seedProfiles()[0],profileId:'viewer',identity:{display:'pseudonym',backing:'none'},groups:['tallahassee-resident']};
 assert.equal(visiblePeople(lens).find(p=>p.id==='visitor-neighbor').room,null);lens.identity.backing='verified';assert.equal(visiblePeople(lens).find(p=>p.id==='visitor-neighbor').room,'square');
 lens.show={...lens.show,pseudonym:false,agent:false};const people=visiblePeople(lens);assert(!people.some(p=>p.id==='visitor-river'));assert(people.some(p=>p.id==='docent-guide'));assert(people.every(p=>/simulation/.test(presenceBadge(p))));
});
