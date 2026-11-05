/* Original procedural lullaby and short effects. No network/audio downloads. */
(function () {
  'use strict';
  var key = 'hamster-friendship-audio', context, musicGain, sfxGain, limiter, masterGain, voices = 0, maxVoices = 24, nextNote = 0, beat = 0, playing = false, storageOK = true;
  var settings = { music: 0.3, sfx: 0.55, musicMuted: false, sfxMuted: false };
  try { Object.assign(settings, JSON.parse(localStorage.getItem(key) || '{}')); } catch (_) { storageOK = false; }
  ['music', 'sfx'].forEach(function (k) { settings[k] = Math.max(0, Math.min(1, Number(settings[k]) || 0)); });
  var melody = [60, 64, 67, 69, 67, 64, 62, 64, 60, 64, 67, 72, 69, 67, 64, 62];
  var effects = { move: [160], attack: [330, 180], jump: [262, 392], coin: [784, 1047], item: [523, 659], quest: [523, 659, 784], chest: [392, 523, 659, 784], level: [523, 659, 784, 1047], victory: [523, 659, 784, 1047, 784, 1047], hurt: [180, 110] };
  var last = {};
  var weapons = {
    shell: { notes: [420, 260], wave: 'triangle', duration: 0.10, sweep: 0.7, volume: 0.25 },
    gun: { notes: [155], wave: 'sawtooth', duration: 0.075, sweep: 0.18, volume: 0.35 },
    sword: { notes: [1200, 790], wave: 'triangle', duration: 0.16, sweep: 0.28, volume: 0.25 },
    bomb: { notes: [95, 63], wave: 'sine', duration: 0.28, sweep: 0.45, volume: 0.42 }
  };
  function gains() {
    if (!context) return;
    musicGain.gain.setTargetAtTime(playing && !settings.musicMuted ? settings.music * 0.24 : 0, context.currentTime, 0.025);
    sfxGain.gain.setTargetAtTime(settings.sfxMuted ? 0 : settings.sfx * 0.28, context.currentTime, 0.025);
  }
  function tone(freq, start, duration, target, wave, volume, sweep) {
    if (!context || context.state !== 'running' || voices >= maxVoices) return;
    var oscillator = context.createOscillator(), envelope = context.createGain();
    voices++;
    oscillator.type = wave || 'sine'; oscillator.frequency.setValueAtTime(freq, start);
    if (sweep) oscillator.frequency.exponentialRampToValueAtTime(Math.max(20, freq * sweep), start + duration);
    envelope.gain.setValueAtTime(0, start); envelope.gain.linearRampToValueAtTime(volume || 0.3, start + 0.015);
    envelope.gain.exponentialRampToValueAtTime(0.001, start + duration);
    oscillator.connect(envelope); envelope.connect(target); oscillator.start(start); oscillator.stop(start + duration + 0.03);
    oscillator.onended = function () { voices--; oscillator.disconnect(); envelope.disconnect(); };
  }
  async function unlock() {
    try {
      if (!context) {
        var Audio = window.AudioContext || window.webkitAudioContext;
        if (!Audio) return false;
        context = new Audio(); musicGain = context.createGain(); sfxGain = context.createGain();
        limiter = context.createDynamicsCompressor(); masterGain = context.createGain();
        limiter.threshold.value = -18; limiter.knee.value = 18; limiter.ratio.value = 12;
        limiter.attack.value = 0.004; limiter.release.value = 0.18; masterGain.gain.value = 0.65;
        musicGain.connect(limiter); sfxGain.connect(limiter); limiter.connect(masterGain); masterGain.connect(context.destination); gains();
      }
      if (context.state === 'suspended') await context.resume();
      return context.state === 'running';
    } catch (_) { return false; }
  }
  function sfx(kind) {
    if (!context || context.state !== 'running' || settings.sfxMuted || document.hidden) return;
    var now = context.currentTime;
    if (now - (last[kind] === undefined ? -10 : last[kind]) < (kind === 'move' ? 0.19 : 0.06)) return;
    last[kind] = now;
    var weapon = weapons[kind];
    if (weapon) {
      weapon.notes.forEach(function (f, i) { tone(f, now + i * 0.025, weapon.duration, sfxGain, weapon.wave, weapon.volume, weapon.sweep); });
      return;
    }
    (effects[kind] || effects.item).forEach(function (f, i) { tone(f, now + i * 0.075, kind === 'victory' ? 0.45 : 0.16, sfxGain, kind === 'attack' ? 'triangle' : 'sine', kind === 'move' ? 0.1 : 0.4); });
  }
  // Bounded look-ahead; no sound nodes accumulate when muted, paused or hidden.
  setInterval(function () {
    if (!context || context.state !== 'running' || !playing || settings.musicMuted || !settings.music || document.hidden) { nextNote = 0; return; }
    if (nextNote < context.currentTime) nextNote = context.currentTime + 0.04;
    while (nextNote < context.currentTime + 0.25) {
      var note = melody[beat % melody.length];
      tone(440 * Math.pow(2, (note - 69) / 12), nextNote, 0.85, musicGain, 'sine', 0.42);
      if (beat % 4 === 0) tone(440 * Math.pow(2, (48 + (beat % 8 === 0 ? 0 : 5) - 69) / 12), nextNote, 1.7, musicGain, 'triangle', 0.17);
      beat++; nextNote += 0.48;
    }
  }, 100);
  function set(name, value) {
    if (name === 'music' || name === 'sfx') settings[name] = Math.max(0, Math.min(1, Number(value) || 0));
    else if (name === 'musicMuted' || name === 'sfxMuted') settings[name] = Boolean(value);
    try { localStorage.setItem(key, JSON.stringify(settings)); } catch (_) { storageOK = false; }
    gains();
  }
  window.HamsterAudio = { unlock: unlock, sfx: sfx, set: set, play: function (on) { playing = Boolean(on); gains(); }, snapshot: function () { return Object.assign({ available: Boolean(window.AudioContext || window.webkitAudioContext), unlocked: Boolean(context && context.state === 'running'), playing: playing, storageOK: storageOK }, settings); } };
  document.addEventListener('visibilitychange', function () { if (document.hidden) { playing = false; gains(); } });
})();
