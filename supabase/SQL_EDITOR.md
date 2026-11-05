# Finish the existing production database

The project is **nhtlwcukeyhvkrjveots**, URL `https://nhtlwcukeyhvkrjveots.supabase.co`. The supplied publishable key works for Auth connectivity but cannot administer SQL. No production migration was executed in this assignment. No replacement project was created.

Open this project's [SQL Editor](https://supabase.com/dashboard/project/nhtlwcukeyhvkrjveots/sql/new) using an authorized administrator account. The exact SQL files below are included in this repository. Do not paste a database password, service-role key, personal access token or wallet secret into frontend configuration.

## Inspect before selecting migrations

Run [inspect_production.sql](inspect_production.sql). It enumerates the expected tables even if absent, all existing public/private columns, indexes, constraints, RLS flags/policies, effective browser-role grants, helper/RPC grants, triggers, installed service version and available Supabase migration history. Notices include exact row counts and fingerprints without returning player records. Keep results privately with a backup.

The REST responses alone do **not** prove an empty database. If public player/inventory tables or a different legacy schema already exist, inspect and reconcile those records before creating anything. The preparation helper rejects common conflicting public table names on a proposed empty-schema installation. Never rename, reset, drop or copy existing player tables to bypass a conflict.

| Verified installed schema | Evidence | Missing SQL files, in execution order |
| --- | --- | --- |
| 0 | Administrator confirms no existing game schema or player records | 001, 002, 003, 004, 005, 006, 007, 008, 009 |
| 1 | Base profiles/runs/purchases; no badges/wallet links | 002, 003, 004, 005, 006, 007, 008, 009 |
| 2 | Badges/dice receipts; no wallet links | 003, 004, 005, 006, 007, 008, 009 |
| 3 | Wallet links; no lifetime ledger/credited column | 004, 005, 006, 007, 008, 009 |
| 4 | Service version 4, lifetime ledger and credited baseline | 005, 006, 007, 008, 009 |
| 5 | Service version 5; nested verified Web3 claims and run-state RPC | 006, 007, 008, 009 |
| 6 | Service version 6, rules 6, produce progression | 007, 008, 009 |
| 7 | Service version 7, rules 6, no `migration` key; legacy-only active-run index | 008, 009 |
| 8 | Service `{"schemaVersion":7,"rulesVersion":6,"leaderboard":"lifetime","migration":8}` | 009 |
| 9 | Same schema/rules; `"migration":9`, `runs.pending_score` and `hf_settle_rewards()` | None; verify existing configuration |

Historical migrations 001–008 remain unchanged in [migrations/](migrations/). In particular, [004_lifetime_persistence.sql](migrations/004_lifetime_persistence.sql) adds the credited baseline/ledger, lifetime-retention and settlement triggers, canonical wallet recovery and Top 100. 005 reads verified nested Web3 claims; 006 checkpoints paid score during play; 007 permits separate device runs. 008 adds collectible reachability/path checks, the four-open-run limit and the shared wallet budget (150 points held, +1 per real second).

**009 is required with the current export.** [009_deferred_rewards.sql](migrations/009_deferred_rewards.sql) keeps all 008 security checks and stores validated unpaid rewards in `hf_private.runs.pending_score`. The existing budget pays these points later, including after death, completion or abandonment. Only paid points reach score/produce growth/Top 100. `ack` acknowledges validation, while `pendingPoints` identifies an unpaid run; the client retains its batch until zero. `hf_settle_rewards()` lets the verified wallet recover server-held rewards on any device with no original queue. `profile.pending_rewards` keeps that device pending while credit remains due. No client amount or wallet address is accepted by settlement.

009 also reconstructs outstanding rewards previously discarded by 008: sum distinct consumed forest values plus server-assigned claimed fruit drops, minus the run’s already-paid score (floored at zero), for rules 4/6. It changes no existing paid score, SQK, inventory or identity. Keep a backup and inspect those entitlements before enabling play. Never recover from unverified browser totals. No run is reopened; new events on terminal runs remain rejected.

## Prepare the exact missing SQL

After inspection, run the dependency-free helper with the **verified** version. For example, only if inspection confirms schema 6:

```sh
node scripts/prepare-supabase.mjs --after 6
```

It writes `artifacts/supabase-apply-missing.sql`. Paste that entire generated SQL into the same project's SQL Editor. It contains only the missing migration bodies with source SHA-256 hashes, a version guard, a transaction, lock/statement timeouts and a schema-cache notification. It has no database connection and does not run SQL itself. It does not change installed source files or fabricate migration-history entries. An incorrect/partially installed version, conflict or migration error aborts the transaction; inspect the error rather than choosing a lower version to force execution. There is deliberately no preselected production bundle because the installed production version has not been inspected.

