// Shipped-origin browser tests with local assets and intercepted proxy responses.
// No request in this suite reaches Supabase or a provider.
const {chromium}=require(process.env.ATLAS_PLAYWRIGHT_MODULE||'playwright-core');
const assert=require('node:assert/strict');
const {readFile,mkdir}=require('node:fs/promises');
const {resolve}=require('node:path');
const origin='https://zateslofl.github.io',base=origin+'/living-atlas-astra/';
const endpoint='https://ftnxmuenqfqkodizyekk.supabase.co/functions/v1/ai-proxy';
const source='In 1956, Black residents of Tallahassee organized a boycott of the city’s segregated bus service.';
const receiptId='10000000-0000-4000-8000-000000000001';
const success=()=>({proposal:{kind:'answer',room:'boycott',reason:'Permitted public sample excerpts; claims remain to verify.',text:source,citations:['lead']},agentId:'docent-silver',model:'anthropic/browser-fixture',receiptData:{receiptId}});
(async()=>{
 const browser=await chromium.launch({executablePath:process.env.ATLAS_CHROMIUM||'/usr/bin/chromium',headless:true,args:['--no-sandbox','--enable-unsafe-swiftshader']});
 let passed=0;
 async function setup(mode='success',query='',form='page'){
  const context=await browser.newContext({viewport:{width:393,height:851},hasTouch:true,isMobile:true,serviceWorkers:'block'}),p=await context.newPage(),calls=[],errors=[];
  let release;
  p.on('pageerror',e=>errors.push(e.message));
  await context.route('**/*',async route=>{
   const req=route.request(),url=new URL(req.url());
   if(url.origin===origin&&url.pathname.startsWith('/living-atlas-astra/')){
    const path=decodeURIComponent(url.pathname.slice('/living-atlas-astra/'.length))||'index.html',file=resolve(path);
    assert(file.startsWith(process.cwd()+'/'));
    const type=path.endsWith('.js')?'text/javascript':path.endsWith('.css')?'text/css':path.endsWith('.json')?'application/json':path.endsWith('.svg')?'image/svg+xml':'text/html';
    return route.fulfill({status:200,contentType:type,body:await readFile(file)});
   }
   assert(req.url().startsWith(endpoint+'/'),'Unexpected network destination: '+url.origin);
   const headers={'access-control-allow-origin':origin,'access-control-allow-methods':'POST, OPTIONS','access-control-allow-headers':'authorization, content-type','access-control-expose-headers':'Retry-After'};
   if(req.method()==='OPTIONS')return route.fulfill({status:204,headers});
   const body=req.postDataJSON();calls.push({path:url.pathname.split('/').at(-1),body});
   const reply=(status,json,extra={})=>route.fulfill({status,headers:{...headers,...extra},contentType:'application/json',body:JSON.stringify(json)});
   if(mode==='offline')return route.abort('internetdisconnected');
   if(mode==='off')return reply(503,{code:'AI_OFF',message:'AI is off'});
   if(url.pathname.endsWith('/session'))return reply(200,{session:'a'.repeat(64),holder:'b'.repeat(64),expiresAt:new Date(Date.now()+1800000).toISOString()});
   assert.equal(req.headers().authorization,'Bearer '+'a'.repeat(64));
   assert.deepEqual(Object.keys(body.context).sort(),['catalogRevision','lens','placeId','question','visibleBlockIds']);
   assert.equal(body.context.placeId,'boycott');assert(body.context.visibleBlockIds.includes('lead'));assert.equal(body.context.lens.audience,'teen');
   assert(!JSON.stringify(body).includes(source));assert(!JSON.stringify(body).includes('profileName'));
   if(mode==='quota')return reply(429,{code:'RATE_LIMITED'},{'retry-after':'60'});
   if(mode==='rejected')return reply(502,{code:'BAD_PROPOSAL',receiptId,failureClass:'evidence_quote_not_exact'});
   if(mode==='invalid')return reply(200,{...success(),proposal:{...success().proposal,text:'A fabricated account.'}});
   if(mode==='delayed')await new Promise(r=>{release=r;});
   return reply(200,success()).catch(()=>{}); // An intentionally aborted fetch may no longer have a route.
  });
  await p.goto(base+(form==='page'?'?page&test':'?test&safe')+query);
  if(form==='page'){
   await p.waitForFunction(()=>window.__atlasPage);await p.locator('#page-setup [name=age]').fill('30');await p.locator('#page-setup button[type=submit]').click();
   await visit(p,'boycott');await docent(p);
  }else{
   await p.waitForFunction(()=>window.__atlas);await p.locator('[name=age]').fill('30');await p.getByRole('button',{name:/Save profile & enter/}).click();
   await p.waitForFunction(()=>document.getElementById('sheet').hidden);await p.evaluate(()=>__atlas.staffUI.docent('boycott'));
  }
  assert.equal(calls.length,0);
  return {context,p,calls,errors,release:()=>release?.()};
 }
 async function visit(p,room){await p.locator('#page-places').click();await p.locator('#page-room').selectOption(room);for(let i=0;i<5&&await p.locator('[data-enter]').count();i++)await p.locator('[data-enter]').click();}
 async function docent(p){await p.locator('#page-staff').click();await p.locator('[data-docent="docent-silver"]').click();await p.locator('[data-question=overview]').waitFor();}
 const closeDocent=p=>p.locator('.access-overlay:not([hidden]) [data-dialog-close]').click();
 try{
  for(const mode of ['success','off','quota','rejected','offline','invalid','local']){
   const {context,p,calls,errors}=await setup(mode,mode==='local'?'&ai=local':'');
   await p.locator('[data-question=overview]').click();await p.locator('[data-ai-source]').waitFor();
   const expected=mode==='success'?'Live · grounded answer':mode==='local'?'Simulated · local helper':mode==='quota'?'Simulated · live limit reached':'Simulated · live helper unavailable';
   assert.equal(await p.locator('[data-ai-source]').innerText(),expected,mode);
   assert.equal(await p.evaluate(()=>__atlasPage.staff.data.proposals.at(-1).provenance.provider),mode==='success'?'proxy':'simulated');
   if(mode==='local')assert.equal(calls.length,0);
   else if(mode!=='success'){
    const before=calls.length;await p.locator('[data-question=sources]').click();await p.waitForFunction(()=>document.querySelector('[data-ai-source]'));
    assert.equal(await p.locator('[data-ai-source]').innerText(),expected);assert.equal(calls.length,before,'Circuit must not retry generation');
   }else{
    assert.equal(calls.length,2);assert.equal(calls[0].path,'session');assert.equal(calls[1].path,'request');
    await p.locator('#docent-keep').click();assert.match(await p.locator('#docent-keep').innerText(),/Kept/);
    for(const viewport of [{width:393,height:851},{width:851,height:393}]){await p.setViewportSize(viewport);assert(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));}
    await mkdir('work',{recursive:true});await p.setViewportSize({width:393,height:851});await p.screenshot({path:'work/live-docent-portrait.png'});
    await p.reload();await p.waitForFunction(()=>window.__atlasPage);assert.equal(await p.evaluate(()=>__atlasPage.staff.data.proposals.at(-1).provenance.receiptId),receiptId);
   }
   assert.deepEqual(errors,[]);passed++;console.log('PASS '+mode+' provenance and request boundary');await context.close();
  }
  {
   const {context,p,calls,errors}=await setup('success','','3d');await p.locator('[data-question=overview]').click();await p.locator('[data-ai-source]').waitFor();
   assert.equal(await p.locator('[data-ai-source]').innerText(),'Live · grounded answer');assert.equal(calls.length,2);
   assert.equal(await p.evaluate(()=>__atlas.staff.data.proposals.at(-1).provenance.receiptId),receiptId);assert.deepEqual(errors,[]);
   passed++;console.log('PASS 3D live answer shares the same transport and provenance');await context.close();
  }
  for(const change of ['navigate','reopen','lens']){
   const s=await setup('delayed'),{p,context,calls,errors}=s;await p.locator('[data-question=overview]').click();
   while(!calls.some(c=>c.path==='request'))await new Promise(r=>setTimeout(r,10));
   if(change==='lens')await p.evaluate(()=>{__atlasPage.lens.depth='Glance';});
   else {await closeDocent(p);if(change==='navigate')await visit(p,'studio');else await docent(p);}
   s.release();await p.waitForFunction(()=>!document.querySelector('#docent-answer[aria-busy="true"]'));
   assert.equal(await p.evaluate(()=>__atlasPage.staff.data.proposals.length),0,change);
   assert.equal(await p.locator('[data-ai-source]').count(),0,change);assert.equal(calls.filter(c=>c.path==='request').length,1);
   if(change==='lens')assert.match(await p.locator('#docent-answer').innerText(),/view changed/);
   assert.deepEqual(errors,[]);passed++;console.log('PASS stale '+change+' reply discarded');await context.close();
  }
  console.log(JSON.stringify({passed,liveCalls:0}));
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
