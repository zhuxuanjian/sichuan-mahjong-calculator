(function (root, factory) {
  const api = factory(root, root && root.Mahjong, root && root.UICommon);
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.HuPage = api;
})(typeof window !== 'undefined' ? window : null, function (windowRoot, browserMahjong, browserUI) {
  'use strict';
  const state = createState();
  let pageRoot = null;
  let elements = null;

  function createState() {
    return { hand: [], missingSuit: null, history: [] };
  }
  function isReadyCount(count) {
    return count >= 1 && count <= 13 && count % 3 === 1;
  }
  function snapshot() {
    return { hand: state.hand.slice(), missingSuit: state.missingSuit };
  }
  function change(mutator) {
    state.history.push(snapshot());
    mutator();
    render();
  }
  function emptyResult(message) {
    elements.results.innerHTML = `<div class="empty-state">${message}</div>`;
  }
  function renderResults(counts) {
    const mahjong = browserMahjong;
    const ui = browserUI;
    elements.status.className = 'status';
    const validation = mahjong.validateCounts(counts);
    if (!validation.ok) {
      elements.status.textContent = validation.error;
      elements.status.classList.add('error');
      emptyResult('当前手牌不符合计算条件。');
      return;
    }
    if (state.hand.length === 0) {
      elements.status.textContent = '请添加手牌。';
      emptyResult('添加手牌后，这里会显示可胡牌。');
      return;
    }
    if (!mahjong.isValidHuCount(state.hand.length)) {
      elements.status.textContent = '当前手牌相公，本页支持 1、4、7、10、13 张。';
      elements.status.classList.add('error');
      emptyResult('调整手牌张数后再计算。');
      return;
    }
    if (state.missingSuit === null) {
      elements.status.textContent = '请先选择定缺花色。';
      emptyResult('选择定缺后，这里会显示可胡牌。');
      return;
    }
    const missing = counts.flatMap((count, tile) => count && mahjong.tileSuit(tile) === state.missingSuit
      ? [`${ui.tileLabel(tile)}${count > 1 ? `×${count}` : ''}`] : []);
    if (missing.length) {
      elements.status.textContent = `请先打出：${missing.join('、')}。`;
      elements.status.classList.add('error');
      emptyResult('清除定缺花色后才能计算。');
      return;
    }
    try {
      const wins = mahjong.findWinningTiles({ concealedCounts: counts, missingSuit: state.missingSuit });
      if (!wins.length) {
        elements.status.textContent = '当前手牌未听牌。';
        emptyResult('没有找到可胡牌，可以调整手牌重新组合。');
        return;
      }
      elements.status.textContent = `共可胡 ${wins.length} 种牌。`;
      elements.status.classList.add('success');
      elements.results.innerHTML = `<div class="result-list">${wins.map((win) =>
        `<article class="result-card"><span class="tile" data-suit="${mahjong.tileSuit(win.tile)}" aria-hidden="true">${ui.tileMarkup(win.tile)}</span><strong>${ui.tileLabel(win.tile)}</strong></article>`
      ).join('')}</div>`;
    } catch (error) {
      elements.status.textContent = error.message || '计算失败，请检查手牌。';
      elements.status.classList.add('error');
      emptyResult('当前手牌不符合计算条件。');
    }
  }
  function render() {
    const mahjong = browserMahjong;
    const ui = browserUI;
    const counts = ui.countTiles(state.hand);
    elements.count.textContent = `${state.hand.length} / 14`;
    elements.hand.style.setProperty('--hand-size', Math.max(1, state.hand.length));
    elements.hand.innerHTML = state.hand.map((tile, index) => {
      const warning = mahjong.tileSuit(tile) === state.missingSuit;
      return `<button type="button" class="tile${warning ? ' missing-warning' : ''}" data-hand-index="${index}" data-suit="${mahjong.tileSuit(tile)}" aria-label="移除${ui.tileLabel(tile)}${warning ? '，定缺牌' : ''}">`
        + ui.tileMarkup(tile) + (warning ? '<span class="tile-warning">缺</span>' : '') + '</button>';
    }).join('');
    elements.picker.querySelectorAll('[data-tile]').forEach((button) => {
      const tile = Number(button.dataset.tile);
      button.disabled = state.hand.length >= 14 || counts[tile] >= 4;
      button.title = counts[tile] >= 4 ? '同一种牌最多四张' : '';
    });
    pageRoot.querySelectorAll('[data-missing-suit]').forEach((button) => {
      button.setAttribute('aria-pressed', String(Number(button.dataset.missingSuit) === state.missingSuit));
    });
    elements.undo.disabled = state.history.length === 0;
    elements.clear.disabled = !state.hand.length && state.missingSuit === null;
    renderResults(counts);
  }
  function onClick(event) {
    const button = event.target.closest('button');
    if (!button || !pageRoot.contains(button) || button.disabled) return;
    const data = button.dataset;
    if (data.tile !== undefined) {
      const tile = Number(data.tile);
      if (state.hand.length >= 14 || browserUI.countTiles(state.hand)[tile] >= 4) return;
      change(() => { state.hand.push(tile); state.hand.sort((a, b) => a - b); });
    } else if (data.handIndex !== undefined) {
      const index = Number(data.handIndex);
      change(() => { state.hand.splice(index, 1); });
      browserUI.restoreFocusAfterRemoval(elements.hand, 'button.tile', index,
        elements.picker.querySelector('[data-tile]:not([disabled])') || elements.picker.querySelector('[data-tile]'));
    } else if (data.missingSuit !== undefined) {
      const suit = Number(data.missingSuit);
      if (state.missingSuit !== suit) change(() => { state.missingSuit = suit; });
    } else if (button === elements.undo) {
      const previous = state.history.pop();
      if (previous) Object.assign(state, previous);
      render();
    } else if (button === elements.clear) {
      change(() => { const history = state.history; Object.assign(state, createState(), { history }); });
    }
  }
  function mount(rootElement) {
    if (!windowRoot || !browserMahjong || !browserUI) throw new Error('胡牌页面依赖未加载');
    unmount();
    pageRoot = rootElement;
    const find = (id) => pageRoot.querySelector(`#${id}`);
    elements = { picker: find('tile-picker'), hand: find('hand'), count: find('hand-count'),
      status: find('status'), results: find('results'), undo: find('undo-button'), clear: find('clear-button') };
    elements.picker.innerHTML = browserUI.pickerMarkup();
    pageRoot.addEventListener('click', onClick);
    render();
  }
  function unmount() {
    if (pageRoot) pageRoot.removeEventListener('click', onClick);
    pageRoot = null;
    elements = null;
  }
  return { mount, unmount, createState, isReadyCount };
});
