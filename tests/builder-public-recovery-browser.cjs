const assert = require('node:assert/strict');
const {chromium} = require(process.env.ATLAS_PLAYWRIGHT_MODULE || 'playwright-core');

async function records() {
  const [{ProfileStore,makeProfile},{AccessStore},{ArrivalRecords},{loadArrivalSeed},
    {starterDraft},{Builder},{PRESETS},{queryIndex}] = await Promise.all([
    import('../src/profiles.js'),import('../src/access-store.js'),import('../src/arrival-records.js'),
    import('../src/arrival-seed.js'),import('../src/starter-data.js'),import('../src/builder.js'),
    import('../src/data.js'),import('../src/discovery-index.js')
  ]);
  const memory = new Map();
  const storage = () => ({
    getItem:key=>memory.get(key)??null,
    setItem:(key,value)=>memory.set(key,value),
    removeItem:key=>memory.delete(key)
  });
  const profiles = new ProfileStore(storage);
  await profiles.ready;
  await profiles.setup({name:'Synthetic independent visitor',age:35,preset:'Adult',depth:'Deep',form:'3d',display:'pseudonym'});
  const visitor = profiles.activeId;
  const lens = profileId => ({
    ...PRESETS.Adult,profileId,age:35,depth:'Deep',playAs:'visitor',
    show:{real:true,pseudonym:true,anonymous:true,agent:true},identity:{display:'pseudonym',backing:'verified'}
  });
  const access = new AccessStore(storage), arrivals = new ArrivalRecords(storage);
  const profile = makeProfile('Synthetic published Place');
  const interview = await arrivals.saveInterview({},profile.id);
  const claim = await arrivals.claimStarter(starterDraft({profile,interview,start:'scratch'}),profile.id);
  const {rootKey} = loadArrivalSeed(claim), drive = rootKey+'/drive';
  const owner = lens(profile.id), builder = new Builder({storage});
  await access.policy(rootKey,'public',owner);
  const publish = async (key,kind) => {
    const current = access.lens(owner);
    const draft = await builder.add(key,current,kind);
    await builder.preview(key,current,current);
    return {piece:draft.pieces[0].id,receipt:(await builder.publish(key,current)).receipt};
  };
  const publication = await publish(rootKey,'lantern');
  const privatePublication = await publish(drive,'sign');
  const endorsement = await builder.vouch(rootKey,access.lens(lens(visitor)));
  const before = queryIndex(access.lens(lens(visitor))).results.find(row=>row.type==='room'&&row.target===rootKey);
  assert.deepEqual({publishedAt:before.publishedAt,vouches:before.vouches},{publishedAt:Date.parse(publication.receipt.time),vouches:1});
  return {saved:[...memory],rootKey,drive,owner:profile.id,visitor,privatePiece:privatePublication.piece,
    publicationReceipt:publication.receipt.id,endorsementReceipt:endorsement.receipt.id,
    beforeReload:{publishedAt:before.publishedAt,vouches:before.vouches}};
}

(async()=>{
  const evidence = await records();
  const pin = process.env.ATLAS_TEST_SPKI;
  const browser = await chromium.launch({executablePath:process.env.ATLAS_CHROMIUM||'/usr/bin/chromium',
    args:['--no-sandbox','--enable-unsafe-swiftshader',...(pin?['--ignore-certificate-errors-spki-list='+pin]:[])]});
  const base = process.env.ATLAS_URL||'http://127.0.0.1:8000/';
  const results={};
  try {
    for(const surface of ['3d','page']){
      const context = await browser.newContext({viewport:{width:390,height:844},hasTouch:true,isMobile:true});
      const page = await context.newPage();
      const errors=[],edgeCalls=[];
      page.on('pageerror',error=>errors.push(error.message));
      await page.route('**/functions/v1/**',route=>{edgeCalls.push(new URL(route.request().url()).pathname);return route.abort();});
      await page.addInitScript(entries=>{for(const [key,value] of entries)localStorage.setItem(key,value);},evidence.saved);
      await page.goto(base+'?test&safe&ai=local'+(surface==='page'?'&page':''),{waitUntil:'domcontentloaded'});
      await page.waitForFunction(surface=>surface==='page'?!!window.__atlasPage:!!window.__atlas,surface);
      const found = await page.evaluate(async ({rootKey,drive,privatePiece,surface})=>{
        const {ROOMS}=await import('./src/data.js');
        const {queryIndex}=await import('./src/discovery-index.js');
        const lens=surface==='page'?__atlasPage.lens:__atlas.state().lens;
        const entries=queryIndex(lens).results;
        const record=entries.find(row=>row.type==='room'&&row.target===rootKey);
        const old=entries.find(row=>row.type==='room'&&row.target==='studio');
        return {holder:lens.profileId,publishedAt:record?.publishedAt??null,vouches:record?.vouches??null,
          draft:ROOMS[drive]?.blocks.some(b=>b.id===privatePiece)??false,privateListed:entries.some(row=>row.target===drive),
          legacy:{publishedAt:old?.publishedAt??null,vouches:old?.vouches??null}};
      },{rootKey:evidence.rootKey,drive:evidence.drive,privatePiece:evidence.privatePiece,surface});
      assert.equal(found.holder,evidence.visitor);
      assert.notEqual(found.holder,evidence.owner);
      assert.deepEqual({publishedAt:found.publishedAt,vouches:found.vouches},evidence.beforeReload);
      assert.equal(found.draft,false);
      assert.equal(found.privateListed,false);
      assert.deepEqual(found.legacy,{publishedAt:null,vouches:null});
      assert.deepEqual(errors,[]);
      assert.deepEqual(edgeCalls,[]);
      results[surface]=found;
      await context.close();
    }
  } finally {await browser.close();}
  console.log(JSON.stringify({syntheticOnly:true,publicationReceipt:evidence.publicationReceipt,
    endorsementReceipt:evidence.endorsementReceipt,beforeReload:evidence.beforeReload,freshVisitor:results},null,2));
})().catch(error=>{console.error(error);process.exitCode=1;});
