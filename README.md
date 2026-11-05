# squeek.hamster

An in-place update of **Hamster Friendship: The Lost Alice**, retaining the authored forest, canvas engine, original hamster/enemy sprites, story, seasonal environments and procedural audio. The display name is now `squeek.hamster`; the existing website address and hosting configuration are unchanged.

**The export is playable as a guest now.** This checkout arrived with empty Supabase settings. Wallet saves, persistent purchases and global rankings are implemented, but require the existing backend owner’s setup below; no live backend was invented or replaced.

## Install, preview and rebuild

Node 18+ is sufficient; validation used Node 22. The existing dependency-free JavaScript stack, root package manifest and lockfile are retained.

```sh
npm ci
npm run build
npm run typecheck
npm run preview
```

Preview opens at `http://localhost:4173/`. Stop it with Ctrl+C. Edit `src/`, rebuild and include `dist/` with the source and original lockfile. The production build copies 14 local runtime files; it needs no registry, backend or secrets to build. Assets use relative URLs and work at a static hosting subpath. No server rewrite is required. `dist/` is included in the submission; no publishing or DNS operation is performed here.

## Play

- **Desktop:** arrows or A/D move; Space, W, Up or Z jump. Left mouse button on the canvas or Enter attacks. E collects nearby items and interacts with story objects. X/J/Q and the shield bindings are removed.
- **Weapons:** 1 = gun, 2 = bomb, 3 = sword. Collect a weapon before selecting its slot. Select the same slot again to return to unlimited chestnuts. Gun pickups refill to 100 bullets, never above 100; the empty gun’s icon/ammo disappear and its slot becomes unavailable. Bomb pickups give three throws; swords have unlimited uses. Weapons remain map-scoped, as before.
- **Touch:** rotate to landscape, drag the circular joystick, and use Attack, Jump and the three slots over the canvas. Where the primary pointer is touch (`(pointer: coarse)`), walk over drops to collect them; a touchscreen laptop with a mouse still uses E. Story objects show a contextual Open/Read/Talk button. Fullscreen requests `screen.orientation.lock('landscape')` where available; the button is hidden in browsers without element fullscreen (iPhone Safari), where you rotate manually. The canvas widens to the screen’s aspect with square pixels instead of stretching. Portrait remains playable with a rotation hint.
- **Menu:** Profile, Marketplace, GUILD, Audio, Top 100, wallet connection and Pause/Resume are behind one compact control. Supplemental weapon, season and timer text is also in this menu. All how-to-play content and the original story are in GUILD.
- **Combat:** one monster/projectile hit or a fall ends the map. Stomping remains an attack. Monster HP starts at 50/100/300 for small/large/boss and increases by 20% per map. Player health, shield and enemy damage scaling are removed. Each map retains 30 regular monsters and the boss after 60 active seconds.

## Rewards and marketplace

Every defeated monster, including the boss, selects **exactly one** drop with one roll:

| Drop | Chance | Reward |
| --- | ---: | --- |
| Big chestnut | 10% | 5 points |
| Small chestnut | 40% | 1 point |
| SQK coin | 20% | 1 SQK |
| Gun | 10% | 100-bullet magazine |
| Sword | 10% | Unlimited sword uses |
| Bomb | 10% | 3 bomb throws |

The HUD shows SQK, Map, Defeated and current-map Score. Original trail chestnuts and finite caches also give points. Kill/map-clear score bonuses are replaced by chestnut points; historical lifetime scores are retained. Emergency falling-ammo resupplies are unnecessary with unlimited chestnuts and are removed, preventing endless point farming. A drop and each original forest collectible can be claimed once.

The new shop contains five 50-SQK costumes: Deadpool, Batman, Spider-Man, Superman and Samurai hamster. They are original pixel overlays on Chang’s existing animated sprite, with matching shop previews. Each can be bought once and equipped/unequipped. Three one-time upgrades add +10% for 50 SQK, +20% for 50 SQK and +25% for 150 SQK. They stack additively to **+55%** and apply immediately to gun, sword and bomb, including the bomb’s burn ticks. Chestnuts and stomps retain their base damage. Existing purchased chestnut skills and cosmetics are preserved, but are no longer sold.

The server locks the profile, uses its own prices and atomically records the unique purchase and deduction. Retrying a request cannot charge twice. Guest shop purchases are disabled. Dice, its statistics/achievements and Badge Exchange are removed from active UI/runtime APIs. Historical private database records are preserved.

## Saves, wallet identity and daily ranking

Guests keep only in-memory progress for this visit. No guest score, SQK or map progression is written to storage, imported into a wallet profile or submitted to rankings. Existing old guest storage is left untouched and ignored.

