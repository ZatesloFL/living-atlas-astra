const assert = require('node:assert/strict');
const {writeFile} = require('node:fs/promises');
const {chromium} = require(process.env.ATLAS_PLAYWRIGHT_MODULE || 'playwright-core');
const {enterPlaceByAddress} = require('./atlas-build-browser-controls.cjs');

const title = 'Trail Notice';
const signText = 'BLUE GATE';
const savedURL = 'https://drive.google.com/drive/folders/synthetic-builder-experience';

async function arrive(page) {
  await page.locator('#setup-form [name=name]').fill('Synthetic Builder experience owner');
  await page.locator('#setup-form [name=age]').fill('34');
  await page.locator('#setup-form button[type=submit]').click();
  await page.locator('#arrival-interview [name=sources]').fill(savedURL);
  await page.locator('#arrival-interview-next').click();
  await page.locator('#arrival-lens-next').click();
  await page.locator('[name=arrival-start][value=scratch]').check();
  await page.locator('#arrival-create').click();
  await page.waitForFunction(() => atlasStatus().room.startsWith('home/') && document.querySelector('#sheet').hidden);
  return page.evaluate(() => ({room: atlasStatus().room, owner: __atlas.state().lens.profileId}));
}

async function drawn(page, {room, piece, preview = false}) {
  return page.evaluate(({room, piece, preview}) => {
    const scene = preview ? __atlas.buildScene() : __atlas.scene();
    if (!scene) return null;
    const marker = 'exhibit:' + room + ':' + piece;
    let geometry = false;
    scene.traverse(box => {
      if (box.userData.id === marker || box.userData.ids?.includes(marker) || box.userData.faceIds?.includes(marker)) geometry = true;
    });
    return {
      geometry,
      room: scene.userData.view?.rooms?.find(record => record.id === room) ?? null,
      signFace: scene.getObjectByName('Builder sign faces')?.userData.signFaces?.find(face => face.id === marker) ?? null,
    };
  }, {room, piece, preview});
}

async function faceInView(page, room, piece, pose) {
  return page.evaluate(async ({room, piece, pose}) => {
    const T = await import('./vendor/three/three.module.min.js');
    const marker = 'exhibit:' + room + ':' + piece;
    const mesh = __atlas.scene().getObjectByName('Builder sign faces');
    const faceIds = mesh?.userData.faceIds;
    if (!faceIds?.includes(marker)) throw new Error('No sign face geometry is available in Visit');

    const w = innerWidth, h = innerHeight;
    const {position, viewpoint} = __atlas.state();
    const camera = new T.PerspectiveCamera(viewpoint.fov, w / h, .08, 112);
    camera.position.set(position.x, position.y, position.z);
    camera.rotation.set(pose?.pitch ?? .065, pose?.yaw ?? __atlas.viewpoint.entry().yaw, 0, 'YXZ');
    camera.updateMatrixWorld();
    mesh.updateMatrixWorld();
    const vertices = mesh.geometry.getAttribute('position'), index = mesh.geometry.getIndex();
    const uv = mesh.geometry.getAttribute('uv'), face = faceIds.indexOf(marker);
    const vertexIds = [...new Set(faceIds.flatMap((id, face) => id === marker ? [0, 1, 2].map(offset => index.getX(face * 3 + offset)) : []))];
    const project = value => {
      const point = value.clone().applyMatrix4(mesh.matrixWorld).project(camera);
      return [(point.x + 1) * w / 2, (1 - point.y) * h / 2];
    };
    const box = points => {
      const minX = Math.min(...points.map(point => point[0])), maxX = Math.max(...points.map(point => point[0]));
      const minY = Math.min(...points.map(point => point[1])), maxY = Math.max(...points.map(point => point[1]));
      return {center: [(minX + maxX) / 2, (minY + maxY) / 2],
        clip: {x: Math.floor(Math.max(0, minX)), y: Math.floor(Math.max(0, minY)),
          width: Math.floor(Math.min(w, maxX) - Math.max(0, minX)), height: Math.floor(Math.min(h, maxY) - Math.max(0, minY))},
        withinViewport: minX >= 0 && minY >= 0 && maxX <= w && maxY <= h};
    };
    const readVertex = id => new T.Vector3().fromBufferAttribute(vertices, id);
    const board = box(vertexIds.map(id => project(readVertex(id))));
    const [first, right, far] = [0, 1, 2].map(n => index.getX(face * 3 + n));
    const canvas = mesh.material.map.image;
    const u0 = uv.getX(first), u1 = uv.getX(right), v0 = uv.getY(first), v1 = uv.getY(far);
    const atlasX = Math.floor(u0 * canvas.width), atlasY = Math.floor((1 - v1) * canvas.height);
    const tileW = Math.ceil(u1 * canvas.width) - atlasX, tileH = Math.ceil((1 - v0) * canvas.height) - atlasY;
    const {data} = canvas.getContext('2d').getImageData(atlasX, atlasY, tileW, tileH);
    let x0 = tileW, x1 = -1, y0 = tileH, y1 = -1;
    for (let y = 0; y < tileH; y++) for (let x = 0; x < tileW; x++) {
      const at = (y * tileW + x) * 4;
      if (data[at] >= 70 || data[at + 1] >= 90 || data[at + 2] >= 80) continue;
      x0 = Math.min(x, x0); x1 = Math.max(x + 1, x1);
      y0 = Math.min(y, y0); y1 = Math.max(y + 1, y1);
    }
    if (x1 < x0 || y1 < y0) throw new Error('The sign texture contains no dark lettering');
    const base = readVertex(first), span = readVertex(right).sub(base), rise = readVertex(far).sub(readVertex(right));
    const ink = box([[x0,y0],[x1,y0],[x1,y1],[x0,y1]].map(([x,y]) =>
      project(base.clone().addScaledVector(span, ((atlasX + x) / canvas.width - u0) / (u1 - u0))
        .addScaledVector(rise, ((1 - (atlasY + y) / canvas.height) - v0) / (v1 - v0)))));
    return {board, ink};
  }, {room, piece, pose});
}

