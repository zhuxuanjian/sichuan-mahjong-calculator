import { spawn } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const edgePath = process.env.EDGE_PATH || 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';

export async function runBrowser(projectRoot, route, check) {
  const profile = await mkdtemp(resolve(tmpdir(), 'mahjong-edge-'));
  const port = 9400 + (process.pid % 400);
  const baseUrl = process.env.PAGE_URL || pathToFileURL(resolve(projectRoot, 'index.html')).href;
  const pageUrl = `${baseUrl.split('#')[0]}#${route}`;
  const edge = spawn(edgePath, [
    '--headless=new', `--remote-debugging-port=${port}`, `--user-data-dir=${profile}`,
    '--no-first-run', '--disable-gpu', '--window-size=1365,1000', pageUrl,
  ], { stdio: 'ignore', windowsHide: true });
  let socket;
  try {
    let target;
    for (let attempt = 0; attempt < 100; attempt += 1) {
      try {
        const targets = await fetch(`http://127.0.0.1:${port}/json/list`).then((response) => response.json());
        target = targets.find((item) => item.type === 'page' && item.url.startsWith(baseUrl.split('#')[0]));
        if (target) break;
      } catch {}
      await new Promise((done) => setTimeout(done, 100));
    }
    if (!target) throw new Error('Edge DevTools target did not become ready');
    socket = new WebSocket(target.webSocketDebuggerUrl);
    const pending = new Map();
    let nextId = 0;
    const opened = new Promise((done, reject) => {
      socket.addEventListener('open', done, { once: true });
      socket.addEventListener('error', reject, { once: true });
    });
    socket.addEventListener('message', (event) => {
      const message = JSON.parse(event.data);
      const request = pending.get(message.id);
      if (!request) return;
      pending.delete(message.id);
      if (message.error) request.reject(new Error(message.error.message));
      else request.resolve(message.result);
    });
    async function send(method, params = {}) {
      await opened;
      const id = ++nextId;
      const response = new Promise((resolveRequest, reject) => pending.set(id, { resolve: resolveRequest, reject }));
      socket.send(JSON.stringify({ id, method, params }));
      return response;
    }
    async function evaluate(expression) {
      const response = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
      if (response.exceptionDetails) throw new Error(response.exceptionDetails.exception?.description || 'Browser evaluation failed');
      return response.result.value;
    }
    await send('Page.enable');
    await send('Runtime.enable');
    for (let attempt = 0; attempt < 100; attempt += 1) {
      if (await evaluate('document.readyState === "complete" && !!document.querySelector("[data-page]:not([hidden])")')) break;
      await new Promise((done) => setTimeout(done, 100));
    }
    await check({ send, evaluate, pageUrl });
    await send('Browser.close');
  } finally {
    if (socket) socket.close();
    if (edge.exitCode === null && !edge.killed) edge.kill();
    if (edge.exitCode === null) {
      await new Promise((done) => {
        const timer = setTimeout(done, 5000);
        edge.once('exit', () => { clearTimeout(timer); done(); });
      });
    }
    try {
      await rm(profile, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
    } catch (error) {
      if (error.code !== 'EBUSY') throw error;
      // Windows can keep Edge dictionary files locked briefly after the browser exits.
    }
  }
}
