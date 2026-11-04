# Upgrade validation

Worker results, 2026-11-04. These are reproducible local checks, not an independent certification or a claim that a live backend was deployed.

## Revision: grenade timing and paused dialogue

Both reported defects reproduced before editing runtime source; both are fixed in `src/game.js` and the rebuilt `dist/game.js`.

| Finding | Reproduction | Fix and recheck |
| --- | --- | --- |
| High, `0371690f545bf7042727ee92d16b9f803ac8af6cab41eab4e50e168c00f5af47` | Actual `updatePlayer` → `updateShots` → `updateBurns`, x=1108/y=146: attack and explosion at frame 64, first hit at 123 (59 elapsed). The actual SQL RPC rejected the save and the durable outbox stayed pending. | `src/game.js:1099` stamps each burn's creation frame; `:1134` skips that frame. First hit is now 124. No SQL limits were loosened. `supabase/tests/frontend.mjs` passes all 9 checks through the real save client and actual migration/RPCs: immediate impact 64→124, delayed impact 78→138, fuse expiry 124→184; two targets each receive exactly eight 5-damage ticks spaced 60 frames apart. Offline retry/reload credits SQK/score exactly once, a server-priced purchase succeeds and a fresh cloud map starts. |
| Medium, `edb5e8c3824e9d70d41b9113179b6a359597235994744e057e6e7639d6a2983e` | Chromium at 390×844: Start chapter, Pause, Tab twice focused `dlg-next`; five Enter presses advanced the story. State became `playing` and frame 0→39 while the pause screen remained visible. | `src/game.js:604` guards dialogue advancement by state. `:619` hides dialogue on pause; `:628` restores it only when resuming dialogue. Chromium repeats the keyboard sequence and synthetic covered clicks: state stays paused and frames freeze, then Resume restores the same line/focus. Profile-menu pause and Escape resume also pass. Three added engine checks cover frozen frames, preserved lines and a final-line callback running only once after Resume. |

Revision checks: build/check and TypeScript checkJs pass; **32** gameplay/save checks, **43** PostgreSQL checks, **9** frontend-to-PostgreSQL checks and **28** Chromium interaction checks pass. The pinned design probe passes **16/16**; axe reports no violations on six surfaces. The integration fixtures do not connect a live Supabase project. WebKit was attempted but its runtime was unavailable; Safari remains unverified.

Changed-surface Better Interface coverage: accessibility checked hidden-control removal, keyboard focus, guarded activation and Resume; layout checked the paused and restored 390px screens visually and entry reflow at 320/390/1440; writing checked Pause/Resume/Next labels against their behavior; typography and colors retain the existing tokens and pass the probe's measured checks; UI checked pause, menu dismissal and dialogue restoration. Screenshots `docs/validation/screenshots/mobile-paused-dialogue.png` and `mobile-resumed-dialogue.png` were inspected. No new layout, font or palette was introduced. Screen-reader, physical-device, native zoom, forced-colors and animation-panel checks remain unperformed. Original coin-scene screenshots and color measurements below are retained evidence from the accepted round, not new measurements in this revision.

Complete for the two reported findings and available local checks. Live backend activation and hosting/domain ownership remain external requirements already documented below; this revision does not publish a new project.

## Delivery and scope

The existing game was upgraded in place. `dist/` is a generated, complete static export with relative runtime assets. Guest play works without configuration. Supabase client, migration, access rules, economic validation and global board are implemented; **live activation remains deferred to the owner**, because the project URL, public key and project management access were not supplied. The blank configuration intentionally disables cloud features with explicit UI copy. No replacement project, seeded global leaderboard, domain reservation or publication was made.

The original GitHub HEAD was accessible and matched checkout commit `6fe0476cf3c4da8a61321e06312aac3b9b1815d9`. A byte comparison against that source confirmed unchanged original sprite definitions, tile map, collision movement, environment drawing and background/parallax functions. Original favicon and share SVG are unchanged; a PNG copy of the share SVG was added. Existing package manifest and lockfile are unchanged.

Choices where the brief left details open: deeper maps reuse the original forest; boss time counts active frames; vest is cosmetic; all purchased skills stack from map start; Ricochet bounces off terrain once; grenade burning lasts eight seconds; default chestnuts do 25 damage and stomps 50; leaderboard score is lifetime verified points (100 regular / 500 boss / 1,000 map). The original retry screen remains, and Try again rebuilds the current map rather than restoring a lantern checkpoint.

## Requirement coverage

