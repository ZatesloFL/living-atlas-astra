const completeArrival=require('./arrival-setup.cjs');
// File 19's Page selection/Staff contract. Local assets, no live AI calls.
const {chromium}=require(process.env.ATLAS_PLAYWRIGHT_MODULE||'playwright-core');
const assert=require('node:assert/strict');
(async()=>{
 const browser=await chromium.launch({executablePath:'/usr/bin/chromium',headless:true,args:['--no-sandbox','--enable-unsafe-swiftshader']});
 const p=await browser.newPage({viewport:{width:393,height:851},isMobile:true,hasTouch:true}),errors=[],requests=[];let passed=0;
 p.on('pageerror',e=>errors.push(e.message));p.on('request',r=>requests.push(r.url()));
 const check=async(name,fn)=>{await fn();passed++;console.log('PASS '+name);};
 const select=async id=>{await p.locator('#page-places').click();await p.locator('#page-room').selectOption(id);};
 const enter=async()=>{for(let i=0;i<6&&await p.locator('[data-enter]').count();i++)await p.locator('[data-enter]').click();};
 const close=()=>p.locator('.access-overlay:not([hidden]) [data-dialog-close]').click();
 const staff=()=>p.locator('.access-overlay:not([hidden])');
 try{
  await p.goto((process.env.ATLAS_URL||'http://127.0.0.1:8003/')+'?page&test&ai=local');await p.waitForFunction(()=>window.__atlasPage);
  await p.locator('#setup-form [name=age]').fill('30');await completeArrival(p);await select('studio');await enter();
  await check('Current Staff button and panel both name the current Place and its own helper',async()=>{
   assert.match(await p.locator('#page-staff').innerText(),/Nic’s Studio/);await p.locator('#page-staff').click();assert.match(await staff().innerText(),/Staff · Nic’s Studio/);assert.match(await staff().innerText(),/Ellis/);await close();
  });
  await check('Selecting a Place names the goal, explains the pending doorway and prevents stale Staff',async()=>{
   await select('boycott');assert.match(await p.locator('#page-preview-title').innerText(),/Selected: The 1956 bus boycott/);
   assert.match(await p.locator('#page-entry-cue').innerText(),/still in Nic’s Studio.*Staff change when you enter.*Welcome to Tallahassee/s);
   assert.equal(await p.locator('#page-staff').isDisabled(),true);assert.match(await p.locator('[data-enter]').innerText(),/Enter Welcome to Tallahassee/);
   await p.locator('#page-places').click();assert.equal(await p.locator('#page-room').inputValue(),'boycott');await p.locator('#page-settings-close').click();
   require('node:fs').mkdirSync('work/reliability',{recursive:true});await p.screenshot({path:'work/reliability/page-pending.png'});
   await p.locator('[data-enter]').click();if(await p.locator('[data-enter]').count()){assert.match(await p.locator('#page-entry-cue').innerText(),/still in Welcome to Tallahassee/);assert.equal(await p.locator('#page-staff').isDisabled(),true);}await enter();
   assert.match(await p.locator('#page-staff').innerText(),/Staff · The 1956 bus boycott/);await p.locator('#page-staff').click();assert.match(await staff().innerText(),/Staff · The 1956 bus boycott/);assert.match(await staff().innerText(),/Mara/);assert.doesNotMatch(await staff().innerText(),/Ellis|Silver/);assert.match(await staff().innerText(),/Standing · no expiry/);await close();
  });
  await check('Cancelling a selection restores access to the explicitly named current Staff',async()=>{
   await select('studio');assert.equal(await p.locator('#page-staff').isDisabled(),true);await p.locator('[data-stay]').click();assert.equal(await p.locator('.page-preview').count(),0);
   assert.equal(await p.locator('#page-staff').isDisabled(),false);await p.locator('#page-staff').click();assert.match(await staff().innerText(),/Staff · The 1956 bus boycott/);assert.match(await staff().innerText(),/Mara/);await close();
  });
  await check('Switching away closes an open helper panel; completed selection shows the new helpers',async()=>{
   await p.locator('#page-staff').click();await p.evaluate(()=>__atlasPage.visit('square'));assert.equal(await staff().count(),0);await enter();await p.locator('#page-staff').click();assert.match(await staff().innerText(),/Staff · Town Square/);assert.match(await staff().innerText(),/Rowan/);assert.doesNotMatch(await staff().innerText(),/Mara|Silver/);await close();
   for(const viewport of [{width:393,height:851},{width:851,height:393},{width:1360,height:900}]){await p.setViewportSize(viewport);assert(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));}
  });
  assert.deepEqual(errors,[]);assert(requests.every(u=>u.startsWith(new URL(process.env.ATLAS_URL||'http://127.0.0.1:8003/').origin)||u.startsWith('data:')));console.log(JSON.stringify({passed,errors}));
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
