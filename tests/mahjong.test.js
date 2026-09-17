const test = require('node:test');
const assert = require('node:assert/strict');
const Mahjong = require('../mahjong.js');

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

function waits(concealedCounts, melds = [], missingSuit = 2) {
  return Mahjong.findWinningTiles({ concealedCounts, melds, missingSuit });
}

test('recognizes a standard four-meld-and-pair hand through the compatibility wrapper', () => {
  assert.equal(Mahjong.isStandardWin(counts('123m123p123s777s99m')), true);
});

test('rejects a complete-looking hand with no valid pair through the compatibility wrapper', () => {
  assert.equal(Mahjong.isStandardWin(counts('123m123p123s789s89m')), false);
});

test('rejects invalid concealed tile counts', () => {
  const invalid = counts('11111m123p123s99m');
  assert.deepEqual(Mahjong.validateCounts(invalid), {
    ok: false,
    error: '每种牌最多只能有 4 张',
  });
});

test('finds a single standard winning tile without legacy result fields', () => {
  const result = waits(counts('123m123p456p777p9m'));
  assert.equal(result.length, 1);
  assert.equal(result[0].tile, 8);
  assert.ok(result[0].interpretations.some((win) => win.kind === 'standard'));
  assert.deepEqual(Object.keys(result[0]).sort(), ['interpretations', 'tile']);
});

test('recognizes seven pairs in winning-tile interpretations', () => {
  const result = waits(counts('11m22m33m44m55p66p7p'));
  const sevenPairsWait = result.find((item) => item.tile === 15);
  assert.ok(sevenPairsWait.interpretations.some((win) => win.kind === 'sevenPairs'));
});

test('keeps a seven-pairs interpretation when it contains a four-of-a-kind', () => {
  const result = waits(counts('1111m22m33m44p55p6p'));
  const dragonWait = result.find((item) => item.tile === 14);
  assert.ok(dragonWait.interpretations.some((win) => win.kind === 'sevenPairs'));
});

test('keeps dragon-pairs compatibility fields with the exact root count', () => {
  assert.deepEqual(Mahjong.getSpecialHands(counts('11112233445566m')), {
    sevenPairs: true,
    dragonPairs: true,
    dragonCount: 1,
  });
  assert.deepEqual(Mahjong.getSpecialHands(counts('11112222334455m')), {
    sevenPairs: true,
    dragonPairs: true,
    dragonCount: 2,
  });
});

test('reports both standard and seven-pairs interpretations', () => {
  const result = waits(counts('1122334455667m'), [], 1);
  const seven = result.find((item) => item.tile === 6);
  assert.ok(seven.interpretations.some((win) => win.kind === 'standard'));
  assert.ok(seven.interpretations.some((win) => win.kind === 'sevenPairs'));
});

test('rejects a hand that still contains the missing suit', () => {
  assert.throws(
    () => waits(counts('123m123p456p777p9m'), [], 1),
    /手牌中仍有定缺花色/,
  );
});

test('rejects a hand whose exposed meld contains the missing suit', () => {
  assert.throws(
    () => waits(
      counts('123p456p777p9s'),
      [{ type: 'pong', tile: 0 }],
      0,
    ),
    /手牌中仍有定缺花色/,
  );
});

test('never offers a fifth concealed copy as a winning tile', () => {
  const result = waits(counts('1111m222m333m44m5m'), [], 1);
  assert.equal(result.some((item) => item.tile === 0), false);
});

test('returns winning tiles in numeric order for a multi-wait hand', () => {
  const result = waits(counts('1112345678999m'), [], 1);
  const tiles = result.map((item) => item.tile);
  assert.deepEqual(tiles, [...tiles].sort((a, b) => a - b));
  assert.ok(result.length > 1);
});

test('requires the meld-adjusted concealed tile count', () => {
  assert.throws(
    () => waits(counts('123m123p456p77p9m')),
    /正好有 13 张/,
  );
});

