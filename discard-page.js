(function (root, factory) {
  const api = factory(root, root && root.Mahjong, root && root.UICommon);
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.DiscardPage = api;
})(typeof window !== 'undefined' ? window : null, function (windowRoot, browserMahjong, browserUI) {
  'use strict';
  const state = createState();
  let pageRoot = null;
  let elements = null;

  function createState() {
    return { hand: [], missingSuit: null, selectedDiscard: null, history: [] };
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
  function canSelectDiscard(currentState, tile) {
    if (![0, 1, 2].includes(currentState.missingSuit)
      || !(currentState.hand.length >= 2 && currentState.hand.length <= 14 && currentState.hand.length % 3 === 2)
      || !currentState.hand.includes(tile)) return false;
    return !hasMissingSuitTile(currentState)
      || Math.floor(tile / 9) === currentState.missingSuit;
  }
  function reconcileSelectedDiscard(currentState) {
    if (currentState.selectedDiscard !== null && !canSelectDiscard(currentState, currentState.selectedDiscard)) {
      currentState.selectedDiscard = null;
    }
  }
  function snapshot() {
    return { hand: state.hand.slice(), missingSuit: state.missingSuit, selectedDiscard: state.selectedDiscard };
  }
  function change(mutator) {
    state.history.push(snapshot());
    mutator();
    reconcileSelectedDiscard(state);
    render();
  }
  function escapeHtml(value) {
    return String(value).replace(/[&<>"']/g, (character) => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
    })[character]);
  }
  function tileLabel(tile) {
    return `${tile % 9 + 1}${['万', '筒', '条'][Math.floor(tile / 9)]}`;
  }
  function waitCardMarkup(wait, ui) {
    const dead = wait.remaining === 0;
    return `<article class="result-card discard-result-card${dead ? ' dead-wait' : ''}">`
      + `<span class="tile" data-suit="${Math.floor(wait.tile / 9)}" aria-hidden="true">${ui.tileMarkup(wait.tile)}</span>`
      + `<div class="discard-result-body"><strong>${ui.tileLabel(wait.tile)}</strong>`
      + `<div class="wait-availability">${dead ? '0 张／绝张' : `理论剩余 ${wait.remaining} 张`}</div>`
      + '</div></article>';
  }
  function createAnalysisView(currentState, mahjong) {
    const counts = handCounts(currentState.hand);
    const validation = mahjong.validateCounts(counts);
    if (!validation.ok) return { kind: 'error', message: validation.error };
    if (currentState.hand.length === 0) return { kind: 'incomplete', message: '请添加手牌。' };
    if (!mahjong.isValidDiscardCount(currentState.hand.length)) {
      return { kind: 'error', message: '当前手牌相公，本页支持 2、5、8、11、14 张。' };
    }
    if (![0, 1, 2].includes(currentState.missingSuit)) {
      return { kind: 'incomplete', message: '请先选择定缺花色。' };
    }
    const forcedMissingSuit = hasMissingSuitTile(currentState);
    const alreadyHu = !forcedMissingSuit && mahjong.getWinInterpretations(counts).length > 0;
    const notice = alreadyHu ? '当前手牌已胡牌。' : '';
    if (currentState.selectedDiscard === null) {
      return { kind: 'ready', message: notice + (forcedMissingSuit
        ? '定缺牌尚未打完，只能选择定缺花色作为弃牌。'
        : '点击一张手牌选择打出。'), alreadyHu };
    }
    try {
      const analysis = mahjong.analyzeDiscard({
        concealedCounts: counts,
        missingSuit: currentState.missingSuit,
        discardTile: currentState.selectedDiscard,
      });
      if (analysis.blockedReason) {
        return { kind: 'blocked', message: analysis.blockedReason, analysis, alreadyHu };
      }
      if (!analysis.waits.length) {
        return { kind: 'empty', message: notice + '打出后未听牌', analysis, alreadyHu };
      }
      return {
        kind: 'success',
        message: notice + `打出 ${tileLabel(analysis.discardTile)} 后已听牌。`,
        heading: `打出 ${tileLabel(analysis.discardTile)}后胡 ${analysis.waits.length} 种牌`,
        analysis,
        alreadyHu,
      };
    } catch (error) {
      return { kind: 'error', message: error.message || '计算失败，请检查手牌。', alreadyHu };
    }
  }
  function renderResults(view) {
    const ui = browserUI;
    elements.status.textContent = view.message;
    elements.status.className = `status${view.kind === 'success' || view.alreadyHu ? ' success' : ''}${view.kind === 'error' || view.kind === 'blocked' ? ' error' : ''}`;
    elements.summary.textContent = state.selectedDiscard === null
      ? '尚未选择弃牌。点击当前手牌选择拟打出的牌。'
      : `已选择打出 ${ui.tileLabel(state.selectedDiscard)}；手牌仍保留该牌，便于切换比较。`;
    if (view.kind === 'success') {
      elements.results.innerHTML = `<h3 class="discard-result-heading">${view.heading}</h3><div class="result-list">`
        + view.analysis.waits.map((wait) => waitCardMarkup(wait, ui)).join('') + '</div>';
    } else {
      elements.results.innerHTML = `<div class="empty-state${view.kind === 'blocked' ? ' discard-blocked' : ''}">${escapeHtml(view.message)}</div>`;
    }
  }
  function render() {
    const ui = browserUI;
    const counts = handCounts(state.hand);
    const selectionMode = browserMahjong.isValidDiscardCount(state.hand.length)
      && [0, 1, 2].includes(state.missingSuit);
    const forcedMissingSuit = selectionMode && hasMissingSuitTile(state);
    elements.count.textContent = `${state.hand.length} / 14`;
    elements.hand.style.setProperty('--hand-size', Math.max(1, state.hand.length));
    let selectedMarked = false;
    elements.hand.innerHTML = state.hand.map((tile, index) => {
      const suit = browserMahjong.tileSuit(tile);
      const selected = selectionMode && !selectedMarked && tile === state.selectedDiscard;
      if (selected) selectedMarked = true;
      const forcedDisabled = forcedMissingSuit && suit !== state.missingSuit;
      const warning = suit === state.missingSuit;
      const classes = ['tile'];
      if (selected) classes.push('selected-discard');
      if (forcedDisabled) classes.push('disabled-by-missing-suit');
      if (warning) classes.push('missing-warning');
      const tileButton = selectionMode
        ? `<button type="button" class="${classes.join(' ')}" data-discard-tile="${tile}" data-suit="${suit}"${forcedDisabled ? ' disabled' : ''} aria-pressed="${selected}" aria-label="选择打出${ui.tileLabel(tile)}">${ui.tileMarkup(tile)}${warning ? '<span class="tile-warning">缺</span>' : ''}</button>`
        : `<button type="button" class="${classes.join(' ')}" data-hand-index="${index}" data-suit="${suit}" aria-label="移除${ui.tileLabel(tile)}">${ui.tileMarkup(tile)}${warning ? '<span class="tile-warning">缺</span>' : ''}</button>`;
      return `<span class="hand-slot">${tileButton}${selectionMode ? `<button type="button" class="tile-remove" data-hand-index="${index}" aria-label="移除${ui.tileLabel(tile)}">×</button>` : ''}</span>`;
    }).join('');
    elements.picker.querySelectorAll('[data-tile]').forEach((button) => {
      const tile = Number(button.dataset.tile);
      button.disabled = state.hand.length >= 14 || counts[tile] >= 4;
      button.title = counts[tile] >= 4 ? '同一种牌最多四张' : '';
    });
    pageRoot.querySelectorAll('[data-discard-missing-suit]').forEach((button) => {
      button.setAttribute('aria-pressed', String(Number(button.dataset.discardMissingSuit) === state.missingSuit));
    });
    elements.undo.disabled = state.history.length === 0;
    elements.clear.disabled = !state.hand.length && state.missingSuit === null && state.selectedDiscard === null;
    renderResults(createAnalysisView(state, browserMahjong));
  }
  function onClick(event) {
    const button = event.target.closest('button');
    if (!button || !pageRoot.contains(button) || button.disabled) return;
    const data = button.dataset;
    if (data.tile !== undefined) {
      const tile = Number(data.tile);
      if (state.hand.length >= 14 || handCounts(state.hand)[tile] >= 4) return;
      change(() => { state.hand.push(tile); state.hand.sort((a, b) => a - b); });
    } else if (data.handIndex !== undefined) {
      const index = Number(data.handIndex);
      change(() => { state.hand.splice(index, 1); });
      uiFocus(index);
    } else if (data.discardTile !== undefined) {
      const tile = Number(data.discardTile);
      if (canSelectDiscard(state, tile) && state.selectedDiscard !== tile) change(() => { state.selectedDiscard = tile; });
    } else if (data.discardMissingSuit !== undefined) {
      const suit = Number(data.discardMissingSuit);
      if (state.missingSuit !== suit) change(() => { state.missingSuit = suit; });
    } else if (button === elements.undo) {
      const previous = state.history.pop();
      if (previous) Object.assign(state, previous);
      render();
    } else if (button === elements.clear) {
      change(() => { const history = state.history; Object.assign(state, createState(), { history }); });
    }
  }
  function uiFocus(index) {
    browserUI.restoreFocusAfterRemoval(elements.hand, '.hand-slot .tile', index,
      elements.picker.querySelector('[data-tile]:not([disabled])') || elements.picker.querySelector('[data-tile]'));
  }
  function mount(rootElement) {
    if (!windowRoot || !browserMahjong || !browserUI) throw new Error('出牌建议页面依赖未加载');
    unmount();
    pageRoot = rootElement;
    const find = (id) => pageRoot.querySelector(`#${id}`);
    elements = { picker: find('discard-tile-picker'), hand: find('discard-hand'), count: find('discard-hand-count'),
      status: find('discard-status'), summary: find('discard-selection-summary'), results: find('discard-results'),
      undo: find('discard-undo-button'), clear: find('discard-clear-button') };
    elements.picker.innerHTML = browserUI.pickerMarkup();
    pageRoot.addEventListener('click', onClick);
    render();
  }
  function unmount() {
    if (pageRoot) pageRoot.removeEventListener('click', onClick);
    pageRoot = null;
    elements = null;
  }
  return { mount, unmount, createState, handCounts, canSelectDiscard,
    reconcileSelectedDiscard, createAnalysisView, waitCardMarkup };
});
