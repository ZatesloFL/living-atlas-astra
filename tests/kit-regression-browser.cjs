// G3 lifecycle, reusable rendering and readable media checks. Entirely local.
const {chromium}=require(process.env.ATLAS_PLAYWRIGHT_MODULE||'playwright-core');
const assert=require('node:assert/strict');
(async()=>{
 const browser=await chromium.launch({executablePath:process.env.ATLAS_CHROMIUM||'/usr/bin/chromium',headless:true,args:['--no-sandbox','--enable-unsafe-swiftshader']});
 const page=await browser.newPage({viewport:{width:524,height:1166},hasTouch:true,isMobile:true});
 const errors=[],external=[];page.on('pageerror',e=>errors.push(e.message));page.on('request',r=>{if(/^https?:/.test(r.url())&&!r.url().startsWith('http://127.0.0.1:8003/'))external.push(r.url());});
 let passed=0;const check=async(name,fn)=>{await fn();passed++;console.log('PASS '+name);};
 const film=()=>page.locator('[data-kind=screen]'),listen=()=>page.locator('[data-kind=listening]');
 const visit=async room=>{await page.locator('#page-places').click();await page.locator('#page-room').selectOption(room);for(let i=0;i<5&&await page.locator('[data-enter]').count();i++)await page.locator('[data-enter]').click();};
 try{
  await page.goto((process.env.ATLAS_URL||'http://127.0.0.1:8003/')+'?page&test&ai=local');await page.waitForFunction(()=>window.__atlasPage);
  await page.locator('#page-setup [name=age]').fill('30');await page.locator('#page-setup button[type=submit]').click();await visit('boycott');
  await check('Newspaper zoom enlarges glyphs and permits panning at both phone orientations',async()=>{
   for(const size of [{width:524,height:1166},{width:1166,height:524}]){
    await page.setViewportSize(size);
    const clip=page.locator('[data-kind=newspaper]');await clip.locator('[data-value="1"]').click();
    const measure=()=>clip.locator('.clipping-columns p').first().evaluate(p=>{const r=document.createRange();r.setStart(p.firstChild,0);r.setEnd(p.firstChild,1);return r.getBoundingClientRect().height;});
    const before=await measure();await clip.locator('[data-value="1.8"]').click();const after=await measure();assert.ok(after>before*1.7&&after<before*1.9,`${before} → ${after}`);
    assert.equal(await clip.locator('[data-value="1.8"]').getAttribute('aria-pressed'),'true');
    assert.ok(await clip.locator('.clipping-window').evaluate(e=>{e.scrollLeft=100;return e.scrollLeft>0&&e.scrollWidth>e.clientWidth;}));
    assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
   }
   await page.setViewportSize({width:524,height:1166});
  });
  await check('Native pause/resume and repeated reader replacement preserve one player',async()=>{
   await film().locator('[data-kit-event=tap]').click();await page.waitForFunction(()=>document.querySelector('video').readyState>=2&&!document.querySelector('video').paused);
   await page.locator('video').evaluate(v=>v.pause());await page.waitForFunction(()=>document.querySelector('[data-kind=screen]').dataset.playing==='false');
   await page.locator('video').evaluate(v=>v.play());await page.waitForFunction(()=>document.querySelector('[data-kind=screen]').dataset.playing==='true');
   await page.evaluate(async()=>{
    for(let i=0;i<4;i++){__atlasPage.render(true);await new Promise(r=>setTimeout(r,80));}
   });
   await page.waitForFunction(()=>document.querySelector('video').readyState>=2&&!document.querySelector('video').paused);
   const state=await page.evaluate(async()=>{const {players}=await import('./src/kit-media.js');const p=players.get('boycott:film');return {playing:p.playing,views:p.views.size,live:p.streamObject.getTracks().every(t=>t.readyState==='live')};});
   assert.deepEqual(state,{playing:true,views:1,live:true});
  });
  await check('Leaving ends capture tracks; replay starts at the first caption',async()=>{
   await page.evaluate(()=>window.oldTracks=document.querySelector('video').srcObject.getTracks());await visit('capitol');
   assert.ok(await page.evaluate(()=>oldTracks.every(t=>t.readyState==='ended')));
   assert.equal(await page.evaluate(async()=>{const {players}=await import('./src/kit-media.js');return players.get('boycott:film').playing;}),false);
   await visit('boycott');
   await page.evaluate(async()=>{const {players}=await import('./src/kit-media.js'),p=players.get('boycott:film');p.time=p.duration;p.cue=3;});
   await film().locator('[data-kit-event=tap]').click();assert.match(await film().locator('.kit-captions').innerText(),/Public transport/);
   await film().locator('[data-kit-event=tap]').click();
  });
  await check('Changing a soft Lens limit stops playback and requires a fresh tap',async()=>{
   await film().locator('[data-kit-event=tap]').click();
   await page.evaluate(()=>{__atlasPage.lens.limits.sensory=0;__atlasPage.render(true);});
   assert.equal(await film().getAttribute('data-playing'),'false');
   await film().locator('[data-kit-event=tap]').click();assert.equal(await film().getAttribute('data-playing'),'true');
   await film().locator('[data-kit-event=tap]').click();
  });
  await check('A removed gallery closes its lightbox; source pointer follows the selected Thing',async()=>{
   await page.locator('[data-kind=photoWall] button').nth(4).click();
   assert.match(await page.locator('.kit-lightbox').innerText(),/archive-image-sample.*Not synced/s);
   await page.evaluate(()=>{__atlasPage.lens.depth='Glance';__atlasPage.render(true);});await page.waitForFunction(()=>!document.querySelector('.kit-lightbox'));
   await page.locator('#page-depth-quick').click();assert.equal(await page.locator('[data-kit]').count(),5);
  });
  await check('Narration ignores stale speech events and stops when its Lens loses access',async()=>{
   await page.evaluate(()=>{window.realSpeech=speechSynthesis;window.utterances=[];window.cancelCount=0;Object.defineProperty(window,'speechSynthesis',{configurable:true,value:{getVoices:()=>[{}],cancel(){cancelCount++;},speak(u){utterances.push(u);queueMicrotask(()=>u.onstart?.());}}});});
   await listen().locator('[data-kit-event=tap]').click();await page.evaluate(()=>utterances[0].onend());
   assert.equal(await listen().locator('[data-cue="1"]').getAttribute('aria-current'),'true');
   await listen().locator('[data-kit-event=tap]').click();await page.evaluate(()=>utterances[1].onend());
   assert.equal(await page.evaluate(()=>utterances.length),2);
   await listen().locator('[data-kit-event=tap]').click();await page.evaluate(()=>{__atlasPage.lens.trustFrom='Academic';__atlasPage.render(true);});
   assert.equal(await page.evaluate(async()=>{const {players}=await import('./src/kit-media.js');return players.get('boycott:oral-history').playing;}),false);
   await page.evaluate(()=>{Object.defineProperty(window,'speechSynthesis',{value:realSpeech,configurable:true});__atlasPage.lens.trustFrom='Author';__atlasPage.render(true);});
  });
  await check('Child sees three scored exhibits; all retained readers show sample and unsynced labels',async()=>{
   await page.evaluate(async()=>{const {seedProfiles}=await import('./src/profiles.js');__atlasPage.lens=seedProfiles().find(p=>p.id==='seed-child');__atlasPage.render(true);});
   assert.equal(await page.locator('[data-kit]').count(),3);
   const entries=await page.locator('.content-block:has([data-kit])').allTextContents();assert.ok(entries.every(t=>t.includes('Sample media · real archive to connect')&&t.includes('Not synced')));
  });
  await check('Six generated illustrations use the same scene in Page images and canvas media',async()=>{
   const difference=await page.evaluate(async()=>{
    const {artURL,drawArt}=await import('./src/kit-art.js');const canvas=document.createElement('canvas');canvas.width=720;canvas.height=440;const ctx=canvas.getContext('2d');const diffs=[];
    for(let i=0;i<6;i++){
     drawArt(ctx,i,0,0,720,440);const actual=ctx.getImageData(0,0,720,370).data;
     const image=new Image();image.src=artURL(i,'Sample');await image.decode();ctx.drawImage(image,0,0,720,440);const expected=ctx.getImageData(0,0,720,370).data;
     let diff=0;for(let j=0;j<actual.length;j++)diff+=Math.abs(actual[j]-expected[j]);diffs.push(diff/actual.length);
    }
    return diffs;
   });assert.ok(difference.every(d=>d<1),JSON.stringify(difference));
  });
  await check('Reusable 3D pieces honor local facing and independent screen/photo settings in one atlas',async()=>{
   const result=await page.evaluate(async()=>{
    const THREE=await import('./vendor/three/three.module.min.js');const {World}=await import('./src/world.js');const {drawKit,flushKit}=await import('./src/kit-world.js');const {EXHIBITS}=await import('./src/exhibit-data.js');const {seedProfiles}=await import('./src/profiles.js');const {mediaPlayer,setMediaGuard}=await import('./src/kit-media.js');
    const a=structuredClone(EXHIBITS[0]),b=structuredClone(a),photo=structuredClone(EXHIBITS[1]);b.id=b.exhibit.id='second-screen';a.exhibit.settings.slides[0].scene=1;b.exhibit.settings.slides[0].scene=3;photo.exhibit.settings.photos=photo.exhibit.settings.photos.slice(0,1);photo.exhibit.settings.photos[0].scene=4;
    const layout={slot:[10,20],scale:2,facing:Math.PI/2,components:[{block:a.id,position:[2,3],facing:Math.PI/2},{block:b.id,position:[-2,3],facing:0},{block:photo.id,position:[0,-3],facing:0}]};
    const w={lens:seedProfiles().find(p=>p.id==='seed-visitor'),placement:layout,batches:new Map(),colliders:[],labels:[],scene:new THREE.Scene(),pickables:[],dynamicResources:[]};
    for(const k of ['add','box','block','transform','label'])w[k]=World.prototype[k];
    drawKit(w,{layout,blocks:[a,b,photo],content:{}},'fixture');flushKit(w);
    const mesh=w.scene.getObjectByName('Exhibit media atlas'),canvas=mesh.material.map.image,ctx=canvas.getContext('2d');
    const sample=i=>[...ctx.getImageData(i*256+10,10,1,1).data];const before=[sample(0),sample(1),sample(2)];
    setMediaGuard(()=>true);const p=mediaPlayer('fixture',a.exhibit);p.dispatch('seek',7);const after=[sample(0),sample(1),sample(2)];
    // Rebuilding a scene while a film is paused retains that film's current cue.
    const w2={...w,scene:new THREE.Scene(),pickables:[],dynamicResources:[]};flushKit(w2);const restored=[...w2.scene.children[0].material.map.image.getContext('2d').getImageData(10,10,1,1).data];
    const center=new THREE.Vector3();const attr=mesh.geometry.attributes.position;for(let i=0;i<4;i++)center.add(new THREE.Vector3().fromBufferAttribute(attr,i));center.divideScalar(4);
    const output={before,after,restored,center:center.toArray(),facing:w.kitTiles[0].facing,atlasCount:w.scene.children.length,parentRestored:w.placement===layout,collider:w.colliders[0]};
    p.leave();for(const r of [...w.dynamicResources,...w2.dynamicResources])r.dispose();return output;
   });
   assert.notDeepEqual(result.before[0],result.before[1]);assert.notDeepEqual(result.before[1],result.before[2]);
   assert.notDeepEqual(result.after[0],result.before[0]);assert.deepEqual(result.after.slice(1),result.before.slice(1));assert.deepEqual(result.restored,result.after[0]);
   assert.equal(result.atlasCount,1);assert.equal(result.parentRestored,true);assert.equal(result.facing,Math.PI);
   assert.ok(Math.abs(result.center[0]-16)<.001&&Math.abs(result.center[2]-15.77)<.001,JSON.stringify(result));assert.equal(result.collider.x,16);assert.equal(result.collider.z,16);
  });
  assert.deepEqual(errors,[]);assert.deepEqual(external,[]);console.log(JSON.stringify({passed,errors,externalRequests:external.length}));
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
