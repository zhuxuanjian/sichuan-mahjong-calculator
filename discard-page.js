(function (root, factory) {
  const api = factory(
    root,
    root && root.Mahjong,
    root && root.Scoring,
    root && root.UICommon,
  );
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.DiscardPage = api;
})(typeof window !== 'undefined' ? window : null, function (windowRoot, browserMahjong, browserScoring, browserUI) {
  'use strict';

  const MELD_SIZES = { pong: 3, openKong: 4, concealedKong: 4 };
  let root = null;
  let elements = null;
  let meldType = 'pong';
  const state = createState();

  function createState() {
    return { hand: [], melds: [], missingSuit: null, selectedDiscard: null, history: [] };
  }

  function targetCount(melds) {
    return 14 - 3 * melds.length;
  }

  function handCounts(hand) {
    const counts = Array(27).fill(0);
    hand.forEach((tile) => { counts[tile] += 1; });
    return counts;
  }

  function hasMissingSuitTile(currentState) {
    return currentState.missingSuit !== null
      && currentState.hand.some((tile) => Math.floor(tile / 9) === currentState.missingSuit);
  }

  function hasMissingSuitMeld(currentState) {
    return currentState.missingSuit !== null
      && currentState.melds.some((meld) => Math.floor(meld.tile / 9) === currentState.missingSuit);
  }

  function canSelectDiscard(currentState, tile) {
    if (![0, 1, 2].includes(currentState.missingSuit)
      || currentState.hand.length !== targetCount(currentState.melds)
      || !currentState.hand.includes(tile)
      || hasMissingSuitMeld(currentState)) return false;
    return !hasMissingSuitTile(currentState)
      || Math.floor(tile / 9) === currentState.missingSuit;
  }

  function reconcileSelectedDiscard(currentState) {
    if (currentState.selectedDiscard !== null
      && !canSelectDiscard(currentState, currentState.selectedDiscard)) {
      currentState.selectedDiscard = null;
    }
  }

  function snapshot(currentState) {
    return {
      hand: currentState.hand.slice(),
      melds: currentState.melds.map((meld) => ({ ...meld })),
      missingSuit: currentState.missingSuit,
      selectedDiscard: currentState.selectedDiscard,
    };
  }

  function saveHistory() {
    state.history.push(snapshot(state));
  }

  function change(mutator) {
    saveHistory();
    mutator();
    reconcileSelectedDiscard(state);
    render();
  }

  function escapeHtml(value) {
    return String(value).replace(/[&<>"']/g, (character) => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
    })[character]);
  }

  function breakdownText(score) {
    return score.breakdown.map((item) => `${item.name} ${item.fan}番`).join(' · ');
  }

  function tileLabel(tile) {
    return `${tile % 9 + 1}${['万', '筒', '条'][Math.floor(tile / 9)]}`;
  }

  function scoreMarkup(label, score) {
    return `<div class="discard-score"><strong>${label} ${score.finalFan} 番</strong>`
      + `<span>${label}番型：${escapeHtml(breakdownText(score))}</span>`
      + (score.capped ? `<small>原始 ${score.rawFan} 番 · 按 4 番封顶</small>` : '')
      + '</div>';
  }

  function waitCardMarkup(wait, ui) {
    const dead = wait.remaining === 0;
    return `<article class="result-card discard-result-card${dead ? ' dead-wait' : ''}">`
      + `<span class="tile" data-suit="${Math.floor(wait.tile / 9)}" aria-hidden="true">${ui.tileMarkup(wait.tile)}</span>`
      + `<div class="discard-result-body"><strong>${ui.tileLabel(wait.tile)}</strong>`
      + `<div class="wait-availability">${dead ? '0 张／绝张' : `理论剩余 ${wait.remaining} 张`}</div>`
      + `<div class="dual-score">${scoreMarkup('点炮', wait.discardScore)}${scoreMarkup('自摸', wait.selfDrawScore)}</div>`
      + '</div></article>';
  }

  function createAnalysisView(currentState, mahjong, scoring) {
    if (!Array.isArray(currentState.melds) || currentState.melds.length > 4) {
      return { kind: 'error', message: '最多只能录入 4 组副露。' };
    }
    const globalValidation = mahjong.validateTileState(handCounts(currentState.hand), currentState.melds);
    if (!globalValidation.ok) {
      return { kind: 'error', message: globalValidation.error };
    }
    const target = targetCount(currentState.melds);
    if (currentState.hand.length !== target) {
      const difference = target - currentState.hand.length;
      return {
        kind: 'incomplete',
        message: difference > 0
          ? `还差 ${difference} 张暗手牌。`
          : `副露已更新，请移除 ${-difference} 张多余暗手牌。`,
      };
    }
    if (![0, 1, 2].includes(currentState.missingSuit)) {
      return { kind: 'incomplete', message: '请先选择定缺花色。' };
    }
    if (hasMissingSuitMeld(currentState)) {
      return { kind: 'blocked', message: '副露中有定缺花色，请先移除或修正对应副露。' };
    }
    if (currentState.selectedDiscard === null) {
      return { kind: 'ready', message: hasMissingSuitTile(currentState)
        ? '定缺牌尚未打完，只能选择定缺花色作为弃牌。'
        : '牌数已齐，请点击一张手牌选择打出。' };
    }
    try {
      const analysis = mahjong.analyzeDiscard({
        concealedCounts: handCounts(currentState.hand),
        melds: currentState.melds,
        missingSuit: currentState.missingSuit,
        discardTile: currentState.selectedDiscard,
        scoreBestWin: scoring.scoreBestWin,
      });
      if (analysis.blockedReason) {
        return { kind: 'blocked', message: analysis.blockedReason, analysis };
      }
      if (!analysis.waits.length) {
        return { kind: 'empty', message: '打出后未听牌', analysis };
      }
      return {
        kind: 'success',
        message: `打出 ${tileLabel(analysis.discardTile)} 后已听牌。`,
        heading: `打出 ${tileLabel(analysis.discardTile)}后听 ${analysis.waits.length} 种牌`,
        analysis,
      };
    } catch (error) {
      return { kind: 'error', message: error.message || '计算失败，请检查手牌。' };
    }
  }

  function renderResults(view) {
    const ui = browserUI;
    elements.status.textContent = view.message;
    elements.status.className = `status${view.kind === 'success' ? ' success' : ''}${view.kind === 'error' || view.kind === 'blocked' ? ' error' : ''}`;
    if (state.selectedDiscard === null) {
      elements.summary.textContent = '尚未选择弃牌。牌数齐全后，点击当前手牌中的一张牌。';
    } else {
      elements.summary.innerHTML = `已选择打出 <strong>${ui.tileLabel(state.selectedDiscard)}</strong>；手牌仍保留该牌，便于切换比较。`;
    }
    if (view.kind === 'success') {
      elements.results.innerHTML = `<h3 class="discard-result-heading">${view.heading}</h3><div class="result-list">`
        + view.analysis.waits.map((wait) => waitCardMarkup(wait, ui)).join('') + '</div>';
      return;
    }
    elements.results.innerHTML = `<div class="empty-state${view.kind === 'blocked' ? ' discard-blocked' : ''}">${escapeHtml(view.message)}</div>`;
  }

  function render() {
    const ui = browserUI;
    const target = targetCount(state.melds);
    const physical = ui.countPhysicalTiles(state.hand, state.melds);
    const selectionMode = state.hand.length === target
      && [0, 1, 2].includes(state.missingSuit)
      && !hasMissingSuitMeld(state);
    const forcedMissingSuit = selectionMode && hasMissingSuitTile(state);

    elements.count.textContent = `${state.hand.length} / ${target}`;
    let selectedMarked = false;
    elements.hand.innerHTML = state.hand.map((tile, index) => {
      const suit = browserMahjong.tileSuit(tile);
      const selected = selectionMode && !selectedMarked && tile === state.selectedDiscard;
      if (selected) selectedMarked = true;
      const disabledByMissingSuit = forcedMissingSuit && suit !== state.missingSuit;
      const classNames = ['tile'];
      if (selected) classNames.push('selected-discard');
      if (disabledByMissingSuit) classNames.push('disabled-by-missing-suit');
      if (selectionMode) {
        const explanation = disabledByMissingSuit ? '，须先打出定缺花色' : '';
        return `<button type="button" class="${classNames.join(' ')}" data-discard-tile="${tile}" data-suit="${suit}"`
          + `${disabledByMissingSuit ? ' disabled' : ''} aria-pressed="${selected}" aria-label="选择打出${ui.tileLabel(tile)}${explanation}"`
          + `${disabledByMissingSuit ? ' title="有定缺牌时只能打出定缺花色"' : ''}>${ui.tileMarkup(tile)}</button>`;
      }
      return `<button type="button" class="tile" data-hand-index="${index}" data-suit="${suit}" aria-label="移除${ui.tileLabel(tile)}">${ui.tileMarkup(tile)}</button>`;
    }).join('');

    elements.melds.innerHTML = state.melds.length
      ? state.melds.map((meld, index) => ui.meldMarkup(meld, index, state.missingSuit)).join('')
      : '<p class="hint">暂无副露；暗杠也请在这里录入。</p>';
    elements.picker.querySelectorAll('[data-tile]').forEach((button) => {
      const tile = Number(button.dataset.tile);
      button.disabled = state.hand.length >= target || physical[tile] >= 4;
      button.title = physical[tile] >= 4 ? '手牌与副露合计最多四张' : '';
    });
    root.querySelectorAll('[data-discard-missing-suit]').forEach((button) => {
      button.setAttribute('aria-pressed', String(Number(button.dataset.discardMissingSuit) === state.missingSuit));
    });
    root.querySelectorAll('[data-discard-meld-type]').forEach((button) => {
      button.setAttribute('aria-pressed', String(button.dataset.discardMeldType === meldType));
    });
    [...elements.meldTile.options].forEach((option) => {
      option.disabled = physical[Number(option.value)] + MELD_SIZES[meldType] > 4;
    });
    const selectedMeldTile = Number(elements.meldTile.value);
    elements.addMeld.disabled = state.melds.length >= 4
      || physical[selectedMeldTile] + MELD_SIZES[meldType] > 4;
    elements.meldHint.textContent = state.melds.length >= 4 ? '最多录入 4 组副露。'
      : elements.addMeld.disabled ? '这组副露会超过四张上限，请换一种牌。'
        : `新增副露后，暗手牌目标减少 3 张；当前目标 ${target} 张。`;
    elements.undo.disabled = state.history.length === 0;
    elements.clear.disabled = !state.hand.length && !state.melds.length
      && state.missingSuit === null && state.selectedDiscard === null;
    renderResults(createAnalysisView(state, browserMahjong, browserScoring));
  }

  function onClick(event) {
    const button = event.target.closest('button');
    if (!button || !root.contains(button) || button.disabled) return;
    const data = button.dataset;
    if (data.tile !== undefined) {
      const tile = Number(data.tile);
      if (state.hand.length >= targetCount(state.melds)
        || browserUI.countPhysicalTiles(state.hand, state.melds)[tile] >= 4) return;
      change(() => { state.hand.push(tile); state.hand.sort((left, right) => left - right); });
    } else if (data.handIndex !== undefined) {
      const removedIndex = Number(data.handIndex);
      change(() => { state.hand.splice(removedIndex, 1); });
      browserUI.restoreFocusAfterRemoval(
        elements.hand,
        'button.tile',
        removedIndex,
        elements.picker.querySelector('[data-tile]:not([disabled])') || elements.picker.querySelector('[data-tile]'),
      );
    } else if (data.discardTile !== undefined) {
      const tile = Number(data.discardTile);
      if (canSelectDiscard(state, tile) && state.selectedDiscard !== tile) {
        change(() => { state.selectedDiscard = tile; });
      }
    } else if (data.removeMeld !== undefined) {
      const removedIndex = Number(data.removeMeld);
      change(() => { state.melds.splice(removedIndex, 1); });
      browserUI.restoreFocusAfterRemoval(elements.melds, '[data-remove-meld]', removedIndex, elements.addMeld);
    } else if (data.discardMissingSuit !== undefined) {
      const suit = Number(data.discardMissingSuit);
      if (state.missingSuit !== suit) change(() => { state.missingSuit = suit; });
    } else if (data.discardMeldType !== undefined) {
      meldType = data.discardMeldType;
      render();
    } else if (button === elements.addMeld) {
      const tile = Number(elements.meldTile.value);
      if (state.melds.length >= 4
        || browserUI.countPhysicalTiles(state.hand, state.melds)[tile] + MELD_SIZES[meldType] > 4) return;
      change(() => { state.melds.push({ type: meldType, tile }); });
    } else if (button === elements.undo) {
      const previous = state.history.pop();
      if (previous) Object.assign(state, previous);
      render();
    } else if (button === elements.clear) {
      change(() => {
        const history = state.history;
        Object.assign(state, createState(), { history });
      });
    }
  }

  function onChange(event) {
    if (event.target === elements.meldTile) render();
  }

  function mount(rootElement) {
    if (!windowRoot || !browserMahjong || !browserScoring || !browserUI) {
      throw new Error('出牌建议页面依赖未加载');
    }
    unmount();
    root = rootElement;
    const find = (id) => root.querySelector(`#${id}`);
    elements = {
      picker: find('discard-tile-picker'),
      hand: find('discard-hand'),
      count: find('discard-hand-count'),
      status: find('discard-status'),
      summary: find('discard-selection-summary'),
      results: find('discard-results'),
      undo: find('discard-undo-button'),
      clear: find('discard-clear-button'),
      melds: find('discard-melds'),
      meldTile: find('discard-meld-tile'),
      addMeld: find('discard-add-meld'),
      meldHint: find('discard-meld-hint'),
    };
    elements.picker.innerHTML = browserUI.pickerMarkup();
    elements.meldTile.innerHTML = Array.from({ length: 27 }, (_, tile) => `<option value="${tile}">${browserUI.tileLabel(tile)}</option>`).join('');
    root.addEventListener('click', onClick);
    root.addEventListener('change', onChange);
    render();
  }

  function unmount() {
    if (root) {
      root.removeEventListener('click', onClick);
      root.removeEventListener('change', onChange);
    }
    root = null;
    elements = null;
  }

  return {
    mount,
    unmount,
    createState,
    targetCount,
    handCounts,
    canSelectDiscard,
    reconcileSelectedDiscard,
    createAnalysisView,
    waitCardMarkup,
  };
});
