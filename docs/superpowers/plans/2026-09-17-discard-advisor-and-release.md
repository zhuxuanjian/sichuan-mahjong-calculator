# Discard Advisor and Release Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the third-page discard advisor, show waits with remaining copies and discard/self-draw fan, then verify and deploy the complete three-tool site.

**Architecture:** Add one pure analysis function that removes a selected discard, reuses the shared wait and scoring engines, and calculates visible-copy availability from the original known tiles. A dedicated page module owns draw-hand input and selection; final release tests exercise all three pages together.

**Tech Stack:** Plain JavaScript, Node.js built-in `node:test`, browser/CDP smoke tests, GitHub Pages.

**Spec:** `docs/superpowers/specs/2026-09-17-sichuan-mahjong-toolbox-design.md`

## Global Constraints

- Input target is `14 - 3 × meld count` concealed tiles.
- When missing-suit tiles remain, only that suit may be discarded.
- Remaining count uses all entered concealed tiles, the selected discarded copy, and own melds; it never estimates opponents or asks for the river.
- Show both ordinary discard fan and ordinary self-draw fan; do not pre-add special win contexts.
- Preserve structural waits with zero remaining copies and label them `0 张／绝张`.
- Both fan values cap at 4 and use the highest-scoring valid interpretation.
- Publish focused tested changes through the connected GitHub repository because the local workspace has no `.git`.

---

### Task 1: Pure discard analysis

**Files:**
- Modify: `mahjong.js`
- Create: `tests/discard-analysis.test.js`

**Interfaces:**
- Produces: `Mahjong.analyzeDiscard({ concealedCounts, melds, missingSuit, discardTile, scoreBestWin })`.
- Returns `{ discardTile, blockedReason: string|null, waits: Array<{ tile, remaining, discardScore, selfDrawScore }> }` in tile order.
- `scoreBestWin` is injected as `Scoring.scoreBestWin` to keep `mahjong.js` independent of the scoring module.

- [ ] **Step 1: Write failing analysis tests**

```js
test('analyzes the selected discard and returns both scoring contexts', () => {
  const result = Mahjong.analyzeDiscard({
    concealedCounts: counts('123m123p456p777p99m'),
    melds: [], missingSuit: 2, discardTile: 8,
    scoreBestWin: Scoring.scoreBestWin,
  });
  assert.ok(result.waits.every((wait) => wait.discardScore && wait.selfDrawScore));
  assert.ok(result.waits.every((wait) => wait.selfDrawScore.finalFan >= wait.discardScore.finalFan));
});

test('requires a missing-suit discard while any remain', () => {
  assert.throws(() => Mahjong.analyzeDiscard({
    concealedCounts: counts('123m123p456p777p99s'),
    melds: [], missingSuit: 2, discardTile: 0,
    scoreBestWin: Scoring.scoreBestWin,
  }), /必须先打出定缺花色/);
});
```

- [ ] **Step 2: Run and verify failure**

Run: `node --test tests/discard-analysis.test.js`

Expected: FAIL because `analyzeDiscard` is undefined.

- [ ] **Step 3: Implement analysis without mutating input**

```js
function analyzeDiscard(input) {
  validateTileState(input.concealedCounts, input.melds, 14 - 3 * input.melds.length);
  validateDiscardChoice(input);
  const postDiscard = input.concealedCounts.slice();
  postDiscard[input.discardTile] -= 1;
  if (containsSuit(postDiscard, input.missingSuit)) {
    return { discardTile: input.discardTile, blockedReason: '打出后仍有定缺牌，请继续打定缺', waits: [] };
  }
  const wins = findWinningTiles({ concealedCounts: postDiscard, melds: input.melds, missingSuit: input.missingSuit });
  return { discardTile: input.discardTile, blockedReason: null, waits: wins.map((win) => buildWaitResult(input, win)) };
}
```

Calculate `remaining` from the original pre-discard concealed counts plus physical meld counts, so the discarded copy remains known. Score each wait once with `{ winMethod:'discard', specialContext:'normal' }` and once with `{ winMethod:'selfDraw', specialContext:'normal' }`.

- [ ] **Step 4: Complete edge-case tests**

Cover pong/open-kong/concealed-kong inputs, incorrect 14-equivalent count, absent discard tile, fifth-copy exclusion, switching discard choices, more than one missing-suit tile remaining after the discard, non-listening output, exact remaining counts, a structural zero-copy wait, candidate ordering, and input immutability.

- [ ] **Step 5: Run all pure-engine tests**

Run: `node --test tests/mahjong.test.js tests/scoring.test.js tests/settlement.test.js tests/discard-analysis.test.js`

Expected: all tests PASS.

- [ ] **Step 6: Publish discard analysis**

Publish `mahjong.js` and `tests/discard-analysis.test.js` with message `feat: analyze post-draw discard choices`.

---

### Task 2: Discard advisor page

**Files:**
- Modify: `index.html`
- Modify: `styles.css`
- Create: `discard-page.js`
- Modify: `app.js`

