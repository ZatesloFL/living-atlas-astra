const completeArrival=require('./arrival-setup.cjs');
const {chromium}=require(process.env.ATLAS_PLAYWRIGHT_MODULE||'playwright-core');
const assert=require('node:assert/strict');
(async()=>{
 const browser=await chromium.launch({executablePath:'/usr/bin/chromium',headless:true,args:['--no-sandbox','--enable-unsafe-swiftshader']});
 const p=await browser.newPage({viewport:{width:524,height:1166},isMobile:true,hasTouch:true}),errors=[];let passed=0;
 p.on('pageerror',e=>errors.push(e.message));
 const check=async(name,fn)=>{await fn();passed++;console.log('PASS '+name);};
 const select=async id=>{await p.locator('#page-places').click();await p.locator('#page-room').selectOption(id);};
 const enter=async()=>{for(let i=0;i<6&&await p.locator('[data-enter]').count();i++)await p.locator('[data-enter]').click();};
 try{
  await p.goto((process.env.ATLAS_URL||'http://127.0.0.1:8006/')+'?page&test&ai=local');await p.waitForFunction(()=>window.__atlasPage);await p.locator('#setup-form [name=age]').fill('30');await completeArrival(p);
  await p.evaluate(async()=>{const {ROOMS}=await import('./src/data.js');ROOMS.canopy.admission={mode:'threshold',minimum:{disturbing:2}};ROOMS.capitol.admission={mode:'filtered',minimum:{disturbing:2}};ROOMS.capitol.blocks.push({id:'filtered-canary',type:'text',importance:'core',body:'NEVER_RENDER_CANARY',content:{disturbing:3}});});
  await check('Page door names the owner threshold and records an exact-Place visit raise before entry',async()=>{
   await select('canopy');for(let i=0;i<5&&!await p.locator('[data-raise-place=canopy]').count();i++)await p.locator('[data-enter]').click();
   assert.match(await p.locator('.page-preview').innerText(),/Entrance threshold.*Disturbing themes ≥ amount 2 · graphicness 2/s);assert.equal(await p.locator('[data-enter]').isDisabled(),true);
   await p.locator('[data-raise-place=canopy] summary').click();await p.locator('[data-raise-place=canopy] [data-raise-submit]').click();await p.waitForFunction(()=>!document.querySelector('[data-enter]')?.disabled);await enter();
   const data=await p.evaluate(()=>({grants:__atlasPage.access.visitGrants,entries:__atlasPage.access.data.ledgers['tallahassee/canopy']}));assert.equal(data.grants[0].state,'active');assert(data.entries.some(e=>e.action==='visit_lens_raised'));
  });
  await check('Filtered admission labels withholding and departure expires the previous exception',async()=>{
   await select('capitol');assert.match(await p.locator('.page-preview').innerText(),/Owner admits a visibly filtered view/);await enter();
   assert.match(await p.locator('#page-article').innerText(),/Filtered view.*withheld/s);assert.doesNotMatch(await p.locator('#page-article').innerText(),/NEVER_RENDER_CANARY/);
   await p.waitForFunction(()=>__atlasPage.access.visitGrants.length===0);assert(await p.evaluate(()=>__atlasPage.access.data.ledgers['tallahassee/canopy'].some(e=>e.action==='visit_lens_expired')));
   await p.screenshot({path:'work/arrival/filtered-page.png'});
  });
  await check('Owner changes admission in the shared Access surface without changing visibility',async()=>{
   await p.evaluate(()=>__atlasPage.lens.playAs='owner');await p.locator('#page-access').click();await p.locator('.owner-admission summary').click();await p.locator('#admission-mode').selectOption('threshold');await p.locator('[data-admission-minimum=disturbing][data-axis=amount]').fill('1');await p.locator('#save-admission').click();
   await p.waitForFunction(()=>__atlasPage.access.data.policies['tallahassee/capitol']?.admission?.mode==='threshold');assert.equal(await p.evaluate(()=>__atlasPage.access.data.policies['tallahassee/capitol'].visibility??'public'),'public');
  });
  assert.deepEqual(errors,[]);console.log(JSON.stringify({passed,errors,liveCalls:0}));
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
