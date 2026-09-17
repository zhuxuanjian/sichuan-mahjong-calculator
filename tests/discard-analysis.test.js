const test = require('node:test');
const assert = require('node:assert/strict');
const Mahjong = require('../mahjong.js');
const Scoring = require('../scoring.js');

function counts(notation) {
  const result = Array(27).fill(0);
  const suitBase = { m: 0, p: 9, s: 18 };
  let digits = '';

  for (const char of notation) {
    if (/\d/.test(char)) {
      digits += char;
      continue;
    }
    for (const digit of digits) {
      result[suitBase[char] + Number(digit) - 1] += 1;
    }
    digits = '';
  }
  return result;
}

function analyze(overrides = {}) {
  return Mahjong.analyzeDiscard({
    concealedCounts: counts('123m123p456p777p99m'),
    melds: [],
    missingSuit: 2,
    discardTile: 8,
    scoreBestWin: Scoring.scoreBestWin,
    ...overrides,
  });
}

test('analyzes the selected discard and returns both ordinary scoring contexts', () => {
  const result = analyze();

  assert.deepEqual(Object.keys(result).sort(), ['blockedReason', 'discardTile', 'waits']);
  assert.equal(result.discardTile, 8);
  assert.equal(result.blockedReason, null);
  assert.deepEqual(result.waits.map((wait) => wait.tile), [8]);
  assert.equal(result.waits[0].remaining, 2);
  assert.equal(result.waits[0].discardScore.finalFan, 0);
  assert.equal(result.waits[0].selfDrawScore.finalFan, 1);
  assert.deepEqual(result.waits[0].discardScore.breakdown, [{ name: '素胡', fan: 0 }]);
  assert.deepEqual(result.waits[0].selfDrawScore.breakdown, [{ name: '自摸', fan: 1 }]);
  assert.ok(result.waits.every((wait) => wait.discardScore && wait.selfDrawScore));
});

test('requires a missing-suit discard while any remain before the discard', () => {
  assert.throws(() => analyze({
    concealedCounts: counts('123m123p456p777p99s'),
    discardTile: 0,
  }), /必须先打出定缺花色/);
});

test('blocks analysis when one selected missing-suit tile leaves more missing-suit tiles', () => {
  const result = analyze({
    concealedCounts: counts('123m123p456p777p89s'),
    discardTile: 26,
  });

  assert.deepEqual(result, {
    discardTile: 26,
    blockedReason: '打出后仍有定缺牌，请继续打定缺',
    waits: [],
  });
});

test('accepts pong, open-kong, and concealed-kong draw states', () => {
  const fixtures = [
    {
      concealed: '123m123p777p99p',
      melds: [{ type: 'pong', tile: 8 }],
      discardTile: 17,
      waitTile: 17,
    },
    {
      concealed: '123p456p99p',
      melds: [{ type: 'pong', tile: 8 }, { type: 'openKong', tile: 0 }],
      discardTile: 17,
      waitTile: 17,
    },
    {
      concealed: '123p456p99p',
      melds: [{ type: 'pong', tile: 8 }, { type: 'concealedKong', tile: 0 }],
      discardTile: 17,
      waitTile: 17,
    },
  ];

  for (const fixture of fixtures) {
    const result = analyze({
      concealedCounts: counts(fixture.concealed),
      melds: fixture.melds,
      discardTile: fixture.discardTile,
    });
    assert.equal(result.blockedReason, null);
    assert.ok(result.waits.some((wait) => wait.tile === fixture.waitTile));
  }
});

test('requires the meld-adjusted fourteen-equivalent concealed count', () => {
  assert.throws(() => analyze({
    concealedCounts: counts('123m123p456p777p9m'),
  }), /正好有 14 张/);
});

test('rejects a selected tile absent from the concealed hand', () => {
  assert.throws(() => analyze({ discardTile: 7 }), /手牌中没有选中的打出牌/);
});

test('does not offer a fifth physical copy as a wait when an exposed pong uses three copies', () => {
  const result = analyze({
    concealedCounts: counts('9m123m345m456m7m'),
    melds: [{ type: 'pong', tile: 8 }],
    discardTile: 6,
    missingSuit: 1,
  });

  assert.equal(result.waits.some((wait) => wait.tile === 8), false);
});

test('changes the analysis when the selected discard changes', () => {
  const input = counts('123m123p456p777p99m');
  const first = analyze({ concealedCounts: input, discardTile: 8 });
  const second = analyze({ concealedCounts: input, discardTile: 0 });

  assert.notDeepEqual(second.waits.map((wait) => wait.tile), first.waits.map((wait) => wait.tile));
});

test('returns no waits and no block reason for a legal non-listening discard', () => {
  const result = analyze({
    concealedCounts: counts('13579m13579p123m9p'),
    discardTile: 17,
  });

  assert.deepEqual(result, { discardTile: 17, blockedReason: null, waits: [] });
});

test('uses original concealed counts and meld physical counts for remaining copies', () => {
  const result = analyze({
    concealedCounts: counts('123m456m789m11p'),
    melds: [{ type: 'pong', tile: 0 }],
    discardTile: 0,
  });
  const wait = result.waits.find((item) => item.tile === 0);

  assert.ok(wait);
  assert.equal(wait.remaining, 0);
});

test('keeps a structural wait even when every physical copy is already known', () => {
  const result = analyze({
    concealedCounts: counts('1111m22m33m44m55p66p'),
    discardTile: 0,
  });

  const structuralWait = result.waits.find((wait) => wait.tile === 0);
  assert.ok(structuralWait);
  assert.equal(structuralWait.remaining, 0);
});

test('returns candidate waits in ascending tile order', () => {
  const result = analyze({
    concealedCounts: counts('1112345678999m5p'),
    discardTile: 13,
  });
  const tiles = result.waits.map((wait) => wait.tile);

  assert.deepEqual(tiles, [...tiles].sort((a, b) => a - b));
  assert.ok(tiles.length > 1);
});

test('does not mutate input counts or melds', () => {
  const concealedCounts = counts('123m456m789m11p');
  const melds = [{ type: 'pong', tile: 0 }];
  const original = structuredClone({ concealedCounts, melds });
  Object.freeze(concealedCounts);
  Object.freeze(melds[0]);
  Object.freeze(melds);

  analyze({ concealedCounts, melds, discardTile: 0 });

  assert.deepEqual({ concealedCounts, melds }, original);
});
