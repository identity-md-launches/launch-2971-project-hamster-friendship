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
    document.getElementById('save-summary').textContent = state.profile.name + ' · ' + (!state.storageOK ? 'Browser storage unavailable; keep this page open.' : state.cloud ? state.runConflict ? 'Map ended elsewhere · open Profile to recover' : state.playingGuest ? 'Guest run · restart the map for cloud credit' : state.pendingEvents ? 'Cloud save pending · open Profile to retry' : 'Wallet profile saved' : 'this run only; not saved');
    if (window.__hamster.snapshot().state === 'title') {
      var map = state.profile.highest_map > 4 ? 1 : state.profile.highest_map;
      document.getElementById('btn-start').textContent = map > 1 ? 'Continue map ' + map : 'Start adventure';
      document.getElementById('hud-map').textContent = String(map);
      document.getElementById('hud-environment').textContent = rules.environment(map).name;
      document.getElementById('hud-countdown').textContent = rules.environment(map).boss + ' in ' + rules.environment(map).seconds + 's';
      document.getElementById('hud-timer').textContent = document.getElementById('hud-countdown').textContent;
      document.getElementById('map-hint').textContent = rules.environment(map).atmosphere;
      document.getElementById('start-title').textContent = map > 1 ? rules.environment(map).name : rules.environment(1).name;
      document.getElementById('btn-replay').hidden = map <= 1;
    }
    document.getElementById('entry-save').textContent = state.cloud ? 'Verified wallet · progress saves during play.' : state.configured ? 'Guest play is not saved. Sign in with a wallet to save.' : 'Guest play · not saved. Cloud setup is pending.';
    document.getElementById('hud-lifetime').textContent = state.profile.total_score.toLocaleString();
    if (panel === 'profile') {
      var values = { sqk: state.profile.sqk.toLocaleString(), total_score: state.profile.total_score.toLocaleString(), highest_map: String(state.profile.highest_map), purchases: String(state.profile.purchases.length) };
      Object.keys(values).forEach(function (key) { var node = document.getElementById('profile-' + key); if (node) node.textContent = values[key]; });
      var cloudStatus = document.getElementById('profile-save-state'); if (cloudStatus) cloudStatus.textContent = state.status;
      var retry = document.getElementById('profile-retry'); if (retry) retry.hidden = state.runConflict;
      var recover = document.getElementById('profile-recover'); if (recover) recover.hidden = !state.runConflict;
      var recoveryHint = document.getElementById('profile-recovery-hint'); if (recoveryHint) recoveryHint.hidden = !state.runConflict && !state.recoveryEvents;
      var download = document.getElementById('profile-recovery-download'); if (download) download.hidden = !state.runConflict && !state.recoveryEvents;
      var accountInfo = document.getElementById('profile-account-info');
      if (accountInfo) accountInfo.textContent = state.cloud ? 'Saved to your verified wallet profile. Guest progress is never imported. Lifetime scores, SQK and purchases are retained.' : state.configured ? 'Guest runs are not saved. Use Connect MetaMask above and sign in to save progress and buy items.' : 'Guest runs are not saved. Cloud saves, purchases and global rankings are not available on this site yet.';
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
        await save.saveName(input.value); input.removeAttribute('aria-invalid'); result.textContent = state.cloud ? 'Name saved to your cloud profile.' : 'Name set for this visit only.';
      } catch (error) { input.setAttribute('aria-invalid', 'true'); result.className = 'error'; result.textContent = error.message; input.focus(); }
      finally { submit.disabled = false; submit.textContent = 'Save name'; }
    });
    var stats = el('dl', '', 'profile-stats');
    [['SQK balance', p.sqk.toLocaleString(), 'sqk'], ['Lifetime Score', p.total_score.toLocaleString(), 'total_score'], ['Deepest map', String(p.highest_map), 'highest_map'], ['Owned items', String(p.purchases.length), 'purchases']].forEach(function (pair) { var row = el('div'), value = el('dd', pair[1]); value.id = 'profile-' + pair[2]; row.append(el('dt', pair[0]), value); stats.append(row); });
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
      retry.id = 'profile-retry';
      var recover = action('Restart from cloud profile', async function () {
        recover.disabled = true; retryResult.className = 'panel-note'; retryResult.textContent = 'Restoring cloud profile…';
        try { await save.recover(); dialog.close(); await window.__hamster.restart(); }
        catch (error) { retryResult.className = 'error'; retryResult.textContent = error.message; }
        finally { recover.disabled = false; }
      }, 'btn-primary');
      recover.id = 'profile-recover';
      var recoveryHint = el('p', 'An ended map cannot accept unsent events. Restart uses your saved wallet balance, inventory and map unlocks. The rejected events stay in a recovery record on this browser and are not credited. Download a copy before clearing site data.', 'panel-note'); recoveryHint.id = 'profile-recovery-hint';
      var download = action('Download recovery record', function () {
        var blob = new Blob([JSON.stringify(save.recoveryRecord(), null, 2)], { type: 'application/json' });
        var url = URL.createObjectURL(blob), link = el('a'); link.href = url; link.download = 'squeek-recovery.json'; link.click(); setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
      }); download.id = 'profile-recovery-download';
      content.append(retry, recoveryHint, recover, download, retryResult);
    }
    if (state.localLegacyAvailable) {
      content.append(el('p', 'An older browser save is retained on this device. Its unverified totals cannot replace a verified wallet score. Download it for the project owner to review.', 'panel-note'));
      content.append(action('Download older browser save', function () {
        var url = URL.createObjectURL(new Blob([JSON.stringify(save.legacyRecord(), null, 2)], {type:'application/json'}));
        var link = el('a'); link.href = url; link.download = 'squeek-legacy-browser-save.json'; link.click(); setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
      }));
    }
    var earned = (p.badges || []).filter(function (b) { return b.source === 'skill' || b.source === 'contribution'; });
    if (earned.length) content.append(el('p', 'Earned badges: ' + earned.map(function (b) { return b.tier + ' ' + b.source; }).join(', '), 'panel-note'));
    summary();
  }
  function audioPanel() {
    title.textContent = 'Audio'; content.replaceChildren();
    var audio = window.HamsterAudio, settings = audio.snapshot();
    content.append(el('p', 'A soft forest lullaby and little sounds for each discovery.', 'panel-note'));
    ['music', 'sfx'].forEach(function (kind) {
      var row = el('div', '', 'audio-setting'), label = el('label', kind === 'music' ? 'Music volume' : 'Sound effects volume'), input = el('input'), value = el('output', Math.round(settings[kind] * 100) + '%');
      input.type = 'range'; input.min = '0'; input.max = '100'; input.step = '1'; input.value = String(Math.round(settings[kind] * 100)); input.id = kind + '-volume'; label.htmlFor = input.id; value.htmlFor.value = input.id;
      input.addEventListener('input', function () { value.textContent = input.value + '%'; audio.set(kind, Number(input.value) / 100); });
      var muteLabel = el('label', '', 'mute-label'), mute = el('input'); mute.type = 'checkbox'; mute.checked = settings[kind + 'Muted']; mute.id = kind + '-mute';
      mute.addEventListener('change', function () { audio.set(kind + 'Muted', mute.checked); }); muteLabel.append(mute, el('span', kind === 'music' ? 'Mute music' : 'Mute sound effects'));
      row.append(label, value, input, muteLabel); content.append(row);
    });
    var status = message(settings.available ? 'Audio starts after a play or preview action.' : 'This browser does not support Web Audio. The game remains playable.');
    var preview = action('Preview audio', async function () { if (await audio.unlock()) { audio.play(true); audio.sfx('quest'); status.textContent = audio.snapshot().storageOK ? 'Playing a short preview. Volume settings are saved on this device.' : 'Playing a short preview. Browser storage is unavailable; settings last until you close this page.'; setTimeout(function () { if (panel === 'audio') audio.play(false); }, 1800); } else status.textContent = 'Audio could not start. Check this browser’s sound permissions and try again.'; }, 'btn-primary');
    if (!settings.available) preview.disabled = true;
    content.append(preview, status);
  }
  function guildPanel() {
    title.textContent = 'GUILD'; content.replaceChildren((/** @type {HTMLTemplateElement} */ (document.getElementById('guild-template'))).content.cloneNode(true));
  }
  function itemArt(item) {
    var box = el('span', '', 'item-art'); box.setAttribute('aria-hidden', 'true');
    var svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg'); svg.setAttribute('viewBox', '0 0 18 18'); svg.setAttribute('width', '48'); svg.setAttribute('height', '48');
    var pixels = item.slot === 'costume' ? [[3,3,11,9,'#d9893b'],[3,1,4,4,'#d9893b'],[10,1,4,4,'#d9893b'],[5,7,2,1,'#26180f'],[10,7,2,1,'#26180f'],[6,9,6,3,'#fbf3e4'],[3,13,4,2,'#8b4a22'],[10,13,4,2,'#8b4a22']].concat(rules.costumeArt(item.id)) : [[7,2,3,12,item.color],[2,7,13,3,item.color]];
    pixels.forEach(function (p) { var r = document.createElementNS(svg.namespaceURI, 'rect'); ['x','y','width','height','fill'].forEach(function (key, i) { r.setAttribute(key, String(p[i])); }); svg.append(r); });
    box.append(svg); return box;
  }
  function shopPanel(keepScroll = false, wardrobe = panel === 'wardrobe') {
    var top = dialog.scrollTop;
    title.textContent = wardrobe ? 'Change it' : 'Marketplace'; content.replaceChildren();
    var state = save.snapshot(), p = state.profile;
    var balance = el('p', p.sqk.toLocaleString() + ' SQK available' + (state.pendingCoins ? ' · ' + state.pendingCoins + ' awaiting cloud save' : ''), 'balance-label'); balance.id = 'market-balance'; content.append(balance);
    if (wardrobe) content.append(el('p', 'Choose an owned costume, or unequip it to return to Chang’s original look.', 'panel-note'));
    else content.append(el('p', 'Costumes cost 50 SQK each. Buy each item once per account. Damage upgrades stack and apply to gun, sword and bomb immediately.', 'panel-note'));
    if (!state.cloud) content.append(el('p', state.configured ? 'Use Connect MetaMask above and sign in to buy and equip items.' : 'Purchases are unavailable until cloud saves are enabled. Guest play is ready.', 'panel-note'));
    var feedback = message(''); feedback.id = 'shop-feedback'; content.append(feedback);
    var list = el('div', '', 'shop-list');
    var items = rules.catalogue.filter(function (item) { return !wardrobe || item.slot === 'costume' && p.purchases.includes(item.id); });
    if (wardrobe && !items.length) content.append(el('p', 'No costumes owned yet. Find costumes in the Marketplace; purchases require a verified wallet profile.', 'panel-note'));
    if (wardrobe) content.append(action('Open Marketplace', function () { panel = 'shop'; shopPanel(); }));
    items.forEach(function (item) {
      var row = el('article', '', 'shop-item'); row.append(itemArt(item));
      var details = el('div', '', 'item-description'); details.append(el('h3', item.name), el('p', item.description, 'panel-note')); row.append(details);
      var owned = p.purchases.includes(item.id), equipped = p.cosmetics[item.slot] === item.id;
      var rowResult = message('', true); rowResult.className = 'error item-feedback'; rowResult.id = 'item-error-' + item.id;
      var label = !owned ? 'Buy · ' + item.price + ' SQK' : item.slot === 'upgrade' ? 'Owned · active' : equipped ? 'Unequip' : 'Equip';
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
      if (!state.cloud || owned && item.slot === 'upgrade') buy.disabled = true;
      row.append(buy, rowResult); list.append(row);
    });
    content.append(list);
    if (keepScroll) dialog.scrollTop = top;
  }
  var boardTimer, refreshBoard = function () {};
  function leaderboardPanel() {
    clearTimeout(boardTimer); title.textContent = 'Lifetime Top 100'; content.replaceChildren(); var stamp = generation, loading = false;
    content.append(el('p', 'Accumulated score across all maps · verified wallets only. Scores never reset. Guests are unranked.', 'panel-note'));
    var state = message('Loading lifetime rankings…'); content.append(state);
    var table = el('table', '', 'leaderboard'), caption = el('caption', 'Lifetime wallet scores'); caption.className = 'visually-hidden'; table.append(caption); table.hidden = true;
    var head = el('thead'), hr = el('tr'); ['Rank', 'Player', 'Lifetime Score', 'Map'].forEach(function (text) { var th = el('th', text); th.scope = 'col'; hr.append(th); }); head.append(hr); table.append(head);
    var body = el('tbody'); table.append(body); content.append(table);
    content.append(el('p', 'Updates after a saved score change and every 15 seconds while open. Points are saved during play; pending offline points appear after syncing.', 'panel-note'));
    var refresh = action('Refresh rankings', function () { void update(); });
    async function update() {
      if (loading || stamp !== generation || panel !== 'leaderboard') return;
      clearTimeout(boardTimer); loading = true; refresh.setAttribute('aria-busy', 'true');
      try {
        var board = await save.leaderboard();
        if (stamp !== generation || panel !== 'leaderboard') return;
        var rows = board.rows.slice(0, 100), top = dialog.scrollTop;
        state.className = 'panel-note';
        state.textContent = rows.length ? rows.length === 1 ? '1 player ranked' : rows.length + ' players ranked' : 'No verified wallet scores yet. Sign in and collect produce to enter.';
        // Keep the table and controls mounted. Unchanged cells are untouched.
        rows.forEach(function (player, index) {
          var row = body.rows[index];
          if (!row) { row = el('tr'); for (var i = 0; i < 4; i++) row.append(el('td')); body.append(row); }
          [String(index + 1), player.name, Number(player.score).toLocaleString(), String(player.highest_map)].forEach(function (value, i) { if (row.cells[i].textContent !== value) row.cells[i].textContent = value; });
        });
        while (body.rows.length > rows.length) body.deleteRow(body.rows.length - 1);
        table.hidden = !rows.length; dialog.scrollTop = top;
      } catch (error) {
        if (stamp !== generation || panel !== 'leaderboard') return;
        var top = dialog.scrollTop;
        state.className = 'error'; state.textContent = (body.rows.length ? 'Showing the last loaded rankings. ' : '') + error.message;
        dialog.scrollTop = top;
      } finally {
        loading = false; refresh.removeAttribute('aria-busy');
        if (stamp === generation && panel === 'leaderboard' && save.snapshot().configured) boardTimer = setTimeout(function () { if (!document.hidden) void update(); }, 15000);
      }
    }
    refreshBoard = function () { void update(); };
    if (save.snapshot().configured) {
      content.append(refresh);
    }
    void update();
  }
  function open(which, trigger) {
    (/** @type {HTMLDialogElement} */ (document.getElementById('menu-dialog'))).close(); window.__hamster.pause(); opener = trigger && (trigger.id === 'btn-start-guild' || trigger.id === 'btn-change') ? trigger : document.getElementById('btn-menu'); panel = which; generation++;
    if (which === 'profile') profilePanel(); else if (which === 'shop' || which === 'wardrobe') shopPanel(); else if (which === 'audio') audioPanel(); else if (which === 'guild') guildPanel(); else void leaderboardPanel();
    document.getElementById('btn-guild').setAttribute('aria-expanded', String(which === 'guild'));
    dialog.showModal(); dialog.scrollTop = 0;
  }
  [['wardrobe','btn-change'],['wardrobe','btn-change-menu'],['profile','btn-profile'],['shop','btn-shop'],['leaderboard','btn-leaderboard'],['audio','btn-audio'],['guild','btn-guild'],['guild','btn-start-guild']].forEach(function (pair) { var button = document.getElementById(pair[1]); button.addEventListener('click', function () { open(pair[0], button); }); });
  document.getElementById('close-panel').addEventListener('click', function () { dialog.close(); });
  dialog.addEventListener('close', function () { generation++; clearTimeout(boardTimer); if (panel === 'audio') window.HamsterAudio.play(false); panel = ''; document.getElementById('btn-guild').setAttribute('aria-expanded', 'false'); if (opener) opener.focus({ preventScroll: true }); });
  dialog.addEventListener('click', function (event) { var r = dialog.getBoundingClientRect(); if (event.target === dialog && (event.clientX < r.left || event.clientX > r.right || event.clientY < r.top || event.clientY > r.bottom)) dialog.close(); });
  var menu = /** @type {HTMLDialogElement} */ (document.getElementById('menu-dialog'));
  document.getElementById('btn-menu').addEventListener('click', function () { window.__hamster.pause(); menu.showModal(); });
  document.getElementById('close-menu').addEventListener('click', function () { menu.close(); });
  menu.addEventListener('close', function () { document.getElementById('btn-menu').focus({ preventScroll: true }); });
  menu.addEventListener('click', function (e) { var r = menu.getBoundingClientRect(); if (e.target === menu && (e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom)) menu.close(); });
  document.addEventListener('visibilitychange', function () { if (!document.hidden && panel === 'leaderboard') refreshBoard(); });
  var lastScore = -1;
  save.subscribe(function () { summary(); var score = save.snapshot().profile.total_score; if (score !== lastScore && panel === 'leaderboard') refreshBoard(); lastScore = score; }); summary();
})();
