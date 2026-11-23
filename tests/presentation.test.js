import test from 'node:test';
import assert from 'node:assert/strict';
import {ROOMS,createLens} from '../src/data.js';
import {presetForIdentity} from '../src/rules.js';
import {viewRoom} from '../src/audience.js';
import {heroHTML,presentationFor} from '../src/presentation.js';
import {contentStore} from '../src/content.js';
import {blockHTML} from '../src/block-renderer.js';
const lens=()=>{const l=createLens();presetForIdentity(l,'verified');return {...l,depth:'Deep'};};
const fixture=()=>({...ROOMS.studio,id:'presentation-fixture',authors:[{name:'Private name',identity:{display:'anonymous',backing:'none'}}],substance:{summary:'RAW SUMMARY MUST NOT APPEAR'},blocks:[
 {id:'lead',type:'text',importance:'core',body:'READABLE LEAD. Second sentence. Third sentence.',content:{disturbing:0}},
 {id:'hero',type:'image',importance:'supporting',reps:{image:'https://example.invalid/image.png',alt:'FILTERED IMAGE',credit:'Named sample credit'},content:{disturbing:0}}
]});

test('Hero follows the selected audience version and masks anonymous bylines',()=>{
 const l=lens();presetForIdentity(l,'child');
 const html=heroHTML(viewRoom(ROOMS.boycott,l),l,{approved:true});
 assert.match(html,/A boycott means choosing not to use a service/);
 assert.doesNotMatch(html,/The campaign linked students|This sample discusses racial injustice/);
 const f=heroHTML(fixture(),lens());assert.match(f,/READABLE LEAD. Second sentence./);assert.doesNotMatch(f,/RAW SUMMARY|Third sentence|Private name/);assert.match(f,/<strong>Anonymous<\/strong>/);
});
test('Hero cannot expose hard-hidden or unapproved soft blocks, even with room approval',()=>{
 const r=fixture(),l=lens();l.limits.disturbing=0;
 for(const b of r.blocks)b.content.disturbing=2;
 assert.doesNotMatch(heroHTML(r,l,{approved:true}),/READABLE LEAD|FILTERED IMAGE|image.png/);
 assert.match(heroHTML(r,l,{approved:true,softApproved:new Set(['lead','hero'])}),/READABLE LEAD/);
 l.hard.disturbing=0;
 assert.doesNotMatch(heroHTML(r,l,{approved:true,softApproved:new Set(['lead','hero'])}),/READABLE LEAD|FILTERED IMAGE|image.png/);
});
test('Hero honors Depth, Trust and Show rather than reaching around filtered blocks',()=>{
 const r=fixture(),l=lens();l.depth='Glance';assert.doesNotMatch(heroHTML(r,l),/FILTERED IMAGE|image.png/);
 l.depth='Deep';l.trustFrom='Academic';assert.doesNotMatch(heroHTML(r,l),/FILTERED IMAGE|image.png/);
 l.trustFrom='Author';r.blocks.forEach(b=>b.author={name:'Sample',identity:{display:'pseudonym',backing:'none'}});l.show.pseudonym=false;
 assert.doesNotMatch(heroHTML(r,l),/READABLE LEAD|FILTERED IMAGE|image.png/);
});
test('Hero reflects arriving, resolved and failed content with honest fallbacks',async()=>{
 const l=lens(),r=viewRoom(ROOMS.boycott,l),key='boycott:archive-image',current=()=>heroHTML(r,l,{blocks:contentStore.blocks('boycott',r.blocks)});let release;
 try{
  const pending=contentStore.load('boycott','archive-image',()=>new Promise(resolve=>{release=resolve;}));
  assert.match(current(),/Hero media is arriving/);
  release({reps:{image:'https://example.invalid/resolved.png',alt:'Resolved sample',credit:'Sample creator'}});await pending;
  assert.match(current(),/resolved.png.*Resolved sample/s);assert.match(current(),/Sample creator/);
  await contentStore.load('boycott','archive-image',()=>Promise.reject(new Error('Synthetic unavailable')));
  const failed=current();assert.match(failed,/Hero media is unavailable/);assert.doesNotMatch(failed,/resolved.png|Resolved sample/);
 }finally{contentStore.overrides.delete(key);contentStore.tokens.delete(key);}
});
test('Presentation defaults are bounded and support a film still; unsafe URLs stay inert',()=>{
 const r=fixture(),l=lens();r.presentation={theme:'unrecognized',accent:'red;position:fixed'};
 assert.deepEqual(presentationFor(r),{theme:'notebook',accent:'#367366',heroBlock:'hero'});
 r.blocks[1].reps.image='javascript:alert(1)';assert.doesNotMatch(heroHTML(r,l),/javascript:/);
 r.blocks[1]={id:'film',type:'video',importance:'core',exhibit:{settings:{slides:[{title:'A sample still',scene:1}]}},content:{disturbing:0}};
 assert.equal(presentationFor(r).heroBlock,'film');assert.match(decodeURIComponent(heroHTML(r,l)),/A sample still/);assert.match(heroHTML(r,l),/not archival media/);
});
test('Generic figures distinguish missing media and provide an honest credit line',()=>{
 const b={id:'figure',type:'image',body:'A sample',reps:{image:'https://example.invalid/sample.png',credit:'Sample creator',alt:'A drawing'},content:{disturbing:0}};
 assert.match(blockHTML(b,ROOMS.studio,lens()),/Credit: Sample creator/);
 assert.match(blockHTML({...b,state:'error'},ROOMS.studio,lens()),/Generated placeholder by Living Atlas/);
 assert.doesNotMatch(blockHTML({...b,state:'error'},ROOMS.studio,lens()),/Credit: Sample creator/);
});