async function publicationReceipt(page, room) {
  return page.evaluate(async room => {
    const {verifyChain} = await import('./src/ledger.js');
    const {BUILDER_STORAGE} = await import('./src/builder.js');
    const {receipts} = JSON.parse(localStorage.getItem(BUILDER_STORAGE));
    const receipt = receipts.findLast(record => record.action === 'build_published' && record.diff.roomKey === room);
    return {id: receipt && 'builder:' + receipt.hash, time: receipt?.time, chain: (await verifyChain(receipts)).valid};
  }, room);
}

async function chooseProfile(page, profileId) {
  await page.locator('#profile-chip').click();
  await page.locator('[data-profile="' + profileId + '"]').click();
  await page.waitForFunction(id => __atlas.state().lens.profileId === id && document.querySelector('#sheet').hidden, profileId);
}

async function outsiderAtAddress(page, profileId, home, piece) {
  await chooseProfile(page, profileId);
  await page.locator('#atlas-button').click();
  await page.getByText('Exact address · manual', {exact: true}).click();
  await page.locator('#atlas-address input').fill(home);
  await page.locator('#atlas-address button').click();
  const refused = page.locator('#atlas-address-message');
  await refused.filter({hasText: /No accessible room at that address/i}).waitFor();
  const evidence = await page.evaluate(async ({home, piece}) => {
    const {thingSubject} = await import('./src/thing-subject.js');
    const state = __atlas.state();
    return {profile: state.lens.profileId, backing: state.lens.identity.backing, display: state.lens.identity.display,
      room: state.room, foundThing: !!thingSubject(home, piece, state.lens)};
  }, {home, piece});
  assert.notEqual(evidence.room, home);
  assert.equal(evidence.foundThing, false);
  assert.equal((await drawn(page, {room: home, piece})).geometry, false);
  const message = await refused.innerText();
  await page.locator('#sheet-close').click();
  return {...evidence, message};
}

