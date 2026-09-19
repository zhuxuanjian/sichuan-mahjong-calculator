import assert from 'node:assert/strict';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { runBrowser } from './browser-harness.mjs';

const projectRoot = process.env.PROJECT_ROOT || resolve(dirname(fileURLToPath(import.meta.url)), '..');

await runBrowser(projectRoot, 'settlement', async ({ send, evaluate }) => {
  const initial = await evaluate(`(() => ({
    route: location.hash,
    nav: [...document.querySelectorAll('[data-route]')].map((button) => button.dataset.route),
    visible: !document.querySelector('#hu-page').hidden,
    removed: !document.querySelector('#settlement-page') && !document.querySelector('#melds') && !document.querySelector('#win-method'),
    status: document.querySelector('#status').textContent,
  }))()`);
  assert.deepEqual(initial, { route: '#hu', nav: ['hu', 'discard'], visible: true, removed: true, status: '请添加手牌。' });

  const oneTile = await evaluate(`(() => {
    document.querySelector('[data-missing-suit="2"]').click();
    document.querySelector('#tile-picker [data-tile="0"]').click();
    return {
      hand: document.querySelectorAll('#hand .tile').length,
      waits: [...document.querySelectorAll('#results .result-card strong')].map((node) => node.textContent),
      adjacent: document.querySelector('#tile-picker').nextElementSibling.classList.contains('hand-heading'),
    };
  })()`);
  assert.deepEqual(oneTile, { hand: 1, waits: ['1万'], adjacent: true });

  const foul = await evaluate(`(() => {
    document.querySelector('#tile-picker [data-tile="1"]').click();
    return document.querySelector('#status').textContent;
  })()`);
  assert.match(foul, /当前手牌相公/);

  await evaluate(`(() => {
    document.querySelector('#clear-button').click();
    document.querySelector('[data-missing-suit="2"]').click();
    [0,1,2,8,8,9,10,11,12,13,14,15,15].forEach((tile) =>
      document.querySelector('#tile-picker [data-tile="' + tile + '"]').click());
  })()`);
  const longHand = await evaluate(`(() => ({
    hand: document.querySelectorAll('#hand .tile').length,
    waits: [...document.querySelectorAll('#results .result-card strong')].map((node) => node.textContent),
    removedText: /副露|暗杠|胡牌情境|番/.test(document.querySelector('#hu-page').textContent),
  }))()`);
  assert.equal(longHand.hand, 13);
  assert.deepEqual(longHand.waits, ['9万', '7筒']);
  assert.equal(longHand.removedText, false);

  await send('Emulation.setDeviceMetricsOverride', { width: 375, height: 812, deviceScaleFactor: 1, mobile: true });
  const mobile = await evaluate(`(() => {
    const tops = (selector) => [...document.querySelectorAll(selector)].map((node) => Math.round(node.getBoundingClientRect().top));
    return {
      overflow: document.documentElement.scrollWidth > innerWidth,
      suitRows: [...document.querySelectorAll('#tile-picker .tile-row')].map((row) => new Set([...row.querySelectorAll('.tile')].map((node) => Math.round(node.getBoundingClientRect().top))).size),
      handRows: new Set(tops('#hand .tile')).size,
      handCount: document.querySelectorAll('#hand .tile').length,
    };
  })()`);
  assert.equal(mobile.overflow, false);
  assert.deepEqual(mobile.suitRows, [1, 1, 1]);
  assert.equal(mobile.handRows, 1);
  assert.equal(mobile.handCount, 13);
  const fourteen = await evaluate(`(() => {
    document.querySelector('#tile-picker [data-tile="18"]').click();
    return {
      hand: document.querySelectorAll('#hand .tile').length,
      rows: new Set([...document.querySelectorAll('#hand .tile')].map((node) => Math.round(node.getBoundingClientRect().top))).size,
      status: document.querySelector('#status').textContent,
      overflow: document.documentElement.scrollWidth > innerWidth,
    };
  })()`);
  assert.equal(fourteen.hand, 14);
  assert.equal(fourteen.rows, 1);
  assert.match(fourteen.status, /当前手牌相公/);
  assert.equal(fourteen.overflow, false);
  console.log(JSON.stringify({ initial, oneTile, longHand, mobile, fourteen }, null, 2));
});
