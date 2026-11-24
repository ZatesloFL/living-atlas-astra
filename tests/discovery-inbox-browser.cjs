const {chromium}=require(process.env.ATLAS_PLAYWRIGHT_MODULE||'playwright-core'),assert=require('node:assert/strict');
const completeArrival=require('./arrival-setup.cjs');
(async()=>{
 const browser=await chromium.launch({executablePath:'/usr/bin/chromium',headless:true,args:['--no-sandbox','--enable-unsafe-swiftshader']});
 const page=await browser.newPage({viewport:{width:393,height:851},isMobile:true,hasTouch:true}),base=process.env.ATLAS_URL||'http://127.0.0.1:8007/';let passed=0;const errors=[];page.on('pageerror',e=>errors.push(e.message));
 const check=async(name,fn)=>{await fn();passed++;console.log('PASS '+name);};
 try{
  await page.goto(base+'?page&test&ai=local');await page.locator('#setup-form [name=age]').fill('30');await completeArrival(page);
  await page.evaluate(async()=>{const {ROOMS}=await import('./src/data.js'),p=__atlasPage;await p.profiles.switchProfile('seed-me');p.lens=p.access.lens({...p.profiles.current(),playAs:'owner'});await p.staff.ready;await p.staff.pendingSamples(p.lens);ROOMS.boycott.ownerId=p.lens.profileId;ROOMS.square.ownerId=p.lens.profileId;p.lens={...p.lens,playAs:'visitor'};p.communityUI.open('board');});
  await check('Discovery opens one inbox across actual owned Places without an owner-role toggle',async()=>{
   await page.locator('[data-community=inbox]').click();await page.locator('.proposal-card').first().waitFor();const titles=await page.locator('.proposal-card h3').allTextContents();assert(titles.some(t=>t.includes('1956')));assert(titles.some(t=>t.includes('Town Square')));assert(titles.every(t=>t.includes('1956')||t.includes('Town Square')));
   assert(await page.locator('.proposal-card').filter({hasText:'Quinn'}).count()>=2);assert.equal(await page.evaluate(()=>__atlasPage.lens.playAs),'visitor');
  });
  await check('Ask why, Approve and Reject each use the existing receipt path and show the operator',async()=>{
   const ids=await page.locator('.proposal-card').filter({hasText:'Quinn'}).evaluateAll(cards=>cards.map(card=>card.dataset.proposal)),first=page.locator('[data-proposal="'+ids[0]+'"]'),second=page.locator('[data-proposal="'+ids[1]+'"]');
   const count=()=>page.evaluate(()=>Object.values(__atlasPage.access.data.ledgers).reduce((n,ledger)=>n+ledger.length,0));
   let before=await count();await first.locator('[data-decision=why]').click();await first.locator('.proposal-explanation').waitFor({state:'visible'});assert.equal(await count(),before+1);assert.match(await first.innerText(),/operated by Nic.*simulation/s);assert.match(await first.locator('.proposal-explanation').innerText(),/receipt [a-f0-9]{64}/);
   before=await count();await first.locator('[data-decision=approve]').click();await page.waitForFunction(id=>document.querySelector('[data-proposal="'+id+'"] .proposal-state')?.textContent==='approved',ids[0]);assert.equal(await count(),before+1);
   before=await count();await second.locator('[data-decision=reject]').click();await page.waitForFunction(id=>document.querySelector('[data-proposal="'+id+'"] .proposal-state')?.textContent==='rejected',ids[1]);assert.equal(await count(),before+1);assert.deepEqual(errors,[]);
  });console.log(JSON.stringify({passed,errors}));
 }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
