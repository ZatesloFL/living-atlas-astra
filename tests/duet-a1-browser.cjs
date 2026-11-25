const {chromium}=require(process.env.ATLAS_PLAYWRIGHT_MODULE||'playwright-core');
const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
(async()=>{const browser=await chromium.launch({executablePath:'/usr/bin/chromium',args:['--no-sandbox','--enable-unsafe-swiftshader']});const p=await browser.newPage();const errors=[];p.on('pageerror',e=>errors.push(e.message));try{
 await p.goto((process.env.ATLAS_URL||'http://127.0.0.1:8011/')+'?safe&test&ai=local');
 await p.locator('[name=age]').fill('34');await p.locator('#setup-form button').click();await p.locator('#arrival-interview-next').click();
 assert.equal(await p.locator('#arrival-preset').inputValue(),'');assert.equal(await p.locator('#arrival-lens output').allTextContents().then(v=>v.every(x=>x==='Not set')),true);
 await p.locator('#arrival-lens-next').click();await p.locator('[name=arrival-start][value=scratch]').check();await p.locator('#arrival-create').click();await p.waitForFunction(()=>window.__atlas&&!document.querySelector('#sheet:not([hidden])'));
 await p.locator('#lens-button').click();const first=await p.locator('.lens-assurance').innerText();assert.equal(first,'Your account is not yet age-verified. Adult-range doors stay closed until it is.');assert.equal(await p.locator('[data-preset][aria-pressed=true]').count(),0);
 const before=await p.evaluate(()=>__atlas.state().lens);assert.equal(before.preset,null);assert.equal(before.limits.disturbing.amount,null);
 await p.locator('#sheet-close').click();await p.reload();await p.waitForFunction(()=>window.__atlas&&document.querySelector('#loading').classList.contains('done'));await p.locator('#lens-button').click();assert.equal(await p.locator('[data-preset][aria-pressed=true]').count(),0);assert.deepEqual(errors,[]);
 await fs.mkdir('lane/evidence',{recursive:true});await fs.writeFile('lane/evidence/duet-a1-2026-11-25.json',JSON.stringify({firstLine:first,arrivalPreset:'',selectedPresetCount:0,reloadedUnset:true,limits:before.limits,errors},null,2)+'\n');console.log('PASS fresh 34-year-old profile stays unset through arrival, claim and reload');
 }finally{await browser.close();}})().catch(e=>{console.error(e);process.exitCode=1;});
