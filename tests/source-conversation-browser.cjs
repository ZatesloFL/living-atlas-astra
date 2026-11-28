const assert = require('node:assert/strict');
const {createHash} = require('node:crypto');
const {readFile} = require('node:fs/promises');
const {extname, resolve, sep} = require('node:path');
const {chromium} = require(process.env.ATLAS_PLAYWRIGHT_MODULE || 'playwright-core');
const {enterPlaceByAddress, atlasState, askAtlas} = require('./atlas-build-browser-controls.cjs');

const origin = 'https://zateslofl.github.io';
const assetPrefix = '/living-atlas-astra/';
const edgeOrigin = 'https://ftnxmuenqfqkodizyekk.supabase.co';
const repo = resolve(__dirname, '..');
const served = process.env.ATLAS_SERVED === '1';
const fileName = 'Window study.png';
const photo = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAQAAAAECAIAAAAmkwkpAAAAD0lEQVR4nGP4jwQYiOMAANuQL9FuRbCyAAAAAElFTkSuQmCC', 'base64');
const observation = 'A flat white tile fills the image.';
const description = 'A dark room with blue walls.';
const holder = 'b'.repeat(64);
const assessmentSession = 'a'.repeat(64);
const model = 'anthropic/claude-haiku-5-5';
const assessment = '10000000-0000-4000-8000-000000000001';
const snapshot = '10000000-0000-4000-8000-000000000002';
const declaration = '10000000-0000-4000-8000-000000000003';
const dials = Object.fromEntries(['violence', 'sexual', 'language', 'disturbing', 'viewpoint', 'sensory']
  .map(key => [key, {amount: key === 'sensory' ? 1 : 0, graphicness: 0}]));
const mediaTypes = {'.html':'text/html', '.js':'text/javascript', '.css':'text/css', '.json':'application/json', '.svg':'image/svg+xml'};

