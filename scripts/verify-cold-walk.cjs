// Fresh root URL, visible controls and keyboard walking only. No test hooks,
// Places list, coordinate setters or programmatic travel. Never asks live AI.
const {chromium}=require(process.env.ATLAS_PLAYWRIGHT_MODULE||'playwright-core');
const {mkdir,writeFile}=require('node:fs/promises');
const assert=require('node:assert/strict');
(async()=>{
 await mkdir('work/reliability',{recursive:true});
 const browser=await chromium.launch({executablePath:'/usr/bin/chromium',headless:true,args:['--no-sandbox','--enable-unsafe-swiftshader']});
 const p=await browser.newPage({viewport:{width:1000,height:760}}),record={url:process.env.ATLAS_URL||'http://127.0.0.1:8003/',freshStorage:true,steps:[],errors:[],proxyRequests:0};p.setDefaultTimeout(45000);
 p.on('pageerror',e=>record.errors.push(e.message));p.on('request',r=>{if(r.url().includes('/functions/v1/ai-proxy'))record.proxyRequests++;});
 const step=async name=>{record.steps.push({name,status:await p.evaluate(()=>window.atlasStatus?.()),prompt:await p.locator('#edge-prompt').innerText()});await p.screenshot({path:'work/reliability/cold-'+record.steps.length+'.png'});console.log(name,JSON.stringify(record.steps.at(-1).status));};
 const walk=async(key,axis,target,direction)=>{await p.keyboard.down(key);try{await p.waitForFunction(([axis,target,direction])=>(atlasStatus().position[axis]-target)*direction>=0,[axis,target,direction],{timeout:45000});}finally{await p.keyboard.up(key);}await p.waitForTimeout(350);};
 const confirm=async()=>{for(let i=0;i<6&&await p.locator('[data-preview]').count();i++){await p.locator('[data-preview]').first().click();await p.locator('[data-confirm]').click();}};
 const arrive=async()=>{await p.locator('#travel-go').click();await p.waitForFunction(()=>document.getElementById('travel-fade').hidden);};
 try{
  await p.goto(record.url);await p.waitForFunction(()=>window.atlasStatus?.().mode==='3d');await p.getByText('Make yourself at home',{exact:true}).waitFor();assert.equal(await p.evaluate(()=>typeof window.__atlas),'undefined');
  assert.match(await p.locator('#sheet').innerText(),/Make yourself at home/);await step('1. Root → local profile setup');
  await p.locator('[name=age]').fill('30');await p.getByRole('button',{name:/Save profile & enter/}).click();await p.waitForFunction(()=>document.getElementById('sheet').hidden);assert.equal(await p.evaluate(()=>atlasStatus().scene),'square');await step('2. Save profile → Town Square');
  await p.mouse.click(700,650);await walk('w','z',1,-1);await walk('a','x',-6.4,-1);await walk('w','z',-2,-1);
  await p.mouse.move(700,350);await p.mouse.down();await p.mouse.move(307.3,350,{steps:20});await p.mouse.up();await p.waitForFunction(()=>!document.getElementById('edge-prompt').hidden&&document.getElementById('edge-prompt').textContent.includes('Tallahassee'));await step('3. Walk left around the fountain to the Tallahassee portal');
  await p.locator('#edge-prompt').click();await p.locator('#edge-enter').click();await confirm();await step('4. Confirm the History crossing and arrival');await arrive();assert.equal(await p.evaluate(()=>atlasStatus().scene),'history');await step('5. Arrive in History Quarter');
  await p.mouse.click(700,650);await walk('w','z',2.2,-1);await walk('d','x',7,1);await walk('w','z',0,-1);await walk('d','x',9,1);
  await p.waitForFunction(()=>!document.getElementById('edge-prompt').hidden&&document.getElementById('edge-prompt').textContent.includes('Enter'));await step('6. Walk right through the tree gap to the boycott hall door');
  await p.locator('#edge-prompt').click();assert.equal(await p.locator('#sheet-content button').first().getAttribute('id'),'hall-enter');await p.locator('#hall-enter').click();await confirm();assert.equal(await p.locator('#travel-arrival').inputValue(),'inside');await step('7. Enter → review the hall doorway → Inside arrival');await arrive();assert.equal(await p.evaluate(()=>atlasStatus().scene),'hall:boycott');assert.equal(await p.evaluate(()=>atlasStatus().room),'boycott');await step('8. Hall aisle, five exhibit bays');
  assert.deepEqual(record.errors,[]);assert.equal(record.proxyRequests,0);record.passed=true;
 }catch(error){record.error=error.message;await step('Stopped');throw error;}finally{await writeFile('work/reliability/cold-walk.json',JSON.stringify(record,null,2)+'\n');await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
