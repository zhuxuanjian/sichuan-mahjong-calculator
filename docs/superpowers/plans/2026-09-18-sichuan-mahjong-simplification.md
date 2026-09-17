# Sichuan Mahjong Two-Tool Simplification Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the three-tool, meld-aware, scored application with two dark-hand-only tools that accept every non-foul modulo-3 hand size and fit all mobile tiles on one row.

**Architecture:** Keep the dependency-free static site and one shared pure Mahjong engine. The engine infers the required meld count from the concealed total; the two page modules own independent hand/missing-suit state, while `app.js` routes only `hu` and `discard`. Remove settlement, scoring, meld editing, and every runtime/test artifact that exists only for those deleted features.

**Tech Stack:** HTML5, CSS, plain UMD-style JavaScript, Node.js built-in `node:test`, headless Microsoft Edge, GitHub Pages.

**Spec:** `docs/superpowers/specs/2026-09-18-sichuan-mahjong-simplification-design.md`

## Global Constraints

- Use only 万、筒、条 27 tile types; each tile may appear at most four times and the input may contain at most 14 tiles.
- Hu analysis accepts exactly `1, 4, 7, 10, 13` concealed tiles; discard analysis accepts exactly `2, 5, 8, 11, 14`.
- Other nonzero counts are foul (`相公`) and must not call the analysis engine.
- Keep missing-suit selection and enforcement; remove every exposed-meld input and rule.
- Hu results show only winning tiles. Discard results show the selected discard, winning tiles, and theoretical remaining copies.
- No page may show fan, pattern names, win method, special context, or settlement functionality.
- Mobile suit pickers (9 tiles) and current hands (up to 14 tiles) remain single-row, proportionally scaled, and never horizontally scroll.
- Keep the existing public GitHub Pages URL and dependency-free local-file operation.
- Develop and review locally before updating `main`; rebuild the outer `outputs/sichuan-mahjong-calculator/` folder and ZIP from the reviewed runtime files.

---

### Task 1: Variable-length dark-hand Mahjong engine

**Files:**
- Modify: `mahjong.js`
- Modify: `tests/mahjong.test.js`
- Modify: `tests/discard-analysis.test.js`
- Delete: `scoring.js`
- Delete: `tests/scoring.test.js`

**Interfaces:**
- Consumes: 27-count concealed arrays and `missingSuit` integers `0|1|2`; no meld arrays.
- Produces: `Mahjong.isValidHuCount(count): boolean`, `Mahjong.isValidDiscardCount(count): boolean`, `Mahjong.getWinInterpretations(counts): Array<{ kind:'standard', pair:number, melds:Array<{kind:'sequence'|'triplet',tile:number}> }|{kind:'sevenPairs'}>`, `Mahjong.findWinningTiles({ concealedCounts, missingSuit }): Array<{tile:number, interpretations:Array}>`, and `Mahjong.analyzeDiscard({ concealedCounts, missingSuit, discardTile }): { discardTile:number, blockedReason:string|null, waits:Array<{tile:number,remaining:number}> }`.
- `findWinningTiles` accepts only counts in `1,4,7,10,13`; `analyzeDiscard` accepts only counts in `2,5,8,11,14`.

- [ ] **Step 1: Replace fixed/meld-aware tests with failing variable-length cases**

```js
test('accepts every non-foul Hu input count', () => {
  assert.deepEqual([0,1,2,3,4,7,10,13,14].map(Mahjong.isValidHuCount),
    [false,true,false,false,true,true,true,true,false]);
});

test('finds pair-only and one-meld waits', () => {
  assert.deepEqual(Mahjong.findWinningTiles({ concealedCounts: counts('1m'), missingSuit: 2 }).map(x => x.tile), [0]);
  assert.ok(Mahjong.findWinningTiles({ concealedCounts: counts('123m4p'), missingSuit: 2 }).some(x => x.tile === 12));
});
```

Add exact cases for all five Hu input sizes, all five discard input sizes, foul counts, fifth-copy rejection, missing suit, 14-tile seven pairs, multi-wait ordering, zero-copy discard waits, and input immutability. Remove all meld arguments and score-object assertions.

- [ ] **Step 2: Run the focused suites and verify RED**

Run:

```powershell
node --test --test-isolation=none tests/mahjong.test.js tests/discard-analysis.test.js
```

Expected: FAIL because the engine still requires meld-shaped inputs and fixed 13/14 totals.

- [ ] **Step 3: Generalize decomposition and count validation**

```js
const HU_COUNTS = new Set([1, 4, 7, 10, 13]);
const DISCARD_COUNTS = new Set([2, 5, 8, 11, 14]);

function getWinInterpretations(counts) {
  const total = counts.reduce((sum, count) => sum + count, 0);
  if (total % 3 !== 2 || total < 2 || total > 14) return [];
  const requiredMelds = (total - 2) / 3;
  // Try each pair, collect exactly requiredMelds sequences/triplets,
  // then add sevenPairs only when total === 14.
}
```

