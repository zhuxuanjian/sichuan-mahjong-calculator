(function (root, factory) {
  const api = factory();

  if (typeof module === 'object' && module.exports) {
    module.exports = api;
  }

  if (root) {
    root.Mahjong = api;
  }
})(typeof window !== 'undefined' ? window : globalThis, function () {
  'use strict';

  function tileSuit(tile) {
    return Math.floor(tile / 9);
  }

  function tileRank(tile) {
    return (tile % 9) + 1;
  }

  function validateCounts(counts, expectedTotal) {
    if (!Array.isArray(counts) || counts.length !== 27) {
      return { ok: false, error: '牌数据必须包含 27 个计数' };
    }

    if (counts.some((count) => !Number.isInteger(count) || count < 0)) {
      return { ok: false, error: '牌数必须是非负整数' };
    }

    if (counts.some((count) => count > 4)) {
      return { ok: false, error: '每种牌最多只能有 4 张' };
    }

    const total = counts.reduce((sum, count) => sum + count, 0);
    if (expectedTotal !== undefined && total !== expectedTotal) {
      return { ok: false, error: `手牌必须正好有 ${expectedTotal} 张` };
    }

    return { ok: true };
  }

  function canFormMelds(counts, memo) {
    const key = counts.join(',');
    if (memo.has(key)) {
      return memo.get(key);
    }

    const tile = counts.findIndex((count) => count > 0);
    if (tile === -1) {
      return true;
    }

    let result = false;
    if (counts[tile] >= 3) {
      counts[tile] -= 3;
      result = canFormMelds(counts, memo);
      counts[tile] += 3;
    }

    const canStartSequence = tileRank(tile) <= 7
      && tileSuit(tile) === tileSuit(tile + 2)
      && counts[tile + 1] > 0
      && counts[tile + 2] > 0;

    if (!result && canStartSequence) {
      counts[tile] -= 1;
      counts[tile + 1] -= 1;
      counts[tile + 2] -= 1;
      result = canFormMelds(counts, memo);
      counts[tile] += 1;
      counts[tile + 1] += 1;
      counts[tile + 2] += 1;
    }

    memo.set(key, result);
    return result;
  }

  function isStandardWin(counts) {
    if (!validateCounts(counts, 14).ok) {
      return false;
    }

    for (let pair = 0; pair < 27; pair += 1) {
      if (counts[pair] < 2) {
        continue;
      }

      const remainder = counts.slice();
      remainder[pair] -= 2;
      if (canFormMelds(remainder, new Map())) {
        return true;
      }
    }

    return false;
  }

  function getSpecialHands(counts) {
    if (!validateCounts(counts, 14).ok) {
      return { sevenPairs: false, dragonPairs: false, dragonCount: 0 };
    }

    const sevenPairs = counts.every((count) => count % 2 === 0)
      && counts.reduce((sum, count) => sum + (count / 2), 0) === 7;
    const dragonCount = sevenPairs
      ? counts.filter((count) => count === 4).length
      : 0;

    return {
      sevenPairs,
      dragonPairs: dragonCount > 0,
      dragonCount,
    };
  }

  function findWinningTiles(counts, missingSuit) {
    const validation = validateCounts(counts, 13);
    if (!validation.ok) {
      throw new Error(validation.error);
    }

    if (![0, 1, 2].includes(missingSuit)) {
      throw new Error('请选择有效的定缺花色');
    }

    const hasMissingSuit = counts.some((count, tile) => (
      count > 0 && tileSuit(tile) === missingSuit
    ));
    if (hasMissingSuit) {
      throw new Error('手牌中仍有定缺花色');
    }

    const results = [];
    for (let tile = 0; tile < 27; tile += 1) {
      if (counts[tile] >= 4 || tileSuit(tile) === missingSuit) {
        continue;
      }

      const candidate = counts.slice();
      candidate[tile] += 1;
      const patterns = [];

      if (isStandardWin(candidate)) {
        patterns.push('普通胡');
      }

      const special = getSpecialHands(candidate);
      if (special.sevenPairs) {
        patterns.push('七对');
      }
      if (special.dragonPairs) {
        patterns.push('龙七对');
      }

      if (patterns.length > 0) {
        results.push({
          tile,
          patterns,
          remaining: 4 - counts[tile],
          dragonCount: special.dragonCount,
        });
      }
    }

    return results;
  }

  return {
    tileSuit,
    tileRank,
    validateCounts,
    isStandardWin,
    getSpecialHands,
    findWinningTiles,
  };
});

