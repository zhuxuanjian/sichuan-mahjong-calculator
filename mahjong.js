(function (root, factory) {
  const api = factory();

  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.Mahjong = api;
})(typeof window !== 'undefined' ? window : globalThis, function () {
  'use strict';

  const HU_COUNTS = new Set([1, 4, 7, 10, 13]);
  const DISCARD_COUNTS = new Set([2, 5, 8, 11, 14]);

  function tileSuit(tile) {
    return Math.floor(tile / 9);
  }

  function tileRank(tile) {
    return (tile % 9) + 1;
  }

  function sumCounts(counts) {
    return counts.reduce((sum, count) => sum + count, 0);
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
    if (expectedTotal !== undefined && sumCounts(counts) !== expectedTotal) {
      return { ok: false, error: `手牌必须正好有 ${expectedTotal} 张` };
    }
    return { ok: true };
  }

  function isValidHuCount(count) {
    return HU_COUNTS.has(count);
  }

  function isValidDiscardCount(count) {
    return DISCARD_COUNTS.has(count);
  }

  function collectStandardMelds(counts, neededMelds, path, results) {
    const tile = counts.findIndex((count) => count > 0);
    if (tile === -1) {
      if (path.length === neededMelds) results.push(path);
      return;
    }
    if (path.length >= neededMelds) return;

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
    return sumCounts(counts) === 14
      && counts.every((count) => count % 2 === 0)
      && counts.reduce((sum, count) => sum + (count / 2), 0) === 7;
  }

  function getWinInterpretations(counts) {
    const validation = validateCounts(counts);
    if (!validation.ok) return [];
    const total = sumCounts(counts);
    if (!isValidDiscardCount(total)) return [];

    const neededMelds = (total - 2) / 3;
    const interpretations = [];
    const keys = new Set();
    for (let pair = 0; pair < 27; pair += 1) {
      if (counts[pair] < 2) continue;
      const remainder = counts.slice();
      remainder[pair] -= 2;
      const paths = [];
      collectStandardMelds(remainder, neededMelds, [], paths);
      for (const melds of paths) {
        const interpretation = { kind: 'standard', pair, melds };
        const key = JSON.stringify(interpretation);
        if (!keys.has(key)) {
          keys.add(key);
          interpretations.push(interpretation);
        }
      }
    }
    if (isSevenPairs(counts)) interpretations.push({ kind: 'sevenPairs' });
    return interpretations;
  }

  function containsSuit(counts, suit) {
    return counts.some((count, tile) => count > 0 && tileSuit(tile) === suit);
  }

  function validateMissingSuit(missingSuit) {
    if (![0, 1, 2].includes(missingSuit)) throw new Error('请选择有效的定缺花色');
  }

  function findWinningTiles(input) {
    const normalized = input || {};
    const validation = validateCounts(normalized.concealedCounts);
    if (!validation.ok) throw new Error(validation.error);
    if (!isValidHuCount(sumCounts(normalized.concealedCounts))) {
      throw new Error('当前手牌相公，本页支持 1、4、7、10、13 张');
    }
    validateMissingSuit(normalized.missingSuit);
    if (containsSuit(normalized.concealedCounts, normalized.missingSuit)) {
      throw new Error('手牌中仍有定缺花色');
    }

    const results = [];
    for (let tile = 0; tile < 27; tile += 1) {
      if (normalized.concealedCounts[tile] >= 4 || tileSuit(tile) === normalized.missingSuit) continue;
      const candidate = normalized.concealedCounts.slice();
      candidate[tile] += 1;
      const interpretations = getWinInterpretations(candidate);
      if (interpretations.length > 0) results.push({ tile, interpretations });
    }
    return results;
  }

  function validateDiscardChoice(concealedCounts, missingSuit, discardTile) {
    validateMissingSuit(missingSuit);
    if (!Number.isInteger(discardTile) || discardTile < 0 || discardTile >= 27) {
      throw new Error('请选择有效的打出牌');
    }
    if (concealedCounts[discardTile] < 1) throw new Error('手牌中没有选中的打出牌');
    if (containsSuit(concealedCounts, missingSuit) && tileSuit(discardTile) !== missingSuit) {
      throw new Error('必须先打出定缺花色');
    }
  }

  function analyzeDiscard(input) {
    const normalized = input || {};
    const validation = validateCounts(normalized.concealedCounts);
    if (!validation.ok) throw new Error(validation.error);
    if (!isValidDiscardCount(sumCounts(normalized.concealedCounts))) {
      throw new Error('当前手牌相公，本页支持 2、5、8、11、14 张');
    }
    validateDiscardChoice(
      normalized.concealedCounts,
      normalized.missingSuit,
      normalized.discardTile,
    );

    const postDiscard = normalized.concealedCounts.slice();
    postDiscard[normalized.discardTile] -= 1;
    if (containsSuit(postDiscard, normalized.missingSuit)) {
      return {
        discardTile: normalized.discardTile,
        blockedReason: '打出后仍有定缺牌，请继续打定缺',
        waits: [],
      };
    }

    const wins = findWinningTiles({
      concealedCounts: postDiscard,
      missingSuit: normalized.missingSuit,
    });
    return {
      discardTile: normalized.discardTile,
      blockedReason: null,
      waits: wins.map((win) => ({
        tile: win.tile,
        remaining: 4 - normalized.concealedCounts[win.tile],
      })),
    };
  }

  return {
    tileSuit,
    tileRank,
    validateCounts,
    isValidHuCount,
    isValidDiscardCount,
    getWinInterpretations,
    findWinningTiles,
    analyzeDiscard,
  };
});
