// Real application UI, synthetic profile, replayed real proxy responses: no paid calls.
const {chromium}=require(process.env.ATLAS_PLAYWRIGHT_MODULE||'playwright-core');
const assert=require('node:assert/strict'),fs=require('node:fs/promises'),arrival=require('./arrival-setup.cjs');
(async()=>{
 const fixture=JSON.parse(await fs.readFile('tests/fixtures/docent-proxy-live-boycott-stability.json','utf8'));
 const browser=await chromium.launch({executablePath:'/usr/bin/chromium',args:['--no-sandbox','--enable-unsafe-swiftshader']});
 const p=await browser.newPage({viewport:{width:1100,height:850}}),errors=[],proof={evidenceCommit:fixture.evidenceCommit,edgeFunctionVersion:fixture.edgeFunctionVersion,method:'Desktop Chromium; real proxy response replay, no live model calls; physical phone acceptance remains Nic’s',answers:[]};
 p.setDefaultTimeout(20000);p.on('pageerror',e=>errors.push(e.message));
 try{
  await p.goto((process.env.ATLAS_URL||'http://127.0.0.1:8012/')+'?safe&test&ai=local');
  await p.locator('[name=age]').fill('34');await p.locator('[name=name]').fill('Synthetic Docent reviewer');await arrival(p,{square:false,preset:'Teen'});
  await p.evaluate(()=>__atlas.go('boycott',{choice:'inside',words:true,auto:true,manual:true}));
  for(let n=0;n<8;n++){const agree=p.locator('[data-words-agree],[data-words-filtered]').first();if(!await agree.isVisible())break;await agree.click();}
  await p.waitForFunction(()=>!__atlas.travel.active&&!__atlas.travel.session&&__atlas.state().context.room==='boycott');
  for(const wire of fixture.captures.filter(c=>c.round===1)){
   if(await p.evaluate(()=>__atlas.state().lens.depth)!==wire.depth){
    await p.evaluate(()=>__atlas.close());await p.locator('#lens-button').click();await p.locator('.atlas-record-layer>summary').click();await p.locator('#atlas-inspector').click();await p.locator('[data-preference=depth]').selectOption(wire.depth);await p.locator('#lens-done').click();
   }
   await p.evaluate(async response=>{const {createAI}=await import('./src/ai.js');__atlas.staff.ai=createAI({transport:{eligible:()=>true,request:async()=>structuredClone(response)}});},wire.response);
   await p.evaluate(()=>__atlas.staffUI.docent('boycott'));
   await p.locator('#docent-question').fill(wire.request.context.question);await p.locator('#docent-question').press('Enter');await p.locator('[data-ai-source]').waitFor();
   const face=await p.locator('.helper-answer').innerText();assert.equal(await p.locator('.answer-record').getAttribute('open'),null);
   assert.doesNotMatch(face,/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f-]{23}|anthropic\/|openai\/|"(?:excerpts|blockId|quote)"\s*:/);
   assert(face.includes(wire.clientResult.proposal.text));assert.equal(await p.locator('[data-ai-source]').innerText(),wire.label);
   const names=await p.evaluate(citations=>{const a=__atlas.staff,l=__atlas.state().lens,ctx=a.context(a.actor('docent-silver'),'boycott','answer',l);return citations.map(id=>ctx.blocks.find(b=>b.id===id)?.title??(id==='place-overview'?ctx.place.title:null));},wire.clientResult.proposal.citations);
   for(const name of names){assert(name,'Every citation has a readable source name');assert(face.includes(name));}
   if(wire.request.context.question==='Did it work?')assert.equal(await p.locator('.partial-evidence').count(),0);
   await p.locator('.answer-record summary').click();const inspected=await p.locator('.answer-record').innerText();assert(inspected.includes(wire.response.receiptData.receiptId));assert(inspected.includes(wire.response.model));
   proof.answers.push({question:wire.request.context.question,depth:wire.depth,receipt:wire.response.receiptData.receiptId,face,sourceNames:names,recordClosedInitially:true,recordContainsReceiptAndModel:true});
   await p.locator('.answer-record summary').click();
   if(wire.request.context.question==='Who led this'){await p.setViewportSize({width:393,height:851});await p.screenshot({path:'lane/evidence/boycott-docent-answer-2026-11-28.png'});await p.setViewportSize({width:1100,height:850});}
  }
  assert.deepEqual(errors,[]);proof.errors=errors;
  await fs.writeFile('lane/evidence/boycott-docent-browser-2026-11-28.json',JSON.stringify(proof,null,2)+'\n');
  console.log('PASS boycott answer, named source, closed record, outcome and unsupported-answer UI checks');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
