/* Supabase Auth + PostgREST. No private key, wallet signature or client score
   submission. Guest progress is separate and is never imported as cloud credit. */
(function () {
  'use strict';
  var config = window.HAMSTER_CONFIG || { supabaseUrl: '', supabasePublishableKey: '' };
  var CLOUD = Boolean(config.supabaseUrl && config.supabasePublishableKey);
  var url = String(config.supabaseUrl || '').replace(/\/$/, '');
  var prefix = 'hamster-friendship-v2';
  var storageOK = true;
  var listeners = [];
  function read(key, fallback) {
    try { return JSON.parse(localStorage.getItem(prefix + key) || 'null') || fallback; }
    catch (_) { storageOK = false; return fallback; }
  }
  function write(key, value) {
    try { localStorage.setItem(prefix + key, JSON.stringify(value)); }
    catch (_) { storageOK = false; }
  }
  function empty() { return { name: 'Guest', sqk: 0, total_score: 0, highest_map: 1, purchases: [], cosmetics: {} }; }
  var guest = Object.assign(empty(), read('-guest', {}));
  if (!Array.isArray(guest.purchases)) guest.purchases = [];
  if (!guest.cosmetics || typeof guest.cosmetics !== 'object') guest.cosmetics = {};
  function upgrade(p) {
    if (!p.dice) p.dice = { rounds: 0, correct: 0, wins: 0, draws: 0 };
    if (!Array.isArray(p.badges)) p.badges = [];
    if (!Array.isArray(p.exchanged)) p.exchanged = [];
    if (!Array.isArray(p.diceReceipts)) p.diceReceipts = [];
    return p;
  }
  upgrade(guest);
  var profile = guest;
  var mutation = Promise.resolve(), rpcFlight = Promise.resolve();
  /** @template T @param {() => T | PromiseLike<T>} fn @returns {Promise<T>} */
  function serialized(fn) { var result = mutation.then(fn); mutation = result.then(function () {}, function () {}); return result; }
  function guestAction(fn) {
    var work = function () {
      // Re-read inside the cross-tab lock. A badge removal and its SQK credit
      // are one storage write, so a refresh cannot split the exchange.
      guest = upgrade(Object.assign(empty(), read('-guest', guest))); profile = guest;
      var result = fn(); write('-guest', guest); notify(); return result;
    };
    return navigator.locks ? navigator.locks.request(prefix + '-guest', work) : Promise.resolve(work());
  }
  var session = read('-session', null);
  var outbox = read('-outbox', []);
  if (!Array.isArray(outbox)) outbox = [];
  var cloud = false, status = CLOUD ? 'Connecting to cloud saves…' : 'Guest progress is saved on this device. Cloud play is not configured.';
  var active = null, flushing = null, refreshFlight = null, retryAfter = 0;
  function notify() { listeners.forEach(function (fn) { fn(); }); }
  function pendingCoins() {
    return outbox.reduce(function (sum, run) { return sum + run.events.filter(function (e) { return e.kind === 'collect'; }).length; }, 0);
  }
  async function request(path, body, token = undefined) {
    var controller = new AbortController();
    var timer = setTimeout(function () { controller.abort(); }, 10000);
    try {
      var response = await fetch(url + path, {
        method: 'POST', headers: Object.assign({ apikey: config.supabasePublishableKey, 'Content-Type': 'application/json' }, token ? { Authorization: 'Bearer ' + token } : {}),
        body: JSON.stringify(body), signal: controller.signal
      });
      var data = await response.json().catch(function () { return {}; });
      if (!response.ok) {
        var error = Object.assign(new Error(data.msg || data.message || data.error_description || 'The cloud request failed. Try again.'), { status: response.status });
        throw error;
      }
      return data;
    } finally { clearTimeout(timer); }
  }
  async function token() {
    if (!session) throw new Error('Create a cloud profile first.');
    if (session.expires_at > Date.now() / 1000 + 60) return session.access_token;
    if (!refreshFlight) refreshFlight = request('/auth/v1/token?grant_type=refresh_token', { refresh_token: session.refresh_token }).then(function (data) {
      session = Object.assign(data, { expires_at: Date.now() / 1000 + data.expires_in });
      write('-session', session);
      return session.access_token;
    }).finally(function () { refreshFlight = null; });
    return refreshFlight;
  }
  function rpc(name, body = {}) {
    var result = rpcFlight.then(async function () {
      var data = await request('/rest/v1/rpc/' + name, body, await token());
      // Apply snapshots in request order so a slow response cannot roll back SQK.
      if (data.profile) accept(data.profile); else if (data.name) accept(data);
      return data;
    });
    rpcFlight = result.catch(function () {}); return result;
  }
  function accept(data) { profile = data; cloud = true; notify(); }
  function persistOutbox() { write('-outbox', outbox); notify(); }
  async function flush() {
    if (!cloud) { await mutation; return; }
    if (!outbox.length) return;
    if (flushing) return flushing;
    flushing = (async function () {
      try {
        while (outbox.length) {
          var run = outbox[0];
          if (!run.events.length) { outbox.shift(); persistOutbox(); continue; }
          var events = run.events.slice(0, 128);
          var result = await rpc('hf_progress', { p_run: run.id, p_events: events });
          run.events = run.events.filter(function (event) { return event.seq > result.ack; });
          if (!run.events.length) outbox.shift();
          persistOutbox();
        }
        status = 'Cloud saved.';
        retryAfter = 0;
      } catch (error) {
        retryAfter = Date.now() + 30000;
        status = 'Cloud save pending. ' + error.message + ' Use Retry cloud save before clearing this browser.';
      } finally { flushing = null; notify(); }
    })();
    return flushing;
  }
  async function connectCloud() {
    if (!CLOUD) return;
    try {
      if (!/^https:\/\//.test(url)) throw new Error('The owner must set an HTTPS Supabase URL.');
      if (!session) {
        var data = await request('/auth/v1/signup', { data: {} });
        if (!data.access_token) throw new Error('Enable anonymous sign-ins in Supabase Auth.');
        session = Object.assign(data, { expires_at: Date.now() / 1000 + data.expires_in });
        write('-session', session);
      }
      await rpc('hf_profile');
      status = 'Cloud saved.';
      await flush();
    } catch (error) {
      status = 'Cloud unavailable. ' + error.message + ' Guest play remains available; guest progress stays on this device.';
      cloud = false; profile = guest;
    }
    notify();
  }
  var ready = connectCloud();
  function uuid() { return crypto.randomUUID ? crypto.randomUUID() : String(Date.now()) + '-' + Math.random().toString(36).slice(2); }
  async function beginMap(map) {
    await ready;
    if (active) record('death', {}, active.lastFrame || 0);
    await flush();
    var loot = Array.from({ length: 31 }, function () { return window.HamsterRules.drop(Math.random()); });
    var coins = Array.from({ length: 31 }, function () { return window.HamsterRules.coinDrop(Math.random()); });
    var monsters = Array.from({ length: 30 }, function () { return window.HamsterRules.monster(Math.random(), Math.random(), map); });
    var ranked = false, id = uuid(), rulesVersion = 3;
    if (cloud) {
      if (outbox.length) throw new Error('Your last cloud save is pending. Retry it before starting a cloud map.');
      var data = await rpc(profile.dice ? 'hf_start_run_v3' : 'hf_start_run', { p_map: map });
      id = data.id; loot = data.loot; ranked = true;
      coins = data.coinDrops || Array(31).fill(true);
      monsters = data.monsters || window.HamsterRules.spawns.map(function (spawn) { return { type: spawn[0], size: 'large', hp: Math.ceil(100 * Math.pow(1.2, map - 1)), damage: Math.pow(1.2, map - 1) }; });
      rulesVersion = data.rulesVersion || 2;
    }
    active = { id: id, seq: 0, ranked: ranked, lastFrame: 0, claimed: {}, defeated: {}, loot: loot, coins: coins };
    notify();
    return { loot: loot, coinDrops: coins, monsters: monsters, rulesVersion: rulesVersion, ranked: ranked, purchases: profile.purchases.slice() };
  }
  function record(kind, data, frame) {
    if (!active) return null;
    active.lastFrame = Math.max(active.lastFrame, Math.floor(frame));
    var event = Object.assign({}, data, { kind: kind, frame: active.lastFrame, seq: ++active.seq });
    if (active.ranked) {
      var run = outbox.find(function (r) { return r.id === active.id; });
      if (!run) { run = { id: active.id, events: [] }; outbox.push(run); }
      run.events.push(event);
      persistOutbox();
    } else {
      var apply = null;
      if (kind === 'collect' && active.defeated[data.target] && active.coins[data.target] && !active.claimed[data.target]) {
        active.claimed[data.target] = true; apply = function () { guest.sqk++; };
      } else if (kind === 'defeat' && !active.defeated[data.target]) {
        active.defeated[data.target] = true; apply = function () { guest.total_score += data.target === 30 ? 500 : 100; };
      } else if (kind === 'finish') {
        apply = function () {
          guest.highest_map = Math.max(guest.highest_map, data.map + 1); guest.total_score += 1000;
          window.HamsterRules.tiers.forEach(function (tier) {
            var id = 'skill-' + tier.tier;
            if (guest.highest_map - 1 >= tier.maps && !guest.badges.some(function (b) { return b.id === id; }) && !guest.exchanged.includes(id)) guest.badges.push({ id: id, tier: tier.tier, source: 'skill' });
          });
        };
      }
      if (apply) {
        if (navigator.locks) void serialized(function () { return guestAction(apply); });
        else void guestAction(apply);
      }
    }
    if (kind === 'death' || kind === 'finish') { active = null; void flush(); }
    return event.seq;
  }
  async function saveName(name) {
    name = name.trim();
    if (!window.HamsterRules.validName(name)) throw new Error('Use 2–20 letters, numbers, spaces, underscores or hyphens.');
    if (cloud) await rpc('hf_profile', { p_name: name });
    else await guestAction(function () { guest.name = name; });
  }
  async function purchase(id) {
    var item = window.HamsterRules.catalogue.find(function (i) { return i.id === id; });
    if (!item) throw new Error('Choose an item from the marketplace.');
    if (cloud) {
      await flush();
      if (outbox.length) throw new Error('Retry your pending cloud save before purchasing.');
      await rpc('hf_purchase', { p_item: id });
    } else await guestAction(function () {
      if (!guest.purchases.includes(id)) {
        if (guest.sqk < item.price) throw new Error('Collect ' + (item.price - guest.sqk) + ' more SQK to buy this item.');
        guest.sqk -= item.price; guest.purchases.push(id);
      }
    });
  }
  async function equip(slot, id) {
    if (id && !profile.purchases.includes(id)) throw new Error('Buy this item before equipping it.');
    if (id) {
      var item = window.HamsterRules.catalogue.find(function (i) { return i.id === id; });
      if (!item || item.slot !== slot || slot === 'skill') throw new Error('Choose a matching cosmetic.');
    }
    if (cloud) await rpc('hf_equip', { p_slot: slot, p_item: id || null });
    else await guestAction(function () { guest.cosmetics[slot] = id || null; });
  }
  function requireUpgrade() { if (cloud && !profile.dice) throw new Error('SQK Dice and Badge Exchange need Supabase migration 002. Forest play and existing saves remain available.'); }
  async function playDice(prediction, requestId) {
    if (prediction !== 'HIGH' && prediction !== 'LOW') throw new Error('Choose HIGH or LOW before rolling.');
    var id = requestId || uuid(); requireUpgrade();
    if (cloud) return (await rpc('hf_dice', { p_prediction: prediction, p_request: id })).round;
    return guestAction(function () {
      var old = guest.diceReceipts.find(function (r) { return r.id === id; }); if (old) { if (old.prediction !== prediction) throw new Error('Retry with the original prediction for this request.'); return old; }
      var rules = window.HamsterRules;
      var round = Object.assign({ id: id }, rules.diceResult(rules.die(), rules.die(), prediction));
      guest.dice.rounds++; if (round.correct) { guest.dice.correct++; guest.dice.wins++; }
      if (round.outcome === 'DRAW') guest.dice.draws++;
      rules.tiers.forEach(function (tier) { var bid = 'dice-' + tier.tier; if (guest.dice.correct >= tier.correct && !guest.badges.some(function (b) { return b.id === bid; })) guest.badges.push({ id: bid, tier: tier.tier, source: 'dice' }); });
      guest.diceReceipts.push(round); return round;
    });
  }
  async function exchangeBadge(id) {
    requireUpgrade();
    if (cloud) { await flush(); if (outbox.length) throw new Error('Retry your pending cloud save before exchanging.'); await rpc('hf_exchange_badge', { p_badge: id }); return; }
    return guestAction(function () {
      if (guest.exchanged.includes(id)) return;
      var badge = guest.badges.find(function (b) { return b.id === id; });
      if (!badge || (badge.source !== 'skill' && badge.source !== 'contribution')) throw new Error('Only earned skill or contribution badges can be exchanged. Dice achievements stay on display.');
      var tier = window.HamsterRules.tiers.find(function (t) { return t.tier === badge.tier; });
      if (!tier) throw new Error('This badge has no exchange value.');
      guest.badges = guest.badges.filter(function (b) { return b.id !== id; }); guest.exchanged.push(id); guest.sqk += tier.sqk;
    });
  }
  async function leaderboard() {
    if (!CLOUD) throw new Error('The global Top 100 opens after the owner connects Supabase. Guest scores stay on this device.');
    // Only the RPC's public display names, scores and map tiers leave the backend.
    return request('/rest/v1/rpc/hf_top100', {});
  }
  window.HamsterSave = {
    ready: ready, beginMap: beginMap, record: record, flush: flush, saveName: function (name) { return serialized(function () { return saveName(name); }); }, purchase: function (id) { return serialized(function () { return purchase(id); }); }, equip: function (slot, id) { return serialized(function () { return equip(slot, id); }); }, playDice: function (prediction, id) { return serialized(function () { return playDice(prediction, id); }); }, exchangeBadge: function (id) { return serialized(function () { return exchangeBadge(id); }); }, leaderboard: leaderboard,
    subscribe: function (fn) { listeners.push(fn); },
    retry: async function () { if (!cloud) await connectCloud(); else await flush(); },
    snapshot: function () { return { profile: JSON.parse(JSON.stringify(profile)), cloud: cloud, configured: CLOUD, status: status, storageOK: storageOK, pendingCoins: pendingCoins(), pendingEvents: outbox.reduce(function (n, r) { return n + r.events.length; }, 0), ranked: Boolean(active && active.ranked), playingGuest: Boolean(active && !active.ranked) }; }
  };
  window.addEventListener('storage', function (e) { if (e.key === prefix + '-guest' && !cloud && !active) { guest = upgrade(Object.assign(empty(), read('-guest', guest))); profile = guest; notify(); } });
  window.addEventListener('online', function () { if (cloud) void flush(); });
  // A short batching interval, not a dependency of guest play. Failed writes stay
  // in the durable outbox until the player retries or the browser comes online.
  setInterval(function () { if (cloud && outbox.length && !flushing && navigator.onLine && Date.now() >= retryAfter) void flush(); }, 2000);
})();
