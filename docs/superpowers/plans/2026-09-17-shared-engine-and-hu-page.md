# Shared Engine and Hu Page Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add meld-aware win decomposition, traditional Chengdu fan scoring, missing-suit warnings, and hash navigation while keeping Hu calculation as the default page.

**Architecture:** Keep the static no-build application and expose pure UMD-style APIs for Node tests and browsers. Split UI responsibilities into `ui-common.js`, `hu-page.js`, and a small hash router in `app.js`; the scoring module consumes interpretations from the Mahjong engine without touching the DOM.

**Tech Stack:** HTML5, CSS, plain JavaScript, Node.js built-in `node:test`, GitHub Pages.

**Spec:** `docs/superpowers/specs/2026-09-17-sichuan-mahjong-toolbox-design.md`

## Global Constraints

- Use only the 27 numbered tiles in 万、筒、条; no honor tiles and no chi melds.
- Support pong, open kong, and concealed kong; combined concealed and meld copies may never exceed four.
- Use additive traditional Chengdu scoring with a 4-fan cap, self-draw +1 fan, and no 断幺九 or 全带幺.
- Default route is `#hu`; the site remains static, responsive, and dependency-free.
- Do not show remaining-tile counts on the Hu page.
- The local workspace has no `.git`; after each tested task, publish the listed files as one focused commit through the connected GitHub repository rather than inventing local git history.

---

### Task 1: Meld-aware win interpretations

**Files:**
- Modify: `mahjong.js`
- Modify: `tests/mahjong.test.js`

**Interfaces:**
- Consumes: concealed 27-count arrays and exposed melds shaped as `{ type: 'pong'|'openKong'|'concealedKong', tile: number }`.
- Produces: `Mahjong.validateTileState(counts, melds, expectedConcealed)`, `Mahjong.getWinInterpretations(counts, melds)`, and `Mahjong.findWinningTiles({ concealedCounts, melds, missingSuit })`.
- `getWinInterpretations` returns `{ kind: 'standard', pair: number, melds: Array<{ kind: 'sequence'|'triplet', tile: number }> }` or `{ kind: 'sevenPairs' }` entries.

- [ ] **Step 1: Replace legacy outcome assertions with failing interpretation tests**

```js
test('returns every standard decomposition with exposed melds', () => {
  const melds = [{ type: 'pong', tile: 0 }];
  const wins = Mahjong.getWinInterpretations(counts('123m123p777p99s'), melds);
  assert.ok(wins.some((win) => win.kind === 'standard' && win.pair === 26));
});

test('allows seven pairs only without exposed melds', () => {
  assert.deepEqual(Mahjong.getWinInterpretations(counts('113355m77p224466s'), []), [
    { kind: 'sevenPairs' },
  ]);
  assert.equal(Mahjong.getWinInterpretations(
    counts('11223344556m'),
    [{ type: 'pong', tile: 18 }],
  ).some((win) => win.kind === 'sevenPairs'), false);
});
```

- [ ] **Step 2: Run the focused tests and verify failure**

Run: `node --test tests/mahjong.test.js`

Expected: FAIL because `getWinInterpretations` and the object-form `findWinningTiles` API do not exist.

- [ ] **Step 3: Implement exhaustive decomposition and state validation**

```js
function getWinInterpretations(counts, melds = []) {
  const neededConcealedMelds = 4 - melds.length;
  const expectedTotal = neededConcealedMelds * 3 + 2;
  // Validate, try each pair, recursively collect every triplet/sequence path,
  // de-duplicate by a stable serialized key, then append sevenPairs only when melds.length === 0.
}

function validateTileState(counts, melds, expectedConcealed) {
  // Validate meld type/tile, concealed total, and physical count:
  // pong contributes 3; each kong contributes 4; every tile total must be <= 4.
}
```

