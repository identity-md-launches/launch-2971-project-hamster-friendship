# Personal best and direct-touch rollout — migration 011

This is an upgrade of the original `nhtlwcukeyhvkrjveots` project. It does not create a replacement database. The worker's public-key probes reached the existing migration-010 status, leaderboard and replay endpoints. The public key cannot inspect private SQL catalogs, apply migrations or deploy functions. **No production migration or deployment was performed.** Current evidence is in [production.json](../artifacts/validation/production.json).

## Stored score and settlement

`profiles.total_score` keeps its existing name/API contract but now stores a personal best. In `hf_private.settle_lifetime()`:

```sql
total_score = greatest(total_score, new.score)
```

`new.score` is the paid score of one existing map-run UUID. The backend validates control replay, ownership, event order, timing, collisions, damage, ammunition and pickups before a run earns points. The existing shared wallet budget settles validated pending rewards into that run's score. No browser-supplied total is accepted.

Version-6 checkpoints can establish a new best while playing, preserving the existing autosave behavior. Terminal transitions and deferred payments use the same maximum, so a lower/tied run cannot reduce or accumulate into the best. A repeated acknowledgement cannot double-credit it. `produce_points` still adds each newly paid produce delta for growth, and SQK keeps its existing separate coin settlement. The ledger remains a per-run paid-point audit, not a value to sum for ranking.

Both `hf_lifetime_top100()` and compatibility `hf_top100()` read the canonical profile best, descending with UUID ties and a 100-row cap. They only include linked verified profiles with positive scores and expose no wallet addresses. The JSON reader adds `scoreMode: personal-best`; the browser checks this instead of presenting an older cumulative board as personal bests.

## Historical correction without deleting records

011 takes profile-then-run locks and works in one transaction. It calculates the maximum server-recorded per-run score. The migration uses the greatest of `runs.score` and that run's ledger points, **not their sum**, because older ledgers can contain only post-migration deltas. Rules-2/3 records predate `runs.score`; their original 100-point regular defeats, 500-point boss defeat and 1,000-point completion bonus are recoverable from authoritative HP/status.

Every existing profile receives a private `personal_best_baselines` audit row with its original cumulative total, reconstructed best, history sum/count and timestamp. RLS is enabled and browser access is denied. No profile, wallet link, run, purchase, SQK balance, produce balance, cosmetic, badge, legacy ticket, daily record or lifetime ledger row is deleted. `runs.score`, pending rewards and existing replay checkpoints are unchanged.

If an old positive total exceeds the available run-level history, the migration raises **Incomplete run history** and rolls back everything. A cumulative total alone cannot establish a best. Restore trusted server run history from the owner's backup and inspect it; do not invent a replacement score, set it to zero or import browser totals. The retention trigger is disabled only inside the locked, audited correction and is re-enabled before commit. Its existing no-decrease/no-delete behavior remains after migration.

The profile score fingerprint is intentionally different after a successful cumulative-to-best correction. Compare it to the audit's reconstructed best; compare the old score fingerprint to the audit's original totals. All other core fields/links, run state and inventories should match their pre-upgrade snapshots during a maintenance window.

## Replay compatibility

The exact prior generated engine is retained as `functions/_shared/engine-v1.js`. Current source generates engine 2 in `engine.js`. `replay.js` selects the package using the **server-owned** `runs.replay_engine` exposed by the authenticated context RPC, and verifies that version's saved engine hash. A request cannot select its checkpoint, map, position, identity or reward amount.

Existing runs default to engine 1. The old one-argument `hf_start_run_v6(p_map)` also retains engine 1 for already-open older browser versions. The new browser calls the authenticated two-argument overload with `p_engine: 2`, which creates an engine-2 run. Both keep protocol `replay-1` and the existing service-role-only commit, sequence compare-and-swap and wallet budget. No old hash or queue is reset to force compatibility.

This extra engine package is required backend runtime source. Keep it until all engine-1 runs/queues have a safe, owner-reviewed retirement policy. It is not included in the static site.

## Coordinated release, by an authorized administrator

1. Back up this same project. Run `inspect_production.sql` and `preservation_snapshot.sql` privately; confirm installed version and inspect run-history coverage. The worker observed the public service reporting 010, but did not inspect production catalogs or history.
2. Run `node scripts/prepare-replay.mjs --check`. Deploy the updated `hf-replay` function **with both engines** using the existing administrator workflow in [REPLAY.md](REPLAY.md). Its health response must report `engineVersion: 2` and `supportedEngineVersions: [1,2]`. Deploying this compatible function first continues to serve migration-010 runs with engine 1.
3. If SQL inspection confirms 010, prepare exactly its missing suffix:

   ```sh
   node scripts/prepare-supabase.mjs --after 10 --out artifacts/supabase-apply-missing.sql
   ```

   This only creates reviewable SQL; it has no database connection. Execute the reviewed transaction in the original project's SQL Editor. Other installed versions require their explicitly inspected suffix; never replay an installed migration. On a history/lock/version error, roll back and investigate the stated condition.
4. Compare preservation snapshots and the personal-best audit. Run `verify_production.sql`, `verify_personal_best.sql`, `verify_major.sql` and `test_access.sql`. Every boolean must pass. Service status must report migration 11, `scoreMode: personal-best`, `engineVersion: 2` and `validation: replay-1`. Keep the private schema unexposed and all existing RLS/grants intact.
5. Verify real-wallet saves and recovery on staging/production with legitimate gameplay: higher, lower and tied runs; active checkpoint and delayed settlement; refresh; disconnect/reconnect; a second device; Top 100; rejection of another wallet's events. The worker's fixtures are not real-wallet production evidence. Do not add synthetic players to production.
6. Test the final export on **physical mobile touchscreens**, portrait and landscape, including immediate movement after dialogue, a held movement finger while pressing/releasing Attack/Jump/weapon controls, cancellations, interruptions, edges, no page scrolling and no stuck movement. Test Profile with old browser data present without importing/deleting it. The worker had no physical touchscreen; these checks remain required.
7. Only after successful verification, release the supplied `dist/` through the site's existing hosting workflow. No site publishing command was run here. Keep the unchanged original public configuration; no service-role key, password or wallet secret belongs in the export.

The new export checks the personal-best migration and compatible replay health before ranked login. It intentionally refuses to silently continue cumulative scoring against the old backend. Guest play stays usable. Automatic cloud retries and durable queues remain; manual Sync progress lives in wallet details. The removed browser-save warning is not relocated there or elsewhere.

## Local evidence and limits

`supabase/tests/personal-best.mjs` exercises the migration over populated PostgreSQL, max-score settlement, deferred payments, retained identities/inventory, denied writes/forgeries, legacy replay checkpoints, browser reload/reconnect and complete rollback on missing history. `scripts/validate-context-replay.mjs` exercises the export, real control replay/SQL, clean Profile/cloud name saves, personal-best board refresh and wallet connection UI with explicit local Auth/provider/transport fixtures. `scripts/validate-touch.mjs` covers six responsive sizes and native Chromium multi-touch input.

See [the current validation report](../artifacts/validation.md) for commands and actual outcomes. These tests do not establish hosted migration, real signatures, physical-phone feel, Safari support, independent PostgreSQL contention or screen-reader behavior.
