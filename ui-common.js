(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.UICommon = api;
})(typeof window !== 'undefined' ? window : globalThis, function () {
  'use strict';
  const SUIT_NAMES = ['万', '筒', '条'];
  const MELD_SIZES = { pong: 3, openKong: 4, concealedKong: 4 };
  const MELD_NAMES = { pong: '碰', openKong: '明杠', concealedKong: '暗杠' };

  function tileLabel(tile) { return `${tile % 9 + 1}${SUIT_NAMES[Math.floor(tile / 9)]}`; }
  function tileMarkup(tile) {
    return `<span class="tile-rank">${tile % 9 + 1}</span><span class="tile-suit">${SUIT_NAMES[Math.floor(tile / 9)]}</span>`;
  }
  function countPhysicalTiles(hand, melds = []) {
    const counts = Array(27).fill(0);
    hand.forEach((tile) => { counts[tile] += 1; });
    melds.forEach((meld) => { counts[meld.tile] += MELD_SIZES[meld.type]; });
    return counts;
  }
  function pickerMarkup() {
    return SUIT_NAMES.map((name, suit) => `<div class="tile-row"><span class="suit-label">${name}子</span>`
      + Array.from({ length: 9 }, (_, rank) => {
        const tile = suit * 9 + rank;
        return `<button type="button" class="tile" data-tile="${tile}" data-suit="${suit}" aria-label="添加${tileLabel(tile)}">${tileMarkup(tile)}</button>`;
      }).join('') + '</div>').join('');
  }
  function meldMarkup(meld, index, missingSuit = null) {
    const warning = Math.floor(meld.tile / 9) === missingSuit;
    return `<article class="meld-card${warning ? ' missing-warning' : ''}">`
      + `<span class="tile" data-suit="${Math.floor(meld.tile / 9)}" aria-hidden="true">${tileMarkup(meld.tile)}</span>`
      + `<div><strong>${MELD_NAMES[meld.type]} · ${tileLabel(meld.tile)} × ${MELD_SIZES[meld.type]}</strong>`
      + (warning ? '<span class="warning-label">定缺副露，请移除或修正</span>' : '') + '</div>'
      + `<button type="button" class="text-button" data-remove-meld="${index}" aria-label="移除${MELD_NAMES[meld.type]}${tileLabel(meld.tile)}">移除</button></article>`;
  }
  function restoreFocusAfterRemoval(container, itemSelector, removedIndex, fallback) {
    const items = [...container.querySelectorAll(itemSelector)];
    const nearestItem = items[Math.min(Math.max(removedIndex, 0), items.length - 1)];
    const target = nearestItem || fallback;
    if (target && typeof target.focus === 'function') target.focus();
  }
  return { tileLabel, tileMarkup, countPhysicalTiles, pickerMarkup, meldMarkup, restoreFocusAfterRemoval };
});
