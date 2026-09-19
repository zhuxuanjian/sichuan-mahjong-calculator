const test = require('node:test');
const assert = require('node:assert/strict');
const Mahjong = require('../mahjong.js');
const UI = require('../ui-common.js');
const DiscardPage = require('../discard-page.js');

function hand(notation) {
  const tiles = [];
  const bases = { m: 0, p: 9, s: 18 };
  let digits = '';
  for (const character of notation) {
    if (/\d/.test(character)) digits += character;
    else {
      for (const digit of digits) tiles.push(bases[character] + Number(digit) - 1);
      digits = '';
    }
  }
  return tiles.sort((a, b) => a - b);
}

test('accepts each legal discard count and rejects foul counts before missing-suit guidance', () => {
  for (const count of [2, 5, 8, 11, 14]) {
    const view = DiscardPage.createAnalysisView({ ...DiscardPage.createState(), hand: Array.from({ length: count }, (_, index) => Math.floor(index / 4)) }, Mahjong);
    assert.equal(view.message, '请先选择定缺花色。');
  }
  const foul = DiscardPage.createAnalysisView({ ...DiscardPage.createState(), hand: [0, 1, 2], missingSuit: 2 }, Mahjong);
  assert.match(foul.message, /当前手牌相公/);
});

test('enforces missing-suit discards without exposed meld state', () => {
  const state = { ...DiscardPage.createState(), hand: hand('123m123p456p777p99s'), missingSuit: 2 };
  assert.equal(DiscardPage.canSelectDiscard(state, 0), false);
  assert.equal(DiscardPage.canSelectDiscard(state, 26), true);
  state.selectedDiscard = 0;
  DiscardPage.reconcileSelectedDiscard(state);
  assert.equal(state.selectedDiscard, null);
});

test('already complete hand prompts Hu without blocking discard analysis', () => {
  const state = { ...DiscardPage.createState(), hand: hand('123m123p456p777p99m'), missingSuit: 2 };
  const ready = DiscardPage.createAnalysisView(state, Mahjong);
  assert.match(ready.message, /当前手牌已胡牌/);
  assert.equal(DiscardPage.canSelectDiscard(state, 8), true);
  state.selectedDiscard = 8;
  const selected = DiscardPage.createAnalysisView(state, Mahjong);
  assert.equal(selected.kind, 'success');
  assert.equal(selected.analysis.waits[0].tile, 8);
  assert.match(selected.message, /当前手牌已胡牌/);
});

test('incomplete complete hand asks for a discard without a Hu notice', () => {
  const state = { ...DiscardPage.createState(), hand: hand('123m123p456p777p89m'), missingSuit: 2 };
  const view = DiscardPage.createAnalysisView(state, Mahjong);
  assert.equal(view.kind, 'ready');
  assert.doesNotMatch(view.message, /当前手牌已胡牌/);
});

test('displays waits without scores and preserves dead waits', () => {
  const state = { ...DiscardPage.createState(), hand: hand('1111m22m33m44m55p66p'), missingSuit: 2, selectedDiscard: 0 };
  const view = DiscardPage.createAnalysisView(state, Mahjong);
  assert.equal(view.kind, 'success');
  const markup = DiscardPage.waitCardMarkup(view.analysis.waits.find((wait) => wait.tile === 0), UI);
  assert.match(markup, /0 张／绝张/);
  assert.doesNotMatch(markup, /番|点炮|自摸/);
});

test('reports a forced missing-suit discard and a non-listening discard', () => {
  const blocked = DiscardPage.createAnalysisView({ ...DiscardPage.createState(), hand: hand('123m123p456p777p89s'), missingSuit: 2, selectedDiscard: 26 }, Mahjong);
  assert.equal(blocked.kind, 'blocked');
  const empty = DiscardPage.createAnalysisView({ ...DiscardPage.createState(), hand: hand('13579m13579p123m9p'), missingSuit: 2, selectedDiscard: 17 }, Mahjong);
  assert.equal(empty.message, '打出后未听牌');
});

test('restores focus after removing a hand tile', () => {
  const focused = [];
  UI.restoreFocusAfterRemoval({ querySelectorAll: () => [{ focus: () => focused.push('nearest') }] }, '.tile', 3, null);
  assert.deepEqual(focused, ['nearest']);
});
