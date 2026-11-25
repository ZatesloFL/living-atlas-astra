const assert = require('node:assert/strict');

async function enterPlaceByAddress(page, placeId) {
  await page.locator('#atlas-button').click();
  const details = page.locator('details.address-manual').filter({has: page.locator('#atlas-address')});
  if (!await details.evaluate(node => node.open)) await details.getByText('Exact address · manual', {exact: true}).click();
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

async function openAskAtlas(page) {
  await page.locator('#profile-chip').click();
  await page.locator('#profile-atlas').click();
  await page.locator('#atlas-ask').waitFor();
}

async function atlasState(page) {
  return page.evaluate(() => __atlas.atlas.records.state(__atlas.state().lens));
}

async function askAndConfirm(page, words, beforeConfirm = async () => {}) {
  await page.locator('#atlas-ask').fill(words);
  await page.locator('#atlas-ask-form button').click();
  await page.locator('#atlas-confirm').waitFor();
  const proposal = await page.evaluate(() => (window.__atlas?.atlas ?? window.__atlasPage?.atlasUI).pending);
  await beforeConfirm(proposal);
  await page.locator('#atlas-confirm').click();
  await page.locator('#atlas-confirm').waitFor({state: 'detached'});
  return proposal.id;
}

async function grantBuildAndSources(page) {
  await openAskAtlas(page);
  const grantId = await askAndConfirm(page, 'Give Atlas standing edit access for my Build and Sources', async () => {
    assert.equal((await atlasState(page)).grants.length, 0, 'The edit grant is only a proposal before the owner confirms');
  });
  const state = await atlasState(page);
  const grant = state.grants.find(record => record.id === grantId);
  assert.equal(grant?.approvedBy, state.holder);
  assert.deepEqual([...grant.areas].sort(), ['build', 'sources']);
  assert.equal(grant.scope, 'edit');
  assert.equal(grant.active, true);
  assert.equal(grant.expires, null);
  return grant;
}

module.exports = {enterPlaceByAddress, openAskAtlas, atlasState, askAndConfirm, grantBuildAndSources};
