const assert = require('node:assert/strict');
const {chromium} = require(process.env.ATLAS_PLAYWRIGHT_MODULE || 'playwright-core');
const completeArrival = require('./arrival-setup.cjs');
const {enterPlaceByAddress, atlasState, grantBuildAndSources, revokeStarterForGrantCheck, setPosture} = require('./atlas-build-browser-controls.cjs');

(async()=>{
  const browser=await chromium.launch({executablePath:'/usr/bin/chromium',headless:true,
    args:['--no-sandbox','--enable-unsafe-swiftshader',...(process.env.ATLAS_TEST_SPKI?['--ignore-certificate-errors-spki-list='+process.env.ATLAS_TEST_SPKI]:[])]});
  try {
    const page=await browser.newPage({viewport:{width:524,height:1166},hasTouch:true,isMobile:true,reducedMotion:'reduce'});
    const errors=[],calls=[];
    page.on('pageerror',error=>errors.push(error.message));
    page.on('request',request=>{if(request.url().includes('/functions/v1/'))calls.push(request.url());});
    await page.goto((process.env.ATLAS_URL??'http://127.0.0.1:8000/')+'?test&safe&ai=local');
    await page.locator('#setup-form [name=name]').fill('Synthetic Builder owner');
    await page.locator('#setup-form [name=age]').fill('30');
    await completeArrival(page,{square:false});
    await page.waitForFunction(()=>atlasStatus().room.startsWith('home/'));
    await revokeStarterForGrantCheck(page);
    const home=await page.evaluate(()=>atlasStatus().room);
    await page.locator('#build-button').click();
    const dock=page.locator('#builder-hud');
    await dock.getByRole('heading',{name:'Build',exact:true}).waitFor();
    await page.waitForFunction(()=>document.querySelector('#world').getAttribute('aria-label')?.includes('Build canvas'));
    assert.equal(await dock.getByRole('heading',{name:'Ask the Atlas',exact:true}).isVisible(),true);
    console.log('PASS entering Build from cold starter',home);

    const askBuild = async words => {
      await dock.locator('#builder-question').fill(words);
      await dock.locator('[data-builder-form=ask] button[type=submit]').click();
    };
    await askBuild('Place a bench');
    await dock.locator('.builder-status').filter({hasText:/active suggest grant for build/i}).waitFor();
    assert.equal((await atlasState(page)).grants.filter(g=>g.active).length,0);
    assert.equal(await dock.locator('.builder-proposal').count(),0);
    await dock.getByRole('button',{name:'Back to visiting',exact:true}).click();

    const grant = await grantBuildAndSources(page);
    await setPosture(page,'Build','Quiet');
    assert.equal((await atlasState(page)).envelopes.build?.posture,'Quiet');
    await page.locator('#sheet-close').click();
    await page.locator('#build-button').click();

    await dock.getByRole('button',{name:'Kit',exact:true}).click();
    await dock.getByRole('button',{name:/^Bench/}).click();
    await dock.getByRole('button',{name:'Place at center'}).click();
    const inspector=dock.locator('[data-builder-form=piece]');
    await inspector.waitFor();
    await inspector.locator('[name="position.0"]').fill('-3');
    await inspector.locator('[name="position.2"]').fill('2');
    await inspector.getByRole('button',{name:/Apply|Save/}).click();
    const ids=await page.evaluate(async id=>{
      const {ROOMS}=await import('./src/data.js');
      return {draft:__atlas.build.draft.pieces[0].id,live:ROOMS[id].blocks.map(block=>block.id)};
    },home);
    assert.ok(!ids.live.includes(ids.draft));
    console.log('PASS place and tune a draft bench without changing the published Place',ids.draft);

    await dock.locator('[data-builder-action=panel][data-value=ask]').click();
    await askBuild('Move the bench left');
    await page.waitForFunction(()=>__atlas.build.draft.pieces[0].transform.position[0]===-4);
    assert.equal(await dock.getByRole('button',{name:'Keep in draft',exact:true}).count(),0);
    const atlas = await atlasState(page);
    const proposed = atlas.receipts.find(r=>r.action==='atlas_proposed'&&r.diff.value?.kind==='extension'&&
      r.diff.value.area==='build'&&r.diff.value.action==='move-piece'&&r.diff.value.placeId===home);
    const confirmed = atlas.receipts.find(r=>r.action==='atlas_confirmed'&&r.diff.proposalReceipt===proposed?.hash);
    assert.equal(proposed?.actor,'atlas');
    assert.equal(confirmed?.actor,atlas.holder);
    assert.equal(confirmed?.diff.source,'holder request');
    assert.equal(confirmed?.diff.words,'Move the bench left');
    assert.ok(atlas.receipts.some(r=>r.action==='atlas_applied'&&r.diff.confirmationReceipt===confirmed.hash));
    assert.deepEqual(atlas.grants.filter(g=>g.active).map(g=>g.id),[grant.id]);
    console.log('PASS explicit Build request under the persistent grant in Quiet posture',{grant:grant.id,proposal:proposed.hash,confirmation:confirmed.hash});

    await dock.getByRole('button',{name:'Preview the audience',exact:true}).click();
    await dock.getByRole('button',{name:'Your view',exact:true}).click();
    await dock.getByRole('button',{name:'View scene',exact:true}).click();
    await dock.getByRole('heading',{name:'Audience preview',exact:true}).waitFor();
    await dock.getByRole('button',{name:'Return to sketch',exact:true}).click();
    await dock.getByRole('button',{name:'Review & publish'}).click();
    await dock.getByRole('heading',{name:'Review publication'}).waitFor();
    assert.ok(await dock.getByText(/Added · Bench/).isVisible());
    await dock.getByRole('button',{name:'Publish this draft'}).click();
    await dock.getByText(/^Published · Receipt [a-f0-9]{8}$/).waitFor();
    const declaration=await page.evaluate(async id=>{
      const {verifyChain}=await import('./src/ledger.js');
      const {BUILDER_STORAGE}=await import('./src/builder.js');
      const {receipts}=JSON.parse(localStorage.getItem(BUILDER_STORAGE));
      return {verified:(await verifyChain(receipts)).valid,receipts:receipts.filter(r=>r.diff.roomKey===id).map(r=>[r.action,'builder:'+r.hash]),build:atlasDiagnostics().build};
    },home);
    assert.ok(declaration.verified);
    assert.equal(declaration.receipts.at(-1)[0],'build_published');
    assert.ok(declaration.receipts.some(([action])=>action==='build_previewed'));
    console.log('PASS preview and confirmed publication',JSON.stringify(declaration));

    await dock.getByRole('button',{name:'Back to visiting'}).click();
    await enterPlaceByAddress(page,home+'/drive');
    await enterPlaceByAddress(page,home);
    const drawn=async()=>page.evaluate(({home,piece})=>{
      let found=false;
      const expected='exhibit:'+home+':'+piece;
      __atlas.scene().traverse(node=>{if(node.userData.id===expected||node.userData.ids?.includes(expected))found=true;});
      return found;
    },{home,piece:ids.draft});
    assert.ok(await drawn());
    await page.reload();
    await page.waitForFunction(id=>window.atlasStatus?.().room===id,home);
    assert.ok(await drawn());
    assert.deepEqual((await atlasState(page)).grants.filter(g=>g.active).map(g=>g.id),[grant.id]);
    assert.deepEqual(errors,[]);
    assert.deepEqual(calls,[]);
    if(process.env.ATLAS_EXPECT_STAMP)assert.equal(declaration.build,process.env.ATLAS_EXPECT_STAMP);
    console.log('PASS leave, re-enter and reload with published bench in 3D. Zero Edge Function calls.');
  } finally {await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
