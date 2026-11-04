/* Shared, dependency-free game rules. The SQL migration independently enforces
   these values; scripts/test.mjs checks the game and the backend contract. */
// @ts-check
(function () {
  'use strict';
  var catalogue = [
    { id: 'vest', name: 'Forest vest', price: 100, slot: 'vest', color: '#687a60', description: 'A little explorer vest. Cosmetic; every unblocked hit is still fatal.' },
    { id: 'shirt-coral', name: 'Coral T-shirt', price: 20, slot: 'shirt', color: '#df786e', description: 'A bright coral shirt for Chang.' },
    { id: 'shirt-blue', name: 'Sky T-shirt', price: 20, slot: 'shirt', color: '#78b8dc', description: 'A sky-blue shirt for Chang.' },
    { id: 'shirt-purple', name: 'Lilac T-shirt', price: 20, slot: 'shirt', color: '#b49bdc', description: 'A lilac shirt for Chang.' },
    { id: 'shell-teal', name: 'Jade chestnut', price: 100, slot: 'shell', color: '#68c2ad', description: 'A jade-green chestnut skin.' },
    { id: 'shell-rose', name: 'Rose chestnut', price: 100, slot: 'shell', color: '#e88eac', description: 'A rose-pink chestnut skin.' },
    { id: 'shell-gold', name: 'Honey chestnut', price: 100, slot: 'shell', color: '#f2c45b', description: 'A honey-gold chestnut skin.' },
    { id: 'charged', name: 'Charged Chestnut', price: 150, slot: 'skill', color: '#f2c45b', description: '+50% chestnut damage: 37.5 instead of 25. Always active once owned.' },
    { id: 'piercing', name: 'Piercing Chestnut', price: 250, slot: 'skill', color: '#78b8dc', description: 'Each chestnut can pierce up to 3 enemies. Always active once owned.' },
    { id: 'ricochet', name: 'Ricochet Chestnut', price: 300, slot: 'skill', color: '#b49bdc', description: 'Each chestnut bounces once off solid terrain. Always active once owned.' }
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
  /** @param {number} map @param {boolean} [boss] */
  function hp(map, boss) { return Math.ceil((boss ? 500 : 100) * Math.pow(1.2, Math.max(0, map - 1))); }
  /** @param {number} roll @returns {string|null} */
  function drop(roll) {
    if (roll >= 0.3) return null;
    return roll < 0.09 ? 'gun' : roll < 0.18 ? 'sword' : 'grenade';
  }
  /** @param {string} kind @param {string[]} purchases */
  function damage(kind, purchases) {
    return kind === 'gun' ? 20 : kind === 'sword' || kind === 'stomp' ? 50 : kind === 'grenade' ? 5 : purchases.includes('charged') ? 37.5 : 25;
  }
  /** @param {string} kind */
  function cooldown(kind) { return kind === 'gun' ? 10 : kind === 'sword' ? 30 : kind === 'grenade' ? 60 : kind === 'stomp' ? 18 : 16; }
  /** @param {string} name */
  function validName(name) { return /^[\p{L}\p{N} _-]{2,20}$/u.test(name.trim()); }
  var api = Object.freeze({ catalogue: Object.freeze(catalogue), spawns: Object.freeze(spawns), hp: hp, drop: drop, damage: damage, cooldown: cooldown, validName: validName });
  // Both the browser and the Node test VM use this same global.
  globalThis.HamsterRules = api;
})();
