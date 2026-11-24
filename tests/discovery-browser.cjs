const {chromium}=require(process.env.ATLAS_PLAYWRIGHT_MODULE||'playwright-core'),assert=require('node:assert/strict');
const completeArrival=require('./arrival-setup.cjs');
(async()=>{
 const browser=await chromium.launch({executablePath:'/usr/bin/chromium',headless:true,args:['--no-sandbox','--enable-unsafe-swiftshader']});
 const page=await browser.newPage({viewport:{width:393,height:851},isMobile:true,hasTouch:true}),base=process.env.ATLAS_URL||'http://127.0.0.1:8006/';
 const errors=[],calls=[];page.on('pageerror',e=>errors.push(e.message));page.on('request',r=>{if(r.url().includes('/functions/v1/'))calls.push(r.url());});let passed=0;
 const check=async(name,fn)=>{await fn();passed++;console.log('PASS '+name);};
 const open=async(section='search')=>page.evaluate(section=>__atlasPage.communityUI.open(section),section);
 const state=()=>page.evaluate(()=>JSON.stringify({grants:__atlasPage.access.data.grants,ledgers:__atlasPage.access.data.ledgers,visits:__atlasPage.access.visitGrants,room:__atlasPage.room,presence:__atlasPage.access.data.presence}));
 try{
  await page.goto(base+'?page&test&ai=local');await page.locator('#setup-form [name=age]').fill('30');await completeArrival(page);await page.evaluate(async()=>{const p=__atlasPage;await p.profiles.switchProfile('seed-me');p.lens=p.access.lens({...p.profiles.current(),playAs:'visitor'});});
  await check('search shows paired declarations, three readings, real why-reasons and no legacy helper label',async()=>{
   await open();await page.locator('#discovery-words').fill('boycott');await page.locator('#discovery-search>button').click();
   assert(await page.locator('.discovery-card').count()>0);assert.equal(await page.locator('.declaration-chips').first().locator('li').count(),6);
   await page.locator('.index-why summary').first().click();assert.match(await page.locator('.index-why').first().innerText(),/“boycott” matches/);
   await page.locator('.index-readings summary').first().click();assert.match(await page.locator('.index-readings').first().innerText(),/unmeasured/);
   assert(!/\bSilver\b/.test(await page.locator('#community-body').innerText()));
  });
  await check('preview is read-only and leaves the ordinary Enter/Knock actions available',async()=>{
   const before=await state();await page.locator('[data-card]').first().click();assert.match(await page.locator('.index-preview-notice').innerText(),/no grant issued, no visit recorded/);
   assert.equal(await state(),before);assert.equal(await page.locator('[data-index-knock]').count(),1);assert.equal(await page.locator('[data-index-enter]').count(),1);assert.match(await page.locator('.index-door-terms').innerText(),/No additional age rule|No price declared/);
   await page.locator('#discovery-back').click();
  });
  await check('range and record controls query the same index, and ordering is visible and saved',async()=>{
   await page.locator('.discovery-filters summary').click();await page.locator('[data-range="violence:amount:max"]').selectOption('1');await page.locator('[data-facet-query=declaration]').selectOption('unmeasured');await page.locator('.discovery-filters button[type=submit]').click();
   await page.locator('#board-sort').selectOption('nearest');assert.match(await page.locator('.index-count').innerText(),/Order: Nearest/);assert.equal(await page.evaluate(()=>__atlasPage.discovery.prefs().sort),'nearest');
   await page.locator('.index-why summary').first().click();assert.match(await page.locator('.index-why').first().innerText(),/Declared violence amount.*matches 0–1/);
  });
  await check('the real local Docent returns cited index evidence without calling the live provider',async()=>{
   await page.locator('.discovery-ask summary').click();await page.locator('[data-discovery-question]').first().click();await page.locator('[data-discovery-citation]').first().waitFor();
   assert.match(await page.locator('#discovery-answer').innerText(),/Simulated · local helper · index evidence/);assert.match(await page.locator('#discovery-answer').innerText(),/Order: Nearest/);
   await page.locator('[data-discovery-citation]').first().click();assert.equal(await page.locator('.discovery-preview').count(),1);
  });
  await check('a card knock writes one request receipt and Enter still opens ordinary Page pre-flight',async()=>{
   await page.locator('#discovery-back').click();await page.locator('[data-card="place:tallahassee/1956"]').click();
   const before=await page.evaluate(()=>__atlasPage.access.data.requests.length);await page.locator('[data-index-knock]').click();await page.waitForFunction(n=>__atlasPage.access.data.requests.length===n+1,before);
   assert.equal(await page.evaluate(()=>__atlasPage.access.data.grants.filter(g=>g.kind==='knock').length),0);
   await page.locator('[data-index-enter]').click();assert(await page.locator('[data-enter]').count()>0);assert.equal(await page.evaluate(()=>__atlasPage.room),'square');
  });
  await check('phone-width and landscape cards have no document overflow; errors and provider calls remain empty',async()=>{
   await page.evaluate(()=>__atlasPage.accessUI.ui.close());await open();assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false);
   await page.setViewportSize({width:851,height:393});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false);assert.deepEqual(errors,[]);assert.deepEqual(calls,[]);
  });
  console.log(JSON.stringify({passed,errors,liveCalls:calls.length}));
 }catch(error){console.log(await page.locator('body').innerText().then(s=>s.slice(-3500)));throw error;}finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
