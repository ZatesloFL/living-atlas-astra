const {chromium}=require(process.env.ATLAS_PLAYWRIGHT_MODULE||'playwright-core');
const assert=require('node:assert/strict');
(async()=>{
 const browser=await chromium.launch({executablePath:process.env.ATLAS_CHROMIUM||'/usr/bin/chromium',headless:true,args:['--no-sandbox','--enable-unsafe-swiftshader']});
 const page=await browser.newPage({viewport:{width:524,height:1166},hasTouch:true,isMobile:true});
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 const settle=()=>page.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(()=>requestAnimationFrame(r)))));
 try{
  await page.goto((process.env.ATLAS_URL||'http://127.0.0.1:8003/')+'?test');await page.waitForFunction(()=>window.__atlas);
  await page.locator('[name=age]').fill('30');await page.getByRole('button',{name:/Save profile & enter/}).click();
  await page.locator('#profile-chip').click();await page.locator('[data-profile=seed-me]').click();await page.waitForTimeout(700);
  await page.locator('#test-button').click();await page.locator('#test-role').selectOption('owner');await page.waitForTimeout(500);await page.locator('#test-close').click();
  const results=[];
  for(const [scene,x,z,label] of [['square',0,5.6,'Square'],['history',0,5.6,'History'],['studio',0,5.6,'Studio'],['studio',15,1,'Commons'],['studio',22,-6.7,'Night Market'],['studio',30.5,2,'After Dark']]){
   if(await page.evaluate(()=>atlasStatus().scene)!==scene){await page.evaluate(scene=>__atlas.changeScene(scene),scene);await page.waitForFunction(scene=>atlasStatus().scene===scene,scene);await page.waitForTimeout(700);}
   const calls=[];
   for(const yaw of [0,Math.PI/2,Math.PI,-Math.PI/2]){
    await page.evaluate(([x,z,yaw])=>__atlas.position(x,z,yaw),[x,z,yaw]);await settle();
    const status=await page.evaluate(()=>atlasStatus());assert.equal(status.renderMode,'hdr');assert.equal(status.shadows,true);assert.ok(status.drawCalls<=22,`${label}: ${status.drawCalls} calls`);calls.push(status.drawCalls);
   }
   results.push({place:label,calls});
  }
  console.log('PASS full bloom/shadows: six locations, four directions',JSON.stringify(results));
  await page.setViewportSize({width:1166,height:524});await page.evaluate(()=>__atlas.position(22,-6.7,Math.PI/2));await settle();
  assert.ok(await page.evaluate(()=>atlasStatus().drawCalls)<=22);console.log('PASS landscape campus budget');
  const picking=await page.evaluate(async()=>{
   const THREE=await import('./vendor/three/three.module.min.js'),scene=__atlas.scene(),veils=scene.getObjectByName('Shared crossing veils'),glow=scene.getObjectByName('Shared luminous fixtures'),ray=new THREE.Raycaster(),matrix=new THREE.Matrix4();
   let portals=0;
   for(let i=0;i<veils.count;i++){
    veils.getMatrixAt(i,matrix);const center=new THREE.Vector3().setFromMatrixPosition(matrix),normal=new THREE.Vector3(0,0,1).transformDirection(matrix);
    for(const side of [-1,1]){ray.set(center.clone().addScaledVector(normal,side*.5),normal.clone().multiplyScalar(-side));const hit=ray.intersectObject(veils).find(h=>h.instanceId===i);if(!hit||!veils.userData.ids[hit.instanceId].startsWith('edge:'))return false;}
    portals++;
   }
   const face=glow.userData.faceIds.findIndex(Boolean),p=glow.geometry.attributes.position,a=new THREE.Vector3().fromBufferAttribute(p,face*3),b=new THREE.Vector3().fromBufferAttribute(p,face*3+1),c=new THREE.Vector3().fromBufferAttribute(p,face*3+2),normal=b.clone().sub(a).cross(c.clone().sub(a)).normalize(),center=a.clone().add(b).add(c).divideScalar(3);
   ray.set(center.addScaledVector(normal,.05),normal.negate());const hit=ray.intersectObject(glow).find(h=>h.faceIndex===face);
   return portals>0&&!!hit&&glow.userData.faceIds[hit.faceIndex]===glow.userData.faceIds[face];
  });
  assert.equal(picking,true);assert.deepEqual(errors,[]);assert.deepEqual(await page.evaluate(()=>atlasDiagnostics().errors),[]);console.log('PASS two-sided portal and glowing-fixture picking; no fallback or exceptions');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
