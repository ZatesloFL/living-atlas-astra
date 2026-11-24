const {chromium}=require(process.env.ATLAS_PLAYWRIGHT_MODULE||'playwright-core'),assert=require('node:assert/strict');
const completeArrival=require('./arrival-setup.cjs');
(async()=>{
 const browser=await chromium.launch({executablePath:'/usr/bin/chromium',headless:true,args:['--no-sandbox','--enable-unsafe-swiftshader']});
 const page=await browser.newPage({viewport:{width:393,height:851},isMobile:true,hasTouch:true}),base=process.env.ATLAS_URL||'http://127.0.0.1:8007/';let passed=0;const errors=[];page.on('pageerror',e=>errors.push(e.message));
 const check=async(name,fn)=>{await fn();passed++;console.log('PASS '+name);};
 try{
  await page.goto(base+'?page&test&ai=local');await page.locator('#setup-form [name=age]').fill('30');await completeArrival(page);
  await page.evaluate(async()=>{const {ROOMS}=await import('./src/data.js'),p=__atlasPage;p.access.data.presence.push({person:'IDENTITY_CANARY',name:'NAME_CANARY',identity:{display:'anonymous',backing:'verified'},room:ROOMS.civic.id,privacy:'everyone',groups:[],expires:new Date(Date.now()+60000).toISOString()});p.communityUI.open('people');});
  await check('anonymous presentation hides the account and record and has no Follow action',async()=>{
   const card=page.locator('.person-card').filter({hasText:'At Civic table'});assert.match(await card.innerText(),/Anonymous visitor.*account details private.*simulation/s);assert.equal(await card.locator('[data-follow]').count(),0);
   assert(!/NAME_CANARY|IDENTITY_CANARY/.test(await page.locator('#community-body').innerHTML()));assert.equal(await card.locator('[data-join]').count(),1);
  });
  await check('Join rechecks changed privacy without moving the visitor; named follow and privacy remain usable',async()=>{
   const before=await page.evaluate(()=>__atlasPage.room);await page.evaluate(()=>{__atlasPage.access.data.presence.find(p=>p.person==='IDENTITY_CANARY').privacy='nobody';});
   await page.locator('.person-card').filter({hasText:'At Civic table'}).locator('[data-join]').click();assert.equal(await page.evaluate(()=>__atlasPage.room),before);
   await page.locator('.person-card').filter({hasText:'River (sample)'}).locator('[data-follow]').click();assert.match(await page.locator('.person-card').filter({hasText:'River (sample)'}).innerText(),/Following/);
   await page.locator('#presence-privacy').selectOption('nobody');assert.equal(await page.evaluate(()=>__atlasPage.discovery.prefs().privacy),'nobody');assert.deepEqual(errors,[]);
  });
  console.log(JSON.stringify({passed,errors}));
 }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
