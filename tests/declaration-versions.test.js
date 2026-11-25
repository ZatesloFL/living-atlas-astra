import test from 'node:test';
import assert from 'node:assert/strict';
import {ROOMS} from '../src/data.js';
import {seedProfiles} from '../src/profiles.js';
import {AccessStore} from '../src/access-store.js';
import {viewRoom,versionLabel} from '../src/audience.js';
import {catalogIndex} from '../src/discovery-index.js';
import {declarationSnapshot,targetRef} from '../src/standing-records.js';
import {pair} from '../src/scores.js';

for(const [amount,version] of [[1,'documentary'],[2,'immersive']])test(`The boycott ${version} declaration agrees across Discovery, its table and the standing target`,async()=>{
 const store=new AccessStore(()=>null);await store.ready;
 const profile=seedProfiles()[0];profile.limits.disturbing=pair(amount,1);
 const lens=store.lens(profile),original=JSON.stringify(ROOMS.boycott),receipts=JSON.stringify(store.data);
 const doorView=viewRoom(ROOMS.boycott,lens);
 assert.equal(doorView.version.id,version);
 const card=catalogIndex(lens,{standing:store.standing}).find(c=>c.type==='room'&&c.room==='boycott');
 const target=store.standing.resolve(card.ref,lens,{metadataOnly:true});
 const declaration=declarationSnapshot(store.standing.data,target.ref,target.node,target.view,{publishedOnly:target.published});
 assert.deepEqual(card.declaration.disturbing,pair(amount,1));
 assert.deepEqual(card.declaration,doorView.content);
 assert.deepEqual(card.readings.declared,card.declaration);
 assert.deepEqual(declaration.scores,card.declaration);
 assert.equal(card.versionLabel,versionLabel(ROOMS.boycott,lens));
 // Passing the raw Place along with its delivered view must not lose that view.
 assert.deepEqual(declarationSnapshot(store.standing.data,targetRef(ROOMS.boycott),ROOMS.boycott,doorView).scores,card.declaration);
 assert.equal(JSON.stringify(ROOMS.boycott),original);assert.equal(JSON.stringify(store.data),receipts);
});
