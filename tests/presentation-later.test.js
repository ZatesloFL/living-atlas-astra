import test from 'node:test';import assert from 'node:assert/strict';
import {ProfileStore,makeProfile} from '../src/profiles.js';
import {presentationRequest} from '../src/profile-presentation.js';
import {authorshipSnapshot} from '../src/account-state.js';
import {authorName,identityBadge} from '../src/identity.js';
import {verifyChain} from '../src/ledger.js';
const memory=()=>{const data=new Map();return {getItem:k=>data.get(k)??null,setItem:(k,v)=>data.set(k,v)};};
test('all newly created profiles start Named, recorded as a starting state, including a copied TEST profile',async()=>{
 const s=new ProfileStore(()=>memory());assert.equal(makeProfile('New').identity.display,'real');
 await s.setup({name:'Synthetic holder',age:34,display:'anonymous'});assert.equal(s.current().identity.display,'real');
 assert.deepEqual(s.entries.find(e=>e.action==='profile_created').diff.presentation,{display:'real',origin:'starting presentation',chosen:false});
 await s.switchProfile('seed-visitor');const copy=await s.saveAs('New test');assert.equal(copy.identity.display,'real');assert(copy.isTest);
});
test('presentation words change immediately, survive reload and leave historical bylines and receipts intact',async()=>{
 const storage=memory(),s=new ProfileStore(()=>storage);await s.setup({name:'Synthetic holder',age:34});const named=authorshipSnapshot(s.current()),original=JSON.stringify(s.entries[0]);
 await s.changePresentation('Use the name Fern');assert.equal(s.current().profileName,'Fern');const pseudonymous=authorshipSnapshot(s.current());assert.equal(authorName(pseudonymous),'Fern');
 await s.changePresentation('Show no name');assert.equal(s.current().identity.display,'anonymous');const anonymous=authorshipSnapshot(s.current());assert.equal(authorName(anonymous),'Anonymous');assert.doesNotMatch(JSON.stringify(anonymous),/Fern|Synthetic holder/);
 assert.equal(authorName(named),'Synthetic holder');assert.match(identityBadge(named),/^Named/);assert.equal(authorName(pseudonymous),'Fern');assert.match(identityBadge(pseudonymous),/^Pseudonymous/);assert.equal(JSON.stringify(s.entries[0]),original);
 const reload=new ProfileStore(()=>storage);await reload.ready;assert.equal(reload.current().identity.display,'anonymous');await reload.changePresentation('Pseudonymous');assert.equal(reload.current().profileName,'Fern');
 assert.equal((await verifyChain(reload.entries)).valid,true);assert.equal(reload.entries.filter(e=>e.action==='presentation_changed').length,3);
});
test('missing pseudonym needs a name; the optional public-act offer is recorded at most once',async()=>{
 assert.throws(()=>presentationRequest('Pseudonymous'),/name/);const s=new ProfileStore(()=>memory());await s.setup({name:'Synthetic',age:34});
 assert(await s.offerPresentation({kind:'public knock',place:'studio/writing'}));assert.equal(await s.offerPresentation({kind:'publication',place:'other'}),false);assert.equal(s.current().identity.display,'real');
});
