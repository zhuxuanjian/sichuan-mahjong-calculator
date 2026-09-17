(function (root, factory) {
  const api = factory();

  if (typeof module === 'object' && module.exports) {
    module.exports = api;
  }

  if (root) {
    root.Scoring = api;
  }
})(typeof window !== 'undefined' ? window : globalThis, function () {
  'use strict';

  const MELD_SIZES = { pong: 3, openKong: 4, concealedKong: 4 };
  const SPECIAL_CONTEXTS = {
    normal: null,
    kongDraw: { method: 'selfDraw', name: '杠上花' },
    kongDiscard: { method: 'discard', name: '杠上炮' },
    robKong: { method: 'discard', name: '抢杠胡' },
    lastTile: { method: 'selfDraw', name: '海底捞月' },
  };

  function tileSuit(tile) {
    return Math.floor(tile / 9);
  }

  function validateContext(winMethod, specialContext) {
    if (!['discard', 'selfDraw'].includes(winMethod)) {
      throw new Error('胡牌方式必须是点炮或自摸');
    }
    if (!Object.hasOwn(SPECIAL_CONTEXTS, specialContext)) {
      throw new Error('特殊情境无效');
    }
    const context = SPECIAL_CONTEXTS[specialContext];
    if (context && context.method !== winMethod) {
      const methodName = context.method === 'selfDraw' ? '自摸' : '点炮';
      throw new Error(`${context.name}只能与${methodName}组合`);
    }
  }

  function allTileCounts(concealedCounts, melds) {
    const totals = concealedCounts.slice();
    for (const meld of melds) {
      if (meld && Object.hasOwn(MELD_SIZES, meld.type)) {
        totals[meld.tile] += MELD_SIZES[meld.type];
      }
    }
    return totals;
  }

  function isPureOneSuit(concealedCounts, melds) {
    const suits = new Set();
    concealedCounts.forEach((count, tile) => {
      if (count > 0) suits.add(tileSuit(tile));
    });
    melds.forEach((meld) => {
      if (meld && Number.isInteger(meld.tile)) suits.add(tileSuit(meld.tile));
    });
    return suits.size === 1;
  }

  function isGoldHook(concealedCounts, melds, interpretation) {
    return interpretation.kind === 'standard'
      && melds.length === 4
      && concealedCounts.filter((count) => count > 0).length === 1
      && concealedCounts.some((count) => count === 2);
  }

  function isBigPairs(interpretation, melds) {
    return interpretation.kind === 'standard'
      && melds.length < 4
      && interpretation.melds.every((meld) => meld.kind === 'triplet');
  }

  function interpretationKey(result) {
    return JSON.stringify(result.interpretation);
  }

  function scoreInterpretation(input, interpretation) {
    const { concealedCounts, melds, winMethod, specialContext } = input;
    const breakdown = [];

    if (interpretation.kind === 'sevenPairs') {
      breakdown.push({ name: '七对', fan: 2 });
    } else if (isGoldHook(concealedCounts, melds, interpretation)) {
      breakdown.push({ name: '金钩钓', fan: 1 });
    } else if (isBigPairs(interpretation, melds)) {
      breakdown.push({ name: '大对子', fan: 1 });
    }

    const roots = allTileCounts(concealedCounts, melds)
      .filter((count) => count === 4).length;
    for (let root = 0; root < roots; root += 1) {
      breakdown.push({ name: '根', fan: 1 });
    }

    if (isPureOneSuit(concealedCounts, melds)) {
      breakdown.push({ name: '清一色', fan: 2 });
    }

    if (winMethod === 'selfDraw') {
      breakdown.push({ name: '自摸', fan: 1 });
    }
    const context = SPECIAL_CONTEXTS[specialContext];
    if (context) {
      breakdown.push({ name: context.name, fan: 1 });
    }

    if (breakdown.length === 0) {
      breakdown.push({ name: '素胡', fan: 0 });
    }

    const rawFan = breakdown.reduce((sum, item) => sum + item.fan, 0);
    return {
      interpretation,
      breakdown,
      rawFan,
      finalFan: Math.min(rawFan, 4),
      capped: rawFan > 4,
    };
  }

  function scoreBestWin(input) {
    const normalized = input || {};
    const melds = Array.isArray(normalized.melds) ? normalized.melds : [];
    const interpretations = Array.isArray(normalized.interpretations)
      ? normalized.interpretations
      : [];
    const concealedCounts = normalized.concealedCounts;

    if (!Array.isArray(concealedCounts) || concealedCounts.length !== 27) {
      throw new Error('暗手牌数据必须包含 27 个计数');
    }
    validateContext(normalized.winMethod, normalized.specialContext);
    if (interpretations.length === 0) {
      throw new Error('没有可计分的胡牌拆分');
    }

    const scoringInput = {
      concealedCounts,
      melds,
      winMethod: normalized.winMethod,
      specialContext: normalized.specialContext,
    };
    const candidates = interpretations.map((interpretation) => scoreInterpretation(scoringInput, interpretation));
    candidates.sort((a, b) => b.rawFan - a.rawFan || interpretationKey(a).localeCompare(interpretationKey(b)));
    return candidates[0];
  }

  return { scoreBestWin };
});
