const assert = require('node:assert/strict');
const {chromium} = require(process.env.ATLAS_PLAYWRIGHT_MODULE || 'playwright-core');
const completeArrival = require('./arrival-setup.cjs');

async function enter(page, id) {
  await page.locator('#atlas-button').click();
  await page.locator('#atlas-address input').fill(id);
  await page.locator('#atlas-address button').click();
  const preview=page.locator('[data-preview]');
  for (let i=0;i<8&&await preview.count();i++) {
    await preview.first().click();
    await page.locator('[data-confirm]').click();
  }
  await page.locator('#travel-go').click();
  await page.waitForFunction(target=>atlasStatus().room===target&&!__atlas.travel.active,id);
}

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
    const home=await page.evaluate(()=>atlasStatus().room);
    await page.locator('#build-button').click();
    const dock=page.locator('#builder-hud');
    await dock.getByRole('heading',{name:'Build',exact:true}).waitFor();
    await page.waitForFunction(()=>document.querySelector('#world').getAttribute('aria-label')?.includes('Build canvas'));
    assert.equal(await dock.getByRole('heading',{name:'Ask the Atlas',exact:true}).isVisible(),true);
    console.log('PASS entering Build from cold starter',home);

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
    console.log('PASS place and tune bench in draft before Visit sees it',ids.draft);

    await dock.getByRole('button',{name:'Preview the audience',exact:true}).click();
    await dock.getByRole('button',{name:'View scene',exact:true}).click();
    await dock.getByRole('heading',{name:'Visitor preview'}).waitFor();
    await dock.getByRole('button',{name:'Return to draft',exact:true}).click();
    await dock.getByRole('button',{name:'Review & publish'}).click();
    await dock.getByRole('heading',{name:'Review publication'}).waitFor();
    assert.ok(await dock.getByText(/Added · Bench/).isVisible());
    await dock.getByRole('button',{name:'Publish this draft'}).click();
    await dock.getByText(/Published · Receipt builder:/).waitFor();
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
    await enter(page,home+'/drive');
    await enter(page,home);
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
    assert.deepEqual(errors,[]);
    assert.deepEqual(calls,[]);
    if(process.env.ATLAS_EXPECT_STAMP)assert.equal(declaration.build,process.env.ATLAS_EXPECT_STAMP);
    console.log('PASS leave, re-enter and reload with published bench in 3D. Zero Edge Function calls.');
  } finally {await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
