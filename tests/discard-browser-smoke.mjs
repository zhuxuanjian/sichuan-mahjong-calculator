import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const projectRoot = process.env.PROJECT_ROOT || resolve(dirname(fileURLToPath(import.meta.url)), '..');
const edgePath = process.env.EDGE_PATH || 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const outputDir = process.env.BROWSER_ARTIFACTS || resolve(projectRoot, '.browser-artifacts');
const profile = await mkdtemp(resolve(tmpdir(), 'discard-edge-'));
const port = 9400 + (process.pid % 400);
const pageUrl = `${pathToFileURL(resolve(projectRoot, 'index.html')).href}#discard`;
const edge = spawn(edgePath, [
  '--headless=new', `--remote-debugging-port=${port}`, `--user-data-dir=${profile}`,
  '--no-first-run', '--disable-gpu', '--window-size=1365,1000', pageUrl,
], { stdio: 'ignore', windowsHide: true });

async function waitForTarget() {
  for (let attempt = 0; attempt < 80; attempt += 1) {
    try {
      const targets = await fetch(`http://127.0.0.1:${port}/json/list`).then((response) => response.json());
      const target = targets.find((item) => item.type === 'page' && item.url.includes('index.html'));
      if (target) return target;
    } catch {}
    await new Promise((resolveWait) => setTimeout(resolveWait, 100));
  }
  throw new Error('Edge DevTools target did not become ready');
}

function connect(webSocketUrl) {
  const socket = new WebSocket(webSocketUrl);
  let nextId = 0;
  const pending = new Map();
  socket.addEventListener('message', (event) => {
    const message = JSON.parse(event.data);
    if (!message.id || !pending.has(message.id)) return;
    const { resolve: resolveRequest, reject } = pending.get(message.id);
    pending.delete(message.id);
    if (message.error) reject(new Error(message.error.message));
    else resolveRequest(message.result);
  });
  const opened = new Promise((resolveOpen, reject) => {
    socket.addEventListener('open', resolveOpen, { once: true });
    socket.addEventListener('error', reject, { once: true });
  });
  return {
    async send(method, params = {}) {
      await opened;
      const id = ++nextId;
      const response = new Promise((resolveRequest, reject) => pending.set(id, { resolve: resolveRequest, reject }));
      socket.send(JSON.stringify({ id, method, params }));
      return response;
    },
    close() { socket.close(); },
  };
}

let client;
async function evaluate(expression) {
  const response = await client.send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
  if (response.exceptionDetails) throw new Error(response.exceptionDetails.exception?.description || 'Browser evaluation failed');
  return response.result.value;
}

async function screenshot(filename) {
  const shot = await client.send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
  await mkdir(outputDir, { recursive: true });
  await writeFile(resolve(outputDir, filename), Buffer.from(shot.data, 'base64'));
}

async function closeEdgeProcess() {
  if (edge.exitCode === null && !edge.killed) {
    await new Promise((resolveWait) => {
      const onExit = () => { clearTimeout(timer); resolveWait(); };
      const timer = setTimeout(() => { edge.off('exit', onExit); resolveWait(); }, 1000);
      edge.once('exit', onExit);
    });
  }
  if (edge.exitCode === null && !edge.killed) edge.kill();
  if (edge.exitCode === null) await new Promise((resolveWait) => edge.once('exit', resolveWait));
}