| Requirement | Implementation and verification | Limit |
| --- | --- | --- |
| MetaMask, Ethereum Mainnet, connect only, guest play | EIP-6963 discovery, legacy fallback, mobile link, chain switch, account/network events, disconnect and strict four-method allowlist; provider-fixture browser tests | No real wallet grant or physical wallet app used |
| Player profile and global Top 100 | Validated name, anonymous Auth session, SQL profile and sorted public Top 100 RPC; browser-to-database bridge and 110-profile limit test | Owner must activate the real Supabase project |
| 30% weapon drops, 30/30/40 split | 100,000 quantile distribution test; server-generated loot; gun 20, sword 50, grenade 5 per second tested in game and PostgreSQL | Random play samples need not have exactly that distribution |
| 30 regular enemies and one boss per map, around 60 seconds | Original 12 positions retained plus 18; boss absent at frame 3599, waiting at 3600 | Active play time, not wall-clock time while paused |
| 100/500 HP, +20% per map | Shared rules and independent SQL formula; 100/500, 120/600, later tier tests | Values round up |
| No healing; one-hit death; current-map restart | Failed shield/contact and falls end run; retry reconstructs all enemies and boss; lanterns supply shells | Retry is the existing explicit action |
| SQK per defeated enemy, collection and persistence | Exactly 31 coin drops including boss; pickup and reload; pending-outbox/retry; duplicate and post-death claims rejected | Guest saves depend on browser storage; cloud access depends on its Auth session |
| Large readable gold SQK coin | 42×36 art, centered 34×14 pixel lettering, separated weapon/ammo drops; viewed in actual canvas at 390 and 1440 | Non-integer mobile pixel scaling follows the original game |
| Marketplace and skills | All ten catalogue entries; prices checked against SQL; ownership, insufficient credit, equip, recoloring, stacking, piercing and one bounce tested | Skills start on a fresh map; temporary drops reset on death |
| Supabase persistence and server validation | Private schema, RLS, auth identity, locked purchases, causal damage/claims, replay protection, SQL-derived points | Event validation is not authoritative movement/position simulation or bot prevention |
| Preserve source/game and build both trees | Original source blocks compared; production build, syntax/export checks, additional JS typecheck, engine/SQL/browser tests | Exact mid-map position is not resumed after reload |
| Requested domain | Unsupported public DNS ending explained with alternatives in README | No DNS/ENS ownership or alias changes performed |

## Executed checks

All listed passing checks were run after the final runtime source changes.

| Command / method | Actual result |
| --- | --- |
| `npm run build` | Exit 0; 12 runtime files; `dist/` 173,566 bytes |
| `npm run check` | Exit 0; six scripts parse, metadata/relative paths/45 static element references checked, all 12 export files match source |
| `npm run typecheck` | Exit 0; the unchanged package's alias performs the same static checks |
| TypeScript 5.9.3 `tsc -p jsconfig.json` | Exit 0; actual `checkJs` on five added JS modules and their declaration file. Original engine checked by syntax and execution, not claimed fully typed |
| `node scripts/test.mjs` | Exit 0; **32** dependency-free game/save checks |
| `node supabase/tests/validation.mjs` with PGlite 0.5.15 | Exit 0; **43** checks on the actual migration/RPCs in PostgreSQL 18.6 |
| `node supabase/tests/frontend.mjs` with PGlite 0.5.15 | Exit 0; **9** engine/save-client/SQL regressions, including same-frame wall impacts, eight burn ticks and retry/reload |
| `node scripts/validate-browser.mjs` with installed Playwright, PGlite and axe paths | Exit 0; **28** Chromium interaction checks, including real client → local HTTP bridge → actual PostgreSQL functions |
| `node .imd/reads/skills/design-critic/scripts/taste.mjs --out test/scratch/taste` using installed Playwright and browser locations | Exit 0; **16/16** checks passed at 320, 390 and 1440, plus reduced motion |
| Axe 4.14.0, WCAG A/AA tags through 2.2 | **0 violations** on entry, profile, marketplace, paused dialogue, no-wallet sheet and database-backed leaderboard; contrast and label cases returned for manual review |
| Controlled coin scene and computed-color inspection | Actual 358×214.8 and 960×576 canvases inspected; profile hint contrast **11.76:1**, purchase error **5.81:1** |

In the original round, the managed browser could not launch, while installed Playwright Chromium provided the successful rendered checks. This revision again used installed Playwright Chromium. WebKit was attempted through default discovery but its runtime was unavailable. Safari is therefore **not verified**. No substitute screenshots or passes are claimed for it.

The final browser tests include: first-screen Start, invalid and valid names, focus restoration, all marketplace entries and unaffordable purchases, sticky Close after scrolling, honest unavailable rankings, MetaMask mobile opening link, original intro/basket dialogue, keyboard movement/jump/attack/shield/swap, pause/resume, pointer controls, reload, 320/390/768/1440 reflow, 200% text enlargement and reduced motion. They also cover wrong-chain recovery, rejection, reconnect without a new prompt, account changes, cloud pending/reload/retry, exactly-once coin credit, updated on-screen profile values, leaderboard failure/retry, server-priced purchase and persisted cosmetics. The equipped chestnut's actual canvas pixels were checked as RGB `242,196,91`.

PostgreSQL tests exercise denied direct table updates, profile isolation, unauthenticated calls, unknown/unaffordable items, unowned cosmetics, locked maps, fabricated score events, live-enemy coin claims, missing/expired/repeated attacks, cooldowns, ammunition, early boss hits, grenade tick limits, duplicate acknowledgements/claims, terminal death, completion, all 31 legitimate kills, tier unlock and public Top 100 ordering/limit. Auth roles/session identity in that isolated engine are fixtures; this is not a live Supabase Auth test.

