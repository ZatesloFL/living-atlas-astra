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
  await check('fresh private starter shows honest three-reading slots and an unverified account preview cannot file',async()=>{
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
  await check('the actor record has four facets and browsing permission is an explicit receipted choice',async()=>{
   await page.locator('.access-overlay:visible [data-dialog-close]').click();await page.locator('#page-settings-open').click();await page.locator('#page-record').click();
   assert.equal(await page.locator('.access-overlay:visible [data-facet]').count(),4);assert.equal(await page.locator('#standing-browsable').isChecked(),false);await page.locator('#standing-browsable').check();await page.waitForFunction(()=>__atlasPage.access.data.standingState.receipts.some(e=>e.action==='record_browsing_changed'));
   assert.equal(await page.locator('#standing-browsable').isChecked(),true);
  });
  await check('Mara offers her helper record with real accepted and rejected receipt evidence, without a live call',async()=>{
   await page.locator('.access-overlay:visible [data-dialog-close]').click();await page.evaluate(()=>__atlasPage.visit('boycott'));for(let i=0;i<8&&await page.locator('[data-enter]').count();i++)await page.locator('[data-enter]').click();
   await page.locator('#page-staff').click();await page.locator('[data-helper-record="docent-silver"]').click();await page.locator('.access-overlay:visible [data-facet=helper] summary').click();
   assert.match(await page.locator('.access-overlay:visible [data-facet=helper]').innerText(),/provider_output_incomplete/);assert.match(await page.locator('.access-overlay:visible [data-facet=helper]').innerText(),/bcf259bd-95f3-4397-bc8c-f73ec7ae5428/);assert.equal(await page.locator('.access-overlay:visible [data-facet=helper] article').count(),28);
  });
  await check('owner declares standing rules and appoints a template Place Steward through the forms',async()=>{
   await setPerson('seed-me',true);await page.locator('#page-access').click();await page.locator('#place-stewards').click();
   assert.match(await page.locator('#standing-rule-rows').innerText(),/No standing requirements/);await page.locator('#standing-rule-add').click();await page.locator('#standing-rule-save').click();await page.waitForFunction(()=>__atlasPage.access.data.policies['tallahassee/canopy']?.standingRules?.length===1);
   await page.getByText('Appoint a Place Steward',{exact:true}).click();await page.locator('#steward-appoint [name=kind]').selectOption('template-agent');await page.locator('#steward-appoint [name=name]').fill('Rowan');await page.locator('#steward-appoint [name=powers][value=exclude]').check();await page.locator('#steward-appoint button').click();await page.locator('[data-steward-measure]').waitFor();assert.match(await page.locator('[data-steward-grant]').innerText(),/Standing · no expiry/);
  });
  await check('template measurement displays the owner, grant, designate and operator chain',async()=>{
   await page.locator('[data-steward-measure]').click();assert.notEqual(await page.locator('#standing-measure [name=asSteward]').inputValue(),'');await dials('#standing-measure');await page.locator('#standing-measure [name=method]').fill('Synthetic operator-entered inspection');await page.locator('#standing-measure button[type=submit]').click();await page.locator('.delegation-chain').waitFor();assert.match(await page.locator('.delegation-chain').innerText(),/Owner seed-me → grant .* → designate Rowan.*Operator: Me/s);
  });
  await check('display exclusion remains attributed and the owner can restore it after revoking the grant',async()=>{
   await page.locator('.access-overlay:visible [data-dialog-close]').click();await page.locator('#page-access').click();await page.locator('#place-stewards').click();const form=page.locator('[data-steward-grant] [data-steward-display]');await form.locator('[name=reason]').fill('Synthetic display choice');await form.locator('button').click();await page.waitForFunction(()=>__atlasPage.access.data.standingState.receipts.some(e=>e.action==='steward_display_changed'&&e.diff.excluded));
   await page.locator('[data-steward-revoke]').click();await page.waitForFunction(()=>document.querySelector('[data-steward-grant]')?.textContent.includes('Revoked'));assert.equal(await page.locator('[data-steward-measure]').count(),0);
   await page.getByText('Owner · display choices',{exact:true}).click();const own=page.locator('[data-steward-display]');await own.locator('[name=choice]').selectOption('restore');await own.locator('[name=reason]').fill('Synthetic owner restore');await own.locator('button').click();await page.waitForFunction(()=>__atlasPage.access.data.standingState.receipts.filter(e=>e.action==='steward_display_changed').at(-1)?.diff.excluded===false);
  });
  await check('knock shows four facets to the owner without exposing a private Lens',async()=>{
   await setPerson('seed-verified');await page.locator('#page-access').click();await page.locator('#knock').click();await page.waitForFunction(()=>__atlasPage.access.data.requests.some(q=>q.by==='seed-verified'&&q.status==='pending'));
   await setPerson('seed-me',true);await page.locator('#page-access').click();assert.match(await page.locator('.access-overlay:visible .access-content').innerText(),/Declaration record:.*Measurement record:.*Helper record:.*Commitment record:/s);await page.locator('[data-knock-record]').click();assert.equal(await page.locator('.access-overlay:visible [data-facet]').count(),4);
  });
  await check('a hall display choice targets the selected audience version and preserves its source',async()=>{
   await page.locator('.access-overlay:visible [data-dialog-close]').click();await page.evaluate(()=>__atlasPage.visit('boycott'));for(let i=0;i<8&&await page.locator('[data-enter]').count();i++)await page.locator('[data-enter]').click();await page.locator('#page-access').click();await page.locator('#place-stewards').click();await page.getByText('Owner · display choices',{exact:true}).click();const form=page.locator('[data-steward-display]');await form.locator('[name=thing]').selectOption('film');await form.locator('[name=reason]').fill('Synthetic versioned display choice');await form.locator('button').click();await page.waitForFunction(()=>__atlasPage.access.data.standingState.receipts.some(e=>e.action==='steward_display_changed'&&e.diff.target.audienceVersion==='immersive'));
   assert.match(await page.locator('#page-article [data-block-id=film]').innerText(),/Excluded from display by Me/);assert.equal(await page.locator('#page-article [data-block-id=film] [data-kit]').count(),0);assert.equal(await page.evaluate(async()=>{const {ROOMS}=await import('./src/data.js');return !!ROOMS.boycott.versions.find(v=>v.id==='immersive').blocks.find(b=>b.id==='film').body;}),true);
   await page.getByText('Owner · display choices',{exact:true}).click();await page.locator('[data-steward-display] [name=thing]').selectOption('film');await page.locator('[data-steward-display] [name=choice]').selectOption('restore');await page.locator('[data-steward-display] [name=reason]').fill('Synthetic restoration');await page.locator('[data-steward-display] button').click();await page.waitForFunction(()=>!!document.querySelector('#page-article [data-block-id=film] [data-kit]'));
  });
  await check('private Lens standing preferences persist after reload',async()=>{
   await page.locator('.access-overlay:visible [data-dialog-close]').click();await page.locator('#page-settings-open').click();await page.getByText('Standing preferences',{exact:true}).click();await page.locator('[data-standing-preference=declaration]').selectOption('warn');await page.locator('[data-standing-preference=audienceWhenUnmeasured]').check();await page.reload();await page.waitForFunction(()=>window.__atlasPage);await page.locator('#page-settings-open').click();await page.getByText('Standing preferences',{exact:true}).click();assert.equal(await page.locator('[data-standing-preference=declaration]').inputValue(),'warn');assert.equal(await page.locator('[data-standing-preference=audienceWhenUnmeasured]').isChecked(),true);
  });
  assert.deepEqual(errors,[]);assert.deepEqual(calls,[]);console.log(JSON.stringify({passed,errors,liveCalls:calls.length}));
 }catch(error){console.error(await page.evaluate(()=>document.body.innerText.slice(-5000)));throw error;}finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