// Use the shipped-origin app shell and real client request validation. Edge
// responses are fixtures. Static assets come from the checkout, or Pages when opted in.
async function stubNetwork(context) {
  const requests = [], errors = [], uploads = new Map();
  const usage = () => ({allotmentBytes: 1000000000, reservedBytes: 0,
    usedBytes: [...uploads.values()].reduce((sum, {item}) => sum + item.originalBytes + item.previewBytes, 0)});
  const cors = {'access-control-allow-origin':origin, 'access-control-allow-methods':'POST, OPTIONS',
    'access-control-allow-headers':'authorization, content-type, x-atlas-upload'};

  await context.route('**/*', async route => {
    const request = route.request();
    const url = new URL(request.url());
    try {
      if (url.origin === origin && url.pathname.startsWith(assetPrefix)) {
        assert.equal(request.method(), 'GET');
        if (served) return await route.continue();
        const file = resolve(repo, decodeURIComponent(url.pathname.slice(assetPrefix.length)) || 'index.html');
        assert.ok(file.startsWith(repo + sep), url.pathname);
        return await route.fulfill({status: 200, contentType: mediaTypes[extname(file)], body: await readFile(file)});
      }
      const entry = /^\/functions\/v1\/(ai-proxy|atlas-sources)\/(\w+)$/.exec(url.pathname);
      assert.ok(url.origin === edgeOrigin && entry, 'Unexpected network destination ' + url.origin + url.pathname);
      if (request.method() === 'OPTIONS') return await route.fulfill({status: 204, headers: cors});
      assert.equal(request.method(), 'POST');
      const [, gateway, action] = entry;
      requests.push({gateway, action});
      const json = (payload, status = 200) => route.fulfill({status, headers: cors, json: payload});

      if (gateway === 'ai-proxy') {
        const body = request.postDataJSON();
        if (action === 'session') {
          if (body.purpose) assert.deepEqual(body, {holder, purpose: 'upload-review'});
          else assert.deepEqual(body, {});
          return await json({holder, session: assessmentSession, expiresAt: new Date(Date.now() + 180000).toISOString()});
        }
        assert.equal(action, 'request');
        assert.equal(request.headers().authorization, 'Bearer ' + assessmentSession);
        assert.equal(body.schemaId, 'atlas-upload-photo-scores-v1');
        assert.equal(body.job, 'background');
        assert.equal(body.agentId, 'upload-declaration-helper');
        assert.deepEqual(body.context, {uploadId: [...uploads.keys()][0], description});
        return await json({proposal: {kind: 'upload-scores', basis: 'image', scores: dials,
          observation, descriptionDisagrees: true}, agentId: 'upload-declaration-helper', model,
        receiptData: {provider: 'anthropic', job: 'background', model, agentId: 'upload-declaration-helper',
          result: 'proposed', receiptId: assessment}});
      }

      assert.equal(request.headers().authorization, 'Bearer ' + holder);
      if (action === 'upload') {
        const spec = JSON.parse(decodeURIComponent(request.headers()['x-atlas-upload']));
        const bytes = request.postDataBuffer();
        assert.equal(request.headers()['content-type'], 'image/png');
        assert.equal(spec.filename, fileName);
        assert.ok(spec.placeId.endsWith('/drive'));
        assert.deepEqual(bytes.subarray(0, spec.originalBytes), photo);
        assert.ok(spec.previewBytes > 0 && bytes.length === spec.originalBytes + spec.previewBytes);
        const item = {...spec, sourceId: 'upload-' + spec.id, contentType: 'image/png', state: 'uploaded',
          sha256: createHash('sha256').update(photo).digest('hex'), uploadedAt: '2026-11-25T12:00:00.000Z',
          snapshotReceiptId: snapshot, declarationReceiptId: null, proposalProvenance: null, scores: null};
        uploads.set(item.id, {item, preview: bytes.subarray(spec.originalBytes)});
        return await json({item, usage: usage()});
      }
      if (action === 'list') {
        return await json({items: [...uploads.values()].map(entry => entry.item), usage: usage(), metrics: {...usage(), served: []}});
      }
      const body = request.postDataJSON();
      const saved = uploads.get(body.id);
      assert.ok(saved);
      if (action === 'media') {
        assert.ok(['original', 'preview'].includes(body.variant));
        const isPreview = body.variant === 'preview';
        return await route.fulfill({status: 200, headers: cors, contentType: isPreview ? 'image/jpeg' : 'image/png',
          body: isPreview ? saved.preview : photo});
      }
      assert.equal(action, 'publish');
      assert.equal(saved.item.state, 'uploaded');
      assert.deepEqual(body, {id: saved.item.id, proposalReceiptId: assessment,
        scores: {...dials, violence: {amount: 2, graphicness: 0}}});
      Object.assign(saved.item, {state: 'published', scores: body.scores, declarationReceiptId: declaration,
        proposalProvenance: {basis: 'image', provider: 'anthropic', route: 'background', model, receiptId: assessment}});
      return await json({item: saved.item, usage: usage()});
    } catch (error) {
      errors.push(error.message);
      await route.abort().catch(() => {});
    }
  });
  return {requests, errors, uploads};
}

const recordsKey = 'living-atlas.atlas-records.v1';
async function waitReceipt(page, action, phase, area = 'sources') {
  await page.waitForFunction(({action, phase, area}) => {
    const state = __atlas.atlas.records.state(__atlas.state().lens);
    const proposals = state.receipts.filter(r => r.action === 'atlas_proposed' &&
      r.diff.value?.kind === 'extension' && r.diff.value.area === area && r.diff.value.action === action);
    if (phase === 'proposed') return proposals.length > 0;
    const confirms = state.receipts.filter(r => r.action === 'atlas_confirmed' &&
      proposals.some(proposal => proposal.hash === r.diff.proposalReceipt));
    return state.receipts.some(r => r.action === 'atlas_applied' &&
      confirms.some(confirm => confirm.hash === r.diff.confirmationReceipt));
  }, {action, phase, area});
}

async function mappedPlace(page, id) {
  return page.evaluate(async id => {
    const {ROOMS} = await import('./src/data.js');
    const {sourcedRoom} = await import('./src/source-catalog.js');
    return sourcedRoom(ROOMS[id], __atlas.state().lens);
  }, id);
}

