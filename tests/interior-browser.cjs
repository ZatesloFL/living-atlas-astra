// A fresh visitor crosses the physical doorway. Synthetic/local content only.
const {chromium}=require(process.env.ATLAS_PLAYWRIGHT_MODULE||'playwright-core');
const assert=require('node:assert/strict');
(async()=>{
 const browser=await chromium.launch({executablePath:'/usr/bin/chromium',headless:true,args:['--no-sandbox','--enable-unsafe-swiftshader']});
 const p=await browser.newPage({viewport:{width:524,height:1166},hasTouch:true,isMobile:true}),errors=[];p.on('pageerror',e=>errors.push(e.message));
 let passed=0;const check=async(name,fn)=>{await fn();passed++;console.log('PASS '+name);};
 const confirm=async()=>{for(let i=0;i<10&&await p.locator('[data-preview]').count();i++){await p.locator('[data-preview]').first().click();await p.locator('[data-confirm]').click();}};
 const settle=()=>p.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))));
 const go=async()=>{await p.locator('#travel-go').click();await p.waitForFunction(()=>!__atlas.travel.active);await settle();await p.evaluate(()=>{atlasHud.queue=[];atlasHud.present();});};
 const arrive=async choice=>{await p.evaluate(()=>__atlas.go('boycott'));await p.locator('#travel-arrival').selectOption(choice);await confirm();await go();};
 const pose=async(position,yaw=0)=>{await p.evaluate(([position,yaw])=>__atlas.position(...position,yaw),[position,yaw]);await settle();};
 const receipts=()=>p.evaluate(()=>JSON.stringify(__atlas.access.data.ledgers));
 const entryCount=()=>p.evaluate(()=>__atlas.access.data.ledgers['tallahassee/1956'].filter(e=>e.actor===__atlas.state().activeProfile&&e.action==='access_used'&&e.diff.scope==='enter').length);
 const sceneIds=()=>p.evaluate(()=>{const ids=new Set();__atlas.scene().traverse(o=>{for(const id of [...(o.userData.ids??[]),...(o.userData.faceIds??[])])if(id?.startsWith('exhibit:'))ids.add(id.split(':')[2]);});return [...ids];});
 const clickPoint=async(point,yaw)=>{const xy=await p.evaluate(async([point,yaw])=>{const T=await import('./vendor/three/three.module.min.js'),pos=atlasStatus().position,c=new T.PerspectiveCamera(innerHeight>innerWidth?67:61,innerWidth/innerHeight,.08,110);c.position.set(pos.x,1.88,pos.z);c.rotation.set(.065,yaw,0,'YXZ');c.updateMatrixWorld();const v=new T.Vector3(...point).project(c);return [(v.x+1)*innerWidth/2,(1-v.y)*innerHeight/2];},[point,yaw]);await p.mouse.click(...xy);};
 try{
  await p.goto((process.env.ATLAS_URL||'http://127.0.0.1:8003/')+'?test&ai=local');await p.waitForFunction(()=>window.__atlas);
  await p.locator('[name=age]').fill('30');await p.getByRole('button',{name:/Save profile & enter/}).click();
  await check('Door arrival keeps the visitor in the Quarter; no outdoor exhibit duplicates',async()=>{
   await arrive('door');const s=await p.evaluate(()=>atlasStatus());assert.equal(s.scene,'history');assert.equal(s.room,'tallahassee');assert.deepEqual(await sceneIds(),[]);
   assert.equal(await p.evaluate(()=>__atlas.access.data.presence.find(p=>p.person===__atlas.state().activeProfile).room),'tallahassee');
   assert.match(await p.locator('#edge-prompt').innerText(),/^.*Enter/);assert.ok(s.drawCalls<=22);console.log('Quarter draw calls',s.drawCalls);
  });
  await check('Frontage offers Enter first; cancelling its pre-flight leaves pose and receipts unchanged',async()=>{
   await p.locator('#edge-prompt').click();assert.equal(await p.locator('#sheet-content button').first().getAttribute('id'),'hall-enter');assert.equal(await p.locator('#hall-page').count(),1);
   const before=await receipts(),position=await p.evaluate(()=>atlasStatus().position);await p.locator('#hall-enter').click();assert.equal(await p.locator('#travel-arrival').inputValue(),'inside');assert.equal(await p.locator('#travel-go').isDisabled(),true);
   await p.locator('#travel-cancel').click();assert.equal(await receipts(),before);assert.deepEqual(await p.evaluate(()=>atlasStatus().position),position);
  });
  await check('Entering the physical doorway creates one boycott entry receipt and hall presence',async()=>{
   const n=await entryCount();await p.locator('#edge-prompt').click();await p.locator('#hall-enter').click();await confirm();await go();assert.equal(await entryCount(),n+1);
   assert.equal(await p.evaluate(()=>atlasStatus().scene),'hall:boycott');assert.equal(await p.evaluate(()=>__atlas.state().context.inside),'The 1956 bus boycott');
   assert.equal(await p.evaluate(()=>__atlas.access.data.presence.find(p=>p.person===__atlas.state().activeProfile).room),'tallahassee/1956');assert.equal((await sceneIds()).length,5);
  });
  await check('Five bays have connected approaches, a clear aisle, solid walls and mounted labels',async()=>{
   const result=await p.evaluate(async()=>{const {World}=await import('./src/world.js'),{ROOMS}=await import('./src/data.js'),{walkingPath}=await import('./src/navigation.js');const h=ROOMS.boycott.layout.interior,w=new World(h.scene,__atlas.state().lens),from=h.arrival.position;
    const paths=h.bays.map(b=>({id:b.block,stand:w.canStand(...b.approach),path:walkingPath(w,from,b.approach)}));
    const out={paths,aisle:Array.from({length:20},(_,i)=>w.canStand(0,9-i*.8)).every(Boolean),walls:!w.canStand(9,0)&&!w.canStand(0,12),floating:w.labels.filter(l=>l.id?.startsWith('exhibit:')).length,labels:w.hallSigns.filter(s=>s.id?.startsWith('exhibit:')).length,atlas:w.scene.children.filter(o=>o.name==='Exhibit media atlas').length};w.dispose();return out;});
   assert.ok(result.aisle);assert.ok(result.walls);assert.equal(result.floating,0);assert.equal(result.labels,5);assert.equal(result.atlas,1);for(const x of result.paths){assert.ok(x.stand,x.id);assert.ok(x.path?.length,x.id);}
  });
  await check('Actual film tap plays captions; walking beyond its hall distance pauses it',async()=>{
   await pose([-2.5,5.5],Math.PI/2);await clickPoint([-8.4,1.45,5.5],Math.PI/2);await p.waitForFunction(()=>document.querySelector('[data-kind=screen]')?.dataset.playing==='true');await p.locator('[data-kind=screen] input').fill('7');assert.match(await p.locator('.kit-captions').innerText(),/shared rides/);
   await p.locator('#sheet-close').click();await pose([0,8.4]);await p.waitForFunction(async()=>!(await import('./src/kit-media.js')).players.get('boycott:film').playing);
  });
  await check('Gallery, listening, newspaper and bus retain the G3 readers in their own bays',async()=>{
   await pose([0,5.3],-Math.PI/2);await clickPoint([8.3,1,6.68],-Math.PI/2);await p.locator('dialog[open]').waitFor();assert.match(await p.locator('dialog').innerText(),/Not synced/);await p.locator('dialog button').click();await p.locator('#sheet-close').click();
   await pose([-3.4,-3.8],Math.PI/2);await clickPoint([-7.5,.55,-3.8],Math.PI/2);assert.match(await p.locator('[data-kind=listening]').innerText(),/sample narration|Speech unavailable|Speaking/i);await p.locator('#sheet-close').click();
   await pose([3.2,-3.8],-Math.PI/2);await clickPoint([7.2,1.2,-3.8],-Math.PI/2);await p.locator('[data-kind=newspaper] [data-value="1.8"]').click();assert.equal(await p.locator('.kit-clipping').evaluate(e=>e.style.width),'180%');await p.locator('#sheet-close').click();
   await pose([0,.5]);await clickPoint([0,1,-7.7],0);await p.locator('[data-kind=seatMap] [data-value="2"]').click();assert.match(await p.locator('.seat-story').innerText(),/rear seating/);await p.locator('#sheet-close').click();
  });
  await check('Staff in the hall retains the same standing Docent grant',async()=>{
   await p.evaluate(()=>__atlas.staffUI.open(__atlas.state().context.room));const card=p.locator('.helper-card').filter({has:p.locator('[data-docent=docent-silver]')});await card.waitFor();assert.match(await card.innerText(),/look · Standing · no expiry/);await p.locator('#sheet-close').click();
  });
  await check('All hall directions and landscape remain within 22 draws, without overflow',async()=>{
   const calls=[];for(const yaw of [0,Math.PI/2,Math.PI,-Math.PI/2]){await pose([0,8.4],yaw);const s=await p.evaluate(()=>atlasStatus());assert.equal(s.renderMode,'hdr');assert.equal(s.shadows,true);assert.ok(s.drawCalls<=22);calls.push(s.drawCalls);}console.log('Hall draw calls',calls);
   await p.setViewportSize({width:1166,height:524});await pose([0,8.4]);assert.ok(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));assert.ok(await p.evaluate(()=>atlasStatus().drawCalls)<=22);await p.setViewportSize({width:524,height:1166});
  });
  await check('Hall exit stops playback and replaces hall presence; Inside fast travel returns to the aisle',async()=>{
   await pose([-2.5,5.5],Math.PI/2);await p.evaluate(()=>__atlas.pick('exhibit:boycott:film'));await p.waitForFunction(()=>document.querySelector('[data-kind=screen]').dataset.playing==='true');await p.locator('#sheet-close').click();
   await arrive('door');assert.equal(await p.evaluate(()=>atlasStatus().scene),'history');assert.equal(await p.evaluate(()=>atlasStatus().room),'tallahassee');assert.equal(await p.evaluate(async()=>(await import('./src/kit-media.js')).players.get('boycott:film').playing),false);assert.equal(await p.evaluate(()=>__atlas.access.data.presence.find(p=>p.person===__atlas.state().activeProfile).room),'tallahassee');
   await arrive('inside');assert.deepEqual(await p.evaluate(()=>atlasStatus().position),{x:0,z:8.4});
  });
  await check('Last-place reload restores the hall without clearing stored data',async()=>{
   await pose([-2.5,5.5],Math.PI/2);await p.evaluate(()=>{__atlas.discovery.save({startAt:'last'});dispatchEvent(new Event('pagehide'));localStorage.setItem('interior-sentinel','keep');});await p.reload();await p.waitForFunction(()=>window.__atlas);assert.equal(await p.evaluate(()=>atlasStatus().scene),'hall:boycott');assert.equal(await p.evaluate(()=>atlasStatus().room),'boycott');assert.equal(await p.evaluate(()=>localStorage.getItem('interior-sentinel')),'keep');assert.deepEqual(await p.evaluate(()=>atlasStatus().position),{x:-2.5,z:5.5});
  });
  await check('Child retains three exhibits and Teen five after profile changes inside the hall',async()=>{
   for(const [id,count] of [['seed-child',3],['seed-visitor',5]]){await p.locator('#profile-chip').click();await p.locator('[data-profile="'+id+'"]').click();await p.waitForFunction(id=>__atlas.state().activeProfile===id,id);await p.waitForTimeout(700);assert.equal(await p.evaluate(()=>atlasStatus().scene),'hall:boycott');assert.equal((await sceneIds()).length,count);}
   assert.deepEqual(errors,[]);assert.deepEqual(await p.evaluate(()=>atlasDiagnostics().errors),[]);
  });
  await check('Page reading and return preserve the hall; the physical exit returns to the frontage',async()=>{
   await p.evaluate(()=>__atlas.pick('boycott'));await p.locator('#info-page').click();assert.equal(await p.locator('#page-form [data-kit]').count(),5);await p.locator('#page-to-3d').click();assert.equal(await p.evaluate(()=>atlasStatus().scene),'hall:boycott');
   await pose([0,8.4],Math.PI);await clickPoint([0,1.5,11.78],Math.PI);await p.locator('#travel-arrival').waitFor();assert.equal(await p.locator('#travel-arrival').inputValue(),'door');await confirm();await go();assert.equal(await p.evaluate(()=>atlasStatus().room),'tallahassee');
  });
  await check('A newly hidden hall ejects safely and clears its presence and media',async()=>{
   await arrive('inside');await p.locator('#lens-button').click();await p.locator('[data-show=real]').click();await p.waitForFunction(()=>atlasStatus().scene==='history');await p.evaluate(()=>__atlas.access.queue);assert.equal(await p.evaluate(()=>__atlas.access.data.presence.some(p=>p.person===__atlas.state().activeProfile&&p.room==='tallahassee/1956')),false);assert.equal(await p.evaluate(async()=>[...(await import('./src/kit-media.js')).players.values()].some(p=>p.playing)),false);await p.locator('#sheet-close').click();
  });
  assert.deepEqual(errors,[]);console.log(JSON.stringify({passed,errors}));
 }catch(e){console.error(await p.evaluate(()=>({status:window.atlasStatus?.(),diagnostics:window.atlasDiagnostics?.().errors,sheet:document.querySelector('#sheet-content')?.innerText})));throw e;}finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
