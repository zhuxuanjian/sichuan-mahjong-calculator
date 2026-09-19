const test = require('node:test');
const assert = require('node:assert/strict');
const Mahjong = require('../mahjong.js');

function counts(notation) {
  const result = Array(27).fill(0);
  const suitBase = { m: 0, p: 9, s: 18 };
  let digits = '';
  for (const character of notation) {
    if (/\d/.test(character)) {
      digits += character;
      continue;
    }
    for (const digit of digits) result[suitBase[character] + Number(digit) - 1] += 1;
    digits = '';
  }
  return result;
}

test('classifies every supported Hu and discard input count', () => {
  assert.deepEqual(
    [0, 1, 2, 3, 4, 5, 7, 8, 10, 11, 13, 14, 15].map(Mahjong.isValidHuCount),
    [false, true, false, false, true, false, true, false, true, false, true, false, false],
  );
  assert.deepEqual(
    [0, 1, 2, 3, 4, 5, 7, 8, 10, 11, 13, 14, 15].map(Mahjong.isValidDiscardCount),
    [false, false, true, false, false, true, false, true, false, true, false, true, false],
  );
});

test('finds pair-only and one-meld waits', () => {
  assert.deepEqual(
    Mahjong.findWinningTiles({ concealedCounts: counts('1m'), missingSuit: 2 }).map((win) => win.tile),
    [0],
  );
  assert.deepEqual(
    Mahjong.findWinningTiles({ concealedCounts: counts('123m4p'), missingSuit: 2 }).map((win) => win.tile),
    [12],
  );
});

test('recognizes standard wins for zero through four melds', () => {
  for (const notation of ['11m', '123m11p', '123m123p11s', '123m123p789p11s', '123m123p789p777s11s']) {
    assert.ok(Mahjong.getWinInterpretations(counts(notation)).some((win) => win.kind === 'standard'), notation);
  }
});

test('recognizes seven pairs only at fourteen tiles', () => {
  assert.ok(Mahjong.getWinInterpretations(counts('11223344556677m')).some((win) => win.kind === 'sevenPairs'));
  assert.equal(Mahjong.getWinInterpretations(counts('112233m')).some((win) => win.kind === 'sevenPairs'), false);
});

test('returns every distinct interpretation for an ambiguous hand', () => {
  const wins = Mahjong.getWinInterpretations(counts('11223344556677m'));
  assert.deepEqual(wins.map((win) => win.kind), ['standard', 'standard', 'standard', 'sevenPairs']);
  assert.deepEqual(wins.filter((win) => win.kind === 'standard').map((win) => win.pair), [0, 3, 6]);
});

test('rejects foul Hu counts before searching', () => {
  assert.throws(
    () => Mahjong.findWinningTiles({ concealedCounts: counts('12m'), missingSuit: 2 }),
    /当前手牌相公/,
  );
});

test('rejects a hand that still contains the missing suit', () => {
  assert.throws(
    () => Mahjong.findWinningTiles({ concealedCounts: counts('123m1p'), missingSuit: 1 }),
    /手牌中仍有定缺花色/,
  );
});

test('requires a valid missing suit', () => {
  assert.throws(
    () => Mahjong.findWinningTiles({ concealedCounts: counts('123m1p'), missingSuit: 7 }),
    /有效的定缺花色/,
  );
});

test('rejects fifth copies and never offers a fifth copy as a wait', () => {
  assert.deepEqual(Mahjong.validateCounts(counts('11111m')), {
    ok: false,
    error: '每种牌最多只能有 4 张',
  });
  const wins = Mahjong.findWinningTiles({ concealedCounts: counts('1111m222m333m44m5m'), missingSuit: 1 });
  assert.equal(wins.some((win) => win.tile === 0), false);
});

test('returns multi-waits in ascending tile order', () => {
  const tiles = Mahjong.findWinningTiles({
    concealedCounts: counts('1112345678999m'),
    missingSuit: 1,
  }).map((win) => win.tile);
  assert.ok(tiles.length > 1);
  assert.deepEqual(tiles, [...tiles].sort((left, right) => left - right));
});

test('does not mutate frozen input counts', () => {
  const concealedCounts = counts('123m1p');
  const original = concealedCounts.slice();
  Object.freeze(concealedCounts);
  Mahjong.findWinningTiles({ concealedCounts, missingSuit: 2 });
  assert.deepEqual(concealedCounts, original);
});
