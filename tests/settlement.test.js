const test = require('node:test');
const assert = require('node:assert/strict');
const Settlement = require('../settlement.js');

const players = ['a', 'b', 'c', 'd'].map((id) => ({ id, name: id.toUpperCase() }));

function nets(result) {
  return result.players.map((player) => player.net);
}

test('settles the three kong types with fixed amounts', () => {
  const result = Settlement.replay(players, [
    { type: 'concealedKong', actorId: 'a' },
    { type: 'addedKong', actorId: 'b' },
    { type: 'discardKong', actorId: 'd', payerId: 'c' },
  ]);

  assert.equal(result.ok, true);
  assert.deepEqual(nets(result), [5, 1, -5, -1]);
  assert.deepEqual(result.eventResults[0].transfers, [
    { fromId: 'b', toId: 'a', amount: 2, reason: 'concealedKong' },
    { fromId: 'c', toId: 'a', amount: 2, reason: 'concealedKong' },
    { fromId: 'd', toId: 'a', amount: 2, reason: 'concealedKong' },
  ]);
  assert.deepEqual(result.eventResults[2].balancesAfter, { a: 5, b: 1, c: -5, d: -1 });
});

test('settles one discard with multiple winners before both exit', () => {
  const result = Settlement.replay(players, [{
    type: 'discardWin', payerId: 'a',
    winners: [{ playerId: 'b', fan: 1 }, { playerId: 'c', fan: 2 }],
  }]);

  assert.equal(result.ok, true);
  assert.deepEqual(nets(result), [-6, 2, 4, 0]);
  assert.deepEqual(result.players.map((player) => player.won), [false, true, true, false]);
  assert.deepEqual(result.eventResults[0].transfers, [
    { fromId: 'a', toId: 'b', amount: 2, reason: 'discardWin' },
    { fromId: 'a', toId: 'c', amount: 4, reason: 'discardWin' },
  ]);
});

test('settles a self draw at every permitted fan', () => {
  const expectedByFan = [1, 2, 4, 8, 16];
  for (const [fan, amount] of expectedByFan.entries()) {
    const result = Settlement.replay(players, [{ type: 'selfDraw', winnerId: 'a', fan }]);
    assert.equal(result.ok, true, `fan ${fan}`);
    assert.deepEqual(nets(result), [amount * 3, -amount, -amount, -amount], `fan ${fan}`);
  }
});

test('excludes exited winners from later kong payments', () => {
  const result = Settlement.replay(players, [
    { type: 'selfDraw', winnerId: 'a', fan: 0 },
    { type: 'concealedKong', actorId: 'b' },
  ]);

  assert.equal(result.ok, true);
  assert.deepEqual(nets(result), [3, 3, -3, -3]);
  assert.deepEqual(result.eventResults[1].transfers.map((transfer) => transfer.fromId), ['c', 'd']);

  const addedKong = Settlement.replay(players, [
    { type: 'selfDraw', winnerId: 'a', fan: 0 },
    { type: 'addedKong', actorId: 'b' },
  ]);
  assert.equal(addedKong.ok, true);
  assert.deepEqual(nets(addedKong), [3, 1, -2, -2]);
});

test('rejects all later events that involve a player who has already won', () => {
  const result = Settlement.replay(players, [
    { type: 'selfDraw', winnerId: 'a', fan: 0 },
    { type: 'addedKong', actorId: 'a' },
  ]);

  assert.equal(result.ok, false);
  assert.deepEqual(nets(result), [3, -1, -1, -1]);
  assert.equal(result.error.index, 1);
  assert.match(result.error.message, /已胡/);
  assert.equal(result.eventResults.length, 1);
});

test('rejects invalid discard-win participants atomically', () => {
  const cases = [
    { winners: [], message: /获胜者/ },
    { winners: [{ playerId: 'b', fan: 1 }, { playerId: 'b', fan: 2 }], message: /重复/ },
    { winners: [{ playerId: 'a', fan: 1 }], message: /点炮者/ },
    { winners: [{ playerId: 'b', fan: 5 }], message: /番/ },
  ];

  for (const { winners, message } of cases) {
    const result = Settlement.replay(players, [{ type: 'discardWin', payerId: 'a', winners }]);
    assert.equal(result.ok, false);
    assert.equal(result.error.index, 0);
    assert.match(result.error.message, message);
    assert.deepEqual(nets(result), [0, 0, 0, 0]);
    assert.deepEqual(result.eventResults, []);
  }
});

test('rejects an actor equal to the payer of a discard kong', () => {
  const result = Settlement.replay(players, [{ type: 'discardKong', actorId: 'a', payerId: 'a' }]);

  assert.equal(result.ok, false);
  assert.equal(result.error.index, 0);
  assert.match(result.error.message, /不能相同/);
  assert.deepEqual(nets(result), [0, 0, 0, 0]);
});

test('rejects unknown players and invalid fan values at the event index', () => {
  const unknown = Settlement.replay(players, [{ type: 'concealedKong', actorId: 'nobody' }]);
  const invalidFan = Settlement.replay(players, [{ type: 'selfDraw', winnerId: 'a', fan: -1 }]);

  assert.equal(unknown.ok, false);
  assert.equal(unknown.error.index, 0);
  assert.match(unknown.error.message, /不存在/);
  assert.equal(invalidFan.ok, false);
  assert.equal(invalidFan.error.index, 0);
  assert.match(invalidFan.error.message, /番/);
});

test('stops at the first invalid event without applying it', () => {
  const result = Settlement.replay(players, [
    { type: 'discardKong', actorId: 'b', payerId: 'a' },
    {
      type: 'discardWin', payerId: 'c',
      winners: [{ playerId: 'b', fan: 1 }, { playerId: 'b', fan: 1 }],
    },
  ]);

  assert.equal(result.ok, false);
  assert.equal(result.error.index, 1);
  assert.deepEqual(nets(result), [-2, 2, 0, 0]);
  assert.equal(result.eventResults.length, 1);
});

test('keeps income, expense, and net derived and zero-sum after every valid event', () => {
  const result = Settlement.replay(players, [
    { type: 'concealedKong', actorId: 'a' },
    { type: 'discardWin', payerId: 'b', winners: [{ playerId: 'c', fan: 1 }] },
    { type: 'addedKong', actorId: 'd' },
  ]);

  assert.equal(result.ok, true);
  for (const eventResult of result.eventResults) {
    assert.equal(Object.values(eventResult.balancesAfter).reduce((sum, balance) => sum + balance, 0), 0);
  }
  for (const player of result.players) {
    assert.equal(player.net, player.income - player.expense);
  }
  assert.equal(result.players.reduce((sum, player) => sum + player.net, 0), 0);
});