## Better Interface review

The pinned workflow and core principles of accessibility, layout, writing, typography, colors and UI were read and applied while building. The final source is documented in DESIGN.md. Deliberate original game art/animations and the brief's uppercase coin lettering take priority over general styling preferences.

| Domain | Coverage | Unperformed or limited |
| --- | --- | --- |
| Accessibility | Native buttons/form/dialog/table semantics; labels, inline errors, disabled/pending state; keyboard flow, Escape and opener focus; visible focus screenshot; >=44px entry controls; axe on six surfaces | No screen-reader session, physical touch device or full WCAG compliance claim; axe manual-review items remain |
| Layout | Actual screenshots and overflow assertions at 320, 390, 768, 1440; first 390 screen includes product and action; enlarged text and scrollable dialogs; Close reachable at shop bottom | Native browser 200% zoom and RTL mirror not tested; no localized variant requested |
| Writing | Accurate guest/cloud/pending states, prices/effects, recoverable errors next to item/name, verb actions, no fake global data, directions beside controls | Live-service operator errors not exercised against a real project |
| Typography | Two stacks/weights, four entry sizes per width, descending title hierarchy, 16px inputs, wrapping, tabular numbers; coin lettering viewed at both sizes | Native font substitutions vary by platform; no custom font download is intended |
| Colors | Existing semantic tokens retained; rendered solid pairs measured; probe passes its measured pairs; errors have text/ARIA cues | Probe leaves eight canvas/image text boxes unmeasured; axe also returns contrast cases for manual review. No all-background contrast certification |
| UI | Hover/focus/active/disabled/loading/empty/error/retry/success states; existing inset outlines and radii; sticky dialog Close; reduced-motion styles; game pauses behind menus | No physical wallet app, WebKit, forced-colors session or animation-panel slow playback |

### Findings and corrections

| Severity | Source and evidence | Change and recheck |
| --- | --- | --- |
| Medium | `src/styles.css:553`, `.controls`: rendered 200% text widened a 390px page to 455px | Shrinkable definition-list tracks and wrapping. Recheck: width 390, menus reachable |
| Medium | `src/styles.css:634`, touch groups: first mobile screenshot stretched arrow buttons across several action rows | Align groups to start; content-sized action columns. New mobile screenshot has discrete 48px controls |
| Medium | `src/ui.js:13`, save subscription: first retry screenshot showed old 0/0 profile stats beside successful cloud save | Refresh stats/status from notifications without rebuilding the name field. Rechecked both DOM values (1 SQK / 100 points) and screenshot |
| Medium | `src/game.js:237`, wardrobe: initial purchase implementation did not recolor thrown/held shells | Cache equipped palette; apply to projectiles and shield. Canvas RGB check and persisted-equip browser checks pass |
| Medium | `src/game.js:1086`, sword lifetime: the initial slash was removed before rendering | Keep its visual for eight frames but permit one collision evaluation. Damage and lifetime source/engine paths rechecked |
| Medium | `src/game.js:246` and `:870`, SQK: mobile review found small glyphs and overlapping secondary drops | 5×7 bold glyphs at 2× scale; 42×36 coin; move weapon/ammo drops apart. Actual mobile/desktop scene re-inspected |
| Medium | `src/ui.js:81`, purchase error: a shared error at the top would be offscreen after buying a lower item | Stable item-level alert with `aria-describedby`. Browser unaffordable-purchase and axe checks pass |
| Low | `src/styles.css:670`, long marketplace: Close could scroll away with content | Sticky header; browser scroll-to-bottom verifies Close remains in viewport |
| Low | `src/game.js:1722`, burning visual: source placed floor-impact flames below the grass baseline | Clamp visible baseline to the impact surface. Damage/tick/area checks remain passing |

No confirmed blocking source findings remain from these checks. Scope limits are not presented as passes. The close glyph's descriptive accessible name was reviewed as an icon-only control; automatic label matching does not establish screen-reader behavior. No further design changes were made beyond the assigned game/player systems.

## Evidence and delivery integrity

Retained screenshots are under `docs/validation/screenshots/`; review result data is `docs/validation/results.json`. The coin scenes use a controlled test drop in the real canvas; they are visual fixtures, not a claim that a live global score was earned. Test state hooks are injected into isolated VM or intercepted browser responses and never copied into the production export.

Detailed temporary evidence originally lives under `test/scratch/taste/` and `test/scratch/browser-checks/`; that directory is deliberately excluded from delivery. Source, runtime assets, SQL, tests and documentation are retained. No package cache, `node_modules`, dependency archive, registry mirror or submodule is part of the delivery. No ignore file was changed. Protected configuration/dependency paths were checked for changes and are untouched. The final bundle byte total is recorded in `docs/validation/results.json`.

Repository implementation and available local checks are complete. Live Supabase activation, host alias/ownership configuration, real wallet/device validation and Safari validation remain outstanding as described above. The unsupported `squeek.hamster` DNS request and compatible alias options are documented in README; the existing project is preserved.