try {
  const target = await waitForTarget();
  client = connect(target.webSocketDebuggerUrl);
  await client.send('Page.enable');
  await client.send('Runtime.enable');
  for (let attempt = 0; attempt < 50; attempt += 1) {
    if (await evaluate('document.readyState === "complete" && !document.querySelector("#discard-page").hidden')) break;
    await new Promise((resolveWait) => setTimeout(resolveWait, 100));
  }

  const initialCount = await evaluate(`(() => ({
    status: document.querySelector('#discard-status').textContent,
    result: document.querySelector('#discard-results').textContent.trim(),
  }))()`);
  assert.deepEqual(initialCount, { status: '还差 14 张暗手牌。', result: '还差 14 张暗手牌。' });

  const incompleteWithMissing = await evaluate(`(() => {
    const click = (selector) => document.querySelector(selector).click();
    click('[data-discard-missing-suit="2"]');
    click('#discard-tile-picker [data-tile="18"]');
    const view = {
      status: document.querySelector('#discard-status').textContent,
      result: document.querySelector('#discard-results').textContent.trim(),
    };
    click('#discard-clear-button');
    return view;
  })()`);
  assert.deepEqual(incompleteWithMissing, { status: '还差 13 张暗手牌。', result: '还差 13 张暗手牌。' });

  await evaluate(`(() => {
    const click = (selector) => {
      const control = document.querySelector(selector);
      if (!control) throw new Error('Missing control: ' + selector);
      control.click();
    };
    const addTiles = (tiles) => tiles.forEach((tile) => click('#discard-tile-picker [data-tile="' + tile + '"]'));
    const clear = () => click('#discard-clear-button');
    const missing = (suit) => click('[data-discard-missing-suit="' + suit + '"]');
    const selectDiscard = (tile) => click('#discard-hand [data-discard-tile="' + tile + '"]');
    window.__discardSmoke = { click, addTiles, clear, missing, selectDiscard };

    addTiles([0, 1, 2, 8, 8, 9, 10, 11, 12, 13, 14, 15, 15, 15]);
  })()`);

  const completeWithoutMissingSuit = await evaluate(`(() => ({
    status: document.querySelector('#discard-status').textContent,
    result: document.querySelector('#discard-results').textContent.trim(),
  }))()`);
  assert.deepEqual(completeWithoutMissingSuit, {
    status: '请先选择定缺花色。',
    result: '请先选择定缺花色。',
  });
  await evaluate('window.__discardSmoke.missing(2); window.__discardSmoke.selectDiscard(8)');

  const listening = await evaluate(`(() => ({
    handCount: document.querySelectorAll('#discard-hand .tile').length,
    heading: document.querySelector('.discard-result-heading')?.textContent,
    availability: document.querySelector('.wait-availability')?.textContent,
    scores: [...document.querySelectorAll('.discard-score strong')].map((node) => node.textContent),
    breakdowns: [...document.querySelectorAll('.discard-score span')].map((node) => node.textContent),
    waits: [...document.querySelectorAll('.discard-result-card .discard-result-body > strong')].map((node) => node.textContent),
    live: document.querySelector('#discard-results').getAttribute('aria-live'),
  }))()`);
  assert.equal(listening.handCount, 14);
  assert.match(listening.heading, /打出 9万后听 1 种牌/);
  assert.equal(listening.availability, '理论剩余 2 张');
  assert.deepEqual(listening.scores, ['点炮 0 番', '自摸 1 番']);
  assert.match(listening.breakdowns[0], /素胡/);
  assert.match(listening.breakdowns[1], /自摸/);
  assert.equal(listening.live, 'polite');

  const firstHeading = listening.heading;
  await evaluate('window.__discardSmoke.selectDiscard(0)');
  const secondSelection = await evaluate(`(() => ({
    heading: document.querySelector('.discard-result-heading')?.textContent || '',
    waits: [...document.querySelectorAll('.discard-result-card .discard-result-body > strong')].map((node) => node.textContent),
    handCount: document.querySelectorAll('#discard-hand .tile').length,
  }))()`);
  assert.notDeepEqual(secondSelection.waits, listening.waits);
  assert.notEqual(secondSelection.heading, firstHeading);
  assert.equal(secondSelection.handCount, 14);

  await evaluate(`(() => {
    const { clear, missing, addTiles } = window.__discardSmoke;
    clear(); missing(2); addTiles([0, 1, 2, 9, 10, 11, 12, 13, 14, 15, 15, 15, 25, 26]);
  })()`);
  const forced = await evaluate(`(() => ({
    otherDisabled: [...document.querySelectorAll('#discard-hand [data-discard-tile]')]
      .filter((button) => button.dataset.suit !== '2').every((button) => button.disabled),
    missingEnabled: [...document.querySelectorAll('#discard-hand [data-discard-tile][data-suit="2"]')]
      .every((button) => !button.disabled),
    status: document.querySelector('#discard-status').textContent,
  }))()`);
  assert.equal(forced.otherDisabled, true);
  assert.equal(forced.missingEnabled, true);
  assert.match(forced.status, /只能选择定缺花色/);
  await evaluate('window.__discardSmoke.selectDiscard(26)');
  assert.equal(await evaluate('document.querySelector("#discard-results").textContent.trim()'), '打出后仍有定缺牌，请继续打定缺');

  await evaluate(`(() => {
    const { clear, missing, addTiles, selectDiscard } = window.__discardSmoke;
    clear(); missing(2); addTiles([0, 0, 2, 2, 4, 6, 8, 9, 10, 11, 13, 15, 17, 17]); selectDiscard(17);
  })()`);
  assert.equal(await evaluate('document.querySelector("#discard-results").textContent.trim()'), '打出后未听牌');

  await evaluate(`(() => {
    const { clear, missing, addTiles, selectDiscard } = window.__discardSmoke;
    clear(); missing(2); addTiles([0, 0, 0, 0, 1, 1, 2, 2, 3, 3, 13, 13, 14, 14]); selectDiscard(0);
  })()`);
  const deadWait = await evaluate(`(() => ({
    text: document.querySelector('.dead-wait')?.textContent,
    handCount: document.querySelectorAll('#discard-hand .tile').length,
  }))()`);
  assert.match(deadWait.text, /0 张／绝张/);
  assert.equal(deadWait.handCount, 14);
  await screenshot('discard-desktop.png');

  const meldTargets = await evaluate(`(() => {
    const { clear, missing, click } = window.__discardSmoke;
    const values = [];
    for (const type of ['pong', 'openKong', 'concealedKong']) {
      clear(); missing(2); click('[data-discard-meld-type="' + type + '"]'); click('#discard-add-meld');
      values.push({ type, count: document.querySelector('#discard-hand-count').textContent, meld: document.querySelector('.meld-card strong').textContent });
      click('[data-remove-meld="0"]');
      values.push({ type: type + '-removed', count: document.querySelector('#discard-hand-count').textContent });
    }
    return values;
  })()`);
  for (let index = 0; index < meldTargets.length; index += 2) {
    assert.equal(meldTargets[index].count, '0 / 11');
    assert.match(meldTargets[index].meld, /× [34]/);
    assert.equal(meldTargets[index + 1].count, '0 / 14');
  }

  const focusAndMissingMeld = await evaluate(`(() => {
    const { clear, missing, addTiles, click } = window.__discardSmoke;
    clear(); missing(2); addTiles([0, 1, 2]);
    click('#discard-hand [data-hand-index="1"]');
    const handFocus = document.activeElement.getAttribute('aria-label');
    clear(); missing(2); addTiles([0, 1, 2, 9, 10, 11, 12, 13, 14, 15, 15]);
    document.querySelector('#discard-meld-tile').value = '18';
    document.querySelector('#discard-meld-tile').dispatchEvent(new Event('change', { bubbles: true }));
    click('#discard-add-meld');
    const missingMeld = {
      status: document.querySelector('#discard-status').textContent,
      discardChoices: document.querySelectorAll('#discard-hand [data-discard-tile]').length,
      removalChoices: document.querySelectorAll('#discard-hand [data-hand-index]').length,
    };
    const meldFocusBeforeRemove = document.querySelector('[data-remove-meld="0"]');
    meldFocusBeforeRemove.click();
    return {
      handFocus,
      meldFocus: document.activeElement.id,
      missingMeld,
      limitHint: document.querySelector('#discard-page .rule-note').textContent,
      limitHintInBounds: (() => {
        const box = document.querySelector('#discard-page .rule-note').getBoundingClientRect();
        return box.left >= 0 && box.right <= innerWidth;
      })(),
    };
  })()`);
  assert.equal(focusAndMissingMeld.handFocus, '移除3万');
  assert.equal(focusAndMissingMeld.meldFocus, 'discard-add-meld');
  assert.deepEqual(focusAndMissingMeld.missingMeld, {
    status: '副露中有定缺花色，请先移除或修正对应副露。',
    discardChoices: 0,
    removalChoices: 11,
  });
  assert.match(focusAndMissingMeld.limitHint, /每一种牌最多四张/);

  await evaluate(`(() => {
    const { clear, missing, addTiles, selectDiscard, click } = window.__discardSmoke;
    clear(); missing(2); addTiles([0, 1, 2, 8, 8, 9, 10, 11, 12, 13, 14, 15, 15, 15]); selectDiscard(8);
    click('[data-route="hu"]');
    history.back();
    return new Promise((resolve) => setTimeout(resolve, 100));
  })()`);
  const navigation = await evaluate(`(() => ({
    route: location.hash,
    discardVisible: !document.querySelector('#discard-page').hidden,
    handCount: document.querySelectorAll('#discard-hand .tile').length,
    current: document.querySelector('[data-route="discard"]').getAttribute('aria-current'),
  }))()`);
  assert.deepEqual(navigation, { route: '#discard', discardVisible: true, handCount: 14, current: 'page' });

  await client.send('Emulation.setDeviceMetricsOverride', { width: 375, height: 812, deviceScaleFactor: 1, mobile: true });
  await evaluate('document.querySelector("#discard-results-title").scrollIntoView()');
  const mobile = await evaluate(`(() => ({
    overflow: document.documentElement.scrollWidth > 375,
    cards: document.querySelectorAll('.discard-result-card').length,
    scoresInBounds: [...document.querySelectorAll('.discard-score')].every((node) => {
      const box = node.getBoundingClientRect(); return box.left >= 0 && box.right <= 375 && box.width > 0;
    }),
    selected: document.querySelectorAll('.selected-discard').length,
    limitHintInBounds: (() => {
      const box = document.querySelector('#discard-page .rule-note').getBoundingClientRect();
      return box.left >= 0 && box.right <= 375;
    })(),
  }))()`);
  assert.equal(mobile.overflow, false);
  assert.ok(mobile.cards > 0);
  assert.equal(mobile.scoresInBounds, true);
  assert.ok(mobile.selected > 0);
  assert.equal(mobile.limitHintInBounds, true);
  await evaluate('window.__discardSmoke.selectDiscard(0)');
  const mobileInteraction = await evaluate(`(() => ({
    handCount: document.querySelectorAll('#discard-hand .tile').length,
    selected: document.querySelectorAll('.selected-discard').length,
    summary: document.querySelector('#discard-selection-summary').textContent,
  }))()`);
  assert.deepEqual(mobileInteraction, { handCount: 14, selected: 1, summary: '已选择打出 1万；手牌仍保留该牌，便于切换比较。' });
  await screenshot('discard-mobile-375.png');

  console.log(JSON.stringify({ initialCount, incompleteWithMissing, completeWithoutMissingSuit, listening, secondSelection, forced, deadWait, meldTargets, focusAndMissingMeld, navigation, mobile, mobileInteraction, outputDir }, null, 2));
  await client.send('Browser.close');
} finally {
  if (client) client.close();
  await closeEdgeProcess();
  await rm(profile, { recursive: true, force: true });
}
