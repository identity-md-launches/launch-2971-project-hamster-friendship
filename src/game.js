/* Hamster Friendship: The Lost Alice. Chapter one.
   Plain browser JavaScript, no dependencies. The canvas renders at 320x192
   and is scaled up with CSS (image-rendering: pixelated). */
(function () {
  'use strict';

  // ---------------------------------------------------------------------------
  // Constants
  // ---------------------------------------------------------------------------
  var W = 320, H = 192, T = 16, ROWS = 12, COLS = 224;
  var WORLD_W = COLS * T;
  var ARENA_L = 184, ARENA_R = 207;
  var GRAVITY = 0.25, JUMP_V = 5.6, MAX_FALL = 5;
  var EMPTY = 0, DIRT = 1, BRANCH = 2, STONE = 3, WOOD = 4;

  function byId(id) { return document.getElementById(id); }
  var canvas = byId('game');
  var ctx = canvas.getContext('2d');
  ctx.imageSmoothingEnabled = false;

  var ui = {
    start: byId('screen-start'), pause: byId('screen-pause'), over: byId('screen-over'), end: byId('screen-end'),
    dialogue: byId('dialogue'), dlgName: byId('dlg-name'), dlgText: byId('dlg-text'), dlgNext: byId('dlg-next'),
    shells: byId('hud-shells'), hearts: byId('hud-hearts'), health: byId('hud-health'), clues: byId('hud-clues'),
    boss: byId('hud-boss'), bossBar: byId('hud-boss-bar'), bossFill: byId('hud-boss-fill'),
    toast: byId('toast'), endShells: byId('end-shells'), endClues: byId('end-clues'), endTime: byId('end-time'),
    btnPause: byId('btn-pause')
  };

  var motionQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
  var reduceMotion = motionQuery.matches;
  if (motionQuery.addEventListener) motionQuery.addEventListener('change', function (e) { reduceMotion = e.matches; });
  var coarseQuery = window.matchMedia('(pointer: coarse), (max-width: 52rem)');

  // ---------------------------------------------------------------------------
  // Small helpers
  // ---------------------------------------------------------------------------
  function rng(seed) {
    var a = seed >>> 0;
    return function () {
      a = (a + 0x6d2b79f5) >>> 0;
      var t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
  function sign(v) { return v > 0 ? 1 : v < 0 ? -1 : 0; }
  function makeLayer(w, h) {
    var c = document.createElement('canvas');
    c.width = w; c.height = h;
    var g = c.getContext('2d');
    g.imageSmoothingEnabled = false;
    return { c: c, g: g };
  }
  function rect(g, x, y, w, h, col) { g.fillStyle = col; g.fillRect(Math.round(x), Math.round(y), w, h); }
  function oval(g, cx, cy, rx, ry, col) {
    g.fillStyle = col;
    for (var dy = -ry; dy <= ry; dy++) {
      var k = 1 - (dy * dy) / ((ry + 0.5) * (ry + 0.5));
      if (k <= 0) continue;
      var half = Math.round(rx * Math.sqrt(k));
      g.fillRect(Math.round(cx - half), Math.round(cy + dy), half * 2, 1);
    }
  }
  function sprite(rows, pal) {
    var h = rows.length, w = rows[0].length, L = makeLayer(w, h);
    for (var y = 0; y < h; y++) {
      for (var x = 0; x < w; x++) {
        var ch = rows[y].charAt(x);
        if (ch !== '.' && pal[ch]) { L.g.fillStyle = pal[ch]; L.g.fillRect(x, y, 1, 1); }
      }
    }
    return L.c;
  }
  function mirror(src) {
    var L = makeLayer(src.width, src.height);
    L.g.translate(src.width, 0); L.g.scale(-1, 1); L.g.drawImage(src, 0, 0);
    return L.c;
  }
  function pair(src) { return [src, mirror(src)]; }
  function facing(p, dir) { return dir >= 0 ? p[0] : p[1]; }
  function overlap(a, b) { return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y; }
  function cx(o) { return o.x + o.w / 2; }

  // ---------------------------------------------------------------------------
  // Sprites
  // ---------------------------------------------------------------------------
  var HAMSTER_ROWS = [
    '....oo....oo....',
    '...opfo..opfo...',
    '..ofhhhoohhhfo..',
    '.ofhhhhhhhhhhfo.',
    '.offhhhhhhhwefo.',
    'offffffhhhheeffo',
    'offffffffffkffno',
    'offfgggggggggffo',
    'ogfGgggggggGcco.',
    'gGfffffcccccccco',
    '.offffcccccccco.',
    '..offfcccccccfo.',
    '...ooooooooooo..'
  ];
  var BLINK_ROWS = HAMSTER_ROWS.map(function (r, i) {
    if (i === 4) return r.replace('we', 'ff');
    if (i === 5) return r.replace('ee', 'oo');
    return r;
  });
  var PAL_CHANG = { o: '#3a2318', f: '#d9893b', h: '#efae5c', c: '#f6e2bd', e: '#1d120d', w: '#ffffff', n: '#e27f86', p: '#eaa0a0', g: '#5e8c3e', G: '#3f6229', k: '#f09a7c' };
  var PAL_ALICE = { o: '#4a3328', f: '#e6cfb3', h: '#fbf0de', c: '#fffaf0', e: '#1d120d', w: '#ffffff', n: '#e27f86', p: '#eaa0a0', g: '#c9423a', G: '#8e2a26', k: '#f3a3a0' };

  var CHESTNUT_ROWS = ['...oo...', '..obbo..', '.obhbbo.', 'obhbbbbo', 'obbbbbbo', 'occcccco', '.occcco.', '..oooo..'];
  var PAL_CHESTNUT = { o: '#3b1f12', b: '#8b4a22', h: '#d48a4e', c: '#e9cf9c' };
  var BERRY_ROWS = ['...g...', '..gGg..', '.orrro.', 'orwrrro', 'orrrrro', '.orrro.', '..ooo..'];
  var PAL_BERRY = { g: '#6f9a3c', G: '#4d7029', o: '#5a1416', r: '#d8383a', w: '#ffb3a8' };

  var BEETLE_ROWS = [
    '...ooooooo....',
    '.oobbbbbbhoo..',
    'obbbbbbbbbhodo',
    'obbbbbbbbbbodd',
    'oBbbbbbbbbbodo',
    'oBBbbbbbbbbooo',
    '.oBBBBBBBBBo..',
    '..oooooooooo..'
  ];
  var PAL_BEETLE = { o: '#1d1a1f', b: '#3f6b4a', h: '#b9dc95', B: '#284634', d: '#2a2026' };

  function makeBeetle(frame) {
    var L = makeLayer(14, 10);
    var legs = frame ? [2, 6, 10] : [3, 7, 11];
    for (var i = 0; i < legs.length; i++) { rect(L.g, legs[i], 8, 1, 2, '#1d1a1f'); }
    L.g.drawImage(sprite(BEETLE_ROWS, PAL_BEETLE), 0, 0);
    rect(L.g, 12, 3, 1, 1, '#f3e6b0');
    return L.c;
  }

  function makeAnt(frame) {
    var L = makeLayer(16, 14), g = L.g;
    var body = '#8e3324', dark = '#4c1a12', hi = '#c85a3c';
    var legs = frame ? [5, 8, 11] : [4, 7, 10];
    for (var i = 0; i < legs.length; i++) { rect(g, legs[i], 9, 1, 4, dark); rect(g, legs[i] + (frame ? 0 : -1), 13, 2, 1, dark); }
    oval(g, 4, 7, 4, 3, body);
    rect(g, 2, 5, 3, 1, hi);
    rect(g, 7, 7, 2, 2, dark);
    oval(g, 9, 7, 2, 2, body);
    oval(g, 12, 6, 2, 2, body);
    rect(g, 12, 5, 1, 1, hi);
    rect(g, 13, 6, 1, 1, '#fff4dc');
    rect(g, 14, 8, 2, 1, dark);
    rect(g, 15, 7, 1, 1, dark);
    // acorn cap helmet
    rect(g, 10, 2, 5, 2, '#a3733a');
    rect(g, 11, 1, 3, 1, '#6f4b22');
    rect(g, 12, 0, 1, 1, '#6f4b22');
    rect(g, 11, 2, 1, 1, '#6f4b22');
    rect(g, 13, 3, 1, 1, '#6f4b22');
    // antenna
    rect(g, 14, 4, 1, 1, dark); rect(g, 15, 3, 1, 1, dark);
    return L.c;
  }

  function makeLarva(frame) {
    var L = makeLayer(16, 9), g = L.g;
    var skin = '#efe2c2', fold = '#c9b282';
    for (var i = 0; i < 4; i++) {
      var lift = frame && (i === 1 || i === 2) ? 1 : 0;
      oval(g, 2 + i * 3, 5 - lift, 2, 3 - lift, skin);
      rect(g, 4 + i * 3, 3 - lift, 1, 5, fold);
    }
    oval(g, 13, 5, 2, 2, '#8a5426');
    rect(g, 14, 4, 1, 1, '#2a1a10');
    rect(g, 15, 6, 1, 2, '#2a1a10');
    rect(g, 3, 3, 2, 1, '#fff8e6');
    return L.c;
  }

  function makeRoach(frame) {
    var L = makeLayer(48, 28), g = L.g;
    var leg = '#2a160c', shellD = '#4a2512', shell = '#6e3b1c', hi = '#b8743a';
    var legX = [10, 18, 27, 34];
    for (var i = 0; i < legX.length; i++) {
      var off = (i % 2 === 0) === !!frame ? 1 : -1;
      rect(g, legX[i] + off, 19, 1, 6, leg);
      rect(g, legX[i] + off - 1, 25, 3, 1, leg);
      rect(g, legX[i] + off + 1, 22, 1, 1, leg);
    }
    oval(g, 21, 13, 19, 9, shellD);
    oval(g, 21, 12, 18, 8, shell);
    rect(g, 4, 13, 30, 1, shellD);
    rect(g, 10, 6, 16, 1, hi);
    rect(g, 7, 7, 5, 1, hi);
    rect(g, 26, 7, 3, 1, hi);
    oval(g, 37, 12, 6, 6, shellD);
    oval(g, 37, 11, 5, 5, '#8a4a22');
    rect(g, 35, 7, 4, 1, hi);
    oval(g, 43, 15, 3, 3, '#2f1a10');
    rect(g, 44, 13, 1, 1, '#f4d27a');
    rect(g, 46, 17, 2, 1, leg);
    var ant = frame ? [[45, 11], [46, 9], [46, 7], [45, 5], [44, 3], [42, 2], [40, 1], [37, 1]]
                    : [[45, 11], [46, 9], [47, 7], [47, 5], [46, 3], [44, 1], [42, 0], [39, 0]];
    for (var a = 0; a < ant.length; a++) rect(g, ant[a][0], ant[a][1], 1, 1, '#3a2014');
    return L.c;
  }

  function flipV(src) {
    var L = makeLayer(src.width, src.height);
    L.g.translate(0, src.height); L.g.scale(1, -1); L.g.drawImage(src, 0, 0);
    return L.c;
  }

  var GLYPHS = {
    E: ['###', '#..', '##.', '#..', '###'],
    '!': ['.#.', '.#.', '.#.', '...', '.#.']
  };

  var SPR = {
    chang: pair(sprite(HAMSTER_ROWS, PAL_CHANG)),
    changBlink: pair(sprite(BLINK_ROWS, PAL_CHANG)),
    alice: pair(sprite(HAMSTER_ROWS, PAL_ALICE)),
    aliceBlink: pair(sprite(BLINK_ROWS, PAL_ALICE)),
    shell: sprite(CHESTNUT_ROWS, PAL_CHESTNUT),
    berry: sprite(BERRY_ROWS, PAL_BERRY),
    beetle: [pair(makeBeetle(0)), pair(makeBeetle(1))],
    ant: [pair(makeAnt(0)), pair(makeAnt(1))],
    larva: [pair(makeLarva(0)), pair(makeLarva(1))],
    roach: [pair(makeRoach(0)), pair(makeRoach(1))]
  };
  SPR.roachDead = pair(flipV(makeRoach(0)));

  // ---------------------------------------------------------------------------
  // Level tiles
  // ---------------------------------------------------------------------------
  var grid = new Uint8Array(COLS * ROWS);
  function tileAt(c, r) {
    if (c < 0 || c >= COLS) return STONE;
    if (r < 0 || r >= ROWS) return EMPTY;
    return grid[r * COLS + c];
  }
  function setTile(c, r, v) { if (c >= 0 && c < COLS && r >= 0 && r < ROWS) grid[r * COLS + c] = v; }
  function fill(c0, c1, r0, r1, v) { for (var c = c0; c <= c1; c++) for (var r = r0; r <= r1; r++) setTile(c, r, v); }

  function buildTiles() {
    grid.fill(EMPTY);
    fill(0, 60, 10, 11, DIRT);          // village and forest edge
    fill(48, 51, 7, 7, BRANCH);
    fill(64, 103, 10, 11, DIRT);        // after the first pit
    fill(70, 71, 8, 9, STONE);
    fill(78, 81, 7, 7, BRANCH);
    fill(84, 88, 4, 4, BRANCH);         // high branch with the ribbon
    fill(104, 112, 8, 11, DIRT);        // ant plateau
    fill(113, 119, 10, 11, DIRT);
    fill(123, 166, 10, 11, DIRT);       // larva grove
    fill(136, 137, 8, 9, WOOD);
    fill(144, 148, 7, 7, BRANCH);
    fill(152, 156, 4, 4, BRANCH);
    fill(170, 223, 10, 11, DIRT);       // approach, arena and exit
    fill(190, 192, 7, 7, BRANCH);
    fill(199, 201, 7, 7, BRANCH);
  }
  buildTiles();

  var game = {
    state: 'title', t: 0, frames: 0, camX: 0, shake: 0, flash: 0, beam: 0,
    arenaLocked: false, bossDefeated: false, gateL: 0, gateR: 1,
    clues: 0, collected: 0, checkpoint: { x: 6 * T, y: 10 * T - 14 },
    dropTimer: 120, toastTimer: 0, prevState: 'playing'
  };

  function isSolid(c, r) {
    if (r <= 9 && ((c === ARENA_L && game.arenaLocked) || (c === ARENA_R && !game.bossDefeated))) return true;
    var t = tileAt(c, r);
    return t === DIRT || t === STONE || t === WOOD;
  }
  function standable(px, py) {
    var c = Math.floor(px / T), r = Math.floor(py / T);
    return isSolid(c, r) || tileAt(c, r) === BRANCH;
  }

  // Generic body movement against the tile map.
  function moveBody(b) {
    b.hitWall = false;
    b.x += b.vx;
    var r0 = Math.floor(b.y / T), r1 = Math.floor((b.y + b.h - 0.01) / T), r, c;
    if (b.vx > 0) {
      c = Math.floor((b.x + b.w - 0.01) / T);
      for (r = r0; r <= r1; r++) if (isSolid(c, r)) { b.x = c * T - b.w; b.vx = 0; b.hitWall = true; break; }
    } else if (b.vx < 0) {
      c = Math.floor(b.x / T);
      for (r = r0; r <= r1; r++) if (isSolid(c, r)) { b.x = (c + 1) * T; b.vx = 0; b.hitWall = true; break; }
    }
    if (b.x < 0) { b.x = 0; b.vx = 0; b.hitWall = true; }
    if (b.x + b.w > WORLD_W) { b.x = WORLD_W - b.w; b.vx = 0; b.hitWall = true; }

    var prevBottom = b.y + b.h;
    b.y += b.vy;
    b.onGround = false;
    var c0 = Math.floor(b.x / T), c1 = Math.floor((b.x + b.w - 0.01) / T);
    if (b.vy > 0) {
      r = Math.floor((b.y + b.h - 0.01) / T);
      var top = r * T;
      for (c = c0; c <= c1; c++) {
        if (isSolid(c, r) || (!b.solidOnly && tileAt(c, r) === BRANCH && prevBottom <= top + 0.5)) {
          b.y = top - b.h; b.vy = 0; b.onGround = true; break;
        }
      }
    } else if (b.vy < 0) {
      r = Math.floor(b.y / T);
      for (c = c0; c <= c1; c++) if (isSolid(c, r)) { b.y = (r + 1) * T; b.vy = 0; break; }
    }
  }

  // ---------------------------------------------------------------------------
  // Story text
  // ---------------------------------------------------------------------------
  var N = 'Narrator', C = 'Chang';
  var LINES = {
    intro: [
      [N, 'Evening in Chestnut Hollow. A strange beam of light has just struck the village.'],
      [C, 'Alice? I brought the tea leaves you wanted… Alice?'],
      [N, 'Her basket lies overturned. Chestnut shells are scattered along the path.'],
      [C, 'She would never leave her basket behind. Something happened here.'],
      [N, 'Gather shells as you go. Throw them with X, or hold C to raise one as a shield.']
    ],
    basket: [
      [C, 'Her favourite basket. Two shells are still tucked inside.'],
      [C, 'It’s warm, like it sat under that light.']
    ],
    scorch: [
      [N, 'A perfect ring of scorched grass, still smoking.'],
      [C, 'Whatever came down here was hot, and very round.']
    ],
    sign1: [[N, 'The signpost reads: “Chestnut Forest. Beetles nest past the old roots. Throw straight.”']],
    bush: [[N, 'You shake the bush. Three chestnut shells tumble out.']],
    bushEmpty: [[N, 'Just leaves now. You already shook this one.']],
    ribbon: [
      [C, 'Alice’s red ribbon, caught all the way up here!'],
      [C, 'She was carried over the treetops, toward the forest exit.']
    ],
    snail: [
      [N, 'An old snail peers out from her shell. This is Mrs. Pebble.'],
      ['Mrs. Pebble', 'Oh, young Chang. I saw a light skim the canopy, heading for the forest exit.'],
      ['Mrs. Pebble', 'The old cockroach guards that gate. He hoards anything shiny.'],
      [C, 'Then that’s where I’m going.'],
      ['Mrs. Pebble', 'Light the lanterns on your way, dear. They will bring you back if you stumble.']
    ],
    snailAgain: [['Mrs. Pebble', 'Mind the soldier ants. They charge when they spot you, so jump over them.']],
    lantern: [[N, 'The lantern flickers to life. Chang feels rested, and this spot is saved.']],
    log: [
      [N, 'Inside the hollow log: a trail of oily prints, too round and even for any bug.'],
      [C, 'Metal feet? And two shells someone dropped in a hurry.']
    ],
    sign2: [[N, 'Scratched into the bark: “Forest exit. Turn back, little one.”']],
    boss: [
      [N, 'The ground trembles. A giant cockroach blocks the forest exit.'],
      ['Cockroach', 'Shiny things that fall in my forest are mine. Turn back, fluffball.'],
      [C, 'Not without knowing what happened to Alice.'],
      [N, 'Throw shells at it. When it charges, raise your shield to stop it cold.']
    ],
    bossDown: [
      [N, 'The cockroach flips over, rights itself and scuttles off into the roots.'],
      [N, 'The brambles at the exit wither away.']
    ],
    fragment: [
      [N, 'Half buried in the moss lies a piece of curved metal, warm and humming.'],
      [C, 'Tiny lights blink along its edge. It smells like Alice’s chestnut tea.'],
      [N, 'Whatever took Alice came from somewhere far beyond the forest.'],
      [C, 'Hold on, Alice. I’m coming to find you.']
    ]
  };

  // ---------------------------------------------------------------------------
  // Entities
  // ---------------------------------------------------------------------------
  var player, enemies, pickups, shots, things, boss, fx;

  function newPlayer() {
    return {
      x: game.checkpoint.x, y: game.checkpoint.y, w: 12, h: 14, vx: 0, vy: 0, dir: 1,
      onGround: false, coyote: 0, jumpBuf: 0, inv: 0, hurt: 0, throwCd: 0, throwAnim: 0,
      shield: false, hp: 3, maxHp: 3, shells: 0, safeX: game.checkpoint.x, safeY: game.checkpoint.y,
      runT: 0, wasGround: true
    };
  }

  function addPickup(kind, c, row, extra) {
    var p = { kind: kind, x: c * T + 4, y: row * T - 12, w: 8, h: 8, vx: 0, vy: 0, phys: false, bob: (c * 7) % 60, taken: false };
    if (extra) for (var k in extra) p[k] = extra[k];
    pickups.push(p);
    return p;
  }

  function addEnemy(type, c, row) {
    var sizes = { beetle: [14, 10, 1], ant: [14, 13, 2], larva: [16, 8, 1] };
    var s = sizes[type];
    enemies.push({
      type: type, x: c * T, y: row * T - s[1], w: s[0], h: s[1], vx: 0, vy: 0, dir: -1, hp: s[2],
      homeX: c * T, range: 56, state: type === 'larva' ? 'buried' : 'patrol', t: 0, knock: 0, flash: 0,
      dead: false, anim: 0, onGround: false, hitWall: false
    });
  }

  function addThing(kind, c, row, w, h, extra) {
    var o = { kind: kind, x: c * T + (T - w) / 2, y: row * T - h, w: w, h: h, done: false, anim: 0 };
    if (extra) for (var k in extra) o[k] = extra[k];
    things.push(o);
    return o;
  }

  function newBoss() {
    return { x: 198 * T, y: 10 * T - 20, w: 40, h: 20, vx: 0, vy: 0, dir: -1, hp: 10, maxHp: 10,
      state: 'sleep', t: 0, flash: 0, anim: 0, onGround: true, solidOnly: true, hitWall: false, moves: 0 };
  }

  function buildEntities() {
    enemies = []; pickups = []; shots = []; things = []; fx = [];
    var shellSpots = [
      [14, 10], [16, 10], [24, 10], [40, 10], [41, 10], [49, 7], [50, 7], [62, 8], [66, 10], [67, 10],
      [70, 8], [71, 8], [79, 7], [80, 7], [85, 4], [86, 4], [90, 10], [106, 8], [108, 8], [115, 10],
      [121, 8], [124, 10], [125, 10], [136, 8], [145, 7], [147, 7], [153, 4], [158, 10], [162, 10],
      [168, 8], [171, 10], [173, 10], [178, 10], [180, 10]
    ];
    for (var i = 0; i < shellSpots.length; i++) addPickup('shell', shellSpots[i][0], shellSpots[i][1]);
    addPickup('berry', 110, 8);
    addPickup('berry', 155, 4);

    addEnemy('beetle', 45, 10);
    addEnemy('beetle', 75, 10);
    addEnemy('beetle', 98, 10);
    addEnemy('beetle', 108, 8);
    addEnemy('ant', 102, 10);
    addEnemy('ant', 117, 10);
    addEnemy('ant', 131, 10);
    addEnemy('larva', 141, 10);
    addEnemy('larva', 150, 10);
    addEnemy('ant', 160, 10);
    addEnemy('larva', 163, 10);
    addEnemy('beetle', 166, 10);

    addThing('basket', 8, 10, 14, 10);
    addThing('scorch', 20, 10, 28, 6, { clue: true });
    addThing('sign', 30, 10, 14, 18, { lines: 'sign1' });
    addThing('bush', 55, 10, 22, 14);
    addThing('ribbon', 87, 4, 8, 8, { clue: true });
    addThing('lantern', 93, 10, 10, 26);
    addThing('snail', 89, 10, 18, 13);
    addThing('log', 127, 10, 30, 14, { clue: true });
    addThing('lantern', 174, 10, 10, 26);
    addThing('bush', 177, 10, 22, 14);
    addThing('sign', 182, 10, 14, 18, { lines: 'sign2' });
    addThing('fragment', 214, 10, 14, 10);

    boss = newBoss();
  }

  // ---------------------------------------------------------------------------
  // Input
  // ---------------------------------------------------------------------------
  var held = {}, pressed = {};
  var KEYS = {
    ArrowLeft: 'left', KeyA: 'left', ArrowRight: 'right', KeyD: 'right',
    ArrowUp: 'jump', KeyW: 'jump', Space: 'jump', KeyZ: 'jump',
    KeyX: 'throw', KeyJ: 'throw', KeyC: 'shield', KeyK: 'shield', ArrowDown: 'shield', KeyS: 'shield',
    KeyE: 'interact', Enter: 'interact'
  };
  function clearInput() {
    held = {}; pressed = {};
    var b = document.querySelectorAll('.pad-btn.is-pressed');
    for (var i = 0; i < b.length; i++) b[i].classList.remove('is-pressed');
  }

  window.addEventListener('keydown', function (e) {
    var code = e.code;
    if (code === 'Escape' || code === 'KeyP') {
      if (game.state === 'playing' || game.state === 'dialogue') { e.preventDefault(); pauseGame(); return; }
      if (game.state === 'paused') { e.preventDefault(); resumeGame(); return; }
    }
    if (game.state === 'dialogue') {
      if ((code === 'KeyE' || code === 'KeyX' || code === 'KeyJ') && !e.repeat) { e.preventDefault(); advanceDialogue(); }
      return;
    }
    if (game.state !== 'playing') return;
    var action = KEYS[code];
    if (!action) return;
    var tgt = e.target;
    if (tgt && tgt !== canvas && tgt.closest && tgt.closest('button, a') && (code === 'Enter' || code === 'Space')) return;
    e.preventDefault();
    if (!held[action]) pressed[action] = true;
    held[action] = true;
  });
  window.addEventListener('keyup', function (e) {
    var action = KEYS[e.code];
    if (action) held[action] = false;
  });
  window.addEventListener('blur', function () { clearInput(); pauseGame(); });
  document.addEventListener('visibilitychange', function () { if (document.hidden) { clearInput(); pauseGame(); } });

  var padButtons = document.querySelectorAll('[data-action]');
  Array.prototype.forEach.call(padButtons, function (btn) {
    var action = btn.getAttribute('data-action');
    function down(ev) {
      ev.preventDefault();
      if (btn.setPointerCapture && ev.pointerId !== undefined) { try { btn.setPointerCapture(ev.pointerId); } catch (err) { /* ignore */ } }
      if (game.state === 'dialogue' && (action === 'interact' || action === 'throw' || action === 'jump')) { advanceDialogue(); return; }
      if (game.state !== 'playing') return;
      if (!held[action]) pressed[action] = true;
      held[action] = true;
      btn.classList.add('is-pressed');
    }
    function up() { held[action] = false; btn.classList.remove('is-pressed'); }
    btn.addEventListener('pointerdown', down);
    btn.addEventListener('pointerup', up);
    btn.addEventListener('pointercancel', up);
    btn.addEventListener('lostpointercapture', up);
    btn.addEventListener('contextmenu', function (e) { e.preventDefault(); });
    btn.addEventListener('click', function (ev) {
      // Keyboard activation of a pad button (Enter or Space) gives one tap.
      if (ev.detail !== 0) return;
      if (game.state === 'dialogue') { advanceDialogue(); return; }
      if (game.state === 'playing') pressed[action] = true;
    });
  });

  canvas.addEventListener('pointerdown', function () { if (game.state === 'playing') canvas.focus({ preventScroll: true }); });

  // ---------------------------------------------------------------------------
  // Screens, HUD and dialogue
  // ---------------------------------------------------------------------------
  var screens = [ui.start, ui.pause, ui.over, ui.end];
  function showScreen(el, focusId) {
    for (var i = 0; i < screens.length; i++) screens[i].hidden = screens[i] !== el;
    if (el && focusId) byId(focusId).focus({ preventScroll: true });
  }
  function focusStage() { canvas.focus({ preventScroll: true }); }

  var heartSvg = '<rect x="1" y="0" width="2" height="1"/><rect x="4" y="0" width="2" height="1"/><rect x="0" y="1" width="7" height="2"/><rect x="1" y="3" width="5" height="1"/><rect x="2" y="4" width="3" height="1"/><rect x="3" y="5" width="1" height="1"/>';
  function updateHud() {
    ui.shells.textContent = String(player.shells);
    var html = '';
    for (var i = 0; i < player.maxHp; i++) {
      html += '<svg class="heart' + (i < player.hp ? ' is-full' : '') + '" viewBox="0 0 7 6">' + heartSvg + '</svg>';
    }
    ui.hearts.innerHTML = html;
    ui.health.textContent = player.hp + '/' + player.maxHp;
    ui.clues.textContent = game.clues + '/3';
    var showBoss = game.arenaLocked && !game.bossDefeated && boss.state !== 'sleep';
    ui.boss.hidden = !showBoss;
    if (showBoss) {
      ui.bossFill.style.width = Math.round((boss.hp / boss.maxHp) * 100) + '%';
      ui.bossBar.setAttribute('aria-label', 'Cockroach health ' + boss.hp + ' of ' + boss.maxHp);
    }
  }

  function toast(msg) {
    ui.toast.textContent = msg;
    ui.toast.classList.add('is-visible');
    game.toastTimer = 150;
  }

  var dlgQueue = [], dlgDone = null, dlgLast = 0;
  function say(lines, done) {
    dlgQueue = lines.slice();
    dlgDone = done || null;
    if (game.state !== 'dialogue') game.prevState = game.state;
    game.state = 'dialogue';
    clearInput();
    showLine();
    ui.dialogue.hidden = false;
    ui.dlgNext.focus({ preventScroll: true });
  }
  function showLine() {
    var l = dlgQueue.shift();
    ui.dlgName.textContent = l[0];
    ui.dlgText.textContent = l[1];
    ui.dlgNext.textContent = dlgQueue.length ? 'Next' : 'Continue';
  }
  function advanceDialogue() {
    var now = performance.now();
    if (now - dlgLast < 120) return;
    dlgLast = now;
    if (dlgQueue.length) { showLine(); return; }
    ui.dialogue.hidden = true;
    game.state = 'playing';
    clearInput();
    var d = dlgDone; dlgDone = null;
    if (d) d();
    if (game.state === 'playing') focusStage();
  }
  ui.dlgNext.addEventListener('click', advanceDialogue);

  function pauseGame() {
    if (game.state !== 'playing' && game.state !== 'dialogue') return;
    game.prevState = game.state;
    game.state = 'paused';
    clearInput();
    showScreen(ui.pause, 'btn-resume');
    ui.btnPause.textContent = 'Resume';
  }
  function resumeGame() {
    if (game.state !== 'paused') return;
    showScreen(null);
    ui.btnPause.textContent = 'Pause';
    game.state = game.prevState === 'dialogue' ? 'dialogue' : 'playing';
    if (game.state === 'dialogue') ui.dlgNext.focus({ preventScroll: true }); else focusStage();
  }

  function startGame() {
    game.checkpoint = { x: 6 * T, y: 10 * T - 14 };
    game.arenaLocked = false; game.bossDefeated = false; game.gateL = 0; game.gateR = 1;
    game.clues = 0; game.collected = 0; game.frames = 0; game.shake = 0;
    game.camX = 0; game.dropTimer = 120;
    buildEntities();
    player = newPlayer();
    ui.dialogue.hidden = true;
    ui.btnPause.textContent = 'Pause';
    showScreen(null);
    game.state = 'playing';
    game.beam = reduceMotion ? 0 : 90;
    game.flash = reduceMotion ? 0 : 16;
    updateHud();
    say(LINES.intro);
  }

  function gameOver() {
    game.state = 'gameover';
    clearInput();
    ui.dialogue.hidden = true;
    showScreen(ui.over, 'btn-retry');
  }

  function respawn() {
    var shells = player.shells;
    player = newPlayer();
    player.shells = Math.max(shells, 5);
    player.inv = 90;
    shots = [];
    if (!game.bossDefeated) { boss = newBoss(); game.arenaLocked = false; game.gateL = 0; }
    game.camX = clamp(player.x - W / 2, 0, WORLD_W - W);
    showScreen(null);
    game.state = 'playing';
    updateHud();
    focusStage();
  }

  function showEnding() {
    game.state = 'ending';
    clearInput();
    var secs = Math.floor(game.frames / 60);
    ui.endShells.textContent = String(game.collected);
    ui.endClues.textContent = game.clues + ' of 3';
    ui.endTime.textContent = Math.floor(secs / 60) + ':' + String(secs % 60).padStart(2, '0');
    showScreen(ui.end, 'btn-again');
  }

  byId('btn-start').addEventListener('click', startGame);
  byId('btn-again').addEventListener('click', startGame);
  byId('btn-restart').addEventListener('click', startGame);
  byId('btn-restart-over').addEventListener('click', startGame);
  byId('btn-retry').addEventListener('click', respawn);
  byId('btn-resume').addEventListener('click', resumeGame);
  ui.btnPause.addEventListener('click', function () {
    if (game.state === 'paused') resumeGame();
    else if (game.state === 'playing' || game.state === 'dialogue') pauseGame();
    else if (game.state === 'title') toast('Start the chapter first.');
  });

  // ---------------------------------------------------------------------------
  // Effects
  // ---------------------------------------------------------------------------
  function burst(x, y, n, cols, spread) {
    if (reduceMotion) n = Math.ceil(n / 3);
    for (var i = 0; i < n; i++) {
      fx.push({ x: x, y: y, vx: (Math.random() - 0.5) * (spread || 2.4), vy: -Math.random() * 2 - 0.4,
        life: 24 + Math.random() * 16, col: cols[i % cols.length], g: 0.12 });
    }
  }
  function dust(x, y) { burst(x, y, 5, ['#c9a77a', '#a88a62'], 1.6); }

  // ---------------------------------------------------------------------------
  // Update
  // ---------------------------------------------------------------------------
  function addShells(n) {
    player.shells += n;
    game.collected += n;
    updateHud();
  }

  function hurtPlayer(dmg, fromX) {
    var p = player;
    if (p.inv > 0 || game.state !== 'playing') return;
    p.hp -= dmg; p.inv = 90; p.hurt = 16;
    var d = fromX === undefined ? -p.dir : (sign(cx(p) - fromX) || -p.dir);
    p.vx = d * 2.2; p.vy = -2.6; p.onGround = false;
    game.shake = 8;
    burst(cx(p), p.y + 6, 6, ['#f6e2bd', '#d9893b']);
    updateHud();
    if (p.hp <= 0) { p.hp = 0; updateHud(); gameOver(); }
  }

  function nearestThing() {
    var p = player, best = null, bd = 1e9;
    for (var i = 0; i < things.length; i++) {
      var o = things[i];
      if (!available(o)) continue;
      var dx = Math.abs(cx(o) - cx(p));
      var dy = Math.abs((o.y + o.h / 2) - (p.y + p.h / 2));
      if (dx < o.w / 2 + 14 && dy < o.h / 2 + 18 && dx < bd) { best = o; bd = dx; }
    }
    return best;
  }
  function available(o) {
    if (o.kind === 'fragment') return game.bossDefeated && !o.done;
    if (o.kind === 'sign' || o.kind === 'snail' || o.kind === 'bush') return true;
    return !o.done;
  }

  function findClue() {
    game.clues++;
    updateHud();
    toast('Clue found: ' + game.clues + ' of 3');
  }

  function interact(o) {
    switch (o.kind) {
      case 'basket':
        o.done = true; addShells(2); say(LINES.basket, function () { toast('+2 shells'); }); break;
      case 'scorch':
        o.done = true; say(LINES.scorch, findClue); break;
      case 'sign':
        say(LINES[o.lines]); break;
      case 'bush':
        if (o.done) { say(LINES.bushEmpty); break; }
        o.done = true; o.anim = 30;
        for (var i = 0; i < 3; i++) {
          addPickup('shell', 0, 0, { x: cx(o) - 4 + (i - 1) * 4, y: o.y - 4, vx: (i - 1) * 1.1, vy: -2.6, phys: true });
        }
        say(LINES.bush); break;
      case 'ribbon':
        o.done = true; say(LINES.ribbon, findClue); break;
      case 'lantern':
        o.done = true; o.anim = 1;
        game.checkpoint = { x: o.x, y: 10 * T - 14 };
        player.hp = player.maxHp; updateHud();
        burst(cx(o), o.y + 4, 10, ['#ffd27a', '#ffefb8']);
        say(LINES.lantern, function () { toast('Lantern lit. Health restored.'); }); break;
      case 'snail':
        if (o.done) { say(LINES.snailAgain); break; }
        o.done = true; say(LINES.snail); break;
      case 'log':
        o.done = true; addShells(2); say(LINES.log, findClue); break;
      case 'fragment':
        o.done = true; say(LINES.fragment, showEnding); break;
    }
  }

  function updatePlayer() {
    var p = player;
    var shieldUp = !!held.shield && p.onGround && p.hurt === 0;
    p.shield = shieldUp;
    var ax = (held.left ? -1 : 0) + (held.right ? 1 : 0);
    if (p.hurt > 0) {
      p.hurt--;
      p.vx *= 0.94;
    } else {
      var max = shieldUp ? 0.5 : 1.7;
      if (ax !== 0) {
        p.vx += ax * (p.onGround ? 0.3 : 0.2);
        p.dir = ax;
      } else {
        p.vx *= p.onGround ? 0.7 : 0.93;
        if (Math.abs(p.vx) < 0.05) p.vx = 0;
      }
      p.vx = clamp(p.vx, -max, max);
    }

    if (pressed.jump) p.jumpBuf = 8;
    if (p.onGround) p.coyote = 6; else if (p.coyote > 0) p.coyote--;
    if (p.jumpBuf > 0) {
      p.jumpBuf--;
      if (p.coyote > 0 && p.hurt === 0) {
        p.vy = -JUMP_V; p.coyote = 0; p.jumpBuf = 0; p.onGround = false; p.shield = false;
        dust(cx(p), p.y + p.h);
      }
    }
    if (!held.jump && p.vy < -2 && p.hurt === 0 && !p.noCut) p.vy = -2;
    if (p.vy >= 0) p.noCut = false;
    p.vy = Math.min(p.vy + GRAVITY, MAX_FALL);

    p.wasGround = p.onGround;
    moveBody(p);
    if (p.onGround && !p.wasGround && p.vy === 0) dust(cx(p), p.y + p.h);

    if (p.throwCd > 0) p.throwCd--;
    if (p.throwAnim > 0) p.throwAnim--;
    if (pressed.throw && p.throwCd === 0 && p.hurt === 0) {
      if (p.shells > 0) {
        p.shells--; p.throwCd = 16; p.throwAnim = 10;
        shots.push({ kind: 'shell', x: cx(p) + p.dir * 6 - 3, y: p.y + 3, w: 6, h: 6,
          vx: p.dir * 3.4 + p.vx * 0.3, vy: -1.5, g: 0.14, life: 100, spin: 0 });
        updateHud();
      } else {
        toast('No shells left. Look for more.');
        p.throwCd = 30;
      }
    }

    if (pressed.interact) {
      var o = nearestThing();
      if (o) interact(o);
    }

    if (p.onGround && standable(p.x + 1, p.y + p.h + 1) && standable(p.x + p.w - 1, p.y + p.h + 1) && !game.arenaLocked) {
      p.safeX = p.x; p.safeY = p.y;
    }
    if (p.y > H + 24) {
      p.hp -= 1;
      updateHud();
      if (p.hp <= 0) { p.hp = 0; updateHud(); gameOver(); return; }
      p.x = p.safeX; p.y = p.safeY; p.vx = 0; p.vy = 0; p.inv = 90;
      toast('Ouch. Chang climbs back out.');
    }
    if (p.inv > 0) p.inv--;
    if (Math.abs(p.vx) > 0.2 && p.onGround) p.runT++; else p.runT = 0;
  }

  function hitEnemy(e, dmg, fromX) {
    e.hp -= dmg; e.flash = 8;
    if (e.type === 'larva' && e.state === 'buried') e.state = 'active';
    if (e.hp <= 0) {
      e.dead = true;
      burst(cx(e), e.y + e.h / 2, 10, e.type === 'beetle' ? ['#3f6b4a', '#b9dc95'] : e.type === 'ant' ? ['#8e3324', '#c85a3c'] : ['#efe2c2', '#c9b282']);
      if (Math.random() < 0.5) addPickup('shell', 0, 0, { x: cx(e) - 4, y: e.y - 4, vx: 0, vy: -2.4, phys: true });
    } else {
      e.vx = sign(cx(e) - fromX) * 1.6; e.knock = 10;
      if (e.state === 'charge') { e.state = 'patrol'; e.t = 50; }
    }
  }

  function updateEnemy(e) {
    var p = player;
    e.anim++;
    if (e.flash > 0) e.flash--;
    var dx = cx(p) - cx(e), dy = (p.y + p.h) - (e.y + e.h);
    if (e.knock > 0) { e.knock--; e.vx *= 0.88; }
    else if (e.type === 'beetle') {
      e.vx = e.dir * 0.45;
    } else if (e.type === 'ant') {
      if (e.state === 'patrol') {
        e.vx = e.dir * 0.4;
        if (e.t > 0) e.t--;
        else if (Math.abs(dx) < 90 && Math.abs(dy) < 28 && (sign(dx) === e.dir || Math.abs(dx) < 36)) { e.state = 'windup'; e.t = 24; e.dir = sign(dx) || e.dir; }
      } else if (e.state === 'windup') {
        e.vx = 0;
        if (--e.t <= 0) { e.state = 'charge'; e.t = 70; }
      } else if (e.state === 'charge') {
        e.vx = e.dir * 1.5;
        if (--e.t <= 0) { e.state = 'patrol'; e.t = 60; }
      }
    } else if (e.type === 'larva') {
      if (e.state === 'buried') {
        e.vx = 0;
        if (Math.abs(dx) < 72 && Math.abs(dy) < 40) { e.state = 'rise'; e.t = 30; }
      } else if (e.state === 'rise') {
        e.vx = 0;
        if (--e.t <= 0) { e.state = 'active'; e.t = 60; }
      } else {
        e.dir = sign(dx) || e.dir;
        e.vx = e.dir * 0.22;
        if (--e.t <= 0) {
          e.t = 120;
          if (Math.abs(dx) < 140) {
            shots.push({ kind: 'chip', x: cx(e) - 2, y: e.y, w: 4, h: 4, vx: sign(dx) * 1.7, vy: -2.4, g: 0.12, life: 120, spin: 0 });
          }
        }
      }
    }

    e.vy = Math.min(e.vy + GRAVITY, MAX_FALL);
    var before = e.x;
    moveBody(e);
    if (e.knock === 0 && e.onGround && e.vx !== 0) {
      var frontX = e.dir > 0 ? e.x + e.w + 1 : e.x - 1;
      var turn = e.hitWall || !standable(frontX, e.y + e.h + 2) ||
        (e.type !== 'larva' && e.state === 'patrol' && ((e.dir < 0 && e.x < e.homeX - e.range) || (e.dir > 0 && e.x > e.homeX + e.range)));
      if (turn) {
        if (e.type === 'larva') { e.x = before; }
        else { e.dir = -e.dir; if (e.state === 'charge') { e.state = 'patrol'; e.t = 40; } }
      }
    }
    if (e.y > H + 40) e.dead = true;

    if (e.state === 'buried' || e.dead) return;
    if (!overlap(p, e) || game.state !== 'playing') return;
    var stomp = p.vy > 0.5 && (p.y + p.h - p.vy) <= e.y + 5;
    if (stomp) {
      hitEnemy(e, 2, cx(p));
      p.vy = held.jump ? -5 : -3.6;
      p.noCut = true;
      dust(cx(p), p.y + p.h);
      return;
    }
    if (p.shield && sign(cx(e) - cx(p)) === p.dir) {
      e.dir = p.dir; e.vx = p.dir * 2; e.knock = 12; e.x += p.dir * 2;
      if (e.state === 'charge') { e.state = 'patrol'; e.t = 60; }
      p.vx = -p.dir * 1.2;
      burst(cx(p) + p.dir * 8, p.y + 6, 4, ['#ffe6a6', '#ffffff'], 1.4);
      return;
    }
    hurtPlayer(1, cx(e));
  }

  function bossStun(t) {
    boss.state = 'stunned'; boss.t = t; boss.vx = 0;
    game.shake = 10;
    burst(cx(boss), boss.y + 4, 8, ['#d9c08a', '#8a6a4a'], 3);
  }

  function damageBoss(n) {
    if (boss.state === 'sleep' || boss.state === 'intro' || boss.state === 'defeated' || boss.state === 'flee') return;
    boss.hp = Math.max(0, boss.hp - n); boss.flash = 8;
    updateHud();
    if (boss.hp <= 0) {
      boss.state = 'defeated'; boss.t = 70; boss.vx = 0;
      game.shake = 16;
      burst(cx(boss), boss.y + 8, 16, ['#6e3b1c', '#b8743a', '#ffd27a'], 3);
      shots = shots.filter(function (s) { return s.kind === 'shell'; });
    }
  }

  function updateBoss() {
    var b = boss, p = player;
    if (b.state === 'sleep') {
      if (!game.bossDefeated && p.x > (ARENA_L + 2) * T) {
        game.arenaLocked = true;
        b.state = 'intro';
        say(LINES.boss, function () { b.state = 'idle'; b.t = 40; updateHud(); });
        updateHud();
      }
      return;
    }
    if (b.state === 'intro') return;
    b.anim++;
    if (b.flash > 0) b.flash--;
    var enraged = b.hp <= 5;
    var toward = sign(cx(p) - cx(b)) || b.dir;

    switch (b.state) {
      case 'idle':
        b.vx = 0; b.dir = toward;
        if (--b.t <= 0) {
          b.moves++;
          if (b.moves % 3 === 0) { b.state = 'hop'; b.vy = -4.8; b.vx = b.dir * 1.7; b.onGround = false; }
          else { b.state = 'windup'; b.t = enraged ? 30 : 42; }
        }
        break;
      case 'windup':
        b.vx = 0;
        if (--b.t <= 0) { b.state = 'charge'; b.vx = b.dir * (enraged ? 3.6 : 3.0); }
        break;
      case 'charge':
        b.vx = b.dir * (enraged ? 3.6 : 3.0);
        break;
      case 'hop':
        break;
      case 'stunned':
        b.vx = 0;
        if (--b.t <= 0) { b.state = 'idle'; b.t = enraged ? 30 : 46; }
        break;
      case 'defeated':
        b.vx = 0;
        if (--b.t <= 0) {
          b.state = 'flee'; b.t = 240;
          game.bossDefeated = true; game.arenaLocked = false;
          updateHud();
          say(LINES.bossDown, function () { toast('The forest exit is open.'); });
        }
        break;
      case 'flee':
        b.x += 2.4; b.dir = 1;
        if (--b.t <= 0) b.state = 'gone';
        return;
      case 'gone':
        return;
    }

    b.vy = Math.min(b.vy + GRAVITY, MAX_FALL);
    var wasAir = !b.onGround;
    moveBody(b);
    if (b.state === 'charge' && b.hitWall) bossStun(80);
    if (b.state === 'hop' && b.onGround && wasAir) { b.state = 'idle'; b.t = enraged ? 28 : 44; game.shake = 6; dust(cx(b), b.y + b.h); }

    // shells fall from the old chestnut tree while the fight is on
    if (game.arenaLocked) {
      var inArena = 0;
      for (var i = 0; i < pickups.length; i++) if (!pickups[i].taken && pickups[i].x > ARENA_L * T) inArena++;
      if (--game.dropTimer <= 0) {
        game.dropTimer = p.shells === 0 ? 80 : 200;
        if (inArena < 4) addPickup('shell', 0, 0, { x: (ARENA_L + 3 + Math.floor(Math.random() * 18)) * T, y: -10, phys: true });
      }
    }

    if (b.state === 'defeated' || !overlap(p, b) || game.state !== 'playing') return;
    var stomp = p.vy > 0.5 && (p.y + p.h - p.vy) <= b.y + 6;
    if (stomp) {
      p.vy = held.jump ? -5.2 : -4;
      p.noCut = true;
      if (b.state === 'stunned') { damageBoss(2); burst(cx(p), p.y + p.h, 6, ['#ffd27a', '#ffffff']); }
      else dust(cx(p), p.y + p.h);
      return;
    }
    var front = sign(cx(b) - cx(p)) === p.dir;
    if (p.shield && front && (b.state === 'charge' || b.state === 'hop' || b.state === 'idle' || b.state === 'windup')) {
      if (b.state === 'charge') { bossStun(100); toast('Blocked! The cockroach is dazed.'); }
      b.x = clamp(b.x - b.dir * 6, (ARENA_L + 1) * T, ARENA_R * T - b.w);
      p.vx = -p.dir * 2;
      burst(cx(p) + p.dir * 8, p.y + 6, 6, ['#ffe6a6', '#ffffff'], 1.6);
      return;
    }
    if (b.state !== 'stunned') hurtPlayer(1, cx(b));
    else { p.vx = -sign(cx(b) - cx(p)) * 1.2; }
  }

  function updateShots() {
    for (var i = shots.length - 1; i >= 0; i--) {
      var s = shots[i];
      s.vy += s.g; s.x += s.vx; s.y += s.vy; s.life--; s.spin++;
      var hit = s.life <= 0 || isSolid(Math.floor((s.x + s.w / 2) / T), Math.floor((s.y + s.h / 2) / T));
      if (!hit && s.kind === 'shell') {
        for (var j = 0; j < enemies.length; j++) {
          var e = enemies[j];
          if (!e.dead && e.state !== 'buried' && overlap(s, e)) { hitEnemy(e, 1, s.x - s.vx * 4); hit = true; break; }
        }
        if (!hit && boss.state !== 'sleep' && boss.state !== 'flee' && boss.state !== 'gone' && overlap(s, boss)) {
          damageBoss(1); hit = true;
          burst(s.x, s.y, 5, ['#ffd27a', '#8b4a22']);
        }
      } else if (!hit && s.kind === 'chip' && overlap(s, player)) {
        hit = true;
        if (player.shield && sign(s.vx) === -player.dir) burst(s.x, s.y, 4, ['#ffe6a6', '#ffffff'], 1.4);
        else hurtPlayer(1, s.x);
      }
      if (hit) {
        burst(s.x + s.w / 2, s.y + s.h / 2, 5, s.kind === 'shell' ? ['#8b4a22', '#e9cf9c'] : ['#c9a77a', '#8a6a4a']);
        shots.splice(i, 1);
      }
    }
  }

  function updatePickups() {
    for (var i = pickups.length - 1; i >= 0; i--) {
      var k = pickups[i];
      if (k.taken) { pickups.splice(i, 1); continue; }
      k.bob++;
      if (k.phys) {
        k.vy = Math.min(k.vy + 0.2, 4);
        k.x += k.vx; k.vx *= 0.96;
        k.y += k.vy;
        var c = Math.floor((k.x + 4) / T), r = Math.floor((k.y + k.h) / T);
        if (k.vy > 0 && (isSolid(c, r) || tileAt(c, r) === BRANCH)) { k.y = r * T - k.h - 2; k.vy = 0; k.vx = 0; k.phys = false; }
        if (k.y > H + 20) { k.taken = true; continue; }
      }
      var box = { x: k.x - 2, y: k.y - 2, w: k.w + 4, h: k.h + 4 };
      if (overlap(player, box)) {
        k.taken = true;
        if (k.kind === 'shell') { addShells(1); burst(k.x + 4, k.y + 4, 4, ['#e9cf9c', '#d48a4e']); }
        else {
          player.hp = Math.min(player.maxHp, player.hp + 1);
          updateHud();
          toast('A rosehip berry. Health restored by one.');
          burst(k.x + 4, k.y + 4, 6, ['#d8383a', '#ffb3a8']);
        }
      }
    }
  }

  function updateCamera() {
    var p = player;
    var target = cx(p) - W / 2 + p.dir * 24;
    game.camX += (target - game.camX) * 0.1;
    var min = 0, max = WORLD_W - W;
    if (game.arenaLocked) { min = ARENA_L * T; max = (ARENA_R + 1) * T - W; }
    game.camX = clamp(game.camX, min, max);
  }

  function updateWorld() {
    updatePlayer();
    if (game.state !== 'playing') return;
    for (var i = enemies.length - 1; i >= 0; i--) {
      var e = enemies[i];
      if (Math.abs(e.x - player.x) < 420) updateEnemy(e);
      if (e.dead) enemies.splice(i, 1);
    }
    updateBoss();
    updateShots();
    updatePickups();
    updateCamera();
    for (var t = 0; t < things.length; t++) if (things[t].anim > 0 && things[t].kind === 'bush') things[t].anim--;
  }

  // ---------------------------------------------------------------------------
  // Ambient particles
  // ---------------------------------------------------------------------------
  var LEAF_COLS = ['#e07a2e', '#c4502a', '#f0a64a', '#a8402a'];
  var leaves = [], flies = [];
  (function () {
    var R = rng(7);
    for (var i = 0; i < 26; i++) leaves.push({ x: R() * W, y: R() * H, vy: 0.25 + R() * 0.35, ph: R() * 6.28, col: LEAF_COLS[i % 4], s: R() < 0.4 ? 2 : 1, par: 0.6 + R() * 0.5 });
    for (var j = 0; j < 12; j++) flies.push({ x: R() * W, y: 40 + R() * 110, ph: R() * 6.28, par: 0.5 + R() * 0.4 });
  })();
  var lastCam = 0;

  function updateFx() {
    var dc = game.camX - lastCam; lastCam = game.camX;
    if (!reduceMotion) {
      for (var i = 0; i < leaves.length; i++) {
        var l = leaves[i];
        l.ph += 0.04; l.y += l.vy; l.x += Math.sin(l.ph) * 0.35 - 0.1 - dc * l.par;
        if (l.y > H + 4) { l.y = -4; l.x = Math.random() * W; }
        if (l.x < -4) l.x += W + 8; if (l.x > W + 4) l.x -= W + 8;
      }
      for (var j = 0; j < flies.length; j++) {
        var f = flies[j];
        f.ph += 0.03; f.x += Math.cos(f.ph * 0.7) * 0.2 - dc * f.par; f.y += Math.sin(f.ph) * 0.15;
        if (f.x < -4) f.x += W + 8; if (f.x > W + 4) f.x -= W + 8;
      }
    }
    for (var k = fx.length - 1; k >= 0; k--) {
      var p = fx[k];
      p.vy += p.g; p.x += p.vx; p.y += p.vy; p.life--;
      if (p.life <= 0) fx.splice(k, 1);
    }
    if (game.shake > 0) game.shake--;
    if (game.flash > 0) game.flash--;
    if (game.beam > 0) game.beam--;
    if (game.toastTimer > 0 && --game.toastTimer === 0) ui.toast.classList.remove('is-visible');
    var bushOrLantern = things || [];
    for (var t = 0; t < bushOrLantern.length; t++) if (bushOrLantern[t].kind === 'lantern' && bushOrLantern[t].done) bushOrLantern[t].anim++;
  }

  // ---------------------------------------------------------------------------
  // Pre-rendered art
  // ---------------------------------------------------------------------------
  var sky = makeLayer(W, H);
  (function () {
    var bands = ['#2e2245', '#3d2850', '#552f55', '#733856', '#933f52', '#b34d4b', '#cf6444', '#e5803f', '#f19c47', '#f6b85a'];
    var bandH = 14;
    for (var i = 0; i < bands.length; i++) {
      rect(sky.g, 0, i * bandH, W, bandH, bands[i]);
      if (i > 0) {
        sky.g.fillStyle = bands[i];
        for (var x = 0; x < W; x += 2) { sky.g.fillRect(x + ((i % 2)), i * bandH - 2, 1, 1); sky.g.fillRect(x + 1 - (i % 2), i * bandH - 1, 1, 1); }
      }
    }
    rect(sky.g, 0, bands.length * bandH, W, H - bands.length * bandH, bands[bands.length - 1]);
    var R = rng(3);
    for (var s = 0; s < 26; s++) rect(sky.g, Math.floor(R() * W), Math.floor(R() * 40), 1, 1, R() < 0.5 ? '#f3d9c4' : '#b89ab8');
  })();

  function repeatingLayer(w, draw) { var L = makeLayer(w, H); draw(L.g, w); return L; }

  var clouds = repeatingLayer(640, function (g, w) {
    var R = rng(11);
    for (var i = 0; i < 7; i++) {
      var x = R() * w, y = 30 + R() * 50, len = 40 + R() * 70;
      rect(g, x, y, len, 2, '#e9875c');
      rect(g, x + 6, y - 2, len * 0.6, 2, '#f2a06a');
      rect(g, x + 10, y + 2, len * 0.7, 1, '#b85a55');
    }
  });

  var hills = repeatingLayer(640, function (g, w) {
    for (var x = 0; x < w; x++) {
      var y = 112 + Math.round(Math.sin((x / w) * Math.PI * 4) * 8 + Math.sin((x / w) * Math.PI * 10) * 4);
      rect(g, x, y, 1, H - y, '#8e4a4c');
      rect(g, x, y, 1, 1, '#a65a52');
    }
  });

  var farTrees = repeatingLayer(640, function (g, w) {
    var R = rng(21);
    rect(g, 0, 140, w, H - 140, '#6b3940');
    for (var i = 0; i < 26; i++) {
      var x = Math.floor((i / 26) * w + R() * 14), base = 142, hgt = 30 + Math.floor(R() * 26);
      rect(g, x - 1, base - hgt + 10, 3, hgt, '#5a2f38');
      var r = 8 + Math.floor(R() * 6);
      oval(g, x, base - hgt + 6, r, r - 2, '#74404a');
      oval(g, x - 3, base - hgt + 3, r - 3, r - 4, '#80484e');
    }
  });

  var midTrees = repeatingLayer(640, function (g, w) {
    var R = rng(33);
    // light shafts
    g.fillStyle = 'rgba(255, 214, 150, 0.07)';
    for (var s = 0; s < 4; s++) {
      var sx = 60 + s * 160 + R() * 40;
      for (var y = 0; y < 150; y++) g.fillRect(Math.round(sx + y * 0.35), y, 14, 1);
    }
    rect(g, 0, 150, w, H - 150, '#4a2a26');
    for (var i = 0; i < 9; i++) {
      var x = Math.floor((i / 9) * w + R() * 30), tw = 8 + Math.floor(R() * 5);
      rect(g, x, 30, tw, 125, '#4e2f2a');
      rect(g, x + 1, 30, 2, 125, '#5e3a32');
      rect(g, x - 3, 150, tw + 6, 3, '#4e2f2a');
      var cols = ['#8c3f2c', '#a24c30', '#7a3628'];
      for (var b = 0; b < 6; b++) oval(g, x + tw / 2 + (R() - 0.5) * 44, 18 + R() * 28, 12 + R() * 8, 7 + R() * 5, cols[b % 3]);
      for (var d = 0; d < 14; d++) rect(g, x + tw / 2 + (R() - 0.5) * 50, 14 + R() * 36, 2, 2, '#c0623a');
    }
  });

  var vignette = makeLayer(W, H);
  (function () {
    var gr = vignette.g.createRadialGradient(W / 2, H / 2, H * 0.45, W / 2, H / 2, W * 0.62);
    gr.addColorStop(0, 'rgba(20, 10, 20, 0)');
    gr.addColorStop(1, 'rgba(20, 10, 20, 0.42)');
    vignette.g.fillStyle = gr;
    vignette.g.fillRect(0, 0, W, H);
  })();

  var world = makeLayer(WORLD_W, H);
  function buildWorldArt() {
    var g = world.g, R = rng(99), c, r, x, y, i;
    g.clearRect(0, 0, WORLD_W, H);

    // Near trees behind the path
    var treeCols = [12, 27, 39, 58, 68, 82, 100, 116, 133, 146, 161, 176, 189, 196, 203, 218];
    for (i = 0; i < treeCols.length; i++) {
      x = treeCols[i] * T + 4;
      var tw = treeCols[i] === 196 ? 26 : 14 + Math.floor(R() * 6);
      var top = 0;
      rect(g, x, top, tw, 160, '#5b3622');
      rect(g, x + 2, top, 2, 160, '#7a4b2d');
      rect(g, x + tw - 3, top, 3, 160, '#46291a');
      for (y = 8; y < 156; y += 6 + Math.floor(R() * 8)) rect(g, x + 4 + Math.floor(R() * (tw - 8)), y, 1, 4 + Math.floor(R() * 5), '#46291a');
      rect(g, x - 4, 154, tw + 8, 6, '#5b3622');
      rect(g, x - 7, 157, 5, 3, '#5b3622');
      rect(g, x + tw + 2, 157, 5, 3, '#46291a');
      if (R() < 0.6) { oval(g, x + tw / 2, 60 + R() * 50, 3, 4, '#2c180f'); }
      var cc = ['#b4532a', '#d9782f', '#eda046', '#8e3b22'];
      for (var b = 0; b < 9; b++) oval(g, x + tw / 2 + (R() - 0.5) * 70, R() * 26, 14 + R() * 10, 8 + R() * 6, cc[b % 4]);
      for (var d = 0; d < 26; d++) rect(g, x + tw / 2 + (R() - 0.5) * 80, R() * 40, 2, 2, cc[(d + 2) % 4]);
      // chestnut burrs hanging
      for (var k = 0; k < 4; k++) { var bx = x + tw / 2 + (R() - 0.5) * 60, by = 28 + R() * 14; rect(g, bx, by, 3, 3, '#9aa040'); rect(g, bx + 1, by - 1, 1, 1, '#6a7028'); }
    }

    // Home burrow in the village
    oval(g, 3 * T, 160, 46, 34, '#7a5a2c');
    oval(g, 3 * T, 160, 44, 32, '#9b8a3a');
    for (i = 0; i < 40; i++) rect(g, 3 * T - 40 + R() * 80, 132 + R() * 26, 1, 2, '#b8a640');
    oval(g, 3 * T + 4, 150, 9, 11, '#3b2316');
    oval(g, 3 * T + 4, 151, 7, 9, '#7a4a2a');
    rect(g, 3 * T + 4, 142, 1, 18, '#5b3622');
    rect(g, 3 * T + 7, 150, 2, 2, '#f2c46a');
    oval(g, 3 * T - 22, 142, 5, 5, '#3b2316');
    oval(g, 3 * T - 22, 142, 4, 4, '#ffd27a');
    rect(g, 3 * T - 26, 142, 9, 1, '#3b2316'); rect(g, 3 * T - 22, 138, 1, 9, '#3b2316');
    // fence
    for (i = 0; i < 4; i++) { rect(g, 6 * T + 10 + i * 9, 148, 2, 12, '#8a6038'); rect(g, 6 * T + 10 + i * 9, 147, 2, 1, '#a87a4a'); }
    rect(g, 6 * T + 8, 151, 30, 2, '#8a6038');

    // Tiles
    for (c = 0; c < COLS; c++) {
      for (r = 0; r < ROWS; r++) {
        var t = tileAt(c, r);
        x = c * T; y = r * T;
        if (t === DIRT) {
          rect(g, x, y, T, T, '#6b3f22');
          for (i = 0; i < 6; i++) rect(g, x + Math.floor(R() * 15), y + Math.floor(R() * 15), R() < 0.3 ? 2 : 1, 1, R() < 0.5 ? '#7f4c29' : '#55301a');
          if (R() < 0.25) { rect(g, x + Math.floor(R() * 11), y + 6 + Math.floor(R() * 7), 3, 2, '#8d7056'); }
          var above = tileAt(c, r - 1);
          if (above === EMPTY || above === BRANCH) {
            rect(g, x, y, T, 4, '#a39a37');
            rect(g, x, y, T, 1, '#c9bc52');
            rect(g, x, y + 4, T, 1, '#4f2d18');
            for (i = 0; i < 16; i += 2) if (R() < 0.5) rect(g, x + i, y + 4, 1, 1 + Math.floor(R() * 2), '#a39a37');
          }
          if (tileAt(c - 1, r) === EMPTY && c > 0) rect(g, x, y, 1, T, '#4a2a16');
          if (tileAt(c + 1, r) === EMPTY && c < COLS - 1) rect(g, x + 15, y, 1, T, '#4a2a16');
        } else if (t === STONE) {
          rect(g, x, y, T, T, '#7f7a70');
          rect(g, x, y, T, 2, '#a29d90');
          rect(g, x, y + 14, T, 2, '#5c5850');
          rect(g, x + 4 + Math.floor(R() * 6), y + 5, 1, 5, '#5c5850');
          rect(g, x + 10, y + 9, 3, 1, '#5c5850');
          if (tileAt(c, r - 1) === EMPTY) { rect(g, x, y, T, 2, '#7f8f3a'); rect(g, x + 3, y + 2, 4, 1, '#7f8f3a'); }
        } else if (t === WOOD) {
          rect(g, x, y, T, T, '#8a5a33');
          for (i = 2; i < 16; i += 4) rect(g, x + i, y, 1, T, '#6b4224');
          if (tileAt(c, r - 1) === EMPTY) { rect(g, x, y, T, 3, '#c79a5e'); rect(g, x + 4, y + 1, 8, 1, '#a8794a'); }
        } else if (t === BRANCH) {
          rect(g, x, y + 1, T, 5, '#7a4a2a');
          rect(g, x, y + 1, T, 1, '#9c6638');
          rect(g, x, y + 5, T, 1, '#4c2c18');
          if (R() < 0.5) rect(g, x + Math.floor(R() * 12), y + 3, 2, 1, '#5e3820');
          if (tileAt(c - 1, r) !== BRANCH) { rect(g, x - 1, y + 2, 1, 3, '#7a4a2a'); }
          if (tileAt(c + 1, r) !== BRANCH) { rect(g, x + 16, y + 2, 2, 3, '#7a4a2a'); rect(g, x + 18, y, 2, 2, '#e07a2e'); }
          for (i = 0; i < 3; i++) if (R() < 0.6) rect(g, x + Math.floor(R() * 14), y + 6, 2, 2 + Math.floor(R() * 2), R() < 0.5 ? '#e07a2e' : '#c4502a');
        } else if (t === EMPTY && r === ROWS - 1 && tileAt(c, r - 1) === EMPTY) {
          rect(g, x, y - 4, T, 20, '#1f130d');
        }
      }
    }

    // Decor on grass surfaces
    for (c = 0; c < COLS; c++) {
      for (r = 1; r < ROWS; r++) {
        if (tileAt(c, r) !== DIRT || tileAt(c, r - 1) !== EMPTY) continue;
        x = c * T; y = r * T;
        for (i = 0; i < 16; i++) if (R() < 0.35) rect(g, x + i, y - 1 - Math.floor(R() * 3), 1, 3, R() < 0.5 ? '#b8a640' : '#8f8a2e');
        if (R() < 0.5) rect(g, x + Math.floor(R() * 13), y, 3, 1, LEAF_COLS[Math.floor(R() * 4)]);
        var roll = R();
        if (roll < 0.08) { rect(g, x + 6, y - 4, 1, 4, '#efe2c2'); rect(g, x + 4, y - 6, 5, 2, '#c8452e'); rect(g, x + 5, y - 6, 1, 1, '#f6e2bd'); }
        else if (roll < 0.15) { rect(g, x + 3, y - 3, 6, 3, '#8d877a'); rect(g, x + 4, y - 3, 3, 1, '#aaa496'); }
        else if (roll < 0.2) { rect(g, x + 9, y - 5, 1, 5, '#7a8a30'); rect(g, x + 8, y - 6, 3, 2, '#f0d060'); }
      }
    }

    // Shiny junk in the cockroach lair
    for (i = 0; i < 14; i++) {
      x = (ARENA_L + 2) * T + R() * 300;
      rect(g, x, 158, 3, 2, R() < 0.5 ? '#b9c3c9' : '#d8b04a');
      rect(g, x, 158, 1, 1, '#ffffff');
    }
  }
  buildWorldArt();

  // ---------------------------------------------------------------------------
  // Drawing
  // ---------------------------------------------------------------------------
  function drawHamster(kind, x, y, dir, pose, t) {
    var blink = (t % 220) < 8;
    var body = blink ? SPR[kind + 'Blink'] : SPR[kind];
    function fx_(lx, w) { return x + (dir > 0 ? lx : 16 - lx - w); }
    var foot = kind === 'alice' ? '#4a3328' : '#3a2318';
    var bob = 0, f1 = 0, f2 = 0;
    if (pose === 'run') {
      var ph = Math.floor(t / 5) % 4;
      f1 = [0, -1, 0, 1][ph]; f2 = -f1; bob = ph % 2 ? -1 : 0;
    } else if (pose === 'idle' && !reduceMotion) {
      bob = Math.floor(t / 40) % 2;
    }
    if (pose === 'air') {
      rect(ctx, fx_(4, 3), y + 12, 3, 2, foot); rect(ctx, fx_(10, 3), y + 12, 3, 2, foot);
    } else {
      rect(ctx, fx_(3 + f1, 3), y + 13, 3, 2, foot); rect(ctx, fx_(10 + f2, 3), y + 13, 3, 2, foot);
    }
    var sw = reduceMotion ? 0 : Math.round(Math.sin(t / 6));
    var scarf = kind === 'alice' ? '#c9423a' : '#5e8c3e';
    rect(ctx, fx_(-2, 2), y + 8 + sw + bob, 2, 2, scarf);
    rect(ctx, fx_(-3, 1), y + 9 + sw + bob, 1, 1, scarf);
    ctx.drawImage(facing(body, dir), x, y + bob);
    if (pose === 'shield') ctx.drawImage(SPR.shell, fx_(11, 8), y + 5);
    if (pose === 'throw') rect(ctx, fx_(15, 2), y + 7, 2, 2, kind === 'alice' ? '#e6cfb3' : '#d9893b');
  }

  function drawBubble(x, y, glyph) {
    x = Math.round(x); y = Math.round(y);
    rect(ctx, x - 1, y, 9, 9, '#3a2318');
    rect(ctx, x, y - 1, 7, 11, '#3a2318');
    rect(ctx, x, y, 7, 9, '#fbf3e4');
    rect(ctx, x + 2, y + 10, 3, 1, '#3a2318');
    rect(ctx, x + 3, y + 11, 1, 1, '#3a2318');
    var gl = GLYPHS[glyph];
    for (var r = 0; r < 5; r++) for (var c = 0; c < 3; c++) if (gl[r].charAt(c) === '#') rect(ctx, x + 2 + c, y + 2 + r, 1, 1, '#3a2318');
  }

  function drawThing(o, cam) {
    var x = Math.round(o.x - cam), y = Math.round(o.y), t = game.t, i;
    switch (o.kind) {
      case 'basket':
        if (game.state === 'title') {
          rect(ctx, x + 1, y + 2, 12, 8, '#b07a3c'); rect(ctx, x + 1, y + 2, 12, 1, '#d6a25a');
          for (i = 0; i < 12; i += 3) rect(ctx, x + 2 + i, y + 3, 1, 7, '#8a5a2a');
          rect(ctx, x + 3, y - 3, 8, 1, '#8a5a2a'); rect(ctx, x + 3, y - 3, 1, 5, '#8a5a2a'); rect(ctx, x + 10, y - 3, 1, 5, '#8a5a2a');
          ctx.drawImage(SPR.shell, x + 3, y - 2);
        } else {
          // overturned: lying on its side with shells spilled
          rect(ctx, x, y + 3, 10, 7, '#b07a3c'); rect(ctx, x, y + 3, 10, 1, '#d6a25a');
          for (i = 0; i < 10; i += 3) rect(ctx, x + 1 + i, y + 4, 1, 6, '#8a5a2a');
          rect(ctx, x + 10, y + 3, 1, 7, '#5a3a1a');
          rect(ctx, x - 3, y + 2, 4, 1, '#8a5a2a');
          rect(ctx, x + 12, y + 8, 3, 2, '#8b4a22'); rect(ctx, x + 16, y + 9, 3, 1, '#e9cf9c'); rect(ctx, x + 20, y + 8, 2, 2, '#8b4a22');
        }
        break;
      case 'scorch':
        if (game.state === 'title') break;
        rect(ctx, x, y + 4, o.w, 2, '#2a1a12');
        rect(ctx, x + 3, y + 3, o.w - 6, 1, '#3a2418');
        rect(ctx, x + 6, y + 5, o.w - 12, 1, '#55301a');
        if (!o.done && !reduceMotion) { var sm = (t >> 3) % 6; rect(ctx, x + 8 + sm, y - sm * 2, 1, 2, 'rgba(220,210,200,0.5)'); rect(ctx, x + 18 - sm, y - 2 - sm * 2, 1, 2, 'rgba(220,210,200,0.4)'); }
        break;
      case 'sign':
        rect(ctx, x + 6, y + 6, 2, 12, '#6b4224');
        rect(ctx, x, y, 14, 9, '#a8794a'); rect(ctx, x, y + 8, 14, 1, '#6b4224'); rect(ctx, x, y, 14, 1, '#c79a5e');
        rect(ctx, x + 2, y + 3, 8, 1, '#4a2a16'); rect(ctx, x + 2, y + 5, 6, 1, '#4a2a16');
        break;
      case 'bush':
        var jig = o.anim > 0 && !reduceMotion ? ((o.anim >> 1) % 2 ? 1 : -1) : 0;
        oval(ctx, x + 11 + jig, y + 9, 11, 6, '#5d6e2a');
        oval(ctx, x + 8 + jig, y + 7, 7, 5, '#76882f');
        oval(ctx, x + 15 + jig, y + 8, 6, 4, '#8a7a2c');
        if (!o.done) { rect(ctx, x + 5 + jig, y + 6, 2, 2, '#8b4a22'); rect(ctx, x + 13 + jig, y + 4, 2, 2, '#8b4a22'); rect(ctx, x + 16 + jig, y + 9, 2, 2, '#8b4a22'); }
        break;
      case 'ribbon':
        if (o.done) break;
        var wv = reduceMotion ? 0 : Math.round(Math.sin(t / 10));
        rect(ctx, x + 2, y + 2, 4, 2, '#c9423a'); rect(ctx, x + 1, y + 4 + wv, 2, 4, '#c9423a'); rect(ctx, x + 5, y + 4 - wv, 2, 4, '#8e2a26');
        if ((t >> 4) % 3 === 0) rect(ctx, x + 3, y, 1, 1, '#fff3c0');
        break;
      case 'lantern':
        rect(ctx, x + 4, y, 2, 26, '#5a3a22');
        rect(ctx, x + 4, y, 6, 2, '#5a3a22');
        rect(ctx, x + 7, y + 2, 1, 3, '#3a2318');
        rect(ctx, x + 5, y + 5, 5, 7, '#3a2318');
        if (o.done) {
          var fl = reduceMotion ? 0 : (o.anim >> 3) % 2;
          ctx.fillStyle = 'rgba(255, 210, 122, 0.18)';
          ctx.beginPath(); ctx.arc(x + 7.5, y + 8.5, 14 + fl, 0, Math.PI * 2); ctx.fill();
          rect(ctx, x + 6, y + 6, 3, 5, '#ffd27a'); rect(ctx, x + 7, y + 7, 1, 3, '#fff3c0');
        } else {
          rect(ctx, x + 6, y + 6, 3, 5, '#6b5a4a');
        }
        break;
      case 'snail':
        var look = reduceMotion ? 0 : Math.round(Math.sin(t / 30));
        rect(ctx, x, y + 9, 16, 4, '#9c9478'); rect(ctx, x + 1, y + 9, 14, 1, '#c9c3a6');
        oval(ctx, x + 7, y + 6, 6, 5, '#8f4a33');
        oval(ctx, x + 7, y + 6, 4, 4, '#c46d4a');
        oval(ctx, x + 7, y + 6, 2, 2, '#e8a37a');
        rect(ctx, x + 7, y + 6, 1, 1, '#8f4a33');
        rect(ctx, x + 15, y + 3 + look, 1, 6, '#9c9478'); rect(ctx, x + 17, y + 4, 1, 5, '#9c9478');
        rect(ctx, x + 15, y + 2 + look, 1, 1, '#1d120d'); rect(ctx, x + 17, y + 3, 1, 1, '#1d120d');
        break;
      case 'log':
        rect(ctx, x, y + 2, o.w, 12, '#7a4a2a'); rect(ctx, x, y + 2, o.w, 2, '#9c6638'); rect(ctx, x, y + 12, o.w, 2, '#4c2c18');
        oval(ctx, x + 2, y + 8, 3, 6, '#5a3520'); oval(ctx, x + 2, y + 8, 2, 4, '#1f130d');
        rect(ctx, x + 10, y + 5, 10, 1, '#5e3820'); rect(ctx, x + 14, y + 9, 8, 1, '#5e3820');
        rect(ctx, x + 22, y, 3, 3, '#5d6e2a');
        if (!o.done && (t >> 4) % 3 === 0) rect(ctx, x + 2, y + 7, 1, 1, '#b9c3c9');
        break;
      case 'fragment':
        if (o.done && game.state !== 'ending') break;
        var gl = reduceMotion ? 0 : Math.sin(t / 12) * 2;
        ctx.fillStyle = 'rgba(127, 240, 255, 0.16)';
        ctx.beginPath(); ctx.arc(x + 7, y + 6, 12 + gl, 0, Math.PI * 2); ctx.fill();
        rect(ctx, x + 2, y + 6, 10, 4, '#6a7680');
        rect(ctx, x + 3, y + 3, 8, 4, '#b8c4cc');
        rect(ctx, x + 5, y + 1, 5, 3, '#b8c4cc');
        rect(ctx, x + 6, y + 1, 3, 1, '#e8f0f4');
        rect(ctx, x + 4, y + 4, 4, 1, '#e8f0f4');
        var on = (t >> 4) % 3;
        rect(ctx, x + 4, y + 7, 1, 1, on === 0 ? '#7ff0ff' : '#2c5a66');
        rect(ctx, x + 7, y + 7, 1, 1, on === 1 ? '#7ff0ff' : '#2c5a66');
        rect(ctx, x + 10, y + 7, 1, 1, on === 2 ? '#7ff0ff' : '#2c5a66');
        break;
    }
  }

  function drawBramble(colX, grow) {
    var h = Math.round(160 * grow);
    for (var y = 160 - h; y < 160; y += 4) {
      var off = ((y >> 2) % 2) ? 3 : 0;
      rect(ctx, colX + 2 + off, y, 10, 4, '#4a3a20');
      rect(ctx, colX + 4 + off, y, 2, 4, '#6a5a2a');
      rect(ctx, colX + off, y + 1, 2, 1, '#c8b88a');
      rect(ctx, colX + 12 + off, y + 2, 2, 1, '#c8b88a');
      if ((y >> 3) % 3 === 0) rect(ctx, colX + 7 + off, y + 1, 2, 2, '#a8402a');
    }
  }

  function drawEnemy(e, cam) {
    var x = Math.round(e.x - cam), y = Math.round(e.y);
    if (x < -40 || x > W + 40) return;
    var fr = Math.floor(e.anim / 10) % 2;
    if (e.flash > 0 && (e.flash >> 1) % 2) ctx.globalAlpha = 0.5;
    if (e.type === 'beetle') ctx.drawImage(facing(SPR.beetle[fr], e.dir), x, y);
    else if (e.type === 'ant') {
      var jit = e.state === 'windup' && !reduceMotion ? (e.t % 4 < 2 ? 1 : 0) : 0;
      ctx.drawImage(facing(SPR.ant[e.state === 'windup' ? 0 : fr], e.dir), x - 1 + jit, y - 1);
      if (e.state === 'windup') drawBubble(x + 4, y - 14, '!');
    } else if (e.type === 'larva') {
      if (e.state === 'buried') {
        oval(ctx, x + 8, y + 8, 8, 3, '#7f4c29');
        if (!reduceMotion && (game.t >> 4) % 2) rect(ctx, x + 6, y + 4, 2, 1, '#c9a77a');
      } else {
        var rise = e.state === 'rise' ? Math.round((e.t / 30) * 8) : 0;
        ctx.save();
        ctx.beginPath(); ctx.rect(x - 2, y - 4, 20, 12); ctx.clip();
        ctx.drawImage(facing(SPR.larva[Math.floor(e.anim / 14) % 2], e.dir), x, y - 1 + rise);
        ctx.restore();
        oval(ctx, x + 8, y + 8, 8, 2, '#7f4c29');
      }
    }
    ctx.globalAlpha = 1;
  }

  function drawBoss(cam) {
    var b = boss;
    if (b.state === 'gone') return;
    var x = Math.round(b.x - cam) - 4, y = Math.round(b.y) - 6;
    if (x < -60 || x > W + 60) return;
    var shakeX = b.state === 'windup' && !reduceMotion ? (b.t % 4 < 2 ? 1 : -1) : 0;
    if (b.flash > 0 && (b.flash >> 1) % 2) ctx.globalAlpha = 0.55;
    if (b.state === 'defeated') ctx.drawImage(facing(SPR.roachDead, b.dir), x, y + 2);
    else {
      var fr = b.state === 'charge' ? Math.floor(b.anim / 3) % 2 : b.state === 'flee' ? Math.floor(game.t / 3) % 2 : Math.floor(b.anim / 14) % 2;
      ctx.drawImage(facing(SPR.roach[fr], b.dir), x + shakeX, y);
    }
    ctx.globalAlpha = 1;
    if (b.state === 'stunned') {
      for (var i = 0; i < 3; i++) {
        var a = game.t / 10 + i * 2.1;
        rect(ctx, x + 24 + Math.cos(a) * 12, y + Math.sin(a) * 3 - 2, 2, 2, '#ffe07a');
      }
    }
    if (b.state === 'windup' && (b.t >> 2) % 2) drawBubble(x + 20, y - 14, '!');
  }

  function drawShots(cam) {
    for (var i = 0; i < shots.length; i++) {
      var s = shots[i], x = Math.round(s.x - cam), y = Math.round(s.y);
      if (s.kind === 'shell') {
        var f = (s.spin >> 2) % 4;
        rect(ctx, x, y + 1, 6, 4, '#8b4a22'); rect(ctx, x + 1, y, 4, 6, '#8b4a22');
        rect(ctx, x + (f < 2 ? 1 : 3), y + (f % 2 ? 1 : 3), 2, 2, '#e9cf9c');
      } else {
        rect(ctx, x, y, 4, 4, '#c9a77a'); rect(ctx, x + 1, y + 1, 2, 2, '#8a6a4a');
      }
    }
  }

  function drawPlayer(cam) {
    var p = player;
    if (p.inv > 0 && (p.inv >> 2) % 2 && game.state === 'playing') return;
    var pose = 'idle';
    if (!p.onGround || p.hurt > 0) pose = 'air';
    else if (p.shield) pose = 'shield';
    else if (p.throwAnim > 0) pose = 'throw';
    else if (Math.abs(p.vx) > 0.2) pose = 'run';
    drawHamster('chang', Math.round(p.x - 2 - cam), Math.round(p.y - 1), p.dir, pose, pose === 'run' ? p.runT : game.t);
    if (pose === 'throw' && p.throwAnim > 6) { /* arm already drawn */ }
  }

  function drawBackground(cam) {
    ctx.drawImage(sky.c, 0, 0);
    var sunX = Math.round(236 - cam * 0.02);
    oval(ctx, sunX, 112, 26, 26, '#f9c56a');
    oval(ctx, sunX, 112, 20, 20, '#ffd98a');
    oval(ctx, sunX, 112, 12, 12, '#ffe9b8');
    drawRepeat(clouds.c, cam * 0.08 + game.t * (reduceMotion ? 0 : 0.02), 0);
    drawRepeat(hills.c, cam * 0.15, 0);
    drawRepeat(farTrees.c, cam * 0.3, 0);
    drawRepeat(midTrees.c, cam * 0.55, 0);
  }
  function drawRepeat(img, off, y) {
    var w = img.width, o = Math.floor(off) % w;
    if (o < 0) o += w;
    ctx.drawImage(img, -o, y);
    if (w - o < W) ctx.drawImage(img, w - o, y);
  }

  function render() {
    var cam = Math.round(game.state === 'title' ? 0 : game.camX);
    var sx = game.shake > 0 && !reduceMotion ? ((game.t % 2) ? 1 : -1) * Math.ceil(game.shake / 4) : 0;
    ctx.save();
    ctx.translate(sx, 0);
    drawBackground(cam);
    ctx.drawImage(world.c, cam, 0, W, H, 0, 0, W, H);

    if (game.state !== 'title' && player) {
      if (game.arenaLocked || game.gateL > 0) {
        game.gateL = game.arenaLocked ? Math.min(1, game.gateL + 0.04) : Math.max(0, game.gateL - 0.04);
        if (game.gateL > 0) drawBramble(ARENA_L * T - cam, game.gateL);
      }
      if (!game.bossDefeated || game.gateR > 0) {
        if (game.bossDefeated) game.gateR = Math.max(0, game.gateR - 0.02);
        if (game.gateR > 0) drawBramble(ARENA_R * T - cam, game.gateR);
      }
      var i;
      for (i = 0; i < things.length; i++) drawThing(things[i], cam);
      for (i = 0; i < pickups.length; i++) {
        var k = pickups[i], kx = Math.round(k.x - cam);
        if (kx < -10 || kx > W + 10) continue;
        var by = k.phys || reduceMotion ? 0 : Math.round(Math.sin(k.bob / 14) * 1.5);
        ctx.drawImage(k.kind === 'shell' ? SPR.shell : SPR.berry, kx, Math.round(k.y) + by);
      }
      for (i = 0; i < enemies.length; i++) drawEnemy(enemies[i], cam);
      drawBoss(cam);
      drawPlayer(cam);
      drawShots(cam);
      if (game.state === 'playing') {
        var o = nearestThing();
        if (o) drawBubble(cx(o) - cam - 3, o.y - 14, coarseQuery.matches ? '!' : 'E');
      }
      for (i = 0; i < fx.length; i++) {
        var f = fx[i];
        rect(ctx, f.x - cam, f.y, f.life > 10 ? 2 : 1, f.life > 10 ? 2 : 1, f.col);
      }
      if (game.beam > 0) {
        var a = game.beam / 90;
        var bx = 8 * T + 7 - cam;
        ctx.fillStyle = 'rgba(255, 246, 214, ' + (0.55 * a).toFixed(3) + ')';
        ctx.fillRect(bx - 8, 0, 16, 160);
        ctx.fillStyle = 'rgba(255, 255, 255, ' + (0.7 * a).toFixed(3) + ')';
        ctx.fillRect(bx - 3, 0, 6, 160);
      }
    } else {
      // Title scene: the two friends at home before the light.
      for (var j = 0; j < things.length; j++) if (things[j].kind === 'basket') drawThing(things[j], 0);
      drawHamster('alice', 9 * T + 4, 160 - 15, -1, 'idle', game.t + 50);
      drawHamster('chang', 6 * T + 6, 160 - 15, 1, 'idle', game.t);
    }

    // ambient leaves and fireflies
    for (var l = 0; l < leaves.length; l++) {
      var lf = leaves[l];
      rect(ctx, lf.x, lf.y, lf.s + 1, lf.s, lf.col);
    }
    for (var q = 0; q < flies.length; q++) {
      var fl = flies[q];
      if (Math.sin(fl.ph * 2) > 0.2 || reduceMotion) rect(ctx, fl.x, fl.y, 1, 1, '#fff1a0');
    }
    ctx.restore();
    ctx.drawImage(vignette.c, 0, 0);
    if (game.flash > 0) {
      ctx.fillStyle = 'rgba(255, 250, 230, ' + (game.flash / 16 * 0.8).toFixed(3) + ')';
      ctx.fillRect(0, 0, W, H);
    }
  }

  // ---------------------------------------------------------------------------
  // Main loop
  // ---------------------------------------------------------------------------
  function tick() {
    if (game.state === 'paused') return;
    game.t++;
    if (game.state === 'playing') { updateWorld(); if (game.state === 'playing' || game.state === 'dialogue') game.frames++; }
    else if (game.state === 'dialogue' || game.state === 'ending') updateCamera();
    updateFx();
    pressed = {};
  }

  var last = performance.now(), acc = 0, STEP = 1000 / 60;
  function frame(now) {
    acc += Math.min(100, now - last);
    last = now;
    var steps = 0;
    while (acc >= STEP && steps < 5) { tick(); acc -= STEP; steps++; }
    if (steps === 5) acc = 0;
    render();
    window.requestAnimationFrame(frame);
  }

  // Title state uses a fresh world so the basket and friends render.
  buildEntities();
  player = newPlayer();
  updateHud();
  window.requestAnimationFrame(frame);

  // Exposed for automated checks in test tooling; read-only snapshot.
  window.__hamster = {
    snapshot: function () {
      return { state: game.state, shells: player.shells, hp: player.hp, clues: game.clues, x: Math.round(player.x),
        bossHp: boss.hp, bossState: boss.state, arenaLocked: game.arenaLocked, bossDefeated: game.bossDefeated };
    }
  };
})();
