# Existing Supabase project: lifetime persistence

**Production status, 2026-11-05:** original project unidentified; frontend public settings are empty in the checkout and live `config.js`. No production database connection, migration, Auth configuration change or data inspection occurred. The new migration and RPCs were exercised against real PostgreSQL in PGlite with explicit Auth fixtures. This is not a hosted Supabase/signature-verification result.

## Apply safely in the original project

Keep migrations 001–003 unchanged. If they are already installed, apply **only `004_lifetime_persistence.sql`**, once. For a genuinely empty test database, apply 001, 002, 003 and 004 in order. Each migration is transactional. Do not replace the existing project or rerun old migrations over populated tables.

Before applying 004, take a backup and run `preservation_snapshot.sql` under owner access during a maintenance window; retain that private output. Repeat after 004, before gameplay resumes. All profile fingerprints, SQK/lifetime sums, inventory and wallet-link fingerprints, profile counts and historical daily totals should match exactly. The new `runs.lifetime_credited` baseline and initially empty ledger are intentional schema additions. Run `verify_lifetime.sql` afterwards. These two SQL files were executed in the local populated-database suite.

Enable Ethereum Web3 Auth in the same project's Auth settings. Verify the deployed site's domain/URI, expiry and signature using the current [Supabase Web3 guide](https://supabase.com/docs/guides/auth/auth-web3). The frontend uses `POST /auth/v1/token?grant_type=web3` with `chain`, `message`, `signature`. The login message binds the actual origin/host and URI, chain 1, random nonce, issued time and five-minute expiration. It authorizes login only. The owner must confirm real Auth behavior; tests inject Auth identities and do not prove signature validation.

Expose `public` through the Data API, never `hf_private`. Put only the original project's public URL and publishable/anon key into `src/config.js`; rebuild. Never ship a service-role/private key. The client checks `hf_service_status()` before asking for a signature, so a missing migration fails visibly without an unnecessary signing request.

## Permanent totals and history

Migration 004 preserves every existing profile, Auth identity, association, SQK balance, item purchase, cosmetic, badge and historical score row. It does not guess missing historical scores, sum daily bests as though they were complete sessions, or reset totals. Existing `profiles.total_score` is the historical baseline.

003 credited points immediately, including active maps. 004 initializes each existing run's `lifetime_credited` to its saved `score`, preventing those historical points from being credited again. New point events update only that run's score. On `active → dead/complete/abandoned`, a trigger settles `max(0, score - lifetime_credited)` into the profile and a unique ledger entry in the same transaction. Restarting or starting on another device uses the existing abandonment path. A retried acknowledgement cannot award twice. Future ended sessions accumulate rather than replacing a daily/map best.

`hf_retain_lifetime` refuses decreasing a profile's lifetime score or deleting a profile, including cascades from ordinary Auth-user deletion. Keep backups: a privileged administrator can explicitly disable database protections. There is no automated expiry/cleanup/reset for lifetime totals. No cron reset was present in the supplied migrations. The original owner must check production Supabase cron and any external scheduler before release; this migration does not guess or disable unrelated jobs.

Old `daily_scores`, settings and calendar columns stay private as historical archives. Current progress never writes them, and the daily ranking RPC is dropped. Immutable historical migration files and old regression fixtures still mention daily behavior; the current runtime has no daily bucket, countdown, timezone filter or reset.

## Wallet ownership and preserved legacy profiles

Trusted identity comes from `auth.identities`, written by Supabase after Web3 signature verification. Client-editable metadata, a passed address and browser score totals are not proof of ownership. Wallets are canonical lowercase addresses with a unique profile link.

004 resolves the unique wallet link by verified address, allowing a new Auth UUID for that same address to reopen the original profile without inserting a duplicate or changing ownership. This addresses the documented [Supabase address-casing identity issue](https://github.com/supabase/auth/issues/2264). A different wallet cannot submit another player's run or spend their SQK.

The existing legacy attachment remains: the original anonymous Auth session requests a random, one-use 30-minute `hf_prepare_legacy()` ticket; explicit verified Web3 login consumes it through `hf_wallet_profile(p_legacy)`. The original profile and inventory remain in place. A wallet that already has a profile always retains that profile; there is no automatic merge. A legacy profile already linked elsewhere cannot be claimed again. If the original anonymous session is lost, ownership needs independent owner-assisted recovery; no address association is fabricated.

## Current RPCs

| Function | Behavior |
| --- | --- |
| `hf_service_status()` | Public schema contract: `{schemaVersion:4,leaderboard:"lifetime"}`. No account data. |
| `hf_prepare_legacy()` | Original authenticated browser session requests a one-use attachment ticket. |
| `hf_wallet_profile(p_legacy?)` | Opens the canonical verified wallet profile; optionally attaches an unclaimed old profile on first use. |
| `hf_profile(p_name?)` | Loads/renames the current verified profile with saved balance, lifetime score, map, inventory and cosmetics. |
| `hf_start_run_v4(p_map)` | Existing unlocked-map check, exclusive drops, monster HP and one-active-run behavior. Ending an old active run now settles uncredited lifetime points. |
| `hf_progress(p_run,p_events)` | Existing validated combat/collectible events, sequence acknowledgements, ownership checks, unique drops and server-derived SQK. New points stay on the run until it ends. |
| `hf_purchase(p_item)` | Existing profile lock, server prices, atomic deduction and unique purchase. Retry returns existing ownership without a second charge. |
| `hf_equip('costume',p_item?)` | Existing owned-costume check and equip/unequip. Shared by Marketplace and Change it. |
| `hf_lifetime_top100()` | Public `{updatedAt,rows}`; positive lifetime totals from verified linked profiles only. Sort total descending, then stable profile UUID; maximum 100. No addresses/private IDs in returned rows. |
| `hf_top100()` | Compatibility table projection of the same lifetime ranking. |

All private tables retain RLS and no direct browser-role access. Security-definer entry points have an empty search path. The lifetime ledger is private. Purchases and event processing continue to lock the profile before a run/attack, preserving the original transaction order.

## Client durability and limitations

The server is authoritative. Browser storage contains address-partitioned Auth sessions and unsent ordered events, never authoritative balances/rankings. A malformed response or acknowledgement retains the queue. A lost reply after SQL commit replays idempotently. An older account's late response cannot replace the selected wallet's profile. Guest state is memory-only and never imported. Refresh tokens restore sessions without silently requesting another signature; Profile retry reloads acknowledged server changes.

One active map per wallet is still the supported game model. Another device starting a map abandons the older run, settling points already acknowledged by the server. Late unsent events for an ended run fail explicitly and remain in the original browser queue, rather than overwriting another session. This delivery does not add simultaneous-map merging or restoration of a suspended canvas after reload. The inherited event validator checks combat/timing/entitlements, not a full authoritative movement simulation; it cannot certify that a modified client really played every action.

## Local validation and release gate

`node supabase/tests/lifetime.mjs` executes the migration over populated historical data, checks preservation, permanent session scoring, retries, ownership, permissions, purchases, map completion, no calendar dependence and the deterministic Top 100 cap. `node supabase/tests/squeek-client.mjs` runs the actual client against these PostgreSQL functions with lost replies, malformed acknowledgements, two devices, refresh and wallet-switch fixtures. `scripts/validate-market.mjs` tests the real production-export UI against the SQL functions, including automatic leaderboard refresh with a short simulated clock advance.

See root `VALIDATION.md` for counts and exact commands. Before release, run the same wallet/save/purchase/restoration flows against the original hosted Supabase project on real devices and compare preserved data. Lifetime Top 100 is operational in the local SQL/UI fixture; it is **not confirmed operational on production**.
