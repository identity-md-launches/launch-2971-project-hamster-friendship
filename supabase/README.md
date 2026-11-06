# Original Supabase project · schema 7, rules 6, migration 11

The existing project remains `https://nhtlwcukeyhvkrjveots.supabase.co`, with the same public configuration in `src/config.js`. Current public probes reach Auth, service status, Top 100 and replay health. They report migration **010**, without the new personal-best mode. No production SQL, administration login, real wallet signature or function deployment was available to this worker.

The required release procedure and full score/compatibility explanation are in [PERSONAL_BEST.md](PERSONAL_BEST.md). Apply exactly the inspected missing suffix; 010 needs only `011_personal_best.sql` plus the compatible updated replay function. Historical migrations 001–010 remain unchanged. The source/export require both the personal-best SQL and engine-2 health before ranked login.

## Personal-best persistence

`hf_private.settle_lifetime()` now compares the current paid run score with the stored best using `greatest`, rather than adding different runs into `profiles.total_score`. The field, canonical wallet association and API readers remain. Version-6 checkpoints still save during play; terminal transitions and deferred settlement are idempotent. Produce growth remains cumulative and SQK keeps its existing independent settlement.

011 reconstructs historical single-run maxima from server-owned runs/ledgers, archives each previous aggregate in the private RLS-protected `personal_best_baselines` table and refuses incomplete positive history with a complete transaction rollback. It deletes no player, wallet, purchase, run, ledger, legacy ticket or daily record. The retention trigger remains enabled after correction. See the detailed backfill and preservation procedure in PERSONAL_BEST.md.

Both public Top 100 readers use the same profile best, include only linked positive-score wallets, use deterministic ties, cap rows at 100 and omit addresses. The JSON reader advertises `scoreMode: personal-best`. No browser total or local leaderboard is an authority.

## Verified identity, saving and access

Identity still comes from Supabase-verified Web3 identity claims, never editable metadata or an address supplied with a save. The unique canonical lowercase wallet association retains the original profile across an Auth UUID/casing change. Authenticated legacy server recovery remains ticket-based and single-use. Existing browser-only data is left untouched; the obsolete Profile warning/download/retry UI has been removed. Legitimate run-conflict recovery and export are retained.

Queues remain partitioned by wallet/run with acknowledged sequence merging. Validated unpaid rewards stay in `runs.pending_score` and are recoverable on another device via `hf_settle_rewards()`. The shared 150-point budget, +1-per-second refill, four-open-run limit, timing, ownership, ammunition and reward-source guards remain. One retry per flush avoids spinning; automatic online/periodic retries continue, with manual Sync progress in wallet details.

The server-only replay commit replays the existing game before creating an entitlement and commits its checkpoint/rewards together. Engine 1 is retained for old runs/cached clients; the new authenticated start overload explicitly selects engine 2. [REPLAY.md](REPLAY.md) explains the runtime boundary. Bots may still supply legal moves; arbitrary claims, client totals and copied checkpoints remain insufficient.

All private tables use deny-by-default RLS, with no browser schema/table/helper access. Protected public RPCs derive the wallet identity; only the server role may commit replay. Keep credentials in the function runtime and private schema outside Data API exposure.

## Administration and checks

Use [SQL_EDITOR.md](SQL_EDITOR.md) to inspect installed objects, select the exact migration suffix and verify grants/policies. Run `verify_production.sql`, `verify_personal_best.sql`, `verify_major.sql` and `test_access.sql` after upgrading. Preserve private backups and pre/post fingerprints; the score correction intentionally changes the aggregate score fingerprint, whose prior values remain in the audit.

The root [README](../README.md) lists reproducible local checks. [Current evidence](../artifacts/validation.md) separates disposable PostgreSQL and browser fixtures from live public probes. Physical-device testing, authenticated production writes, real signatures, production RLS/catalog inspection and database administration were not performed. Historical documents and results do not override the current report.
