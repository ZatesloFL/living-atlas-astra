const {chromium}=require(process.env.ATLAS_PLAYWRIGHT_MODULE||'playwright-core');
const assert=require('node:assert/strict');
const completeArrival=require('./arrival-setup.cjs');
(async()=>{
 const browser=await chromium.launch({executablePath:'/usr/bin/chromium',headless:true,args:['--no-sandbox','--enable-unsafe-swiftshader']});
 const page=await browser.newPage({viewport:{width:393,height:851},isMobile:true,hasTouch:true}),base=process.env.ATLAS_URL||'http://127.0.0.1:8006/';
 const errors=[],calls=[];page.on('pageerror',e=>errors.push(e.message));page.on('request',r=>{if(r.url().includes('/functions/v1/'))calls.push(r.url());});let passed=0;
 const check=async(name,fn)=>{await fn();passed++;console.log('PASS '+name);};
 const setPerson=async(id,owner=false)=>{await page.evaluate(async({id,owner})=>{const p=__atlasPage;await p.profiles.switchProfile(id);p.lens=p.access.lens({...p.profiles.current(),playAs:owner?'owner':'visitor'});p.accessUI.ui.close();p.visit('canopy');},{id,owner});for(let i=0;i<8&&await page.locator('[data-enter]').count();i++)await page.locator('[data-enter]').click();};
 const openRecord=async()=>{await page.locator('#page-article .standing-card').first().locator('summary').click();await page.locator('#page-article [data-standing-open]').first().click();await page.locator('#standing-measure').waitFor();};
 const dials=async(selector,value=0)=>{for(const input of await page.locator(selector+' [data-standing-dial]').all())await input.fill(String(value));};
 try{
  await page.goto(base+'?page&test&ai=local');await page.locator('#setup-form [name=age]').fill('30');await completeArrival(page,{square:false});
  await check('fresh private starter shows honest three-reading slots and anonymous cannot file',async()=>{
   await page.locator('#page-article .standing-card').first().locator('summary').click();assert.match(await page.locator('#page-article .standing-table').first().innerText(),/Declared.*Steward.*Audience/s);
   await page.locator('#page-article [data-standing-open]').first().click();assert.equal(await page.locator('#standing-measure').count(),0);assert.match(await page.locator('.access-overlay:visible .access-content').innerText(),/Private or unpublished.*no standing accrues/s);
  });
  await check('verified visitor files one audience reading after an actual Page crossing',async()=>{
   await setPerson('seed-me');await page.waitForFunction(()=>__atlasPage.access.data.ledgers['tallahassee/canopy']?.some(e=>e.action==='access_used'&&e.diff.visit));await openRecord();
   await page.locator('#standing-measure [name=kind]').selectOption('audience');await dials('#standing-measure');await page.locator('#standing-measure [name=words]').fill('Synthetic quiet reading');await page.locator('#standing-measure button[type=submit]').click();
   await page.waitForFunction(()=>document.querySelector('.standing-reading')?.textContent.includes('Synthetic quiet reading'));assert.match(await page.locator('.standing-reading').innerText(),/Audience reading/);
  });
  await check('editing an audience reading is marked and automatically queues divergence',async()=>{
   await page.locator('#standing-measure [name=kind]').selectOption('audience');await page.locator('#standing-measure [name=measure-sensory-amount]').fill('1');await page.locator('#standing-measure [name=words]').fill('Synthetic edited reading');await page.locator('#standing-measure button[type=submit]').click();
   await page.waitForFunction(()=>document.querySelector('.standing-reading')?.textContent.includes('edited'));assert.equal(await page.locator('.standing-reading').count(),1);assert.match(await page.locator('.access-overlay:visible .access-content').innerText(),/audience divergence/);assert.equal(await page.locator('[data-remeasure]').count(),1);
  });
  await check('another Steward resolves the queue through the form and attribution stays visible',async()=>{
   await setPerson('seed-verified');await openRecord();await page.locator('[data-remeasure]').click();await dials('#standing-measure');await page.locator('#standing-measure [name=method]').fill('Synthetic direct inspection of both dials');await page.locator('#standing-measure button[type=submit]').click();await page.waitForFunction(()=>document.querySelectorAll('[data-remeasure]').length===0);
   assert.match(await page.locator('.access-overlay:visible .access-content').innerText(),/Steward reading.*independent/s);assert.equal(await page.locator('.standing-reading').count(),2);
  });
  await check('record survives reload and the phone-width Page keeps its table within a scrolling container',async()=>{
   await page.reload();await page.waitForFunction(()=>window.__atlasPage);await setPerson('seed-verified');await openRecord();assert.equal(await page.locator('.standing-reading').count(),2);assert.match(await page.locator('.standing-history').innerText(),/Full record/);
   assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false);
  });
  assert.deepEqual(errors,[]);assert.deepEqual(calls,[]);console.log(JSON.stringify({passed,errors,liveCalls:calls.length}));
 }catch(error){console.error(await page.evaluate(()=>document.body.innerText.slice(-5000)));throw error;}finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
