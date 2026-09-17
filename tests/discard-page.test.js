const test = require('node:test');
const assert = require('node:assert/strict');
const Mahjong = require('../mahjong.js');
const Scoring = require('../scoring.js');
const UICommon = require('../ui-common.js');
const DiscardPage = require('../discard-page.js');

function hand(notation) {
  const tiles = [];
  const suitBase = { m: 0, p: 9, s: 18 };
  let digits = '';
  for (const character of notation) {
    if (/\d/.test(character)) {
      digits += character;
      continue;
    }
    for (const digit of digits) tiles.push(suitBase[character] + Number(digit) - 1);
    digits = '';
  }
  return tiles.sort((left, right) => left - right);
}

test('uses a 14-equivalent concealed target for every meld count', () => {
  assert.deepEqual([0, 1, 2, 3, 4].map((count) => DiscardPage.targetCount(Array(count).fill({}))), [14, 11, 8, 5, 2]);
});

test('rejects a fifth meld before showing a negative concealed target', () => {
  const view = DiscardPage.createAnalysisView({
    ...DiscardPage.createState(),
    melds: [0, 1, 2, 3, 4].map((tile) => ({ type: 'pong', tile })),
    missingSuit: 2,
  }, Mahjong, Scoring);

  assert.deepEqual(view, { kind: 'error', message: '最多只能录入 4 组副露。' });
});

test('allows only missing-suit discards until that suit has gone', () => {
  const state = DiscardPage.createState();
  state.hand = hand('123m123p456p777p99s');
  state.missingSuit = 2;

  assert.equal(DiscardPage.canSelectDiscard(state, 0), false);
  assert.equal(DiscardPage.canSelectDiscard(state, 26), true);

  state.hand = hand('123m123p456p777p99m');
  assert.equal(DiscardPage.canSelectDiscard(state, 0), true);
  assert.equal(DiscardPage.canSelectDiscard(state, 15), true);
});

test('clears a selected discard when its last copy disappears or a new missing suit makes it illegal', () => {
  const state = DiscardPage.createState();
  state.hand = hand('123m123p456p777p99m');
  state.missingSuit = 2;
  state.selectedDiscard = 8;

  state.hand = state.hand.filter((tile) => tile !== 8);
  DiscardPage.reconcileSelectedDiscard(state);
  assert.equal(state.selectedDiscard, null);

  state.hand = hand('123m123p456p777p99m');
  state.selectedDiscard = 8;
  state.missingSuit = 1;
  DiscardPage.reconcileSelectedDiscard(state);
  assert.equal(state.selectedDiscard, null);
});

test('builds blocked and non-listening result messages from real analysis', () => {
  const blocked = DiscardPage.createAnalysisView({
    ...DiscardPage.createState(),
    hand: hand('123m123p456p777p89s'),
    missingSuit: 2,
    selectedDiscard: 26,
  }, Mahjong, Scoring);
  assert.equal(blocked.kind, 'blocked');
  assert.equal(blocked.message, '打出后仍有定缺牌，请继续打定缺');

  const notListening = DiscardPage.createAnalysisView({
    ...DiscardPage.createState(),
    hand: hand('13579m13579p123m9p'),
    missingSuit: 2,
    selectedDiscard: 17,
  }, Mahjong, Scoring);
  assert.equal(notListening.kind, 'empty');
  assert.equal(notListening.message, '打出后未听牌');
});

test('asks for a missing-suit meld to be removed before offering discard selection', () => {
  const state = {
    ...DiscardPage.createState(),
    hand: hand('123m123p777p99m'),
    melds: [{ type: 'pong', tile: 18 }],
    missingSuit: 2,
  };
  const view = DiscardPage.createAnalysisView(state, Mahjong, Scoring);

  assert.deepEqual(view, {
    kind: 'blocked',
    message: '副露中有定缺花色，请先移除或修正对应副露。',
  });
  assert.equal(DiscardPage.canSelectDiscard(state, 0), false);
});

test('restores focus to the nearest surviving item or the supplied fallback', () => {
  const focused = [];
  const items = [0, 1].map((index) => ({ focus: () => focused.push(`item-${index}`) }));
  const container = { querySelectorAll: () => items };
  const fallback = { focus: () => focused.push('fallback') };

  UICommon.restoreFocusAfterRemoval(container, '.item', 7, fallback);
  UICommon.restoreFocusAfterRemoval({ querySelectorAll: () => [] }, '.item', 0, fallback);

  assert.deepEqual(focused, ['item-1', 'fallback']);
});

test('labels a successful analysis with the selected tile and wait count', () => {
  const view = DiscardPage.createAnalysisView({
    ...DiscardPage.createState(),
    hand: hand('123m123p456p777p99m'),
    missingSuit: 2,
    selectedDiscard: 8,
  }, Mahjong, Scoring);

  assert.equal(view.kind, 'success');
  assert.equal(view.heading, '打出 9万后听 1 种牌');
});

test('renders dead waits and distinct discard/self-draw scoring breakdowns', () => {
  const analysis = Mahjong.analyzeDiscard({
    concealedCounts: DiscardPage.handCounts(hand('1111m22m33m44m55p66p')),
    melds: [],
    missingSuit: 2,
    discardTile: 0,
    scoreBestWin: Scoring.scoreBestWin,
  });
  const wait = analysis.waits.find((item) => item.tile === 0);
  const markup = DiscardPage.waitCardMarkup(wait, UICommon);

  assert.match(markup, /0 张／绝张/);
  assert.match(markup, /点炮 \d 番/);
  assert.match(markup, /自摸 \d 番/);
  assert.match(markup, /点炮番型/);
  assert.match(markup, /自摸番型/);
});
