// Page/local-only acceptance on a synthetic profile; no model or source calls.
const {chromium}=require(process.env.ATLAS_PLAYWRIGHT_MODULE||'playwright-core'),assert=require('node:assert/strict'),fs=require('node:fs/promises'),arrival=require('./arrival-setup.cjs');
(async()=>{
 const b=await chromium.launch({executablePath:'/usr/bin/chromium',args:['--no-sandbox']}),p=await b.newPage({viewport:{width:1000,height:750}}),errors=[],outbound=[],proof={mode:'Page, local-only, synthetic profile',answers:[]};
 p.setDefaultTimeout(20000);p.on('pageerror',e=>errors.push(e.message));p.on('request',r=>{if(r.url().includes('.supabase.co/'))outbound.push(r.url());});
 try{
  await p.goto((process.env.ATLAS_URL||'http://127.0.0.1:8012/')+'?page&test&ai=local');await p.locator('[name=age]').fill('34');await arrival(p,{square:false,preset:'Teen'});
  await p.evaluate(()=>__atlasPage.atlasTravel.start('boycott',{choice:'inside',words:true,auto:true,atlasTrip:false}));await p.locator('[data-words-agree],[data-words-filtered]').first().click();await p.waitForFunction(()=>__atlasPage.room==='boycott'&&!__atlasPage.atlasTravel.active&&!__atlasPage.atlasTravel.session);
  for(const question of ['Who led this','Did it work?']){
   await p.evaluate(()=>__atlasPage.staffUI.docent('boycott'));await p.locator('#docent-question').fill(question);await p.locator('#docent-question').press('Enter');await p.locator('[data-ai-source]').waitFor();
   const face=await p.locator('.helper-answer').innerText();assert.match(face,/Simulated · local helper/);assert.match(face,question.startsWith('Who')?/Inter-Civic Council.*Steele/s:/1957/);assert.doesNotMatch(face,/partial evidence|[0-9a-f]{8}-[0-9a-f]{4}/);
   const source=await p.locator('[data-docent-source]').first().getAttribute('data-docent-source');await p.locator('[data-docent-source]').first().click();assert.equal(await p.locator('.access-overlay:not([hidden])').count(),0);assert.equal(await p.locator('[data-block-id="'+source+'"]').isVisible(),true);proof.answers.push({question,face,source,sourceOpened:true});
  }
  await p.locator('#page-content-quick').click();await p.locator('#page-depth').selectOption('Deep');await p.locator('#page-settings-close').click();await p.evaluate(()=>__atlasPage.staffUI.docent('boycott'));await p.locator('[data-question=sources]').click();await p.locator('[data-ai-source]').waitFor();assert.match(await p.locator('.helper-excerpt').innerText(),/May 26.*May 27/);await p.locator('[data-docent-source=memory]').click();assert.equal(await p.locator('[data-block-id=memory]').isVisible(),true);proof.deepPresetOpenedDateDiscrepancy=true;
  assert.deepEqual(errors,[]);assert.deepEqual(outbound,[]);Object.assign(proof,{errors,outbound});await fs.writeFile('lane/evidence/boycott-docent-page-2026-11-28.json',JSON.stringify(proof,null,2)+'\n');console.log('PASS Page local answers and source links, including Deep verification preset');
 }finally{await b.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
