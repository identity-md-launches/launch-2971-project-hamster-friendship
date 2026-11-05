/* Supabase persistence. Guest gameplay is memory-only. Wallet queues are
   partitioned by address and authenticated by Supabase Web3, never by an address
   supplied as profile data. Historical browser saves are left intact. */
(function () {
  'use strict';
  var config = window.HAMSTER_CONFIG || { supabaseUrl: '', supabasePublishableKey: '' };
  var configError = !config.supabaseUrl || !config.supabasePublishableKey ? 'Cloud storage is not configured. The site owner must connect the existing Supabase project. Guest play is available; it is not saved.' : '';
  if (!configError && (!/^https:\/\//.test(config.supabaseUrl) && !/^http:\/\/(localhost|127\.0\.0\.1)(:|\/|$)/.test(config.supabaseUrl))) configError = 'Cloud configuration is invalid. Ask the site owner to check the Supabase URL.';
  var keyRole = '';
  try { keyRole = JSON.parse(atob((config.supabasePublishableKey.split('.')[1] || '').replace(/-/g, '+').replace(/_/g, '/'))).role || ''; } catch (_) {}
  if (/^sb_secret_/.test(config.supabasePublishableKey) || keyRole === 'service_role') configError = 'Cloud configuration is invalid. Only a browser-safe publishable key is allowed.';
  var CLOUD = !configError;
  var url = String(config.supabaseUrl).replace(/\/$/, ''), prefix = 'hamster-friendship-v2';
  var listeners = [], storageOK = true, generation = 0, wallet = '', session = null;
  var guestProfile = empty(), profile = guestProfile, cloud = false, active = null, outbox = [], recovery = [], flushing = null;
  var status = CLOUD ? 'Guest · connect a wallet to save.' : configError;
  var mutation = Promise.resolve(), rpcFlight = Promise.resolve(), backendReady = false, backendFlight = null;
  var backendState = CLOUD ? 'unchecked' : 'unconfigured', backendError = '', backendCheckedAt = '';
  function empty() { return { name: 'Guest', sqk: 0, total_score: 0, highest_map: 1, produce_points: 0, purchases: [], cosmetics: {} }; }
  function read(key, fallback) { try { return JSON.parse(localStorage.getItem(prefix + key) || 'null') || fallback; } catch (_) { storageOK = false; return fallback; } }
  function write(key, data) { try { localStorage.setItem(prefix + key, JSON.stringify(data)); return true; } catch (_) { storageOK = false; return false; } }
  function notify() { listeners.forEach(function (fn) { fn(); }); }
  function uuid() { return crypto.randomUUID(); }
  function serialized(fn) { var result = mutation.then(fn); mutation = result.catch(function () {}); return result; }
  function mutate(fn) { var epoch = generation; return serialized(function () { if (epoch !== generation) throw new Error('The wallet changed. Retry the action from the current profile.'); return fn(); }); }
  function identityChanged() { window.dispatchEvent(new Event('hamster:identity')); notify(); }
  function hasConflict() { return outbox.some(function (r) { return Boolean(r.conflict); }); }
  function pendingRewards() { return Number(profile.pending_rewards || 0); }
  function savedStatus() { return hasConflict() ? conflictMessage() : outbox.length || pendingRewards() ? 'Save pending. Earned rewards are kept until fully credited.' : 'Wallet profile saved.'; }
  function conflictMessage() { return 'This map has ended in another session. Saved rewards are safe. Unsent events are kept for recovery. Open Profile and choose Restart from cloud profile.'; }
  function pendingCoins() { return outbox.reduce(function (n, r) { return n + (r.conflict ? 0 : r.events.filter(function (e) { return e.seq > (r.validatedAck || 0) && e.kind === 'pickup' && r.loot[e.target] === 'coin'; }).length); }, 0); }
  async function request(path, body, token, method) {
    var control = new AbortController(), timer = setTimeout(function () { control.abort(); }, 10000);
    try {
      var response = await fetch(url + path, { method: method || 'POST', headers: Object.assign({ apikey: config.supabasePublishableKey, 'Content-Type': 'application/json' }, token ? { Authorization: 'Bearer ' + token } : {}), body: method === 'GET' ? undefined : JSON.stringify(body), signal: control.signal, keepalive: path === '/rest/v1/rpc/hf_progress' });
      var data = await response.json().catch(function () { throw new Error('Cloud returned an unreadable response. Pending progress has been kept. Retry the save.'); });
      if (!response.ok) {
        if (data.code === 'PGRST202') throw new Error('Cloud saves and global rankings are unavailable. Ask the site owner to finish cloud setup. Guest play is not saved.');
        throw new Error(data.msg || data.message || data.error_description || 'Cloud request failed. Check your connection and retry.');
      }
      return data;
    } finally { clearTimeout(timer); }
  }
  async function requireBackend(force = false) {
    if (!CLOUD) throw new Error(configError);
    if (backendFlight) return backendFlight;
    if (backendReady && !force) return;
    backendState = 'checking'; backendError = ''; notify();
    backendFlight = Promise.resolve().then(async function () {
      try {
        var data = await request('/rest/v1/rpc/hf_service_status', {});
        if (!data || data.schemaVersion !== 7 || data.rulesVersion !== 6 || data.leaderboard !== 'lifetime' || data.migration < 9 || !Number.isSafeInteger(data.migration)) throw new Error('Cloud saves and global rankings are unavailable. Ask the site owner to finish cloud setup. Guest play is not saved.');
        backendReady = true; backendState = 'ready';
      } catch (error) {
        backendReady = false; backendState = 'unavailable';
        backendError = /finish cloud setup/.test(error.message) ? error.message : 'Unable to reach cloud saves. Check your connection and retry. If this continues, ask the site owner to check cloud setup.';
        throw new Error(backendError);
      } finally { backendCheckedAt = new Date().toISOString(); backendFlight = null; notify(); }
    });
    return backendFlight;
  }
  async function access(auth, key) {
    if (!auth) throw new Error('Sign in with MetaMask to save.');
    if (auth.expires_at > Date.now() / 1000 + 60) return auth.access_token;
    var data = await request('/auth/v1/token?grant_type=refresh_token', { refresh_token: auth.refresh_token });
    Object.assign(auth, data, { expires_at: Date.now() / 1000 + data.expires_in }); write(key, auth); return auth.access_token;
  }
  function accept(data, epoch) {
    if (epoch !== generation || !wallet) return;
    if (!data || String(data.wallet).toLowerCase() !== wallet) throw new Error('Cloud account does not match the connected wallet. Sign in again.');
    profile = data; cloud = true; notify();
  }
  function rpc(name, body, auth, address, epoch) {
    auth = auth || session; address = address || wallet; if (epoch === undefined) epoch = generation;
    var result = rpcFlight.then(async function () {
      var token = await access(auth, '-wallet-session-' + address);
      var data = await request('/rest/v1/rpc/' + name, body || {}, token);
      if (data.profile) accept(data.profile, epoch); else if (data.wallet) accept(data, epoch);
      return data;
    });
    rpcFlight = result.catch(function () {}); return result;
  }
  // One durable key per run prevents another tab's run from overwriting this
  // tab's queue. The old array is migrated without changing any event/score.
  function runKey(address, id) { return '-run-outbox-' + address + '-' + id; }
  function mergedRun(run, address, through) {
    var stored = read(runKey(address, run.id), null), ack = Math.max(run.ack || 0, stored && stored.ack || 0, through || 0), events = {};
    (stored && stored.events || []).concat(run.events).forEach(function (e) { if (e.seq > ack) events[e.seq] = e; });
    return Object.assign({}, stored, run, { ack: ack, validatedAck: Math.max(ack, run.validatedAck || 0, stored && stored.validatedAck || 0), events: Object.values(events).sort(function (a, b) { return a.seq - b.seq; }) });
  }
  function persist(queue, address) {
    queue.forEach(function (run) { var merged = mergedRun(run, address); Object.assign(run, merged); write(runKey(address, run.id), merged); }); notify();
  }
  function retire(run, address, through) {
    // Another tab may have appended while this tab awaited the acknowledgement.
    // Remove only acknowledged (or explicitly archived) sequences, never its
    // newer events. A refresh can recover the remaining durable run.
    var merged = mergedRun(run, address, through);
    if (merged.events.length) { write(runKey(address, run.id), merged); return; }
    try { localStorage.removeItem(prefix + runKey(address, run.id)); } catch (_) { storageOK = false; }
  }
  function loadQueue(address) {
    var old = read('-wallet-outbox-' + address, []), queue = [];
    if (Array.isArray(old) && old.length) {
      if (old.every(function (run) { return write(runKey(address, run.id), run); })) write('-wallet-outbox-' + address, []);
    }
    try {
      var match = prefix + '-run-outbox-' + address + '-';
      for (var i = 0; i < localStorage.length; i++) {
        var key = localStorage.key(i); if (!key || !key.startsWith(match)) continue;
        var run = JSON.parse(localStorage.getItem(key));
        if (run && run.id && Array.isArray(run.events)) queue.push(run);
      }
    } catch (_) { storageOK = false; }
    if (!queue.length && Array.isArray(old)) queue = old;
    return queue;
  }
  async function flush() {
    if (!cloud || !session || (!outbox.length && !pendingRewards())) return;
    if (flushing && flushing.generation === generation) return flushing.promise;
    var queue = outbox, address = wallet, auth = session, epoch = generation;
    var work = Promise.resolve().then(async function () {
      try {
        // Recover server-held rewards even on a new device with no local queue.
        // Retry once per flush; never spin while the real-time budget refills.
        if (pendingRewards()) await rpc('hf_settle_rewards', {}, auth, address, epoch);
        var deferred = new Set();
        while (queue.some(function (r) { return !r.conflict && !deferred.has(r.id); })) {
          var run = queue.find(function (r) { return !r.conflict && !deferred.has(r.id); });
          if (!run.events.length) { queue.splice(queue.indexOf(run), 1); retire(run, address); continue; }
          var events = run.events.slice(0, 128);
          var result;
          try { result = await rpc('hf_progress', { p_run: run.id, p_events: events }, auth, address, epoch); }
          catch (error) {
            // Classify by owned server state, never by a transport error string.
            // An offline/unavailable state check leaves the queue retryable.
            var remote;
            try { remote = await rpc('hf_run_state', { p_run: run.id }, auth, address, epoch); } catch (_) { throw error; }
            if (!remote || !['abandoned', 'dead', 'complete'].includes(remote.status) || !Number.isSafeInteger(remote.ack) || remote.ack < 0 || !Number.isSafeInteger(remote.pendingPoints) || remote.pendingPoints < 0) throw error;
            run.validatedAck = Math.max(run.validatedAck || 0, remote.ack);
            if (remote.pendingPoints > 0 && run.events.every(function (e) { return e.seq <= remote.ack; })) {
              deferred.add(run.id); persist(queue, address); continue;
            }
            run.ack = remote.ack;
            run.events = run.events.filter(function (e) { return e.seq > remote.ack; });
            if (!run.events.length && !(epoch === generation && active && active.id === run.id)) {
              queue.splice(queue.indexOf(run), 1); retire(run, address); persist(queue, address); continue;
            }
            run.conflict = { status: remote.status, ack: remote.ack };
            persist(queue, address);
            if (epoch === generation && active && active.id === run.id) {
              active = null;
              window.dispatchEvent(new Event('hamster:run-conflict'));
            }
            continue;
          }
          if (!result || !Number.isSafeInteger(result.ack) || result.ack < events[events.length - 1].seq) throw new Error('Cloud did not acknowledge these events. Pending progress has been kept. Retry the save.');
          if (!Number.isSafeInteger(result.pendingPoints) || result.pendingPoints < 0) throw new Error('Cloud did not confirm reward settlement. Pending progress has been kept. Retry the save.');
          // SQK is paid on validation, even if ranked fruit points must wait.
          // Retaining the batch must not label its already-paid coin pending.
          run.validatedAck = Math.max(run.validatedAck || 0, result.ack);
          if (result.pendingPoints > 0) {
            // ack means validated, not fully paid. Keep this batch durable for
            // replay (including its terminal event) until all its points land.
            deferred.add(run.id); persist(queue, address); continue;
          }
          run.ack = result.ack;
          run.events = run.events.filter(function (e) { return e.seq > result.ack; });
          if (!run.events.length) { queue.splice(queue.indexOf(run), 1); retire(run, address); } persist(queue, address);
        }
        if (epoch === generation) status = savedStatus();
      } catch (error) { if (epoch === generation) status = 'Save pending. ' + error.message + ' Open Profile and retry.'; }
      finally { if (flushing && flushing.generation === epoch) flushing = null; notify(); }
    });
    flushing = { generation: epoch, promise: work }; return work;
  }
  async function restore(epoch) {
    if (!CLOUD || !wallet) return;
    var address = wallet; session = read('-wallet-session-' + address, null);
    outbox = loadQueue(address);
    recovery = read('-wallet-recovery-' + address, []); if (!Array.isArray(recovery)) recovery = [];
    if (!session) { status = 'Wallet connected. Sign a login message to save.'; notify(); return; }
    try {
      await requireBackend();
      await rpc('hf_wallet_profile', {}, session, address, epoch);
      if (epoch !== generation) return;
      status = savedStatus(); await flush();
    } catch (error) { if (epoch === generation) { session = null; cloud = false; status = 'Sign in again. ' + error.message; } }
    notify();
  }
  async function setWallet(address) {
    address = String(address || '').toLowerCase(); if (address === wallet) return;
    if (active && !active.ranked) record('death', {}, active.lastFrame);
    generation++; wallet = address; session = null; cloud = false; active = null; outbox = []; recovery = []; profile = guestProfile;
    status = !CLOUD ? configError : wallet ? 'Checking wallet save…' : 'Guest · this visit only. Progress is not saved.';
    identityChanged(); await restore(generation);
  }
  async function signIn(provider, address, keepLegacy) {
    if (!CLOUD) throw new Error(configError);
    if (!provider || String(address).toLowerCase() !== wallet) throw new Error('Connect MetaMask on Ethereum Mainnet first.');
    if (cloud) { await flush(); return; }
    var epoch = generation, expected = wallet, ticket = null;
    await requireBackend();
    if (generation !== epoch) throw new Error('The account changed during login. Connect again.');
    if (keepLegacy) {
      var old = read('-session', null);
      if (old) {
        var oldToken = await access(old, '-session');
        var result = await request('/rest/v1/rpc/hf_prepare_legacy', {}, oldToken);
        if (result.wallet && result.wallet !== expected) throw new Error('This browser profile is already linked to another wallet. Sign in with that wallet to keep its balance.');
        ticket = result.ticket;
      }
    }
    var nonceBytes = new Uint8Array(16); crypto.getRandomValues(nonceBytes);
    var nonce = Array.from(nonceBytes, function (b) { return b.toString(16).padStart(2, '0'); }).join('');
    var now = new Date(), message = location.host + ' wants you to sign in with your Ethereum account:\n' + address + '\n\nSign in to squeek.hamster to save game progress. This does not authorize a transaction.\n\nURI: ' + location.origin + location.pathname + '\nVersion: 1\nChain ID: 1\nNonce: ' + nonce + '\nIssued At: ' + now.toISOString() + '\nExpiration Time: ' + new Date(now.getTime() + 300000).toISOString();
    var encoded = '0x' + Array.from(new TextEncoder().encode(message), function (b) { return b.toString(16).padStart(2, '0'); }).join('');
    var signature = await provider.request({ method: 'personal_sign', params: [encoded, address] });
    if (generation !== epoch) throw new Error('The account changed during login. Connect again.');
    var data = await request('/auth/v1/token?grant_type=web3', { chain: 'ethereum', message: message, signature: signature });
    if (generation !== epoch) throw new Error('The account changed during login. Connect again.');
    var auth = Object.assign(data, { expires_at: Date.now() / 1000 + data.expires_in });
    if (active && !active.ranked) record('death', {}, active.lastFrame);
    var result = await rpc('hf_wallet_profile', { p_legacy: keepLegacy ? ticket : null }, auth, expected, epoch);
    if (generation !== epoch) throw new Error('The account changed during login. Connect again.');
    session = auth; write('-wallet-session-' + expected, auth);
    status = 'Wallet profile saved. Restart the map for ranked play.'; active = null; identityChanged(); await flush();
    return result;
  }
  async function beginMap(map) {
    if (hasConflict()) throw new Error(conflictMessage());
    if (active) record('death', {}, active.lastFrame); await flush();
    if (hasConflict()) throw new Error(conflictMessage());
    var epoch = generation, loot, monsters, id = uuid(), ranked = cloud;
    if (ranked) {
      if (outbox.length) throw new Error('Retry your pending cloud save in Profile before starting another map.');
      var result = await rpc('hf_start_run_v6', { p_map: map });
      if (epoch !== generation) throw new Error('The wallet changed. Start this map again.');
      id = result.id; loot = result.loot; monsters = result.monsters;
    } else {
      loot = Array.from({ length: 31 }, function () { return window.HamsterRules.drop(Math.random()); });
      monsters = Array.from({ length: 30 }, function () { return window.HamsterRules.monster(Math.random(), Math.random(), map); });
    }
    active = { id: id, ranked: ranked, seq: 0, score: 0, lastFrame: 0, claimed: {}, defeated: {}, forage: {}, loot: loot };
    notify(); return { loot: loot, monsters: monsters, rulesVersion: 6, ranked: ranked, purchases: profile.purchases.slice() };
  }
  function record(kind, data, frame) {
    if (!active) return null;
    if (kind === 'pickup') {
      if (active.claimed[data.target] || !active.defeated[data.target] || !active.loot[data.target]) return null;
      active.claimed[data.target] = true;
    }
    if (kind === 'forage') { if (active.forage[data.source]) return null; active.forage[data.source] = true; }
    active.lastFrame = Math.max(active.lastFrame, Math.floor(frame));
    var event = Object.assign({}, data, { kind: kind, frame: active.lastFrame, seq: ++active.seq });
    if (active.ranked) {
      var run = outbox.find(function (r) { return r.id === active.id; });
      if (!run) { run = { id: active.id, loot: active.loot, events: [] }; outbox.push(run); }
      run.events.push(event); persist(outbox, wallet);
    } else {
      var beforeScore = active.score;
      if (kind === 'pickup') {
        var drop = active.loot[data.target]; if (drop === 'coin') guestProfile.sqk++; else if (drop === 'small' || drop === 'big') active.score += drop === 'big' ? 5 : 1;
      }
      if (kind === 'forage') active.score += window.HamsterRules.forageValue(data.source);
      if (kind === 'finish') guestProfile.highest_map = Math.max(guestProfile.highest_map, data.map + 1);
      guestProfile.total_score += active.score - beforeScore; guestProfile.produce_points += active.score - beforeScore;
      notify();
    }
    if (kind === 'defeat') active.defeated[data.target] = true;
    if (kind === 'death' || kind === 'finish') { active = null; void flush(); }
    else if (kind === 'forage' || kind === 'pickup') void flush();
    return event.seq;
  }
  async function saveName(name) {
    if (!window.HamsterRules.validName(name)) throw new Error('Use 2–20 letters, numbers, spaces, underscores or hyphens.');
    if (cloud) await rpc('hf_profile', { p_name: name.trim() }); else { profile.name = name.trim(); notify(); }
  }
  async function purchase(id) {
    if (!cloud) throw new Error('Connect MetaMask and sign in to buy persistent items.');
    if (!window.HamsterRules.catalogue.some(function (i) { return i.id === id; })) throw new Error('Choose a current marketplace item.');
    var epoch = generation; await flush(); if (epoch !== generation || !cloud) throw new Error('The wallet changed. Open Marketplace again.');
    if (hasConflict()) throw new Error(conflictMessage());
    if (outbox.length) throw new Error('Retry the pending cloud save before purchasing.');
    await rpc('hf_purchase', { p_item: id });
  }
  async function equip(slot, id) {
    if (!cloud) throw new Error('Connect MetaMask and sign in to equip a costume.');
    await rpc('hf_equip', { p_slot: slot, p_item: id || null });
  }
  async function leaderboard() {
    if (!CLOUD) throw new Error('Lifetime rankings need the existing Supabase project to be configured. Guests are unranked.');
    await requireBackend();
    return request('/rest/v1/rpc/hf_lifetime_top100', {});
  }
  async function retry() {
    if (!cloud) { await requireBackend(true); await restore(generation); return; }
    var epoch = generation;
    await flush();
    if (epoch !== generation || outbox.some(function (r) { return !r.conflict; })) return;
    try { await rpc('hf_wallet_profile'); if (epoch === generation) { await flush(); status = savedStatus(); } }
    catch (error) { if (epoch === generation) status = 'Unable to refresh this wallet profile. ' + error.message + ' Check your connection and retry.'; }
    notify();
  }
  async function recover() {
    if (!cloud || !session) throw new Error('Sign in with this wallet before recovering its map.');
    var epoch = generation, address = wallet;
    await flush();
    if (epoch !== generation) throw new Error('The wallet changed. Open Profile again.');
    if (!hasConflict()) throw new Error('No ended map needs recovery. Retry any pending cloud save.');
    if (outbox.some(function (r) { return !r.conflict; })) throw new Error('Retry the other pending cloud saves before recovering this map.');
    await rpc('hf_wallet_profile');
    if (epoch !== generation) throw new Error('The wallet changed. Open Profile again.');
    var archived = recovery.slice();
    outbox.forEach(function (run) {
      var index = archived.findIndex(function (r) { return r.id === run.id; });
      var copy = Object.assign({}, run, { recoveredAt: new Date().toISOString() });
      if (index < 0) archived.push(copy); else archived[index] = copy;
    });
    // Do not unblock play by silently throwing away rejected progress. Keep a
    // durable, wallet-specific recovery record before retiring the active queue.
    if (!write('-wallet-recovery-' + address, archived)) throw new Error('Browser storage could not keep the recovery record. Keep this page open and download the record from Profile before freeing site storage and trying again.');
    outbox.forEach(function (run) { retire(run, address, Math.max(run.ack || 0, ...run.events.map(function (e) { return e.seq; }))); });
    recovery = archived; outbox = []; persist(outbox, address);
    status = 'Cloud profile restored. Unsent events are kept in the recovery record on this browser; they have not been credited.';
    notify();
  }
  window.HamsterSave = {
    ready: CLOUD ? Promise.resolve().then(function () { return requireBackend(); }).catch(function () {}) : Promise.resolve(),
    checkConnection: function () { return requireBackend(true); }, beginMap: beginMap, record: record, flush: flush,
    setWallet: setWallet, signIn: signIn,
    saveName: function (name) { return mutate(function () { return saveName(name); }); },
    purchase: function (id) { return mutate(function () { return purchase(id); }); },
    equip: function (slot, id) { return mutate(function () { return equip(slot, id); }); }, leaderboard: leaderboard,
    legacyRecord: function () { return { warning: 'Unverified browser data. Not credited to the leaderboard.', profile: read('-guest', null) }; },
    subscribe: function (fn) { listeners.push(fn); },
    retry: retry, recover: function () { return mutate(recover); },
    recoveryRecord: function () { return JSON.parse(JSON.stringify({ wallet: wallet, runs: recovery.concat(outbox.filter(function (r) { return r.conflict; })) })); },
    snapshot: function () { return { profile: JSON.parse(JSON.stringify(profile)), cloud: cloud, configured: CLOUD, backendState: backendState, backendError: backendError, backendCheckedAt: backendCheckedAt, status: !cloud && backendState === 'unavailable' ? backendError : status, storageOK: storageOK, pendingCoins: pendingCoins(), pendingEvents: outbox.reduce(function (n, r) { return n + (r.conflict ? 0 : r.events.length); }, 0), pendingRewards: pendingRewards(), runConflict: hasConflict(), recoveryEvents: recovery.concat(outbox.filter(function (r) { return r.conflict; })).reduce(function (n, r) { return n + r.events.length; }, 0), ranked: Boolean(active && active.ranked), playingGuest: Boolean(active && !active.ranked), localLegacyAvailable: Boolean(read('-guest', null)), legacyAvailable: Boolean(read('-session', null)), wallet: wallet }; }
  };
  window.addEventListener('online', function () { if (cloud) void flush(); });
  window.addEventListener('pagehide', function () { if (cloud) void flush(); });
  setInterval(function () { if (cloud && (outbox.length || pendingRewards()) && !flushing && navigator.onLine) void flush(); }, 4000);
})();
