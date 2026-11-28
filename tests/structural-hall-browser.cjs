const assert = require('node:assert/strict');
const {writeFile} = require('node:fs/promises');
const {chromium} = require(process.env.ATLAS_PLAYWRIGHT_MODULE || 'playwright-core');
const completeArrival = require('./arrival-setup.cjs');

const title = 'Synthetic Lantern Hall';
const exhibitTitle = 'Lantern Hall welcome sign';
const exhibitText = 'READING ROOM THIS WAY';
const shellPosition = [2.5, 0, -1.5];
const flags = '?test&safe&ai=local';
const addressForm = page => page.locator('details.address-manual');
const mapNode = (page,id) => page.locator('[data-map-node=' + JSON.stringify(id) + ']');

async function observe(context, url) {
  const page = await context.newPage(), errors = [], liveCalls = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.route('**/functions/v1/**', route => {
    liveCalls.push(new URL(route.request().url()).pathname);
    return route.abort();
  });
  return {page,errors,liveCalls,open:()=>page.goto(url + flags)};
}

async function failureState(page,errors) {
  const state=await page.evaluate(()=>({
    room:window.atlasStatus?.().room,
    scene:window.atlasStatus?.().scene,
    card:document.querySelector('#sheet:not([hidden]) #sheet-title')?.textContent,
    build:document.querySelector('#builder-hud:not([hidden]) .builder-status')?.textContent,
    travelError:document.querySelector('#travel-error,#travel-words-message')?.textContent,
    travelRows:[...document.querySelectorAll('.travel-checklist li')].map(row=>row.textContent),
    startup:window.atlasDiagnostics?.().errors,
  })).catch(()=>null);
  console.error(JSON.stringify({state,errors}));
}

const contextOptions = {
  viewport:{width:524,height:1166},hasTouch:true,isMobile:true,reducedMotion:'reduce'
};

async function arrive(page) {
  await page.locator('#setup-form [name=name]').fill('Synthetic structural hall owner');
  await page.locator('#setup-form [name=age]').fill('34');
  await completeArrival(page,{square:false});
  await page.waitForFunction(()=>atlasStatus().room.startsWith('home/') && document.querySelector('#sheet').hidden);
  return page.evaluate(()=>({home:atlasStatus().room,owner:__atlas.state().activeProfile}));
}

async function openBuild(page, place) {
  const dock = page.locator('#builder-hud');
  await page.locator('#build-button').click();
  await dock.getByRole('heading',{name:'Build',exact:true}).waitFor();
  await page.waitForFunction(place=>__atlas.build.draft?.roomKey===place,place);
  return dock;
}

async function addBuiltPiece(page,dock,{kind,name,text,position,dials={}}) {
  await dock.locator('[data-builder-action=panel][data-value=kit]').click();
  await dock.locator('[data-builder-action=choose-kit][data-value=' + JSON.stringify(kind) + ']').click();
  await dock.getByRole('button',{name:'Place at center',exact:true}).click();
  const inspector=dock.locator('[data-builder-form=piece]');
  await inspector.waitFor();
  const titleField=inspector.locator('[name=title],[name="settings.title"]');
  await titleField.fill(name);
  if(text) await inspector.locator('[name="settings.text"]').fill(text);
  for(const [i,coordinate] of position.entries()) {
    await inspector.locator('[name="position.' + i + '"]').fill(String(coordinate));
  }
  if(Object.keys(dials).length) await inspector.getByText('Declaration',{exact:true}).click();
  for(const [dial,value] of Object.entries(dials)) {
    await inspector.locator('[name="score.' + dial + '"]').selectOption(String(value));
  }
  await inspector.getByRole('button',{name:/Apply draft edits|Save draft edits/}).click();
  await page.waitForFunction(({kind,name})=>__atlas.build.draft?.pieces.some(piece=>
    piece.kind===kind && (piece.settings?.title===name || piece.block?.title===name)),{kind,name});
  return page.evaluate(({kind,name})=>__atlas.build.draft.pieces.find(piece=>
    piece.kind===kind && (piece.settings?.title===name || piece.block?.title===name)).id,{kind,name});
}

