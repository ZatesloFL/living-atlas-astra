import test from 'node:test';
import assert from 'node:assert/strict';
import {identityBadge,helperIdentityLabel,verificationLabel} from '../src/identity.js';
import {helperIdentitySource} from '../src/account-state.js';
import {ROOMS} from '../src/data.js';
import {CURATORS,PEOPLE} from '../src/community-data.js';
import {curatorCredit} from '../src/discovery-view.js';

test('helper copies, presence and tour credit resolve the same current operator record',t=>{
 const actor={...CURATORS.find(c=>c.id==='docent-guide').author,operator:{name:'Synthetic operator',backing:'none',backing_ref:null}};
 helperIdentitySource(()=>[actor]);t.after(()=>helperIdentitySource(()=>[]));
 const author=PEOPLE.find(p=>p.id==='docent-guide').author;
 assert.equal(identityBadge(author),helperIdentityLabel(actor));
 assert.match(curatorCredit(CURATORS.find(c=>c.id==='docent-guide')),/Synthetic operator/);
 assert.doesNotMatch(curatorCredit(CURATORS.find(c=>c.id==='docent-guide')),/Nic \(verified|demonstration operator/);
 actor.operator.name='Changed operator';assert.match(identityBadge(author),/Changed operator/);
});
test('organization and sample person verification comes from their own records',()=>{
 const gallery=ROOMS['source-gallery'];
 assert.equal(identityBadge(gallery.author),'Organization · verification not connected · simulation');
 const [nic,contributor]=ROOMS.mission.authors;
 assert.equal(identityBadge(nic),'Named · '+verificationLabel(nic));
 assert.match(identityBadge(contributor),/Pseudonymous · Unverified/);
 assert.notEqual(nic.name,contributor.name);
});
