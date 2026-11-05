# Validation and release report — 2026-11-05

**Incomplete for the production objective; useful local implementation delivered.** The existing game was updated in place and exported to `dist/`. No production migration, publication, domain registration or URL change occurred. The original Supabase project is still unidentified; its public configuration was empty in the checkout and in the live `config.js` retrieved on this date. No production database data was accessed or changed, so this report cannot certify that previously existing live data is intact or that live cloud saves/rankings work.

## Requirements and actual status

| Requested area | Implemented and tested here | Remaining requirement |
| --- | --- | --- |
| Correct production Supabase, migrations and persistent verified profiles | Migration 004, pre-signature readiness check, canonical wallet links, SQL-backed profile/balance/inventory/cosmetics/unlocks, refresh and retry exercised locally. | **Needs original project's public URL/key and owner access** to apply/verify migrations and Ethereum Web3 Auth. No substitute backend was created. |
| Preserve existing profiles, SQK and history | Populated PostgreSQL migration preserves profile/inventory/identity fingerprints and old daily rows; old active-run points are not credited twice. | Compare the real production backup/snapshots before and after migration. Only “production was not touched” is confirmed here. |
| Lifetime Top 100, no daily reset | Verified wallets only; ended sessions accumulate; current score separate; retries settle once; deterministic cap of 100; automatic/manual refresh; old daily RPC removed. Operational in the SQL/UI fixture. | **Not confirmed operational in production.** Owner must also check any external/cron reset jobs absent from this repository. |
| Guest/wallet separation and no duplicate spending | Guest memory profile remains separate; wallet queues and Auth sessions partitioned; in-flight account changes, duplicate purchases, replayed pickups and lost replies tested. | Real wallet signatures and original anonymous-profile recovery require the live owner/service. |
| Mobile landscape / MetaMask | Landscape request on connection/play/fullscreen; unsupported-lock overlay; same world/wallet retained on rotation; portrait fallback; delayed injection handler added. | Physical MetaMask Mobile, Android Chrome and iPhone Safari not tested. |
| Safari screen area / fullscreen / PWA | Dynamic viewport units + scale-adjusted VisualViewport, safe-area rules, fullscreen/denial recovery and standalone manifest/icons tested in Chromium emulation. | Actual Safari toolbar behavior, device notches and Home Screen installation remain unverified. Browser UI cannot be forcibly hidden; native iOS orientation/fullscreen limits apply. |
| Accidental zoom and controls | Manipulation on ordinary controls; gesture isolation on game controls; repeated attack/jump, simultaneous pointers, cancellation and magnification checked. No global zoom cap. | Actual iOS/Android gesture heuristics and assistive input need device checks. |
| Change it on desktop/mobile | Visible header button and menu entry share owned-costume equip/unequip and SQL inventory; no additional purchase/charge. Empty inventory links to Marketplace. | Interpretation documented: no original control/handler named Change it existed in the supplied tree. Physical-device interaction remains unverified. |
| squeek.hamster branding/domain | Heading/title/share image/manifest branding; domain research with authoritative sources. Existing project/address retained. | Literal `.hamster` is not a delegated public DNS TLD; no IMD `.hamster` registration flow found. Alternative ownership, availability, fees and connection require owner action. See `docs/DOMAIN.md`. |
| Existing game and marketplace | Movement, jump, attacks, drops, ammo, slots, one-hit game over, restart, audio, costumes and shop exercised. Runtime rule/art assets otherwise retained. | Inherited client-event validator is not an authoritative anti-cheat movement simulation. One active map per wallet remains supported; canvas position is not restored after reload. |
| Static delivery and documentation | Root `dist/index.html`, 18 local runtime files, original source/manifest/lockfile, design/setup/validation documents. Relative assets tested at `/preview/`. | Hosting is a subsequent existing-project handoff, not performed by this worker. |

## Commands and outcomes

All listed final checks exited 0. The five interaction/database suites contain **124 checks** in total; this is the worker's own evidence, not independent certification.

