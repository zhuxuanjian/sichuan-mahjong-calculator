(function (root, factory) {
  const api = factory(root, root && root.Settlement);
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.SettlementPage = api;
})(typeof window !== 'undefined' ? window : null, function (windowRoot, browserSettlement) {
  'use strict';

  const DEFAULT_NAMES = ['玩家1', '玩家2', '玩家3', '玩家4'];
  const EVENT_NAMES = {
    concealedKong: '暗杠', addedKong: '补杠', discardKong: '直杠',
    discardWin: '点炮胡', selfDraw: '自摸胡',
  };
  const FAN_OPTIONS = [0, 1, 2, 3, 4]
    .map((fan) => `<option value="${fan}">${fan} 番（${2 ** fan} 分）</option>`).join('');
  let root = null;
  let elements = null;
  let state = null;
  let formDraft = {};
  let formError = '';
  let mutationMessage = '';

  function deepCopy(value) {
    return JSON.parse(JSON.stringify(value));
  }

  function createState(players) {
    return {
      players: deepCopy(players || DEFAULT_NAMES.map((name, index) => ({ id: `p${index + 1}`, name }))),
      events: [],
      history: [],
      draftType: 'concealedKong',
    };
  }

  function snapshot(state) {
    return {
      players: deepCopy(state.players),
      events: deepCopy(state.events),
      draftType: state.draftType,
    };
  }

  function saveHistory(state) {
    state.history.push(snapshot(state));
  }

  function buildEvent(type, values) {
    if (type === 'concealedKong' || type === 'addedKong') {
      return { type, actorId: values.actorId };
    }
    if (type === 'discardKong') {
      return { type, actorId: values.actorId, payerId: values.payerId };
    }
    if (type === 'discardWin') {
      return {
        type,
        payerId: values.payerId,
        winners: values.winners.map((winner) => ({
          playerId: winner.playerId,
          fan: Number(winner.fan),
        })),
      };
    }
    return { type: 'selfDraw', winnerId: values.winnerId, fan: Number(values.fan) };
  }

  function activePlayersBeforeNext(state, engine) {
    const replay = engine.replay(state.players, state.events);
    if (!replay.ok) return [];
    return replay.players.filter((player) => !player.won);
  }

  function appendEvent(state, event, engine) {
    const candidate = state.events.concat(deepCopy(event));
    const replay = engine.replay(state.players, candidate);
    if (!replay.ok) return replay;
    saveHistory(state);
    state.events = candidate;
    return replay;
  }

  function moveEvent(state, index, direction, engine) {
    const destination = index + direction;
    if (index < 0 || index >= state.events.length || destination < 0 || destination >= state.events.length) {
      return { ok: false, error: { index, message: '事件已在边界，无法继续移动' } };
    }
    const candidate = deepCopy(state.events);
    [candidate[index], candidate[destination]] = [candidate[destination], candidate[index]];
    const replay = engine.replay(state.players, candidate);
    if (!replay.ok) return replay;
    saveHistory(state);
    state.events = candidate;
    return replay;
  }

  function deleteEvent(state, index, engine) {
    if (index < 0 || index >= state.events.length) {
      return { ok: false, error: { index, message: '找不到要删除的事件' } };
    }
    saveHistory(state);
    state.events.splice(index, 1);
    return engine.replay(state.players, state.events);
  }

  function undo(state) {
    const previous = state.history.pop();
    if (!previous) return false;
    state.players = deepCopy(previous.players);
    state.events = deepCopy(previous.events);
    state.draftType = previous.draftType;
    return true;
  }

  function clearState(state) {
    saveHistory(state);
    state.players = state.players.map((player, index) => ({
      id: player.id,
      name: DEFAULT_NAMES[index],
    }));
    state.events = [];
    state.draftType = 'concealedKong';
  }

  function createViewModel(state, engine) {
    const replay = engine.replay(state.players, state.events);
    const names = new Map(state.players.map((player) => [player.id, player.name]));
    const entries = state.events.map((event, index) => {
      if (index < replay.eventResults.length) {
        const result = replay.eventResults[index];
        return {
          event,
          status: 'valid',
          transfers: result.transfers.map((transfer) => ({
            from: names.get(transfer.fromId),
            to: names.get(transfer.toId),
            amount: transfer.amount,
          })),
          balances: state.players.map((player) => ({
            id: player.id,
            name: player.name,
            net: result.balancesAfter[player.id],
          })),
        };
      }
      if (!replay.ok && index === replay.error.index) {
        return { event, status: 'invalid', error: replay.error.message, transfers: [], balances: [] };
      }
      return { event, status: 'pending', transfers: [], balances: [] };
    });
    return {
      ok: replay.ok,
      players: replay.players,
      entries,
      error: replay.error,
      finalLabel: replay.ok ? '最终收支' : null,
    };
  }

  function escapeHtml(value) {
    return String(value).replace(/[&<>"']/g, (character) => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
    })[character]);
  }

  function signed(value) {
    if (value < 0) return `−${Math.abs(value)}`;
    return `+${value}`;
  }

  function amountClass(value) {
    if (value > 0) return 'amount-positive';
    if (value < 0) return 'amount-negative';
    return 'amount-neutral';
  }

  function optionsMarkup(players, selected, excludedIds = []) {
    const excluded = new Set(excludedIds);
    const options = players.filter((player) => !excluded.has(player.id));
    if (!options.length) return '<option value="">无可选玩家</option>';
    return options.map((player) => `<option value="${escapeHtml(player.id)}"${player.id === selected ? ' selected' : ''}>${escapeHtml(player.name)}</option>`).join('');
  }

  function choosePlayer(players, preferred, excludedIds = []) {
    const excluded = new Set(excludedIds);
    const available = players.filter((player) => !excluded.has(player.id));
    if (available.some((player) => player.id === preferred)) return preferred;
    return available.length ? available[0].id : '';
  }

  function normalizeFormDraft(activePlayers) {
    const type = state.draftType;
    if (type === 'concealedKong' || type === 'addedKong') {
      formDraft.actorId = choosePlayer(activePlayers, formDraft.actorId);
      return;
    }
    if (type === 'discardKong') {
      formDraft.actorId = choosePlayer(activePlayers, formDraft.actorId);
      formDraft.payerId = choosePlayer(activePlayers, formDraft.payerId, [formDraft.actorId]);
      return;
    }
    if (type === 'selfDraw') {
      formDraft.winnerId = choosePlayer(activePlayers, formDraft.winnerId);
      formDraft.fan = String([0, 1, 2, 3, 4].includes(Number(formDraft.fan)) ? formDraft.fan : 0);
      return;
    }

    formDraft.payerId = choosePlayer(activePlayers, formDraft.payerId);
    if (!Array.isArray(formDraft.winners) || !formDraft.winners.length) {
      formDraft.winners = [{ playerId: '', fan: '0' }];
    }
    const maximum = Math.max(1, activePlayers.length - 1);
    formDraft.winners = formDraft.winners.slice(0, maximum);
    const used = [];
    formDraft.winners.forEach((winner) => {
      winner.playerId = choosePlayer(activePlayers, winner.playerId, [formDraft.payerId, ...used]);
      winner.fan = String([0, 1, 2, 3, 4].includes(Number(winner.fan)) ? winner.fan : 0);
      if (winner.playerId) used.push(winner.playerId);
    });
  }

  function readFormDraft() {
    const form = elements.form;
    const value = (name) => {
      const control = form.elements.namedItem(name);
      return control ? control.value : '';
    };
    if (state.draftType === 'concealedKong' || state.draftType === 'addedKong') {
      formDraft = { actorId: value('actorId') };
    } else if (state.draftType === 'discardKong') {
      formDraft = { actorId: value('actorId'), payerId: value('payerId') };
    } else if (state.draftType === 'selfDraw') {
      formDraft = { winnerId: value('winnerId'), fan: value('fan') };
    } else {
      formDraft = {
        payerId: value('payerId'),
        winners: [...elements.fields.querySelectorAll('[data-winner-row]')].map((row) => ({
          playerId: row.querySelector('[name="winnerId"]').value,
          fan: row.querySelector('[name="winnerFan"]').value,
        })),
      };
    }
  }

  function renderEventForm() {
    const active = activePlayersBeforeNext(state, browserSettlement);
    normalizeFormDraft(active);
    const type = state.draftType;
    if (type === 'concealedKong' || type === 'addedKong') {
      elements.fields.innerHTML = `<label>杠牌玩家<select name="actorId" required>${optionsMarkup(active, formDraft.actorId)}</select></label>`;
    } else if (type === 'discardKong') {
      elements.fields.innerHTML = '<div class="settlement-form-grid">'
        + `<label>杠牌玩家<select name="actorId" required>${optionsMarkup(active, formDraft.actorId)}</select></label>`
        + `<label>点杠玩家<select name="payerId" required>${optionsMarkup(active, formDraft.payerId, [formDraft.actorId])}</select></label>`
        + '</div>';
    } else if (type === 'selfDraw') {
      elements.fields.innerHTML = '<div class="settlement-form-grid">'
        + `<label>自摸玩家<select name="winnerId" required>${optionsMarkup(active, formDraft.winnerId)}</select></label>`
        + `<label>最终番数<select name="fan" required>${FAN_OPTIONS}</select></label>`
        + '</div>';
      elements.fields.querySelector('[name="fan"]').value = formDraft.fan;
    } else {
      const selectedWinners = formDraft.winners.map((winner) => winner.playerId);
      const winnerRows = formDraft.winners.map((winner, index) => {
        const excluded = [formDraft.payerId, ...selectedWinners.filter((id, otherIndex) => id && otherIndex !== index)];
        return `<div class="winner-row" data-winner-row="${index}">`
          + `<label>胡牌玩家 ${index + 1}<select name="winnerId" required>${optionsMarkup(active, winner.playerId, excluded)}</select></label>`
          + `<label>玩家 ${index + 1} 最终番数<select name="winnerFan" required>${FAN_OPTIONS}</select></label>`
          + (formDraft.winners.length > 1 ? `<button type="button" class="text-button danger" data-remove-winner="${index}">移除</button>` : '')
          + '</div>';
      }).join('');
      elements.fields.innerHTML = `<label>点炮玩家<select name="payerId" required>${optionsMarkup(active, formDraft.payerId)}</select></label>`
        + `<div class="winner-list">${winnerRows}</div>`
        + `<button type="button" class="text-button" data-add-winner${formDraft.winners.length >= Math.max(0, active.length - 1) ? ' disabled' : ''}>增加胡牌玩家</button>`;
      elements.fields.querySelectorAll('[name="winnerFan"]').forEach((select, index) => {
        select.value = formDraft.winners[index].fan;
      });
    }

    const needsTwoPlayers = type === 'discardKong' || type === 'discardWin';
    elements.addEvent.disabled = !active.length || (needsTwoPlayers && active.length < 2);
    if (!active.length && !formError) {
      formError = createViewModel(state, browserSettlement).ok
        ? '没有仍在对局中的玩家，无法继续新增事件。'
        : '流水含非法事件，请先删除或调整该事件。';
    }
    elements.formError.textContent = formError;
    elements.formError.className = `status${formError ? ' error' : ''}`;
  }

  function describeEvent(event, playerNames) {
    const name = (id) => playerNames.get(id) || id || '未选择';
    if (event.type === 'concealedKong' || event.type === 'addedKong') {
      return `${name(event.actorId)} · ${EVENT_NAMES[event.type]}`;
    }
    if (event.type === 'discardKong') {
      return `${name(event.payerId)} 点杠给 ${name(event.actorId)}`;
    }
    if (event.type === 'selfDraw') {
      return `${name(event.winnerId)} 自摸 · ${event.fan} 番`;
    }
    return `${name(event.payerId)} 点炮 · ${event.winners.map((winner) => `${name(winner.playerId)} ${winner.fan} 番`).join('、')}`;
  }

  function renderBalances(view) {
    elements.totalLabel.textContent = view.finalLabel || '有效流水暂计';
    elements.totalLabel.classList.toggle('counter-warning', !view.ok);
    elements.balances.innerHTML = view.players.map((player) => `<article class="balance-card${player.won ? ' player-won' : ''}">`
      + `<div class="balance-card-heading"><strong>${escapeHtml(player.name)}</strong><span>${player.won ? '已胡' : '进行中'}</span></div>`
      + `<div class="balance-breakdown"><span>收入 <b class="amount-positive">+${player.income}</b></span>`
      + `<span>支出 <b class="amount-negative">−${player.expense}</b></span></div>`
      + `<div class="balance-net ${amountClass(player.net)}">净收支 ${signed(player.net)}</div>`
      + '</article>').join('');
    const total = view.players.reduce((sum, player) => sum + player.net, 0);
    if (mutationMessage) {
      elements.replayStatus.textContent = mutationMessage;
      elements.replayStatus.className = 'status error';
    } else if (view.ok) {
      elements.replayStatus.textContent = `全部事件有效 · 净收支合计 ${signed(total)}`;
      elements.replayStatus.className = 'status success';
    } else {
      elements.replayStatus.textContent = `第 ${view.error.index + 1} 条事件无效：${view.error.message}。已停止计算，未展示最终结果。`;
      elements.replayStatus.className = 'status error';
    }
  }

  function renderLedger(view) {
    if (!view.entries.length) {
      elements.ledger.innerHTML = '<div class="empty-state">还没有事件。新增暗杠、补杠、直杠或胡牌后，这里会逐笔显示付款。</div>';
      return;
    }
    const names = new Map(state.players.map((player) => [player.id, player.name]));
    elements.ledger.innerHTML = view.entries.map((entry, index) => {
      const controls = `<div class="ledger-actions">`
        + `<button type="button" class="text-button" data-move-event="${index}" data-direction="-1"${index === 0 ? ' disabled' : ''}>上移</button>`
        + `<button type="button" class="text-button" data-move-event="${index}" data-direction="1"${index === view.entries.length - 1 ? ' disabled' : ''}>下移</button>`
        + `<button type="button" class="text-button danger" data-delete-event="${index}">删除</button></div>`;
      let body;
      if (entry.status === 'valid') {
        const transfers = entry.transfers.length
          ? `<ul class="transfer-list">${entry.transfers.map((transfer) => `<li>${escapeHtml(transfer.from)} → ${escapeHtml(transfer.to)}：${transfer.amount}</li>`).join('')}</ul>`
          : '<p class="hint ledger-note">本事件没有产生转账。</p>';
        const balances = `<div class="event-balances" aria-label="事件后余额">${entry.balances.map((balance) => `<span><b>${escapeHtml(balance.name)}</b> ${signed(balance.net)}</span>`).join('')}</div>`;
        body = transfers + balances;
      } else if (entry.status === 'invalid') {
        body = `<p class="status error">此事件无效：${escapeHtml(entry.error)}。请删除或调整顺序。</p>`;
      } else {
        body = '<p class="status error">因前序事件无效，本事件尚未计算。</p>';
      }
      return `<article class="ledger-event ledger-${entry.status}"><header><div><span class="event-index">${index + 1}</span>`
        + `<div><strong>${escapeHtml(EVENT_NAMES[entry.event.type] || '未知事件')}</strong><p>${escapeHtml(describeEvent(entry.event, names))}</p></div></div>${controls}</header>${body}</article>`;
    }).join('');
  }

  function render() {
    const view = createViewModel(state, browserSettlement);
    elements.nameInputs.forEach((input) => {
      const player = state.players.find((item) => item.id === input.dataset.playerId);
      input.value = player ? player.name : '';
      input.setCustomValidity('');
    });
    elements.eventType.value = state.draftType;
    elements.undo.disabled = state.history.length === 0;
    elements.clear.disabled = !state.events.length
      && state.players.every((player, index) => player.name === DEFAULT_NAMES[index]);
    renderBalances(view);
    renderLedger(view);
    renderEventForm();
  }

  function showFormError(message, control) {
    formError = message;
    elements.formError.textContent = message;
    elements.formError.className = 'status error';
    if (control) control.focus();
  }

  function onSubmit(event) {
    if (event.target !== elements.form) return;
    event.preventDefault();
    const blankName = elements.nameInputs.find((input) => !input.value.trim());
    if (blankName) {
      blankName.setCustomValidity('请输入玩家名称');
      showFormError('请先输入所有玩家名称。', blankName);
      return;
    }
    readFormDraft();
    const firstEmpty = [...elements.form.querySelectorAll('[required]')].find((control) => !control.value);
    if (firstEmpty) {
      showFormError('请完成所有参与者和番数选择。', firstEmpty);
      return;
    }
    const candidate = buildEvent(state.draftType, formDraft);
    const result = appendEvent(state, candidate, browserSettlement);
    if (!result.ok) {
      showFormError(result.error.message, elements.fields.querySelector('select'));
      return;
    }
    formDraft = {};
    formError = '';
    mutationMessage = '';
    render();
  }

  function onClick(event) {
    const button = event.target.closest('button');
    if (!button || !root.contains(button) || button.disabled) return;
    if (button.dataset.addWinner !== undefined) {
      readFormDraft();
      formDraft.winners.push({ playerId: '', fan: '0' });
      formError = '';
      renderEventForm();
    } else if (button.dataset.removeWinner !== undefined) {
      readFormDraft();
      formDraft.winners.splice(Number(button.dataset.removeWinner), 1);
      formError = '';
      renderEventForm();
    } else if (button.dataset.moveEvent !== undefined) {
      const result = moveEvent(state, Number(button.dataset.moveEvent), Number(button.dataset.direction), browserSettlement);
      mutationMessage = result.ok ? '' : `无法调整顺序：第 ${result.error.index + 1} 条事件${result.error.message}。原顺序已保留。`;
      if (result.ok) formError = '';
      render();
    } else if (button.dataset.deleteEvent !== undefined) {
      const result = deleteEvent(state, Number(button.dataset.deleteEvent), browserSettlement);
      mutationMessage = result.ok ? '' : `删除已保留，但第 ${result.error.index + 1} 条事件无效：${result.error.message}。`;
      formError = '';
      render();
    } else if (button === elements.undo) {
      if (undo(state)) {
        formDraft = {};
        formError = '';
        mutationMessage = '';
        render();
      }
    } else if (button === elements.clear && windowRoot.confirm('确定清空整局、玩家名称和全部事件吗？此操作可以撤销。')) {
      clearState(state);
      formDraft = {};
      formError = '';
      mutationMessage = '';
      render();
    }
  }

  function onChange(event) {
    const target = event.target;
    if (target === elements.eventType) {
      state.draftType = target.value;
      formDraft = {};
      formError = '';
      renderEventForm();
    } else if (target.dataset.playerId !== undefined) {
      const name = target.value.trim();
      if (!name) {
        target.setCustomValidity('请输入玩家名称');
        target.reportValidity();
        return;
      }
      target.setCustomValidity('');
      const player = state.players.find((item) => item.id === target.dataset.playerId);
      if (player && player.name !== name) {
        saveHistory(state);
        player.name = name;
        mutationMessage = '';
        render();
      }
    } else if (elements.fields.contains(target)) {
      readFormDraft();
      formError = '';
      renderEventForm();
    }
  }

  function mount(rootElement) {
    if (!windowRoot || !browserSettlement) throw new Error('结算页面只能在浏览器中挂载');
    unmount();
    root = rootElement;
    if (!state) state = createState();
    const find = (id) => root.querySelector(`#${id}`);
    elements = {
      nameInputs: [...root.querySelectorAll('[data-player-id]')],
      balances: find('settlement-balances'), totalLabel: find('settlement-total-label'),
      replayStatus: find('settlement-replay-status'), form: find('settlement-event-form'),
      eventType: find('settlement-event-type'), fields: find('settlement-event-fields'),
      formError: find('settlement-form-error'), addEvent: find('settlement-add-event'),
      ledger: find('settlement-ledger'), undo: find('settlement-undo'), clear: find('settlement-clear'),
    };
    root.addEventListener('submit', onSubmit);
    root.addEventListener('click', onClick);
    root.addEventListener('change', onChange);
    render();
  }

  function unmount() {
    if (root) {
      root.removeEventListener('submit', onSubmit);
      root.removeEventListener('click', onClick);
      root.removeEventListener('change', onChange);
    }
    root = null;
    elements = null;
  }

  return {
    createState,
    buildEvent,
    activePlayersBeforeNext,
    appendEvent,
    moveEvent,
    deleteEvent,
    undo,
    clearState,
    createViewModel,
    mount,
    unmount,
  };
});
