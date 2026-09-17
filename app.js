(function () {
  'use strict';

  const SUIT_NAMES = ['万', '筒', '条'];
  const state = {
    hand: [],
    missingSuit: null,
    history: [],
  };

  const elements = {
    picker: document.querySelector('#tile-picker'),
    hand: document.querySelector('#hand'),
    count: document.querySelector('#hand-count'),
    status: document.querySelector('#status'),
    results: document.querySelector('#results'),
    undo: document.querySelector('#undo-button'),
    clear: document.querySelector('#clear-button'),
    missing: [...document.querySelectorAll('[data-missing-suit]')],
  };

  function tileLabel(tile) {
    return `${Mahjong.tileRank(tile)}${SUIT_NAMES[Mahjong.tileSuit(tile)]}`;
  }

  function tileMarkup(tile) {
    return `<span class="tile-rank">${Mahjong.tileRank(tile)}</span>`
      + `<span class="tile-suit">${SUIT_NAMES[Mahjong.tileSuit(tile)]}</span>`;
  }

  function createPicker() {
    elements.picker.innerHTML = SUIT_NAMES.map((suitName, suit) => {
      const buttons = Array.from({ length: 9 }, (_, index) => {
        const tile = suit * 9 + index;
        return `<button type="button" class="tile" data-tile="${tile}" data-suit="${suit}" aria-label="添加${tileLabel(tile)}">${tileMarkup(tile)}</button>`;
      }).join('');
      return `<div class="tile-row"><span class="suit-label">${suitName}子</span>${buttons}</div>`;
    }).join('');
  }

  function saveHistory() {
    state.history.push(state.hand.slice());
  }

  function addTile(tile) {
    const copies = state.hand.filter((item) => item === tile).length;
    if (state.hand.length >= 13 || copies >= 4) {
      return;
    }

    saveHistory();
    state.hand.push(tile);
    state.hand.sort((a, b) => a - b);
    render();
  }

  function removeTileAt(index) {
    if (index < 0 || index >= state.hand.length) {
      return;
    }

    saveHistory();
    state.hand.splice(index, 1);
    render();
  }

  function undo() {
    const previous = state.history.pop();
    if (previous) {
      state.hand = previous;
      render();
    }
  }

  function clearHand() {
    if (state.hand.length === 0) {
      return;
    }

    saveHistory();
    state.hand = [];
    render();
  }

  function handToCounts() {
    const counts = Array(27).fill(0);
    state.hand.forEach((tile) => {
      counts[tile] += 1;
    });
    return counts;
  }

  function renderEmptyResult(message) {
    elements.results.innerHTML = `<div class="empty-state">${message}</div>`;
  }

  function renderResults() {
    elements.status.classList.remove('error', 'success');

    if (state.missingSuit === null) {
      elements.status.textContent = '请先选择定缺花色。';
      renderEmptyResult('选择定缺并凑齐 13 张牌后，这里会显示计算结果。');
      return;
    }

    if (state.hand.length < 13) {
      elements.status.textContent = `还差 ${13 - state.hand.length} 张牌。`;
      renderEmptyResult('继续添加手牌。');
      return;
    }

    try {
      const wins = Mahjong.findWinningTiles(handToCounts(), state.missingSuit);
      if (wins.length === 0) {
        elements.status.textContent = '当前手牌未听牌。';
        renderEmptyResult('没有找到可胡牌，可以移除一张牌重新组合。');
        return;
      }

      elements.status.textContent = `听牌！共可胡 ${wins.length} 种牌。`;
      elements.status.classList.add('success');
      elements.results.innerHTML = `<div class="result-list">${wins.map((win) => {
        const dragon = win.dragonCount > 1 ? ` · ${win.dragonCount}组龙` : '';
        return `<article class="result-card">`
          + `<span class="tile" data-suit="${Mahjong.tileSuit(win.tile)}" aria-hidden="true">${tileMarkup(win.tile)}</span>`
          + `<div><strong>${tileLabel(win.tile)}</strong>`
          + `<div class="pattern">${win.patterns.join(' · ')}${dragon}</div>`
          + `<span class="remaining">理论剩余 ${win.remaining} 张</span></div>`
          + `</article>`;
      }).join('')}</div>`;
    } catch (error) {
      elements.status.textContent = error.message || '计算出现错误，请移除一张牌后重试。';
      elements.status.classList.add('error');
      renderEmptyResult('当前手牌不符合计算条件。');
    }
  }

  function render() {
    elements.count.textContent = `${state.hand.length} / 13`;
    elements.hand.innerHTML = state.hand.map((tile, index) => (
      `<button type="button" class="tile" data-hand-index="${index}" data-suit="${Mahjong.tileSuit(tile)}" aria-label="移除${tileLabel(tile)}">${tileMarkup(tile)}</button>`
    )).join('');

    document.querySelectorAll('#tile-picker [data-tile]').forEach((button) => {
      const tile = Number(button.dataset.tile);
      const copies = state.hand.filter((item) => item === tile).length;
      button.disabled = state.hand.length >= 13 || copies >= 4;
      button.title = copies >= 4 ? '同一种牌最多四张' : '';
    });

    elements.missing.forEach((button) => {
      const selected = Number(button.dataset.missingSuit) === state.missingSuit;
      button.setAttribute('aria-checked', String(selected));
    });

    elements.undo.disabled = state.history.length === 0;
    elements.clear.disabled = state.hand.length === 0;
    renderResults();
  }

  elements.picker.addEventListener('click', (event) => {
    const button = event.target.closest('[data-tile]');
    if (button && !button.disabled) {
      addTile(Number(button.dataset.tile));
    }
  });

  elements.hand.addEventListener('click', (event) => {
    const button = event.target.closest('[data-hand-index]');
    if (button) {
      removeTileAt(Number(button.dataset.handIndex));
    }
  });

  elements.missing.forEach((button) => {
    button.addEventListener('click', () => {
      state.missingSuit = Number(button.dataset.missingSuit);
      render();
    });
  });

  elements.undo.addEventListener('click', undo);
  elements.clear.addEventListener('click', clearHand);

  createPicker();
  render();
})();

