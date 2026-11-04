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
    document.getElementById('save-summary').textContent = state.profile.name + ' · ' + (!state.storageOK ? 'Browser storage unavailable; keep this page open.' : state.cloud ? state.playingGuest ? 'Guest run · restart the map for cloud credit' : state.pendingEvents ? 'Cloud save pending · open Profile to retry' : state.profile.dice ? 'Cloud saved' : 'Cloud saved · legacy rules; migration 002 needed' : 'Guest progress · this device only');
    if (window.__hamster.snapshot().state === 'title' && state.profile.highest_map > 1) { document.getElementById('btn-start').textContent = 'Continue map ' + state.profile.highest_map; document.getElementById('hud-map').textContent = String(state.profile.highest_map); document.getElementById('start-title').textContent = 'The chestnut forest · Map ' + state.profile.highest_map; document.getElementById('btn-replay').hidden = false; }
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
  function badgeArt(badge) {
    var art = el('span', '', 'badge-art badge-' + badge.tier); art.setAttribute('aria-hidden', 'true'); art.textContent = badge.tier === 'gold' ? '★' : badge.tier === 'silver' ? '◆' : '●'; return art;
  }
  function badgeList(target, exchangeable) {
    var state = save.snapshot();
    if (state.cloud && !state.profile.dice) { target.append(el('p', 'Disabled until the owner applies Supabase migration 002. Existing balances and equipment remain available.', 'panel-note')); return; }
    var badges = (state.profile.badges || []).filter(function (b) { return exchangeable ? b.source === 'skill' || b.source === 'contribution' : b.source === 'dice'; });
    if (!badges.length) target.append(el('p', exchangeable ? 'No exchangeable badges yet. Clear maps 1, 3 and 5 to earn skill badges, or receive a verified contribution badge from the project owner.' : 'Correct predictions unlock Bronze at 20, Silver at 50 and Gold at 100.', 'panel-note'));
    badges.forEach(function (badge) {
      var row = el('div', '', 'badge-row'), text = el('div');
      var name = badge.tier.charAt(0).toUpperCase() + badge.tier.slice(1);
      text.append(el('strong', name + ' · ' + (badge.source === 'dice' ? 'Dice achievement' : badge.source === 'skill' ? 'Skill badge' : 'Contribution badge')));
      text.append(el('p', exchangeable ? 'Exchangeable once · removed when exchanged' : 'Display only · cannot be exchanged', 'panel-note'));
      row.append(badgeArt(badge), text);
      if (exchangeable) {
        var tier = rules.tiers.find(function (t) { return t.tier === badge.tier; });
        if (!tier) return;
        var feedback = message(''); feedback.id = 'exchange-result-' + encodeURIComponent(badge.id);
        var button = action('Exchange · ' + tier.sqk + ' SQK', async function () {
          button.disabled = true; feedback.textContent = 'Exchanging badge…';
          try { await save.exchangeBadge(badge.id); window.HamsterAudio.sfx('coin'); shopPanel(true); var status = document.getElementById('exchange-feedback'); status.textContent = name + ' badge exchanged for ' + tier.sqk + ' SQK.'; document.getElementById('exchange-heading').focus({ preventScroll: true }); }
          catch (error) { feedback.textContent = error.message; button.disabled = false; }
        });
        button.dataset.badge = badge.id; button.setAttribute('aria-label', 'Exchange · ' + tier.sqk + ' SQK · ' + badge.source + ' ' + name + ' badge'); button.setAttribute('aria-describedby', feedback.id); row.append(button, feedback);
      }
      target.append(row);
    });
  }
  function dicePanel() {
    title.textContent = 'SQK Dice'; content.replaceChildren();
    if (save.snapshot().cloud && !save.snapshot().profile.dice) { content.append(el('p', 'Disabled until the owner applies Supabase migration 002. Forest play and existing saves remain available.', 'panel-note')); return; }
    content.append(el('p', 'A little forest break. Two fair dice, one prediction.', 'panel-note'));
    var stats = el('p', '', 'dice-stats');
    function updateStats() { var d = save.snapshot().profile.dice || { correct: 0, wins: 0, rounds: 0 }; stats.textContent = d.correct + (d.correct === 1 ? ' correct prediction · ' : ' correct predictions · ') + d.wins + (d.wins === 1 ? ' lifetime win · ' : ' lifetime wins · ') + d.rounds + (d.rounds === 1 ? ' roll' : ' rolls'); }
    updateStats(); content.append(stats);
    var visual = el('div', '', 'dice-pair'); visual.setAttribute('aria-hidden', 'true');
    function drawDice(values) { visual.replaceChildren(); (values || [null, null]).forEach(function (value) { var die = el('span', '', 'die'); if (!value) { die.textContent = '?'; die.classList.add('is-empty'); } else { var positions = { 1: [4], 2: [0,8], 3: [0,4,8], 4: [0,2,6,8], 5: [0,2,4,6,8], 6: [0,2,3,5,6,8] }; for (var i = 0; i < 9; i++) die.append(el('span', '', positions[value].includes(i) ? 'pip is-filled' : 'pip')); } visual.append(die); }); }
    drawDice(); content.append(visual);
    var field = el('fieldset', '', 'dice-predictions'); field.append(el('legend', 'Predict the total'));
    var prediction = '', pending = null;
    try { pending = JSON.parse(localStorage.getItem('hamster-friendship-dice-pending') || 'null'); } catch (_) { /* no pending roll */ }
    var roll = action(pending ? 'Retry saved roll' : 'Roll dice', async function () {
      if (!prediction && !pending) { result.textContent = 'Choose HIGH or LOW before rolling.'; return; }
      if (!pending) pending = { id: crypto.randomUUID(), prediction: prediction };
      try { localStorage.setItem('hamster-friendship-dice-pending', JSON.stringify(pending)); } catch (_) { /* in-memory retry */ }
      roll.disabled = true; field.disabled = true; result.textContent = 'Rolling…';
      try {
        var round = await save.playDice(pending.prediction, pending.id);
        pending = null; try { localStorage.removeItem('hamster-friendship-dice-pending'); } catch (_) { /* done */ }
        drawDice(round.dice); visual.classList.remove('has-result'); void visual.offsetWidth; visual.classList.add('has-result');
        result.textContent = round.dice.join(' + ') + ' = ' + round.total + '. ' + round.outcome + (round.outcome === 'DRAW' ? '. A draw. Try another prediction.' : round.correct ? '. Correct prediction!' : '. Try another prediction.');
        window.HamsterAudio.sfx(round.correct ? 'quest' : 'dice'); updateStats(); achievements.replaceChildren(); badgeList(achievements, false);
      } catch (error) { result.textContent = error.message + ' Retry this saved roll to keep the same result.'; }
      finally { roll.disabled = false; field.disabled = Boolean(pending); roll.textContent = pending ? 'Retry saved roll' : 'Roll dice'; }
    }, 'btn-primary'); roll.id = 'roll-dice';
    ['HIGH', 'LOW'].forEach(function (value) { var label = el('label', '', 'prediction-choice'), input = el('input'); input.type = 'radio'; input.name = 'prediction'; input.value = value; input.addEventListener('change', function () { prediction = value; }); label.append(input, el('span', value + (value === 'HIGH' ? ' · > 7' : ' · < 7'))); field.append(label); });
    field.disabled = Boolean(pending);
    var result = message(''); result.id = 'dice-result';
    content.append(field, roll, result, el('p', 'HIGH 41.67% · LOW 41.67% · DRAW 16.67% (total 7)', 'panel-note'), el('p', 'Free predictions only. No SQK staking, losses, gambling or real-money rewards.', 'panel-note'));
    content.append(el('h3', 'Dice achievements', 'panel-subtitle'));
    var achievements = el('div', '', 'badge-list'); badgeList(achievements, false); content.append(achievements);
  }
  function audioPanel() {
    title.textContent = 'Audio'; content.replaceChildren();
    var audio = window.HamsterAudio, settings = audio.snapshot();
    content.append(el('p', 'A soft forest lullaby and little sounds for each discovery.', 'panel-note'));
    ['music', 'sfx'].forEach(function (kind) {
      var row = el('div', '', 'audio-setting'), label = el('label', kind === 'music' ? 'Music volume' : 'Sound effects volume'), input = el('input'), value = el('output', Math.round(settings[kind] * 100) + '%');
      input.type = 'range'; input.min = '0'; input.max = '100'; input.step = '1'; input.value = String(Math.round(settings[kind] * 100)); input.id = kind + '-volume'; label.htmlFor = input.id; value.htmlFor = input.id;
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
    var exchange = el('section', '', 'badge-exchange'), heading = el('h3', 'Badge Exchange', 'panel-subtitle'); heading.id = 'exchange-heading'; heading.tabIndex = -1;
    exchange.append(heading, el('p', 'Exchange a skill or contribution badge once: Bronze 20 SQK · Silver 50 SQK · Gold 120 SQK. Dice achievements cannot be exchanged.', 'panel-note'));
    var status = message(''); status.id = 'exchange-feedback'; exchange.append(status); badgeList(exchange, true); content.append(exchange);
    content.append(el('h3', 'Forest equipment', 'panel-subtitle'), list);
    var diceBadges = el('section', '', 'badge-list'); diceBadges.append(el('h3', 'Dice achievements · display only', 'panel-subtitle')); badgeList(diceBadges, false); content.append(diceBadges);
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
    if (which === 'profile') profilePanel(); else if (which === 'shop') shopPanel(); else if (which === 'dice') dicePanel(); else if (which === 'audio') audioPanel(); else if (which === 'guild') guildPanel(); else void leaderboardPanel();
    document.getElementById('btn-guild').setAttribute('aria-expanded', String(which === 'guild'));
    dialog.showModal(); dialog.scrollTop = 0;
  }
  [['profile','btn-profile'],['shop','btn-shop'],['leaderboard','btn-leaderboard'],['dice','btn-dice'],['audio','btn-audio'],['guild','btn-guild'],['guild','btn-start-guild']].forEach(function (pair) { var button = document.getElementById(pair[1]); button.addEventListener('click', function () { open(pair[0], button); }); });
  document.getElementById('close-panel').addEventListener('click', function () { dialog.close(); });
  dialog.addEventListener('close', function () { generation++; if (panel === 'audio') window.HamsterAudio.play(false); panel = ''; document.getElementById('btn-guild').setAttribute('aria-expanded', 'false'); if (opener) opener.focus({ preventScroll: true }); });
  dialog.addEventListener('click', function (event) { var r = dialog.getBoundingClientRect(); if (event.target === dialog && (event.clientX < r.left || event.clientX > r.right || event.clientY < r.top || event.clientY > r.bottom)) dialog.close(); });
  save.subscribe(summary); summary();
})();
