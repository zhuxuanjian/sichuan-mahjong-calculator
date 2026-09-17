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

function analyze(overrides = {}) {
  return Mahjong.analyzeDiscard({
    concealedCounts: counts('123m123p456p777p99m'),
    missingSuit: 2,
    discardTile: 8,
    ...overrides,
  });
}

test('analyzes a discard without scoring fields', () => {
  assert.deepEqual(analyze(), {
    discardTile: 8,
    blockedReason: null,
    waits: [{ tile: 8, remaining: 2 }],
  });
});

test('accepts every supported discard input count', () => {
  const fixtures = [
    ['11m', 0, 2],
    ['123m11p', 0, 2],
    ['123m123p11s', 9, 1],
    ['123m123p789p11s', 9, 1],
    ['123m123p456p777p99m', 8, 2],
  ];
  for (const [notation, discardTile, missingSuit] of fixtures) {
    assert.doesNotThrow(() => Mahjong.analyzeDiscard({
      concealedCounts: counts(notation),
      missingSuit,
      discardTile,
    }), notation);
  }
});

test('rejects foul discard counts', () => {
  assert.throws(() => Mahjong.analyzeDiscard({
    concealedCounts: counts('123m'),
    missingSuit: 2,
    discardTile: 0,
  }), /当前手牌相公/);
});

test('requires a missing-suit discard while any remain', () => {
  assert.throws(() => analyze({
    concealedCounts: counts('123m123p456p777p99s'),
    discardTile: 0,
  }), /必须先打出定缺花色/);
});

test('blocks waits while more missing-suit tiles remain after discard', () => {
  assert.deepEqual(analyze({
    concealedCounts: counts('123m123p456p777p89s'),
    discardTile: 26,
  }), {
    discardTile: 26,
    blockedReason: '打出后仍有定缺牌，请继续打定缺',
    waits: [],
  });
});

test('rejects a selected tile absent from the hand', () => {
  assert.throws(() => analyze({ discardTile: 18 }), /手牌中没有选中的打出牌/);
});

test('changes waits when the selected discard changes', () => {
  const concealedCounts = counts('123m123p456p777p99m');
  const first = analyze({ concealedCounts, discardTile: 8 });
  const second = analyze({ concealedCounts, discardTile: 0 });
  assert.notDeepEqual(second.waits.map((wait) => wait.tile), first.waits.map((wait) => wait.tile));
});

test('keeps a structural wait when all four copies are visible', () => {
  const result = analyze({
    concealedCounts: counts('1111m22m33m44m55p66p'),
    discardTile: 0,
  });
  assert.deepEqual(result.waits.find((wait) => wait.tile === 0), { tile: 0, remaining: 0 });
});

test('returns waits in ascending tile order', () => {
  const result = analyze({
    concealedCounts: counts('1112345678999m5p'),
    discardTile: 13,
  });
  const tiles = result.waits.map((wait) => wait.tile);
  assert.ok(tiles.length > 1);
  assert.deepEqual(tiles, [...tiles].sort((left, right) => left - right));
});

test('does not mutate frozen input counts', () => {
  const concealedCounts = counts('123m123p456p777p99m');
  const original = concealedCounts.slice();
  Object.freeze(concealedCounts);
  analyze({ concealedCounts });
  assert.deepEqual(concealedCounts, original);
});