Delete physical meld counting and meld validation. Keep stable decomposition de-duplication and compatibility wrappers only where a surviving caller/test needs them.

- [ ] **Step 4: Simplify waits and discard analysis**

```js
function analyzeDiscard({ concealedCounts, missingSuit, discardTile }) {
  validateCounts(concealedCounts);
  if (!isValidDiscardCount(sumCounts(concealedCounts))) throw new Error('当前手牌相公');
  validateDiscardChoice(concealedCounts, missingSuit, discardTile);
  const postDiscard = concealedCounts.slice();
  postDiscard[discardTile] -= 1;
  if (containsSuit(postDiscard, missingSuit)) {
    return { discardTile, blockedReason: '打出后仍有定缺牌，请继续打定缺', waits: [] };
  }
  return {
    discardTile,
    blockedReason: null,
    waits: findWinningTiles({ concealedCounts: postDiscard, missingSuit })
      .map(({ tile }) => ({ tile, remaining: 4 - concealedCounts[tile] })),
  };
}
```

Remove `scoreBestWin`, `discardScore`, `selfDrawScore`, and exposed physical counts from the interface.

- [ ] **Step 5: Delete scoring and run pure-engine regression**

Delete `scoring.js` and `tests/scoring.test.js`, then run:

```powershell
node --test --test-isolation=none tests/mahjong.test.js tests/discard-analysis.test.js
git diff --check
```

Expected: all surviving engine tests PASS; no scoring import or field remains.

- [ ] **Step 6: Commit the engine simplification**

```powershell
git add -A mahjong.js scoring.js tests/mahjong.test.js tests/discard-analysis.test.js tests/scoring.test.js
git commit -m "refactor: simplify Mahjong analysis to dark hands"
```

---

### Task 2: Two-page UI and single-row mobile tiles

**Files:**
- Modify: `index.html`
- Modify: `app.js`
- Modify: `ui-common.js`
- Modify: `hu-page.js`
- Modify: `discard-page.js`
- Modify: `styles.css`
- Modify: `tests/discard-page.test.js`
- Modify: `tests/hu-browser-smoke.mjs`
- Modify: `tests/discard-browser-smoke.mjs`
- Delete: `settlement.js`
- Delete: `settlement-page.js`
- Delete: `tests/settlement.test.js`
- Delete: `tests/settlement-page.test.js`
- Delete: `tests/settlement-browser-smoke.mjs`

**Interfaces:**
- Consumes: Task 1's count predicates, `findWinningTiles({concealedCounts,missingSuit})`, and `analyzeDiscard({concealedCounts,missingSuit,discardTile})`.
- Produces: `HuPage.mount/unmount`, `DiscardPage.mount/unmount`, and two routes `hu|discard`.
- Page state shapes are `{ hand:number[], missingSuit:number|null, history:Array }` and `{ hand:number[], missingSuit:number|null, selectedDiscard:number|null, history:Array }`.

- [ ] **Step 1: Write failing page-state and copy tests**

```js
test('classifies Hu page counts without a fixed target', () => {
  assert.deepEqual([1,4,7,10,13].map(HuPage.isReadyCount), [true,true,true,true,true]);
  assert.equal(HuPage.isReadyCount(12), false);
});

test('discard result view contains no scoring fields', () => {
  const view = DiscardPage.createAnalysisView(validState, Mahjong);
  assert.equal(JSON.stringify(view).includes('Score'), false);
});
```

Add browser assertions that navigation has two buttons, `#settlement` falls back to `#hu`, Hu DOM contains none of `副露、暗杠、胡牌情境、番`, and discard result contains no `点炮、自摸、番型、番`.

- [ ] **Step 2: Run page tests and verify RED**

Run:

```powershell
node --test --test-isolation=none tests/discard-page.test.js
```

Expected: FAIL because current states, views, and DOM still depend on meld and score fields.

- [ ] **Step 3: Reduce the document and router to two tools**

Remove the entire settlement page, all meld/context sections, scoring/settlement script tags, and the settlement navigation button. Put each page's current-hand block immediately after its picker within the same panel. Set router configuration to:

```js
const routes = ['hu', 'discard'];
function normalizeRoute(hash) {
  const route = hash.replace(/^#/, '');
  return routes.includes(route) ? route : 'hu';
}
```

- [ ] **Step 4: Simplify page state and rendering**

Remove every `melds`, `meldType`, `winMethod`, and `specialContext` field and event handler. Allow adding up to 14 tiles. Use engine count predicates to show:

- zero tiles: continue adding;
- nonzero invalid count: `当前手牌相公，本页支持 1、4、7、10、13 张。` or the discard equivalent;
- valid count: then apply missing-suit and result rules.

Hu cards contain only tile markup and tile label. Discard cards contain only tile markup, label, and remaining/dead text.

- [ ] **Step 5: Implement single-row proportional sizing**

Render picker rows and hands with explicit column-count classes or CSS variables:

