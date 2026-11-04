# Supabase backend

Apply `migrations/001_friendship.sql` once to the owner's existing Supabase project. Enable anonymous Auth and the Data API. Public browser settings are in `src/config.js`; rebuild `dist/` after setting them. No service-role key, Edge Function deployment or additional server is required.

The client calls Auth signup/refresh and PostgREST RPCs. Its publishable key goes in `apikey`; the user's access token goes in `Authorization`. Identity comes from `auth.uid()`, never a caller-supplied player UUID or wallet address.

| RPC | Access | Purpose |
| --- | --- | --- |
| `hf_profile(p_name?)` | Authenticated | Create/read own profile, optionally validate/update name |
| `hf_start_run(p_map)` | Authenticated | Check unlocked map, create 31 HP records and server loot, snapshot skills |
| `hf_progress(p_run,p_events)` | Authenticated | Validate ordered game events and compute SQK/score changes |
| `hf_purchase(p_item)` | Authenticated | Lock balance, charge fixed catalogue price, insert unique purchase atomically |
| `hf_equip(p_slot,p_item?)` | Authenticated | Equip an owned matching cosmetic, or remove it |
| `hf_top100()` | Public | At most 100 names, lifetime scores and map tiers, ordered with deterministic ties |

Tables are in `hf_private`, have RLS enabled and deny direct schema/table access to `anon` and `authenticated`. Only the leaderboard is granted to `anon`. Privileged functions fix an empty `search_path` and fully qualify relations. Mutators acquire profile locks before run locks. Purchases are idempotent by `(user_id,item)` and cannot overdraft.

## Server validation

- Run ownership, unlocked map, active/terminal state, ordered sequence/frames, wall-clock bounds and a 48-active-hour run limit.
- 30 regular enemy HP records plus one boss, scaled per map. Boss hits require frame 3600 or later.
- Attack kind/cooldown, server-owned loot and pickup eligibility, gun/grenade ammunition and sword availability.
- Damage derived from weapon and purchased skills frozen at map start, rather than client damage numbers.
- One target per normal attack, or at most three per Piercing chestnut; repeat targets are refused.
- Grenade damage at most 5 per target every 60 frames for eight ticks, within the attack lifetime.
- Claims require a defeated enemy. Each coin and weapon can be claimed once. Acknowledged batch replay cannot double-credit.
- All 31 HP records must reach zero to complete a map. SQL computes points. No API accepts a balance, price, score total or player UUID.

These are server-side economic and event checks, **not a full server simulation of movement, hitboxes or grenade positions**. Scripted clients can still construct plausible timed attack/hit traces. This is not bot prevention or proof of human play. Stronger competitive anti-cheat requires authoritative simulation or replay verification; no cheat-proof claim is made.

## Save behavior

Events are batched about every two seconds, saved before sending and retried with backoff. Reload replays pending events before a new map starts. Online failures never silently turn into guest credit. Pending SQK cannot be spent until acknowledged.

Death closes the map and prevents later new claims. Existing coins and purchases remain. A new map invalidates a previous active run, including another tab's run; do not play one profile in several tabs simultaneously. Reload does not resume exact platform position: it flushes outstanding events, then starts a fresh attempt.

No email recovery is implemented. Clearing an anonymous Auth session loses access to its profile, although database records remain. Deleting an Auth user cascades through that user's game records. Display names are public on the board; wallet addresses, sessions and private identifiers are not.

## Tests and live activation

`tests/validation.mjs` applies this migration to isolated PostgreSQL via PGlite. Auth roles and funding records there are test fixtures only. It tests access control, invalid claims, replay, weapon rules, pricing, death, all 31 kills, map unlock and Top 100. The browser validator can connect the real frontend to those same RPCs with intercepted test HTTP responses. Hooks never enter `src/` or `dist/`.

`tests/frontend.mjs` reuses the actual engine and `save.js`, routes their generated events into the unchanged SQL RPCs, and checks immediate wall impacts (Chang at x=1108, y=146), delayed impacts and full fuse expiry. The explosion frame does not count as elapsed burning time: eight 5-damage ticks occur at explosion +60, +120, …, +480 frames. It verifies two targets, acknowledgement, offline retry/reload, SQK/score persistence, a server-priced purchase and the next map start. Auth/transport, drop RNG, collision positions, elapsed server time and purchase funding are isolated test fixtures, not live-service evidence. Run it with `node supabase/tests/frontend.mjs /path/to/pglite/dist/index.js`.

This is not a deployed project or live Auth/PostgREST certification. The owner must apply the migration, enable anonymous Auth, set the public values and verify the real service. If PostgREST's schema cache has not refreshed, run `notify pgrst, 'reload schema';` in the project's SQL Editor.