async function moveBuiltPiece(page,dock,piece,z) {
  await dock.locator('[data-builder-action=panel][data-value=outline]').click();
  await dock.locator('[data-builder-action=select][data-value=' + JSON.stringify(piece) + ']').click();
  const inspector=dock.locator('[data-builder-form=piece]');
  await inspector.locator('[name="position.2"]').fill(String(z));
  await inspector.getByRole('button',{name:/Apply draft edits|Save draft edits/}).click();
  await page.waitForFunction(({piece,z})=>__atlas.build.draft?.pieces.find(item=>item.id===piece)?.transform.position[2]===z,{piece,z});
}

async function publish(page,dock) {
  await dock.getByRole('button',{name:'Review & publish',exact:true}).click();
  await dock.getByRole('heading',{name:'Review publication',exact:true}).waitFor();
  await dock.getByRole('button',{name:'Publish this draft',exact:true}).click();
  await dock.locator('.builder-status').filter({hasText:/^Published/}).waitFor();
  await page.waitForFunction(()=>!__atlas.build.draft?.dirty);
  await dock.getByRole('button',{name:'Back to visiting',exact:true}).click();
  await page.waitForFunction(()=>!document.body.classList.contains('build-mode')&&__atlas.state().viewpoint.ready);
}

async function catalog(page,home,piece) {
  return page.evaluate(async ({home,piece,title})=>{
    const {ROOMS,EDGES}=await import('./src/data.js');
    const parent=ROOMS[home];
    const shell=parent?.kitPieces?.find(item=>item.id===piece);
    const maybeHall=ROOMS[shell?.ref?.placeId];
    const child=maybeHall?.id!==home&&maybeHall?.title===title?maybeHall:null;
    const hall=child??Object.values(ROOMS).find(room=>
      room.id!==home && room.title===title && (room.parentPlaceId===home||room.layout?.interior?.parent===home));
    const paths=hall?EDGES.filter(edge=>edge.from===home&&edge.to===hall.id):[];
    const slab=parent?.blocks.find(block=>block.id===piece);
    return {parent:{id:parent?.id,title:parent?.title,scene:parent?.layout.scene,
      oldSlab:!!slab,slabContent:slab?.content,slabBody:slab?.body},shell,paths,
      hall:hall?{id:hall.id,title:hall.title,address:hall.address,ownerId:hall.ownerId,parentPlaceId:hall.parentPlaceId,
        builderStructure:hall.builderStructure,
        content:hall.content,body:hall.substance.body,layout:hall.layout,blocks:hall.blocks.map(({id,title,body})=>({id,title,body}))}:null};
  },{home,piece,title});
}

function assertStructure(records,home,owner) {
  const {hall,parent,shell,paths}=records;
  assert.ok(hall?.id && hall?.layout?.interior,'The publication must register the hall’s own interior Place');
  assert.notEqual(hall.id,home);
  assert.notEqual(hall.title,parent.title);
  assert.equal(hall.parentPlaceId,home);
  assert.equal(hall.ownerId,owner);
  assert.equal(shell.ref.placeId,hall.id);
  assert.equal(parent.oldSlab,false,'The parent must not expose the old slab Thing after structural projection');
  assert.equal(paths.length,1);
  assert.equal(paths[0].type,'door');
  assert.equal(paths[0].id,hall.layout.interior.edge);
  assert.equal(hall.layout.scene,parent.scene);
  assert.notEqual(hall.layout.interior.scene,parent.scene);
  assert.ok(hall.layout.interior.width>0 && hall.layout.interior.depth>0);
  assert.ok(hall.layout.interior.arrival.position.every(Number.isFinite));
}

async function showMap(page) {
  await page.locator('#atlas-button').click();
  await page.locator('#atlas-map').waitFor();
}

async function builderReceipts(page) {
  return page.evaluate(async ()=>{
    const {BUILDER_STORAGE}=await import('./src/builder.js');
    const {verifyChain}=await import('./src/ledger.js');
    const raw=localStorage.getItem(BUILDER_STORAGE);
    const receipts=JSON.parse(raw).receipts;
    return {raw,valid:(await verifyChain(receipts)).valid,ids:receipts.map(receipt=>receipt.hash),
      publications:receipts.filter(receipt=>receipt.action==='build_published').map(receipt=>({
        id:'builder:'+receipt.hash,place:receipt.diff.roomKey,time:receipt.time,things:receipt.diff.ownedRecordVersions??[]
      }))};
  });
}

