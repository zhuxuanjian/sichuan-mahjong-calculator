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

function scoreNotation(notation, winMethod = 'discard', specialContext = 'normal', melds = []) {
  const concealedCounts = counts(notation);
  return Scoring.scoreBestWin({
    concealedCounts,
    winningTile: concealedCounts.findLastIndex((count) => count > 0),
    melds,
    interpretations: Mahjong.getWinInterpretations(concealedCounts, melds),
    winMethod,
    specialContext,
  });
}

function names(result) {
  return result.breakdown.map((item) => item.name);
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
  assert.equal(result.rawFan, 5);
  assert.equal(result.finalFan, 4);
  assert.equal(result.capped, true);
});

test('scores seven pairs plus each root without merging standard labels', () => {
  const result = scoreNotation('11112233445566m');
  assert.deepEqual(names(result), ['七对', '根', '清一色']);
  assert.equal(result.rawFan, 5);
});

test('scores a standard all-triplets hand as big pairs', () => {
  const result = scoreNotation('111m222p333p444s55s');
  assert.deepEqual(names(result), ['大对子']);
  assert.equal(result.rawFan, 1);
});

test('scores four exposed pongs and a concealed pair as gold hook without roots', () => {
  const melds = [
    { type: 'pong', tile: 0 },
    { type: 'pong', tile: 1 },
    { type: 'pong', tile: 9 },
    { type: 'pong', tile: 10 },
  ];
  const result = scoreNotation('55s', 'discard', 'normal', melds);
  assert.deepEqual(names(result), ['金钩钓']);
  assert.equal(result.rawFan, 1);
});

test('scores four exposed melds as gold hook without also labeling big pairs', () => {
  const melds = [
    { type: 'pong', tile: 0 },
    { type: 'pong', tile: 1 },
    { type: 'openKong', tile: 9 },
    { type: 'concealedKong', tile: 10 },
  ];
  const result = scoreNotation('55s', 'discard', 'normal', melds);
  assert.deepEqual(names(result), ['金钩钓', '根', '根']);
  assert.equal(result.rawFan, 3);
});

test('counts every concealed four-of-a-kind as a separate root', () => {
  const result = scoreNotation('11112222334455m');
  assert.deepEqual(names(result), ['七对', '根', '根', '清一色']);
  assert.equal(result.rawFan, 6);
});

test('counts exposed kongs as roots', () => {
  const melds = [{ type: 'openKong', tile: 0 }];
  const result = scoreNotation('123p456p789p99s', 'discard', 'normal', melds);
  assert.deepEqual(names(result), ['根']);
  assert.equal(result.rawFan, 1);
});

test('scores a pure seven-pairs hand', () => {
  const result = scoreNotation('11m22m33m44p55p66s77s');
  assert.deepEqual(names(result), ['七对']);
  assert.equal(result.rawFan, 2);
});

test('adds pure one suit only when every concealed and exposed tile shares a suit', () => {
  const pure = scoreNotation('12312345678977m');
  const mixed = scoreNotation('123m123p456p789p77p');
  assert.deepEqual(names(pure), ['清一色']);
  assert.equal(names(mixed).includes('清一色'), false);
});

test('scores an ordinary winning hand as plain win', () => {
  const result = scoreNotation('123m123p456p789s77s');
  assert.deepEqual(result.breakdown, [{ name: '素胡', fan: 0 }]);
  assert.equal(result.rawFan, 0);
  assert.equal(result.finalFan, 0);
  assert.equal(result.capped, false);
});

test('adds self-draw fan for a normal self-draw', () => {
  const result = scoreNotation('123m123p456p789s77s', 'selfDraw');
  assert.deepEqual(names(result), ['自摸']);
  assert.equal(result.rawFan, 1);
});

test('adds kong-draw only to self-draw', () => {
  const result = scoreNotation('123m123p456p789s77s', 'selfDraw', 'kongDraw');
  assert.deepEqual(names(result), ['自摸', '杠上花']);
  assert.equal(result.rawFan, 2);
});

test('adds last-tile only to self-draw', () => {
  const result = scoreNotation('123m123p456p789s77s', 'selfDraw', 'lastTile');
  assert.deepEqual(names(result), ['自摸', '海底捞月']);
  assert.equal(result.rawFan, 2);
});

test('adds kong-discard only to a discard win', () => {
  const result = scoreNotation('123m123p456p789s77s', 'discard', 'kongDiscard');
  assert.deepEqual(names(result), ['杠上炮']);
  assert.equal(result.rawFan, 1);
});

test('adds rob-kong only to a discard win', () => {
  const result = scoreNotation('123m123p456p789s77s', 'discard', 'robKong');
  assert.deepEqual(names(result), ['抢杠胡']);
  assert.equal(result.rawFan, 1);
});

test('rejects conflicting method and special context combinations', () => {
  assert.throws(
    () => scoreNotation('123m123p456p789s77s', 'discard', 'kongDraw'),
    /杠上花.*自摸/,
  );
  assert.throws(() => scoreNotation('123m123p456p789s77s', 'selfDraw', 'robKong'), /抢杠胡.*点炮/);
  assert.throws(() => scoreNotation('123m123p456p789s77s', 'discard', 'lastTile'), /海底捞月.*自摸/);
  assert.throws(() => scoreNotation('123m123p456p789s77s', 'selfDraw', 'kongDiscard'), /杠上炮.*点炮/);
});

test('does not cap exactly four raw fan', () => {
  const result = scoreNotation('11122233344455m', 'selfDraw');
  assert.equal(result.rawFan, 4);
  assert.equal(result.finalFan, 4);
  assert.equal(result.capped, false);
});

test('chooses the interpretation with the highest raw fan before applying the cap', () => {
  const result = scoreNotation('11223344556677m');
  assert.equal(result.interpretation.kind, 'sevenPairs');
  assert.deepEqual(names(result), ['七对', '清一色']);
  assert.equal(result.rawFan, 4);
});

test('never scores excluded all-simples or all-with-terminal patterns', () => {
  const result = scoreNotation('123m123p456p789s77s');
  assert.equal(names(result).includes('断幺九'), false);
  assert.equal(names(result).includes('全带幺'), false);
});
