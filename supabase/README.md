# Original Supabase project · rules version 6

The original project's URL/public key were not supplied: both public settings are empty in the checkout. No production database or hosted Auth connection was established. Local tests use real PostgreSQL (PGlite) with explicitly constructed Supabase Auth identity and HTTP fixtures. The static site contains no replacement backend, seeded rankings, test users or private credentials.

## Apply without resetting data

Take a private backup, inspect installed migrations, and run `preservation_snapshot.sql` before/after an upgrade during a maintenance window. Compare every existing fingerprint/count and SQK/lifetime sum. Keep installed migrations unchanged. On an existing **005** database apply **only `migrations/006_four_worlds.sql`**, once. On an earlier schema, apply only missing migrations in order first. On an empty disposable test database, 001–006 establish the complete schema. Do not run a database reset or replay the old migrations over populated tables.

006 is transactional. It adds `profiles.produce_points` with a zero baseline, updates the profile JSON reader, replaces the lifetime-settlement trigger, adds `hf_start_run_v6(integer)`, extends `hf_progress` to accept versions 4/6 and advertises schema/rules 6. It does not update historical profiles, balances, purchases, cosmetics, badges, wallet links, old run HP/loot, daily-score archives or existing lifetime totals. New growth starts from newly verified produce points, without inventing historical produce counts. The preservation snapshot and the full old profile fields matched over populated test data.

Run `verify_major.sql` after migration; every boolean should be true. This read-only script was executed in the local migration suite. Keep `hf_private` unexposed in the Supabase Data API; only `public` is needed. All private tables retain RLS and deny browser access, including ledger writes. Trigger/helper functions are not executable by anon/authenticated users.

## Checkpointing and compatibility

For **new version-6 runs**, each validated `runs.score` delta is atomically added to the original `profiles.total_score` and `produce_points`. The same trigger accumulates one lifetime ledger row per run and advances `lifetime_credited`. Profile → run → attack lock ordering serializes mutations. A repeated sequence is acknowledged without applying it again. Ending/restarting/abandoning a run credits no already-checkpointed point twice; closing a browser cannot strand acknowledged points outside the public lifetime ranking.

**Version-4 runs keep their previous session-end settlement**, existing HP/loot, 60-second boss threshold and all-enemies completion rule. This lets previously saved pending events flush after deployment. Their historical `lifetime_credited` baseline is retained. New runs use four map IDs, 60/90/120/150-second boss thresholds, environment-specific monster families, the existing HP progression and unchanged drop/ammo/damage economics. Version-6 completion requires the correct boss after its timer; remaining regular enemies do not prevent automatic travel.

`hf_lifetime_top100()` continues to read the canonical permanent profile totals, sorted descending with deterministic UUID tie ordering, capped at 100, excluding unlinked/unverified profiles and omitting wallet addresses. There is no daily reset, local-storage board, fabricated player or ranking cache that needs rebuilding. Existing daily data remains private historical data.

## Identity and legacy records

Ethereum identity is read from Supabase-authenticated `auth.identities`, provider `web3`, nested `custom_claims.chain/address` (migration 005). A passed address and editable `user_metadata` do not authenticate. The canonical lowercase wallet's unique association points to the existing profile even if Supabase presents another Auth UUID for that same verified address. Existing wallet mappings, balances and inventory always take priority over a legacy ticket. The advisory wallet lock and unique constraint prevent duplicate links; profile/run locks protect concurrent updates. Actual independent PostgreSQL connection contention is not exercised by the single-connection local harness.

An old **server** profile can be linked only by its authenticated, expiring, single-use `hf_prepare_legacy()` ticket. Existing anonymous cloud balances are preserved rather than recomputed from browser claims. Old **browser-only** `hamster-friendship-v2-guest` data remains intact and can be downloaded from Profile for owner review; it is not proof of a ranked score. No unverified local total overwrites an established wallet score.

The outbox migrates its previous wallet-array format into run keys without changing events. Acknowledgement merges keep newer events from being erased by a stale tab's response. Disconnected clients keep pending events; progress fetches use keepalive on exit. If another device ended the run, `hf_run_state()` reconciles the exact last acknowledgement. Rejected events remain downloadable and a cloud-profile recovery/restart is explicit. Cross-device reads contain server-acknowledged progress; the original browser must reconnect to upload unsent events. The exact scene position and per-map ammunition are session state and restart with the map; permanent SQK, owned items, cosmetics, produce growth, score and unlocks restore.

## Owner configuration and actual verification

Set the **original** project's URL/public publishable or anon key in `src/config.js`, rebuild and keep all secrets out of `dist/`. Enable Ethereum Web3 Auth and register the deployed HTTPS origin/URI under Auth redirect URLs. The client sends an EIP-4361-style personal-sign message with the actual host/URI, chain 1, random nonce, issued time and five-minute expiry, then calls `/auth/v1/token?grant_type=web3`. Supabase performs signature validation. See the [official Web3 Auth guide](https://supabase.com/docs/guides/auth/auth-web3). Before signing, the client verifies `hf_service_status()` matches schema/rules 6. It rejects secret-format/service-role keys locally.

Verify with a real wallet on the existing hosted project: login/rejection, refresh, second-device reconnect, preserved old records, score upload, interrupted upload recovery, purchase/equip, Top 100 changes and unauthorized access. No hosted verification, production migration, production preservation comparison or real signature was possible in this run. The supplied hosted CID's config could not be fetched through the web tool; previous documentation of a successful request is not repeated as current evidence.

The server validates event sequences, time, ownership, damage, ammunition and one-time sources/drops. Positions/collisions remain client simulated; this is not a fully authoritative physics/anti-bot server. Existing SQK is an internal game balance; no token/contract/transaction flow was added.

## Tests

Run the commands in the root README. `major.mjs` verifies a populated 005→006 upgrade, preserved records, old pending queues, canonical wallets, checkpoint replay, permissions and Top 100. `major-client.mjs` drives the actual persistence client through lost replies, reload, concurrent tab acknowledgements, offline queues, wallet changes, signing cancellation and backend/key rejection. `major-engine.mjs` connects actual engine events and all four map completions to these SQL functions. Browser suites exercise the production export, original connector, rendered rankings and marketplace against the same SQL fixtures. Test-only Auth/provider/transport adapters are never bundled as runtime fallbacks.
