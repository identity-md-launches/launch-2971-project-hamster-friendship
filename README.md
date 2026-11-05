# squeek.hamster

An in-place update of **Hamster Friendship: The Lost Alice**. The existing forest, pixel renderer, story, characters, audio, combat, drop rates, prices and damage balance remain. The existing production address is unchanged:

[hamster-friendship-the-lost-alic.identitymd.eth.limo](https://hamster-friendship-the-lost-alic.identitymd.eth.limo/).

**Production cloud saves are not fixed or verified yet.** Both public Supabase settings were empty in the supplied checkout and the live `config.js` checked on 2026-11-05. No input identifies the original backend. This delivery supplies the tested frontend and migration, but does not invent a replacement project, migrate production or publish the site. Guest play works immediately. See [VALIDATION.md](VALIDATION.md) for actual test coverage and production blockers.

## Install, build and preview

Use Node 18 or later. This existing application is plain HTML/CSS/JavaScript with no runtime dependencies; its package manifest and lockfile are unchanged. No Vite/React conversion or second project was created.

```sh
npm ci --ignore-scripts
npm run build
npm run check
npm run preview
```

Open `http://localhost:4173/`. The production build copies 18 necessary files from `src/` to root `dist/`. All runtime assets, the manifest and icons use relative URLs and work under a static hosting subpath. No server, secrets, remote fonts, wallet relay or runtime CDN is required for guest play. Wallet cloud features use the owner's existing Supabase service once configured.

`npm run typecheck` is the inherited syntax/export checker. Actual JavaScript type analysis was additionally run using TypeScript against `jsconfig.json` and the new viewport module; do not confuse the two checks.

## Modified features

- **Lifetime Top 100:** replaces the daily board, reset countdown and calendar filtering. Only verified wallet-linked profiles with positive scores qualify. Rankings refresh every 15 seconds while open and on returning to the tab, with manual refresh and an error/retry state. No sample players are shipped.
- **Separate scores:** Current Map Score shows the current run's points. Lifetime Score in Profile and Menu shows ended sessions across maps. Death, completion and restart/abandonment end a session. Active-run points settle once, in the same database transaction as the terminal event. Existing stored totals are retained exactly, including points credited by earlier versions to then-active runs. Historical daily bests are archived, not added on top of already-counted totals.
- **Cloud readiness and saves:** the client checks migration 004 before asking for a login signature. Invalid configuration, failed requests and missing migrations remain visible. An unreadable or unacknowledged response cannot discard queued events. Retry also reloads the verified profile, allowing acknowledged changes from another device to appear.
- **Profile separation:** a guest's temporary profile stays separate in memory when switching wallets or disconnecting. It never uploads into a wallet account. Wallet authentication sessions and unsent event queues remain address-partitioned. Server balances and inventory remain authoritative.
- **Verified identity:** migration 004 resolves a canonical lowercase verified wallet to its original profile even if Supabase gives that same wallet a different Auth UUID. Original balances and purchase ownership are not merged or overwritten.
- **Mobile display:** `100dvh`/`100dvw`, VisualViewport resizing, safe-area insets, optional landscape lock after connection/play/fullscreen, and a rotate overlay. Rotation pauses and resumes the same world, rather than creating a map or changing wallet identity. Portrait play remains available.
- **Fullscreen/Home Screen:** a user-triggered fullscreen option, recoverable denial notice and a relative standalone manifest with local hamster icons. On narrow phones Fullscreen moves into Menu, leaving Change it visible beside Menu. Safari limitations are explained next to these options. No offline cache/service worker is installed.
- **Touch input:** ordinary buttons use `touch-action: manipulation`; the canvas, joystick and held action buttons retain gesture isolation. Repeated attacks/jumps and simultaneous movement/action touches remain responsive. Pinch zoom is not disabled across the page.
- **Change it:** visible on desktop and phone entry screens and in Menu. It opens owned costumes and calls the very same equip/unequip logic and Supabase RPC as Marketplace, without buying an item or charging SQK. Empty inventory links to Marketplace. **Interpretation:** the supplied checkout contained no control or handler named Change it; this exposes its existing costume functionality rather than inventing a separate cosmetic store or changing seasonal/gameplay rules.
- **Branding:** title, visible name, share-card heading and standalone app identity use `squeek.hamster`. The underlying project and original artwork remain Hamster Friendship. [docs/DOMAIN.md](docs/DOMAIN.md) records domain findings and alternatives.

## Play and saved data

Start adventure plays immediately as a guest. Keyboard: arrows/A/D move, Space/W/Up/Z jump, Enter or left mouse attack, E interacts, 1/2/3 select gun/bomb/sword, Escape/P pauses. Touch: joystick, Attack, Jump and three weapon slots; nearby drops collect automatically. GUILD retains the existing controls, story and economy details. Marketplace retains all eight products and existing purchase entitlements.

Menu → Connect MetaMask connects on Ethereum Mainnet without signing, approving or sending a transaction. With cloud configured, **Sign in to save** explicitly requests one domain-bound login message; Supabase verifies ownership. Saved sessions refresh without a new signature. Old browser Auth profiles can still be attached through the existing explicit legacy recovery option; an established wallet profile takes priority.

Permanent data consists of the verified profile, SQK, purchased inventory/upgrades, equipped cosmetics, map unlocks and lifetime score. Collected weapons/ammo remain per-map mechanics. The existing engine does not restore a suspended canvas position after a browser reload. Rotation preserves that live session. Guest progress lasts for the current page visit only. `localStorage` holds Auth sessions, pending-event queues and audio settings; it is not the cloud database or a global leaderboard.

One active map per wallet remains the server model. Starting another map/device ends the earlier server run and settles acknowledged points. Unsent events from a stale run are retained with an error instead of being merged, silently dropped or assigned to another wallet. An abrupt offline close cannot guarantee delivery; reopen the original browser and retry pending saves before starting elsewhere. Browser storage failures explicitly warn the player to keep the page open.

## After launch / before enabling cloud

These owner actions are required in the **same original Supabase project**, not a new backend:

1. Identify its real project URL and browser-safe publishable/anon key; set only those public values in `src/config.js`. They remain deliberately empty in this delivery. Never put a private/service-role key in the export.
2. Back up the existing database. Record [supabase/preservation_snapshot.sql](supabase/preservation_snapshot.sql) before/after migration 004. Establish which of migrations 001–003 are already installed; apply only unapplied files, then `004_lifetime_persistence.sql`. Do not replay installed historical migrations.
3. Enable Ethereum Web3 Auth; verify the current HTTPS site's login domain/URI and Supabase Auth/Data API configuration. Keep `hf_private` unexposed. Confirm [supabase/verify_lifetime.sql](supabase/verify_lifetime.sql) succeeds.
4. Audit production cron/external automation for any old game score reset. No scheduled reset exists in this repository. Remove only confirmed reset jobs; their production existence cannot be checked from this checkout. The new total-protection trigger rejects decreases/deletions.
5. Rebuild, then use two real devices and a real wallet to confirm login, reconnect, saved SQK/inventory/cosmetics, completed-session scoring, permanent rankings and zero duplicate purchases. Compare the preserved records with the backup. Test actual iPhone Safari, Android Chrome and MetaMask Mobile rotation/toolbars/fullscreen.
6. Review and deliver this same project's `dist/` through the established IMD handoff only after critical production checks pass. No publish command was run here. Do not replace the existing URL. Domain migration additionally needs a confirmed, working address and the recovery checks in [docs/DOMAIN.md](docs/DOMAIN.md).

[Supabase setup and schema details](supabase/README.md) include the exact migration semantics and access model.

## Reproduce checks

Test-only dependencies can be installed in disposable scratch space; they are not runtime dependencies or part of the submitted bundle:

```sh
npm install --prefix test/scratch --package-lock=false --no-audit --no-fund @electric-sql/pglite typescript axe-core
npm run build
npm run typecheck
node test/scratch/node_modules/typescript/bin/tsc --project jsconfig.json
node test/scratch/node_modules/typescript/bin/tsc --noEmit --allowJs --checkJs --strict false --target ES2022 --lib ES2022,DOM src/types.d.ts src/config.js src/rules.js src/save.js src/wallet.js src/ui.js src/viewport.js
node supabase/tests/lifetime.mjs
node supabase/tests/squeek-client.mjs
```

The browser scripts accept the path to an existing Playwright installation. With this assignment's provided Chromium runtime:

```sh
PLAYWRIGHT_BROWSERS_PATH=/opt/imd-tools/ms-playwright node scripts/validate-squeek.mjs /opt/imd-tools/playwright-mcp/node_modules/playwright/index.mjs test/scratch/node_modules/axe-core/axe.min.js
PLAYWRIGHT_BROWSERS_PATH=/opt/imd-tools/ms-playwright node scripts/validate-mobile.mjs
PLAYWRIGHT_BROWSERS_PATH=/opt/imd-tools/ms-playwright node scripts/validate-market.mjs
IMD_PLAYWRIGHT=/opt/imd-tools/playwright-mcp/node_modules/playwright/index.mjs PLAYWRIGHT_BROWSERS_PATH=/opt/imd-tools/ms-playwright node .imd/reads/skills/design-critic/scripts/taste.mjs --out test/scratch/taste --offline
```

The pinned taste script is an assignment input and is removed at handoff; its measured result is retained in `docs/validation/results.json`. Browser scripts manage their preview and browser inside a bounded foreground command. Results and screenshots are written to disposable `test/scratch/`; selected final evidence is copied to `docs/validation/`. Older `test-upgrade`/`upgrade`/`squeek` SQL scripts document earlier rule versions; use the commands above for the current delivery.

Full results, failed attempts that were repaired, and unperformed checks are recorded in [VALIDATION.md](VALIDATION.md). [DESIGN.md](DESIGN.md) describes the final implemented design and its six-domain review.