```css
@media (max-width: 600px) {
  .tile-row .tile { width: calc((100% - 8 * 3px) / 9); min-width: 0; }
  .hand { display: grid; grid-template-columns: repeat(var(--hand-size), minmax(0, 1fr)); gap: 2px; }
  .hand .tile { width: 100%; min-width: 0; font-size: clamp(.62rem, 2.8vw, .82rem); }
}
```

Do not use wrapping or horizontal overflow. Preserve clickable removal and selected-discard styling.

- [ ] **Step 6: Remove settlement/meld/scoring files and styles**

Delete all listed settlement files/tests and remove `.settlement-*`, `.meld-*`, `.dual-score`, score badge, and context-only selectors. Remove `meldMarkup` and meld physical-count helpers from `ui-common.js` when no surviving caller uses them.

- [ ] **Step 7: Run UI and browser regression**

Run all surviving `.test.js` files, then the Hu and discard Edge scripts at desktop and 375px. Assert:

```js
assert.equal(document.documentElement.scrollWidth, window.innerWidth);
assert.equal(document.querySelectorAll('.tile-row')[0].getClientRects().length, 1);
assert.equal(new Set([...document.querySelectorAll('#hand .tile')].map(el => Math.round(el.getBoundingClientRect().top))).size, 1);
```

Also verify the current hand is immediately below the picker and 14 discard-page hand tiles share one top coordinate.

- [ ] **Step 8: Commit the UI simplification**

```powershell
git add -A index.html app.js ui-common.js hu-page.js discard-page.js styles.css settlement.js settlement-page.js tests
git commit -m "feat: simplify site to Hu and discard tools"
```

---

### Task 3: Documentation, package, and production release

**Files:**
- Modify: `README.md`
- Update deliverable: `C:/Users/29704/Documents/Codex/2026-09-17/bang/outputs/sichuan-mahjong-calculator/`
- Update deliverable: `C:/Users/29704/Documents/Codex/2026-09-17/bang/outputs/sichuan-mahjong-calculator.zip`

**Interfaces:**
- Consumes: the reviewed two-tool runtime from Tasks 1 and 2.
- Produces: a seven-file runtime package (`index.html`, `styles.css`, `mahjong.js`, `ui-common.js`, `hu-page.js`, `discard-page.js`, `app.js`; `README.md` remains repository documentation outside the runtime ZIP), updated `main`, and the existing GitHub Pages URL.

- [ ] **Step 1: Run the complete surviving automated suite**

```powershell
$testFiles = Get-ChildItem tests -Filter '*.test.js' | Sort-Object Name | ForEach-Object FullName
node --test --test-isolation=none $testFiles
```

Expected: 0 failures, 0 skipped, 0 todo. Confirm no test imports scoring, settlement, or meld APIs.

- [ ] **Step 2: Audit removed feature strings and files**

```powershell
rg -n "settlement|Settlement|scoring|Scoring|scoreBestWin|openKong|concealedKong|pong|副露|暗杠|明杠|胡牌情境|点炮|自摸|番型|番" index.html app.js ui-common.js hu-page.js discard-page.js styles.css tests
rg -n "副露|暗杠|明杠|牌局结算|胡牌情境|听牌番数|胡牌番数" README.md
```

Expected: the first command has no runtime/UI matches. Review any README matches and keep them only when they clearly describe removed features or migration from the earlier version. Confirm deleted files do not exist.

- [ ] **Step 3: Update README**

Document only the two routes, legal hand sizes, foul-count behavior, missing suit, theoretical remaining-count limitation, mobile single-row behavior, local opening, test command, and public URL. Remove the fan table, kong settlement, winner-exit, and settlement instructions.

- [ ] **Step 4: Verify real desktop and mobile flows**

Run Hu and discard browser scripts against the repository at desktop and 375px. Exercise every legal count at least through the pure tests, and use the browser to verify one small hand plus 13/14-tile hands, route fallback, no removed text, single-row positions, and no horizontal overflow.

- [ ] **Step 5: Rebuild and inspect the offline package**

Replace the outer output directory with only the seven runtime files: `index.html`, `styles.css`, `mahjong.js`, `ui-common.js`, `hu-page.js`, `discard-page.js`, and `app.js`. Rebuild the ZIP with those seven files at its root, compare SHA-256 hashes to the reviewed repository, extract to a temporary directory, and run both browser flows from `file://`.

- [ ] **Step 6: Create the local release commit**

```powershell
git add README.md tests
git commit -m "release: ship simplified two-tool calculator"
```

If Task 2 already committed all runtime/tests and README is the only tracked release change, commit only README. Do not create an empty commit.

- [ ] **Step 7: Publish after final review**

After task review and whole-plan review pass, fast-forward `main`, rerun the full suite on `main`, push `main`, and verify `#hu` and `#discard` on the public GitHub Pages URL with real Edge at 375px. Confirm `#settlement` redirects to `#hu`.
