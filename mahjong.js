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

  const MELD_TYPES = { pong: 3, openKong: 4, concealedKong: 4 };

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

  function validateTileState(counts, melds = [], expectedConcealed) {
    const countValidation = validateCounts(counts, expectedConcealed);
    if (!countValidation.ok) {
      return countValidation;
    }
    if (!Array.isArray(melds) || melds.length > 4) {
      return { ok: false, error: '副露数据无效' };
    }

    const physicalCounts = counts.slice();
    for (const meld of melds) {
      if (!meld || typeof meld !== 'object' || !Object.hasOwn(MELD_TYPES, meld.type)) {
        return { ok: false, error: '副露类型无效' };
      }
      if (!Number.isInteger(meld.tile) || meld.tile < 0 || meld.tile >= 27) {
        return { ok: false, error: '副露牌无效' };
      }
      physicalCounts[meld.tile] += MELD_TYPES[meld.type];
      if (physicalCounts[meld.tile] > 4) {
        return { ok: false, error: '每种牌最多只能有 4 张' };
      }
    }
    return { ok: true };
  }

  function collectStandardMelds(counts, neededMelds, path, results) {
    const tile = counts.findIndex((count) => count > 0);
    if (tile === -1) {
      if (path.length === neededMelds) {
        results.push(path);
      }
      return;
    }
    if (path.length >= neededMelds) {
      return;
    }

    if (counts[tile] >= 3) {
      counts[tile] -= 3;
      collectStandardMelds(counts, neededMelds, path.concat({ kind: 'triplet', tile }), results);
      counts[tile] += 3;
    }

    const canStartSequence = tileRank(tile) <= 7
      && tileSuit(tile) === tileSuit(tile + 2)
      && counts[tile + 1] > 0
      && counts[tile + 2] > 0;
    if (canStartSequence) {
      counts[tile] -= 1;
      counts[tile + 1] -= 1;
      counts[tile + 2] -= 1;
      collectStandardMelds(counts, neededMelds, path.concat({ kind: 'sequence', tile }), results);
      counts[tile] += 1;
      counts[tile + 1] += 1;
      counts[tile + 2] += 1;
    }
  }

  function isSevenPairs(counts) {
    return counts.every((count) => count % 2 === 0)
      && counts.reduce((sum, count) => sum + (count / 2), 0) === 7;
  }

  function getWinInterpretations(counts, melds = []) {
    if (!Array.isArray(melds) || melds.length > 4) {
      return [];
    }
    const neededConcealedMelds = 4 - melds.length;
    const expectedTotal = neededConcealedMelds * 3 + 2;
    if (!validateTileState(counts, melds, expectedTotal).ok) {
      return [];
    }

    const interpretations = [];
    const keys = new Set();
    for (let pair = 0; pair < 27; pair += 1) {
      if (counts[pair] < 2) {
        continue;
      }
      const remainder = counts.slice();
      remainder[pair] -= 2;
      const paths = [];
      collectStandardMelds(remainder, neededConcealedMelds, [], paths);
      for (const path of paths) {
        const interpretation = { kind: 'standard', pair, melds: path };
        const key = JSON.stringify(interpretation);
        if (!keys.has(key)) {
          keys.add(key);
          interpretations.push(interpretation);
        }
      }
    }
    if (melds.length === 0 && isSevenPairs(counts)) {
      interpretations.push({ kind: 'sevenPairs' });
    }
    return interpretations;
  }

  function isStandardWin(counts) {
    return getWinInterpretations(counts, []).some((win) => win.kind === 'standard');
  }

  function getSpecialHands(counts) {
    if (!validateCounts(counts, 14).ok) {
      return { sevenPairs: false, dragonPairs: false, dragonCount: 0 };
    }
    const sevenPairs = isSevenPairs(counts);
    const dragonCount = sevenPairs
      ? counts.filter((count) => count === 4).length
      : 0;
    return { sevenPairs, dragonPairs: dragonCount > 0, dragonCount };
  }

  function findWinningTiles(input) {
    const { concealedCounts, melds = [], missingSuit } = input || {};
    const expectedConcealed = 13 - (Array.isArray(melds) ? melds.length * 3 : 0);
    const validation = validateTileState(concealedCounts, melds, expectedConcealed);
    if (!validation.ok) {
      throw new Error(validation.error);
    }
    if (![0, 1, 2].includes(missingSuit)) {
      throw new Error('请选择有效的定缺花色');
    }
    const hasMissingSuit = concealedCounts.some(
      (count, tile) => count > 0 && tileSuit(tile) === missingSuit,
    ) || melds.some((meld) => tileSuit(meld.tile) === missingSuit);
    if (hasMissingSuit) {
      throw new Error('手牌中仍有定缺花色');
    }

    const exposedCounts = Array(27).fill(0);
    for (const meld of melds) {
      exposedCounts[meld.tile] += MELD_TYPES[meld.type];
    }

    const results = [];
    for (let tile = 0; tile < 27; tile += 1) {
      if (concealedCounts[tile] + exposedCounts[tile] >= 4 || tileSuit(tile) === missingSuit) {
        continue;
      }
      const candidate = concealedCounts.slice();
      candidate[tile] += 1;
      const interpretations = getWinInterpretations(candidate, melds);
      if (interpretations.length > 0) {
        results.push({ tile, interpretations });
      }
    }
    return results;
  }

  return {
    tileSuit,
    tileRank,
    validateCounts,
    validateTileState,
    getWinInterpretations,
    isStandardWin,
    getSpecialHands,
    findWinningTiles,
  };
});
