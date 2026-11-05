/* Shared, dependency-free game rules. The SQL migration independently enforces
   these values; scripts/test.mjs checks the game and the backend contract. */
// @ts-check
(function () {
  'use strict';
  var catalogue = [
    { id: 'costume-deadpool', name: 'Deadpool hamster', price: 50, slot: 'costume', color: '#c9423a', description: 'A red mask, dark eye patches and twin blades. Cosmetic only.' },
    { id: 'costume-batman', name: 'Batman hamster', price: 50, slot: 'costume', color: '#68727b', description: 'A pointed cowl, gold belt and dark cape. Cosmetic only.' },
    { id: 'costume-spiderman', name: 'Spider-Man hamster', price: 50, slot: 'costume', color: '#d54b42', description: 'A red web mask and blue suit. Cosmetic only.' },
    { id: 'costume-superman', name: 'Superman hamster', price: 50, slot: 'costume', color: '#4887bd', description: 'A blue suit, red cape and gold chest crest. Cosmetic only.' },
    { id: 'costume-samurai', name: 'Samurai hamster', price: 50, slot: 'costume', color: '#a75a45', description: 'Lacquered armour, a horned helmet and a katana. Cosmetic only.' },
    { id: 'damage-10', name: '+10% weapon damage', price: 50, slot: 'upgrade', color: '#f2a93b', description: 'Adds 10% of base damage to gun, sword and bomb.' },
    { id: 'damage-20', name: '+20% weapon damage', price: 50, slot: 'upgrade', color: '#f2a93b', description: 'Adds 20% of base damage to gun, sword and bomb.' },
    { id: 'damage-25', name: '+25% weapon damage', price: 150, slot: 'upgrade', color: '#f2a93b', description: 'Adds 25% of base damage to gun, sword and bomb. All three stack to +55%.' }
  ];
  /** @type {Array<[string, number, number]>} */
  var spawns = [
    ['beetle',45,10], ['beetle',75,10], ['beetle',98,10], ['beetle',108,8],
    ['ant',102,10], ['ant',117,10], ['ant',131,10], ['larva',141,10],
    ['larva',150,10], ['ant',160,10], ['larva',163,10], ['beetle',166,10],
    ['beetle',34,10], ['beetle',38,10], ['beetle',52,10], ['ant',58,10],
    ['beetle',68,10], ['ant',83,10], ['beetle',94,10], ['ant',113,10],
    ['beetle',125,10], ['ant',129,10], ['larva',139,10], ['beetle',146,10],
    ['larva',154,10], ['beetle',172,10], ['ant',178,10], ['beetle',190,10],
    ['ant',201,10], ['beetle',204,10]
  ];
  /** @param {number} map @param {boolean} [boss] @param {string} [size] */
  function hp(map, boss, size) { return Math.ceil((boss ? 300 : size === 'small' ? 50 : 100) * Math.pow(1.2, Math.max(0, map - 1))); }
  function monster(roll, sizeRoll, map) {
    var type = ['beetle', 'ant', 'larva', 'ember'][Math.min(3, Math.floor(roll * 4))];
    var size = sizeRoll < 0.5 ? 'small' : 'large';
    return { type: type, size: size, hp: hp(map, false, size) };
  }
  /** Exactly one roll; adjacent intervals cover [0, 1). */
  function drop(roll) {
    if (!(roll >= 0 && roll < 1)) throw new RangeError('Drop roll must be in [0, 1).');
    return roll < 0.1 ? 'big' : roll < 0.5 ? 'small' : roll < 0.7 ? 'coin' : roll < 0.8 ? 'gun' : roll < 0.9 ? 'sword' : 'bomb';
  }
  /** @param {string} kind @param {string[]} purchases */
  function damage(kind, purchases) {
    var base = kind === 'gun' ? 20 : kind === 'sword' || kind === 'stomp' ? 50 : kind === 'bomb' ? 5 : purchases.includes('charged') ? 37.5 : 25;
    var bonus = (purchases.includes('damage-10') ? 10 : 0) + (purchases.includes('damage-20') ? 20 : 0) + (purchases.includes('damage-25') ? 25 : 0);
    return ['gun', 'sword', 'bomb'].includes(kind) ? base * (100 + bonus) / 100 : base;
  }
  /** @param {string} kind */
  function cooldown(kind) { return kind === 'gun' ? 10 : kind === 'sword' ? 30 : kind === 'bomb' ? 60 : kind === 'stomp' ? 18 : 16; }
  /** @param {string} name */
  function validName(name) { return /^[\p{L}\p{N} _-]{2,20}$/u.test(name.trim()); }
  function forageValue(source) {
    if (/^trail-([0-9]|[12][0-9]|3[0-3])$/.test(source)) return 1;
    if (source === 'chest') return 6;
    if (source === 'basket' || source === 'log') return 2;
    if (source === 'lantern-93' || source === 'lantern-174') return 10;
    return /^bush-(54|176)-[0-2]$/.test(source) ? 1 : 0;
  }
  /** Pixel overlays use the original hamster’s 16×16 coordinate grid. */
  /** @returns {Array<[number, number, number, number, string]>} */
  function costumeArt(id) {
    var dark = '#26180f', gold = '#f2c45b', white = '#fbf3e4', red = '#c9423a', blue = '#4887bd';
    var masks = {
      'costume-deadpool': [[3,3,11,6,red],[5,5,3,3,dark],[10,5,3,3,dark],[5,6,2,1,white],[10,6,2,1,white],[4,9,10,4,red],[7,9,3,4,dark],[3,12,12,1,dark],[2,8,1,5,'#b8c4cc'],[14,8,1,5,'#b8c4cc']],
      'costume-batman': [[3,0,2,4,dark],[12,0,2,4,dark],[3,3,11,4,dark],[5,5,2,1,white],[10,5,2,1,white],[4,9,10,4,'#68727b'],[2,8,2,7,dark],[14,8,2,7,dark],[4,12,10,1,gold],[7,10,4,1,dark]],
      'costume-spiderman': [[3,3,11,6,red],[4,5,4,2,white],[10,5,3,2,white],[8,3,1,6,dark],[3,4,11,1,dark],[3,8,11,1,dark],[4,9,10,2,red],[4,11,10,3,blue],[8,9,1,4,dark]],
      'costume-superman': [[1,8,3,7,red],[14,8,3,7,red],[4,9,10,4,blue],[7,9,5,3,gold],[8,10,3,1,red],[7,11,2,1,red],[4,12,10,1,gold],[6,13,6,1,red]],
      'costume-samurai': [[3,1,2,3,gold],[12,1,2,3,gold],[4,2,9,3,dark],[6,1,5,2,red],[2,4,13,1,dark],[4,8,10,5,'#a75a45'],[4,9,10,1,dark],[4,11,10,1,dark],[8,8,2,6,dark],[15,6,1,8,'#b8c4cc'],[13,11,4,1,gold]]
    };
    return masks[id] || [];
  }
  var api = Object.freeze({ catalogue: Object.freeze(catalogue), costumeArt: costumeArt, forageValue: forageValue, spawns: Object.freeze(spawns), hp: hp, monster: monster, drop: drop, damage: damage, cooldown: cooldown, validName: validName });
  // Both the browser and the Node test VM use this same global.
  globalThis.HamsterRules = api;
})();