Keep `isStandardWin` and `getSpecialHands` as compatibility wrappers until all callers move to the new API. Remove `remaining`, `patterns`, and `dragonCount` from the new `findWinningTiles` results; return `{ tile, interpretations }`.

- [ ] **Step 4: Add validation and multi-decomposition coverage**

Add exact tests for zero through four melds, a pong plus concealed over-count, invalid meld types, seven pairs with a four-of-a-kind, multiple standard decompositions, missing-suit rejection, candidate fifth-copy rejection, and numeric result ordering.

- [ ] **Step 5: Run the engine suite**

Run: `node --test tests/mahjong.test.js`

Expected: all Mahjong tests PASS.

- [ ] **Step 6: Publish the focused engine change**

Publish `mahjong.js` and `tests/mahjong.test.js` to `main` with message `feat: add meld-aware win interpretations`.

---

### Task 2: Pure fan-scoring engine

**Files:**
- Create: `scoring.js`
- Create: `tests/scoring.test.js`

**Interfaces:**
- Consumes: `Scoring.scoreBestWin({ concealedCounts, winningTile, melds, interpretations, winMethod, specialContext })`.
- Produces: `{ interpretation, breakdown: Array<{ name: string, fan: number }>, rawFan: number, finalFan: number, capped: boolean }`.
- `winMethod` is `'discard'|'selfDraw'`; `specialContext` is `'normal'|'kongDraw'|'kongDiscard'|'robKong'|'lastTile'`.

- [ ] **Step 1: Write failing scoring tests**

```js
function scoreNotation(notation, winMethod, specialContext) {
  const concealedCounts = counts(notation);
  return Scoring.scoreBestWin({
    concealedCounts,
    winningTile: concealedCounts.findLastIndex((count) => count > 0),
    melds: [],
    interpretations: Mahjong.getWinInterpretations(concealedCounts, []),
    winMethod,
    specialContext,
  });
}

test('adds compatible fans and caps the final fan at four', () => {
  const result = Scoring.scoreBestWin({
    concealedCounts: counts('11122233344455m'),
    winningTile: 4,
    melds: [],
    interpretations: Mahjong.getWinInterpretations(counts('11122233344455m'), []),
    winMethod: 'selfDraw',
    specialContext: 'kongDraw',
  });
  assert.equal(result.rawFan, 5); // 大对子1 + 清一色2 + 自摸1 + 杠上花1
  assert.equal(result.finalFan, 4);
  assert.equal(result.capped, true);
});

test('scores seven pairs plus each root without merging standard labels', () => {
  const result = scoreNotation('11112233445566m', 'discard', 'normal');
  assert.deepEqual(result.breakdown.map((item) => item.name), ['七对', '根', '清一色']);
  assert.equal(result.rawFan, 5);
});
```

- [ ] **Step 2: Run and confirm the module is missing**

Run: `node --test tests/scoring.test.js`

Expected: FAIL with module-not-found for `../scoring.js`.

- [ ] **Step 3: Implement stable fan evaluation**

```js
function scoreBestWin(input) {
  const candidates = input.interpretations.map((interpretation) => scoreInterpretation(input, interpretation));
  candidates.sort((a, b) => b.rawFan - a.rawFan || interpretationKey(a).localeCompare(interpretationKey(b)));
  return candidates[0];
}
```

Implement exact predicates for 大对子, 金钩钓, each 根, 七对, 清一色, self-draw, and the four compatible special contexts. Emit 素胡 with fan 0 only when no positive structural or contextual label applies. Reject context/method conflicts with a descriptive error.

- [ ] **Step 4: Complete the scoring matrix**

Test each fan alone, multiple roots, four meld 金钩钓, mixed-suit rejection for 清一色, exposed-kong roots, ordinary 0-fan hand, all four special contexts, incompatible contexts, exactly 4 raw fan, more than 4 raw fan, and a hand where competing interpretations choose the higher raw fan. Assert that 断幺九 and 全带幺 never appear in `breakdown`.