Connect MetaMask through the retained EIP-6963 connector or its phone browser. **Saving additionally requires an explicit login-message signature**, verified by Supabase Web3 Auth. Connection never silently signs. No transaction, allowance or on-chain deployment is requested. Secure wallet-owned saves replace the earlier display-only wallet/private-browser-session split; an unverified address is never account ownership evidence. See [Supabase Web3 Auth](https://supabase.com/docs/guides/auth/auth-web3).

Existing browser cloud profiles can be attached through the wallet dialog’s “Keep this browser’s existing cloud balance and progress” option. The server issues an expiring one-use ticket to that authenticated old session, then links its original profile row to the verified wallet. It does not copy, delete or reset its balance, progression or purchases. An already established wallet profile takes priority; profiles are never automatically merged or overwritten. Preserve original browser data until migration succeeds.

Wallet sessions and pending gameplay queues are partitioned by address. Requests capture their original identity; delayed responses and queued mutations cannot overwrite/spend another wallet’s profile. Failed saves remain queued and Profile offers Retry. Start/restart waits for pending saves. The existing one-active-ranked-map-per-profile model remains: use one gameplay tab; a map started elsewhere abandons the earlier run. Concurrent purchases are safe and tested separately.

Daily Top 100 ranks each verified wallet’s **best map score saved during the current calendar day**. Midnight starts an empty ranking without deleting SQK, purchases, lifetime points or map unlocks. Only newly acknowledged points count after a run crosses midnight; delayed offline saves use the server’s acknowledgement day. Ties use time the score was reached, then profile ID. The server supplies the day, timezone and next midnight; the open board refreshes at that deadline and at least once per minute. No scheduled destructive reset is needed.

## After launch: owner setup

1. Back up the existing Supabase database. Apply only unapplied migrations in order. A project already on the prior release applies **`supabase/migrations/003_squeek.sql`** after its existing 001 and 002. Do not replay historical migrations over populated tables.
2. Enable Ethereum Web3 Auth in that same Supabase project. Configure its Site URL/redirect allowlist for the **existing HTTPS website and gateway paths**. Keep the original Auth users/profiles and the old session usable for the legacy attachment flow.
3. Set only the real public Supabase URL and browser-safe publishable key in `src/config.js`, then rebuild. Never include a service-role key. No backend values were supplied in this checkout.
4. The brief left `[TIMEZONE]` unspecified. This implementation assumes **UTC**, configurable by the database owner via `hf_private.settings.leaderboard_timezone`. Choose the intended IANA timezone before enabling live rankings. Details and SQL are in [supabase/README.md](./supabase/README.md).
5. Validate a real MetaMask login, legacy profile attachment and purchase against the hosted backend; test fullscreen/orientation on physical iPhone and Android devices. Those checks require the real service/devices and were not performed here.

No token is deployed, re-minted or replaced. Hosting remains the network’s subsequent handoff of this static export.

## Validation

[VALIDATION.md](./VALIDATION.md) records commands, fixes, coverage and limitations. [DESIGN.md](./DESIGN.md) records the final implemented interface. The latest HUD revision reproduced the landscape clipping, corrected the CSS rule order, and kept enlarged text in the wrapping row below the header. The production build, `npm run typecheck`, real TypeScript `checkJs`, **33 browser checks** and **16/16 taste@1 checks** pass on this revision. The HUD regression checks seven viewport sizes at normal and 200% root text. The original `npm run typecheck` is a syntax/export-integrity check; the separate TypeScript command below checks the existing `jsconfig.json`. PostgreSQL and marketplace/PostgreSQL suites retain their earlier recorded results and were not re-run for this CSS-only change.

Optional verification dependencies belong only in disposable scratch space:

```sh
npm install --prefix test/scratch --no-save typescript@5.9.3 @electric-sql/pglite@0.5.15 axe-core@4.11.0
node test/scratch/node_modules/typescript/bin/tsc -p jsconfig.json --noEmit
node supabase/tests/squeek.mjs
node supabase/tests/squeek-client.mjs
PLAYWRIGHT_BROWSERS_PATH=/opt/imd-tools/ms-playwright node scripts/validate-squeek.mjs /opt/imd-tools/playwright-mcp/node_modules/playwright/index.mjs test/scratch/node_modules/axe-core/axe.min.js
PLAYWRIGHT_BROWSERS_PATH=/opt/imd-tools/ms-playwright node scripts/validate-market.mjs
IMD_PLAYWRIGHT=/opt/imd-tools/playwright-mcp/node_modules/playwright/index.mjs PLAYWRIGHT_BROWSERS_PATH=/opt/imd-tools/ms-playwright node .imd/reads/skills/design-critic/scripts/taste.mjs --out test/scratch/taste
```

The browser commands own their bounded preview and close it afterward. On another machine, pass the installed Playwright module/browser paths instead. The taste script is a pinned job input and is not shipped. Tests use explicit temporary Auth/provider, clock and encounter fixtures; none are in `dist/`. The prior-release test scripts describe superseded rules; the commands above are the current regression suites. No `node_modules`, verification packages or caches are runtime deliverables.

Live Supabase and a real wallet were not exercised. Chromium emulation passed; WebKit was attempted but its local runtime is unavailable. These local results are worker checks, not independent behavior certification. [Existing guide attribution/licenses](./docs/licenses/better-interface.txt) are retained.