For an existing schema 003 or later, also run [preservation_snapshot.sql](preservation_snapshot.sql) before and after in a maintenance window and compare core profile, SQK, lifetime, purchase and wallet-link fingerprints/counts. Preserve run HP/loot, pending queues and historical daily-score records. The general inspection's full-row fingerprints can legitimately change when a migration adds a column or records the 004 credited baseline; use the core snapshot and inspect those documented changes rather than asserting every full-row hash must remain identical.

001–007 do not drop a player table or reset saved scores/balances. Historical 003 deactivates the old catalogue and adds the current items while retaining purchases; 004 freezes the previously credited run baseline; 006 adds produce growth with a zero historical baseline; 007 replaces an index and start RPCs; 008 adds two budget columns to profiles (full budget for every existing profile), two path columns to runs, and replaces the v6 start/progress RPCs. 009 adds the nonnegative `runs.pending_score` column and a partial pending-rewards index, reconstructs the outstanding entitlements described above, and replaces only the affected RPC/checkpoint readers. Existing data remains in its canonical tables. Do not replay installed migrations or automatically import unverified browser totals.

## Verify database permissions and Auth

Run [verify_production.sql](verify_production.sql) and [verify_major.sql](verify_major.sql). Every boolean must be true. Run [test_access.sql](test_access.sql): both browser roles must report a denied direct score update. Its probes affect zero rows and roll back. They establish SQL permission denial; they do not establish an actual wallet session or another wallet's ownership rules.

The intended model is **deny-by-default RLS on every `hf_private` table**, no browser schema/table/helper privileges, and narrow `SECURITY DEFINER` public RPCs with fixed empty search paths. There are intentionally no permissive table policies. Do not add a general "users update own profile" policy: it could allow direct score/balance edits. Keep `hf_private` out of Data API exposed schemas. The public Top 100 is an RPC projecting only names/scores/maps.

Enable Ethereum Web3 Wallet authentication in this project's Authentication Providers. Register the actual hosted HTTPS domain and URI in Auth redirect URLs. The client derives these from its real browser location; do not substitute an unrelated origin. A wallet connection is separate from the explicit signed login. See [Supabase Web3 Auth](https://supabase.com/docs/guides/auth/auth-web3), [API key handling](https://supabase.com/docs/guides/getting-started/api-keys), and [RLS](https://supabase.com/docs/guides/database/postgres/row-level-security).

## Required real-wallet acceptance run

These steps remain **unperformed in production**. Use real wallets you control; do not insert fake Auth identities or seed a production leaderboard.

1. Run `node scripts/verify-production.mjs` again. Auth must return 200; service must advertise schema 7/rules 6/migration 9; Top 100 must return actual records or an honestly empty list. A successful probe alone is not completion.
2. Open the exported website from the allowed HTTPS origin. Connect on Mainnet and explicitly sign in. In Profile save a player name; compare the resulting existing `hf_private.profiles`/`wallet_profiles` records in SQL Editor. Repeated login must retain one canonical wallet profile.
3. Play and collect produce. Observe a server-acknowledged Lifetime Score increase; compare `profiles.total_score`, the owned run's `score/lifetime_credited`, and its `lifetime_entries` row. No client-supplied total should be accepted. Check SQK from legitimate coin drops; purchase/equip only when an earned balance covers the current price.
4. Refresh, reconnect the same wallet, then log in from a second device. Compare Lifetime Score, SQK, purchases, cosmetics, produce progress and deepest map. Only uploaded, validated progress can appear on the other device; unpaid validated rewards must still show pending and remain recoverable there. Keep the original browser's pending event queue until it reconnects; never clear it to fix a save.
5. Open Lifetime Top 100, compare names/scores/maps against the canonical SQL records, and confirm descending order, 100-row cap and refresh after an acknowledged score change. The board includes only linked wallets with positive scores, using deterministic UUID ordering on ties.
6. With no session, verify protected RPC access fails. With a second real wallet, verify attempts against the first wallet's actual run fail without changing its score. Repeat `test_access.sql` and inspect RLS/grants. Do not mistake a missing-function 404 or unexposed-schema 406 for an RLS test pass.
7. Also test budget exhaustion with valid offline runs: compare paid `score` plus `pending_score` to all validated earned points; reconnect/refresh both original and fresh devices. Before full payment the UI must remain pending and original batches must stay durable. As the budget refills, compare paid profile/ledger totals and pending amounts, then replay to verify no double credit. Use an isolated staging environment for synthetic fixtures, never insert fake production identities.
8. Record actual test times, production record comparisons, migration outcomes and failures. Mark integration complete only after all seven requested production checks pass.

Exact player position and per-run ammunition are session state and restart with a map. Permanent score, SQK, inventory/cosmetics, produce growth and unlocks restore from the database. The backend validates ownership, sequence, timing, damage, ammunition, one-time sources, forest-collectible reachability and a per-wallet real-time reward budget; browser physics/collisions are not a fully authoritative anti-bot server (a scripted client that paces plausible events can still earn up to the budget rate).
