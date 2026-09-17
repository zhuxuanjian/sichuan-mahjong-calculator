# Settlement Calculator Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the second-page ordered event ledger that calculates four players' kong and win payments with winner exit semantics.

**Architecture:** Put all financial rules in a pure replay engine so any edit recomputes the ledger from the beginning. The page module owns the draft form and event ordering; it renders only the replay engine's validated result.

**Tech Stack:** Plain JavaScript, Node.js built-in `node:test`, existing static HTML/CSS shell.

**Spec:** `docs/superpowers/specs/2026-09-17-sichuan-mahjong-toolbox-design.md`

## Global Constraints

- Exactly four players; names are editable labels and stable IDs drive calculations.
- Hu payment is `2^finalFan`, where final fan is manually selected from 0 through 4.
- Kong payments are fixed and never multiplied by fan.
- A player exits all later payments and actions immediately after winning.
- Support one-discard multiple winners; do not transfer kong money on 杠上炮.
- Do not implement 查花猪、查大叫、退税, or automatic fan recognition on this page.
- Publish each tested task as a focused commit through the connected GitHub repository because the local workspace has no `.git`.

---

### Task 1: Pure ordered settlement replay engine

**Files:**
- Create: `settlement.js`
- Create: `tests/settlement.test.js`

**Interfaces:**
- Consumes: `Settlement.replay(players, events)` where players are `{ id: string, name: string }`.
- Event shapes are `{ type: 'concealedKong'|'addedKong', actorId }`, `{ type: 'discardKong', actorId, payerId }`, `{ type: 'discardWin', payerId, winners: Array<{ playerId, fan }> }`, and `{ type: 'selfDraw', winnerId, fan }`.
- Produces: `{ ok, players: Array<{ id,name,won,income,expense,net }>, eventResults: Array<{ event, transfers, balancesAfter }>, error?: { index,message } }`.
- Each transfer is `{ fromId, toId, amount, reason }`.

- [ ] **Step 1: Write failing payment tests**

```js
const players = ['a', 'b', 'c', 'd'].map((id) => ({ id, name: id.toUpperCase() }));

test('settles the three kong types with fixed amounts', () => {
  const result = Settlement.replay(players, [
    { type: 'concealedKong', actorId: 'a' },
    { type: 'addedKong', actorId: 'b' },
    { type: 'discardKong', actorId: 'd', payerId: 'c' },
  ]);
  assert.deepEqual(result.players.map((p) => p.net), [5, 1, -5, -1]);
});

test('settles one discard with multiple winners before both exit', () => {
  const result = Settlement.replay(players, [{
    type: 'discardWin', payerId: 'a',
    winners: [{ playerId: 'b', fan: 1 }, { playerId: 'c', fan: 2 }],
  }]);
  assert.deepEqual(result.players.map((p) => p.net), [-6, 2, 4, 0]);
  assert.deepEqual(result.players.map((p) => p.won), [false, true, true, false]);
});
```

- [ ] **Step 2: Run and verify module-not-found failure**

Run: `node --test tests/settlement.test.js`

Expected: FAIL because `settlement.js` does not exist.

- [ ] **Step 3: Implement event replay with atomic event application**

```js
function replay(players, events) {
  const state = createInitialState(players);
  const eventResults = [];
  for (let index = 0; index < events.length; index += 1) {
    const validation = validateEvent(state, events[index]);
    if (!validation.ok) return failureSnapshot(state, eventResults, index, validation.error);
    eventResults.push(applyEvent(state, events[index]));
  }
  return successSnapshot(state, eventResults);
}
```

Generate all transfers first, apply them, then mark all winners in a discard-win event together. Derive income, expense, and net from transfers; never maintain net independently.

- [ ] **Step 4: Cover exit and validation rules**

Test self-draw at each fan from 0 to 4, concealed/added kongs after one winner has exited, later events involving a winner, duplicated winner IDs, payer also listed as winner, actor equal to direct-kong payer, unknown player, invalid fan, empty winners, and running sum zero after every valid event.

Use this exact exit example:

```js
const result = Settlement.replay(players, [
  { type: 'selfDraw', winnerId: 'a', fan: 0 },
  { type: 'concealedKong', actorId: 'b' },
]);
assert.deepEqual(result.players.map((p) => p.net), [3, 3, -3, -3]);
```

- [ ] **Step 5: Run the settlement suite**

Run: `node --test tests/settlement.test.js`

Expected: all tests PASS.

- [ ] **Step 6: Publish replay engine**

Publish `settlement.js` and `tests/settlement.test.js` with message `feat: add ordered settlement engine`.

---

### Task 2: Settlement page event editor and ledger

**Files:**
- Modify: `index.html`
- Modify: `styles.css`
- Create: `settlement-page.js`
- Modify: `app.js`

**Interfaces:**
- Consumes: `Settlement.replay(players, events)`.
- Produces: `SettlementPage.mount(rootElement)` and `SettlementPage.unmount()`.
- Page state: `{ players, events, history, draftType }`; history snapshots copy players and events deeply.

- [ ] **Step 1: Add the settlement page markup and script**

Replace the temporary `data-page="settlement"` state with four editable name inputs, four balance cards, an event-type chooser, a context-sensitive event form, event ledger, and buttons for undo and clear. Load `settlement.js` before `settlement-page.js`.

- [ ] **Step 2: Implement context-sensitive event forms**

For each event type, show only required controls. Participant selects must be built from the replay state immediately before the new event and exclude winners. Point-win form supports adding/removing winner rows; each row has player and final-fan selectors.

- [ ] **Step 3: Submit only validated events**

Create the exact event objects documented above, tentatively append, call `Settlement.replay`, and commit the append only when `ok` is true. Put validation messages next to the form and focus the first invalid control.

- [ ] **Step 4: Render balances and auditable ledger**

Render income, expense, signed net, and 已胡 status per player. For every event, render each transfer as `玩家A → 玩家B：2` and show four balances after the event. Use positive/negative styling plus explicit signs; do not rely on color alone.

- [ ] **Step 5: Implement delete, reorder, undo, and clear**

Before every mutation, save a snapshot. For move-up/down, replay the proposed order and reject it without changing state when the result is invalid. For deletion, retain the new order even if a later event becomes invalid, show the replay error on that event, and suppress a misleading final-total label until corrected. Clear requires native confirmation; undo restores the last snapshot.

- [ ] **Step 6: Add page styling and mobile behavior**

At 375px, stack player cards two-by-two or one-by-one without horizontal scrolling, stack transfer rows, keep reorder/delete buttons reachable, and preserve labels for all selects.

- [ ] **Step 7: Run tests and manual scenarios**

Run: `node --test tests/settlement.test.js tests/mahjong.test.js tests/scoring.test.js`

Expected: all tests PASS. In a browser, enter names, record each kong type, one-discard two-winner event, self-draw, an invalid reorder, deletion of an early win, undo, and clear. Confirm final net totals sum to zero.

- [ ] **Step 8: Publish the second page**

Publish `index.html`, `styles.css`, `app.js`, `settlement.js`, and `settlement-page.js` with message `feat: add ordered four-player settlement page`.