| Command / suite | Actual result |
| --- | --- |
| `npm run build` | 18-file production export built successfully; source/assets copied byte-for-byte. |
| `npm run check` and `npm run typecheck` | Syntax, share metadata, relative URLs, 61 referenced DOM IDs and source/export equality passed. The inherited “typecheck” script is a syntax/export check. |
| `node test/scratch/node_modules/typescript/bin/tsc --project jsconfig.json` | Actual configured JavaScript type analysis passed. |
| TypeScript CLI over `types.d.ts`, config/rules/save/wallet/ui plus `viewport.js`, with `--noEmit --allowJs --checkJs --strict false --target ES2022 --lib ES2022,DOM` | Passed; includes the new viewport module outside the inherited config's files list. The initial default-strict CLI attempt was corrected to the project's explicit non-strict setting; no type checking was disabled in the source. |
| `node supabase/tests/lifetime.mjs` | **27 PostgreSQL checks passed.** Sequential 001–004 migration; populated-data preservation; owner snapshot/verification SQL executed; lifetime settlement, baseline, retries, canonical identity, RLS/permissions, purchase idempotency, complete legal map, no calendar dependence and 100-row cap. |
| `node supabase/tests/squeek-client.mjs` | **19 client/PostgreSQL checks passed.** Real save.js against real SQL behind explicit Auth/transport fixtures: guest isolation, reload, account races, lost replies, malformed acknowledgements, refresh without signing, migration failure before signature and second-device restore. |
| `scripts/validate-squeek.mjs` with provided Playwright and scratch `axe-core/axe.min.js` | **33 Chromium gameplay/browser checks passed.** Entry, menus, keyboard/focus, combat, weapons/ammo, pickups, death/restart, audio, costumes, touch, long values and 200% root text. Axe found 0 violations in entry, GUILD, Marketplace and Audio; incomplete/contrast checks remain recorded, not claimed passed. WebKit launch unavailable, skipped with a limitation. |
| `scripts/validate-mobile.mjs` with provided Chromium | **33 emulated mobile checks passed.** iPhone 13/Safari-shaped, Pixel 7/Chrome-shaped and MetaMask-shaped contexts; stub providers and deliberately refused/absent platform APIs. Rotation, viewport changes, repeated touch, CDP magnification, fullscreen denial/dismiss/focus, reconnect and relative manifest/icons. These are **not physical devices or native Safari/MetaMask**. |
| `scripts/validate-market.mjs` | **12 SQL-backed UI checks passed.** Explicit fixture Auth/signatures; real SQL and export UI. Buy/equip/unequip, insufficiency, reload, 15-second automatic ranking refresh using Playwright clock advancement, manual refresh, ranking failure/retry, both mobile Change it paths and desktop, two-tab duplicate purchase, lost response. |
| Pinned `taste.mjs --out test/scratch/taste --offline` using the assigned Playwright/Chromium | **16/16 checks passed**, measured at 320/390/1440 with reduced motion. Entry screenshot at 390 inspected: brand, scene, Change it, Menu and Start adventure visible. No horizontal scroll/text overlap/clipping reported. 20 canvas/image-backed text boxes not contrast-measured. |
| Export/bundle integrity | `dist/index.html` is an existing tracked path and not ignored. New deliverables are not ignored. Root package/dependency/build configuration, `.gitignore`, contracts and library dependencies were not changed. No staging/commit/publication command was run; the worker handles the final commit. Final size checks are in `docs/validation/results.json`. |

Browser reproduction commands and test-dependency installation are in README. Test-only packages live under disposable `test/scratch/`, which is removed before submission. No dependency archives, runtime node_modules, caches or test fixtures are required by the export. The pinned probe is an input removed at handoff; its result is retained.

## Viewports, rendered checks and evidence

Desktop Chromium: 1440 × 900. Responsive checks: 320/390/768 × 900; game HUD checks additionally 767/768 × 390, 667 × 375, 844 × 390 and 320/390 × 844 with 100% and 200% root text. Landscape controls were checked at 568 × 320, 667 × 375 and 844 × 390. Device emulation additionally used iPhone 390 × 844 ↔ 844 × 390 and Android/MetaMask 393 × 851 ↔ 851 × 393, with landscape height reduced to 300 to emulate toolbar/usable-area changes.

Tests serve the real export under `/preview/`. Combat fixture access is injected only by test routing and is absent from shipped source. Market screenshots show explicit fixture accounts/SQL data, never seeded public rankings. Raw runs and failures are in disposable scratch; selected final screenshots and machine-readable results are in `docs/validation/`:

- `screenshots/phone-entry.png`, `desktop-entry.png`: final entry at 390 and 1440.
- `screenshots/rotate-overlay.png`: fallback on an emulated phone after a refused lock.
- `screenshots/landscape-weapons.png`: existing controls/weapon rendering with explicit gameplay test fixtures.
- `screenshots/lifetime-rankings.png`, `owned-costume.png`: real UI over SQL fixture data.
- `screenshots/long-values-320.png`, `guild.png`: narrow HUD values and retained help.

Screenshots were visually inspected, not just written. Canvas text contrast over every seasonal/moving scene remains unmeasured. Root font enlargement and CDP page magnification are not browser-native desktop zoom or physical pinch testing.

## Better Interface: consolidated six-domain coverage

The pinned workflow and core principles of all six domains were read and applied during implementation; the documentation section was used for final DESIGN.md. The visual idea remains the existing pixel forest with quiet bark/cream controls.

