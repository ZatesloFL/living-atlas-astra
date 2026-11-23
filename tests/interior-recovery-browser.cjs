const {chromium}=require(process.env.ATLAS_PLAYWRIGHT_MODULE||'playwright-core');
const assert=require('node:assert/strict');
(async()=>{
 const browser=await chromium.launch({executablePath:'/usr/bin/chromium',headless:true,args:['--no-sandbox','--enable-unsafe-swiftshader']});
 const p=await browser.newPage({viewport:{width:524,height:1166}}),errors=[];p.on('pageerror',e=>errors.push(e.message));let passed=0;
 const check=async(name,fn)=>{await fn();passed++;console.log('PASS '+name);};
 try{
  await p.goto((process.env.ATLAS_URL||'http://127.0.0.1:8003/')+'?test&safe&ai=local');await p.waitForFunction(()=>window.__atlas);await p.locator('[name=age]').fill('30');await p.getByRole('button',{name:/Save profile & enter/}).click();
  await check('The Quarter approach and all hall bays remain walkable at maximum exhibit scale',async()=>{
   const r=await p.evaluate(async()=>{const {ROOMS}=await import('./src/data.js'),{World}=await import('./src/world.js'),{walkingPath}=await import('./src/navigation.js'),room=ROOMS.boycott,h=room.layout.interior,lens=__atlas.state().lens;lens.itemStyles={[room.id]:{scale:1.25}};
    const outside=new World('history',lens),hall=new World(h.scene,lens),result={approach:!!walkingPath(outside,[0,1],h.frontage.arrival)&&!!walkingPath(outside,[0,1],h.frontage.outside),bays:h.bays.map(b=>!!walkingPath(hall,h.arrival.position,b.approach)),behindBus:!!walkingPath(hall,h.arrival.position,[0,-10.8])};outside.dispose();hall.dispose();return result;});
   assert.ok(r.approach);assert.ok(r.behindBus);assert.ok(r.bays.every(Boolean));
  });
  await check('A second data-only Place uses the same enclosure, door and exhibit renderer',async()=>{
   const r=await p.evaluate(async()=>{const {ROOMS,EDGES}=await import('./src/data.js'),{World}=await import('./src/world.js'),{defineInterior}=await import('./src/interior-kit.js'),{hallEntry}=await import('./src/interior-space.js');const copy=structuredClone(ROOMS.boycott);copy.id='synthetic/reuse';copy.layout.sign=false;copy.layout.model='capitols';copy.layout.interior=defineInterior({...copy.layout.interior,scene:'hall:reuse-fixture',parent:'studio',edge:'reuse-entry'});ROOMS['reuse-fixture']=copy;EDGES.push({id:'reuse-entry',from:'studio',to:'reuse-fixture',type:'seamless',scene:'history',position:[9,-3.4]});let w;
    try{w=new World('hall:reuse-fixture',__atlas.state().lens);return {placeSolids:w.scene.children.flatMap(o=>o.userData.ids??[]).filter(id=>id==='reuse-fixture').length,rooms:w.renderedRooms.map(r=>r.id),exit:w.edgeObjects[0].to,door:hallEntry('reuse-fixture').type,labels:w.hallSigns.filter(s=>s.id?.startsWith('exhibit:reuse-fixture:')).length,atlas:w.scene.children.filter(o=>o.name==='Exhibit media atlas').length};}finally{w?.dispose();EDGES.pop();delete ROOMS['reuse-fixture'];}});
   assert.deepEqual(r,{placeSolids:1,rooms:['reuse-fixture'],exit:'studio',door:'door',labels:5,atlas:1});
  });
  await check('The newspaper print faces the visitor above its stand surface',async()=>{
   const r=await p.evaluate(async()=>{const T=await import('./vendor/three/three.module.min.js'),{World}=await import('./src/world.js');const w=new World('hall:boycott',__atlas.state().lens),ray=new T.Raycaster(new T.Vector3(7.2,2,-3.8),new T.Vector3(0,-1,0)),hit=ray.intersectObjects(w.pickables,false)[0],result={mesh:hit.object.name,id:hit.object.userData.faceIds?.[hit.faceIndex]};w.dispose();return result;});assert.deepEqual(r,{mesh:'Exhibit media atlas',id:'exhibit:boycott:sample-clipping'});
  });
  await check('An old saved boycott position migrates to the frontage without erasing the profile',async()=>{
   await p.addInitScript(()=>{if(localStorage.getItem('legacy-interior-fixture')!=='pending')return;const key='living-atlas.profiles.v4',raw=JSON.parse(localStorage.getItem(key)),profile=raw.profiles.find(p=>p.id===raw.activeId);profile.discovery={...profile.discovery,startAt:'last',lastPlace:{room:'boycott',position:[9,-6],facing:0}};localStorage.setItem(key,JSON.stringify(raw));localStorage.setItem('legacy-interior-fixture','applied');});
   const id=await p.evaluate(()=>{localStorage.setItem('legacy-interior-fixture','pending');return __atlas.state().activeProfile;});await p.reload();await p.waitForFunction(()=>window.__atlas);assert.equal(await p.evaluate(()=>__atlas.state().activeProfile),id);assert.equal(await p.evaluate(()=>localStorage.getItem('legacy-interior-fixture')),'applied');assert.equal(await p.evaluate(()=>atlasStatus().scene),'history');assert.equal(await p.evaluate(()=>atlasStatus().room),'tallahassee');assert.deepEqual(await p.evaluate(()=>atlasStatus().position),{x:8,z:3.1});
  });
  await check('Walking into the frontage stops at the door and cannot claim hall presence',async()=>{
   await p.evaluate(()=>{__atlas.position(9,-2.3);document.activeElement?.blur();});await p.keyboard.down('w');await p.waitForTimeout(2500);await p.keyboard.up('w');const s=await p.evaluate(()=>atlasStatus());assert.ok(s.position.z< -2.3&&s.position.z>=-3.061);assert.equal(s.scene,'history');assert.equal(s.room,'tallahassee');assert.equal(await p.evaluate(()=>__atlas.access.data.presence.some(p=>p.person===__atlas.state().activeProfile&&p.room==='tallahassee/1956')),false);
   assert.deepEqual(errors,[]);
  });
  console.log(JSON.stringify({passed,errors}));
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
