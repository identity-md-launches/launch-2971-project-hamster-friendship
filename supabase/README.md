# Existing Supabase integration

The game retains Supabase anonymous Auth, private profile identity, the public Top 100 projection, equipment and the original ordered event/outbox protocol. Wallet addresses are not used as proof of account ownership. No signature or transaction is added.

## Apply the upgrade

For an existing database with migration 001, apply **002_seasons_dice_badges.sql only**. For a new project apply 001, then 002. Migration 001 is the unchanged historical schema; do not reapply it to populated projects. Migration 002 is transactional and additive. It never resets SQK, score, map, purchases, cosmetics, Auth users, active-run HP or historical loot. Its default `rules_version=2` and guaranteed-coin mask preserve pending legacy run events. The current export starts version 3 through `hf_start_run_v3`. The original `hf_start_run` RPC now explicitly asks older open pages to reload before another map. Already-active old runs may finish with their frozen entitlements; new legacy runs cannot bypass the 20% reward policy.

Enable anonymous sign-ins, keep the Data API enabled with `public` exposed, and keep `hf_private` unexposed. Set the real HTTPS URL and browser-safe publishable key in `src/config.js`; rebuild `dist/`. No owner URL or key was provided, so the checked-in export truthfully uses guest play. No live backend validation was possible. A service-role/private key must never be placed in source, the export or browser storage.

## RPC contract

| RPC | Behavior |
| --- | --- |
| `hf_profile(p_name?)` | Existing private-session profile/name; now includes Dice counters and owned/unexchanged badges. |
| `hf_start_run_v3(p_map)` | Locks the profile, checks unlocked maps, abandons the previous active run, freezes purchased skills. Returns 31 weapon selections, 31 independent 20% coin trials and 30 random monster specs. |
| `hf_start_run(p_map)` | After migration 002: explicit reload requirement for cached old pages; no new legacy run is created. |
| `hf_progress(p_run,p_events)` | Existing sequence/ack, attack, HP, cooldown, ammo, burn, score and map checks. A coin claim additionally requires its server-selected coin mask. Finish awards eligible unique skill badges. |
| `hf_purchase(p_item)` / `hf_equip(p_slot,p_item?)` | Existing server-priced inventory and cosmetic operations, unchanged. |
| `hf_top100()` | Existing public name/score/map projection, with no seeded rows. |
| `hf_dice(p_prediction,p_request)` | HIGH/LOW only; two independent uniform server draws. UUID receipt replay returns the same result and counts once. Does not mutate SQK, score or map. |
| `hf_exchange_badge(p_badge)` | Locks profile and badge, accepts only skill/contribution, atomically marks it exchanged and credits the fixed tier value. Replays return the current profile without another credit. |

HP: small/large/boss bases 50/100/300, multiplied by `1.2^(map−1)` and rounded up. Damage specs use `1.2^(map−1)`. Weapon distribution and damage remain unchanged. The browser uses server specs. Cached older pages receive an explicit reload error on the legacy start RPC after migration; the upgraded browser also supports legacy 100/500 rules when connected to an unupgraded backend. New Dice/Badge Exchange panels report that migration 002 is required on such a backend.

Dice thresholds are 20/50/100 correct predictions. Correct predictions and lifetime wins count the same successful outcomes and never reset after display or an equipment purchase. DRAW increments rolls/draws only. Dice badges cannot be exchanged at either the function or table-constraint level.

Skill Bronze/Silver/Gold correspond to completing maps 1/3/5. Existing verified `highest_map` also backfills already-earned skill badges during migration. Unique IDs remain in the ledger after exchange, preventing re-earning through a replay. Fixed exchange values are Bronze 20, Silver 50, Gold 120 SQK.

## Verified contribution awards

There is deliberately no public claim/grant endpoint and no preloaded contribution badge. An authorized database owner verifies the contribution and executes `hf_private.award_contribution` through their private administrative connection. Its prepared call is:

```sql
select hf_private.award_contribution($1::uuid, $2::text, $3::text);
```

Bind the real Auth user UUID, one of `bronze`/`silver`/`gold`, and a unique verified contribution reference (1–120 characters). Issuance does not itself credit SQK. Repeating the same reference for that user creates no second badge, including after exchange. The function is revoked from public, anon and authenticated roles. Never give its administrative credentials to the client. The website cannot verify arbitrary contributions on its own.

## Persistence and boundaries

The client serializes mutating RPCs and accepts profile snapshots in response order. Combat events keep their durable outbox until acknowledged. Spending/exchanges wait for pending combat saves. Dice uses a persistent pending request UUID so reopening/reloading after a lost reply retries the same result. Profile-first database locking is consistent with purchases, runs and exchanges.

Guest profiles remain separate and are not imported as cloud credit. Guest state is local/editable and is never presented as verified global ranking. With Web Locks, guest coin rewards, purchases, Dice and exchanges share the same lock and fresh storage read; removal/credit is one write. The fallback without that API has not been validated for concurrent tabs.

The existing server protocol verifies submitted damage, drop entitlement, timing, sequencing and reward amounts; it does not simulate full collision/movement physics. This assignment does not add account recovery or cross-device login, deploy a backend, migrate a live service, or alter the optional wallet integration.

## Validation

Real PostgreSQL functions ran locally with PGlite 0.5.15: 43 historical-contract, 24 upgrade, 9 legacy client/engine and 7 upgraded client/engine checks passed. These include populated-schema migration, unchanged old run HP, rejected ineligible/duplicate rewards, all badge values, permission boundaries, real Dice milestones, a complete v3 map replay, and lost replies after committed Dice/exchange requests. Local Auth/HTTP adapters are explicit fixtures; they do not certify a hosted Supabase service. Commands and remaining checks are in the root README and VALIDATION.md.