async function checkBuildStamp(page,expected) {
  const stamp=await page.evaluate(()=>atlasDiagnostics().build);
  assert.ok(stamp,'Diagnostics must identify the loaded build');
  if(expected) assert.equal(stamp,expected);
  return stamp;
}

async function typeAddress(page,address) {
  if (!await addressForm(page).evaluate(node=>node.open)) await addressForm(page).locator('summary').click();
  await page.locator('#atlas-address input').fill(address);
  await page.locator('#atlas-address button').click();
}

async function confirmManualRoute(page) {
  for(let n=0;n<12 && await page.locator('[data-preview],[data-invite]').count();n++) {
    const invite=page.locator('[data-invite]').first();
    if(await invite.count()) await invite.click();
    else {
      await page.locator('[data-preview]').first().click();
      await page.locator('[data-confirm]').click();
    }
  }
  await page.locator('#travel-go').click();
  await page.waitForFunction(()=>{
    const error=document.querySelector('#travel-error')?.textContent;
    if(error) throw new Error(error);
    return !__atlas.travel.active && !__atlas.travel.session;
  });
}

async function tapHallFrontage(page, door) {
  const point=await page.evaluate(async door=>{
    const {PerspectiveCamera,Vector3}=await import('./vendor/three/three.module.min.js');
    const {position,viewpoint}=__atlas.state();
    const camera=new PerspectiveCamera(viewpoint.fov,innerWidth/innerHeight,.08,110);
    camera.position.set(position.x,position.y,position.z);
    camera.lookAt(camera.position.clone().add(new Vector3(...viewpoint.direction)));
    camera.updateMatrixWorld(true);
    const front=new Vector3(door[0],1.55,door[1]).project(camera);
    return [(front.x+1)*innerWidth/2,(1-front.y)*innerHeight/2];
  },door);
  await page.mouse.click(...point);
}

async function enterDoor(page,{hall,parent,paths}) {
  await showMap(page);
  await typeAddress(page,hall.address);
  await page.locator('#travel-arrival').selectOption('door');
  await confirmManualRoute(page);
  await page.waitForFunction(id=>atlasStatus().room===id,parent.id);
  const outside=await page.evaluate(()=>{
    const {room,scene,position,drawCalls}=atlasStatus();
    return {room,scene,position,drawCalls};
  });
  assert.equal(outside.scene,parent.scene);
  const prompt=page.locator('#edge-prompt').filter({hasText:hall.title});
  await prompt.waitFor();
  await tapHallFrontage(page,hall.layout.interior.frontage.door);
  await page.locator('#hall-enter').waitFor();
  assert.equal(await page.locator('#sheet-title').innerText(),hall.title);
  assert.equal(await page.locator('#sheet-content .address').innerText(),hall.address);
  assert.equal(await page.evaluate(()=>atlasStatus().room),parent.id);
  await page.locator('#hall-enter').click();
  const agreement=page.locator('[data-words-agree=' + JSON.stringify(paths[0].id) + ']');
  const filtered=page.locator('[data-words-filtered=' + JSON.stringify(paths[0].id) + ']');
  if(await agreement.isVisible()) await agreement.click();
  else if(await filtered.isVisible()) await filtered.click();
  await page.waitForFunction(id=>{
    const error=document.querySelector('#travel-words-message')?.textContent;
    if(error) throw new Error(error);
    return atlasStatus().room===id&&!__atlas.travel.active;
  },hall.id);
  const arrived=await page.evaluate(hall=>{
    const {room,scene,position,drawCalls}=atlasStatus();
    const {width,depth}=hall.layout.interior;
    return {room,scene,position,drawCalls,inside:__atlas.state().context.inside,
      arrivalIsStandable:__atlas.canStand(position.x,position.z),
      wallsBlockAnOutsidePosition:!__atlas.canStand(width/2+.1,0)&&!__atlas.canStand(0,depth/2+.1),
      receipts:(__atlas.access.data.ledgers[hall.id]??[]).filter(entry=>
        entry.action==='access_used'&&entry.actor===__atlas.state().activeProfile&&
        entry.diff.scope==='enter'&&entry.diff.arrival==='inside'&&entry.diff.arrivalRoom===hall.id)
        .map(entry=>entry.hash)};
  },hall);
  assert.equal(arrived.scene,hall.layout.interior.scene);
  assert.equal(arrived.inside,hall.title);
  assert.deepEqual([arrived.position.x,arrived.position.z],hall.layout.interior.arrival.position);
  assert.ok(arrived.arrivalIsStandable && arrived.wallsBlockAnOutsidePosition);
  assert.ok(arrived.receipts.length>0,'A separate enter Receipt belongs to the hall');
  return {outside,arrived,path:paths[0].id};
}

