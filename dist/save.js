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
  var profile = guest;
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
  async function rpc(name, body = {}) { return request('/rest/v1/rpc/' + name, body, await token()); }
  function accept(data) { profile = data; cloud = true; notify(); }
  function persistOutbox() { write('-outbox', outbox); notify(); }
  async function flush() {
    if (!cloud || !outbox.length) return;
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
          accept(result.profile);
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
      accept(await rpc('hf_profile'));
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
    var ranked = false, id = uuid();
    if (cloud) {
      if (outbox.length) throw new Error('Your last cloud save is pending. Retry it before starting a cloud map.');
      var data = await rpc('hf_start_run', { p_map: map });
      id = data.id; loot = data.loot; ranked = true;
      accept(data.profile);
    }
    active = { id: id, seq: 0, ranked: ranked, lastFrame: 0, claimed: {}, loot: loot };
    notify();
    return { loot: loot, ranked: ranked, purchases: profile.purchases.slice() };
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
    } else if (kind === 'collect' && !active.claimed[data.target]) {
      active.claimed[data.target] = true; guest.sqk++;
      write('-guest', guest); notify();
    } else if (kind === 'defeat') {
      guest.total_score += data.target === 30 ? 500 : 100;
      write('-guest', guest); notify();
    } else if (kind === 'finish') {
      guest.highest_map = Math.max(guest.highest_map, data.map + 1); guest.total_score += 1000;
      write('-guest', guest); notify();
    }
    if (kind === 'death' || kind === 'finish') { active = null; void flush(); }
    return event.seq;
  }
  async function saveName(name) {
    name = name.trim();
    if (!window.HamsterRules.validName(name)) throw new Error('Use 2–20 letters, numbers, spaces, underscores or hyphens.');
    if (cloud) accept(await rpc('hf_profile', { p_name: name }));
    else { guest.name = name; write('-guest', guest); notify(); }
  }
  async function purchase(id) {
    var item = window.HamsterRules.catalogue.find(function (i) { return i.id === id; });
    if (!item) throw new Error('Choose an item from the marketplace.');
    if (cloud) {
      await flush();
      if (outbox.length) throw new Error('Retry your pending cloud save before purchasing.');
      accept(await rpc('hf_purchase', { p_item: id }));
    } else {
      if (!guest.purchases.includes(id)) {
        if (guest.sqk < item.price) throw new Error('Collect ' + (item.price - guest.sqk) + ' more SQK to buy this item.');
        guest.sqk -= item.price; guest.purchases.push(id); write('-guest', guest); notify();
      }
    }
  }
  async function equip(slot, id) {
    if (id && !profile.purchases.includes(id)) throw new Error('Buy this item before equipping it.');
    if (id) {
      var item = window.HamsterRules.catalogue.find(function (i) { return i.id === id; });
      if (!item || item.slot !== slot || slot === 'skill') throw new Error('Choose a matching cosmetic.');
    }
    if (cloud) accept(await rpc('hf_equip', { p_slot: slot, p_item: id || null }));
    else { guest.cosmetics[slot] = id || null; write('-guest', guest); notify(); }
  }
  async function leaderboard() {
    if (!CLOUD) throw new Error('The global Top 100 opens after the owner connects Supabase. Guest scores stay on this device.');
    // Only the RPC's public display names, scores and map tiers leave the backend.
    return request('/rest/v1/rpc/hf_top100', {});
  }
  window.HamsterSave = {
    ready: ready, beginMap: beginMap, record: record, flush: flush, saveName: saveName, purchase: purchase, equip: equip, leaderboard: leaderboard,
    subscribe: function (fn) { listeners.push(fn); },
    retry: async function () { if (!cloud) await connectCloud(); else await flush(); },
    snapshot: function () { return { profile: JSON.parse(JSON.stringify(profile)), cloud: cloud, configured: CLOUD, status: status, storageOK: storageOK, pendingCoins: pendingCoins(), pendingEvents: outbox.reduce(function (n, r) { return n + r.events.length; }, 0), ranked: Boolean(active && active.ranked), playingGuest: Boolean(active && !active.ranked) }; }
  };
  window.addEventListener('online', function () { if (cloud) void flush(); });
  // A short batching interval, not a dependency of guest play. Failed writes stay
  // in the durable outbox until the player retries or the browser comes online.
  setInterval(function () { if (cloud && outbox.length && !flushing && navigator.onLine && Date.now() >= retryAfter) void flush(); }, 2000);
})();