**Interfaces:**
- Consumes: shared picker/meld helpers and `Mahjong.analyzeDiscard` with `Scoring.scoreBestWin`.
- Produces: `DiscardPage.mount(rootElement)` and `DiscardPage.unmount()`.
- Page state: `{ hand: [], melds: [], missingSuit: null, selectedDiscard: null, history: [] }`.

- [ ] **Step 1: Add third-page semantic markup**

Replace its placeholder with missing-suit controls, meld editor, 14-equivalent tile picker, current hand, undo/clear actions, selected-discard summary, and an `aria-live` result region. Load `discard-page.js` before `app.js`.

- [ ] **Step 2: Reuse shared input behavior with the correct target**

Use the same physical-count and meld rules as the Hu page, but derive target via `14 - 3 * melds.length`. Reset `selectedDiscard` if its last copy is removed or a changed missing suit makes it illegal.

- [ ] **Step 3: Enforce discard selection visually and behaviorally**

At valid target count, concealed tiles are buttons. When any missing-suit tile remains, disable and visually mute all other suits with an explanation. Selecting a legal tile sets `selectedDiscard` but does not remove it from displayed input.

- [ ] **Step 4: Render waits, availability, and two fan values**

Render a heading such as `打出 9万后听 2 种牌`. Each result card includes tile, `理论剩余 N 张` or `0 张／绝张`, `点炮 X 番`, `自摸 Y 番`, and separate breakdown text when the labels differ. Show `打出后仍有定缺牌，请继续打定缺` when `blockedReason` is present; otherwise show `打出后未听牌` for an empty waits array.

- [ ] **Step 5: Style comparison states for mobile**

Add selected-discard, disabled-by-missing-suit, dead-wait, and dual-score styles. At 375px, keep each result card readable without horizontal scrolling and retain clear tap feedback.

- [ ] **Step 6: Run local browser acceptance**

Verify: no-meld 14 tiles, each meld type, immediate target count changes, forced missing-suit discard, two different discard selections with different waits, a non-listening discard, a zero-copy wait, and differing discard/self-draw fan. Confirm hash back/forward preserves correct page mounting.

- [ ] **Step 7: Publish the third page**

Publish `index.html`, `styles.css`, `app.js`, `discard-page.js`, `mahjong.js`, and `scoring.js` with message `feat: add discard wait and fan advisor`.

---

### Task 3: Complete regression, packaging, and GitHub Pages release

**Files:**
- Modify: `README.md`
- Modify: `tests/mahjong.test.js`
- Modify: `tests/scoring.test.js`
- Modify: `tests/settlement.test.js`
- Modify: `tests/discard-analysis.test.js`
- Update deliverable: `outputs/sichuan-mahjong-calculator/`
- Update deliverable: `outputs/sichuan-mahjong-calculator.zip`

**Interfaces:**
- Consumes all public APIs and three mounted pages.
- Produces a documented, packaged, deployed release at the existing public URL.

- [ ] **Step 1: Run the complete automated suite**

Run: `node --test tests/*.test.js`

Expected: all tests PASS with no skipped or todo tests.

- [ ] **Step 2: Audit spec coverage in tests**

Confirm named tests exist for every fan, all three kong payments, one-discard multiple winners, exited players, event reorder failure, forced missing-suit discard, remaining count, zero-copy wait, and both fan contexts. Add explicit assertions for any missing case, run the suite, and require PASS.

- [ ] **Step 3: Perform real-browser desktop and mobile regression**

At desktop and 375px widths, execute all three happy paths plus validation errors. Assert `document.documentElement.scrollWidth === window.innerWidth` at 375px. Check keyboard focus, `aria-current`, live result announcements, and that the Hu page contains no remaining-count copy.

- [ ] **Step 4: Update user documentation**

Document the three routes, confirmed fan table, base formula, all kong transfers, winner exit rule, one-discard multiple winners, remaining-count limitation, local opening instructions, test command, and public GitHub Pages URL. Do not describe unsupported draw penalties or persistence.

- [ ] **Step 5: Refresh the downloadable package**

Copy only runtime files into `outputs/sichuan-mahjong-calculator/`: `index.html`, `styles.css`, `mahjong.js`, `scoring.js`, `settlement.js`, `ui-common.js`, `hu-page.js`, `settlement-page.js`, `discard-page.js`, and `app.js`. Rebuild `outputs/sichuan-mahjong-calculator.zip`, inspect its entries, and ensure paths open directly after extraction.

- [ ] **Step 6: Publish the release commit**

Publish all changed runtime files, tests, README, specs, and plans to `main` with message `release: ship three-tool Sichuan mahjong calculator`.

- [ ] **Step 7: Verify GitHub Pages production**

Open `https://zhuxuanjian.github.io/sichuan-mahjong-calculator/`, wait for the updated files, and run one full interaction on each route at 375px. Verify the default route is Hu calculation, final settlement sums to zero, and discard results show remaining copies plus both fan values.