test('requires a valid missing suit', () => {
  assert.throws(
    () => waits(counts('123m123p456p777p9m'), [], 7),
    /有效的定缺花色/,
  );
});

test('returns an empty list for a hand that is not listening', () => {
  assert.deepEqual(waits(counts('13579m13579p123m')), []);
});

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

test('returns standard interpretations for every zero-through-four-meld state', () => {
  const cases = [
    { concealed: '123m123p123s777s99m', melds: [] },
    { concealed: '123m123p777p99s', melds: [{ type: 'pong', tile: 0 }] },
    { concealed: '123m123p99s', melds: [{ type: 'pong', tile: 0 }, { type: 'openKong', tile: 17 }] },
    { concealed: '123m99s', melds: [{ type: 'pong', tile: 0 }, { type: 'openKong', tile: 17 }, { type: 'concealedKong', tile: 9 }] },
    { concealed: '99s', melds: [{ type: 'pong', tile: 0 }, { type: 'openKong', tile: 17 }, { type: 'concealedKong', tile: 9 }, { type: 'pong', tile: 12 }] },
  ];

  for (const fixture of cases) {
    assert.ok(Mahjong.getWinInterpretations(counts(fixture.concealed), fixture.melds)
      .some((win) => win.kind === 'standard'));
  }
});

test('rejects a pong plus concealed copies that exceeds four physical tiles', () => {
  assert.deepEqual(Mahjong.validateTileState(
    counts('11m123p456p789s'),
    [{ type: 'pong', tile: 0 }],
    11,
  ), { ok: false, error: '每种牌最多只能有 4 张' });
});

test('rejects invalid exposed meld types and tiles', () => {
  assert.deepEqual(
    Mahjong.validateTileState(counts('123m123p777p99s'), [{ type: 'chi', tile: 0 }], 11),
    { ok: false, error: '副露类型无效' },
  );
  assert.deepEqual(
    Mahjong.validateTileState(counts('123m123p777p99s'), [{ type: 'pong', tile: 27 }], 11),
    { ok: false, error: '副露牌无效' },
  );
});

test('returns distinct standard decompositions for an ambiguous hand', () => {
  assert.deepEqual(Mahjong.getWinInterpretations(counts('11223344556677m'), []), [
    {
      kind: 'standard',
      pair: 0,
      melds: [
        { kind: 'sequence', tile: 1 },
        { kind: 'sequence', tile: 1 },
        { kind: 'sequence', tile: 4 },
        { kind: 'sequence', tile: 4 },
      ],
    },
    {
      kind: 'standard',
      pair: 3,
      melds: [
        { kind: 'sequence', tile: 0 },
        { kind: 'sequence', tile: 0 },
        { kind: 'sequence', tile: 4 },
        { kind: 'sequence', tile: 4 },
      ],
    },
    {
      kind: 'standard',
      pair: 6,
      melds: [
        { kind: 'sequence', tile: 0 },
        { kind: 'sequence', tile: 0 },
        { kind: 'sequence', tile: 3 },
        { kind: 'sequence', tile: 3 },
      ],
    },
    { kind: 'sevenPairs' },
  ]);
});

test('rejects five melds before deriving a negative concealed target', () => {
  const melds = [0, 1, 2, 3, 4].map((tile) => ({ type: 'pong', tile }));

  assert.throws(() => Mahjong.findWinningTiles({
    concealedCounts: Array(27).fill(0),
    melds,
    missingSuit: 2,
  }), /副露数据无效/);
  assert.throws(() => Mahjong.analyzeDiscard({
    concealedCounts: Array(27).fill(0),
    melds,
    missingSuit: 2,
    discardTile: 0,
    scoreBestWin() {},
  }), /副露数据无效/);
});

test('rejects a fifth physical copy when an exposed pong already uses three copies', () => {
  const concealedCounts = counts('9m123m345m456m');
  const result = waits(concealedCounts, [{ type: 'pong', tile: 8 }], 1);
  assert.equal(result.some((item) => item.tile === 8), false);
});
