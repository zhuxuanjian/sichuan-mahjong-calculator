(function () {
  'use strict';
  const initialState = () => ({
    hand: [], melds: [], missingSuit: null,
    winMethod: 'discard', specialContext: 'normal', history: [],
  });
  const state = initialState();
  const meldSizes = { pong: 3, openKong: 4, concealedKong: 4 };
  const contexts = [
    { value: 'normal', label: '普通胡牌' },
    { value: 'kongDraw', label: '杠上花', method: 'selfDraw' },
    { value: 'kongDiscard', label: '杠上炮', method: 'discard' },
    { value: 'robKong', label: '抢杠胡', method: 'discard' },
    { value: 'lastTile', label: '海底捞月', method: 'selfDraw' },
  ];
  let root = null;
  let meldType = 'pong';
  let elements;
  const ui = UICommon;
  const target = () => 13 - 3 * state.melds.length;

  function saveHistory() {
    state.history.push({
      hand: state.hand.slice(), melds: state.melds.map((meld) => ({ ...meld })),
      missingSuit: state.missingSuit, winMethod: state.winMethod,
      specialContext: state.specialContext,
    });
  }
  function change(mutator) { saveHistory(); mutator(); render(); }
  function emptyResult(message) { elements.results.innerHTML = `<div class="empty-state">${message}</div>`; }

  function renderResults(counts) {
    elements.status.className = 'status';
    const missing = counts.flatMap((count, tile) => count && Mahjong.tileSuit(tile) === state.missingSuit
      ? [`${ui.tileLabel(tile)}${count > 1 ? `×${count}` : ''}`] : []);
    const missingMelds = state.melds.filter((meld) => Mahjong.tileSuit(meld.tile) === state.missingSuit);
    if (missing.length || missingMelds.length) {
      elements.status.textContent = (missing.length ? `请先打出：${missing.join('、')}。` : '')
        + (missingMelds.length ? '副露中也有定缺花色，请移除或修正对应副露。' : '');
      elements.status.classList.add('error');
      emptyResult('清除定缺花色后才能计算胡牌与番数。');
      return;
    }
    if (state.missingSuit === null) {
      elements.status.textContent = '请先选择定缺花色。';
      emptyResult('选择定缺并补齐手牌后，这里会显示可胡牌与番数。');
      return;
    }
    if (state.hand.length !== target()) {
      const difference = target() - state.hand.length;
      elements.status.textContent = difference > 0 ? `还差 ${difference} 张暗手牌。`
        : `副露已更新，请移除 ${-difference} 张多余暗手牌。`;
      if (difference < 0) elements.status.classList.add('error');
      emptyResult(`当前需要 ${target()} 张暗手牌，已有 ${state.melds.length} 组副露。`);
      return;
    }
    try {
      const wins = Mahjong.findWinningTiles({ concealedCounts: counts, melds: state.melds, missingSuit: state.missingSuit });
      if (!wins.length) {
        elements.status.textContent = '当前手牌未听牌。';
        emptyResult('没有找到可胡牌，可以移除一张牌重新组合。');
        return;
      }
      elements.status.textContent = `听牌！共可胡 ${wins.length} 种牌。`;
      elements.status.classList.add('success');
      elements.results.innerHTML = `<div class="result-list">${wins.map((win) => {
        const candidate = counts.slice();
        candidate[win.tile] += 1;
        const score = Scoring.scoreBestWin({
          concealedCounts: candidate, melds: state.melds, interpretations: win.interpretations,
          winMethod: state.winMethod, specialContext: state.specialContext,
        });
        return `<article class="result-card">`
          + `<span class="tile" data-suit="${Mahjong.tileSuit(win.tile)}" aria-hidden="true">${ui.tileMarkup(win.tile)}</span>`
          + `<div><strong>${ui.tileLabel(win.tile)} <span class="fan-badge">${score.finalFan} 番</span></strong>`
          + `<div class="pattern">${score.breakdown.map((item) => `${item.name} ${item.fan}番`).join(' · ')}</div>`
          + (score.capped ? `<div class="cap-note">原始 ${score.rawFan} 番 · 按 4 番封顶</div>` : '')
          + '</div></article>';
      }).join('')}</div>`;
    } catch (error) {
      elements.status.textContent = error.message || '计算失败，请检查手牌。';
      elements.status.classList.add('error');
      emptyResult('当前手牌不符合计算条件。');
    }
  }

  function render() {
    const physical = ui.countPhysicalTiles(state.hand, state.melds);
    const concealed = ui.countPhysicalTiles(state.hand);
    elements.count.textContent = `${state.hand.length} / ${target()}`;
    elements.hand.innerHTML = state.hand.map((tile, index) => {
      const warning = Mahjong.tileSuit(tile) === state.missingSuit;
      return `<button type="button" class="tile${warning ? ' missing-warning' : ''}" data-hand-index="${index}" data-suit="${Mahjong.tileSuit(tile)}" aria-label="移除${ui.tileLabel(tile)}${warning ? '，定缺牌' : ''}">`
        + ui.tileMarkup(tile) + (warning ? '<span class="tile-warning">缺</span>' : '') + '</button>';
    }).join('');
    elements.melds.innerHTML = state.melds.length
      ? state.melds.map((meld, index) => ui.meldMarkup(meld, index, state.missingSuit)).join('')
      : '<p class="hint">暂无副露；暗杠也请在这里录入。</p>';
    elements.picker.querySelectorAll('[data-tile]').forEach((button) => {
      const tile = Number(button.dataset.tile);
      button.disabled = state.hand.length >= target() || physical[tile] >= 4;
      button.title = physical[tile] >= 4 ? '手牌与副露合计最多四张' : '';
    });
    root.querySelectorAll('[data-missing-suit]').forEach((button) => {
      button.setAttribute('aria-pressed', String(Number(button.dataset.missingSuit) === state.missingSuit));
    });
    root.querySelectorAll('[data-meld-type]').forEach((button) => {
      button.setAttribute('aria-pressed', String(button.dataset.meldType === meldType));
    });
    [...elements.meldTile.options].forEach((option) => {
      option.disabled = physical[Number(option.value)] + meldSizes[meldType] > 4;
    });
    elements.addMeld.disabled = state.melds.length >= 4
      || physical[Number(elements.meldTile.value)] + meldSizes[meldType] > 4;
    elements.meldHint.textContent = state.melds.length >= 4 ? '最多录入 4 组副露。'
      : elements.addMeld.disabled ? '这组副露会超过四张上限，请换一种牌。'
        : `新增副露后，暗手牌目标减少 3 张；当前目标 ${target()} 张。`;
    elements.method.value = state.winMethod;
    elements.context.innerHTML = contexts.filter((context) => !context.method || context.method === state.winMethod)
      .map((context) => `<option value="${context.value}">${context.label}</option>`).join('');
    elements.context.value = state.specialContext;
    elements.undo.disabled = state.history.length === 0;
    elements.clear.disabled = !state.hand.length && !state.melds.length
      && state.missingSuit === null && state.winMethod === 'discard' && state.specialContext === 'normal';
    renderResults(concealed);
  }

  function onClick(event) {
    const button = event.target.closest('button');
    if (!button || !root.contains(button) || button.disabled) return;
    const data = button.dataset;
    if (data.tile !== undefined) {
      const tile = Number(data.tile);
      if (state.hand.length >= target() || ui.countPhysicalTiles(state.hand, state.melds)[tile] >= 4) return;
      change(() => { state.hand.push(tile); state.hand.sort((a, b) => a - b); });
    } else if (data.handIndex !== undefined) {
      change(() => { state.hand.splice(Number(data.handIndex), 1); });
    } else if (data.removeMeld !== undefined) {
      change(() => { state.melds.splice(Number(data.removeMeld), 1); });
    } else if (data.missingSuit !== undefined) {
      if (state.missingSuit !== Number(data.missingSuit)) change(() => { state.missingSuit = Number(data.missingSuit); });
    } else if (data.meldType !== undefined) {
      meldType = data.meldType; render();
    } else if (button === elements.addMeld) {
      const tile = Number(elements.meldTile.value);
      if (state.melds.length >= 4 || ui.countPhysicalTiles(state.hand, state.melds)[tile] + meldSizes[meldType] > 4) return;
      change(() => { state.melds.push({ type: meldType, tile }); });
    } else if (button === elements.undo) {
      const previous = state.history.pop();
      if (previous) Object.assign(state, previous);
      render();
    } else if (button === elements.clear) {
      change(() => { const history = state.history; Object.assign(state, initialState(), { history }); });
    }
  }

  function onChange(event) {
    if (event.target === elements.method) {
      change(() => {
        state.winMethod = elements.method.value;
        const context = contexts.find((item) => item.value === state.specialContext);
        if (context.method && context.method !== state.winMethod) state.specialContext = 'normal';
      });
    } else if (event.target === elements.context) {
      change(() => { state.specialContext = elements.context.value; });
    } else if (event.target === elements.meldTile) render();
  }

  function mount(rootElement) {
    unmount(); root = rootElement;
    const find = (id) => root.querySelector(`#${id}`);
    elements = {
      picker: find('tile-picker'), hand: find('hand'), count: find('hand-count'),
      status: find('status'), results: find('results'), undo: find('undo-button'),
      clear: find('clear-button'), melds: find('melds'), meldTile: find('meld-tile'),
      addMeld: find('add-meld'), meldHint: find('meld-hint'), method: find('win-method'), context: find('special-context'),
    };
    elements.picker.innerHTML = ui.pickerMarkup();
    elements.meldTile.innerHTML = Array.from({ length: 27 }, (_, tile) => `<option value="${tile}">${ui.tileLabel(tile)}</option>`).join('');
    root.addEventListener('click', onClick); root.addEventListener('change', onChange);
    render();
  }
  function unmount() {
    if (root) { root.removeEventListener('click', onClick); root.removeEventListener('change', onChange); }
    root = null;
  }
  window.HuPage = { mount, unmount };
})();
