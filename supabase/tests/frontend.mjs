// Regression: actual engine events -> durable save.js outbox -> PostgreSQL RPCs.
// Auth/transport, drop RNG, collision positions and server elapsed time are test
// fixtures. Damage, attack timing, pickups, sequence/ack and purchases are real.
// Usage: node supabase/tests/frontend.mjs /path/to/pglite/dist/index.js
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { fixture } from '../../scripts/test.mjs';

if (!process.argv[2]) throw new Error('Pass the PGlite module path. See README.md.');
const { PGlite } = await import(pathToFileURL(resolve(process.argv[2])).href);
const db = await PGlite.create();
let checks = 0;
async function check(name, fn) { await fn(); checks++; console.log('ok', name); }

try {
  await db.exec(`create role anon; create role authenticated; create schema auth;
    grant usage on schema auth to authenticated;
    create table auth.users(id uuid primary key);
    create function auth.uid() returns uuid language sql stable as $$
      select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid
    $$;`);
  await db.exec(await readFile(new URL('../migrations/001_friendship.sql', import.meta.url), 'utf8'));

  // Immediate wall impact, a wall reached later, and the full airborne fuse.
  for (const impact of ['immediate', 'delayed', 'fuse']) {
    const user = randomUUID(), token = randomUUID(), publicKey = randomUUID();
    const batches = [], errors = [];
    let runId, offline = false;
    async function admin(sql, args = []) {
      await db.exec('reset role');
      return db.query(sql, args);
    }
    async function fetch(url, options) {
      assert.equal(options.headers.apikey, publicKey);
      const path = new URL(url).pathname, body = JSON.parse(options.body);
      const response = (status, data) => ({ ok: status === 200, status, json: async () => data });
      if (path === '/auth/v1/signup') {
        await admin('insert into auth.users(id) values($1)', [user]);
        return response(200, { access_token: token, refresh_token: token, expires_in: 3600 });
      }
      assert.equal(options.headers.Authorization, 'Bearer ' + token);
      const name = path.split('/').at(-1);
      const definitions = {
        hf_profile: { p_name: 'text' }, hf_start_run: { p_map: 'integer' },
        hf_progress: { p_run: 'uuid', p_events: 'jsonb' }, hf_purchase: { p_item: 'text' }
      };
      assert(Object.hasOwn(definitions, name), 'Unexpected RPC: ' + name);
      if (name === 'hf_progress' && offline) return response(503, { message: 'Test connection interrupted.' });
      try {
        await db.exec('reset role');
        await db.query("select set_config('request.jwt.claim.sub',$1,false)", [user]);
        await db.exec('set role authenticated');
        const args = Object.keys(body), def = definitions[name];
        assert(args.every(k => Object.hasOwn(def, k)));
        const values = args.map(k => def[k] === 'jsonb' ? JSON.stringify(body[k]) : body[k]);
        const query = 'select public.' + name + '(' + args.map((k, i) => k + '=>$' + (i + 1) + '::' + def[k]).join(',') + ') as result';
        const data = (await db.query(query, values)).rows[0].result;
        if (name === 'hf_start_run') {
          runId = data.id;
          // Deterministic grenade drop; never grant ammo or alter enemy HP.
          await admin("update hf_private.runs set loot[1]='grenade', started_at=clock_timestamp()-interval '1 hour' where id=$1", [runId]);
          data.loot[0] = 'grenade';
        }
        if (name === 'hf_progress') batches.push(body.p_events);
        return response(200, data);
      } catch (error) {
        errors.push(error.message);
        return response(400, { message: error.message });
      }
    }

    const options = {
      config: { supabaseUrl: 'https://cloud.test', supabasePublishableKey: publicKey },
      globals: { fetch, AbortController }
    };
    const { ctx, t, storage } = await fixture({}, options), save = ctx.HamsterSave;
    await t.startGame(1, true);
    assert.equal(save.snapshot().ranked, true);

    // Kill a real enemy with four shell attacks and collect its verified drop.
    const source = t.enemies[0]; source.state = 'patrol';
    for (let i = 0; i < 4; i++) {
      t.game.frames = i * 16;
      t.player.throwCd = 0; t.press('throw'); t.updatePlayer();
      const shot = t.shots.at(-1);
      shot.x = source.x - shot.vx; shot.y = source.y - shot.vy - shot.g;
      t.updateShots();
    }
    assert.equal(source.dead, true);
    for (const kind of ['coin', 'weapon']) {
      const drop = t.pickups.find(p => p.kind === kind && p.target === source.id);
      drop.phys = false; t.player.x = drop.x; t.player.y = drop.y;
      t.updatePickups();
    }
    assert.equal(t.player.weapon, 'grenade');
    assert.equal(t.player.ammo.grenade, 3);
    await save.flush();
    assert.equal(save.snapshot().pendingEvents, 0);
    assert.equal(save.snapshot().profile.sqk, 1);

    // Place Chang against the reported stone (column 70) and fire through the
    // unchanged player/shot/burn update path. For fuse expiry, move only the
    // projectile above the terrain on each subsequent update.
    const attackFrame = 64;
    for (const enemy of t.enemies) if (![1, 2].includes(enemy.id)) enemy.x = 3000;
    Object.assign(t.player, { x: impact === 'immediate' ? 1108 : 1060, y: 146, vx: 0, vy: 0, dir: 1, onGround: true, throwCd: 0 });
    t.game.frames = attackFrame; t.press('throw'); t.updatePlayer();
    let explosionFrame;
    for (let frame = attackFrame; frame < attackFrame + 100; frame++) {
      t.game.frames = frame;
      if (impact === 'fuse') Object.assign(t.shots.at(-1), { x: 500, y: 30, vx: 0, vy: 0, g: 0 });
      t.updateShots();
      if (t.burns.length) {
        explosionFrame = frame;
        // Keep two live, exposed enemies inside the area for all eight ticks.
        for (const target of [1, 2]) Object.assign(t.enemies[target], { x: t.burns[0].x + 8 + target * 14, y: t.burns[0].y + 10, state: 'patrol' });
        t.updateBurns();
        break;
      }
    }
    assert.notEqual(explosionFrame, undefined);
    if (impact === 'immediate') assert.equal(explosionFrame, attackFrame);
    else assert(explosionFrame > attackFrame);
    const fire = t.burns[0], grenadeId = fire.id;
    for (let frame = explosionFrame + 1; frame <= explosionFrame + 540; frame++) {
      t.game.frames = frame;
      t.updateBurns();
    }
    const generated = JSON.parse(storage.get('hamster-friendship-v2-outbox'))[0].events;
    const hits = generated.filter(e => e.kind === 'hit' && e.attack === grenadeId);
    console.log(impact, JSON.stringify({ attackFrame, explosionFrame, firstHit: hits[0]?.frame, elapsed: hits[0]?.frame - explosionFrame }));

    await check(impact + ': engine-generated grenade events are accepted by the actual SQL RPC', async () => {
      await save.flush();
      assert.equal(save.snapshot().pendingEvents, 0, save.snapshot().status);
      assert.deepEqual(errors, []);
      const { rows } = await admin('select hp from hf_private.runs where id=$1', [runId]);
      for (const target of [1, 2]) assert.equal(rows[0].hp[target], t.enemies[target].hp);
    });
    await check(impact + ': first tick is 60 frames after explosion, then seven more at 60-frame intervals', () => {
      for (const target of [1, 2]) {
        assert.deepEqual(hits.filter(e => e.target === target).map(e => e.frame), Array.from({ length: 8 }, (_, i) => explosionFrame + 60 * (i + 1)));
        assert.equal(t.enemies[target].hp, 60);
      }
      assert.equal(t.burns.length, 0);
      assert.equal(batches.flat().filter(e => e.attack === grenadeId && e.kind === 'hit').length, 16);
    });
    await check(impact + ': durable retry/reload does not strand SQK, scores or the next map', async () => {
      // Finish one weakened enemy, collect its coin, and disconnect before ack.
      Object.assign(t.player, { x: 96, y: 146, vx: 0, vy: 0, weapon: 'shell', throwCd: 0 });
      for (let i = 0; i < 3; i++) {
        t.game.frames += 16; t.player.throwCd = 0; t.press('throw'); t.updatePlayer();
        const shot = t.shots.at(-1), enemy = t.enemies[1];
        shot.x = enemy.x - shot.vx; shot.y = enemy.y - shot.vy - shot.g;
        t.updateShots();
      }
      assert(t.enemies[1].dead);
      const coin = t.pickups.find(p => p.kind === 'coin' && p.target === 1);
      coin.phys = false; t.player.x = coin.x; t.player.y = coin.y; t.updatePickups();
      offline = true; await save.flush();
      assert.equal(save.snapshot().pendingCoins, 1);
      const restored = await fixture(Object.fromEntries(storage), options);
      assert.equal(restored.ctx.HamsterSave.snapshot().pendingCoins, 1);
      offline = false; await restored.ctx.HamsterSave.retry(); await restored.ctx.HamsterSave.retry();
      const snapshot = restored.ctx.HamsterSave.snapshot();
      assert.equal(snapshot.pendingEvents, 0);
      assert.equal(snapshot.profile.sqk, 2);
      assert.equal(snapshot.profile.total_score, 200);
      // Only this purchase fixture adds credit; grenade validation above used
      // exclusively coins earned through the real engine.
      await admin('update hf_private.profiles set sqk=20 where user_id=$1', [user]);
      await restored.ctx.HamsterSave.purchase('shirt-blue');
      assert.equal(restored.ctx.HamsterSave.snapshot().profile.sqk, 0);
      assert(restored.ctx.HamsterSave.snapshot().profile.purchases.includes('shirt-blue'));
      await restored.t.startGame(1, true);
      assert.equal(restored.t.game.state, 'playing');
      assert.equal(restored.ctx.HamsterSave.snapshot().ranked, true);
      assert.deepEqual(errors, []);
    });
  }
  console.log(`${checks} frontend-to-PostgreSQL regression checks passed.`);
} finally { await db.close(); }
