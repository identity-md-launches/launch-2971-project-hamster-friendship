# Production Supabase integration report

**Status: incomplete. Public configuration and Auth connectivity are verified; production player persistence is not.** This report distinguishes actual production responses from local implementation tests.

## Configuration and actual connection

The existing application is vanilla JavaScript/HTML/CSS with `scripts/build.mjs`, a static-copy builder. It does not use a framework environment-variable system. **Environment variables configured: none.** The existing public runtime settings in `src/config.js` and `dist/config.js` are:

| Setting | Configured value |
| --- | --- |
| `window.HAMSTER_CONFIG.supabaseUrl` | `https://nhtlwcukeyhvkrjveots.supabase.co` |
| `window.HAMSTER_CONFIG.supabasePublishableKey` | `sb_publishable_zHzP5SJbLxR_W7D-q2CEKg_8Hc48pJZ` |

Only supplied public values are shipped. No secret/service-role key, database password or private wallet key was obtained or added. No `.env`, dependency, root manifest/lockfile or existing build configuration was changed.

Actual live requests, with timestamps and raw JSON responses, are retained in [supabase-production.json](validation/supabase-production.json):

| Actual endpoint/test | Result | Meaning |
| --- | --- | --- |
| `GET /auth/v1/settings` | HTTP 200 | The supplied public key reaches this project's Auth service. |
| `POST /rest/v1/rpc/hf_service_status` | HTTP 404 / PGRST202 | Required service RPC unavailable through the schema cache. |
| `POST /rest/v1/rpc/hf_lifetime_top100` | HTTP 404 / PGRST202 | No actual leaderboard records could be retrieved. |
| `POST /rest/v1/rpc/hf_wallet_profile` | HTTP 404 / PGRST202 | No player could be opened/created through this RPC. |
| `POST /rest/v1/rpc/hf_progress` without a run/events/session | HTTP 404 / PGRST202 | No score was written; this is not an authorization test pass. |
| Private-schema read with `Accept-Profile: hf_private` | HTTP 406 / PGRST106 | Only public/graphql_public are exposed. It does not establish whether private tables exist. |
| Data API catalog/OpenAPI discovery | HTTP 401, secret key required | The supplied publishable key cannot inspect the private SQL catalogs. |

The supplied browser tool failed to initialize because of Chromium's socket-path limit. Local Playwright headless Chromium worked. Direct Chromium networking returned `ERR_EMPTY_RESPONSE` from the production host; Node HTTP reached it. A separate `--relay` browser run forwarded every request to the **real** Supabase host through Node and displayed the actual 404 failure responses. It fabricated no successful endpoint or database records. This network limitation is separate from the missing RPCs.

## Tables and migrations

**Production migrations successfully executed: none.** No Supabase administration MCP, SQL connection/password or administrative session was available. No database was reset, no production data changed and no replacement project was created. A REST 404 cannot safely determine which migrations are installed.

These are the repository-required tables, **not a claim that they exist in production**:

| Required private table | Purpose | Actual production status |
| --- | --- | --- |
| `hf_private.profiles` | Identity, Lifetime Score, SQK, unlocks, cosmetics, produce growth | Not inspectable with supplied access |
| `hf_private.wallet_profiles` | Unique canonical verified-wallet/profile association | Not inspectable |
| `hf_private.purchases` | Permanent inventory and paid prices | Not inspectable |
| `hf_private.catalogue` | Server-owned prices and active items | Not inspectable |
| `hf_private.runs` | Owned game state, event acknowledgement and credited score | Not inspectable |
| `hf_private.attacks` | Validated attacks, target limits and damage | Not inspectable |
| `hf_private.lifetime_entries` | Per-run permanent score ledger | Not inspectable |
| `hf_private.legacy_tickets` | Authenticated single-use legacy recovery | Not inspectable |
| `hf_private.badges` | Retained earned badges | Not inspectable |
| `hf_private.dice_receipts` | Retained historical records | Not inspectable |
| `hf_private.settings` | Retained historical settings | Not inspectable |
| `hf_private.daily_scores` | Private historical score archive | Not inspectable |

All seven historical migration files remain unchanged; `008_reward_guard.sql` is added after them, including `004_lifetime_persistence.sql`. [SQL_EDITOR.md](../supabase/SQL_EDITOR.md) supplies the exact inspection, ordered migration selection, preservation and verification procedure. `scripts/prepare-supabase.mjs` generates a transaction containing **only** migrations after an explicitly inspected version, with source hashes and a version guard. It has no production connection. No production starting version is guessed or preselected. Local PostgreSQL tests successfully exercised every starting schema 0–7, preservation and replay/wrong-version rejection.

## Persistence and access control

The retained backend derives canonical addresses from Supabase-verified Web3 identities, holds unique wallet/profile links, and validates ordered game events rather than accepting score/SQK totals. Narrow RPCs and profile/run locks handle permanent Lifetime Score, SQK, inventory, cosmetics and map unlocks. Version 6 checkpoints validated score/produce deltas into the profile and per-run ledger; 007 protects separate devices' active runs; 008 credits a forest collectible only when it is reachable in the frames played, caps a wallet at four open runs, and draws every ranked point from one per-wallet real-time budget (150 held, +1/second) across all runs. The Top 100 RPC reads canonical positive lifetime totals, descending with deterministic UUID ties and a 100-row cap; it omits wallet addresses.

**Production RLS policies verified: none.** The intended schema enables RLS on all twelve private tables, grants no browser table/schema/helper privileges and intentionally defines no permissive table policies. Public RPCs use fixed search paths; protected mutations require a verified wallet. These properties passed local PostgreSQL checks and direct-role denial probes. Production verified only the private schema's API non-exposure; an administrator still must inspect actual RLS/grants and execute `verify_production.sql` / `test_access.sql` there.

Frontend changes distinguish configured credentials, checked backend readiness and authenticated saved profiles. Startup/retry checks never create a profile or label a guest saved. Missing/incompatible backends fail before requesting a signature. Profile/wallet retry controls recover without unhandled errors. The leaderboard shows an unavailable state without fake records. Existing guest/local legacy records and durable pending-event queues remain intact; unverified browser totals are never imported into ranked scores.

## Mandatory production tests

| Requested test | Actual result |
| --- | --- |
| 1. Connect to actual production project | **Passed for Auth connectivity** (200). Application database RPCs unavailable. |
| 2. Read/write authenticated player records | **Blocked / not passed.** No real verified-wallet session and player RPC unavailable. |
| 3. Save a player's score | **Blocked / not passed.** Progress RPC unavailable; no production score written. |
| 4. Refresh and retain the score | **Not performed in production.** No saved production score to compare. |
| 5. Reconnect same wallet and restore | **Not performed in production.** No real signature/session available. |
| 6. Verify leaderboard against actual records | **Failed to retrieve** (404). No record comparison possible. |
| 7. RLS denies unauthorized score modification | **Not verified in production.** 404/406 are not proof of RLS enforcement. |

Builds, browser failure-state checks and local SQL/fixture tests do **not** satisfy the blocked production tests. Current local commands, results, design coverage and fixes are in [VALIDATION.md](../VALIDATION.md).

## Remaining work

An authorized administrator must run the [SQL Editor handoff](../supabase/SQL_EDITOR.md) in this same project: inspect existing data/schema, apply only missing migrations through 008 (008 is required before ranked play), verify preservation and RLS/grants, enable/check Ethereum Web3 Auth and allow the actual hosted HTTPS origin. Then perform the documented acceptance run with real wallets and compare real database records after score save, refresh and another-device login. Integration is complete only when all requested production tests pass. No secret should be placed in the frontend to unblock this.
