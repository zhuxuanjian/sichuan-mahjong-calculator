(function (root, factory) {
  const api = factory();

  if (typeof module === 'object' && module.exports) {
    module.exports = api;
  }

  if (root) {
    root.Settlement = api;
  }
})(typeof window !== 'undefined' ? window : globalThis, function () {
  'use strict';

  const EVENT_FIELDS = {
    concealedKong: ['type', 'actorId'],
    addedKong: ['type', 'actorId'],
    discardKong: ['type', 'actorId', 'payerId'],
    discardWin: ['type', 'payerId', 'winners'],
    selfDraw: ['type', 'winnerId', 'fan'],
  };

  function createInitialState(players) {
    if (!Array.isArray(players)) {
      return { ok: false, error: '玩家数据必须是数组' };
    }

    const ids = new Set();
    const playerStates = [];
    for (const player of players) {
      if (!player || typeof player !== 'object'
        || typeof player.id !== 'string' || player.id.length === 0
        || typeof player.name !== 'string') {
        return { ok: false, error: '玩家必须包含非空 id 和 name' };
      }
      if (ids.has(player.id)) {
        return { ok: false, error: `玩家 id 重复：${player.id}` };
      }
      ids.add(player.id);
      playerStates.push({ id: player.id, name: player.name, won: false });
    }

    return {
      ok: true,
      state: {
        players: playerStates,
        playerById: new Map(playerStates.map((player) => [player.id, player])),
        transfers: [],
      },
    };
  }

  function hasExactFields(value, fields) {
    const keys = Object.keys(value).sort();
    return keys.length === fields.length && keys.every((key, index) => key === fields.slice().sort()[index]);
  }

  function validateFan(fan) {
    return Number.isInteger(fan) && fan >= 0 && fan <= 4;
  }

  function validateKnownActivePlayer(state, id, label) {
    if (typeof id !== 'string' || !state.playerById.has(id)) {
      return { ok: false, error: `${label}不存在` };
    }
    if (state.playerById.get(id).won) {
      return { ok: false, error: `${label}已胡牌，不能参与后续结算` };
    }
    return { ok: true };
  }

  function validateWinner(state, winner) {
    if (!winner || typeof winner !== 'object' || !hasExactFields(winner, ['playerId', 'fan'])) {
      return { ok: false, error: '获胜者数据无效' };
    }
    const playerValidation = validateKnownActivePlayer(state, winner.playerId, '获胜者');
    if (!playerValidation.ok) {
      return playerValidation;
    }
    if (!validateFan(winner.fan)) {
      return { ok: false, error: '番数必须是 0 到 4 的整数' };
    }
    return { ok: true };
  }

  function validateEvent(state, event) {
    if (!event || typeof event !== 'object' || Array.isArray(event)
      || typeof event.type !== 'string' || !Object.hasOwn(EVENT_FIELDS, event.type)) {
      return { ok: false, error: '结算事件类型无效' };
    }
    if (!hasExactFields(event, EVENT_FIELDS[event.type])) {
      return { ok: false, error: '结算事件字段无效' };
    }

    if (event.type === 'concealedKong' || event.type === 'addedKong') {
      return validateKnownActivePlayer(state, event.actorId, '杠者');
    }
    if (event.type === 'discardKong') {
      if (event.actorId === event.payerId) {
        return { ok: false, error: '杠者和点杠者不能相同' };
      }
      const actorValidation = validateKnownActivePlayer(state, event.actorId, '杠者');
      if (!actorValidation.ok) return actorValidation;
      return validateKnownActivePlayer(state, event.payerId, '点杠者');
    }
    if (event.type === 'selfDraw') {
      const winnerValidation = validateKnownActivePlayer(state, event.winnerId, '获胜者');
      if (!winnerValidation.ok) return winnerValidation;
      if (!validateFan(event.fan)) {
        return { ok: false, error: '番数必须是 0 到 4 的整数' };
      }
      return { ok: true };
    }

    const payerValidation = validateKnownActivePlayer(state, event.payerId, '点炮者');
    if (!payerValidation.ok) return payerValidation;
    if (!Array.isArray(event.winners) || event.winners.length === 0) {
      return { ok: false, error: '点炮胡必须至少有一位获胜者' };
    }
    const winnerIds = new Set();
    for (const winner of event.winners) {
      const winnerValidation = validateWinner(state, winner);
      if (!winnerValidation.ok) return winnerValidation;
      if (winner.playerId === event.payerId) {
        return { ok: false, error: '点炮者不能同时是获胜者' };
      }
      if (winnerIds.has(winner.playerId)) {
        return { ok: false, error: '获胜者不能重复' };
      }
      winnerIds.add(winner.playerId);
    }
    return { ok: true };
  }

  function activePlayers(state) {
    return state.players.filter((player) => !player.won);
  }

  function powerOfTwo(fan) {
    return 2 ** fan;
  }

  function makeKongTransfers(state, actorId, amount, reason) {
    return activePlayers(state)
      .filter((player) => player.id !== actorId)
      .map((player) => ({ fromId: player.id, toId: actorId, amount, reason }));
  }

  function makeTransfers(state, event) {
    if (event.type === 'concealedKong') {
      return makeKongTransfers(state, event.actorId, 2, event.type);
    }
    if (event.type === 'addedKong') {
      return makeKongTransfers(state, event.actorId, 1, event.type);
    }
    if (event.type === 'discardKong') {
      return [{ fromId: event.payerId, toId: event.actorId, amount: 2, reason: event.type }];
    }
    if (event.type === 'discardWin') {
      return event.winners.map((winner) => ({
        fromId: event.payerId,
        toId: winner.playerId,
        amount: powerOfTwo(winner.fan),
        reason: event.type,
      }));
    }
    return activePlayers(state)
      .filter((player) => player.id !== event.winnerId)
      .map((player) => ({
        fromId: player.id,
        toId: event.winnerId,
        amount: powerOfTwo(event.fan),
        reason: event.type,
      }));
  }

  function markWinners(state, event) {
    if (event.type === 'selfDraw') {
      state.playerById.get(event.winnerId).won = true;
    }
    if (event.type === 'discardWin') {
      for (const winner of event.winners) {
        state.playerById.get(winner.playerId).won = true;
      }
    }
  }

  function playerSummaries(state) {
    return state.players.map((player) => {
      let income = 0;
      let expense = 0;
      for (const transfer of state.transfers) {
        if (transfer.toId === player.id) income += transfer.amount;
        if (transfer.fromId === player.id) expense += transfer.amount;
      }
      return {
        id: player.id,
        name: player.name,
        won: player.won,
        income,
        expense,
        net: income - expense,
      };
    });
  }

  function balancesAfter(state) {
    return Object.fromEntries(playerSummaries(state).map((player) => [player.id, player.net]));
  }

  function failureSnapshot(state, eventResults, index, message) {
    return {
      ok: false,
      players: playerSummaries(state),
      eventResults,
      error: { index, message },
    };
  }

  function replay(players, events) {
    const initialized = createInitialState(players);
    if (!initialized.ok) {
      return {
        ok: false,
        players: [],
        eventResults: [],
        error: { index: 0, message: initialized.error },
      };
    }

    const state = initialized.state;
    if (!Array.isArray(events)) {
      return failureSnapshot(state, [], 0, '结算事件必须是数组');
    }

    const eventResults = [];
    for (let index = 0; index < events.length; index += 1) {
      const event = events[index];
      const validation = validateEvent(state, event);
      if (!validation.ok) {
        return failureSnapshot(state, eventResults, index, validation.error);
      }

      const transfers = makeTransfers(state, event);
      state.transfers.push(...transfers);
      markWinners(state, event);
      eventResults.push({ event, transfers, balancesAfter: balancesAfter(state) });
    }

    return { ok: true, players: playerSummaries(state), eventResults };
  }

  return { replay };
});
