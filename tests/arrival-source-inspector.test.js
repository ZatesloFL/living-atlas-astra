import assert from 'node:assert/strict';
import test from 'node:test';
import {ARRIVAL_KEY, ArrivalRecords} from '../src/arrival-records.js';
import {loadArrivalSeed} from '../src/arrival-seed.js';
import {EDGES, ROOMS} from '../src/data.js';
import {makeProfile} from '../src/profiles.js';
import {SourcesUI} from '../src/sources-ui.js';
import {starterDraft} from '../src/starter-data.js';

test('The Source inspector reads persisted Arrival references only for the owner’s home and Drive room', async t => {
  const disk = new Map();
  const storage = {getItem:key=>disk.get(key)??null,setItem:(key,value)=>disk.set(key,value)};
  const records = new ArrivalRecords(()=>storage);

  async function arrive(name, url) {
    const profile = makeProfile(name);
    const interview = await records.saveInterview({sources:[url]},profile.id);
    const draft = starterDraft({profile,interview,start:'scratch'});
    await records.claimStarter(draft,profile.id);
    const {rootKey,roomKeys} = loadArrivalSeed(draft);
    const rooms = new Set(Object.values(roomKeys));
    const edges = new Set(EDGES.filter(edge=>rooms.has(edge.from)||rooms.has(edge.to)));
    t.after(()=>{
      for (const key of rooms) delete ROOMS[key];
      for (let i=EDGES.length-1;i>=0;i--) if (edges.has(EDGES[i])) EDGES.splice(i,1);
    });
    return {rootKey,lens:{profileId:profile.id},sourceId:interview.id+'-source-0'};
  }

  const owner = await arrive('Synthetic holder one','https://example.org/interview-source?a=1&b=2');
  const other = await arrive('Synthetic holder two','https://example.org/other-interview-source');
  await records.organize(owner.sourceId,'Gardening <notes>',owner.lens.profileId);
  const beforeRead = storage.getItem(ARRIVAL_KEY);
  const reloaded = new ArrivalRecords(()=>storage);
  assert.equal(await reloaded.ready,true);
  const ui = new SourcesUI({storage});
  ui.verifiedArrivalRecords = reloaded;
  function inspect(key, lens) {
    ui.context = {room:ROOMS[key],lens};
    return ui.renderArrivalSources();
  }

  const home = inspect(owner.rootKey,owner.lens);
  const drive = inspect(owner.rootKey+'/drive',owner.lens);
  assert.match(home,/Saved for your Drive room/);
  assert.match(drive,/Saved during arrival/);
  for (const output of [home,drive]) {
    assert.match(output,/https:\/\/example.org\/interview-source\?a=1&amp;b=2/);
    assert.match(output,/Gardening &lt;notes&gt; · Not connected/);
    assert.doesNotMatch(output,/other-interview-source|href=|<button|<form/);
  }
  assert.match(inspect(other.rootKey,other.lens),/other-interview-source/);
  assert.equal(inspect(owner.rootKey+'/workshop',owner.lens),'');
  assert.equal(inspect(owner.rootKey,other.lens),'');
  assert.equal(inspect(owner.rootKey,{...owner.lens,isAgent:true}),'');
  assert.equal(inspect(owner.rootKey,{...owner.lens,preview:true}),'');
  assert.equal(storage.getItem(ARRIVAL_KEY),beforeRead);
});