async function readExhibit(page,records,exhibit) {
  const {hall}=records;
  const marker='exhibit:'+hall.id+':'+exhibit;
  const sign=await page.evaluate(marker=>
    __atlas.scene().getObjectByName('Builder sign faces')?.userData.signFaces.find(face=>face.id===marker),marker);
  assert.equal(sign?.text,exhibitText);
  await showMap(page);
  await page.locator('#map-here').filter({hasText:title}).waitFor();
  assert.equal(await mapNode(page,hall.id).getAttribute('aria-current'),'location');
  const thing=page.locator('[data-map-thing=' + JSON.stringify(exhibit) + ']');
  assert.equal(await thing.getAttribute('data-thing-room'),hall.id);
  await thing.click();
  assert.equal(await page.locator('#sheet-title').innerText(),exhibitTitle);
  assert.match(await page.locator('#sheet-content').innerText(),new RegExp(exhibitText));
  const ref=JSON.parse(await page.locator('#sheet-content [data-standing-open]').getAttribute('data-standing-open'));
  assert.equal(ref.placeId,hall.id);
  assert.equal(ref.thingId,exhibit);
  await page.locator('#sheet-close').click();
  return {ref,marker};
}

async function switchProfile(page,profile) {
  await page.locator('#profile-chip').click();
  await page.locator('[data-profile=' + JSON.stringify(profile) + ']').click();
  await page.waitForFunction(profile=>__atlas.state().activeProfile===profile && document.querySelector('#sheet').hidden,profile);
}

async function verifyRefused(page,records,profile) {
  const {hall,paths}=records;
  await switchProfile(page,profile);
  const before=await page.evaluate(()=>atlasStatus().room);
  if(process.env.ATLAS_ALLOW_PRIOR_PARENT_FALLBACK!=='1') {
    assert.equal(before,'square','The private containing Home is not a fallback for an unrelated profile');
  }
  await showMap(page);
  assert.equal(await mapNode(page,hall.id).count(),0);
  assert.equal(await page.locator('[data-map-edge=' + JSON.stringify(paths[0].id) + ']').count(),0);
  await typeAddress(page,hall.address);
  const refusal=page.locator('#atlas-address-message');
  await refusal.filter({hasText:/No accessible room at that address/i}).waitFor();
  assert.equal(await page.evaluate(()=>atlasStatus().room),before);
  assert.notEqual(before,hall.id);
  const crossed=await page.evaluate(({profile,place})=>(__atlas.access.data.ledgers[place]??[]).some(entry=>
    entry.actor===profile&&entry.action==='access_used'&&entry.diff.scope==='enter'),{profile,place:hall.id});
  assert.equal(crossed,false);
  const message=await refusal.innerText();
  await page.locator('#sheet-close').click();
  return {profile,roomBeforeRequest:before,message};
}

