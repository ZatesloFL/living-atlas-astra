const {chromium}=require(process.env.ATLAS_PLAYWRIGHT_MODULE||'playwright-core');
const assert=require('node:assert/strict');
const fs=require('node:fs/promises');

(async()=>{
 const {ProfileStore,STORAGE_KEY}=await import('../src/profiles.js');
 const values=new Map(),storage={getItem:key=>values.get(key),setItem:(key,value)=>values.set(key,value)};
 const legacy=new ProfileStore(()=>storage);
 await legacy.setup({name:'My visit',age:40,preset:'Teen',depth:'Deep',form:'3d',display:'pseudonym'});
 legacy.preferences({...legacy.current(),stylePreset:'Gallery',acceptedLayers:['saved-layer']});
 const original=structuredClone(legacy.active()),home='home/'+original.id;
 const browser=await chromium.launch({executablePath:process.env.ATLAS_CHROMIUM||'/usr/bin/chromium',headless:true,args:['--no-sandbox','--enable-unsafe-swiftshader']});
 const page=await browser.newPage({viewport:{width:412,height:915},hasTouch:true,isMobile:true});
 const errors=[],requests=[],checks=[];let receiptEvidence;
 page.on('pageerror',error=>errors.push(error.message));page.on('request',request=>requests.push(request.url()));
 await page.route('**/functions/v1/**',route=>route.abort());
 await page.addInitScript(({key,value})=>{if(!localStorage.getItem(key))localStorage.setItem(key,value);},{key:STORAGE_KEY,value:storage.getItem(STORAGE_KEY)});
 const check=async(name,fn)=>{await fn();checks.push(name);console.log('PASS '+name);};
 const manage=async()=>{if(await page.locator('#sheet').isVisible())await page.locator('#sheet-close').click();await page.locator('#profile-chip').click();};
 const state=()=>page.evaluate(()=>({profile:JSON.parse(localStorage.getItem('living-atlas.profiles.v4')),arrival:JSON.parse(localStorage.getItem('living-atlas.arrival.v1'))}));
 const ready=()=>page.waitForFunction(()=>window.__atlas&&document.querySelector('#loading').classList.contains('done'));
 try{
  await page.goto((process.env.ATLAS_URL||'http://127.0.0.1:8008/')+'?safe&form=3d&room=studio&test&ai=local');await ready();
  await check('An old My visit profile gets no automatic Arrival; Manage offers a dismissible invitation',async()=>{
   assert.equal(await page.locator('#setup-form').count(),0);assert.equal((await state()).arrival,null);
   await manage();await page.locator('#profile-arrival').click();
   assert.match(await page.locator('#sheet-content').innerText(),/My visit/);
   assert.match(await page.locator('#sheet-content').innerText(),/Unverified · age unknown/);
   assert.equal(await page.locator('[name=age]').count(),0);assert(await page.locator('#sheet-close').isVisible());
   await page.locator('#sheet-close').click();assert.equal((await state()).arrival,null);
   await page.reload();await ready();assert.equal(await page.locator('#setup-form').count(),0);
  });
  await check('The existing profile completes the same interview, Lens, proposal and starter claim path, landing at home',async()=>{
   await manage();await page.locator('#profile-arrival').click();await page.locator('#setup-form button').click();
   await page.locator('[name=hobbies]').fill('Reading');await page.locator('[name=sources]').fill('https://example.org/synthetic-reading');
   await page.locator('#arrival-interview-next').click();assert.equal(await page.locator('[name=depth]').inputValue(),'Deep');
   await page.locator('#arrival-lens-next').click();await page.locator('[data-proposal-choice=keep]').click();
   await page.locator('#arrival-create').click();await page.waitForFunction(home=>atlasStatus().room===home&&document.querySelector('#sheet').hidden,home);
   const saved=await state(),profile=saved.profile.profiles.find(p=>p.id===original.id);
   assert.equal(saved.profile.activeId,original.id);assert.equal(saved.profile.profiles.length,legacy.profiles.length);
   for(const key of ['name','identity','age','depth','stylePreset','acceptedLayers'])assert.deepEqual(profile[key],original[key],key);
   assert.equal(profile.homePlaceId,home);assert.equal(saved.arrival.starters[0].holderId,original.id);
   assert.equal(saved.arrival.starters[0].projection.rooms.length,3);
   assert.equal(saved.arrival.starters[0].projection.rooms[0].pieces.length,1);
   assert.deepEqual(saved.arrival.receipts.map(r=>r.action),['interview_recorded','starter_proposals_offered','starter_proposal_decided','starter_claimed_local']);
   assert.equal(saved.profile.entries.filter(r=>r.action==='profile_created').length,1);
   assert.equal(saved.profile.entries.filter(r=>r.action==='profile_starter_attached').length,1);
   const valid=await page.evaluate(async()=>{const {verifyChain}=await import('./src/ledger.js');return (await verifyChain(JSON.parse(localStorage.getItem('living-atlas.arrival.v1')).receipts)).valid&&(await verifyChain(JSON.parse(localStorage.getItem('living-atlas.profiles.v4')).entries)).valid;});assert(valid);
   receiptEvidence={syntheticProfileId:original.id,home,arrivalReceipts:saved.arrival.receipts.map(r=>({action:r.action,id:'arrival:'+r.hash})),profileAttachment:saved.profile.entries.at(-1).hash};
  });
  await check('Your first rooms enters the Drive room through its door and retains the workshop link',async()=>{
   await page.evaluate(home=>__atlas.pick(home),home);
   assert.match(await page.locator('#sheet-content').innerText(),/Your first rooms/);
   assert.equal(await page.locator('[data-arrival-place="'+home+'/workshop"]').count(),1);
   await page.locator('[data-arrival-place="'+home+'/drive"]').click();await page.locator('#edge-enter').click();
   await page.waitForFunction(home=>atlasStatus().room===home+'/drive',home);
   await page.evaluate(home=>__atlas.pick(home+'/drive'),home);await page.locator('#info-page').click();
   assert.match(await page.locator('#page-article').innerText(),/Archive not synced/);
   assert.match(await page.locator('#page-article').innerText(),/synthetic-reading/);
   await page.locator('#page-to-3d').click();
  });
  await check('Claimed profiles are not offered another starter, including after reload; other unclaimed profiles still are',async()=>{
   await manage();assert.equal(await page.locator('#profile-arrival').count(),0);await page.locator('#sheet-close').click();
   await page.reload();await ready();await manage();assert.equal(await page.locator('#profile-arrival').count(),0);
   assert.equal((await state()).arrival.starters.length,1);
   await page.locator('#profile-name').fill('Synthetic second view');await page.locator('#profile-save-as').click();
   await page.locator('#profile-arrival').waitFor();assert.equal((await state()).profile.profiles.at(-1).homePlaceId,undefined);
  });
  await check('An existing profile can choose Page during Arrival and reaches its own Drive there',async()=>{
   await page.locator('#profile-arrival').click();await page.locator('#setup-form button').click();await page.locator('#arrival-interview-next').click();
   await page.locator('summary').filter({hasText:'Hard locks and reading preferences'}).click();await page.locator('[name=form]').selectOption('page');
   await page.locator('#arrival-lens-next').click();await page.locator('[name=arrival-start][value=scratch]').check();await page.locator('#arrival-create').click();
   await page.locator('#page-article').waitFor();const saved=await state(),second=saved.profile.activeId,secondHome='home/'+second;
   assert.notEqual(second,original.id);assert.equal(saved.arrival.starters.length,2);
   assert.equal(await page.evaluate(()=>__atlasPage.room),secondHome);
   await page.locator('[data-arrival-place="'+secondHome+'/drive"]').click();
   for(let i=0;i<8&&await page.locator('[data-enter]').count();i++)await page.locator('[data-enter]').click();
   assert.equal(await page.evaluate(()=>__atlasPage.room),secondHome+'/drive');
  });
  assert.deepEqual(errors,[]);assert.equal(requests.some(url=>url.includes('/functions/v1/')),false);
  const result={passed:checks.length,checks,errors,liveCalls:0,receiptEvidence,note:'Synthetic local profiles; physical phone appearance and fps are unverified.'};
  await fs.mkdir('work/arrival-existing',{recursive:true});await fs.writeFile('work/arrival-existing/browser-results.json',JSON.stringify(result,null,2)+'\n');
  console.log(JSON.stringify({passed:checks.length,errors,liveCalls:0}));
 }catch(error){console.error(await page.evaluate(()=>document.body.innerText.slice(-4000)));throw error;}finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
