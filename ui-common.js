(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.UICommon = api;
})(typeof window !== 'undefined' ? window : globalThis, function () {
  'use strict';
  const SUIT_NAMES = ['万', '筒', '条'];

  function tileLabel(tile) { return `${tile % 9 + 1}${SUIT_NAMES[Math.floor(tile / 9)]}`; }
  function tileMarkup(tile) {
    return `<span class="tile-rank">${tile % 9 + 1}</span><span class="tile-suit">${SUIT_NAMES[Math.floor(tile / 9)]}</span>`;
  }
  function countTiles(hand) {
    const counts = Array(27).fill(0);
    hand.forEach((tile) => { counts[tile] += 1; });
    return counts;
  }
  function pickerMarkup() {
    return SUIT_NAMES.map((name, suit) => `<div class="suit-group"><span class="suit-label">${name}子</span><div class="tile-row">`
      + Array.from({ length: 9 }, (_, rank) => {
        const tile = suit * 9 + rank;
        return `<button type="button" class="tile" data-tile="${tile}" data-suit="${suit}" aria-label="添加${tileLabel(tile)}">${tileMarkup(tile)}</button>`;
      }).join('') + '</div></div>').join('');
  }
  function restoreFocusAfterRemoval(container, itemSelector, removedIndex, fallback) {
    const items = [...container.querySelectorAll(itemSelector)];
    const nearestItem = items[Math.min(Math.max(removedIndex, 0), items.length - 1)];
    const target = nearestItem || fallback;
    if (target && typeof target.focus === 'function') target.focus();
  }
  return { tileLabel, tileMarkup, countTiles, pickerMarkup, restoreFocusAfterRemoval };
});
