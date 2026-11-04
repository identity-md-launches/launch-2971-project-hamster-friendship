(function () {
  'use strict';
  var save = window.HamsterSave, rules = window.HamsterRules;
  var dialog = /** @type {HTMLDialogElement} */ (document.getElementById('player-dialog'));
  var title = document.getElementById('panel-title'), content = document.getElementById('panel-content');
  var opener = null, panel = '', generation = 0;
  /** @template {keyof HTMLElementTagNameMap} K @param {K} tag @param {string} [text] @param {string} [className] @returns {HTMLElementTagNameMap[K]} */
  function el(tag, text, className) {
    var node = document.createElement(tag); if (text) node.textContent = text; if (className) node.className = className; return node;
  }
  function action(text, fn, style = 'btn-secondary') { var b = el('button', text, 'btn ' + style); b.type = 'button'; b.addEventListener('click', fn); return b; }
  function message(text, error = false) { var p = el('p', text, error ? 'error' : 'panel-note'); p.setAttribute('role', error ? 'alert' : 'status'); return p; }
  function summary() {
    var state = save.snapshot();
    document.getElementById('hud-sqk').textContent = state.profile.sqk.toLocaleString();
    document.getElementById('hud-pending').textContent = state.pendingCoins ? '(+' + state.pendingCoins + ' pending)' : '';
    document.getElementById('save-summary').textContent = state.profile.name + ' · ' + (!state.storageOK ? 'Browser storage unavailable; keep this page open.' : state.cloud ? state.playingGuest ? 'Guest run · restart the map for cloud credit' : state.pendingEvents ? 'Cloud save pending · open Profile to retry' : 'Cloud saved' : 'Guest progress · this device only');
    if (panel === 'profile') {
      var values = { sqk: state.profile.sqk.toLocaleString(), total_score: state.profile.total_score.toLocaleString(), highest_map: String(state.profile.highest_map), purchases: String(state.profile.purchases.length) };
      Object.keys(values).forEach(function (key) { var node = document.getElementById('profile-' + key); if (node) node.textContent = values[key]; });
      var cloudStatus = document.getElementById('profile-save-state'); if (cloudStatus) cloudStatus.textContent = state.status;
      var accountInfo = document.getElementById('profile-account-info');
      if (accountInfo) accountInfo.textContent = state.cloud ? 'This cloud profile uses a private browser session, separate from your wallet. Keep browser data to retain access. Guest balances are never imported into the global board.' : state.configured ? 'Cloud play is unavailable. You can play and shop as a guest on this device while the connection is restored.' : 'The owner has not connected Supabase yet. You can still play, collect SQK and shop as a guest on this device. Global rankings are unavailable until cloud setup is complete.';
    }
    var balance = document.getElementById('market-balance'); if (balance) balance.textContent = state.profile.sqk.toLocaleString() + ' SQK available' + (state.pendingCoins ? ' · ' + state.pendingCoins + ' awaiting cloud save' : '');
  }
  function profilePanel() {
    var state = save.snapshot(), p = state.profile;
    title.textContent = 'Player profile'; content.replaceChildren();
    var form = el('form', '', 'profile-form');
    var label = el('label', 'Player name'); label.htmlFor = 'player-name';
    var input = el('input'); input.id = 'player-name'; input.name = 'nickname'; input.type = 'text'; input.setAttribute('autocomplete', 'nickname'); input.value = p.name === 'Guest' ? '' : p.name; input.maxLength = 20; input.minLength = 2; input.required = true;
    var hint = el('p', '2–20 letters, numbers, spaces, underscores or hyphens.', 'panel-note'); hint.id = 'name-hint'; input.setAttribute('aria-describedby', 'name-hint name-result');
    var result = message(''); result.id = 'name-result';
    var submit = el('button', 'Save name', 'btn btn-primary'); submit.type = 'submit';
    form.append(label, input, hint, submit, result);
    form.addEventListener('submit', async function (event) {
      event.preventDefault(); submit.disabled = true; submit.textContent = 'Saving name…'; result.className = 'panel-note'; result.textContent = '';
      try {
        await save.saveName(input.value); input.removeAttribute('aria-invalid'); result.textContent = state.cloud ? 'Name saved to your cloud profile.' : 'Name saved on this device.';
      } catch (error) { input.setAttribute('aria-invalid', 'true'); result.className = 'error'; result.textContent = error.message; input.focus(); }
      finally { submit.disabled = false; submit.textContent = 'Save name'; }
    });
    var stats = el('dl', '', 'profile-stats');
    [['SQK balance', p.sqk.toLocaleString(), 'sqk'], ['Lifetime score', p.total_score.toLocaleString(), 'total_score'], ['Deepest map', String(p.highest_map), 'highest_map'], ['Owned items', String(p.purchases.length), 'purchases']].forEach(function (pair) { var row = el('div'), value = el('dd', pair[1]); value.id = 'profile-' + pair[2]; row.append(el('dt', pair[0]), value); stats.append(row); });
    var cloudStatus = el('p', state.status, 'panel-note'); cloudStatus.id = 'profile-save-state'; cloudStatus.setAttribute('role', 'status');
    var accountInfo = el('p', '', 'panel-note'); accountInfo.id = 'profile-account-info';
    content.append(form, stats, cloudStatus, accountInfo);
    if (!state.storageOK) content.append(message('Browser storage is unavailable. Enable site storage to keep progress after closing this page.', true));
    if (state.configured) {
      var retryResult = message('');
      var retry = action('Retry cloud save', async function () {
        retry.disabled = true; retryResult.textContent = 'Connecting…';
        try { await save.retry(); retryResult.textContent = ''; }
        finally { retry.disabled = false; }
      });
      content.append(retry, retryResult);
    }
    summary();
  }
  function itemArt(item) {
    var box = el('span', '', 'item-art'); box.setAttribute('aria-hidden', 'true');
    var svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg'); svg.setAttribute('viewBox', '0 0 24 24'); svg.setAttribute('width', '40'); svg.setAttribute('height', '40');
    var path = document.createElementNS(svg.namespaceURI, 'path');
    path.setAttribute('fill', item.color);
    path.setAttribute('d', item.slot === 'shirt' ? 'M6 3h4v2h4V3h4l5 5-4 4-2-2v11H7V10l-2 2-4-4z' : item.slot === 'vest' ? 'M7 2h3v5h4V2h3l4 7-4 3v10H7V12L3 9z' : 'M11 1h3v3h3v2h3v3h2v10h-3v3H5v-3H2V9h2V6h3V4h4z');
    svg.append(path); var detail = document.createElementNS(svg.namespaceURI, 'path'); detail.setAttribute('fill', '#352216'); detail.setAttribute('d', item.slot === 'skill' ? item.id === 'charged' ? 'm14 4-8 10h6l-2 7 9-12h-6z' : item.id === 'piercing' ? 'M4 11h10V7l7 6-7 6v-4H4z' : 'M5 5h4v9h8v-4l5 6-5 6v-4H5z' : item.slot === 'vest' ? 'M11 7h2v15h-2z' : 'M5 17h14v3H5z'); svg.append(detail); box.append(svg); return box;
  }
  function shopPanel(keepScroll = false) {
    var top = dialog.scrollTop;
    title.textContent = 'Marketplace'; content.replaceChildren();
    var state = save.snapshot(), p = state.profile;
    var balance = el('p', p.sqk.toLocaleString() + ' SQK available' + (state.pendingCoins ? ' · ' + state.pendingCoins + ' awaiting cloud save' : ''), 'balance-label'); balance.id = 'market-balance'; content.append(balance);
    content.append(el('p', 'Spend coins collected in the forest. Purchases survive death. Skills stack and apply when you start or restart a map.', 'panel-note'));
    var feedback = message(''); feedback.id = 'shop-feedback'; content.append(feedback);
    var list = el('div', '', 'shop-list');
    rules.catalogue.forEach(function (item) {
      var row = el('article', '', 'shop-item'); row.append(itemArt(item));
      var details = el('div', '', 'item-description'); details.append(el('h3', item.name), el('p', item.description, 'panel-note')); row.append(details);
      var owned = p.purchases.includes(item.id), equipped = p.cosmetics[item.slot] === item.id;
      var rowResult = message('', true); rowResult.className = 'error item-feedback'; rowResult.id = 'item-error-' + item.id;
      var label = !owned ? 'Buy · ' + item.price + ' SQK' : item.slot === 'skill' ? 'Owned · active' : equipped ? 'Unequip' : 'Equip';
      var buy = action(label, async function () {
        buy.disabled = true; feedback.textContent = ''; rowResult.textContent = ''; feedback.className = 'panel-note';
        try {
          if (!owned) await save.purchase(item.id);
          else await save.equip(item.slot, equipped ? null : item.id);
          shopPanel(true);
          var updated = document.getElementById('shop-feedback'); updated.textContent = !owned ? item.name + ' purchased.' : equipped ? item.name + ' unequipped.' : item.name + ' equipped.';
          var replacement = /** @type {HTMLButtonElement} */ (content.querySelector('[data-item="' + item.id + '"]')); if (replacement) replacement.focus({ preventScroll: true });
        } catch (error) { rowResult.textContent = error.message; buy.disabled = false; }
      });
      buy.dataset.item = item.id; buy.setAttribute('aria-label', label + ' · ' + item.name);
      buy.setAttribute('aria-describedby', rowResult.id);
      if (owned && item.slot === 'skill') buy.disabled = true;
      row.append(buy, rowResult); list.append(row);
    });
    content.append(list);
    if (keepScroll) dialog.scrollTop = top;
  }
  async function leaderboardPanel() {
    title.textContent = 'Global Top 100'; content.replaceChildren(); var stamp = generation;
    content.append(el('p', 'Lifetime score · 100 per enemy, 500 per boss, 1,000 per map. Server-checked cloud profiles only.', 'panel-note'));
    var state = message('Loading rankings…'); content.append(state);
    try {
      var rows = await save.leaderboard();
      if (stamp !== generation || panel !== 'leaderboard') return;
      if (!rows.length) { state.textContent = 'No cloud scores yet. Complete an encounter with a cloud profile to appear here.'; return; }
      state.textContent = rows.length + (rows.length === 1 ? ' player ranked' : ' players ranked');
      var table = el('table', '', 'leaderboard'); var caption = el('caption', 'Global player rankings'); caption.className = 'visually-hidden'; table.append(caption);
      var head = el('thead'), hr = el('tr'); ['Rank', 'Player', 'Score', 'Map'].forEach(function (text) { var th = el('th', text); th.scope = 'col'; hr.append(th); }); head.append(hr); table.append(head);
      var body = el('tbody'); rows.slice(0,100).forEach(function (player, index) { var row = el('tr'); [String(index + 1), player.name, Number(player.total_score).toLocaleString(), String(player.highest_map)].forEach(function (value) { row.append(el('td', value)); }); body.append(row); }); table.append(body); content.append(table);
    } catch (error) {
      if (stamp !== generation) return;
      state.textContent = error.message;
      if (save.snapshot().configured) content.append(action('Retry rankings', function () { generation++; void leaderboardPanel(); }));
    }
  }
  function open(which, trigger) {
    window.__hamster.pause(); opener = trigger; panel = which; generation++;
    if (which === 'profile') profilePanel(); else if (which === 'shop') shopPanel(); else void leaderboardPanel();
    dialog.showModal(); dialog.scrollTop = 0;
  }
  [['profile','btn-profile'],['shop','btn-shop'],['leaderboard','btn-leaderboard']].forEach(function (pair) { var button = document.getElementById(pair[1]); button.addEventListener('click', function () { open(pair[0], button); }); });
  document.getElementById('close-panel').addEventListener('click', function () { dialog.close(); });
  dialog.addEventListener('close', function () { generation++; panel = ''; if (opener) opener.focus({ preventScroll: true }); });
  dialog.addEventListener('click', function (event) { var r = dialog.getBoundingClientRect(); if (event.target === dialog && (event.clientX < r.left || event.clientX > r.right || event.clientY < r.top || event.clientY > r.bottom)) dialog.close(); });
  save.subscribe(summary); summary();
})();
