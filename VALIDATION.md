# Local validation and consolidated design review

## Scope and completion

Updated the existing Hamster Friendship v3 tree in place. Runtime source is `src/`; the deliverable is the complete relative-URL export in `dist/`. Root build/package configuration, lockfile, authored map, original sprite assets, website address and hosting remain in place. No live database migration, hosting publication or chain deployment was performed.

**Local implementation and static delivery are complete.** Live Supabase/real-wallet validation and physical Safari/phone checks remain unperformed. The checkout has empty public Supabase configuration, so the exported site truthfully enables guest gameplay and explains unavailable cloud features. PostgreSQL and browser integration checks below use explicitly identified fixtures, not a pretend production backend.

Assumptions: UTC for the unresolved `[TIMEZONE]`; daily best map score, rather than lifetime ranking; additive one-time upgrades (+55% maximum); a gun refills to 100; bomb pickup gives three throws; selecting the active slot restores unlimited chestnuts; touch auto-pickup replaces the removed Look button. Original finite forest chestnuts/caches also score points. Daily attribution uses server acknowledgement time for offline events. These choices are documented in README and GUILD where relevant.

## Actual commands and results

Commands ran on the final source/export on 2026-11-05. All browser tests serve `dist/` beneath `/preview/` and close their foreground-owned server/browser after completion.

| Command | Actual result |
| --- | --- |
| `npm run build` | Pass; 14 files, 214,871 bytes. No runtime dependency download. |
| `npm run typecheck` | Pass; the existing script parses all seven runtime scripts, checks 54 referenced element IDs, metadata/relative URLs and byte-for-byte source/export parity. |
| `node test/scratch/node_modules/typescript/bin/tsc -p jsconfig.json --noEmit` | Pass; real TypeScript 5.9.3 `checkJs` using the existing configuration. This configuration checks config/rules/save/wallet/UI and declarations; canvas/audio are syntax-checked and exercised in Chromium rather than fully annotated by this TypeScript project. |
| `node supabase/tests/squeek.mjs` | **51 pass**, executing actual migrations/functions with PGlite 0.5.15 (PostgreSQL). |
| `node supabase/tests/squeek-client.mjs` | **13 pass**, actual save client plus actual PostgreSQL RPCs, explicit local Auth/HTTP fixtures. |
| `PLAYWRIGHT_BROWSERS_PATH=/opt/imd-tools/ms-playwright node scripts/validate-squeek.mjs /opt/imd-tools/playwright-mcp/node_modules/playwright/index.mjs test/scratch/node_modules/axe-core/axe.min.js` | **29 pass** in Chromium, including touch, keys, pickups, ammo, death/restart, overflow and wallet transitions. WebKit attempted and not runnable. |
| `PLAYWRIGHT_BROWSERS_PATH=/opt/imd-tools/ms-playwright node scripts/validate-market.mjs` | **10 pass**, actual production UI + PostgreSQL, fixture provider/Auth/HTTP only. Includes two tabs purchasing once, uncertain post-commit response and automatic board refresh at a shortened server reset deadline. |
| `IMD_PLAYWRIGHT=/opt/imd-tools/playwright-mcp/node_modules/playwright/index.mjs PLAYWRIGHT_BROWSERS_PATH=/opt/imd-tools/ms-playwright node .imd/reads/skills/design-critic/scripts/taste.mjs --out test/scratch/taste` | **16/16 pass**: render, layout, targets, contrast, casing, tracking, eyebrows, type sizes, faces, glyphs, slogans, repetition, copy budget, chrome, motion and share metadata. |

The provided browser MCP connection returned `Transport closed` before navigation. Rendered validation instead used the provided Playwright/Chromium directly in bounded foreground scripts. No alternative browser installation was added. Tests and the probe recorded no uncaught runtime errors or missing local resources in their covered production flows.

## Requested behavior coverage

