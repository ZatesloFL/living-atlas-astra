import test from 'node:test';
import assert from 'node:assert/strict';
import {Builder} from '../src/builder.js';
import {registerProjection} from '../src/build-projection.js';
import {Discovery} from '../src/discovery.js';
import {indexCard} from '../src/discovery-view.js';
import {AccessStore} from '../src/access-store.js';
import {ROOMS,EDGES,PRESETS} from '../src/data.js';
import {scores} from '../src/scores.js';

test('Discovery cards expose real publication receipts and delegate exact-version endorsements to Builder',async t=>{
 const key='discovery-publication-'+crypto.randomUUID(),memory=new Map();
 const storage=()=>({getItem:k=>memory.get(k)??null,setItem:(k,v)=>memory.set(k,v)});
 const reader=id=>({...structuredClone(PRESETS.Adult),profileId:id,age:30,playAs:'visitor',depth:'Deep',show:{real:true,pseudonym:true,anonymous:true,agent:true},identity:{display:'pseudonym',backing:'verified'}});
 const owner=reader(key+'-owner'),visitor=reader(key+'-visitor');
 registerProjection({projection:{schemaVersion:2,rootPlaceId:key,rooms:[{placeId:key,parentPlaceId:null,layout:{kind:'courtyard'},pathIds:[],pieces:[],behaviors:[]}]},changes:[{op:'create',kind:'Place',ref:{placeId:key},fields:{title:'Synthetic publication observatory',visibility:'public',content:scores(),blocks:[]}}]},{ownerId:owner.profileId});
 const edge={id:key,from:'square',to:key,type:'door',scene:'square',position:[2,2]};EDGES.push(edge);
 t.after(()=>{delete ROOMS[key];EDGES.splice(EDGES.indexOf(edge),1);});
 const builder=new Builder({storage}),access=new AccessStore(storage);await access.ready;
 const discovery=new Discovery({current:()=>visitor},access,{builder,lens:()=>access.lens(visitor)});
 const card=()=>discovery.query().results.find(c=>c.room===key&&c.type==='room');
 const prefs={followed:[]};
 assert.match(indexCard(card(),prefs),/Date not on file/);assert.equal(discovery.canEndorse(card()),false);
 await builder.add(key,owner,'lantern');await builder.preview(key,owner,owner);const published=await builder.publish(key,owner);
 assert.equal(card().publishedAt,Date.parse(published.receipt.time));assert.equal(discovery.canEndorse(card()),true);
 assert.match(indexCard(card(),prefs),new RegExp(published.receipt.time.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')));
 const shown={...card(),node:{...card().node}};
 const receipt=await discovery.endorse(shown);assert.equal(receipt.receipt.action,'build_vouched');
 assert.equal(card().vouches,1);assert.match(indexCard(card(),prefs),/Endorsements on file<\/dt><dd>1/);
 assert.equal((await discovery.endorse(shown)).receipt.id,receipt.receipt.id);
 assert.equal(builder.data.receipts.filter(r=>r.action==='build_vouched').length,1);
 for(const sort of ['newest','vouched'])assert.equal(discovery.query({sort}).results[0].room,key);
 await builder.add(key,owner,'lantern');await builder.preview(key,owner,owner);await builder.publish(key,owner);
 await assert.rejects(discovery.endorse(shown),/version changed/);
 assert.equal(card().vouches,null);
});

test('Curator boards do not substitute sample counts or relative ages for missing provenance',()=>{
 const lens={...structuredClone(PRESETS.Adult),profileId:'reader',age:30,playAs:'visitor',identity:{display:'pseudonym',backing:'verified'},show:{real:true,pseudonym:true,anonymous:true,agent:true}};
 const access=new AccessStore(()=>({getItem:()=>null,setItem(){}}));
 const discovery=new Discovery({current:()=>lens},access,{lens:()=>lens});
 for(const card of discovery.query({board:'noticeboard',sort:'vouched'}).results){assert.equal(card.vouches,null);assert.equal(card.publishedAt,null);assert(!('sampleAge' in card));assert(!('sampleVouches' in card));}
});
