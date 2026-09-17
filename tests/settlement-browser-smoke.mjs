import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const projectRoot = process.env.PROJECT_ROOT || resolve(dirname(fileURLToPath(import.meta.url)), '..');
const edgePath = process.env.EDGE_PATH || 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const outputDir = process.env.BROWSER_ARTIFACTS || resolve(projectRoot, '.browser-artifacts');
const profile = await mkdtemp(resolve(tmpdir(), 'settlement-edge-'));
const port = 9300 + (process.pid % 500);
const pageUrl = `${pathToFileURL(resolve(projectRoot, 'index.html')).href}#settlement`;
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
    if (await evaluate('document.readyState === "complete" && !document.querySelector("#settlement-page").hidden')) break;
    await new Promise((resolveWait) => setTimeout(resolveWait, 100));
  }

  await evaluate(`(() => {
    const change = (selector, value) => {
      const control = document.querySelector(selector);
      if (!control) throw new Error('Missing control: ' + selector);
      control.value = value;
      control.dispatchEvent(new Event('change', { bubbles: true }));
    };
    const click = (selector) => {
      const control = document.querySelector(selector);
      if (!control) throw new Error('Missing button: ' + selector);
      control.click();
    };
    window.__settlementSmoke = { change, click };
    const blankName = document.querySelector('#settlement-name-p1');
    blankName.value = '  \t ';
    blankName.dispatchEvent(new Event('change', { bubbles: true }));
    click('#settlement-add-event');
    window.__nameGuard = {
      events: document.querySelectorAll('.ledger-event').length,
      status: document.querySelector('#settlement-form-error').textContent,
      focused: document.activeElement.id,
    };
    if (window.__nameGuard.events !== 0 || !/请先输入所有玩家名称/.test(window.__nameGuard.status)
      || window.__nameGuard.focused !== 'settlement-name-p1') throw new Error('Blank player name bypassed the settlement guard');

    change('#settlement-name-p1', '  Alice  ');
    if (document.querySelector('#settlement-name-p1').value !== 'Alice') throw new Error('Player name was not normalized');
    ['Bob', 'Carol', 'Dave'].forEach((name, index) => change('#settlement-name-p' + (index + 2), name));

    change('#settlement-event-type', 'concealedKong');
    change('[name="actorId"]', 'p1'); click('#settlement-add-event');
    change('#settlement-event-type', 'addedKong');
    change('[name="actorId"]', 'p2'); click('#settlement-add-event');
    change('#settlement-event-type', 'discardKong');
    change('[name="actorId"]', 'p3'); change('[name="payerId"]', 'p4'); click('#settlement-add-event');
    change('#settlement-event-type', 'discardWin');
    change('[name="payerId"]', 'p1'); click('[data-add-winner]');
    change('[data-winner-row="0"] [name="winnerId"]', 'p2');
    change('[data-winner-row="1"] [name="winnerId"]', 'p3');
    change('[data-winner-row="0"] [name="winnerFan"]', '1');
    change('[data-winner-row="1"] [name="winnerFan"]', '2');
    click('#settlement-add-event');
    change('#settlement-event-type', 'selfDraw');
    const activeOptions = [...document.querySelector('[name="winnerId"]').options].map((option) => option.value).join(',');
    if (activeOptions !== 'p1,p4') throw new Error('Exited winners still appear in participant options: ' + activeOptions);
    change('[name="winnerId"]', 'p4'); change('[name="fan"]', '1'); click('#settlement-add-event');
  })()`);

  const desktop = await evaluate(`(() => ({
    nameGuard: window.__nameGuard,
    events: document.querySelectorAll('.ledger-event').length,
    balanceGroups: [...document.querySelectorAll('.event-balances')].map((node) => node.children.length),
    transfers: document.querySelectorAll('.transfer-list li').length,
    status: document.querySelector('#settlement-replay-status').textContent,
    overflow: document.documentElement.scrollWidth > innerWidth,
  }))()`);
  assert.equal(desktop.events, 5);
  assert.deepEqual(desktop.nameGuard, {
    events: 0,
    status: '请先输入所有玩家名称。',
    focused: 'settlement-name-p1',
  });
  assert.deepEqual(desktop.balanceGroups, [4, 4, 4, 4, 4]);
  assert.equal(desktop.transfers, 10);
  assert.match(desktop.status, /净收支合计 \+0/);
  assert.equal(desktop.overflow, false);

  await evaluate(`(() => {
    const { click } = window.__settlementSmoke;
    click('[data-move-event="4"][data-direction="-1"]');
    click('[data-move-event="3"][data-direction="-1"]');
  })()`);
  const rejectedMove = await evaluate(`(() => ({
    status: document.querySelector('#settlement-replay-status').textContent,
    fourth: document.querySelectorAll('.ledger-event header p')[3].textContent,
    fifth: document.querySelectorAll('.ledger-event header p')[4].textContent,
  }))()`);
  assert.match(rejectedMove.status, /原顺序已保留/);
  assert.match(rejectedMove.fourth, /Dave 自摸/);
  assert.match(rejectedMove.fifth, /Alice 点炮/);

  await evaluate(`(() => {
    const { click } = window.__settlementSmoke;
    click('[data-delete-event="3"]');
    if (document.querySelectorAll('.ledger-event').length !== 4) throw new Error('Delete failed');
    click('#settlement-undo');
    if (document.querySelectorAll('.ledger-event').length !== 5) throw new Error('Undo failed');
    window.__confirmCalled = false;
    window.confirm = () => { window.__confirmCalled = true; return true; };
    click('#settlement-clear');
  })()`);
  const cleared = await evaluate(`(() => ({
    confirmed: window.__confirmCalled,
    events: document.querySelectorAll('.ledger-event').length,
    names: [...document.querySelectorAll('[data-player-id]')].map((input) => input.value),
  }))()`);
  assert.equal(cleared.confirmed, true);
  assert.equal(cleared.events, 0);
  assert.deepEqual(cleared.names, ['玩家1', '玩家2', '玩家3', '玩家4']);
  await evaluate('document.querySelector("#settlement-undo").click()');
  assert.equal(await evaluate('document.querySelectorAll(".ledger-event").length'), 5);
  await screenshot('settlement-desktop.png');

  await client.send('Emulation.setDeviceMetricsOverride', {
    width: 375, height: 812, deviceScaleFactor: 1, mobile: true,
  });
  const mobile = await evaluate(`(() => {
    const cards = [...document.querySelectorAll('.balance-card')].map((node) => node.getBoundingClientRect());
    const buttons = [...document.querySelectorAll('.ledger-actions button')].map((node) => node.getBoundingClientRect());
    return {
      overflow: document.documentElement.scrollWidth > 375,
      firstRowCards: cards.filter((card) => Math.abs(card.top - cards[0].top) < 2).length,
      buttonsReachable: buttons.every((button) => button.left >= 0 && button.right <= 375 && button.width > 0),
      labels: document.querySelectorAll('#settlement-event-form label').length,
    };
  })()`);
  assert.equal(mobile.overflow, false);
  assert.equal(mobile.firstRowCards, 2);
  assert.equal(mobile.buttonsReachable, true);
  assert.ok(mobile.labels >= 2);
  await screenshot('settlement-mobile-375.png');
  await evaluate('document.querySelector("#settlement-ledger-title").scrollIntoView()');
  await screenshot('settlement-mobile-ledger-375.png');

  console.log(JSON.stringify({ desktop, rejectedMove, cleared, mobile, outputDir }, null, 2));
  await client.send('Browser.close');
} finally {
  if (client) client.close();
  await closeEdgeProcess();
  await rm(profile, { recursive: true, force: true });
}
