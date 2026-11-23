const {chromium}=require(process.env.ATLAS_PLAYWRIGHT_MODULE||'playwright-core');
const assert=require('node:assert/strict');
(async()=>{
 const browser=await chromium.launch({executablePath:'/usr/bin/chromium',headless:true,args:['--no-sandbox','--enable-unsafe-swiftshader']});
 const p=await browser.newPage({viewport:{width:524,height:1166},hasTouch:true,isMobile:true});
 const errors=[],requests=[];let passed=0;
 p.on('pageerror',e=>errors.push(e.message));p.on('request',r=>requests.push(r.url()));
 const check=async(name,fn)=>{await fn();passed++;console.log('PASS '+name);};
 const room=async id=>{await p.locator('#page-places').click();await p.locator('#page-room').selectOption(id);for(let i=0;i<5&&await p.locator('[data-enter]').count();i++)await p.locator('[data-enter]').click();};
 const depth=async value=>{await p.locator('#page-content-quick').click();await p.locator('#page-depth').selectOption(value);await p.locator('#page-settings-close').click();};
 const top=async id=>p.locator(`[data-block-id="${id}"]`).evaluate(e=>e.getBoundingClientRect().top);
 const readAt=async id=>{
  await p.locator(`[data-block-id="${id}"]`).evaluate(e=>scrollTo(0,scrollY+e.getBoundingClientRect().top-90));
  await p.waitForFunction(()=>document.querySelector('.page-lens-bar').classList.contains('compact'));
  // Wait for the declared compact-bar transition, not network or app work.
  await p.locator('.page-lens-bar').evaluate(e=>Promise.all(e.getAnimations().map(a=>a.finished)));
  await p.locator(`[data-block-id="${id}"]`).evaluate(e=>scrollTo(0,scrollY+e.getBoundingClientRect().top-90));
 };
 try{
  await p.goto((process.env.ATLAS_URL||'http://127.0.0.1:8003/')+'?page&test&ai=local');
  await p.waitForFunction(()=>window.__atlasPage);
  await p.locator('#page-setup [name=age]').fill('30');await p.locator('#page-setup button[type=submit]').click();await room('boycott');
  await check('Reading components have a bounded measure, real citation list, related cards and sample credits',async()=>{
   await depth('Deep');
   for(const selector of ['.article-infobox','.article-timeline','blockquote','.article-map','.geo-note','.article-citations','.article-related'])assert.ok(await p.locator(selector).count(),selector);
   assert.equal(await p.locator('.article-citations>li').count(),3);assert.equal(await p.locator('.article-related .related-room').count(),2);
   assert.equal(await p.locator('[data-kit]').count(),5);assert.equal(await p.locator('.citation-status').filter({hasText:'to verify'}).count(),3);
   assert.match(await p.locator('.article-hero-image figcaption').innerText(),/Sample media.*Generated illustration.*Source not synced/s);
   for(const selector of ['[data-block-id=lead]>p','.article-infobox dd','.article-citation','.article-map p','.kit-transcript'])assert.ok(await p.locator(selector).first().evaluate(e=>parseFloat(getComputedStyle(e).fontSize)>=18),selector);
   assert.ok((await p.locator('.article-main').boundingBox()).width<=720);
   const img=await p.locator('.article-hero-image img').boundingBox();assert.ok(Math.abs(img.width/img.height-720/440)<.01);
  });
  await check('Depth changes keep the visible paragraph anchored and an expanded transcript open',async()=>{
   await depth('Standard');await p.locator('[data-block-id=film] details summary').click();await readAt('timeline');const before=await top('timeline');
   await p.locator('#page-depth-quick').click();
   assert.match(await p.locator('#page-depth-quick').innerText(),/Deep/);
   assert.ok(Math.abs(await top('timeline')-before)<3,`timeline moved from ${before} to ${await top('timeline')}`);
   assert.equal(await p.locator('[data-block-id=film] details').evaluate(e=>e.open),true);
   assert.equal(await p.evaluate(()=>document.activeElement.id),'page-depth-quick');
  });
  await check('Removing the current detail anchors the next readable block; sheet focus returns to its opener',async()=>{
   await readAt('route-map');const before=await top('route-map');
   await p.locator('#page-content-quick').click();await p.locator('#page-depth').focus();await p.locator('#page-depth').selectOption('Standard');
   assert.equal(await p.evaluate(()=>document.activeElement.id),'page-depth');assert.equal(await p.locator('#page-settings-dialog').evaluate(e=>e.open),true);
   await p.locator('#page-settings-close').click();await p.waitForFunction(()=>document.activeElement.id==='page-content-quick');
   assert.equal(await p.locator('[data-block-id=route-map]').count(),0);
   assert.ok(Math.abs(await top('outcomes-heading')-before)<3,`next heading moved to ${await top('outcomes-heading')}`);
   await p.locator('#page-content-quick').click();await p.keyboard.press('Escape');await p.waitForFunction(()=>document.activeElement.id==='page-content-quick');
  });
  await check('Late and failed hero media preserve reading position and expose truthful fallback state',async()=>{
   await p.route('**/test-hero.svg',route=>route.fulfill({contentType:'image/svg+xml',body:'<svg xmlns="http://www.w3.org/2000/svg" width="720" height="440"><rect width="720" height="440" fill="#376454"/></svg>'}));
   await readAt('timeline');const before=await top('timeline');
   await p.evaluate(async()=>{const {contentStore}=await import('./src/content.js');window.heroLoad=contentStore.load('boycott','archive-image',()=>new Promise(resolve=>window.finishHero=resolve));});
   assert.match(await p.locator('.article-hero-image figcaption').innerText(),/Hero media is arriving/);assert.ok(Math.abs(await top('timeline')-before)<3);
   await p.evaluate(async()=>{finishHero({reps:{image:'./test-hero.svg',alt:'Synthetic generated fixture',credit:'Test illustration by Living Atlas'}});await heroLoad;});
   assert.match(await p.locator('.article-hero-image img').getAttribute('src'),/test-hero.svg/);assert.match(await p.locator('.article-hero-image figcaption').innerText(),/Test illustration/);assert.ok(Math.abs(await top('timeline')-before)<3);
   await p.evaluate(async()=>{const {contentStore}=await import('./src/content.js');await contentStore.load('boycott','archive-image',()=>Promise.reject(new Error('Synthetic failure')));});
   assert.match(await p.locator('.article-hero-image figcaption').innerText(),/Hero media is unavailable/);assert.match(await p.locator('.article-hero-image img').getAttribute('src'),/^data:image/);assert.ok(Math.abs(await top('timeline')-before)<3);
   await p.evaluate(async()=>{const {contentStore}=await import('./src/content.js');contentStore.overrides.delete('boycott:archive-image');contentStore.tokens.delete('boycott:archive-image');contentStore.emit('boycott');});
  });
  await check('Margin notes stay beside the article, adapt on rotation and retain deliberate expansion through rerenders',async()=>{
   await p.locator('#page-layers-quick').click();await p.locator('[data-layer-mode]').selectOption('Vouched');await p.locator('#page-settings-close').click();
   await p.setViewportSize({width:1360,height:900});await p.waitForFunction(()=>document.querySelector('.layer-notes').open);await readAt('timeline');
   const main=await p.locator('.article-main').boundingBox(),note=await p.locator('.layer-notes').boundingBox(),bar=await p.locator('.page-lens-bar').boundingBox();
   assert.ok(note.x>=main.x+main.width+20);assert.ok(note.y>=bar.y+bar.height);assert.ok(note.y<800);
   assert.equal(await p.locator('.layer-notes').evaluate(e=>getComputedStyle(e).position),'static');
   await p.locator('.layer-notes summary').click();await p.locator('#page-depth-quick').click();assert.equal(await p.locator('.layer-notes').evaluate(e=>e.open),false);
   await p.setViewportSize({width:524,height:1166});await p.waitForFunction(()=>!document.querySelector('.layer-notes').open);
   await p.locator('.layer-notes summary').click();await p.locator('#page-content-quick').click();await p.locator('#page-depth').selectOption('Deep');await p.locator('#page-settings-close').click();assert.equal(await p.locator('.layer-notes').evaluate(e=>e.open),true);
   await p.locator('[data-layer=boycott-detail]').click();await p.locator('#layer-integrate').click();await p.locator('.access-sheet header button').last().click();
   await p.locator('.page-layer-note summary').first().click();await p.locator('#page-content-quick').click();await p.locator('#page-depth').selectOption('Standard');await p.locator('#page-settings-close').click();assert.equal(await p.locator('.page-layer-note').first().evaluate(e=>e.open),true);
  });
  await check('Textbook hero and structured references follow audience, Depth and Trust filters',async()=>{
   await p.locator('#page-content-quick').click();await p.locator('#page-lens').selectOption('Kids');await p.locator('#page-settings-close').click();
   assert.match(await p.locator('.article-dek').innerText(),/A boycott means/);assert.equal(await p.locator('[data-kit]').count(),3);
   assert.equal(await p.locator('.article-related').count(),0);assert.equal(await p.locator('.article-citations>li').count(),1);
   await p.locator('#page-content-quick').click();await p.locator('#page-lens').selectOption('Teen');await p.locator('#page-depth').selectOption('Deep');if(!await p.locator('.page-lens-more').evaluate(e=>e.open))await p.locator('.page-lens-more summary').click();await p.locator('#page-trust').selectOption('Academic');await p.locator('#page-settings-close').click();
   assert.equal(await p.locator('.article-citations').count(),0);assert.equal(await p.locator('.article-related').count(),0);assert.equal(await p.locator('[data-kit]').count(),0);
   assert.doesNotMatch(await p.locator('.article-hero-image figcaption').innerText(),/real archive to connect/);
   await p.locator('#page-content-quick').click();if(!await p.locator('.page-lens-more').evaluate(e=>e.open))await p.locator('.page-lens-more summary').click();await p.locator('#page-trust').selectOption('Author');await p.locator('#page-settings-close').click();
  });
  await check('Current-room and view-only previews withhold hero, layers and geo until consent; hard limits still hide',async()=>{
   await room('lab');
   await p.evaluate(async()=>{const {ROOMS}=await import('./src/data.js');window.savedLab=structuredClone(ROOMS.lab);ROOMS.lab.blocks[0].body='SYNTHETIC PREVIEW CONTENT';ROOMS.lab.geo={lat:1,lng:1,note:'SYNTHETIC GEO'};ROOMS.lab.content.disturbing=2;ROOMS.lab.measured.disturbing=2;__atlasPage.lens.limits.disturbing=0;__atlasPage.lens.hard.disturbing=null;__atlasPage.changed();});
   assert.equal(await p.locator('.page-preview').count(),1);assert.equal(await p.locator('.article-hero').count(),0);assert.equal(await p.locator('.item-experience').count(),0);assert.equal(await p.locator('.geo-note').count(),0);
   assert.doesNotMatch(await p.locator('#page-article').innerText(),/SYNTHETIC PREVIEW CONTENT|SYNTHETIC GEO/);
   await p.locator('[data-enter]').click();assert.match(await p.locator('.article-dek').innerText(),/SYNTHETIC PREVIEW CONTENT/);assert.match(await p.locator('.page-status').innerText(),/View-only/);
   await p.evaluate(()=>{__atlasPage.lens.hard.disturbing=0;__atlasPage.changed();});assert.doesNotMatch(await p.locator('#page-article').innerText(),/SYNTHETIC PREVIEW CONTENT|SYNTHETIC GEO/);
   await p.evaluate(async()=>{const {ROOMS}=await import('./src/data.js');Object.assign(ROOMS.lab,savedLab);delete ROOMS.lab.geo;const {setPreset}=await import('./src/rules.js');setPreset(__atlasPage.lens,'Teen');__atlasPage.changed();});
  });
  await check('Phone, landscape and desktop layouts keep controls separate; defaults and local-only startup work',async()=>{
   await room('boycott');
   for(const size of [{width:360,height:800},{width:524,height:1166},{width:1166,height:524},{width:1360,height:900}]){
    await p.setViewportSize(size);await p.evaluate(()=>scrollTo(0,1100));
    assert.ok(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),JSON.stringify(size));
    const boxes=await p.locator('.page-lens-bar button').evaluateAll(es=>es.map(e=>e.getBoundingClientRect().toJSON()));
    for(let i=0;i<boxes.length;i++){assert.ok(boxes[i].height>=44);for(let j=i+1;j<boxes.length;j++)assert.ok(boxes[i].right<=boxes[j].left+1||boxes[j].right<=boxes[i].left+1);}
   }
   await room('capitol');assert.equal(await p.locator('#page-form').getAttribute('data-theme'),'editorial');await room('studio');assert.equal(await p.locator('#page-form').getAttribute('data-theme'),'notebook');
   assert.equal(requests.filter(u=>/^https?:/.test(u)&&new URL(u).host!==new URL(p.url()).host).length,0);
   assert.ok(!requests.some(u=>u.includes('/vendor/three/')));assert.deepEqual(errors,[]);
  });
  console.log(JSON.stringify({passed,errors,externalRequests:0}));
 }catch(e){console.error('STATE',await p.evaluate(()=>({room:__atlasPage.room,scroll:scrollY,focus:document.activeElement?.id,preview:!!document.querySelector('.page-preview')})));throw e;}
 finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
