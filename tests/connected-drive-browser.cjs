const assert = require('node:assert/strict');
const {chromium} = require(process.env.ATLAS_PLAYWRIGHT_MODULE || 'playwright-core');
const completeArrival = require('./arrival-setup.cjs');

async function enterPlace(page, placeId) {
  await page.locator('#atlas-button').click();
  await page.locator('#atlas-address input').fill(placeId);
  await page.locator('#atlas-address button').click();
  await page.locator('#travel-arrival').selectOption('inside');

  const preview = page.locator('[data-preview]');
  for (let i = 0; i < 8 && await preview.count(); i++) {
    await preview.first().click();
    await page.locator('[data-confirm]').click();
  }

  await page.locator('#travel-go').click();
  await page.waitForFunction(id => atlasStatus().room === id && !__atlas.travel.active, placeId);
}

async function mappedScene(page, placeId) {
  return page.evaluate(async id => {
    const {ROOMS} = await import('./src/data.js');
    const {sourcedRoom} = await import('./src/source-catalog.js');
    const room = sourcedRoom(ROOMS[id], __atlas.state().lens);
    const prefix = 'exhibit:' + id + ':';
    const drawn = new Set();

    __atlas.scene().traverse(object => {
      for (const pickId of object.userData.ids ?? []) {
        if (typeof pickId === 'string' && pickId.startsWith(prefix)) drawn.add(pickId.slice(prefix.length));
      }
    });

    return {
      place: atlasStatus().room,
      blocks: room.blocks.filter(block => block.source?.simulated).map(block => block.source.itemId).sort(),
      projected: (room.sourcePlacements ?? []).map(piece => ({id: piece.blockId, kind: piece.kind, position: piece.position})),
      drawn: [...drawn].sort(),
    };
  }, placeId);
}

(async () => {
  const browser = await chromium.launch({
    executablePath: '/usr/bin/chromium',
    headless: true,
    args: ['--no-sandbox', '--enable-unsafe-swiftshader'],
  });
  try {
    const page = await browser.newPage({
      viewport: {width: 524, height: 1166},
      isMobile: true,
      hasTouch: true,
      reducedMotion: 'reduce',
    });
    const errors = [];
    const liveCalls = [];
    page.on('pageerror', error => errors.push(error.message));
    page.on('request', request => {
      if (request.url().includes('/functions/v1/')) liveCalls.push(request.url());
    });

    const base = process.env.ATLAS_URL || 'http://127.0.0.1:8006/';
    await page.goto(base + '?test&safe&ai=local');
    await page.locator('#setup-form [name=name]').fill('Synthetic source owner');
    await page.locator('#setup-form [name=age]').fill('30');
    await completeArrival(page, {square: false});
    await page.waitForFunction(() => window.atlasStatus?.().room?.startsWith('home/'));
    const driveId = await page.evaluate(() => atlasStatus().room + '/drive');
    await enterPlace(page, driveId);
    assert.deepEqual((await mappedScene(page, driveId)).drawn, []);

    await page.locator('#build-button').click();
    const sourcesTab = page.getByRole('button', {name: 'Sources', exact: true});
    const connectedSources = page.getByRole('button', {name: 'Connected sources', exact: true});
    await sourcesTab.or(connectedSources).first().waitFor();
    if (await sourcesTab.isVisible()) await sourcesTab.click();
    await connectedSources.click();
    const dialog = page.getByRole('dialog', {name: 'Connected sources'});
    assert.equal(await dialog.locator('[data-current-place]').innerText(), 'Drive room');
    for (const [command, label] of [['add-gallery', 'Mock gallery'], ['add-drive', 'Mock Drive']]) {
      await dialog.locator('[data-command=' + command + ']').click();
      const source = dialog.locator('[data-source-detail]').filter({hasText: label});
      await source.getByRole('button', {name: 'Propose mapping', exact: true}).click();
      await source.getByRole('button', {name: 'Approve mapping', exact: true}).click();
      await source.getByText(/^Approved mapping/).waitFor();
    }
    await dialog.getByRole('button', {name: 'Close connected sources'}).click();
    const scene = await mappedScene(page, driveId);
    const {blocks, projected} = scene;
    assert.equal(scene.place, driveId);
    assert.deepEqual(blocks, ['blue-vessel', 'notebooks', 'observations', 'paper-harbor', 'reading-list', 'reference', 'sunset-fabric']);
    assert.deepEqual(projected.map(piece => piece.kind).sort(), ['alcove', 'alcove', 'plinth', 'plinth', 'plinth']);
    assert.equal(new Set(projected.map(piece => piece.position.join(','))).size, projected.length);

    const backToVisiting = page.getByRole('button', {name: 'Back to visiting', exact: true});
    if (await backToVisiting.count()) await backToVisiting.click();

    // The Page is a separate check from the live scene inspected above.
    await page.locator('#atlas-button').click();
    await page.locator('.atlas-directory summary').click();
    await page.locator('.atlas-directory [data-place="' + driveId + '"]').click();
    await page.locator('#map-read-page').click();
    const article = page.locator('#page-article');
    await article.waitFor();
    assert.equal(await article.getByRole('heading', {level: 1}).innerText(), 'Drive room');
    const sourcedBlocks = article.locator('.content-block:has(.source-pointer)').filter({hasText: 'Simulated source'});
    assert.equal(await sourcedBlocks.count(), 7);
    for (const title of ['Study in Cobalt', 'Folds at Sunset', 'Harbor on Paper', 'Notebooks · mock folder', 'Reference · mock folder', 'Sample notebook', 'Sample reading list']) {
      assert.equal(await sourcedBlocks.filter({hasText: title}).count(), 1, title);
    }
    console.log('PASS Drive room Page: seven source blocks after approval');

    assert.deepEqual(scene.drawn, projected.map(piece => piece.id).sort(), 'original 3D scene refreshes without leaving Drive');
    await page.locator('#page-to-3d').click();
    assert.equal(await page.evaluate(() => atlasStatus().room), driveId);
    assert.deepEqual((await mappedScene(page, driveId)).drawn, scene.drawn);
    assert.deepEqual(errors, []);
    assert.deepEqual(liveCalls, []);
    console.log('PASS Drive room 3D: three plinths and two alcoves immediately after approval');
    console.log(JSON.stringify({scope: 'Drive room', pageBlocks: 7, plinths: 3, alcoves: 2, liveCalls: 0}));
  } finally {
    await browser.close();
  }
})().catch(error => {console.error(error);process.exitCode = 1;});