(async () => {
  const browser = await chromium.launch({executablePath: process.env.ATLAS_CHROMIUM || '/usr/bin/chromium', headless: true,
    args: ['--no-sandbox', '--enable-unsafe-swiftshader',
      ...(process.env.ATLAS_TEST_SPKI ? ['--ignore-certificate-errors-spki-list=' + process.env.ATLAS_TEST_SPKI] : [])]});
  const page = await browser.newPage({viewport: {width: 524, height: 1166}, hasTouch: true, isMobile: true, reducedMotion: 'reduce'});
  const errors = [], calls = [], evidence = {};
  page.on('pageerror', error => errors.push(error.message));
  await page.route('**/functions/v1/**', route => {
    calls.push(new URL(route.request().url()).pathname);
    return route.abort();
  });
  await page.route('https://drive.google.com/**', route => {
    calls.push('Drive fetch');
    return route.abort();
  });
  try {
    await page.goto((process.env.ATLAS_URL || 'http://127.0.0.1:8000/') + '?safe&test&ai=local');
    const {room: home, owner} = await arrive(page);
    const dock = page.locator('#builder-hud');
    const tab = async name => {
      const button = dock.locator('[data-builder-action=panel][data-value="' + name + '"]');
      if (await button.getAttribute('aria-pressed') !== 'true') await button.click();
    };
    const build = () => page.locator('#build-button').click();
    const visit = () => dock.getByRole('button', {name: 'Back to visiting', exact: true}).click();
    const preview = async profile => {
      await tab('audience');
      const contender = dock.locator('[data-preview-profile="' + profile + '"]');
      if (await contender.getAttribute('aria-pressed') !== 'true') await contender.click();
      await page.waitForFunction(() => !__atlas.build.busy);
      const view = dock.locator('[data-builder-action=view-preview]');
      if (await view.isEnabled()) await view.click();
    };
    const returnToDraft = async () => {
      const button = dock.locator('[data-builder-action=return-draft]').first();
      if (await button.isVisible()) await button.click();
    };

    await build();
    await tab('sources');
    await dock.getByRole('button', {name: 'Connected sources', exact: true}).click();
    const sources = page.getByRole('dialog', {name: 'Connected sources'});
    await sources.locator('[data-sources-tab=inspector]').click();
    const saved = sources.locator('[data-arrival-sources]');
    assert.match(await saved.innerText(), /Saved for your Drive room/);
    const listed = saved.locator('[data-arrival-source-ref]');
    assert.equal(await listed.locator('strong').innerText(), savedURL);
    assert.match(await listed.innerText(), /not connected|not synced/i);
    evidence.arrivalSource = {place: 'starter Home', state: await listed.innerText(), url: savedURL};
    await sources.getByRole('button', {name: 'Close connected sources'}).click();
    console.log('PASS Home Sources inspector displays the owner’s saved Drive reference');

    await tab('kit');
    await dock.getByRole('button', {name: /^Sign/}).click();
    await dock.getByRole('button', {name: 'Place at center'}).click();
    const inspector = dock.locator('[data-builder-form=piece]');
    await inspector.locator('[name=title]').fill(title);
    await inspector.locator('[name="settings.text"]').fill(signText);
    await inspector.locator('[name="position.2"]').fill('1');
    await inspector.getByRole('button', {name: 'Apply draft edits'}).click();
    await page.waitForFunction(text => __atlas.build.draft.pieces.some(piece => piece.kind === 'sign' && piece.settings.text === text), signText);
    const piece = await page.evaluate(() => __atlas.build.draft.pieces.find(piece => piece.kind === 'sign').block.id);
    assert.equal((await drawn(page, {room: home, piece, preview: true})).signFace?.text, signText);

    // Reach the draft through ordinary Visit. The published catalog remains a separate record.
    await visit();
    await page.waitForFunction(() => !document.body.classList.contains('build-mode') && __atlas.state().viewpoint.ready);
    const ownerDraft = await drawn(page, {room: home, piece});
    assert.ok(ownerDraft.geometry && ownerDraft.room?.draft, 'The normal owner World draws the private draft');
    assert.equal(ownerDraft.signFace?.text, signText);
    const marker = 'exhibit:' + home + ':' + piece;
    const draftLabel = page.locator('#world-labels [data-room="' + marker + '"]');
    await page.locator('#builder-visit-draft').filter({hasText: /only you can see these changes/i}).waitFor();
    assert.match(await draftLabel.textContent(), /draft/i);
    assert.equal(await page.evaluate(async ({home, piece}) => (await import('./src/data.js')).ROOMS[home].blocks.some(b => b.id === piece), {home, piece}), false);

    // Tap the sign in the actual canvas, then use its card’s ordinary movement action.
    const fromEntrance = await faceInView(page, home, piece);
    await page.mouse.click(...fromEntrance.ink.center);
    await page.locator('#thing-closer').waitFor();
    assert.equal(await page.locator('#sheet-title').innerText(), title);
    const plan = await page.evaluate(({home, piece}) => __atlas.viewpoint.plan(home, piece), {home, piece});
    assert.ok(plan?.spot, 'The draft sign has a standable in-room viewing spot');
    await page.locator('#thing-closer').click();
    await page.locator('#viewpoint-confirm').click();
    await page.waitForFunction(({room, x, z}) => {
      const state = __atlas.state();
      return state.room === room && document.querySelector('#sheet').hidden && Math.hypot(state.position.x - x, state.position.z - z) < .02;
    }, {room: home, x: plan.spot.position[0], z: plan.spot.position[2]});
    const closeFace = await faceInView(page, home, piece, plan.spot);
    evidence.ownerDraft = {marked: await draftLabel.textContent(), thingTitle: title, signFace: ownerDraft.signFace, spot: plan.spot, pixels: closeFace};
    if (process.env.ATLAS_SIGN_SCREENSHOT) await page.screenshot({path: process.env.ATLAS_SIGN_SCREENSHOT, clip: closeFace.board.clip});
    assert.ok(closeFace.ink.withinViewport && closeFace.ink.clip.width > 42 && closeFace.ink.clip.height > 16,
      'The physical lettering fits at the viewing spot: ' + JSON.stringify(evidence.ownerDraft));
    console.log('PASS owner Visit draws the marked draft; real card frames the authored sign face');

    await build();
    await preview(owner);
    await dock.getByRole('heading', {name: 'Audience preview', exact: true}).waitFor();
    const ownerPreview = await drawn(page, {room: home, piece, preview: true});
    assert.equal(ownerPreview?.signFace?.text, signText);
    await returnToDraft();
    await preview('seed-verified');
    await dock.locator('[data-audience-result]').getByText('Others see nothing because this Place is private.', {exact: true}).waitFor();
    assert.equal((await drawn(page, {room: home, piece, preview: true})).geometry, false);
    await returnToDraft();

    await dock.locator('[data-builder-action=review]').click();
    const headline = dock.locator('#publication-audience-title');
    await headline.waitFor();
    evidence.headline = (await headline.innerText()).trim();
    assert.equal(evidence.headline, 'Only you — this place is private');
    const publishRegion = dock.locator('[data-publication-audience]');
    const where = await page.evaluate(async home => (await import('./src/data.js')).ROOMS[home].title, home);
    assert.ok((await publishRegion.innerText()).includes(`Publishes in ${where}.`));
    assert.ok(await headline.evaluate(heading => !!(heading.compareDocumentPosition(heading.parentElement.querySelector('[data-audience-counts]')) & Node.DOCUMENT_POSITION_FOLLOWING)));
    evidence.publicationLocation = where;
    await dock.locator('[data-builder-action=show-others]').click();
    await dock.locator('[data-audience-result]').getByText('Others see nothing because this Place is private.', {exact: true}).waitFor();
    assert.equal((await drawn(page, {room: home, piece, preview: true})).geometry, false);
    await returnToDraft();
    await dock.locator('[data-builder-action=review]').click();
    await dock.locator('[data-builder-action=publish]').click();
    await dock.locator('.builder-status').filter({hasText:/Published/i}).waitFor();
    const status = await dock.locator('.builder-status').innerText();
    const receipt = await publicationReceipt(page, home);
    assert.ok(receipt.id && receipt.chain);
    assert.equal(status, 'Published · Receipt ' + receipt.id.split(':').at(-1).slice(0, 8));
    const record = dock.locator('[data-publication-record]');
    await record.locator('summary').click();
    assert.equal(await record.locator('code').innerText(), receipt.id);
    evidence.receipt = {status, ...receipt};
    console.log('PASS publication review headline:', evidence.headline, '|', status);

    await visit();
    await page.waitForFunction(() => __atlas.state().viewpoint.ready);
    const published = await drawn(page, {room: home, piece});
    assert.equal(published.signFace?.text, signText);
    assert.ok(!published.room?.draft && !/draft/i.test(await draftLabel.textContent()));
    evidence.ownerAfterPublish = {room: home, signFace: published.signFace, markedDraft: !!published.room?.draft};
    evidence.lurkerAfterPublish = await outsiderAtAddress(page, 'seed-visitor', home, piece);
    assert.equal(evidence.lurkerAfterPublish.display, 'anonymous');
    assert.equal(evidence.lurkerAfterPublish.backing, 'none');
    evidence.adultAfterPublish = await outsiderAtAddress(page, 'seed-verified', home, piece);
    assert.equal(evidence.adultAfterPublish.backing, 'verified');
    console.log('PASS owner sees published sign; unverified anonymous view and verified adult cannot find it');

    await chooseProfile(page, owner);
    await enterPlaceByAddress(page, home);
    assert.equal((await drawn(page, {room: home, piece})).signFace?.text, signText);

    // The private publication check is complete. Add narrow local fixture
    // invitations to verify both selected visitors actually get their own Lens.
    await build();
    await tab('outline');
    await dock.locator('[data-builder-action=select][data-value="' + piece + '"]').click();
    await inspector.getByText('Declaration', {exact: true}).click();
    await inspector.locator('[name="score.sensory.amount"]').selectOption('2');
    await inspector.getByRole('button', {name: 'Apply draft edits'}).click();
    await page.waitForFunction(id => __atlas.build.draft.pieces.find(p => p.id === id)?.block.content.sensory.amount === 2, piece);
    await dock.locator('[data-builder-action=review]').click();
    await dock.locator('[data-builder-action=manage-access]').first().click();
    for (const id of ['seed-verified', 'seed-visitor']) {
      await page.locator('#grant-person').selectOption(id);
      await page.locator('#grant-scope').selectOption('enter');
      await page.locator('#grant-person-button').click();
      await page.waitForFunction(({id, home}) => __atlas.access.data.grants.some(g => g.to.person === id && g.room === home && g.scope === 'enter'), {id, home});
    }
    await page.locator('#sheet-close').click();
    await preview('seed-verified');
    await dock.getByRole('heading', {name: 'Audience preview', exact: true}).waitFor();
    assert.equal((await drawn(page, {room: home, piece, preview: true})).signFace?.text, signText);
    await returnToDraft();
    await preview('seed-visitor');
    await dock.getByRole('heading', {name: 'Audience preview', exact: true}).waitFor();
    const withhold = await page.evaluate(id => {
      const {checks} = __atlas.build.previewState.assessment;
      return {canEnter: checks.canEnter, withheld: checks.withheld.includes(id)};
    }, piece);
    assert.deepEqual(withhold, {canEnter: true, withheld: true});
    assert.equal((await drawn(page, {room: home, piece, preview: true})).geometry, false);
    evidence.selectedLens = {verifiedAdult: 'sign drawn', unverifiedVisitor: 'entered preview; sign withheld', proposedSensoryAmount: 2};
    console.log('PASS invited audience views differ on the proposed Sensory dial');

    assert.deepEqual(calls, []);
    assert.deepEqual(errors, []);
    evidence.build = await page.evaluate(() => atlasDiagnostics().build);
    if (process.env.ATLAS_EXPECT_STAMP) assert.equal(evidence.build, process.env.ATLAS_EXPECT_STAMP);
    if (process.env.ATLAS_EVIDENCE_FILE) await writeFile(process.env.ATLAS_EVIDENCE_FILE, JSON.stringify(evidence, null, 2) + '\n');
    console.log(JSON.stringify({...evidence, calls: calls.length}));
  } catch (error) {
    console.error(await page.evaluate(() => ({room: window.atlasStatus?.().room, sheet: document.querySelector('#sheet-title')?.textContent,
      build: document.querySelector('#builder-hud')?.innerText?.slice(-1200), errors: window.atlasDiagnostics?.().errors})).catch(() => null));
    throw error;
  } finally {await browser.close();}
})().catch(error => {console.error(error);process.exitCode = 1;});