async function checkNew(browser,url) {
  const context=await browser.newContext(contextOptions);
  const {page,errors,liveCalls,open}=await observe(context,url);
  try {
    await open();
    const {home,owner}=await arrive(page);
    const build=await checkBuildStamp(page,process.env.ATLAS_EXPECT_STAMP);
    const dock=await openBuild(page,home);
    const piece=await addBuiltPiece(page,dock,{kind:'interior-shell',name:title,position:shellPosition});
    const draft=await catalog(page,home,piece);
    assert.equal(draft.hall,null);
    assert.equal(draft.paths.length,0);
    await publish(page,dock);
    const records=await catalog(page,home,piece);
    assertStructure(records,home,owner);
    await showMap(page);
    assert.equal(await mapNode(page,records.hall.id).count(),1);
    assert.equal(await page.locator('[data-map-edge=' + JSON.stringify(records.paths[0].id) + ']').count(),1);
    assert.equal(await page.locator('[data-map-thing=' + JSON.stringify(piece) + ']').count(),0);
    await page.locator('#sheet-close').click();
    console.log('PASS structural publication registers a distinct Place and one containing door on the live Map');

    const crossing=await enterDoor(page,records);
    const hallDock=await openBuild(page,records.hall.id);
    const exhibit=await addBuiltPiece(page,hallDock,{kind:'sign',name:exhibitTitle,text:exhibitText,position:[-2,0,0]});
    await publish(page,hallDock);
    const subject=await readExhibit(page,records,exhibit);
    assert.notEqual(subject.ref.placeId,home);
    const beforeReload=await builderReceipts(page);
    assert.ok(beforeReload.valid);
    console.log('PASS owner crosses the physical door, lands inside bounded space, and publishes a hall-local Thing');

    await page.reload();
    await page.waitForFunction(()=>window.__atlas && __atlas.state().viewpoint.ready);
    await checkBuildStamp(page,build);
    const reopened=await catalog(page,home,piece);
    assertStructure(reopened,home,owner);
    assert.equal(reopened.hall.id,records.hall.id);
    assert.equal(reopened.paths[0].id,records.paths[0].id);
    assert.ok(reopened.hall.blocks.some(block=>block.id===exhibit&&block.body===exhibitText));
    assert.deepEqual(await builderReceipts(page),beforeReload);
    if(await page.evaluate(()=>atlasStatus().room)!==reopened.hall.id) await enterDoor(page,reopened);
    assert.deepEqual(await readExhibit(page,reopened,exhibit),subject);
    const refused=[];
    for(const profile of ['seed-visitor','seed-verified']) refused.push(await verifyRefused(page,reopened,profile));
    console.log('PASS reload restores the same child records and unauthorised profiles cannot find or enter the hall');
    assert.deepEqual(liveCalls,[]);
    assert.deepEqual(errors,[]);
    const publicationReceipt=beforeReload.publications.findLast(row=>row.place===home)?.id;
    const interiorPublicationReceipt=beforeReload.publications.findLast(row=>row.place===records.hall.id)?.id;
    assert.ok(publicationReceipt && interiorPublicationReceipt);
    return {build,home,owner,piece,hall:records.hall.id,path:records.paths[0].id,publicationReceipt,
      interiorPublicationReceipt,crossing,subject,refused,liveCalls:liveCalls.length,errors};
  } catch(error) {
    await failureState(page,errors);
    throw error;
  } finally {await context.close();}
}

