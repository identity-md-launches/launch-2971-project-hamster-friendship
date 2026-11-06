# Authoritative gameplay replay (migrations 010–011)

Migration 009 accepted impossible combat claims and zero-frame basket rewards. Migration 010 closes that path. It does **not** change or delete existing balances, inventory, lifetime entries, identities or already validated pending rewards. Historical migrations 001–009 remain unchanged.

## What is authoritative

The browser records ordered, bounded control inputs alongside its existing durable events. It sends no player/enemy positions or score totals. `functions/hf-replay` fetches the run's map, monster specifications, loot, purchases, sequence and checkpoint from SQL using the player's authenticated JWT. `hf_private.player_id()` still requires a verified Ethereum identity and resolves its canonical wallet profile.

The function replays those inputs through the **same `src/game.js` and `src/rules.js`** used by the browser. Movement, tile collisions, enemy motion, projectiles, sword/stomp/burn hits, drops, proximity collection, explicit weapon collection, death and boss completion must actually occur. A claimed event must match the resulting event, including its frame and target. Unconsumed events carry into the next batch; a caller cannot skip a death or a hit and continue movement.

Only the Edge Function's server credential can call `hf_replay_commit`. Its compare-and-swap sequence and profile/run locks persist the replay checkpoint and apply rewards in one transaction. A rejected batch changes neither. Lost replies, duplicate batches, deferred settlement and independent device runs retain the existing acknowledgement and wallet-budget semantics. The public `hf_progress` RPC can settle already acknowledged batches but cannot create new reward claims. Neither a copied checkpoint nor a direct RPC call grants reward authority.

Inputs are run-length encoded and checkpointed at least once per 60 active frames; every reward event synchronously persists the controls that caused it. At most one second of *uneventful movement* can be lost on an abrupt browser termination. Every recorded reward retains its required input history. Queues stay partitioned by wallet and run. The client limits batches to 55 KB / 1,200 frames; the server independently caps bodies at 64 KiB, events at 128 and replay work at 1,800 frames.

A player may quit at any point, which closes the run without creating a reward. Completion still requires an actually defeated boss. Automated clients could play legal moves; replay prevents invented gameplay outcomes, not bots or automated input.

## Production application (not performed in this revision)

Use **only project `nhtlwcukeyhvkrjveots`**, the existing project. Its publishable key cannot administer SQL or deploy functions. An authorized administrator must perform these steps; no administrator credential belongs in the repository or static export.

1. Back up the database, run `inspect_production.sql`, and retain the installed version and preservation fingerprints. Do not infer an empty schema from REST 404 errors.
2. Generate only the missing suffix: `node scripts/prepare-supabase.mjs --after <inspected-version>`. The accepted values are 0–10. An installed 010 database needs only `011_personal_best.sql`; earlier versions need their inspected missing suffix. Follow [PERSONAL_BEST.md](PERSONAL_BEST.md) for the coordinated engine/score rollout. The generated transaction checks the inspected version and rejects replay or partial schema mismatches.
3. Run `node scripts/prepare-replay.mjs --check`. The committed `functions/_shared/engine.js` is an exact generated package of the browser engine, with a headless entry, serialization bridge and suppressed cross-map network transition. It is required backend runtime source, not a dependency archive. `node scripts/prepare-replay.mjs` regenerates it after engine changes.
4. Deploy the function using the Supabase CLI in an administrator's authenticated environment:

   ```sh
   supabase functions deploy hf-replay --project-ref nhtlwcukeyhvkrjveots --no-verify-jwt
   ```

   This command is documentation, **not executed by this worker**. The platform supplies `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` to the function. The public health/CORS paths need the gateway check disabled; POST forwards the supplied JWT to PostgREST, which authenticates it before the SQL ownership check. No decoded-but-unverified JWT or request-supplied user id is trusted. See the official [function configuration](https://supabase.com/docs/guides/functions/function-configuration) and [authentication guidance](https://supabase.com/docs/guides/functions/auth).
5. Apply only missing SQL, verify `hf_service_status()` reports migration 11, `scoreMode: personal-best`, `engineVersion: 2` and `validation: replay-1`, and run `verify_production.sql`, `verify_major.sql` and `test_access.sql`. Test `GET /functions/v1/hf-replay` returns protocol/hash without any credential. Keep `hf_private` unexposed. `hf_replay_commit` must be denied to both `anon` and `authenticated` and executable by `service_role` only.
6. Enable Ethereum Web3 Auth, allow the actual hosted HTTPS login URI, and perform the real-wallet acceptance run in `SQL_EDITOR.md`: score/SQK/inventory writes, reload, offline/reconnect, another device with the same wallet, and actual Global Top 100 records. Public probes and local fixtures do not establish production success.

Coordinate SQL/function/static-export rollout: the revised browser requires migration 011 and compatible engine-2 replay health before ranked login. Guest play stays available. Do not enable an older direct-event reward function as a compatibility fallback.

## Existing saves and upgrades

Acknowledged pending rewards from 009 remain recoverable through `hf_settle_rewards`, including on another device. Previously credited data is retained; 011 performs only the audited cumulative-to-best correction described in PERSONAL_BEST.md. Old *unsent* events contain no control history; there is no safe way to distinguish legitimate claims from the reproduced forgeries. They remain in the durable queue and the existing downloadable recovery record for administrator review. Profile → Restart from cloud profile archives them before allowing a new verified run; it never silently credits or deletes them.

Each accepted replay checkpoint pins the engine hash. Keep that exact server package for active runs when deploying a later gameplay version, or add explicit version dispatch before that deployment. A different hash rejects further claims and preserves the queue. Migration 011 supplies explicit server-owned engine dispatch. Existing runs and the one-argument start RPC retain the frozen engine 1; the current two-argument start RPC selects engine 2. The Edge function verifies each version’s own hash and commits that hash. Keep both generated engine packages. See PERSONAL_BEST.md.

## Local verification

Install the test tools as documented in the root README, then run:

```sh
node scripts/prepare-replay.mjs --check
node supabase/tests/personal-best.mjs
node supabase/tests/context-replay.mjs
node supabase/tests/replay-http.mjs
node scripts/test-weapon-labels.mjs
```

These use disposable PGlite PostgreSQL, explicit Auth/HTTP fixtures and the real shipped game/save code. The adversarial reproduction uses no engine, clock, loot or score edits. Legitimate-play fixtures explicitly accelerate elapsed time and fix selected encounters so combat/pickups are repeatable. They do not prove production deployment, real signatures, physical-phone behavior or multiprocess PostgreSQL contention.
