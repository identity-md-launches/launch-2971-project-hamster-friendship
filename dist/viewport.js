/* Display sizing and optional orientation/fullscreen. Never changes identity or
   starts a map. Pinch zoom remains available outside the gameplay controls. */
(function () {
  'use strict';
  var root = document.documentElement, viewport = window.visualViewport;
  var coarse = window.matchMedia('(pointer: coarse)');
  var overlay = document.getElementById('rotate-overlay');
  var fullscreen = document.getElementById('btn-fullscreen');
  var fullscreenMenu = document.getElementById('btn-fullscreen-menu');
  var notice = document.getElementById('viewport-notice');
  var wasPortrait = false, dismissed = false, resumeAfterRotate = false, scheduled = false;
  var lockPending = false;
  function showNotice(text) {
    document.getElementById('viewport-message').textContent = text; notice.hidden = false;
  }
  document.getElementById('close-viewport-notice').addEventListener('click', function () {
    notice.hidden = true;
    (fullscreen.getClientRects().length ? fullscreen : document.getElementById('btn-menu')).focus({ preventScroll: true });
  });
  function sync() {
    scheduled = false;
    // Convert to the scale-1 coordinate space: pinch zoom magnifies the game
    // instead of shrinking its CSS box. Browser bars/keyboard still resize it.
    var height = viewport ? viewport.height * viewport.scale : window.innerHeight;
    var width = viewport ? viewport.width * viewport.scale : window.innerWidth;
    root.style.setProperty('--play-height', height + 'px');
    root.style.setProperty('--play-width', width + 'px');
    var portrait = coarse.matches && height > width;
    var state = window.__hamster.snapshot().state;
    if (!portrait) {
      dismissed = false; overlay.hidden = true;
      if (resumeAfterRotate && state === 'paused' && !document.querySelector('dialog[open]')) window.__hamster.resume();
      resumeAfterRotate = false;
    } else {
      var running = state === 'playing' || state === 'dialogue' || state === 'paused';
      overlay.hidden = !running || dismissed || Boolean(document.querySelector('dialog[open]'));
      var newlyShown = !overlay.hidden && !document.body.classList.contains('is-rotation-blocked');
      if (!overlay.hidden && (state === 'playing' || state === 'dialogue')) {
        resumeAfterRotate = true; window.__hamster.pause();
      }
      if (newlyShown) document.getElementById('btn-portrait').focus({ preventScroll: true });
    }
    document.body.classList.toggle('is-rotation-blocked', !overlay.hidden);
    if (portrait !== wasPortrait) window.dispatchEvent(new Event('hamster:viewport'));
    wasPortrait = portrait;
  }
  function schedule() { if (!scheduled) { scheduled = true; requestAnimationFrame(sync); } }
  async function landscape() {
    if (!coarse.matches || lockPending) return;
    if (!screen.orientation || !screen.orientation.lock) { schedule(); return; }
    lockPending = true;
    try { await screen.orientation.lock('landscape'); }
    catch (_) { /* The rotate overlay is the visible fallback. */ }
    finally { lockPending = false; schedule(); }
  }
  document.getElementById('btn-portrait').addEventListener('click', function () {
    dismissed = true; overlay.hidden = true;
    window.__hamster.resume();
    resumeAfterRotate = false;
    schedule();
  });
  if (!root.requestFullscreen) { fullscreen.hidden = true; fullscreenMenu.hidden = true; }
  fullscreenMenu.addEventListener('click', function () {
    (/** @type {HTMLDialogElement} */ (document.getElementById('menu-dialog'))).close();
    fullscreen.click();
  });
  fullscreen.addEventListener('click', async function () {
    try {
      if (document.fullscreenElement) { await document.exitFullscreen(); return; }
      await root.requestFullscreen(); notice.hidden = true; await landscape();
    } catch (_) { showNotice('Fullscreen is unavailable. Rotate manually, or add this page to your Home Screen on iPhone.'); }
    schedule();
  });
  document.addEventListener('fullscreenchange', function () {
    fullscreen.setAttribute('aria-label', document.fullscreenElement ? 'Exit fullscreen' : 'Enter fullscreen'); schedule();
  });
  document.getElementById('immersive-help').textContent = window.matchMedia('(display-mode: standalone)').matches || navigator.standalone
    ? 'Home Screen mode · rotate your device for landscape play.'
    : /iPhone|iPad|iPod/.test(navigator.userAgent)
      ? 'For a full-screen view in Safari: Share → Add to Home Screen. Safari controls cannot be hidden by this game.'
      : 'Use Fullscreen when supported, or add this page to your Home Screen from your browser menu.';
  window.addEventListener('resize', schedule);
  window.addEventListener('orientationchange', schedule);
  window.addEventListener('hamster:playing', function () { void landscape(); schedule(); });
  window.addEventListener('hamster:wallet-connected', function () { void landscape(); schedule(); });
  if (screen.orientation) screen.orientation.addEventListener('change', schedule);
  if (viewport) { viewport.addEventListener('resize', schedule); viewport.addEventListener('scroll', schedule); }
  document.querySelectorAll('dialog').forEach(function (dialog) { dialog.addEventListener('close', schedule); });
  document.addEventListener('visibilitychange', function () { if (!document.hidden) schedule(); });
  sync();
})();
