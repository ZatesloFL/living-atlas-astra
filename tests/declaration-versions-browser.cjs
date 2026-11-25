const {chromium}=require(process.env.ATLAS_PLAYWRIGHT_MODULE||'playwright-core');
const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const completeArrival=require('./arrival-setup.cjs');

(async()=>{
 const browser=await chromium.launch({executablePath:process.env.ATLAS_CHROMIUM||'/usr/bin/chromium',headless:true,args:['--no-sandbox','--enable-unsafe-swiftshader']});
 const page=await browser.newPage({viewport:{width:393,height:851},hasTouch:true,isMobile:true});
 const errors=[],calls=[],results=[];
 page.on('pageerror',error=>errors.push(error.message));page.on('request',request=>{if(request.url().includes('/functions/v1/'))calls.push(request.url());});
 await page.route('**/functions/v1/**',route=>route.abort());
 const openSearch=async()=>{await page.locator('#page-discover').click();await page.locator('[data-community=search]').click();};
 const declared=table=>table.locator('tbody tr').evaluateAll(rows=>Object.fromEntries(rows.map(row=>[row.querySelector('th').textContent,[...row.querySelector('td').textContent.matchAll(/\d+/g)].map(match=>Number(match[0]))])));
 try{
  await page.goto((process.env.ATLAS_URL||'http://127.0.0.1:8009/')+'?page&test&ai=local');
  await page.locator('#setup-form [name=age]').fill('30');await completeArrival(page);
  await page.evaluate(async()=>{await __atlasPage.profiles.switchProfile('seed-me');});
  for(const [amount,name] of [[1,'Documentary'],[2,'Immersive']]){
   // The same synthetic visitor changes only this Lens dial between the checks.
   await page.evaluate(amount=>{const p=__atlasPage,lens=p.profiles.current();lens.limits.disturbing={amount,graphicness:1};p.experienceChanged(p.access.lens(lens));},amount);
   await openSearch();
   await page.locator('#discovery-words').fill('boycott');await page.locator('#discovery-search>button').click();
   const card=page.locator('[data-result="place:tallahassee/1956"]');
   const chips=await card.locator('.declaration-chips li').evaluateAll(items=>Object.fromEntries(items.map(item=>[item.querySelector('span').textContent,[...item.querySelector('strong').textContent.matchAll(/\d+/g)].map(match=>Number(match[0]))])));
   assert.deepEqual(chips['Disturbing themes'],[amount,1]);
   const expected=new RegExp('the '+name+' version');
   assert.match(await card.locator(':scope > .declaration-version').innerText(),expected);
   await card.locator('.index-readings>summary').click();
   const cardTable=await declared(card.locator('.standing-table'));
   assert.deepEqual(cardTable,chips);assert.match(await card.locator('.index-readings .declaration-version').innerText(),expected);
   await card.locator('[data-index-reading]').click();
   const record=page.locator('.access-overlay:visible').filter({has:page.locator('#standing-measure')});
   await record.locator('.standing-table').waitFor();const standingTable=await declared(record.locator('.standing-table'));
   assert.equal(await page.locator('.access-overlay:visible').count(),1);
   assert.deepEqual(standingTable,chips);assert.match(await record.locator('.declaration-version').innerText(),expected);
   await record.locator('[data-dialog-close]').click();
   await openSearch();
   await card.locator('[data-index-enter]').click();
   for(let i=0;i<8&&await page.locator('[data-enter]').count();i++)await page.locator('[data-enter]').click();
   await page.waitForFunction(()=>__atlasPage.room==='boycott'&&!__atlasPage.pending);
   const delivered=await page.evaluate(async()=>{const {ROOMS}=await import('./src/data.js'),{viewRoom}=await import('./src/audience.js');const room=viewRoom(ROOMS.boycott,__atlasPage.lens);return {version:room.version.id,scores:room.content};});
   assert.equal(delivered.version,name.toLowerCase());assert.deepEqual(delivered.scores.disturbing,{amount,graphicness:1});
   const hall=page.locator('#page-article > .article-main .standing-card').first();
   await hall.locator('summary').click();assert.deepEqual(await declared(hall.locator('.standing-table')),chips);
   assert.match(await hall.locator('.declaration-version').innerText(),expected);
   results.push({lens:{disturbing:{amount,graphicness:1}},version:delivered.version,chips,cardTable,standingTable,delivered});
   console.log('PASS '+name+': all six chip pairs equal both Declared columns and the entered hall view; labels agree');
  }
  assert.deepEqual(errors,[]);assert.deepEqual(calls,[]);
  await fs.mkdir('work/declaration-versions',{recursive:true});
  await fs.writeFile('work/declaration-versions/browser-results.json',JSON.stringify({passed:results.length,results,errors,liveCalls:calls.length,physicalPhone:'Not tested'},null,2)+'\n');
  console.log(JSON.stringify({passed:results.length,errors,liveCalls:calls.length}));
 }catch(error){console.error(await page.locator('body').innerText().then(text=>text.slice(-4000)));throw error;}finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