| Requirement | Coverage and outcome |
| --- | --- |
| Full-screen landscape; joystick, Attack, Jump, slots | Measured canvas exactly equals viewport at 844×390, 667×375 and 568×320. All six control boxes fit and are mutually non-overlapping. Simultaneous movement/jump pointers, cancellation, automatic touch pickups and slot taps pass. |
| Compact menu/minimal HUD/fullscreen fallback | Four HUD metrics; seven utilities behind Menu. All how-to text in GUILD, subtitle/footer removed. Fullscreen request/fallback and any supported exit exercised in Chromium. Portrait rotate prompt inspected. Physical iPhone fallback remains unverified. |
| Desktop controls | Arrow movement, retained four jump bindings, Enter/left-click attack and removed X/J attack verified; E required for desktop drops; keys 1/2/3 switch weapons. |
| Weapons and ammo | Exactly 100 gun shots, rejected 101st shot, empty slot/fallback, refill capped at 100, separate bomb ammo and persistent sword entitlement checked in engine and SQL. Unlimited chestnut attacks exercised 150 times. |
| Exclusive drops and score | Exact 10/40/20/10/10/10 split across 10,000 stratified client rolls; server sample of 6,200 drops within ±3.5 percentage points for every bucket, with exactly one drop per monster. All six entitlements, 1/5-point scoring and duplicate rejection checked. Original forage values compared between client/SQL. |
| One-hit death and scaling | Actual monster contact and fire projectile hit each produce game over. Restart works. Small/large/boss HP and +20% map scaling checked. Player shield and health code/UI removed. |
| Marketplace | All eight products match server catalogue exactly. Buy/equip/unequip, insufficiency, one-time upgrades, immediate +55% damage for all three weapons, duplicate/retry and two-tab purchase paths pass. Five costume overlays render distinctly on the existing sprite. |
| Stored data and removed features | Migration over a populated prior schema retains exact profile/balance/inventory/cosmetics/history. Old shop entries become inactive; old reward-exchange/minigame RPCs are gone. Removed UI is absent. Private historical records remain. |
| Wallet vs guest | Guests perform no Auth/signup or gameplay save request; old guest data is ignored and unchanged. Verified legacy attachment, mismatched cached session rejection, delayed-response isolation, queued action cancellation, account/network changes and disconnect are checked. Real signature verification is delegated to Supabase, not simulated as a production result. |
| Daily Top 100 | Current-day wallet-only data, exact 100 cap, stable ties, old-day exclusion, timezone validation, DST conversion, midnight contribution rollover and later lower-score protection pass in SQL. Browser shows server rows, zone/reset time, empty state and automatic deadline refresh. |
| Branding/static delivery | Title/header `squeek.hamster`; favicon/description/og:title/og:image present; relative runtime assets. Existing website address and hosting unmodified. |

A complete legal map replay through actual attack/hit/pickup events verifies saved SQK, chestnut-only points, map-clear checks and map 2 unlock. No forced HP-zero shortcut is used in that completion test. A comparison against the original committed source also confirms the tile-map builder, base hamster pixel rows and all four enemy/boss sprite constructors are unchanged; root package/lockfile, jsconfig, build/check scripts and ignore file are byte-for-byte unchanged. Encounter/HP/drop fixtures used for individual unit paths are identified inside their test files and are never shipped in production source.

## Better Interface coverage: six domains

| Domain | Reviewed evidence | Unperformed or inapplicable subchecks |
| --- | --- | --- |
| Accessibility | Native buttons/dialogs/forms, labels, live/error regions, Escape and focus return; 44px entry controls; inset canvas focus outline; keyboard paths and axe on entry/GUILD/market/audio. All four axe scans report zero violations in selected WCAG A/AA tags. | Native screen reader, forced-colors rendering and every focus ring against every art pixel unperformed. Axe retains incomplete color-contrast checks and entry-state aria-prohibited-attr/aria-valid-attr-value checks; zero violations is not full accessibility compliance. |
| Layout | Actual 320/390/768/1440 viewports; three landscape phone sizes; 200% text enlargement; long HUD values; dialogue/menu reflow. First screen at 390 shows the game and Start. Screenshots inspected. | Browser-native zoom and RTL/localization not tested. No localization/theme feature is added. |
| Writing | Short action labels, one consistent weapon vocabulary, recoverable purchase/login errors, explicit guest/cloud status, all instructions in GUILD. First-screen prose is 14 words at 390, below the 60-word probe bar. | Legal copy/localized copy not part of this game update. |
| Typography | Existing native serif/system stacks, 400/700 weights, 14/16/20/28px roles, stable numbers and 16px inputs. Large values wrap without clipping; source and rendered screenshots reviewed. | Real OS fallback fonts and browser-native zoom not exhaustively tested. |
| Colors | Existing bark/cream/amber roles retained; opaque control surfaces inspected. Computed opaque-pair contrast in DESIGN.md. Probe’s measured text passes 4.5:1/3:1 thresholds. | Probe excludes 19 text boxes over canvas/media; no claim of per-pixel art/alpha-overlay contrast. No second theme exists. |
| UI details | Actual idle, pressed, selected, unavailable, loading, owned, equipped, insufficient-funds, retry and empty-board states; native modal scrolling/focus return; no repeated cards, glow or new decorative system. Reduced-motion CSS/engine guards reviewed and probe passes. | Slow-motion animation-panel inspection and native phone haptics not performed. No transaction flow exists to assess. |

