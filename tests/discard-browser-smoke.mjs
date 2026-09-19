import assert from 'node:assert/strict';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { runBrowser } from './browser-harness.mjs';

const projectRoot = process.env.PROJECT_ROOT || resolve(dirname(fileURLToPath(import.meta.url)), '..');

await runBrowser(projectRoot, 'discard', async ({ send, evaluate }) => {
  const initial = await evaluate(`(() => ({
    route: location.hash,
    status: document.querySelector('#discard-status').textContent,
    adjacent: document.querySelector('#discard-tile-picker').nextElementSibling.classList.contains('hand-heading'),
  }))()`);
  assert.deepEqual(initial, { route: '#discard', status: '请添加手牌。', adjacent: true });

  const complete = await evaluate(`(() => {
    document.querySelector('[data-discard-missing-suit="2"]').click();
    [0,1,2,9,10,11,12,13,14,15,15,15,8,8].forEach((tile) =>
      document.querySelector('#discard-tile-picker [data-tile="' + tile + '"]').click());
    return {
      status: document.querySelector('#discard-status').textContent,
      choices: document.querySelectorAll('#discard-hand [data-discard-tile]').length,
      selected: document.querySelectorAll('#discard-hand .selected-discard').length,
    };
  })()`);
  assert.match(complete.status, /当前手牌已胡牌/);
  assert.equal(complete.choices, 14);
  assert.equal(complete.selected, 0);

  const selected = await evaluate(`(() => {
    document.querySelector('#discard-hand [data-discard-tile="8"]').click();
    return {
      status: document.querySelector('#discard-status').textContent,
      heading: document.querySelector('.discard-result-heading')?.textContent,
      waits: [...document.querySelectorAll('.discard-result-card strong')].map((node) => node.textContent),
      remaining: document.querySelector('.wait-availability')?.textContent,
      selected: document.querySelectorAll('#discard-hand .selected-discard').length,
      removedText: /副露|暗杠|点炮|自摸|番型|番/.test(document.querySelector('#discard-page').textContent),
    };
  })()`);
  assert.match(selected.status, /当前手牌已胡牌/);
  assert.match(selected.heading, /打出 9万后胡/);
  assert.ok(selected.waits.length > 0);
  assert.equal(selected.remaining, '理论剩余 2 张');
  assert.equal(selected.selected, 1);
  assert.equal(selected.removedText, false);

  await send('Emulation.setDeviceMetricsOverride', { width: 375, height: 812, deviceScaleFactor: 1, mobile: true });
  const mobile = await evaluate(`(() => ({
    overflow: document.documentElement.scrollWidth > innerWidth,
    suitRows: [...document.querySelectorAll('#discard-tile-picker .tile-row')].map((row) =>
      new Set([...row.querySelectorAll('.tile')].map((node) => Math.round(node.getBoundingClientRect().top))).size),
    handRows: new Set([...document.querySelectorAll('#discard-hand .tile')].map((node) => Math.round(node.getBoundingClientRect().top))).size,
    handCount: document.querySelectorAll('#discard-hand .tile').length,
    removeButtons: document.querySelectorAll('#discard-hand .tile-remove').length,
  }))()`);
  assert.equal(mobile.overflow, false);
  assert.deepEqual(mobile.suitRows, [1, 1, 1]);
  assert.equal(mobile.handRows, 1);
  assert.equal(mobile.handCount, 14);
  assert.equal(mobile.removeButtons, 14);
  const removal = await evaluate(`(() => {
    document.querySelector('#discard-hand .tile-remove').click();
    const afterRemove = { hand: document.querySelectorAll('#discard-hand .tile').length, status: document.querySelector('#discard-status').textContent };
    document.querySelector('#discard-undo-button').click();
    return {
      afterRemove,
      afterUndo: document.querySelectorAll('#discard-hand .tile').length,
      restoredNotice: document.querySelector('#discard-status').textContent.includes('当前手牌已胡牌'),
    };
  })()`);
  assert.equal(removal.afterRemove.hand, 13);
  assert.match(removal.afterRemove.status, /当前手牌相公/);
  assert.equal(removal.afterUndo, 14);
  assert.equal(removal.restoredNotice, true);
  console.log(JSON.stringify({ initial, complete, selected, mobile, removal }, null, 2));
});
