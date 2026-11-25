// Explicit, manual synthetic live run. Not part of npm test.
// See lane/reports/2026-11-23-03.md. Never use visitor questions.
if(process.env.ATLAS_ALLOW_LIVE!=='1')throw new Error('Live synthetic call disabled. Set ATLAS_ALLOW_LIVE=1 explicitly.');
const completeArrival=require('../tests/arrival-setup.cjs');
const {chromium}=require(process.env.ATLAS_PLAYWRIGHT_MODULE||'playwright-core');
const {execFileSync}=require('node:child_process');
const {writeFile}=require('node:fs/promises');
const assert=require('node:assert/strict');
// Optional process-scoped trust of an already approved environment proxy CA.
const ca=process.env.ATLAS_PROXY_CA;let pin;
if(ca){const pem=execFileSync('openssl',['x509','-in',ca,'-pubkey','-noout']);const der=execFileSync('openssl',['pkey','-pubin','-outform','DER'],{input:pem});pin=require('node:crypto').createHash('sha256').update(der).digest('base64');}
const mode=process.env.ATLAS_LIVE_CASE||'baseline';
if(!['baseline','typed','unknown','reliability','duet'].includes(mode))throw new Error('Choose baseline, typed, unknown, reliability or duet.');
const output=process.env.ATLAS_LIVE_OUTPUT||'work/asking';require('node:fs').mkdirSync(output,{recursive:true});
const endpoint='https://ftnxmuenqfqkodizyekk.supabase.co/functions/v1/ai-proxy';
const userAgent='Mozilla/5.0 (Linux; Android 14; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/142.0.0.0 Mobile Safari/537.36';
const record={captureType:'real deployed proxy response, synthetic question from a fresh phone-class Chromium browser',mode,startedAt:new Date().toISOString(),url:'https://zateslofl.github.io/living-atlas-astra/?safe&form=3d&room=studio&test',userAgent,viewport:{width:393,height:851},freshStorage:true,networkBridge:false,environmentCertificate:pin?'Supplied environment proxy CA pinned for this disposable Chromium process only; persistent trust store unchanged':'Default browser certificate trust',network:[],captures:[]};
const save=()=>writeFile(output+'/live-'+mode+'.json',JSON.stringify(record,null,2)+'\n');
(async()=>{
 const browser=await chromium.launch({executablePath:'/usr/bin/chromium',headless:true,args:['--no-sandbox','--enable-unsafe-swiftshader',...(pin?['--ignore-certificate-errors-spki-list='+pin]:[])]});
 const tasks=[];
 try{
  const context=await browser.newContext({viewport:record.viewport,isMobile:true,hasTouch:true,userAgent,serviceWorkers:'block'}),p=await context.newPage();p.setDefaultTimeout(35000);
  p.on('response',r=>{if(r.url().startsWith(endpoint+'/'))tasks.push((async()=>{const req=r.request();record.network.push({path:new URL(r.url()).pathname.split('/').at(-1),method:req.method(),status:r.status(),at:new Date().toISOString()});if(r.url()===endpoint+'/request'&&req.method()==='POST')record.captures.push({httpStatus:r.status(),request:req.postDataJSON(),response:await r.json()});await save();})());});
  p.on('requestfailed',r=>{if(r.url().startsWith(endpoint+'/'))record.network.push({path:new URL(r.url()).pathname.split('/').at(-1),failure:r.failure()?.errorText});});
  await p.goto(record.url);await p.waitForFunction(()=>window.__atlas);await p.locator('[name=age]').fill('30');await completeArrival(p,{preset:'Teen'});await p.waitForFunction(()=>document.getElementById('sheet').hidden);
  await p.evaluate(()=>__atlas.staffUI.docent('studio'));await p.locator('[data-question=overview]').click();await p.locator('[data-ai-source]').waitFor();record.studioLabel=await p.locator('[data-ai-source]').innerText();assert.equal(record.studioLabel,'Simulated · local helper');assert.equal(record.network.length,0);await p.evaluate(()=>__atlas.close());
  await p.evaluate(()=>__atlas.go('boycott',{choice:'inside'}));for(let i=0;i<8&&await p.locator('[data-preview]').count();i++){await p.locator('[data-preview]').first().click();await p.locator('[data-confirm]').click();}await p.locator('#travel-go').click();await p.waitForFunction(()=>!__atlas.travel.active);assert.equal(await p.evaluate(()=>atlasStatus().scene),'hall:boycott');
  await p.evaluate(()=>__atlas.staffUI.docent('boycott'));
  const questions=mode==='duet'?[...Array(5).fill('What bus service did residents boycott?'),'What is this hall about?','What is the airspeed of a swallow?']:mode==='reliability'?[...Array(5).fill('What bus service did residents boycott?'),'What is the airspeed of a swallow?']:[mode==='typed'?'What bus service did residents boycott?':'What is the price of a ticket to Mars?'];record.runs=[];
  for(const [index,question] of questions.entries()){
   // Same holder and session throughout. Respect the unchanged 4/minute limit;
   // these are six planned asks, never an automatic retry of a failed answer.
   if(index)await new Promise(resolve=>setTimeout(resolve,20000));
   if(mode==='baseline')await p.locator('[data-question=overview]').click();else{await p.locator('#docent-question').fill(question);await p.locator('#docent-ask').click();}
   await p.locator('[data-ai-source]').waitFor();record.label=await p.locator('[data-ai-source]').innerText();record.offer=await p.evaluate(()=>__atlas.staff.data.proposals.at(-1));record.scene=await p.evaluate(()=>atlasStatus().scene);
   const unknown=mode==='unknown'||(mode==='reliability'&&index===5)||(mode==='duet'&&index===6),run={index:index+1,question:mode==='baseline'?'What is this Place?':question,label:record.label,offer:record.offer};record.runs.push(run);await save();console.log(JSON.stringify({run:run.index,label:run.label,receipt:run.offer?.provenance?.receiptId}));
   assert.equal(record.label,'Live · grounded answer');assert.equal(record.offer.provenance.provider,'proxy');
   if(unknown)assert.equal(record.offer.proposal.text,"I don't know from the blocks available in this view.");else assert(record.offer.proposal.citations.length>0);
  }
  await p.screenshot({path:output+'/live-'+mode+'.png'});
  record.passed=true;
 }catch(e){record.error=e.message;throw e;}finally{await Promise.allSettled(tasks);await save();console.log(JSON.stringify({case:mode,passed:record.passed??false,label:record.label,receipts:record.captures.map(c=>({status:c.httpStatus,id:c.response.receiptData?.receiptId??c.response.receiptId,failureClass:c.response.failureClass??null}))}));await browser.close();}
})().catch(e=>{console.error(e.message);process.exitCode=1;});
