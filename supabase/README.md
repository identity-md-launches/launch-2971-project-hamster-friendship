# Existing Supabase backend: squeek upgrade

Apply `003_squeek.sql` **after the project’s existing 001 and 002**, in the same Supabase project. For a new database only, apply all three in order. Historical migrations are unchanged. This task neither runs a live migration nor replaces the backend. The delivered public configuration remains empty because the checkout supplies no service URL/key.

## Preservation and access

Migration 003 is transactional. It deletes no profile, balance, purchase, Auth user, historical run, badge or old statistic. The old catalogue rows are marked inactive to preserve purchase foreign keys. Old shop items and Badge Exchange cannot be invoked through the new service. The removed mini-game’s public RPC is dropped, while private historical records remain untouched. New profile snapshots omit its statistics and badges.

Private tables retain RLS and no direct access for anon/authenticated roles. Mutation functions use `SECURITY DEFINER` with an empty search path. A public caller cannot choose a profile ID, award SQK, change prices or set the reset timezone. All mutating gameplay/purchase functions resolve `hf_private.player_id()` from a **trusted `auth.identities` Web3 identity**, not editable user metadata, a passed wallet address or a browser-supplied score.

The Supabase Auth server must verify the login message and signature. Enable Ethereum Web3 Auth and allow the current HTTPS site URL, including the static hosting/gateway paths, in Auth redirect settings. The frontend uses the documented `POST /auth/v1/token?grant_type=web3` with `chain`, `message`, `signature`. The signing prompt explicitly describes login and never authorizes a transaction. See [Supabase’s Web3 guide](https://supabase.com/docs/guides/auth/auth-web3) and [Auth API schema](https://github.com/supabase/auth/blob/master/openapi.yaml).

Set only `supabaseUrl` and `supabasePublishableKey` in `src/config.js`; rebuild. Leave `hf_private` unexposed and `public` exposed through the Data API. A service-role key must never enter the static export.

## Existing profile attachment

Earlier versions saved to an anonymous browser Auth user; their wallet connection did not prove ownership. Those rows cannot safely be relabeled from an address alone.

1. The original browser session calls `hf_prepare_legacy()`, which locks its existing profile and issues a random one-use ticket valid for 30 minutes. It creates no balance. If already attached, it identifies the wallet instead of issuing another claim.
2. The player explicitly signs into MetaMask through Supabase Web3 Auth.
3. `hf_wallet_profile(p_legacy)` locks/consumes the ticket and creates a unique wallet-to-original-profile association. The original `profiles.user_id`, balance, purchases, cosmetics and historical score are retained in place.
4. An already linked wallet returns its established profile before considering a ticket. It never merges or overwrites an existing wallet. A ticket for another secured profile is refused. Lost responses can be retried safely.

The player may leave the attachment checkbox off to use their wallet’s existing profile. Old browser session/guest/outbox keys are not deleted. Old pre-upgrade pending gameplay is not imported into new wallet queues; historical stored balances remain intact. Without the original anonymous session, that anonymous profile needs owner-assisted recovery with independently verified ownership; the client never guesses an association.

## Daily reset timezone

The brief contains an unresolved `[TIMEZONE]`. **UTC is the explicit default assumption.** The database owner may set the intended IANA timezone through the SQL editor, for example:

```sql
update hf_private.settings
set leaderboard_timezone = 'UTC'
where singleton;
```

Replace `UTC` with the requester’s actual IANA choice. A trigger validates against PostgreSQL timezone names. Authenticated browser users have no permission to change it. The frontend reads the server’s timezone and reset deadline rather than relying on the device clock/timezone. PostgreSQL timezone conversion handles DST, including 23/25-hour days. Changing the zone selects a separate daily bucket and never affects balances or unlocks.

Daily scores retain historical rows by `(profile_id, score_day, timezone)`. Only the current bucket is publicly ranked. Each run tracks current-day points independently of its full map score; midnight resets that run’s daily contribution before new points are added. The board stores the greatest contribution from any one map run for that wallet/day. Server acknowledgement time determines the day for queued offline events. Only verified, linked profiles are eligible; no historical anonymous or guest scores are backfilled into today’s board.

## Current RPCs

| Function | Behavior |
| --- | --- |
| `hf_prepare_legacy()` | Original authenticated browser session issues an expiring profile-attachment ticket. |
| `hf_wallet_profile(p_legacy?)` | Opens the verified wallet profile; optionally attaches its original browser profile on first use. |
| `hf_profile(p_name?)` | Loads/renames the current verified profile. Returns preserved SQK, lifetime score, map, inventory, cosmetics and retained skill/contribution badges. |
| `hf_start_run_v4(p_map)` | Locks the profile, checks unlocked maps and creates 31 exclusive drops, 30 monster specs and scaled HP. Keeps the original one-active-run model. |
| `hf_progress(p_run,p_events)` | Accepts 1–128 ordered events, acknowledges idempotently, checks ownership, frame timing, damage, HP, weapon entitlement/ammo, attack cooldown, unique pickups and finite forest collectibles. Derives points/SQK itself. |
| `hf_purchase(p_item)` | Locks the profile; requires an active server catalogue item; atomically deducts its fixed price and inserts its unique purchase. An already-owned item returns the profile without charging. Damage upgrades immediately update active-run skills. |
| `hf_equip('costume',p_item?)` | Requires an owned active costume; accepts null to unequip; preserves prior cosmetics. |
| `hf_daily_top100()` | Public `{timezone,day,resetsAt,rows}` projection of up to 100 verified wallet scores, sorted by best daily map score, time reached, profile ID. No wallet address or private IDs are disclosed. |
| `hf_top100()` | Compatibility projection of the same current-day wallet-only board. |

Old start RPCs tell cached pages to reload. Old rule-version runs remain stored; they cannot mint new-rule rewards. The prior minigame and badge-exchange public RPCs are removed, rather than leaving an alternative SQK-credit path available to cached pages.

## Event and economy rules

One uniform reward roll per enemy chooses big `[0,.1)`, small `[.1,.5)`, coin `[.5,.7)`, gun `[.7,.8)`, sword `[.8,.9)`, bomb `[.9,1)`. `runs.claimed` is shared across all six kinds, so a defeated monster cannot yield multiple reward types. A new event cannot claim twice; an acknowledged replay cannot credit twice.

Big/small chestnuts award 5/1 points; coins award 1 SQK. Gun pickup sets ammunition to 100, bomb pickup adds three throws, and sword pickup grants its entitlement. Each gun/bomb attack decrements its own ammunition. Chestnut attacks do not consume ammunition. The original bomb area/burn rules remain eight ticks at least 60 frames apart; upgrade damage applies to every tick. Monster damage scaling is absent; HP retains the 1.2-per-map rule.

Finite forest entitlements are derived from the original authored map: 34 trail chestnuts, the chest, basket, log, two lanterns and two bushes. The client and SQL share tested values, but SQL derives its own amount from the source identifier. Enemy defeat/map completion no longer add old bonus points; completion still unlocks the next map and retains existing skill badge awards. Purchased legacy chestnut skills remain effective, and old inventory is never deleted.

The new catalogue is five 50-SQK costumes plus additive +10%/50, +20%/50, +25%/150 upgrades. This interpretation gives +55% when all three are owned. Each item has one purchase per profile. A profile row lock serializes parallel purchases; a function error rolls back both inventory and balance together.

## Boundaries and checks

The inherited event-validation model checks submitted combat rules, timing, entitlements and amounts. It does not run a complete authoritative movement/collision simulation, and cannot certify that an unmodified client played every event. One gameplay tab/map per wallet remains the supported model; parallel purchase requests are supported.

Run `node supabase/tests/squeek.mjs` and `node supabase/tests/squeek-client.mjs` with optional PGlite module paths. They execute real PostgreSQL functions against explicit Auth/transport fixtures. Current results are 51 database and 13 client/database checks, including migration over populated data, legacy attachment, privacy, exclusive rewards, 100-shot exhaustion, upgrade parity, full-map completion, midnight rollover, DST, the Top 100 cap, lost replies and account-switch isolation. `scripts/validate-market.mjs` additionally exercises the actual browser UI against those PostgreSQL functions, with fixture Auth only.

These tests do not validate a hosted Supabase service, real message signature, real Auth redirect configuration or owner permissions in production. Those remain owner verification steps before enabling cloud features on the existing site.