(async () => {
  const browser = await chromium.launch({executablePath: process.env.ATLAS_CHROMIUM || '/usr/bin/chromium',
    headless: true, args: ['--no-sandbox', '--enable-unsafe-swiftshader',
      ...(process.env.ATLAS_TEST_SPKI ? ['--ignore-certificate-errors-spki-list=' + process.env.ATLAS_TEST_SPKI] : [])]});
  let evidence, page;
  try {
    const context = await browser.newContext({viewport: {width: 524, height: 1166}, hasTouch: true,
      isMobile: true, reducedMotion: 'reduce', serviceWorkers: 'block'});
    evidence = await stubNetwork(context);
    page = await context.newPage();
    const errors = [];
    page.setDefaultTimeout(18000);
    page.on('pageerror', error => errors.push(error.message));
    await page.goto(origin + assetPrefix + '?safe&test');
    await page.locator('#setup-form [name=name]').fill('Synthetic conversation owner');
    await page.locator('#setup-form [name=age]').fill('30');
    await page.locator('#setup-form button[type=submit]').click();
    assert.match(await page.locator('[data-starter-grant]').innerText(), /Atlas can help.*from the start.*narrow or turn off/i);
    await page.locator('#arrival-interview-next').click();
    await page.locator('#arrival-lens-next').click();
    await page.locator('[name=arrival-start][value=scratch]').check();
    await page.locator('#arrival-create').click();
    await page.waitForFunction(() => atlasStatus().room.startsWith('home/'));
    const starter = await atlasState(page);
    assert.equal(starter.grants.length, 1);
    const [grant] = starter.grants;
    assert.equal(grant.origin, 'starter');
    assert.equal(grant.issuedBy, 'system');
    assert.equal(grant.scope, 'edit');
    assert.equal(grant.active, true);
    assert.equal(grant.expires, null);
    assert.equal(starter.envelopes.sources?.posture, 'Conversational');
    assert.ok(!starter.receipts.some(r => r.action === 'atlas_proposed' && r.diff.value?.kind === 'grant'));
    const {driveId, owner} = await page.evaluate(() => ({driveId: atlasStatus().room + '/drive', owner: __atlas.state().lens.profileId}));
    await enterPlaceByAddress(page, driveId);
    await page.locator('#build-button').click();
    const builder = page.locator('#builder-hud');
    const dialog = page.getByRole('dialog', {name: 'Connected sources'});
    const log = dialog.locator('[data-source-chat-log]');
    const composer = dialog.locator('form[data-source-chat]');
    const openSources = async () => {
      const tab = builder.getByRole('button', {name: 'Sources', exact: true});
      if (await tab.getAttribute('aria-pressed') !== 'true') await tab.click();
      await builder.getByRole('button', {name: 'Connected sources', exact: true}).click();
      await composer.waitFor();
      assert.equal(await dialog.locator('[data-current-place]').innerText(), 'Drive room');
    };
    const closeSources = () => dialog.getByRole('button', {name: 'Close connected sources'}).click();
    const say = async message => {
      await composer.locator('input[name=message]').fill(message);
      await composer.locator('[type=submit]').click();
    };
    const forbidInspector = async () => {
      assert.equal(await dialog.locator(':is([data-form=upload], [data-form=publish], [data-source-detail]):visible').count(), 0);
      assert.equal(await builder.locator('[data-builder-form=piece]').isVisible(), false);
    };

    // The starter grants both surfaces access from the first request.
    const askTab = builder.locator('[data-builder-action=panel][data-value=ask]');
    if (await askTab.getAttribute('aria-pressed') !== 'true') await askTab.click();
    await builder.locator('#builder-question').fill('Place a lantern');
    await builder.locator('[data-builder-form=ask] button[type=submit]').click();
    await waitReceipt(page, 'place-piece', 'applied', 'build');
    assert.equal(await builder.getByRole('button', {name: 'Keep in draft', exact: true}).count(), 0);
    assert.ok(await page.evaluate(() => __atlas.build.draft.pieces.some(piece => piece.kind === 'lantern')));
    await openSources();
    assert.deepEqual((await atlasState(page)).grants.filter(record => record.active).map(record => record.id), [grant.id]);
    console.log('PASS the disclosed starter grant lets the first private Build request apply in words');

    // Declare without opening the dial form. A fixture serves the original,
    // records an owner-edited dial, and returns the real client's Receipt shape.
    await forbidInspector();
    const effectCount = action => evidence.requests.filter(call => call.action === action).length;
    const transferPrompt = dialog.locator('[data-source-chat-proposal=transfer]');
    const costPrompt = dialog.locator('[data-source-chat-proposal=assessment]');
    const choosingFile = page.waitForEvent('filechooser');
    await composer.getByRole('button', {name: 'Attach file', exact: true}).click();
    await (await choosingFile).setFiles({name: fileName, mimeType: 'image/png', buffer: photo});
    await transferPrompt.getByRole('heading', {name: 'Upload to Atlas storage?'}).waitFor();
    assert.match(await transferPrompt.innerText(), /allotment/i);
    assert.equal(effectCount('upload'), 0);
    assert.equal(effectCount('request'), 0);
    await say('yes');
    const attachmentPrompt = log.getByText('Describe what is in ' + fileName, {exact: false});
    await attachmentPrompt.first().waitFor();
    assert.equal(effectCount('upload'), 1);
    assert.equal(effectCount('request'), 0);
    await say('skip');
    await costPrompt.waitFor();
    assert.match(await costPrompt.innerText(), /photo.*AI provider.*metered AI budget/is);
    assert.equal(effectCount('request'), 0, 'Skipping a description does not authorize provider use');
    await say('no');
    await costPrompt.waitFor({state: 'hidden'});
    await log.getByText(/review stopped.*still unpublished/i).waitFor();
    assert.equal(effectCount('request'), 0);
    assert.equal(effectCount('publish'), 0);
    assert.equal([...evidence.uploads.values()][0].item.state, 'uploaded');
    assert.equal((await atlasState(page)).proposals.filter(p => p.value.action === 'declare-upload').length, 0);

    await say('Review ' + fileName);
    await attachmentPrompt.nth(1).waitFor();
    await say(description);
    await costPrompt.waitFor();
    assert.equal(effectCount('request'), 0, 'Providing a description does not authorize provider use');
    assert.equal(effectCount('publish'), 0);
    await say('yes');
    await log.getByText(observation, {exact: false}).waitFor();
    assert.equal(effectCount('request'), 1);
    assert.equal(effectCount('publish'), 0, 'Cost approval does not confirm the suggested dials');
    assert.match(await log.innerText(), /disagree/i);
    for (const [dimension, pair] of Object.entries(dials)) {
      for (const [axis, value] of Object.entries(pair)) {
        assert.equal(await log.locator('[data-proposed-dial="' + dimension + '.' + axis + '"]').innerText(), String(value));
      }
    }
    await waitReceipt(page, 'declare-upload', 'proposed');
    await forbidInspector();
    assert.equal(effectCount('publish'), 0);
    await say('Set violence amount to 2');
    await log.locator('[data-proposed-dial="violence.amount"]').filter({hasText: /^2$/}).waitFor();
    await say('yes');
    await waitReceipt(page, 'declare-upload', 'applied');
    const hosted = [...evidence.uploads.values()][0].item;
    assert.equal(hosted.placeId, driveId);
    assert.equal(hosted.declarationReceiptId, declaration);
    assert.equal(hosted.scores.violence.amount, 2);
    await forbidInspector();
    console.log('PASS declare by conversation: the Atlas showed all paired dials, the owner edited a dial, and confirmation committed once');

    // Connect and map without opening the source form. Inspect the real target
    // Place before and after confirmation to separate preview from projection.
    assert.deepEqual((await mappedPlace(page, driveId)).sourcePlacements ?? [], []);
    await say('Connect my mock Drive in indexed mode');
    await waitReceipt(page, 'connect-and-map', 'proposed');
    const mapPreview = dialog.locator('[data-source-mapping-preview]');
    await mapPreview.waitFor();
    assert.match(await mapPreview.innerText(), /notebooks/i);
    assert.match(await mapPreview.innerText(), /reference/i);
    assert.match(await mapPreview.innerText(), /alcove/i);
    assert.match(await log.innerText(), /indexed/i);
    const mappingPrompt = dialog.locator('[data-source-chat-proposal=mapping]');
    assert.match(await mappingPrompt.innerText(), /connect this external source/i);
    assert.match(await mappingPrompt.innerText(), /say\s+yes\s+to confirm/i);
    const drawCount = await page.evaluate(roomId => {
      const drawn = new Set();
      __atlas.buildScene().traverse(object => {
        for (const id of object.userData.ids ?? []) if (id) drawn.add(id);
      });
      return __atlas.build.sourcePreview.mapping.placements
        .filter(piece => drawn.has('exhibit:' + roomId + ':' + piece.blockId)).length;
    }, driveId);
    assert.equal(drawCount, 2, 'Two mapped alcoves draw in the draft preview before confirmation');
    assert.deepEqual((await mappedPlace(page, driveId)).sourcePlacements ?? [], []);
    await say('yes');
    await waitReceipt(page, 'connect-and-map', 'applied');
    const approved = (await mappedPlace(page, driveId)).sourcePlacements;
    assert.deepEqual(approved.map(piece => piece.kind), ['alcove', 'alcove']);
    await forbidInspector();
    console.log('PASS connect and map by conversation: two mock Drive alcoves previewed and projected after owner confirmation');

    // Place and publish using only words, then reveal both existing inspectors.
    await say('Place ' + fileName + ' on the left');
    await waitReceipt(page, 'place-source', 'applied');
    await page.waitForFunction(() => __atlas.buildScene()?.getObjectByName('Hosted photo preview')?.userData.sourceStatus === 'ready');
    const draft = await page.evaluate(() => __atlas.build.draft.pieces.find(piece => piece.kind === 'hosted-photo'));
    assert.ok(draft?.transform.position[0] < 0);
    assert.ok(!(await mappedPlace(page, driveId)).kitPieces.some(piece => piece.id === draft.id));
    await say('Publish draft');
    await waitReceipt(page, 'publish-draft', 'applied');
    const published = await mappedPlace(page, driveId);
    const block = published.blocks.find(block => block.source?.itemId === hosted.id);
    assert.equal(block?.standing.declarationRef.receiptRef, declaration);
    assert.ok(published.builderFixtures.some(fixture => fixture.id === draft.id && fixture.block === block.id),
      'Published placement resolves the same hosted photo');
    await forbidInspector();
    console.log('PASS the named source placement and private publication apply on their spoken requests');

    await dialog.locator('[data-sources-tab=inspector]').click();
    const photoRecord = dialog.locator('[data-upload-id="' + hosted.id + '"]');
    assert.match(await photoRecord.innerText(), /Uploaded copy|uploaded copy/);
    const confirmed = photoRecord.locator('[data-confirmed-declaration]');
    await confirmed.locator('summary').click();
    assert.match(await confirmed.innerText(), new RegExp(declaration));
    for (const [dimension, pair] of Object.entries(hosted.scores)) {
      for (const [axis, value] of Object.entries(pair)) {
        assert.equal(await confirmed.locator('[data-confirmed-dial="' + dimension + '.' + axis + '"]').innerText(), String(value));
      }
    }
    const mappingRecord = dialog.locator('[data-source-detail]').filter({hasText: /Mock Drive archive/});
    if (!await mappingRecord.evaluate(details => details.open)) await mappingRecord.locator('summary').click();
    assert.equal(await mappingRecord.locator('[name=mode]').inputValue(), 'indexed');
    assert.match(await mappingRecord.innerText(), /Approved mapping.*Folders become alcoves/i);
    await closeSources();
    const outline = builder.getByRole('button', {name: 'Outline', exact: true});
    if (await outline.getAttribute('aria-pressed') !== 'true') await outline.click();
    await builder.locator('[data-builder-action=select][data-value="' + draft.id + '"]').click();
    const draftInspector = builder.locator('[data-builder-form=piece]');
    await draftInspector.waitFor();
    for (const [index, coordinate] of draft.transform.position.entries()) {
      assert.equal(Number(await draftInspector.locator('[name="position.' + index + '"]').inputValue()), coordinate);
    }

    const journal = await page.evaluate(async key => {
      const {verifyChain} = await import('./src/ledger.js');
      const {receipts} = JSON.parse(localStorage.getItem(key));
      return {valid: (await verifyChain(receipts)).valid, receipts,
        legacy: localStorage.getItem('living-atlas.source-conversation.v1')};
    }, recordsKey);
    assert.equal(journal.valid, true);
    assert.equal(journal.legacy, null);
    assert.deepEqual((await atlasState(page)).grants.filter(record => record.active).map(record => record.id), [grant.id]);
    const pairs = [];
    for (const [area, action, grants, authorization] of [
      ['build', 'place-piece', {build: grant.id}, 'holder request'],
      ['sources', 'declare-upload', {sources: grant.id}, 'confirmation'],
      ['sources', 'connect-and-map', {sources: grant.id}, 'confirmation'],
      ['sources', 'place-source', {sources: grant.id, build: grant.id}, 'holder request'],
      ['sources', 'publish-draft', {sources: grant.id, build: grant.id}, 'holder request'],
    ]) {
      const proposals = journal.receipts.filter(r => r.action === 'atlas_proposed' &&
        r.diff.value?.kind === 'extension' && r.diff.value.area === area && r.diff.value.action === action);
      const confirms = journal.receipts.filter(r => r.action === 'atlas_confirmed' &&
        proposals.some(proposal => proposal.hash === r.diff.proposalReceipt));
      assert.equal(confirms.length, 1, action);
      const [confirm] = confirms;
      const propose = proposals.find(proposal => proposal.hash === confirm.diff.proposalReceipt);
      assert.equal(propose.actor, 'atlas');
      assert.equal(propose.diff.value.placeId, driveId);
      assert.deepEqual(propose.diff.basis.grants, grants);
      assert.equal(confirm.actor, owner);
      assert.equal(confirm.diff.source, authorization, action);
      assert.ok(propose.id < confirm.id && propose.hash !== confirm.hash, action);
      const outcome = journal.receipts.find(r => r.action === 'atlas_applied' && r.diff.confirmationReceipt === confirm.hash);
      assert.ok(outcome?.id > confirm.id, action);
      const applied = outcome.diff.result?.appliedReceipt ?? null;
      if (action === 'declare-upload') assert.equal(applied, declaration);
      if (action === 'connect-and-map') assert.match(applied, /^source:[a-f0-9]{64}$/);
      if (action === 'publish-draft') assert.match(applied, /^builder:[a-f0-9]{64}$/);
      pairs.push({area, action, proposal: propose.hash, confirmation: confirm.hash, outcome: outcome.hash, applied});
    }

    await openSources();
    assert.deepEqual((await atlasState(page)).grants.filter(record => record.active).map(record => record.id), [grant.id]);
    await say('Connect my mock gallery in indexed mode');
    await dialog.locator('[data-source-mapping-preview]').filter({hasText: /Mock gallery/}).waitFor();
    const pending = (await atlasState(page)).proposals.findLast(p => p.value.action === 'connect-and-map' && p.status === 'proposal');
    assert.equal(pending?.value.payload.kind, 'collection-db');

    // Revoke Sources through Ask Atlas in another view of the same profile.
    // The original pending proposal stays open and must recheck authority.
    const other = await context.newPage();
    try {
      await other.goto(origin + assetPrefix + '?page&test');
      await other.locator('#page-ask-atlas').click();
      await askAtlas(other, 'Revoke the Atlas grant for Sources');
      await other.waitForFunction(() => {
        const page = window.__atlasPage;
        return page && !page.atlasUI.records.state(page.lens).grants.some(record => record.active && record.areas.includes('sources'));
      });
    } finally {await other.close();}
    const narrowed = (await atlasState(page)).grants.find(record => record.id === grant.id);
    assert.equal(narrowed?.active, true);
    const remainingAreas = grant.areas.filter(area => area !== 'sources');
    assert.deepEqual(narrowed?.areas, remainingAreas);
    await say('yes');
    await log.getByText(/active edit grant for sources|sources grant changed/i).last().waitFor();
    const denied = await atlasState(page);
    assert.ok(!denied.receipts.some(r => r.action === 'atlas_confirmed' && r.diff.proposalReceipt === pending.receipt));
    assert.deepEqual((await mappedPlace(page, driveId)).sourcePlacements.map(piece => piece.blockId), approved.map(piece => piece.blockId));
    await closeSources();

    await page.reload();
    await page.waitForFunction(() => window.__atlas);
    const restored = await mappedPlace(page, driveId);
    assert.equal(restored.kitPieces.find(piece => piece.id === draft.id)?.ref.thingId, block.id);
    assert.deepEqual(restored.sourcePlacements.map(piece => piece.blockId), approved.map(piece => piece.blockId));
    assert.deepEqual((await atlasState(page)).grants.filter(record => record.active).map(({id, areas}) => ({id, areas})), [{id: grant.id, areas: remainingAreas}]);
    assert.deepEqual(errors, []);
    assert.deepEqual(evidence.errors, []);
    for (const action of ['request', 'upload', 'publish']) assert.equal(evidence.requests.filter(call => call.action === action).length, 1);
    console.log('PASS inspectors match the confirmed declaration, source mapping, and placement');
    console.log('PASS one shared standing grant survives panel reopen and reload, and partial revocation blocks its pending Sources proposal');
    console.log(JSON.stringify({scope: 'Drive room', assets: served ? 'Pages' : 'checkout', grant: grant.id, pairs,
      syntheticDeclaration: declaration, paidCalls: 0}));
  } catch (error) {
    if (evidence?.errors.length) console.error('Intercepted browser request errors:', evidence.errors);
    const log = page?.locator('[data-source-chat-log]');
    if (await log?.isVisible()) console.error('Synthetic conversation:', (await log.innerText()).slice(-1800));
    throw error;
  } finally {await browser.close();}
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