| Domain | Coverage | Limits |
| --- | --- | --- |
| Accessibility | Checked labels, keyboard menu/dialog flows, visible focus tokens, focus return, >=44px controls, explicit errors, disabled/pending states, reduced motion, no global pinch cap. Axe checks in four primary states found 0 violations. | No screen-reader session, switch control, physical accessibility service or complete WCAG certification. Axe incomplete items are retained. |
| Layout | Checked first phone screen, listed viewport sizes, control bounds/overlap, static subpath, rotation, usable-area resizing, table wrapping, large numbers and 200% root text. | Native Safari toolbars/notches, native zoom and RTL mirror not tested; the product is the existing English-only game. |
| Writing | Checked lifetime/current score distinction, no reset/deadline copy, guest/unconfigured/migration/error/retry states, ownership and gas-free login explanation. Fixed singular ranking label. | Production “saved” states require real hosted-service verification. No localization introduced. |
| Typography | Reused system/Georgia families, 400/700 weights, inherited semantic scale, tabular values, full address/name wrapping, 16px form input. Probe measured only 2 families and 2 weights. | OS font rendering and native iOS text settings not verified. |
| Colors | Reused semantic tokens; measured opaque pairs (15.61, 11.76, 9.31, 5.81, 11.34:1); inspected actual opaque controls/dialogs and measured entry contrast through probe. | Probe left 20 image/canvas-backed text boxes unmeasured. No promise about every moving pixel, hover background or alternative device rendering. |
| UI | Checked rest/focus/pressed/disabled/pending/error/empty states, native dialog closure, real purchase/equip/refresh actions, motion preferences, compact rotation and dismissible fullscreen error. | No 10%-speed native animation-panel session or real app-install flow. Gameplay simulation continues by design. |

## Findings, fixes and rechecks

| Finding | Source / evidence | Disposition |
| --- | --- | --- |
| Daily calendar ranking conflicted with permanent totals. | `src/ui.js:130`, `src/save.js:192`, `supabase/migrations/004_lifetime_persistence.sql:22`; original daily RPC and immediate-credit behavior reviewed. | Replaced runtime path with ended-session settlement, preserved baseline and public lifetime projection. SQL, client and automatic-refresh UI tests pass. Historical migration inputs remain unchanged. |
| Auth UUID changes could refuse the same verified wallet. | `supabase/migrations/004_lifetime_persistence.sql:56`; duplicate verified address/casing fixture. | Resolve the canonical unique wallet, preserving the original profile. Reopening with a second Auth UUID passes. |
| Malformed successful progress response could clear pending events. | `src/save.js:74`; actual SQL commit with deliberately missing acknowledgement. | Validate acknowledgement before removing queued events. Retry preserves/credits once; client test passes. |
| Mobile toolbar/zoom/rotation sizing could retain stale CSS dimensions. | `src/viewport.js:17`; resize regression and CDP scale test. | Scale-adjusted VisualViewport dimensions; square-pixel canvas retained; rotation clears held input only. Emulated device tests pass. |
| New visible Change it could force the header grid beyond 320 at 200% text. | `src/styles.css:446`; failed regression and screenshot/box measurements showed a 342px header on a 320px stage. | Added an explicit `minmax(0,1fr)` track and wrapping tools/header. Re-run of the 320/200% HUD check passes. No font-size reduction or clipping used. |
| No Change it handler existed in this checkout. | `src/ui.js:92`, `:160`; search and existing shop/equip flow review. | Shared wardrobe mode and both header/menu entry points. SQL-backed UI proves actual equip/unequip without a charge. Ordinary guest state honestly shows no owned costumes. |
| Rank broke across lines and rotation help partially showed behind its overlay. | `src/styles.css:451`, `:453`, `:456`; inspected 390 ranking/rotation screenshots. | Wider first column with phone cell padding; compact opaque rotation panel hides duplicate paused/help text. Final screenshots inspected and UI/mobile checks pass. |
| Share art retained the older project heading. | `src/og-image.svg:36`; original SVG text reviewed. | Changed only heading to squeek.hamster and re-exported PNG. Forest/hamster artwork retained; final image inspected. |

Intermediate failures were repaired, rebuilt and rechecked; they are not reported as passing attempts. Initial icon export omitted the supplied browser-runtime path and failed before generating icons; using the documented runtime produced the required PNGs. A responsive test initially read layout before its scheduled resize; it now waits for measured stage dimensions. One full-map SQL fixture initially forgot its preserved charged-skill entitlement; its attack count now accounts for the existing 37.5 damage rather than sending hits after defeat. These were test/setup corrections, with no combat balance change.

## Live production evidence and unresolved release gate

A read-only HTTP retrieval of the live `/config.js` succeeded and showed both Supabase public fields empty, matching the supplied source. No project reference or public key was provided elsewhere in the pinned project context. Browser-tool navigation failed with `Transport closed`; direct headless Chromium navigation to the production URL failed with `net::ERR_EMPTY_RESPONSE`. Neither is a production gameplay test. The curl configuration retrieval does not prove rendered behavior or data preservation.

The original backend owner must supply/configure the browser-safe project values, apply only unapplied migrations in that same project, enable/verify Ethereum Web3 Auth, inspect external reset automation, compare the real preservation snapshots and perform real-wallet/two-device save/purchase/lifetime tests. Then check physical Safari, Chrome and MetaMask behavior and approve release through the same project's normal handoff. Do not call this cloud fix complete or silently hide the current availability error.

`.hamster` is not currently delegated in public DNS; IMD rejects a dotted site label. No registration, availability, DNS target or fee for the literal name was fabricated. Alternatives, current cited ENS fee guidance and conditional same-export connection steps are in `docs/DOMAIN.md`. Current production URL remains intact.