## Findings and fixes

| Severity and source | Observed issue / correction | Recheck |
| --- | --- | --- |
| High — `src/styles.css:409`, `.game-chrome` | Initial fixed header/HUD placement overflowed to 404px at a 390px viewport with 200% text. Header and HUD now occupy growing grid rows; brand and long values wrap. | Full menu loop and GUILD at 200% text pass; 320 long-value screenshot inspected. |
| High — `src/save.js:18`, `mutate`; `src/save.js:36`, `accept` | Review found a queued action could otherwise execute under the wallet selected later, and old responses could otherwise restore the wrong snapshot. Operations capture an identity generation; stale queued actions fail and stale snapshots are ignored. | Delayed-A-response/B-switch and queued-B-purchase/A-switch tests preserve each wallet’s balance, inventory and name. |
| High — `src/save.js:89`, `signIn`; `003_squeek.sql`, `hf_prepare_legacy` | An expiring cached attachment ticket could prevent a later retry; a lost successful attachment must not strand the preserved profile. Login now requests a fresh ticket, and already attached legacy sessions identify their linked wallet without moving funds. | Attachment replay/established-wallet precedence/client legacy-login tests pass. |
| Medium — `src/styles.css:423`, narrow slot sizing | Weapon labels’ intrinsic widths could bring the row too close to the joystick at 320px. Explicit 44px slots/2px inline padding and a 76px joystick retain a visible gap. | 320px long-values/control screenshot inspected; landscape bounding-box checks pass. |
| Medium — `src/game.js:598`, `updateHud`; `src/styles.css:419` | Empty gun state needed to remove the weapon’s visible art and selection, while retaining its numeric slot. Zero ammo removes ownership, hides its icon and returns to chestnuts. | 100-shot engine/SQL tests, disabled slot and unlimited fallback pass. |
| Low — `src/styles.css`, final stage-tools/canvas rules | Probe measured Fullscreen only 26px wide; an outside canvas outline could be clipped by the viewport. Utilities now have a 44px minimum width and the canvas focus ring is inset. | Final probe: zero entry controls under 44px. Keyboard and viewport checks pass. |

A final preservation review restored the original five-line opening story on first play; the browser helper advances its actual dialogue before testing combat.

The optional “two reviewer-found bugs” were not supplied with concrete IDs/reproductions in this brief. The existing failed-restart guard is retained and regression-tested: a failed setup cannot resume a stale world without save tracking. Existing elapsed-frame bomb burn timing is retained and server timing/upgrade tests pass. No claim is made to resolve unidentified findings.

## Evidence and limitations

The compact machine-readable summary is `docs/validation/results.json`. Selected genuine screenshots are under `docs/validation/screenshots/`: phone entry, desktop entry, landscape gameplay/weapons, long values, GUILD, owned costume and daily rankings. Temporary full probe files, additional state screenshots and raw axe details remain under `test/scratch/` and are not submission assets. Superseded validation screenshots are removed rather than presented as this release’s evidence.

Live backend URL/key and Web3 Auth redirect settings were not provided. Hosted Auth, real signature verification, live legacy attachment/purchases and physical iPhone/Android fullscreen behavior therefore need owner/device validation. WebKit was attempted and unavailable, so Safari is not marked passed. Chromium touch emulation is not a device test. 200% text enlargement is not native browser zoom. The inherited server validates game events, not a full authoritative movement simulation. One active gameplay tab per wallet remains the supported model; multi-tab purchases are separately tested.

The network’s structural verifier checks paths/bytes only. These are actual local worker observations, not independent certification or evidence that the unconfigured live service already works.

Final structural check: the source/export/documentation tree is about 1.18 MiB, below the 8 MiB cap. Required paths are not ignored, protected build/package/ignore files are unchanged, no submodule is present, and no dependency/cache archive is included. `git diff --check` passes. The worker stages/commits the prepared tree after this task; no Git mutation was performed here.
