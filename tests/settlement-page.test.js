const test = require('node:test');
const assert = require('node:assert/strict');
const Settlement = require('../settlement.js');
const SettlementPage = require('../settlement-page.js');

const players = ['a', 'b', 'c', 'd'].map((id) => ({ id, name: id.toUpperCase() }));

test('builds exact engine event shapes including one fan per discard winner', () => {
  assert.deepEqual(SettlementPage.buildEvent('concealedKong', { actorId: 'a' }), {
    type: 'concealedKong', actorId: 'a',
  });
  assert.deepEqual(SettlementPage.buildEvent('discardKong', { actorId: 'b', payerId: 'c' }), {
    type: 'discardKong', actorId: 'b', payerId: 'c',
  });
  assert.deepEqual(SettlementPage.buildEvent('discardWin', {
    payerId: 'a', winners: [{ playerId: 'b', fan: '1' }, { playerId: 'c', fan: '4' }],
  }), {
    type: 'discardWin', payerId: 'a',
    winners: [{ playerId: 'b', fan: 1 }, { playerId: 'c', fan: 4 }],
  });
  assert.deepEqual(SettlementPage.buildEvent('selfDraw', { winnerId: 'd', fan: '0' }), {
    type: 'selfDraw', winnerId: 'd', fan: 0,
  });
});

test('lists only players active immediately before the next event', () => {
  const state = SettlementPage.createState(players);
  state.events.push({ type: 'selfDraw', winnerId: 'a', fan: 0 });

  assert.deepEqual(
    SettlementPage.activePlayersBeforeNext(state, Settlement).map((player) => player.id),
    ['b', 'c', 'd'],
  );
});

test('commits an append only after replay accepts the tentative event', () => {
  const state = SettlementPage.createState(players);
  const accepted = SettlementPage.appendEvent(
    state, { type: 'selfDraw', winnerId: 'a', fan: 1 }, Settlement,
  );
  const beforeRejected = JSON.parse(JSON.stringify({ events: state.events, history: state.history }));
  const rejected = SettlementPage.appendEvent(
    state, { type: 'addedKong', actorId: 'a' }, Settlement,
  );

  assert.equal(accepted.ok, true);
  assert.equal(rejected.ok, false);
  assert.deepEqual(state.events, beforeRejected.events);
  assert.deepEqual(state.history, beforeRejected.history);
  assert.equal(state.history.length, 1);
});

test('rejects an invalid reorder atomically without adding undo history', () => {
  const state = SettlementPage.createState(players);
  state.events.push(
    { type: 'addedKong', actorId: 'a' },
    { type: 'selfDraw', winnerId: 'a', fan: 0 },
  );
  const before = JSON.parse(JSON.stringify(state));

  const result = SettlementPage.moveEvent(state, 1, -1, Settlement);

  assert.equal(result.ok, false);
  assert.match(result.error.message, /已胡/);
  assert.deepEqual(state, before);
});

test('deletion keeps the edited ledger even when its remaining suffix is invalid', () => {
  const state = SettlementPage.createState(players);
  state.events.push(
    { type: 'concealedKong', actorId: 'b' },
    { type: 'selfDraw', winnerId: 'a', fan: 0 },
    { type: 'addedKong', actorId: 'a' },
  );

  const result = SettlementPage.deleteEvent(state, 0, Settlement);

  assert.equal(result.ok, false);
  assert.equal(result.error.index, 1);
  assert.deepEqual(state.events, [
    { type: 'selfDraw', winnerId: 'a', fan: 0 },
    { type: 'addedKong', actorId: 'a' },
  ]);
  assert.equal(state.history.length, 1);
});

test('undo restores deep snapshots and clear can be undone', () => {
  const state = SettlementPage.createState(players);
  SettlementPage.appendEvent(state, { type: 'concealedKong', actorId: 'a' }, Settlement);
  state.players[0].name = 'changed after snapshot';
  state.events[0].actorId = 'b';

  assert.equal(SettlementPage.undo(state), true);
  assert.equal(state.players[0].name, 'A');
  assert.deepEqual(state.events, []);

  state.players[0].name = 'Alice';
  SettlementPage.appendEvent(state, { type: 'addedKong', actorId: 'b' }, Settlement);
  SettlementPage.clearState(state);
  assert.deepEqual(state.events, []);
  assert.equal(state.players[0].name, '玩家1');

  assert.equal(SettlementPage.undo(state), true);
  assert.equal(state.players[0].name, 'Alice');
  assert.deepEqual(state.events, [{ type: 'addedKong', actorId: 'b' }]);
});

test('view model exposes every transfer and four balances after each valid event', () => {
  const state = SettlementPage.createState(players);
  state.events.push({ type: 'discardWin', payerId: 'a', winners: [
    { playerId: 'b', fan: 1 }, { playerId: 'c', fan: 2 },
  ] });

  const view = SettlementPage.createViewModel(state, Settlement);

  assert.equal(view.ok, true);
  assert.equal(view.finalLabel, '最终收支');
  assert.deepEqual(view.entries[0].transfers, [
    { from: 'A', to: 'B', amount: 2 },
    { from: 'A', to: 'C', amount: 4 },
  ]);
  assert.deepEqual(view.entries[0].balances, [
    { id: 'a', name: 'A', net: -6 },
    { id: 'b', name: 'B', net: 2 },
    { id: 'c', name: 'C', net: 4 },
    { id: 'd', name: 'D', net: 0 },
  ]);
});

test('view model marks the first invalid event and suppresses misleading final totals', () => {
  const state = SettlementPage.createState(players);
  state.events.push(
    { type: 'selfDraw', winnerId: 'a', fan: 0 },
    { type: 'addedKong', actorId: 'a' },
    { type: 'concealedKong', actorId: 'b' },
  );

  const view = SettlementPage.createViewModel(state, Settlement);

  assert.equal(view.ok, false);
  assert.equal(view.finalLabel, null);
  assert.equal(view.entries[0].status, 'valid');
  assert.equal(view.entries[1].status, 'invalid');
  assert.match(view.entries[1].error, /已胡/);
  assert.equal(view.entries[2].status, 'pending');
  assert.equal(view.players.reduce((sum, player) => sum + player.net, 0), 0);
});