- [ ] **Step 5: Run engine and scoring tests together**

Run: `node --test tests/mahjong.test.js tests/scoring.test.js`

Expected: all tests PASS.

- [ ] **Step 6: Publish scoring**

Publish `scoring.js` and `tests/scoring.test.js` with message `feat: calculate traditional Chengdu fan`.

---

### Task 3: Shared UI utilities and three-route shell

**Files:**
- Create: `ui-common.js`
- Modify: `index.html`
- Modify: `styles.css`
- Modify: `app.js`
- Create: `hu-page.js`

**Interfaces:**
- Produces: `UICommon.tileLabel(tile)`, `UICommon.tileMarkup(tile)`, `UICommon.countPhysicalTiles(hand, melds)`, and reusable picker/meld render helpers.
- Produces: `HuPage.mount(rootElement)` and `HuPage.unmount()`.
- `app.js` maps unknown/empty hash to `hu` and toggles `[data-page]` containers plus `[data-route]` buttons.

- [ ] **Step 1: Add the static shell before behavior**

Add a `<nav aria-label="工具切换">` with buttons linking to `#hu`, `#settlement`, and `#discard`. Add three page containers; put the existing controls inside `data-page="hu"`, and temporary explanatory empty states inside the other two. Load scripts in this order:

```html
<script src="mahjong.js"></script>
<script src="scoring.js"></script>
<script src="ui-common.js"></script>
<script src="hu-page.js"></script>
<script src="app.js"></script>
```

- [ ] **Step 2: Implement and manually smoke-test hash routing**

Implement `normalizeRoute(location.hash)`, active nav `aria-current`, hidden page toggling, `hashchange`, and default replacement to `#hu`. Open `index.html`, click all three buttons, use browser back/forward, and directly enter an unknown hash.

Expected: no page reload; unknown hash lands on Hu calculation.

- [ ] **Step 3: Extract shared tile rendering and Hu state**

Move label/markup/count helpers out of legacy `app.js`. Give the Hu page state this exact shape:

```js
{
  hand: [],
  melds: [],
  missingSuit: null,
  winMethod: 'discard',
  specialContext: 'normal',
  history: []
}
```

History snapshots must deep-copy melds and all context fields.

- [ ] **Step 4: Add meld and context controls**

Render a meld editor with type buttons for 碰、明杠、暗杠 and a tile selector. Enforce the physical four-copy maximum before insertion. Recalculate the hand target as `13 - 3 * melds.length`. Add method/context controls whose legal values match the scoring interface and reset incompatible context to `normal`.

- [ ] **Step 5: Add immediate missing-suit warnings**

Mark matching concealed tiles and meld cards with a warning class and text such as `请先打出：3万×2、7万`. Keep edit controls enabled, but skip wait/scoring calls until no missing-suit tile remains.

- [ ] **Step 6: Render scored results and remove remaining counts**

For every `Mahjong.findWinningTiles` result, call `Scoring.scoreBestWin`. Render final fan, raw fan when capped, and joined breakdown. Confirm no DOM element or copy on the Hu page contains `理论剩余`.

- [ ] **Step 7: Add CSS and accessibility behavior**

Style navigation, meld cards, warning state, method controls, fan badges, and the hidden page containers. At 375px width, keep one-column layout, no horizontal scroll, minimum practical touch targets, visible focus styles, and non-color warning text.

- [ ] **Step 8: Run automated and local browser checks**

Run: `node --test tests/mahjong.test.js tests/scoring.test.js`

Expected: all tests PASS. Then verify a scored standard wait, seven pairs, four-meld single wait, missing-suit warning, undo, clear, and all three routes in a real browser.

- [ ] **Step 9: Publish the working first phase**

Publish `index.html`, `styles.css`, `app.js`, `ui-common.js`, `hu-page.js`, `mahjong.js`, and `scoring.js` with message `feat: add scored Hu page and tool navigation`.