async function checkLegacy(browser,url,legacyURL) {
  assert.ok(legacyURL,'Set ATLAS_LEGACY_URL to a locally served pre-structural commit');
  const origin=await browser.newContext(contextOptions);
  const legacy=await observe(origin,legacyURL);
  let old;
  try {
    await legacy.open();
    const {home,owner}=await arrive(legacy.page);
    const dock=await openBuild(legacy.page,home);
    const piece=await addBuiltPiece(legacy.page,dock,{
      kind:'interior-shell',name:title,position:shellPosition,dials:{'sensory.amount':1,'sensory.graphicness':0}
    });
    await publish(legacy.page,dock);
    const moveDock=await openBuild(legacy.page,home);
    await moveBuiltPiece(legacy.page,moveDock,piece,-1);
    await publish(legacy.page,moveDock);
    const slab=await catalog(legacy.page,home,piece);
    assert.equal(slab.parent.oldSlab,true);
    assert.equal(slab.hall,null);
    assert.deepEqual(slab.parent.slabContent.sensory,{amount:1,graphicness:0});
    const storage=await legacy.page.evaluate(()=>Object.entries(localStorage));
    const original=await builderReceipts(legacy.page);
    assert.ok(original.valid);
    const publications=original.publications.filter(row=>row.place===home&&row.things.some(thing=>thing.thingId===piece));
    assert.equal(publications.length,2);
    const thing=publications[0].things.find(item=>item.thingId===piece);
    assert.deepEqual(publications[1].things.find(item=>item.thingId===piece),thing);
    const relation={thing,publicationReceiptRef:publications[0].id,placementReceiptRef:publications[1].id};
    assert.notEqual(relation.publicationReceiptRef,relation.placementReceiptRef);
    const build=await checkBuildStamp(legacy.page,process.env.ATLAS_LEGACY_EXPECT_STAMP);
    assert.deepEqual(legacy.errors,[]);
    assert.deepEqual(legacy.liveCalls,[]);
    old={home,owner,piece,storage,original,build,relation,position:slab.shell.transform.position,
      content:slab.parent.slabContent,body:slab.parent.slabBody};
    console.log('PASS prior release publishes and moves the same legacy slab version without any child Place');
  } finally {await origin.close();}

  const next=await browser.newContext(contextOptions);
  const fresh=await observe(next,url);
  try {
    await fresh.page.addInitScript(storage=>{
      if(sessionStorage.getItem('structural-hall-fixture'))return;
      for(const [key,value] of storage) localStorage.setItem(key,value);
      sessionStorage.setItem('structural-hall-fixture','restored');
    },old.storage);
    await fresh.open();
    await fresh.page.waitForFunction(()=>window.__atlas && __atlas.state().viewpoint.ready);
    const build=await checkBuildStamp(fresh.page,process.env.ATLAS_EXPECT_STAMP);
    const recovered=await catalog(fresh.page,old.home,old.piece);
    assertStructure(recovered,old.home,old.owner);
    assert.deepEqual(recovered.hall.content,old.content);
    assert.equal(recovered.hall.body,old.body);
    assert.deepEqual(recovered.shell.transform.position,old.position);
    assert.deepEqual(recovered.hall.builderStructure.recoveredFrom,old.relation);
    const after=await builderReceipts(fresh.page);
    assert.deepEqual(after,old.original);
    const crossing=await enterDoor(fresh.page,recovered);
    await fresh.page.reload();
    await fresh.page.waitForFunction(()=>window.__atlas && __atlas.state().viewpoint.ready);
    await checkBuildStamp(fresh.page,build);
    const second=await catalog(fresh.page,old.home,old.piece);
    assertStructure(second,old.home,old.owner);
    assert.equal(second.hall.id,recovered.hall.id);
    assert.equal(second.paths[0].id,recovered.paths[0].id);
    assert.deepEqual(second.hall.builderStructure.recoveredFrom,old.relation);
    assert.deepEqual(await builderReceipts(fresh.page),old.original);
    assert.deepEqual(fresh.errors,[]);
    assert.deepEqual(fresh.liveCalls,[]);
    console.log('PASS a genuinely published legacy slab recovers to one durable structural Place and door');
    return {build,legacyBuild:old.build,
      home:old.home,piece:old.piece,hall:recovered.hall.id,path:recovered.paths[0].id,
      originalPublicationReceipt:old.relation.publicationReceiptRef,
      publicationReceipts:after.publications,structure:recovered.hall.builderStructure,crossing,
      liveCalls:fresh.liveCalls.length,errors:fresh.errors};
  } catch(error) {
    await failureState(fresh.page,fresh.errors);
    throw error;
  } finally {await next.close();}
}

(async()=>{
  const pin=process.env.ATLAS_TEST_SPKI;
  const browser=await chromium.launch({
    executablePath:process.env.ATLAS_CHROMIUM||'/usr/bin/chromium',headless:true,
    args:['--no-sandbox','--enable-unsafe-swiftshader',...(pin?['--ignore-certificate-errors-spki-list='+pin]:[])]
  });
  try {
    const url=process.env.ATLAS_URL||'http://127.0.0.1:8000/';
    const result=process.env.ATLAS_HALL_SCENARIO==='legacy'
      ? await checkLegacy(browser,url,process.env.ATLAS_LEGACY_URL) : await checkNew(browser,url);
    if(process.env.ATLAS_EVIDENCE_FILE) await writeFile(process.env.ATLAS_EVIDENCE_FILE,JSON.stringify(result,null,2)+'\n');
    console.log(JSON.stringify(result));
  } finally {await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
