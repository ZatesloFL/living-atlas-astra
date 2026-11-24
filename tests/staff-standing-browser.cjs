const completeArrival=require('./arrival-setup.cjs');
const {chromium}=require(process.env.ATLAS_PLAYWRIGHT_MODULE||'playwright-core'),assert=require('node:assert/strict');
(async()=>{
 const b=await chromium.launch({executablePath:'/usr/bin/chromium',headless:true,args:['--no-sandbox']});
 const p=await b.newPage({viewport:{width:524,height:1166},isMobile:true,hasTouch:true});const errors=[],requests=[];let passed=0;
 p.on('pageerror',e=>errors.push(e.message));p.on('request',r=>requests.push(r.url()));
 const check=async(name,fn)=>{await fn();passed++;console.log('PASS '+name);};
 const room=async id=>{await p.locator('#page-places').click();await p.locator('#page-room').selectOption(id);for(let i=0;i<5&&await p.locator('[data-enter]').count();i++)await p.locator('[data-enter]').click();};
 const close=()=>p.locator('.access-overlay:not([hidden]) [data-dialog-close]').click();
 const docent=()=>p.locator('.helper-card').filter({has:p.locator('h3',{hasText:/^Mara$/})});
 try{
  await p.goto((process.env.ATLAS_URL||'http://127.0.0.1:8003/')+'?page&test&ai=local');await p.waitForFunction(()=>window.__atlasPage);await p.evaluate(()=>__atlasPage.staff.ready);
  await p.locator('#setup-form [name=age]').fill('30');await completeArrival(p);await room('boycott');
  await check('Fresh Page startup seeds a standing Docent; answering and keeping an offer write receipts',async()=>{
   assert.equal(await p.evaluate(()=>__atlasPage.staff.actor('docent-silver').expires),null);
   await p.locator('#page-staff').click();await docent().waitFor();assert.match(await docent().innerText(),/look · Standing · no expiry/);
   await p.locator('[data-docent=docent-silver]').click();await p.locator('[data-question=overview]').click();await p.locator('#docent-keep').waitFor();
   assert.match(await p.locator('[data-ai-source]').innerText(),/Simulated · local helper/);await p.locator('#docent-keep').click();
   assert.equal(await p.evaluate(async()=>{const {ROOMS}=await import('./src/data.js');return __atlasPage.access.data.ledgers[ROOMS.boycott.id].at(-1).action;}),'helper_offer_accepted');await close();
  });
  await check('An initialized store with lapsed leases recovers on reload without clearing profile, pins or history',async()=>{
   await p.evaluate(()=>{
    const a=__atlasPage.access,s=a.data.staffState,past=new Date(0).toISOString();delete s.standingDocents;
    // Synthetic legacy snapshot: expire the stored leases without touching the
    // receipt chain. Unit tests separately construct old grants via issue().
    s.helpers.forEach(h=>h.expires=past);a.data.grants.filter(g=>g.kind==='helper'&&!g.revokedAt).forEach(g=>g.expires=past);
    a.pin('boycott',__atlasPage.lens);localStorage.setItem('standing-grant-sentinel','keep');a.persist();
   });
   await p.reload();await p.waitForFunction(()=>window.__atlasPage);await p.evaluate(()=>__atlasPage.staff.ready);
   assert.equal(await p.evaluate(()=>localStorage.getItem('standing-grant-sentinel')),'keep');assert.equal(await p.locator('#page-setup').count(),0);
   assert.ok(await p.evaluate(()=>__atlasPage.access.places(__atlasPage.lens).pins.includes('boycott')));
   assert.equal(await p.evaluate(()=>__atlasPage.staff.actor('docent-silver').expires),null);
   await room('boycott');await p.locator('#page-staff').click();await docent().waitFor();assert.match(await docent().innerText(),/Standing · no expiry/);
   const expired=p.locator('.helper-card[data-helper-state=expired]');assert.equal(await expired.count(),2);
   assert.match(await expired.first().innerText(),/Expired.*Place owner.*Staff → Add a helper/s);assert.equal(await expired.locator('[data-helper-action],[data-docent]').count(),0);
   assert.ok(await p.evaluate(async()=>{const {verifyChain}=await import('./src/ledger.js');return (await Promise.all(Object.values(__atlasPage.access.data.ledgers).map(verifyChain))).every(r=>r.valid);}));await close();
  });
  await check('Owner revocation survives reload; expired and never-granted Places remain distinguishable',async()=>{
   await p.evaluate(()=>__atlasPage.lens.playAs='owner');await p.locator('#page-staff').click();await p.locator('[data-revoke-helper=docent-silver]').click();
   await p.waitForFunction(()=>!document.querySelector('[data-docent=docent-silver]'));await close();
   await p.reload();await p.waitForFunction(()=>window.__atlasPage);await p.evaluate(()=>__atlasPage.staff.ready);await room('boycott');await p.locator('#page-staff').click();await p.locator('.helper-card[data-helper-state=expired]').first().waitFor();assert.equal(await docent().count(),0);await close();
   await room('canopy');await p.locator('#page-staff').click();await p.getByText('No helper has a grant for this Place.').waitFor();assert.equal(await p.locator('.helper-card').count(),0);
   assert.deepEqual(errors,[]);assert.equal(requests.filter(u=>/^https?:/.test(u)&&new URL(u).host!==new URL(p.url()).host).length,0);
  });
  console.log(JSON.stringify({passed,errors,liveCalls:0}));
 }finally{await b.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
