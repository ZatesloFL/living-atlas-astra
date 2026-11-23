// Local-only UI regression: no provider or Supabase calls.
const {chromium}=require(process.env.ATLAS_PLAYWRIGHT_MODULE||'playwright-core'),assert=require('node:assert/strict');
(async()=>{
 const browser=await chromium.launch({executablePath:'/usr/bin/chromium',headless:true,args:['--no-sandbox','--enable-unsafe-swiftshader']});
 const p=await browser.newPage({viewport:{width:393,height:851},isMobile:true,hasTouch:true}),base=process.env.ATLAS_URL||'http://127.0.0.1:8003/',errors=[],outbound=[];let passed=0;
 p.on('pageerror',e=>errors.push(e.message));p.on('request',r=>{if(new URL(r.url()).origin!==new URL(base).origin)outbound.push(r.url());});
 const check=async(name,fn)=>{await fn();passed++;console.log('PASS '+name);};
 const close=()=>p.locator('.access-overlay:not([hidden]) [data-dialog-close]').click();
 const room=async key=>{await p.locator('#page-places').click();await p.locator('#page-room').selectOption(key);for(let i=0;i<5&&await p.locator('[data-enter]').count();i++)await p.locator('[data-enter]').click();};
 const ask=async q=>{await p.locator('#docent-question').fill(q);await p.locator('#docent-ask').click();await p.locator('#docent-keep').waitFor();};
 try{
  await p.goto(base+'?page&test&ai=local');await p.waitForFunction(()=>window.__atlasPage);await p.locator('#page-setup [name=age]').fill('30');await p.locator('#page-setup button[type=submit]').click();
  await check('Three Places show separate names in Staff, badges and answer bylines; starters still work',async()=>{
   for(const [key,name] of [['studio','Ellis'],['square','Rowan'],['boycott','Mara']]){
    await room(key);await p.locator('#page-staff').click();await p.locator('[data-docent]').first().waitFor();assert(!/Silver/.test(await p.locator('.staff-sheet').innerText()));await p.locator('[data-docent]').first().click();
    assert.match(await p.locator('.helper-badge').first().innerText(),new RegExp(name));assert.match(await p.locator('#docent-ask').innerText(),new RegExp(name));
    assert.equal(await p.locator('[data-question]').count(),3);await p.locator('[data-question=overview]').click();await p.locator('#docent-keep').waitFor();assert.match(await p.locator('.helper-answer').innerText(),new RegExp('Proposed answer · '+name));await close();
   }
  });
  await check('Typed supported and unsupported questions use scoped local answers; local-only is explained',async()=>{
   await p.locator('#page-staff').click();await p.locator('[data-docent=docent-silver]').click();assert.equal(await p.locator('[data-helper-route]').getAttribute('data-helper-route'),'local_selected');
   await ask('What bus service did residents boycott?');assert.equal(await p.locator('[data-ai-source]').innerText(),'Simulated · local helper');assert.match(await p.locator('.helper-excerpt').innerText(),/1956/);
   await ask('What is the price of a ticket to Mars?');assert.equal(await p.locator('.helper-excerpt').innerText(),"I don't know from the blocks available in this view.");
   assert.equal(await p.locator('.helper-answer').count(),1);assert.equal(await p.locator('#docent-question').getAttribute('maxlength'),'600');
   for(const size of [{width:393,height:851},{width:851,height:393}]){await p.setViewportSize(size);assert(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));}
   await p.setViewportSize({width:393,height:851});await p.screenshot({path:'work/asking/local-ask.png'});
  });
  await check('Tour proposals show the local helper name and retain checked paths; reopening drops question text',async()=>{
   await p.locator('#docent-tour').click();await p.locator('#start-helper-tour').waitFor();assert.match(await p.locator('.helper-answer').innerText(),/Proposed tour · Mara/);await close();
   await p.locator('#page-staff').click();await p.locator('[data-docent]').first().click();assert.equal(await p.locator('#docent-question').inputValue(),'');await close();
  });
  await check('The same typed ask works inside the 3D hall and retains hall presence',async()=>{
   await p.goto(base+'?safe&test&form=3d&ai=local');await p.waitForFunction(()=>window.__atlas);await p.evaluate(()=>__atlas.go('boycott',{choice:'inside'}));
   for(let i=0;i<8&&await p.locator('[data-preview]').count();i++){await p.locator('[data-preview]').first().click();await p.locator('[data-confirm]').click();}await p.locator('#travel-go').click();await p.waitForFunction(()=>!__atlas.travel.active);
   await p.evaluate(()=>__atlas.staffUI.docent('boycott'));await ask('What bus service did residents boycott?');assert.match(await p.locator('.helper-answer').innerText(),/Proposed answer · Mara/);assert.equal(await p.evaluate(()=>atlasStatus().scene),'hall:boycott');
   assert.deepEqual(errors,[]);assert.deepEqual(outbound,[]);
  });
  console.log(JSON.stringify({passed,liveCalls:0}));
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
