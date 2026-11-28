// Lane A acceptance extends lane B's actual-control publication/recovery walk.
// No Place, Path, interior, or legacy receipt is installed as a test fixture.
const assert=require('node:assert/strict');
const {writeFile}=require('node:fs/promises');
const {chromium}=require(process.env.ATLAS_PLAYWRIGHT_MODULE||'playwright-core');
const harness=require('./structural-hall-browser.cjs');
const state=page=>page.evaluate(()=>__atlas.state());
const ready=page=>page.waitForFunction(()=>__atlas.state().viewpoint.ready);
const receipts=page=>page.evaluate(()=>({
 uses:Object.values(__atlas.access.data.ledgers).flat().filter(r=>r.action==='access_used').map(r=>r.hash),
 grants:structuredClone(__atlas.access.data.grants),
}));
async function hold(page,key,ms){await page.locator('#world').focus();await page.keyboard.down(key);await page.waitForTimeout(ms);await page.keyboard.up(key);await page.waitForTimeout(300);}
async function back(page){await page.locator('#navigation-return').click();await ready(page);await page.waitForFunction(()=>{const s=__atlas.state(),p=s.viewpoint.entrance.position;return Math.hypot(s.position.x-p[0],s.position.z-p[2])<.03;});}
async function rendered(page,marker){return page.evaluate(marker=>{
 let n=0;__atlas.scene().traverse(o=>{n+=(o.userData.ids??[]).filter(id=>id===marker).length;n+=(o.userData.faceIds??[]).filter(id=>id===marker).length;if(o.userData.id===marker)n++;});return n;
},marker);}
async function sensory(page,value){
 await page.locator('#lens-button').click();await page.locator('#atlas-inspector').click();
 for(const key of ['sensory','sensory-graphicness']){
  const input=page.locator('#limit-'+key);await input.fill(String(value));await input.dispatchEvent('change');
  const lock=page.locator('[data-lock="'+key+'"]');if(await lock.getAttribute('aria-pressed')!=='true')await lock.click();
 }
 await page.locator('#sheet-close').click();await ready(page);
}
async function signViewing(page,records,subject){
 const ref=subject.ref;
 const face=await page.evaluate(marker=>__atlas.scene().getObjectByName('Builder sign faces').userData.signFaces.find(f=>f.id===marker),subject.marker);
 const frame=await page.evaluate(ref=>__atlas.viewpoint.frame(ref.placeId,ref.thingId),ref);
 assert.ok(frame?.face,'The hall-local sign must have a readable face');
 assert.deepEqual(frame.face.point,face.center,'Target the authored sign text, not its separate title label');
 const plan=await page.evaluate(ref=>__atlas.viewpoint.plan(ref.placeId,ref.thingId),ref);
 assert.ok(plan?.spot,'A standable viewing spot exists inside this hall');
 assert.deepEqual(plan.spot.aim,face.center);
 assert.ok(plan.spot.position.reduce((dot,n,i)=>dot+(n-face.center[i])*frame.face.normal[i],0)>0,'The spot is in front of the readable face');
 const before=await receipts(page);
 await page.evaluate(marker=>__atlas.pick(marker),subject.marker);
 assert.equal(await page.locator('#sheet-title').innerText(),'Lantern Hall welcome sign');
 const cardRef=JSON.parse(await page.locator('[data-standing-open]').first().getAttribute('data-standing-open'));
 assert.deepEqual(cardRef,ref);
 await page.locator('#thing-closer').click();await page.locator('#viewpoint-confirm').click();await ready(page);
 const actual=await state(page),position=[actual.position.x,actual.position.y,actual.position.z];
 assert.ok(Math.hypot(...position.map((n,i)=>n-plan.spot.position[i]))<.001);
 const delta=face.center.map((n,i)=>n-position[i]),length=Math.hypot(...delta);
 const alignment=delta.reduce((dot,n,i)=>dot+n/length*actual.viewpoint.direction[i],0);
 assert.ok(alignment>.999,'The actual camera faces the sign text');
 assert.equal(actual.room,records.hall.id);assert.equal(actual.kind,records.hall.layout.interior.scene);
 assert.ok(await page.evaluate(p=>__atlas.canStand(p.x,p.z),actual.position));
 assert.deepEqual(await receipts(page),before,'Viewing does not cross or grant');
 await back(page);
 return {ref,text:face.text,face:frame.face,spot:plan.spot,actual:actual.position,alignment,cardRef};
}
async function movement(page,records,withheld=null){
 const {hall}=records,h=hall.layout.interior;
 await back(page);await page.waitForTimeout(300);
 const before=await receipts(page),entry=await state(page);
 await hold(page,'e',1800);
 const risen=await state(page);
 assert.ok(risen.viewpoint.flying);
 assert.ok(risen.position.y<=h.height-.25+.001);
 assert.ok(risen.position.y>=h.height-.4,'Reach this hall’s own ceiling');
 const ceilingLine=await page.locator('#toast').innerText();
 assert.match(ceilingLine,/ceiling/i);
 await page.mouse.move(260,450);await page.mouse.wheel(0,-240);await page.mouse.wheel(0,-240);
 await page.waitForFunction(()=>__atlas.state().viewpoint.fov<__atlas.state().viewpoint.normalFov*.6);
 const zoomed=await state(page);
 assert.deepEqual(zoomed.position,risen.position,'Zoom changes only the field of view');
 assert.equal(zoomed.room,hall.id);assert.equal(zoomed.kind,h.scene);
 if(withheld)assert.equal(await rendered(page,withheld),0,'Withheld Thing stays absent above and zoomed');
 // Clear the ceiling lights before horizontal flight towards the actual exit.
 await hold(page,'q',500);
 await hold(page,'s',1800);const exit=await state(page);
 assert.ok(exit.position.z<=h.depth/2-.39&&exit.position.z<h.exit[1]);
 assert.ok(exit.position.z>entry.position.z+.5,'The control moved before meeting the door boundary');
 await back(page);await hold(page,'e',500);
 await hold(page,'a',3600);const left=await state(page);
 assert.ok(left.position.x>=-h.width/2+.39&&left.position.x<-h.width/2+1);
 await hold(page,'d',6200);const right=await state(page);
 assert.ok(right.position.x<=h.width/2-.39&&right.position.x>h.width/2-1);
 for(const s of [risen,zoomed,exit,left,right]){assert.equal(s.room,hall.id);assert.equal(s.kind,h.scene);assert.ok(s.position.y<=h.height-.25+.001);}
 assert.ok(right.viewpoint.fov>right.viewpoint.normalFov*.95,'Moving restores normal magnification');
 await page.locator('#visitor-land').click();await page.waitForFunction(()=>!__atlas.state().viewpoint.flying);
 const landed=await state(page);assert.ok(await page.evaluate(p=>__atlas.canStand(p.x,p.z),landed.position));
 // Walking still stops at the same wall after Land.
 await hold(page,'d',500);const walked=await state(page);assert.ok(walked.position.x<=h.width/2-.39);
 await back(page);
 const after=await receipts(page);assert.deepEqual(after,before,'Flight, zoom, Land and return create no crossings or grants');
 return {hall:hall.id,scene:h.scene,bounds:{width:h.width,depth:h.depth},height:h.height,ceilingLine,
  entry:entry.position,risen:risen.position,zoom:{position:zoomed.position,fov:zoomed.viewpoint.fov},
  exit:exit.position,left:left.position,right:right.position,landed:landed.position,
  ...(withheld?{withheldAboveAndZoomed:0}:{}),crossingReceiptsBefore:before.uses,crossingReceiptsAfter:after.uses,grantsUnchanged:true};
}
async function oldLinks(page,records){
 const old=records.hall.builderStructure.recoveredFrom.thing;
 const resolution=await page.evaluate(async old=>{
  const {recoveredHall}=await import('./src/thing-subject.js'),lens=__atlas.state().lens;
  return {exact:recoveredHall(old,lens)?.id,wrongVersion:recoveredHall({...old,versionId:'not-the-original-version'},lens),
   wrongThing:recoveredHall({...old,thingId:old.thingId+'-other'},lens),unrelatedHolder:recoveredHall(old,{...lens,profileId:'seed-visitor'})};
 },old);
 assert.equal(resolution.exact,records.hall.id);for(const key of ['wrongVersion','wrongThing','unrelatedHolder'])assert.equal(resolution[key],null);
 const before=await receipts(page);
 const builderBefore=await page.evaluate(async()=>localStorage.getItem((await import('./src/builder.js')).BUILDER_STORAGE));
 await page.evaluate(old=>__atlas.pick('exhibit:'+old.placeId+':'+old.thingId),old);
 await page.locator('#hall-info').waitFor();
 assert.equal(await page.locator('#sheet-title').innerText(),records.hall.title);
 assert.equal(await page.locator('.hall-overview').innerText(),records.hall.body);
 await page.locator('#hall-info').click();
 const ref=JSON.parse(await page.locator('[data-standing-open]').first().getAttribute('data-standing-open'));
 assert.equal(ref.placeId,records.hall.id);assert.equal(ref.thingId,null);
 await page.locator('#sheet-close').click();
 // Open the old saved reading link through the normal Standing UI, retaining
 // its original historical subject in the receipts.
 await page.evaluate(ref=>__atlas.readings(ref),old);
 await page.locator('#sheet-title').filter({hasText:records.hall.title+' · readings'}).waitFor();
 await page.locator('#sheet-close').click();
 assert.deepEqual(await receipts(page),before);
 assert.equal(await page.evaluate(async()=>localStorage.getItem((await import('./src/builder.js')).BUILDER_STORAGE)),builderBefore);
 return {old,destination:ref,originalReceiptsUntouched:true,resolution};
}
async function exteriorMovement(page,{hall,parent}){
 await ready(page);await page.waitForTimeout(300);
 const before=await receipts(page),start=await state(page);
 await hold(page,'e',2900);const risen=await state(page);
 assert.ok(risen.position.y>start.position.y+1,'The actual outside arrival supports rising beside this door');
 await page.mouse.move(260,450);await page.mouse.wheel(0,-240);await page.mouse.wheel(0,-240);
 await page.waitForFunction(()=>__atlas.state().viewpoint.fov<__atlas.state().viewpoint.normalFov*.6);
 const zoomed=await state(page);assert.deepEqual(zoomed.position,risen.position);
 await hold(page,'w',1900);const attempted=await state(page);
 assert.equal(attempted.room,parent.id);assert.equal(attempted.kind,parent.scene);
 const f=hall.layout.interior.frontage,side=(attempted.position.x-f.door[0])*Math.sin(f.facing??0)+(attempted.position.z-f.door[1])*Math.cos(f.facing??0);
 assert.ok(side>0,'Flight stays on the outer side of the actual door plane');
 assert.deepEqual(await receipts(page),before,'Flight and zoom outside do not enter the hall or grant access');
 await back(page);
 return {parent:parent.id,hall:hall.id,facing:f.facing,start:start.position,risen:risen.position,zoomFov:zoomed.viewpoint.fov,attempted:attempted.position,outerSide:side,noCrossingOrGrant:true};
}
async function retest(page,records,subject){
 if(await page.evaluate(()=>atlasStatus().room)!==records.hall.id)await harness.enterDoor(page,records);
 const result={};
 if(subject){
  result.sign=await signViewing(page,records,subject);
  await sensory(page,1);
  const dock=await harness.openBuild(page,records.hall.id);
  const withheld=await harness.addBuiltPiece(page,dock,{kind:'bench',name:'Lens guardrail bench',position:[3,0,0],dials:{'sensory.amount':1,'sensory.graphicness':1}});
  await harness.publish(page,dock);
  const marker='exhibit:'+records.hall.id+':'+withheld,visible=await rendered(page,marker);assert.ok(visible>0);
  await sensory(page,0);assert.equal(await rendered(page,marker),0);
  result.lens={thing:{placeId:records.hall.id,thingId:withheld},visibleBefore:visible,withheldAtGround:0};
  result.movement=await movement(page,records,marker);
 }else{
  result.oldLinks=await oldLinks(page,records);
  result.movement=await movement(page,records);
 }
 console.log('PASS child card, '+(subject?'authored sign / Lens guardrail':'legacy record links')+', hall bounds / ceiling / door');
 return result;
}
async function main(){
 const pin=process.env.ATLAS_TEST_SPKI;
 const browser=await chromium.launch({executablePath:process.env.ATLAS_CHROMIUM||'/usr/bin/chromium',headless:true,args:['--no-sandbox','--enable-unsafe-swiftshader',...(pin?['--ignore-certificate-errors-spki-list='+pin]:[])]});
 try{
  const url=process.env.ATLAS_URL||'http://127.0.0.1:8012/',legacyURL=process.env.ATLAS_LEGACY_URL||'http://127.0.0.1:8014/';
  const scenario=process.env.ATLAS_HALL_SCENARIO;
  const native=scenario==='legacy'?undefined:await harness.checkNew(browser,url,{retest,atDoor:exteriorMovement});
  const legacy=scenario==='native'?undefined:await harness.checkLegacy(browser,url,legacyURL,{retest,atDoor:exteriorMovement});
  const result={url,archivedSourceCommit:'60ba1aa',harness:'tests/structural-hall-browser.cjs',native,legacy};
  if(process.env.ATLAS_EVIDENCE_FILE)await writeFile(process.env.ATLAS_EVIDENCE_FILE,JSON.stringify(result,null,2)+'\n');
  console.log('PASS structural hall visiting acceptance');
 }finally{await browser.close();}
}
main().catch(error=>{console.error(error);process.exitCode=1;});
