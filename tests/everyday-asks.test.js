import test from 'node:test';import assert from 'node:assert/strict';
import {atlasIntent,validateAtlasIntent} from '../src/atlas-intents.js';
import {destinationWords,resolveDestination,placeQuestionWords} from '../src/atlas-destinations.js';
import {Discovery} from '../src/discovery.js';import {ProfileStore} from '../src/profiles.js';import {AccessStore} from '../src/access-store.js';
const data=new Map(),storage=()=>({getItem:k=>data.get(k),setItem:(k,v)=>data.set(k,v)});
test('everyday travel and Place questions have separate validated intents, including contractions and dimension words in titles',()=>{
 for(const text of ['Take me to the bus boycott','take me to the language museum','Please bring me to the Grant Gallery'])assert.equal(validateAtlasIntent(atlasIntent(text)).kind,'destination');
 for(const text of ['what is the bus boycott?','What’s this place?','Tell me about the bus boycott'])assert.equal(validateAtlasIntent(atlasIntent(text)).kind,'place-question');
 for(const text of ["Where's the bus boycott?",'Where is my home?','Where can I find the bus boycott?'])assert.equal(validateAtlasIntent(atlasIntent(text)).question,'location');
 assert.equal(atlasIntent("What's new since I was last here?").kind,'index');assert.equal(atlasIntent('What is a group I can join here?').topic,'clubs');assert.equal(atlasIntent('Send me to the bus boycott').kind,'destination');assert.equal(destinationWords('Send me to the bus boycott'),'the bus boycott');assert.equal(atlasIntent('Take me somewhere busy').kind,'index');assert.equal(atlasIntent('where am I').kind,'destination');assert.equal(atlasIntent('Stop helping right now').kind,'revoke');assert.equal(atlasIntent('Be Proactive for travel; you may advise; always ask before crossing; watch for busy Places').kind,'envelope');
 assert.equal(destinationWords("Where's the bus boycott?"),'the bus boycott');assert.equal(destinationWords('Take me to the bus boycott please!'),'the bus boycott');
});
test('Place descriptions and addresses resolve through Discovery without crossing or changing records',async()=>{
 const profiles=new ProfileStore(storage),access=new AccessStore(storage);await Promise.all([profiles.ready,access.ready]);await profiles.switchProfile('seed-me');const lens=()=>access.lens(profiles.current());const discovery=new Discovery(profiles,access,{lens});
 const count=JSON.stringify(access.data);for(const query of ['take me to the bus boycott','what is the bus boycott?',"where's the bus boycott?"]){const found=resolveDestination(query,discovery,{from:'square'});assert.deepEqual(found.matches.map(c=>c.room),['boycott']);const c=found.matches[0];assert(placeQuestionWords(c,'overview').includes(c.summary));assert(placeQuestionWords(c,'location').includes(c.view.address));}
 assert.equal(JSON.stringify(access.data),count);assert.equal(resolveDestination('Take me to nonexistent tea planet',discovery,{from:'square'}).matches.length,0);
});
