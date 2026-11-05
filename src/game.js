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
  var rules = window.HamsterRules, saves = window.HamsterSave;
  var mapNumber = 1, mapLoot = [], mapMonsters = [], mapPurchases = [], attackId = 0;
  var audio = window.HamsterAudio || { sfx: function () {}, unlock: function () {}, play: function () {} };
  var seasons = ['Spring', 'Summer', 'Autumn', 'Winter'], season = Math.floor(Math.random() * 4);
  var defeatedCount = 0, burns = [], starting = false;
  function event(kind, data) { return saves.record(kind, data || {}, game.frames); }
  function hasSkill(id) { return mapPurchases.indexOf(id) !== -1; }

  function byId(id) { return document.getElementById(id); }
  var canvas = byId('game');
  var ctx = canvas.getContext('2d');
  ctx.imageSmoothingEnabled = false;

  var ui = {
    start: byId('screen-start'), pause: byId('screen-pause'), over: byId('screen-over'), end: byId('screen-end'),
    dialogue: byId('dialogue'), dlgName: byId('dlg-name'), dlgText: byId('dlg-text'), dlgNext: byId('dlg-next'),
    score: byId('hud-score'),
    boss: byId('hud-boss'), bossBar: byId('hud-boss-bar'), bossFill: byId('hud-boss-fill'),
    toast: byId('toast'), endScore: byId('end-score'), endClues: byId('end-clues'), endTime: byId('end-time'),
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
  var playerName = 'Guest', wardrobe = {}, equippedShellColor = '#8b4a22', lastShellSkin;
  function refreshWardrobe() {
    var profile = saves.snapshot().profile; wardrobe = profile.cosmetics; playerName = profile.name; mapPurchases = profile.purchases.slice();
    if (lastShellSkin === wardrobe.shell && SPR.equippedShell) return;
    lastShellSkin = wardrobe.shell;
    var oldSkins = { 'shell-teal': { color: '#68c2ad' }, 'shell-rose': { color: '#e88eac' }, 'shell-gold': { color: '#f2c45b' } };
    var skin = oldSkins[wardrobe.shell];
    equippedShellColor = skin ? skin.color : PAL_CHESTNUT.b;
    SPR.equippedShell = skin ? sprite(CHESTNUT_ROWS, { o: PAL_CHESTNUT.o, b: skin.color, h: '#fff2bd', c: PAL_CHESTNUT.c }) : SPR.shell;
  }
  saves.subscribe(refreshWardrobe); refreshWardrobe();
  var coinArt = makeLayer(42, 36);
  oval(coinArt.g, 21, 18, 21, 17, '#6d3d07');
  oval(coinArt.g, 21, 17, 20, 16, '#d78a16');
  oval(coinArt.g, 21, 16, 18, 14, '#ffe28c');
  oval(coinArt.g, 21, 17, 16, 12, '#f6c343');
  var coinLetters = [
    ['.####','#....','#....','.###.','....#','....#','####.'],
    ['.###.','#...#','#...#','#...#','#.#.#','#..#.','.##.#'],
    ['#...#','#..#.','#.#..','##...','#.#..','#..#.','#...#']
  ];
  for (var letter = 0; letter < 3; letter++) for (var row = 0; row < 7; row++) for (var col = 0; col < 5; col++) {
    if (coinLetters[letter][row][col] === '#') rect(coinArt.g, 4 + letter * 12 + col * 2, 9 + row * 2, 2, 2, '#543006');
  }
  rect(coinArt.g, 11, 4, 9, 1, '#fff2bd');
  SPR.coin = coinArt.c;

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
      [C, 'I’ll follow every little clue. Hold on, Alice.']
    ],
    basket: [
      [C, 'Her favourite basket. Two chestnuts are still tucked inside.'],
      [C, 'It’s warm, like it sat under that light.']
    ],
    scorch: [
      [N, 'A perfect ring of scorched grass, still smoking.'],
      [C, 'Whatever came down here was hot, and very round.']
    ],
    sign1: [[N, 'The signpost reads: “Chestnut Forest. Beetles nest past the old roots.”']],
    bush: [[N, 'You shake the bush. Three chestnuts tumble out.']],
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
      ['Mrs. Pebble', 'Those old lanterns have guided little paws through the forest for years.']
    ],
    snailAgain: [['Mrs. Pebble', 'The soldier ants have been restless ever since that strange light.']],
    lantern: [[N, 'The lantern flickers to life. Ten chestnuts sit tucked in its base.']],
    log: [
      [N, 'Inside the hollow log: a trail of oily prints, too round and even for any bug.'],
      [C, 'Metal feet? And two shells someone dropped in a hurry.']
    ],
    sign2: [[N, 'Scratched into the bark: “Forest exit. Turn back, little one.”']],
    boss: [
      [N, 'The ground trembles. A giant cockroach blocks the forest exit.'],
      ['Cockroach', 'Shiny things that fall in my forest are mine. Turn back, fluffball.'],
      [C, 'Not without knowing what happened to Alice.'],
      [N, 'The cockroach scrapes the earth, guarding whatever fell beyond the gate.']
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
      dead: false, safeX: game.checkpoint.x, safeY: game.checkpoint.y,
      runT: 0, wasGround: true, weapon: 'shell', weapons: ['shell'], ammo: { gun: 0, bomb: 0 }, attackIds: {}
    };
  }

  function addPickup(kind, c, row, extra) {
    var p = { kind: kind, x: c * T + 4, y: row * T - 12, w: 8, h: 8, vx: 0, vy: 0, phys: false, bob: (c * 7) % 60, taken: false };
    if (extra) for (var k in extra) p[k] = extra[k];
    pickups.push(p);
    return p;
  }

  function addEnemy(type, c, row) {
    var spec = mapMonsters[enemies.length] || rules.monster(Math.random(), Math.random(), mapNumber);
    type = spec.type;
    var sizes = { beetle: [14, 10], ant: [14, 13], larva: [16, 8], ember: [14, 13] };
    var scale = spec.size === 'large' ? 1.15 : 1, s = sizes[type].map(function (v) { return Math.ceil(v * scale); });
    enemies.push({
      id: enemies.length, type: type, x: c * T, y: row * T - s[1], w: s[0], h: s[1], vx: 0, vy: 0, dir: -1, hp: spec.hp, maxHp: spec.hp, size: spec.size, scale: scale,
      homeX: c * T, range: 56, state: type === 'larva' ? 'buried' : 'patrol', fireCd: 90 + enemies.length * 7, t: 0, knock: 0, flash: 0,
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
    return { id: 30, x: 198 * T, y: 10 * T - 20, w: 40, h: 20, vx: 0, vy: 0, dir: -1, hp: rules.hp(mapNumber, true), maxHp: rules.hp(mapNumber, true),
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
    for (var i = 0; i < shellSpots.length; i++) addPickup('shell', shellSpots[i][0], shellSpots[i][1], { forage: 'trail-' + i });
    // The original twelve enemies keep their places and animations. Eighteen
    // more inhabit the same authored forest; no art or tile map is replaced.
    for (var e = 0; e < rules.spawns.length; e++) {
      var spawn = rules.spawns[e]; addEnemy(spawn[0], spawn[1], spawn[2]);
    }

    addThing('basket', 8, 10, 14, 10);
    addThing('scorch', 20, 10, 28, 6, { clue: true });
    addThing('sign', 30, 10, 14, 18, { lines: 'sign1' });
    addThing('bush', 55, 10, 22, 14);
    addThing('chest', 58, 10, 16, 12);
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
    Enter: 'throw', KeyE: 'interact', Digit1: 'slot1', Digit2: 'slot2', Digit3: 'slot3', Numpad1: 'slot1', Numpad2: 'slot2', Numpad3: 'slot3'
  };
  function clearInput() {
    held = {}; pressed = {};
    joystickPointer = null; if (joystick) joystick.style.setProperty('--stick-x', '0px'); if (joystick) joystick.style.setProperty('--stick-y', '0px');
    var b = document.querySelectorAll('.pad-btn.is-pressed');
    for (var i = 0; i < b.length; i++) b[i].classList.remove('is-pressed');
  }

  window.addEventListener('keydown', function (e) {
    if (document.querySelector('dialog[open]') || (e.target && e.target.closest && e.target.closest('input, textarea, select, [contenteditable]'))) return;
    var code = e.code;
    if (code === 'Escape' || code === 'KeyP') {
      if (game.state === 'playing' || game.state === 'dialogue') { e.preventDefault(); pauseGame(); return; }
      if (game.state === 'paused') { e.preventDefault(); resumeGame(); return; }
    }
    if (game.state === 'dialogue') {
      if (code === 'KeyE' && !e.repeat) { e.preventDefault(); advanceDialogue(); }
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

  // One pointer owns the joystick. Other pointers remain free for the actions.
  var joystick = byId('joystick'), joystickPointer = null;
  function moveStick(e) {
    if (e.pointerId !== joystickPointer || game.state !== 'playing') return;
    var b = joystick.getBoundingClientRect(), dx = e.clientX - b.left - b.width / 2, dy = e.clientY - b.top - b.height / 2;
    var length = Math.sqrt(dx * dx + dy * dy), limit = b.width * 0.28, factor = length > limit ? limit / length : 1;
    joystick.style.setProperty('--stick-x', dx * factor + 'px'); joystick.style.setProperty('--stick-y', dy * factor + 'px');
    held.left = dx < -b.width * 0.12; held.right = dx > b.width * 0.12;
  }
  function releaseStick(e) {
    if (e && e.pointerId !== joystickPointer) return;
    joystickPointer = null; held.left = false; held.right = false;
    joystick.style.setProperty('--stick-x', '0px'); joystick.style.setProperty('--stick-y', '0px');
  }
  joystick.addEventListener('pointerdown', function (e) {
    if (game.state !== 'playing' || joystickPointer !== null) return;
    e.preventDefault(); joystickPointer = e.pointerId; try { joystick.setPointerCapture(e.pointerId); } catch (_) { /* synthetic/accessibility pointer */ } moveStick(e);
  });
  joystick.addEventListener('pointermove', moveStick);
  ['pointerup', 'pointercancel', 'lostpointercapture'].forEach(function (name) { joystick.addEventListener(name, releaseStick); });
  joystick.addEventListener('keydown', function (e) { if (e.code === 'ArrowLeft' || e.code === 'ArrowRight') e.preventDefault(); });

  canvas.addEventListener('pointerdown', function (e) {
    if (game.state === 'playing') { canvas.focus({ preventScroll: true }); if (e.button === 0 && e.pointerType !== 'touch') { e.preventDefault(); pressed.throw = true; } }
  });
  function selectWeapon(kind) {
    if (game.state !== 'playing' && game.state !== 'paused') return;
    if (player.weapons.indexOf(kind) === -1) return;
    player.weapon = player.weapon === kind ? 'shell' : kind; updateHud();
  }
  document.querySelectorAll('[data-slot]').forEach(function (button) {
    button.addEventListener('click', function () { selectWeapon(button.dataset.slot); });
  });
  byId('context-interact').addEventListener('click', function () { if (game.state === 'playing') { var o = nearestThing(); if (o) interact(o); } });
  window.addEventListener('hamster:identity', function () { if (game.state !== 'title') { gameOver(); toast('Profile changed. Restart this map to continue.'); } });

  // ---------------------------------------------------------------------------
  // Screens, HUD and dialogue
  // ---------------------------------------------------------------------------
  var screens = [ui.start, ui.pause, ui.over, ui.end];
  function showScreen(el, focusId) {
    for (var i = 0; i < screens.length; i++) screens[i].hidden = screens[i] !== el;
    if (el && focusId) byId(focusId).focus({ preventScroll: true });
  }
  function focusStage() { canvas.focus({ preventScroll: true }); }

  function updateHud() {
    ui.score.textContent = String(game.collected);
    document.body.dataset.gameState = game.state;
    ['gun', 'bomb', 'sword'].forEach(function (kind, i) {
      var button = byId('slot-' + (i + 1)), owned = player.weapons.indexOf(kind) !== -1;
      button.disabled = !owned; button.classList.toggle('is-owned', owned);
      button.setAttribute('aria-pressed', String(player.weapon === kind));
      var amount = owned ? kind === 'sword' ? '∞' : String(player.ammo[kind]) : '—';
      byId('ammo-' + kind).textContent = amount;
      button.setAttribute('aria-label', 'Slot ' + (i + 1) + ': ' + kind + (owned ? ', ' + amount + (kind === 'gun' ? ' bullets' : kind === 'bomb' ? ' bombs' : ' uses') + (player.weapon === kind ? ', selected. Select again for chestnuts.' : '') : ', not collected'));
    });
    byId('hud-map').textContent = String(mapNumber);
    byId('hud-enemies').textContent = defeatedCount + '/30';
    byId('hud-weapon').textContent = player.weapon === 'shell' ? 'Chestnut' : player.weapon.charAt(0).toUpperCase() + player.weapon.slice(1);
    byId('hud-ammo').textContent = player.weapon === 'gun' || player.weapon === 'bomb' ? ' · ' + player.ammo[player.weapon] : ' · ∞';
    byId('hud-timer').textContent = game.frames < 3600 ? 'Boss in ' + Math.max(0, 60 - Math.floor(game.frames / 60)) + 's' : game.bossDefeated ? 'Boss defeated' : 'Boss at forest exit';
    var showBoss = !game.bossDefeated && boss.state !== 'sleep';
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
    if (game.state !== 'dialogue') return;
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
    ui.dialogue.hidden = true;
    showScreen(ui.pause, 'btn-resume');
    ui.btnPause.textContent = 'Resume'; audio.play(false);
  }
  function resumeGame() {
    if (game.state !== 'paused') return;
    showScreen(null);
    ui.btnPause.textContent = 'Pause';
    game.state = game.prevState === 'dialogue' ? 'dialogue' : 'playing'; audio.play(true);
    ui.dialogue.hidden = game.state !== 'dialogue';
    if (game.state === 'dialogue') ui.dlgNext.focus({ preventScroll: true }); else focusStage();
  }

  async function startGame(nextMap, skipIntro) {
    if (starting) return;
    starting = true; void audio.unlock();
    var desiredMap = typeof nextMap === 'number' ? nextMap : mapNumber;
    var activeStart = byId(game.state === 'gameover' ? 'btn-retry' : game.state === 'ending' ? 'btn-again' : game.state === 'paused' ? 'btn-restart' : 'btn-start');
    var originalLabel = activeStart.textContent;
    activeStart.disabled = true; activeStart.textContent = 'Preparing map…';
    var setup;
    try { setup = await saves.beginMap(desiredMap); }
    catch (error) {
      starting = false; activeStart.disabled = false; activeStart.textContent = originalLabel;
      byId('game-error').textContent = error.message;
      // beginMap has ended the previous run. A failed restart must not resume
      // its stale world with no active save/reward tracking.
      if (game.state === 'paused' || game.state === 'playing' || game.state === 'dialogue') gameOver();
      return;
    }
    byId('game-error').textContent = '';
    mapNumber = desiredMap;
    mapLoot = setup.loot; mapMonsters = setup.monsters; mapPurchases = setup.purchases;
    season = Math.floor(Math.random() * 4); paintSky(); byId('hud-season').textContent = seasons[season];
    defeatedCount = 0; attackId = 0; burns = [];
    starting = false; activeStart.disabled = false; activeStart.textContent = originalLabel;
    game.checkpoint = { x: 6 * T, y: 10 * T - 14 };
    game.arenaLocked = false; game.bossDefeated = false; game.gateL = 0; game.gateR = 1;
    game.clues = 0; game.collected = 0; game.frames = 0; game.shake = 0;
    game.camX = 0; game.dropTimer = 120;
    buildEntities();
    player = newPlayer();
    ui.dialogue.hidden = true;
    ui.btnPause.textContent = 'Pause';
    showScreen(null);
    game.state = 'playing'; audio.play(true); if (mapNumber > 1) audio.sfx('level');
    game.beam = reduceMotion ? 0 : 90;
    game.flash = reduceMotion ? 0 : 16;
    updateHud();
    if (!skipIntro && mapNumber === 1) say(LINES.intro); else focusStage();
  }

  function gameOver() {
    if (game.state === 'gameover') return;
    player.dead = true; event('death');
    pickups = pickups.filter(function (p) { return p.kind !== 'coin' && p.kind !== 'weapon'; });
    shots = []; burns = [];
    game.state = 'gameover'; audio.play(false); ui.btnPause.textContent = 'Pause';
    clearInput();
    ui.dialogue.hidden = true;
    showScreen(ui.over, 'btn-retry');
  }

  function respawn() { return startGame(mapNumber, true); }

  function showEnding() {
    if (game.state === 'ending') return;
    audio.sfx('victory'); audio.play(false);
    event('finish', { map: mapNumber });
    game.state = 'ending';
    clearInput();
    var secs = Math.floor(game.frames / 60);
    ui.endScore.textContent = String(game.collected);
    ui.endClues.textContent = game.clues + ' of 3';
    ui.endTime.textContent = Math.floor(secs / 60) + ':' + String(secs % 60).padStart(2, '0');
    showScreen(ui.end, 'btn-again');
  }

  byId('btn-start').addEventListener('click', function () { void startGame(saves.snapshot().profile.highest_map, false); });
  byId('btn-replay').addEventListener('click', function () { void startGame(1, false); });
  byId('btn-again').addEventListener('click', function () { void startGame(mapNumber + 1, true); });
  byId('btn-restart').addEventListener('click', startGame);
  byId('btn-restart-over').addEventListener('click', startGame);
  byId('btn-retry').addEventListener('click', respawn);
  byId('btn-resume').addEventListener('click', resumeGame);
  ui.btnPause.addEventListener('click', function () {
    byId('menu-dialog').close();
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
  function addChestnuts(n, forage) {
    if (forage && event('forage', { source: forage }) === null) return;
    game.collected += n; updateHud();
  }

  function hurtPlayer(dmg, fromX) {
    if (game.state !== 'playing') return;
    player.dead = true; audio.sfx('hurt');
    burst(cx(player), player.y + 6, 6, ['#f6e2bd', '#d9893b']);
    gameOver();
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
    if (o.kind === 'fragment') return game.bossDefeated && defeatedCount === 30 && !o.done;
    if (o.kind === 'sign' || o.kind === 'snail' || o.kind === 'bush') return true;
    return !o.done;
  }

  function findClue() {
    game.clues++; audio.sfx('quest');
    updateHud();
    toast('Clue found: ' + game.clues + ' of 3');
  }

  function interact(o) {
    switch (o.kind) {
      case 'chest':
        if (o.done) return;
        o.done = true; addChestnuts(6, 'chest'); audio.sfx('chest'); toast('Chest opened. +6 points.'); burst(cx(o), o.y, 12, ['#ffe28c', '#f2a93b']); break;
      case 'basket':
        audio.sfx('item'); o.done = true; addChestnuts(2, o.kind); say(LINES.basket, function () { toast('+2 points'); }); break;
      case 'scorch':
        o.done = true; say(LINES.scorch, findClue); break;
      case 'sign':
        say(LINES[o.lines]); break;
      case 'bush':
        if (o.done) { say(LINES.bushEmpty); break; }
        o.done = true; o.anim = 30;
        for (var i = 0; i < 3; i++) {
          addPickup('shell', 0, 0, { x: cx(o) - 4 + (i - 1) * 4, y: o.y - 4, vx: (i - 1) * 1.1, vy: -2.6, phys: true, forage: 'bush-' + Math.floor(o.x / T) + '-' + i });
        }
        say(LINES.bush); break;
      case 'ribbon':
        o.done = true; say(LINES.ribbon, findClue); break;
      case 'lantern':
        o.done = true; o.anim = 1;
        addChestnuts(10, 'lantern-' + Math.floor(o.x / T)); audio.sfx('quest');
        burst(cx(o), o.y + 4, 10, ['#ffd27a', '#ffefb8']);
        say(LINES.lantern, function () { toast('Lantern lit. +10 points.'); }); break;
      case 'snail':
        if (o.done) { say(LINES.snailAgain); break; }
        o.done = true; say(LINES.snail); break;
      case 'log':
        o.done = true; addChestnuts(2, o.kind); say(LINES.log, findClue); break;
      case 'fragment':
        o.done = true; say(LINES.fragment, showEnding); break;
    }
  }

  function updatePlayer() {
    var p = player;
    var ax = (held.left ? -1 : 0) + (held.right ? 1 : 0);
    if (p.hurt > 0) {
      p.hurt--;
      p.vx *= 0.94;
    } else {
      var max = 1.7;
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
        p.vy = -JUMP_V; p.coyote = 0; p.jumpBuf = 0; p.onGround = false;
        dust(cx(p), p.y + p.h); audio.sfx('jump');
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
    ['gun', 'bomb', 'sword'].forEach(function (kind, i) { if (pressed['slot' + (i + 1)]) selectWeapon(kind); });
    if (pressed.throw && p.throwCd === 0 && p.hurt === 0) {
      var kind = p.weapon;
      if (kind === 'shell' || kind === 'sword' || p.ammo[kind] > 0) {
        if (kind === 'gun' || kind === 'bomb') p.ammo[kind]--;
        audio.sfx('attack'); p.throwCd = rules.cooldown(kind); p.throwAnim = 10;
        var aid = ++attackId;
        event('attack', { attack: aid, weapon: kind });
        shots.push({ id: aid, kind: kind, x: cx(p) + p.dir * 6 - 3, y: p.y + 3, w: kind === 'sword' ? 28 : 6, h: kind === 'sword' ? 18 : 6,
          vx: kind === 'sword' ? 0 : p.dir * (kind === 'gun' ? 5 : 3.4) + p.vx * 0.3, vy: kind === 'gun' || kind === 'sword' ? 0 : -1.5,
          g: kind === 'gun' || kind === 'sword' ? 0 : 0.14, life: kind === 'sword' ? 8 : 100, spin: 0, hits: [], bounces: 0, dir: p.dir });
        if (kind === 'sword') shots[shots.length - 1].x = p.dir > 0 ? p.x + p.w : p.x - 28;
        if ((kind === 'gun' || kind === 'bomb') && p.ammo[kind] === 0) { p.weapons = p.weapons.filter(function (w) { return w !== kind; }); p.weapon = 'shell'; }
        updateHud();
      } else {
        p.weapon = 'shell'; updateHud(); toast('Using chestnuts.');
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
      gameOver(); return;
    }
    if (p.inv > 0) p.inv--;
    if (Math.abs(p.vx) > 0.2 && p.onGround) { p.runT++; if (p.runT % 14 === 0) audio.sfx('move'); } else p.runT = 0;
  }

  function dropLoot(e) {
    if (e.dropped) return; e.dropped = true;
    var drop = mapLoot[e.id];
    if (drop) addPickup(drop === 'coin' ? 'coin' : drop === 'small' || drop === 'big' ? drop : 'weapon', 0, 0,
      { target: e.id, weapon: drop, x: cx(e) - 6, y: e.y - 12, w: drop === 'coin' ? 36 : 12, h: drop === 'coin' ? 31 : 10, vx: 0, vy: -2.4, phys: true });
  }

  function hitEnemy(e, dmg, fromX, aid) {
    if (e.dead) return;
    if (aid) event('hit', { target: e.id, attack: aid });
    e.hp -= dmg; e.flash = 8;
    if (e.type === 'larva' && e.state === 'buried') e.state = 'active';
    if (e.hp <= 0) {
      e.dead = true;
      defeatedCount++; event('defeat', { target: e.id }); dropLoot(e); updateHud();
      burst(cx(e), e.y + e.h / 2, 10, e.type === 'beetle' ? ['#3f6b4a', '#b9dc95'] : e.type === 'ant' ? ['#8e3324', '#c85a3c'] : ['#efe2c2', '#c9b282']);
    } else {
      e.vx = sign(cx(e) - fromX) * 1.6; e.knock = 10;
      if (e.state === 'charge') { e.state = 'patrol'; e.t = 50; }
    }
  }

  function updateEnemy(e) {
    if (e.dead) return;
    var p = player;
    e.anim++;
    if (e.flash > 0) e.flash--;
    var dx = cx(p) - cx(e), dy = (p.y + p.h) - (e.y + e.h);
    if (e.knock > 0) { e.knock--; e.vx *= 0.88; }
    else if (e.type === 'ember') {
      e.dir = sign(dx) || e.dir; e.vx = Math.abs(dx) < 120 ? 0 : e.dir * 0.3;
      if (Math.abs(dx) < 180 && Math.abs(dy) < 60 && --e.fireCd <= 0) {
        e.fireCd = 140;
        var distance = Math.max(1, Math.sqrt(dx * dx + dy * dy));
        shots.push({ kind: 'fire', x: cx(e), y: e.y + 3, w: 6, h: 6, vx: dx / distance * 1.65, vy: dy / distance * 1.65, g: 0, life: 130, spin: 0 });
      }
    } else if (e.type === 'beetle') {
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
    if (e.y > H + 40) { e.x = e.homeX; e.y = 120; e.vy = 0; }

    if (e.state === 'buried' || e.dead) return;
    if (!overlap(p, e) || game.state !== 'playing') return;
    var stomp = p.vy > 0.5 && (p.y + p.h - p.vy) <= e.y + 5;
    if (stomp) {
      var stompId = ++attackId;
      event('attack', { attack: stompId, weapon: 'stomp' });
      hitEnemy(e, 50, cx(p), stompId);
      p.vy = held.jump ? -5 : -3.6;
      p.noCut = true;
      dust(cx(p), p.y + p.h);
      return;
    }
    hurtPlayer(1, cx(e));
  }

  function bossStun(t) {
    boss.state = 'stunned'; boss.t = t; boss.vx = 0;
    game.shake = 10;
    burst(cx(boss), boss.y + 4, 8, ['#d9c08a', '#8a6a4a'], 3);
  }

  function damageBoss(n, aid) {
    if (boss.state === 'sleep' || boss.state === 'waiting' || boss.state === 'intro' || boss.state === 'defeated' || boss.state === 'flee' || boss.state === 'gone') return;
    if (aid) event('hit', { target: 30, attack: aid });
    boss.hp = Math.max(0, boss.hp - n); boss.flash = 8;
    updateHud();
    if (boss.hp <= 0) {
      boss.state = 'defeated'; boss.t = 70; boss.vx = 0;
      event('defeat', { target: 30 }); dropLoot(boss);
      game.shake = 16;
      burst(cx(boss), boss.y + 8, 16, ['#6e3b1c', '#b8743a', '#ffd27a'], 3);
    }
  }

  function updateBoss() {
    var b = boss, p = player;
    if (b.state === 'sleep') {
      if (game.frames < 3600) return;
      b.state = 'waiting'; toast('The cockroach has appeared at the forest exit.'); updateHud();
    }
    if (b.state === 'waiting') {
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
    var enraged = b.hp <= b.maxHp / 2;
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

    if (b.state === 'defeated' || !overlap(p, b) || game.state !== 'playing') return;
    var stomp = p.vy > 0.5 && (p.y + p.h - p.vy) <= b.y + 6;
    if (stomp) {
      p.vy = held.jump ? -5.2 : -4;
      p.noCut = true;
      if (b.state === 'stunned') {
        var stompId = ++attackId; event('attack', { attack: stompId, weapon: 'stomp' });
        damageBoss(50, stompId); burst(cx(p), p.y + p.h, 6, ['#ffd27a', '#ffffff']);
      }
      else dust(cx(p), p.y + p.h);
      return;
    }
    hurtPlayer(1, cx(b));
  }

  function updateShots() {
    for (var i = shots.length - 1; i >= 0; i--) {
      var s = shots[i];
      s.vy += s.g; s.x += s.vx; s.y += s.vy; s.life--; s.spin++;
      var wall = isSolid(Math.floor((s.x + s.w / 2) / T), Math.floor((s.y + s.h / 2) / T));
      if (wall && s.kind === 'shell' && hasSkill('ricochet') && s.bounces === 0) {
        s.x -= s.vx; s.y -= s.vy; s.vx *= -1; s.vy = -Math.abs(s.vy) * 0.7; s.bounces++; wall = false;
      }
      var hit = (s.life < 0) || (wall && s.kind !== 'sword');
      if (s.kind === 'bomb' && (hit || s.life < 40)) {
        burns.push({ id: s.id, x: s.x - 38, y: s.y - 24, w: 80, h: 48, frame: game.frames, life: 480, ticks: 0 });
        burst(s.x, s.y, 18, ['#f2a93b', '#e9735f', '#ffe28c'], 4);
        shots.splice(i, 1); continue;
      }
      if (!hit && (s.kind === 'shell' || s.kind === 'gun' || (s.kind === 'sword' && !s.checked))) {
        for (var j = 0; j < enemies.length; j++) {
          var e = enemies[j];
          if (!e.dead && e.state !== 'buried' && s.hits.indexOf(e.id) === -1 && overlap(s, e)) {
            hitEnemy(e, rules.damage(s.kind, mapPurchases), s.x - s.vx * 4, s.id); s.hits.push(e.id);
            hit = s.kind !== 'shell' || !hasSkill('piercing') || s.hits.length >= 3;
            if (hit) break;
          }
        }
        if (!hit && boss.state !== 'sleep' && boss.state !== 'waiting' && boss.state !== 'intro' && boss.state !== 'defeated' && boss.state !== 'flee' && boss.state !== 'gone' && s.hits.indexOf(30) === -1 && overlap(s, boss)) {
          damageBoss(rules.damage(s.kind, mapPurchases), s.id); s.hits.push(30); hit = true;
          burst(s.x, s.y, 5, ['#ffd27a', '#8b4a22']);
        }
      } else if (!hit && (s.kind === 'chip' || s.kind === 'fire') && overlap(s, player)) {
        hit = true;
        hurtPlayer(1, s.x); if (game.state !== 'playing') return;
      }
      if (s.kind === 'sword') { s.checked = true; if (s.life <= 0) shots.splice(i, 1); continue; }
      if (hit) {
        burst(s.x + s.w / 2, s.y + s.h / 2, 5, s.kind === 'shell' ? ['#8b4a22', '#e9cf9c'] : ['#c9a77a', '#8a6a4a']);
        shots.splice(i, 1);
      }
    }
  }

  function updateBurns() {
    for (var i = burns.length - 1; i >= 0; i--) {
      var fire = burns[i];
      // updateShots can create fire in this same frame. Only elapsed frames
      // count toward the 60-frame tick interval enforced by hf_progress.
      if (game.frames === fire.frame) continue;
      fire.life--; fire.ticks++;
      if (fire.ticks % 60 === 0) {
        for (var j = 0; j < enemies.length; j++) {
          var e = enemies[j];
          if (!e.dead && e.state !== 'buried' && overlap(e, fire)) hitEnemy(e, rules.damage('bomb', mapPurchases), fire.x, fire.id);
        }
        if (overlap(boss, fire)) damageBoss(rules.damage('bomb', mapPurchases), fire.id);
      }
      if (fire.life <= 0) burns.splice(i, 1);
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
        var c = Math.floor((k.x + k.w / 2) / T), r = Math.floor((k.y + k.h) / T);
        if (k.vy > 0 && (isSolid(c, r) || tileAt(c, r) === BRANCH)) { k.y = r * T - k.h - 2; k.vy = 0; k.vx = 0; k.phys = false; }
        if (k.y > H + 20) { k.taken = true; continue; }
      }
      var box = { x: k.x - 2, y: k.y - 2, w: k.w + 4, h: k.h + 4 };
      var nearby = overlap(player, { x: box.x - 8, y: box.y - 5, w: box.w + 16, h: box.h + 10 });
      var touch = window.matchMedia('(pointer: coarse)').matches || navigator.maxTouchPoints > 0;
      if (nearby && (touch || pressed.interact)) {
        k.taken = true; // Claim before any side effect; an input frame cannot re-collect.
        if (k.kind === 'shell') { audio.sfx('item'); addChestnuts(1, k.forage); }
        else {
          if (event('pickup', { target: k.target }) === null) continue;
          if (k.kind === 'small' || k.kind === 'big') { game.collected += k.kind === 'big' ? 5 : 1; audio.sfx('item'); }
          else if (k.kind === 'coin') { audio.sfx('coin'); toast('+1 SQK' + (saves.snapshot().ranked ? ' · saving' : ' · this run only')); }
          else if (k.kind === 'weapon') {
            audio.sfx('item');
            if (player.weapons.indexOf(k.weapon) === -1) player.weapons.push(k.weapon);
            if (k.weapon === 'gun') player.ammo.gun = 100;
            if (k.weapon === 'bomb') player.ammo.bomb += 3;
            toast(k.weapon === 'gun' ? 'Gun collected · 100 bullets' : k.weapon === 'bomb' ? 'Bombs collected · 3 throws' : 'Sword collected');
          }
        }
        updateHud(); burst(k.x + 4, k.y + 4, 4, ['#e9cf9c', '#d48a4e']);
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
      if (game.state !== 'playing') return;
    }
    updateBoss();
    if (game.state !== 'playing') return;
    updateShots();
    if (game.state !== 'playing') return;
    updateBurns();
    updatePickups();
    if (game.frames % 60 === 0) updateHud();
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
  function paintSky() {
    var bands = ['#2e2245', '#3d2850', '#552f55', '#733856', '#933f52', '#b34d4b', '#cf6444', '#e5803f', '#f19c47', '#f6b85a'];
    if (season === 0) bands = ['#3b3458','#494565','#5b5675','#766080','#9b7885','#bd9291','#d9af9e','#e5c0a7','#f0d2b0','#f9dfbd'];
    if (season === 1) bands = ['#294854','#365e67','#4c757b','#678d88','#8ba98f','#b1bd93','#d0ca94','#dfd69f','#eeddab','#f9e6b6'];
    if (season === 3) bands = ['#253345','#34485d','#425c70','#536e7e','#6b8490','#889fa7','#a4b7b9','#bfd0d0','#d6e0dc','#e5ece3'];
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
  }
  paintSky();

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
    if (kind === 'chang') {
      var cosmetics = wardrobe;
      var oldShirts = { 'shirt-coral': { color: '#df786e' }, 'shirt-blue': { color: '#78b8dc' }, 'shirt-purple': { color: '#b49bdc' } };
      var shirt = !cosmetics.costume && oldShirts[cosmetics.shirt];
      if (shirt) { rect(ctx, fx_(5, 8), y + 9 + bob, 8, 3, shirt.color); rect(ctx, fx_(4, 2), y + 8 + bob, 2, 2, shirt.color); }
      if (cosmetics.costume) rules.costumeArt(cosmetics.costume).forEach(function (r) { rect(ctx, fx_(r[0], r[2]), y + r[1] + bob, r[2], r[3], r[4]); });
      if (cosmetics.vest && !cosmetics.costume) { rect(ctx, fx_(4, 3), y + 8 + bob, 3, 4, '#687a60'); rect(ctx, fx_(11, 2), y + 8 + bob, 2, 4, '#687a60'); rect(ctx, fx_(5, 1), y + 9 + bob, 1, 1, '#f2c45b'); }
    }
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
      case 'chest':
        rect(ctx, x, y + 3, 16, 9, '#6d3d07'); rect(ctx, x + 1, y + 4, 14, 7, '#b8743a');
        rect(ctx, x, o.done ? y - 3 : y, 16, 4, '#e0ac5d'); rect(ctx, x + 6, y + 4, 4, 4, '#ffe28c');
        if (o.done) rect(ctx, x + 1, y + 3, 14, 2, '#26180f');
        break;
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
    if (e.type === 'ember') {
      oval(ctx, x + e.w / 2, y + e.h / 2 + 1, e.w / 2, e.h / 2, '#8e3324');
      rect(ctx, x + 3, y, e.w - 6, 4, '#f2a93b'); rect(ctx, x + (e.dir > 0 ? e.w - 4 : 2), y + 5, 2, 2, '#fff2bd');
      if (e.fireCd < 30) { rect(ctx, x + e.w / 2 - 2, y - 5, 4, 4, '#ffdb78'); drawBubble(x + 2, y - 18, '!'); }
    } else if (e.type === 'beetle') ctx.drawImage(facing(SPR.beetle[fr], e.dir), x, y, e.w, e.h);
    else if (e.type === 'ant') {
      var jit = e.state === 'windup' && !reduceMotion ? (e.t % 4 < 2 ? 1 : 0) : 0;
      ctx.drawImage(facing(SPR.ant[e.state === 'windup' ? 0 : fr], e.dir), x - 1 + jit, y - 1, e.w + 2, e.h + 1);
      if (e.state === 'windup') drawBubble(x + 4, y - 14, '!');
    } else if (e.type === 'larva') {
      if (e.state === 'buried') {
        oval(ctx, x + 8, y + 8, 8, 3, '#7f4c29');
        if (!reduceMotion && (game.t >> 4) % 2) rect(ctx, x + 6, y + 4, 2, 1, '#c9a77a');
      } else {
        var rise = e.state === 'rise' ? Math.round((e.t / 30) * 8) : 0;
        ctx.save();
        ctx.beginPath(); ctx.rect(x - 2, y - 4, e.w + 4, e.h + 4); ctx.clip();
        ctx.drawImage(facing(SPR.larva[Math.floor(e.anim / 14) % 2], e.dir), x, y - 1 + rise, e.w, e.h);
        ctx.restore();
        oval(ctx, x + 8, y + 8, 8, 2, '#7f4c29');
      }
    }
    ctx.globalAlpha = 1;
    if (e.hp < e.maxHp) {
      rect(ctx, x, y - 4, e.w, 2, '#3a2318');
      rect(ctx, x, y - 4, Math.max(1, Math.round(e.w * e.hp / e.maxHp)), 1, '#e9735f');
    }
  }

  function drawBoss(cam) {
    var b = boss;
    if (b.state === 'gone' || b.state === 'sleep') return;
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
        rect(ctx, x, y + 1, 6, 4, equippedShellColor); rect(ctx, x + 1, y, 4, 6, equippedShellColor);
        rect(ctx, x + (f < 2 ? 1 : 3), y + (f % 2 ? 1 : 3), 2, 2, '#e9cf9c');
      } else if (s.kind === 'fire') {
        oval(ctx, x + 3, y + 3, 4, 3, '#e9735f'); rect(ctx, x + 1, y + 1, 4, 4, '#f2a93b'); rect(ctx, x + 2, y + 2, 2, 2, '#fff2bd');
      } else if (s.kind === 'gun') {
        rect(ctx, x, y + 2, 6, 2, '#ffe28c'); rect(ctx, x + 4, y + 1, 2, 1, '#fff2bd');
      } else if (s.kind === 'sword') {
        rect(ctx, x, y + 5, 24, 3, '#dce7e6'); rect(ctx, x + 5, y + 3, 2, 7, '#f2c45b');
      } else if (s.kind === 'bomb') {
        rect(ctx, x + 1, y + 1, 5, 5, '#687a60'); rect(ctx, x + 3, y - 1, 2, 2, '#e9735f');
      } else {
        rect(ctx, x, y, 4, 4, '#c9a77a'); rect(ctx, x + 1, y + 1, 2, 2, '#8a6a4a');
      }
    }
  }
  function drawWeapon(kind, x, y) {
    rect(ctx, x - 2, y - 2, 17, 14, '#26180f');
    if (kind === 'gun') { rect(ctx, x, y + 2, 12, 4, '#b8c4cc'); rect(ctx, x + 2, y + 5, 3, 5, '#687a60'); }
    else if (kind === 'sword') { rect(ctx, x + 5, y - 1, 3, 9, '#dce7e6'); rect(ctx, x + 2, y + 6, 9, 2, '#f2c45b'); rect(ctx, x + 5, y + 8, 3, 3, '#8b4a22'); }
    else { rect(ctx, x + 2, y + 2, 8, 8, '#687a60'); rect(ctx, x + 5, y - 1, 2, 3, '#e9735f'); }
  }

  function drawPlayer(cam) {
    var p = player;
    if (p.inv > 0 && (p.inv >> 2) % 2 && game.state === 'playing') return;
    var pose = 'idle';
    if (!p.onGround || p.hurt > 0) pose = 'air';
    else if (p.throwAnim > 0) pose = 'throw';
    else if (Math.abs(p.vx) > 0.2) pose = 'run';
    ctx.save(); ctx.translate(Math.round(p.x - 3 - cam), Math.round(p.y - 3)); ctx.scale(1.15, 1.15);
    drawHamster('chang', 0, 0, p.dir, pose, pose === 'run' ? p.runT : game.t); ctx.restore();
    drawName(playerName, cx(p) - cam, p.y - 15);
    if (pose === 'throw' && p.throwAnim > 6) { /* arm already drawn */ }
  }

  function drawName(name, x, y) {
    ctx.font = 'bold 10px sans-serif'; ctx.textAlign = 'center';
    var width = ctx.measureText(name).width + 8;
    x = clamp(x, width / 2 + 2, W - width / 2 - 2); y = Math.max(10, y);
    rect(ctx, x - width / 2, y - 10, width, 14, '#26180f'); ctx.fillStyle = '#fbf3e4'; ctx.fillText(name, Math.round(x), Math.round(y));
  }

  function drawBackground(cam) {
    if (reduceMotion) cam = 0;
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
        if (kx < -40 || kx > W + 40) continue;
        var by = k.phys || reduceMotion ? 0 : Math.round(Math.sin(k.bob / 14) * 1.5);
        if (k.kind === 'weapon') drawWeapon(k.weapon, kx, Math.round(k.y) + by);
        else if (k.kind === 'coin') ctx.drawImage(SPR.coin, kx, Math.round(k.y) + by, k.w, k.h);
        else ctx.drawImage(SPR.shell, kx, Math.round(k.y) + by, k.kind === 'big' ? 13 : 8, k.kind === 'big' ? 13 : 8);
      }
      for (i = 0; i < burns.length; i++) {
        var fire = burns[i];
        for (var flame = 0; flame < 10; flame++) {
          var height = reduceMotion ? 5 : 4 + ((game.t + flame * 7) % 12);
          var fireBase = Math.min(160, fire.y + 30);
          rect(ctx, fire.x - cam + flame * 8, fireBase - height, 5, height, '#e9735f');
          rect(ctx, fire.x - cam + flame * 8 + 1, fireBase - height + 3, 3, Math.max(2, height - 3), '#f2a93b');
        }
      }
      for (i = 0; i < enemies.length; i++) drawEnemy(enemies[i], cam);
      drawBoss(cam);
      drawPlayer(cam);
      drawShots(cam);
      if (game.state === 'playing') {
        var o = nearestThing();
        var contextButton = byId('context-interact'); contextButton.hidden = !o || !coarseQuery.matches; if (o) contextButton.textContent = o.kind === 'snail' ? 'Talk' : o.kind === 'chest' || o.kind === 'basket' || o.kind === 'bush' ? 'Open' : 'Read';
        for (var pi = 0; pi < pickups.length; pi++) { var pk = pickups[pi]; if (!pk.taken && !coarseQuery.matches && Math.abs(cx(pk) - cx(player)) < 28 && Math.abs(pk.y - player.y) < 24) drawBubble(cx(pk) - cam, pk.y - 10, 'E'); }
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
      if (season === 2) rect(ctx, lf.x, lf.y, lf.s + 1, lf.s, lf.col);
      else if (season === 3) rect(ctx, lf.x, lf.y, lf.s, lf.s, '#f5f8ff');
      else if (season === 0 && l < 5) {
        var birdX = (lf.x + (reduceMotion ? 0 : game.t * 0.3)) % W, birdY = 25 + l * 8, flap = reduceMotion ? 1 : Math.floor(game.t / 10) % 2;
        rect(ctx, birdX, birdY, 1, 1, '#26180f'); rect(ctx, birdX - 2, birdY - flap - 1, 2, 1, '#26180f'); rect(ctx, birdX + 1, birdY - flap - 1, 2, 1, '#26180f');
      }
    }
    for (var q = 0; q < flies.length; q++) {
      var fl = flies[q];
      if (Math.sin(fl.ph * 2) > 0.2 || reduceMotion) rect(ctx, fl.x, fl.y, 1, 1, '#fff1a0');
    }
    if (season === 1) {
      ctx.globalAlpha = reduceMotion ? 0.12 : 0.1 + Math.sin(game.t / 80) * 0.03;
      for (var ray = 0; ray < 4; ray++) { ctx.fillStyle = '#fff2bd'; ctx.beginPath(); ctx.moveTo(210 + ray * 24, 0); ctx.lineTo(110 + ray * 30, H); ctx.lineTo(130 + ray * 30, H); ctx.lineTo(216 + ray * 24, 0); ctx.fill(); }
      ctx.globalAlpha = 1;
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
    document.body.dataset.gameState = game.state;
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
  updateHud(); byId('hud-season').textContent = seasons[season];
  window.requestAnimationFrame(frame);

  // Player menus can pause the game. All gameplay diagnostics are read-only.
  window.__hamster = {
    pause: pauseGame, resume: resumeGame,
    snapshot: function () {
      return { state: game.state, score: game.collected, dead: player.dead, clues: game.clues, x: Math.round(player.x), y: Math.round(player.y),
        bossHp: boss.hp, bossState: boss.state, arenaLocked: game.arenaLocked, bossDefeated: game.bossDefeated,
        map: mapNumber, enemyCount: enemies.length, defeated: defeatedCount, frame: game.frames,
        attacks: attackId, weapon: player.weapon, ammo: Object.assign({}, player.ammo), weapons: player.weapons.slice(),
        coinCount: pickups.filter(function (p) { return p.kind === 'coin'; }).length, burningAreas: burns.length,
        season: seasons[season], enemyTypes: enemies.map(function (e) { return { id: e.id, type: e.type, size: e.size, hp: e.hp, maxHp: e.maxHp }; }), fireProjectiles: shots.filter(function (s) { return s.kind === 'fire'; }).length, regularHp: rules.hp(mapNumber), purchases: mapPurchases.slice() };
    }
  };
})();
