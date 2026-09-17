import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const projectRoot = process.env.PROJECT_ROOT || resolve(dirname(fileURLToPath(import.meta.url)), '..');
const edgePath = process.env.EDGE_PATH || 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const outputDir = process.env.BROWSER_ARTIFACTS || resolve(projectRoot, '.browser-artifacts');
const profile = await mkdtemp(resolve(tmpdir(), 'hu-edge-'));
const port = 9200 + (process.pid % 400);
const pageUrl = `${pathToFileURL(resolve(projectRoot, 'index.html')).href}#hu`;
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
    if (await evaluate('document.readyState === "complete" && !document.querySelector("#hu-page").hidden')) break;
    await new Promise((resolveWait) => setTimeout(resolveWait, 100));
  }

  const initialCount = await evaluate(`(() => ({
    status: document.querySelector('#status').textContent,
    result: document.querySelector('#results').textContent.trim(),
  }))()`);
  assert.deepEqual(initialCount, {
    status: '还差 13 张暗手牌。',
    result: '当前需要 13 张暗手牌，已有 0 组副露。',
  });

  const incompleteWithMissing = await evaluate(`(() => {
    const click = (selector) => document.querySelector(selector).click();
    click('[data-missing-suit="2"]');
    click('#tile-picker [data-tile="18"]');
    const view = {
      status: document.querySelector('#status').textContent,
      result: document.querySelector('#results').textContent.trim(),
    };
    click('#clear-button');
    return view;
  })()`);
  assert.deepEqual(incompleteWithMissing, {
    status: '还差 12 张暗手牌。',
    result: '当前需要 13 张暗手牌，已有 0 组副露。',
  });

  await evaluate(`(() => {
    const click = (selector) => {
      const control = document.querySelector(selector);
      if (!control) throw new Error('Missing control: ' + selector);
      control.click();
    };
    const change = (selector, value) => {
      const control = document.querySelector(selector);
      if (!control) throw new Error('Missing control: ' + selector);
      control.value = value;
      control.dispatchEvent(new Event('change', { bubbles: true }));
    };
    const addTiles = (tiles) => tiles.forEach((tile) => click('#tile-picker [data-tile="' + tile + '"]'));
    window.__huSmoke = { click, change, addTiles };
    addTiles([0, 1, 2, 8, 8, 9, 10, 11, 12, 13, 14, 15, 15]);
  })()`);

  const completeWithoutMissingSuit = await evaluate(`(() => ({
    status: document.querySelector('#status').textContent,
    result: document.querySelector('#results').textContent.trim(),
  }))()`);
  assert.deepEqual(completeWithoutMissingSuit, {
    status: '请先选择定缺花色。',
    result: '选择定缺并补齐手牌后，这里会显示可胡牌与番数。',
  });
  await evaluate('window.__huSmoke.click(\'[data-missing-suit="2"]\')');

  const listening = await evaluate(`(() => ({
    route: location.hash,
    current: document.querySelector('[data-route="hu"]').getAttribute('aria-current'),
    handCount: document.querySelectorAll('#hand .tile').length,
    status: document.querySelector('#status').textContent,
    result: document.querySelector('#results').textContent.trim(),
    live: document.querySelector('#results').getAttribute('aria-live'),
  }))()`);
  assert.deepEqual(listening, {
    route: '#hu',
    current: 'page',
    handCount: 13,
    status: '听牌！共可胡 2 种牌。',
    result: '9万9万 0 番素胡 0番7筒7筒 0 番素胡 0番',
    live: 'polite',
  });

  await evaluate(`(() => {
    const { change, click, addTiles } = window.__huSmoke;
    change('#win-method', 'selfDraw');
    change('#special-context', 'kongDraw');
    click('#hand [data-hand-index="0"]');
    window.__handFocus = document.activeElement.getAttribute('aria-label');
    addTiles([0]);
    click('#hand [data-hand-index="0"]');
    addTiles([18]);
  })()`);
  const missingSuit = await evaluate(`(() => ({
    focus: window.__handFocus,
    status: document.querySelector('#status').textContent,
    result: document.querySelector('#results').textContent.trim(),
  }))()`);
  assert.deepEqual(missingSuit, {
    focus: '移除2万',
    status: '请先打出：1条。',
    result: '清除定缺花色后才能计算胡牌与番数。',
  });

  await evaluate(`(() => {
    const { click, addTiles } = window.__huSmoke;
    click('#hand [data-suit="2"]');
    addTiles([0]);
    click('#add-meld');
    document.querySelector('[data-remove-meld="0"]').click();
  })()`);
  const restored = await evaluate(`(() => ({
    focus: document.activeElement.id,
    result: document.querySelector('#results').textContent.trim(),
  }))()`);
  assert.equal(restored.focus, 'add-meld');
  assert.match(restored.result, /9万 2 番自摸 1番 · 杠上花 1番/);
  await screenshot('hu-desktop.png');

  await client.send('Emulation.setDeviceMetricsOverride', {
    width: 375, height: 812, deviceScaleFactor: 1, mobile: true,
  });
  await evaluate('document.querySelector("#results-title").scrollIntoView()');
  const mobile = await evaluate(`(() => ({
    exactWidth: document.documentElement.scrollWidth === innerWidth,
    resultInBounds: [...document.querySelectorAll('#results .result-card')].every((node) => {
      const box = node.getBoundingClientRect(); return box.left >= 0 && box.right <= 375 && box.width > 0;
    }),
    current: document.querySelector('[data-route="hu"]').getAttribute('aria-current'),
  }))()`);
  assert.deepEqual(mobile, { exactWidth: true, resultInBounds: true, current: 'page' });
  await screenshot('hu-mobile-375.png');

  console.log(JSON.stringify({ initialCount, incompleteWithMissing, completeWithoutMissingSuit, listening, missingSuit, restored, mobile, outputDir }, null, 2));
  await client.send('Browser.close');
} finally {
  if (client) client.close();
  await closeEdgeProcess();
  await rm(profile, { recursive: true, force: true });
}
