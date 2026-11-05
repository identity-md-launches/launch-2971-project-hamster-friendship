# Squeek validation

## Production integration · 2026-11-05

**Incomplete in production.** The supplied original-project public URL/key are configured in source and export. Auth connectivity returned 200; service, player, progress and lifetime-ranking RPCs returned 404/PGRST202. No production migration, authenticated record write, score save, refresh recovery or real wallet signature is claimed. Actual tables and policies remain uninspected. See the [complete production report](docs/SUPABASE_REPORT.md), [raw HTTP results](docs/validation/supabase-production.json) and [exact SQL Editor procedure](supabase/SQL_EDITOR.md).

The implementation and local validation below preserve the existing game and scoring rules. Their passing results do not establish production persistence. The current production-integration review and test record follows; older sections after it are historical evidence from earlier assignments.

### Commands and evidence from this assignment

The production build contains **18 complete runtime files / 264,738 bytes**, using relative asset URLs. Source, existing root lockfile and `dist/` remain together. No runtime dependency, vendored package, build-setting change, submodule or ignore-file change was introduced. Test dependencies and browser downloads are confined to disposable `test/scratch/`, which is excluded from delivery by the assignment. The artifact directory is ignored by repository tooling, so delivery copies of reports/evidence are retained under `docs/`; the SQL generator creates its operator-selected output under `artifacts/` when used.

| Command | Actual result and limits |
| --- | --- |
| `npm run build` | Passed after the final runtime edit; 18 files / 264,738 bytes. |
| `npm run check` | Passed: all runtime scripts parse, metadata/relative assets and 69 referenced element IDs checked, every export file equals its source. |
| `node scripts/typecheck-major.mjs` | Passed on all eight runtime scripts and shared declarations with TypeScript 5.9.3, `allowJs/checkJs/noEmit`. Added an optional declaration for the feature-detected orientation-lock API. The root `typecheck` alias alone is only a syntax/export check. |
| `node scripts/verify-production.mjs --out docs/validation/supabase-production.json` | **Exit 1, expected unresolved production failure:** Auth 200; service/profile/progress/lifetime RPCs 404; private-schema exposure 406; catalog discovery 401. No successful production record write. |
| `node supabase/tests/production-handoff.mjs` | 9 local PostgreSQL cases passed: inspect/upgrade every starting version 0–7, preserve existing records, verify permissions/checkpoints, reject replay and incorrect starting versions. No production SQL executed. |
| `node supabase/tests/connection-state.mjs` | 4 passed: startup failure, no signing before migration readiness, retry recovery without invented authentication, later incompatible/offline failure. HTTP/wallet fixtures only. |
| `node scripts/test-major.mjs` | 16 game-rule/engine checks passed. Guest-board test now explicitly supplies empty configuration instead of assuming the production config is empty. |
| `node scripts/test-major-audio.mjs` | 4 passed. |
| `node supabase/tests/major.mjs` | 11 local PostgreSQL checks passed: populated migration preservation, canonical wallets, permanent checkpoints/replay, ownership/RLS/grants, global Top 100 and legacy recovery. |
| `node supabase/tests/major-client.mjs` | 11 passed: durable queues, lost acknowledgements, refresh, wallet partitioning, signature gating and public-only key protection. Auth/HTTP/signatures are fixtures. |
| `node supabase/tests/major-engine.mjs` | 3 passed: actual engine events and four-map progression through SQL, retained permanent fields, no submitted score total. |
| `node supabase/tests/concurrent-runs.mjs` | 6 passed: independent-device runs, offline retry, replay, preserved historical records, legacy behavior and validators. Local single-connection PostgreSQL, not production contention testing. |
| `node scripts/validate-major.mjs` | 17 Chromium checks passed at `/squeek/`: actual play/story/keyboard/pause, profile/audio/wardrobe, error states, axe entry/profile, mobile/desktop reflow, landscape controls, 200% root text and RTL. No JS or missing local-resource failures. Expected remote network failures are separate. |
| `node scripts/validate-major-cloud.mjs` | 8 passed with actual local SQL and explicit wallet/Auth/HTTP fixtures: saved gameplay, board refresh/retry, purchase/equip, refresh and second-device restoration. Not hosted verification. |
| `node scripts/validate-revision.mjs` | 8 passed: touch/PC weapon pickup, keyboard/pointer focus, offline two-device event preservation, retry, reload and SQL leaderboard. Fixtures only for wallet/Auth/transport. |
| `node scripts/validate-integration.mjs --relay` | 7 passed on the final export: actual production 404 consumed by the website, readiness never claims saved, 320/390/1440 layout, retry enabled after failure, no fake board rows, wallet focus return and explicitly temporary guest name after refresh. Node forwards real HTTP; it does not simulate a database. |
| Pinned `taste.mjs --out test/scratch/taste` | 16/16 passed after the final source edit: render, layout, targets, resolved contrast, casing/tracking, headings, type scale/faces, glyphs, copy/repetition, surfaces, motion and sharing metadata. |

Browser commands use `PLAYWRIGHT_BROWSERS_PATH="$PWD/test/scratch/browsers"`. The probe also uses `IMD_PLAYWRIGHT="$PWD/test/scratch/node_modules/playwright/index.mjs"`. Reproduction setup is in README. The raw live endpoint report is [supabase-production.json](docs/validation/supabase-production.json); the worker's local results and the probe checks are retained in [integration-results.json](docs/validation/integration-results.json). These are worker observations, not independent certification.

### Better Interface review: six domains

Scope: the existing entry, Profile, wallet sign-in/connection states, retry, leaderboard and their shared dialog controls. Preserve the warm bark/cream/amber interface, serif titles and original pixel-art game. One visual idea carries the page: a compact set of readable controls over Chang's forest adventure. No unrelated redesign or additional wallet stack was introduced.

| Domain | Coverage | Evidence and explicit limits |
| --- | --- | --- |
| Accessibility | Checked | Native controls/dialogs; field label and associated validation; polite startup status; keyboard Tab/Enter/Escape and focus return; original visible focus; axe A/AA checks on entry/profile; all five first-screen controls at least 44px. Screen-reader sessions, native-device assistive tech and forced-colors rendering were not performed. |
| Layout | Checked | Actual screenshots and overflow checks at 320/390/1440, landscape 844×390, 200% root text and RTL mirror. Start and the game are visible on the first 390-wide screen. Fixed dialog intrinsic-width overflow; profile input stays in bounds. Root text enlargement is not browser-native zoom; translated locales/native zoom are not verified. |
| Writing | Checked | Configured/ready/authenticated are distinct; guests remain explicitly unsaved; missing records show a retryable error; no seeded live board. Replaced raw SQL/cache details with a plain cloud-setup message and put schema/version instructions in owner docs. Repeat retry failures use a short outcome instead of duplicating the full status. |
| Typography | Checked | Existing five-token scale, two system-font families and weights 400/700 retained. Probe measures three sizes at 390, four at desktop; labels/numbers wrap without clipping. Mobile input retains 16px baseline. No external font download or new font was introduced. |
| Colors | Checked | Reused existing semantic roles and opaque dialog surfaces. Probe passes measured solid-background pairs; 23 text boxes over canvas/images/alpha layers are not measured. Declared sRGB token-pair calculations: text/surface 15.61:1, muted/surface 11.76:1, error/surface 5.81:1, focus/surface 12.94:1, dark text/amber primary 9.31:1. These calculations do not certify composited canvas pixels. Only the existing dark interface applies. |
| UI | Checked | Pending retry disables its action and restores it on failure; buttons/dialog identity and focus-return behavior retained. Actual loading/error/retry/temporary-name states exercised; successful authenticated flows separately exercised with SQL fixtures. No added motion; reduced-motion probe passed. Animations-panel playback at 10% speed and physical Safari were not performed. |

### Findings, corrections and rechecks

| Finding | Source and reproduction | Correction and recheck |
| --- | --- | --- |
| High: configuration could imply usable persistence before a backend check | `src/save.js:17`, `src/ui.js:29`; supplied keys exist but the actual service RPC returns 404. | Explicit backend state, startup check and signed-login gating; cloud remains false until an authenticated matching wallet profile is returned. Local connection tests plus actual 404 browser replay passed. |
| Medium: raw database errors gave players no clear recovery | `src/save.js:35`, `src/wallet.js:100`; request the unavailable service/board. | Plain setup/connection error, unsaved guest wording and explicit connection retry; detailed PGRST response retained in the operator report. Final real-response screenshots show an error with zero invented ranking rows. |
| Medium: a failed Profile connection retry could reject without a handled result | `src/ui.js:69`; retry while the actual backend is missing. | Catch the failure, display a readable result and re-enable the action. Browser retry check passed with no page errors. |
| Medium: long dialog action widened the profile form at enlarged text | `src/styles.css:317`, `src/styles.css:321`, `src/styles.css:323`; 390px, 200% root text, RTL, open Profile. | Complete action labels wrap; dialog/form grid tracks use `minmax(0,1fr)`. The previously failing input-bounds assertion now passes in the 17-case browser suite. |
| Medium: asynchronous entry status lacked a live region | `src/index.html:80`; startup changes checking to unavailable. | Existing status paragraph now uses `role=status`/polite live updates. Native semantics and automated entry audit pass; screen-reader announcement behavior is not claimed. |
| Low: retry duplicated the same long error paragraph | `src/ui.js:72`; click connection retry after a setup failure. | Retain the detailed status once, show a short retry outcome beneath the button. Rechecked on the final phone failure state. |

Screenshots retained for delivery: [390-wide entry](docs/validation/screenshots/supabase-entry-390.png), [desktop entry](docs/validation/screenshots/supabase-entry-1440.png), [Profile failure/retry](docs/validation/screenshots/supabase-profile-unavailable.png), [leaderboard unavailable](docs/validation/screenshots/supabase-leaderboard-unavailable.png), [keyboard focus after closing the wallet](docs/validation/screenshots/supabase-wallet-focus.png). The last screenshot was inspected: the cream focus perimeter is visible around Connect on its opaque dark surface. The real-HTTP browser run recorded the expected remote 404 console errors separately and had zero unexpected console errors. `DESIGN.md` records final source tokens, components and responsive behavior, with existing MIT/Apache design-guide attribution retained.

### Remaining limitations and completion

The provided browser tool could not initialize (Chromium socket-path limit); local Playwright Chromium provided the rendered checks above. WebKit could not launch because required system libraries are absent, so Safari interaction checks are unperformed. Direct sandbox Chromium requests returned `ERR_EMPTY_RESPONSE`; Node reached production. The transparent test relay preserves actual production responses and is not a runtime fallback shipped to users.

No real wallet key/session was supplied or invented, no Auth identity was seeded in production, and no production table/RLS inspection or mutation was possible. Real signature verification, authenticated writes, score save/refresh/cross-device restoration and live record comparison remain blocked. SQL fixtures validate server-side event ownership/timing/damage/ammunition/replay rules; browser physics/collisions and independent PostgreSQL-connection contention are outside that evidence. A conservative sum of the complete modified/new delivery files is below 1 MiB, within the 8 MiB budget; necessary runtime assets remain complete and protected paths are unchanged. **The website/export and local checks are delivered; production Supabase integration remains incomplete.** Follow `supabase/SQL_EDITOR.md` using authorized access and real wallets to finish the mandatory tests.

## Historical validation from prior revisions

## Revision validation

Rechecked 2026-11-05 against the accepted tree and then the corrected `dist/` export. **All three reported defects reproduced and are fixed locally.** Hosted Supabase remains unconfigured/unverified: neither its original public URL/key nor migration/Auth access is supplied. No production database, domain, token, wallet provider implementation or installed migration was changed. This is complete for the three code findings; production activation still requires the original project's owner.

### Reproduction, correction and recheck

| Finding | Accepted-baseline reproduction | Correction and verified outcome |
| --- | --- | --- |
| `9faa5c15…` queued score lost when another device starts | Actual engine/save and migrations 001–006: `trail-0`, frame 90, sequence 1 stayed pending; another start abandoned the run; retry produced conflict; recovery kept 1 event locally and SQL total stayed 0. | `supabase/migrations/007_concurrent_runs.sql:8` permits independent v6 active runs; v6 starts end no run; legacy starts protect v6 runs. Shared-profile locks, `hf_progress` and its ownership/time/sequence/score checks remain unchanged. SQL tests compare validator definitions byte for byte. Two actual 390×844 Chromium contexts with isolated storage earn one fruit each: retry credits SQL lifetime/produce totals of 2, zero pending/recovery events, no conflict, one wallet profile. Replay and reload keep exactly 2. |
| `fe77bac5…` offered PICK UP does nothing | Chromium 844×390 touch: player `(96,146)`, weapon `(120,146)`, horizontal centers 24 apart; button visible/enabled; press left weapons `['shell']` and drop untaken. | `src/game.js:1325` uses `nearbyWeapon()` for manual weapon eligibility without the narrower produce overlap. Tap and PC E both collect the offered gun without another step. Outer/boundary and nearest-of-two tests pass; automatic produce/coin range is unchanged. |
| `1260c357…` slot click captures jump/attack keys | Chromium 1440×900: mouse-selected `slot-1` remained focused; Space/Enter toggled the slot, y stayed 146 and attacks stayed 0. | `src/game.js:640` returns pointer activation to `focusStage()`. Browser recheck: canvas focused, Space moves the character upward, Enter creates one gun shot and ammo becomes 99. Keyboard Enter/Space keeps slot focus and toggles without firing; Tab moves away. Touch slot focus also passes. |

Migration 007 changes functions/index metadata only. Populated preservation snapshots and complete pre-existing run records match before/after. No historical row is reset or reopened. It narrows the unique active-run index to legacy rules and retains legacy settlement while preventing legacy starts from abandoning v6 queues. New ranked login requires schema **7**, rules **6**, so an unpatched 006 backend fails before requesting a signature. Old terminal conflicts remain explicitly recoverable; they are not automatically credited. Apply only missing migrations in the original project, as documented in `supabase/README.md`.

### Commands and actual final results

| Command | Result |
| --- | --- |
| `npm run build` / `npm run check` / `npm run typecheck` | Passed; 18 runtime files, 261,421 bytes; relative assets/metadata, syntax, 69 element IDs and byte-for-byte source/export checks pass. The existing `typecheck` alias is a syntax/export check. |
| `node scripts/typecheck-major.mjs` | Passed using TypeScript **7.0.2** on all eight runtime JavaScript files and shared declarations with the existing `allowJs/checkJs/noEmit` mode. |
| `node scripts/test-major.mjs` | 16 named checks passed, including two added pickup eligibility/nearest-item regressions. |
| `node scripts/test-major-audio.mjs` | 4 passed. |
| `node supabase/tests/major.mjs` | 11 passed against migrations 001–007, including populated upgrades, retained old queues, identity, RLS/grants, validator and Top 100. |
| `node supabase/tests/major-client.mjs` | 11 passed, including old terminal recovery and rejection of the unpatched schema before signing. |
| `node supabase/tests/major-engine.mjs` | 3 passed; actual engine/save/SQL across all four maps and permanent progress. |
| `node supabase/tests/concurrent-runs.mjs` | 6 added checks passed: populated 006→007 preservation, independent devices, lost replies/replay, another run finishing plus refresh, legacy compatibility, and validation/ledger/leaderboard integrity. |
| `node scripts/validate-major.mjs` | 17 Chromium checks passed, including source export at `/squeek/`, primary play/menu/wallet controls, axe entry/profile checks, 320/390/1440 reflow, 844×390 touch and 200% root text/RTL. No observed JS/local resource errors. |
| `node scripts/validate-major-cloud.mjs` | 8 passed with actual SQL and fixture wallet/Auth/HTTP. Existing signed-login integration, board refresh/error/retry, purchases, reconnect and second device retained. |
| `node scripts/validate-revision.mjs` | 8 added Chromium checks passed for manual pickup, pointer/keyboard focus, two devices' offline queue, retry, reload, SQL leaderboard and resource errors. Intentional offline progress requests are aborted by the fixture. |
| `node supabase/tests/verified-wallet.mjs` / `node supabase/tests/lifetime.mjs` | 8 / 27 historical schema checks passed. Their old single-run semantics are tested only through migration 005. |
| Pinned `taste.mjs --out test/scratch/taste` | **16/16 passed** at 320/390/1440 and reduced motion. Module/browser paths point to scratch tools. |

**119 named checks passed**, plus taste, build/export checks and the actual JavaScript typecheck. Browser commands use `PLAYWRIGHT_BROWSERS_PATH="$PWD/test/scratch/browsers"`; the probe also uses `IMD_PLAYWRIGHT="$PWD/test/scratch/node_modules/playwright/index.mjs"`. Exact dependency/tool setup and commands are in README. The regression harness uses PGlite 0.3.14, Playwright 1.56.1 with Chromium 141.0.7390.37, and axe 4.11.0; no tool is a shipped runtime dependency. Machine-readable revision results are in `docs/validation/revision-results.json`; the older `major-results.json` records the earlier implementation, not this revision.

### Better Interface coverage for this revision

| Domain | Checked scope and outcome | Limitations |
| --- | --- | --- |
| Accessibility | Native pickup/slot buttons retain names, states and keyboard behavior. Actual pointer→canvas and keyboard→slot focus paths checked. Screenshot confirms visible slot focus; existing entry/profile axe checks pass. | No manual screen reader, physical touch device or complete nonvisual game audit. |
| Layout | Source layout/tokens retained. Rendered first screen at 390 includes product, Start and Connect; taste finds no overflow/overlap at 320/390/1440. Touch landscape controls/pickup remain distinct. Existing enlarged-text/RTL check passes. | No native browser 200% zoom or translated-locale audit; root text enlargement is documented separately. |
| Writing | PICK UP and E offer exactly the action they perform. Cloud/pending/error/recovery copy remains explicit. Schema-migration error now names required 007. | No added copy or interface redesign outside these findings. |
| Typography | Existing type scale/families unchanged; probe reports two repeated sizes at each width and two families/weights. Profile and pickup text inspected in screenshots. | Platform font fallback differences untested. |
| Colors | Existing tokens/selected/focus cues unchanged. Probe passes resolved solid-background contrast pairs. | **23** text boxes over canvas/images/alpha backgrounds excluded from numerical contrast measurement; no ratios invented. |
| UI | Prompt/collection eligibility is shared; selected slot state and pointer/keyboard feedback tested; menus/cloud retries work. Existing DOM reduced-motion probe passes. | No 10%-speed Animations-panel inspection, human difficulty/audio assessment or native Safari run. |

Viewed the final 390 entry, touch pickup, keyboard slot and two-device profile screenshots. Evidence is under `docs/validation/screenshots/revision-*`. Gameplay screenshots inject deterministic state/position/time access; artwork and rendering come from the actual engine. Cloud evidence uses a disposable SQL database and fixture Auth/transport, never live player data. No hooks or fixtures are present in `dist/`.

The assigned browser MCP could not initialize: “Socket directory path is too long (127 bytes); set PWTEST_SOCKETS_DIR to a shorter location.” Local Playwright Chromium was the working fallback. WebKit downloaded but could not launch because GTK4, GStreamer and related system libraries are missing. No Safari, hosted signature verification, hosted migration/RLS or independent-connection database contention result is claimed. Existing production configuration limitations remain as documented below.

Revision files: `src/game.js`, `src/save.js`, the migration comment in `src/config.js`, and corresponding three `dist/` files; additive migration 007; existing major SQL/client/harness tests and owner verification SQL; pickup engine tests; new concurrent SQL/engine and revision browser tests; README, WORKPLAN, DESIGN, this validation record, revision evidence and `.imd-responses.json`. Migrations 001–006, root dependencies/build config, ignore rules and domain settings remain unchanged. The final path/byte audit is recorded in `revision-results.json`.

---

## Earlier accepted implementation record

The following is the previous implementation's retained evidence. Its counts, schema version and environment observations describe that earlier run; the revision results above supersede them where applicable.

Checked 2026-11-05. These are worker-run self-checks, not independent certification or proof of a production deployment. The assignment's verifier checks paths/bytes only.

**The original Supabase project remains unconfigured and unverified.** Both supplied public settings are empty; no original project identifier or database access was provided. The implemented migration/client were tested against real disposable PostgreSQL, with explicit Auth, wallet and HTTP fixtures. No production record, Auth setting, domain or token was changed. The site honestly offers unsaved guest play until its existing owner configuration is set.

## Actual results

| Check | Actual result |
| --- | --- |
| `npm run build` | Pass; 18 complete runtime files in `dist/`, 261,184 bytes. |
| `npm run check` | Pass; all scripts parse, 69 referenced element IDs exist, metadata/relative URLs valid and all 18 source/export files match byte for byte. |
| `npm run typecheck` | Pass; this existing alias invokes the same syntax/export checker, not TypeScript. |
| `node scripts/typecheck-major.mjs` | Pass; actual TypeScript 7.0.2 checks all eight runtime JavaScript files and shared declarations with `allowJs`, `checkJs`, `noEmit`, `strict:false` (matching the existing JS mode). No existing build config changed. |
| `node scripts/test-major.mjs` | 14 named engine/rule checks passed. |
| `node scripts/test-major-audio.mjs` | 4 audio graph/settings checks passed. |
| `node supabase/tests/major.mjs` | 11 populated-upgrade, identity, security, checkpoint and Top 100 checks passed, including delivered owner verification SQL. |
| `node supabase/tests/major-client.mjs` | 11 actual save-client checks passed, including lost replies, offline refresh, stale-tab acknowledgements, wallet changes, signing cancellation and secret/backend rejection. |
| `node supabase/tests/major-engine.mjs` | 3 engine→save client→SQL regressions passed, including all four legal map completions and page-exit victory settlement. |
| `node scripts/validate-major.mjs` | 17 Chromium checks passed against the real export served below `/squeek/`. Entry/profile automated WCAG A/AA audit: zero reported violations. No observed JavaScript or local resource failures. |
| `node scripts/validate-major-cloud.mjs` | 8 Chromium wallet/cloud UI checks passed against the actual SQL functions with fixture wallet/Auth/HTTP adapters. Includes a timed leaderboard update from another accepted score, retained rows on failure, purchase/equip, reload and another device. |
| `node supabase/tests/verified-wallet.mjs` | 8 historical migration/identity regression checks passed. |
| `node supabase/tests/lifetime.mjs` | 27 historical lifetime/permission regression checks passed. These intentionally establish the old 005 behavior, not the new checkpoint semantics. |
| Pinned taste probe | 16/16 passed at 320, 390 and 1440 widths, including reduced-motion mode. |
| Source/path/byte audit | See the final audit record in `docs/validation/major-results.json`. Root dependency/build configuration is unchanged; no submodule or generated dependency/cache directory is added to the submission. |

**103 named checks passed**, plus the 16 taste checks, build/export checks and actual JavaScript typecheck. “Named check” means a test group, sometimes containing several assertions; it is not a count of independently certified requirements. Tool versions and individual results are in [major-results.json](docs/validation/major-results.json). The older `docs/validation/results.json` and unprefixed screenshots belong to previous project work and are not current-run evidence.

Build/checks ran after the data/client changes, the combined maps/collectibles engine changes, mobile/audio polish, and corrections. The final source was rebuilt after the last change. Root `package.json`, lockfile, JS configuration and existing build/check scripts stayed unchanged. Installation and exact reproduction commands are in the README; all extra tools/browser downloads reside in disposable `test/scratch/`.

## Requirement coverage

| Requirement from the brief | Implemented/tested behavior | Remaining limit |
| --- | --- | --- |
| “Supabase must become the permanent source of truth” / save each score / lifetime score | Only the authenticated Supabase RPC path supplies ranked profiles and totals. New validated score deltas checkpoint atomically into the permanent profile and ledger. Actual SQL/client/engine tests pass. | Cannot be operational on the hosted site until the **original** project URL/public key, migration and Auth settings are configured. No substitute backend. |
| “Top 100 leaderboard” / update rankings when scores change | SQL descending lifetime ordering, deterministic ties, 100 cap, verified profiles only; public reader omits wallet addresses. Rendered table updates on refresh/polling, retains rows on failure and retries. | Hosted records/rankings not inspected. |
| Save wallet addresses / reconnect same wallet / no duplicates | Supabase Web3 verified nested claims → canonical lowercase wallet → unique original profile. Populated fixtures, casing/alias identities, concurrent queued opens and two-browser reconnect checks pass. | Auth identities/providers are fixtures; actual independent-connection contention and real wallet signatures are unverified. |
| Signature authentication without transactions | Domain/URI, chain, nonce, issued time and expiry in `personal_sign`; Web3 token endpoint; explicit Sign in action; sessions silently restore. The recorded wallet method set contains no transaction/approval request. | Supabase cryptographic verification and hosted redirect configuration require the original project. |
| RLS / no service role exposure / no arbitrary browser score writes | All private tables keep RLS and revoked browser grants. Public mutation RPCs check verified ownership and validate events, timing, HP, ammunition and one-time loot/sources. Unauthorized totals/direct writes/foreign runs are rejected in SQL tests. Secret-format and normal/URL-safe service-role JWTs fail closed. | Physics/position truth remains client simulated; this is not a fully authoritative anti-bot game server. Empty public configuration is not a secret. |
| Preserve existing data / safely migrate local data | Historical fingerprints, balances, inventory, links and totals match over populated upgrades. Version-4 queues and settlement remain valid. Legacy cloud Auth tickets attach existing server records; an existing wallet profile takes priority. Untrusted browser totals are retained/exportable. | Unverified browser-only totals are **not** automatically credited; owner review is required. No production preservation comparison was possible. |
| Save progress after sessions end | Eager score/pickup flush, durable per-run/wallet outbox, sequence merge, exit keepalive, page-exit victory completion and explicit ended-run recovery. Newer events survive a stale acknowledgement. | A device must reconnect to upload its unacknowledged queue; clearing that device's storage can lose unsent events. Exact scene position/per-map ammunition restart with a map; permanent score, SQK, growth, ownership and unlocks restore. |
| Four maps, correct bosses and attacks | 60/90/120/150 active-second boss thresholds; Cockroach/Penguin/Dragon/Shark; all forest regulars fly; other environments shoot ice/fire/water. Distinct geometry/materials, slippery ice, aerial currents, boss patterns and artwork. | Timers were advanced in deterministic tests, not a human seven-minute playthrough. Durations mean time **until boss appearance**; combat can extend a map. Human difficulty balance remains unassessed. |
| Automatic map progression / remove fragment | Boss-only version-6 completion, automatic next map after the short defeat animation, Shark ending. Remaining enemies/hazards/falls cannot cancel a victory. No fragment entity/interaction remains. | None observed locally. |
| Fruit/vegetables auto-collected; weapons manual | Five produce sprites; proximity pickup on both inputs. E or touch PICK UP claims only the nearest weapon. Rendered touch button and weapon slots tested. | Real touchscreen ergonomics not physically tested. |
| Growth every 20 produce points | Boundary checks at 19/20/40, progressive visual scale, persistent new produce counter; original 12×14 collision dimensions remain stable. | Growth is deliberately cosmetic/foot-anchored and approaches a bounded scale; historical produce counts are not fabricated from old scores. |
| Coin 30% smaller and readable | Exact 36×31 → 25.2×21.7 logical-pixel world artwork; horizontal SQK sprite, no rotation. | Coin lettering is canvas art; no OCR/readability metric is claimed. |
| Larger/spaced mobile controls | Larger 104/92/68px controls, narrow 88/76/64px variants, 48px+ slots, non-overlap checks, pointer ownership and cancellation. | Native iPhone/Safari/fullscreen behavior unverified. |
| Distinct sounds / bounded overlap / preserve settings | Four distinct waveform/frequency/envelope signatures, rate limits, compressor/master gain, 24-voice ceiling; original volume/mute key and values preserved. | Graph tests use a Web Audio fixture. No speaker-level measurement or subjective listening assessment. |
| Usable static website / metadata / source/lockfile/export/docs | Entry/start, keyboard play, touch, menus, wardrobe, profile, audio, wallet path and SQL board/purchases tested; all assets relative/local. Root title/favicon/description/og:title/og:image present. Source, original lockfile, export, README and DESIGN included. | Backend activation is an owner configuration step; nothing was published by this job. |

## Better Interface review

The pinned guide was applied while implementing, with the original visual identity and stack retained. The visual idea is the original warm pixel forest adventure traveling through four differently authored environments, with compact bark-and-amber controls over the scene.

| Domain | Source and browser coverage | Limits |
| --- | --- | --- |
| Accessibility | Native buttons/dialogs, labeled name/range/mute controls, associated errors, polite map/status announcements, focus ring, Escape, Tab through Skip/game/Connect and restored wallet focus. Axe WCAG A/AA entry/profile audit reports no violations. Touch hit areas tested. | No manual screen-reader walk, native mobile assistive-tech audit or full game nonvisual alternative. Axe success is not a complete accessibility certification. |
| Layout | Actual 320/390/1440 views, phone portrait and 844×390 landscape, non-overlapping controls, full subpath export, 200% root text with an RTL mirror. Screens now follow measured chrome height. | No translated locale/pseudo-localization or native browser toolbar/keyboard testing. The RTL check is layout only; physical game controls remain left/right. |
| Writing | Clear Start/Continue/Play again actions, nearby pickup directions, honest guest/cloud/error/recovery states; moved Connect directions corrected. No fake players/global local-storage board. | Original GUILD/SQK names and explicitly requested PICK UP casing are intentional. |
| Typography | Existing serif/system stacks and five-token scale retained; measured first-screen sizes are below the six-size bar. Tables/HUD use tabular numbers and wrap full values. Enlarged-text screenshot inspected after repair. | No intended local font is downloaded; system fallback rendering varies by OS. |
| Colors | Existing semantic tokens reused; opaque HUD/status backgrounds; probe contrast check passes for resolvable pairs. Forest/glacier/caldera/reef art inspected in actual screenshots. | The probe excludes 24 text boxes over canvas/images/alpha surfaces from numeric contrast measurement. No invented ratio is reported for them. |
| UI | Native modal loading/empty/error/success states, retained ranking table on retry, clear selected/disabled slots, restrained existing motion, larger isolated touch actions. Production art/screenshots inspected. | WebKit/Safari and 10%-speed animation-panel inspection were not performed. Canvas gameplay remains dynamic; the probe's reduced-motion result concerns its measured DOM/CSS checks. |

### Fixed findings

1. **Layout: enlarged chrome overlapped the main action.** `src/styles.css:504`, `.overlay { inset-block-start: calc(var(--chrome-height, 140px) + 8px) ... }`; `src/game.js:1524`, `fitChrome()`. Before: at 390 wide with 200% root text and RTL, the fixed screen padding put the rotate hint over Start. Change: observe chrome height, give overlays independent scroll space below it and hide the redundant title rotate hint. Why: primary controls must remain readable/reachable as text grows. Reproduction: 390×844, root font-size 200%, RTL. Evidence: the repaired `major-large-text-rtl.png` and a bounding-box assertion that the Start action begins below chrome. Status: fixed/rechecked.
2. **Data: a stale tab could discard newer unsent events.** `src/save.js:70`, `mergedRun()`. Before: wallet-array writes/retirement could replace another tab's newer queue. Change: per-run storage, monotonic acknowledgement merge and retirement only through acknowledged/explicitly archived sequences. Why: permanent saves must not lose scores under concurrent updates. Reproduction: hold one tab's reply, append another event, release stale acknowledgement, reload. Evidence: named save-client regression retains sequence 2 and credits exactly once. Status: fixed/rechecked.
3. **Writing/focus: Connect moved but directions and focus return pointed to Menu.** `src/ui.js:40` and `src/ui.js:134` now direct players to Connect above; `src/wallet.js:155` returns focus to `button`. Before: the old menu placement was referenced after exposing Connect on the first screen. Change: correct directions, dialog relationship and native keyboard return. Why: a dialog must return focus to its actual trigger and instructions must match visible controls. Evidence: Tab→Connect→Enter→Escape test and current profile/market copy. Status: fixed/rechecked.
4. **Gameplay: an already won boss fight could be cancelled during its animation.** `src/game.js:1351`, the `boss.state === 'defeated'` world-update branch; `src/game.js:1092`, `finishRun()`. Before: remaining attacks/falling still ran during the 70-frame celebration. Change: suspend hazards, keep pickup/celebration updates, queue completion on page exit and settle once before automatic travel. Why: boss defeat must advance without another obstacle. Evidence: lingering-projectile/fall test, repeated pagehide test, engine→SQL victory-on-exit check and rendered progression. Status: fixed/rechecked.

The first 390-wide screenshot and the final enlarged-text repair were manually inspected. The design probe's final 16 checks all pass: render, layout, targets, contrast (limited as above), casing, tracking, eyebrows, type sizes/faces, glyphs, slogans, repetition, copy budget, chrome, motion and sharing. Source documentation is in `DESIGN.md`; upstream license notices remain in `docs/licenses/better-interface.txt`.

## Evidence and limitations

Current screenshots are prefixed `major-` under [docs/validation/screenshots](docs/validation/screenshots): phone/desktop entry, each of four maps and bosses, weapon pickup, growth, enlarged RTL text and the SQL-backed leaderboard. Map/growth/pickup screenshots use test-only position/state access injected through Playwright; the artwork/rendering is the real production engine. The cloud screenshot uses clearly documented synthetic Auth/player fixtures in a disposable SQL database, not live players. No test access hook or fixture data is included in `dist/`.

The provided browser MCP launcher crashed with SIGTRAP before navigation; its screenshot tool did not work. The fallback locally installed Playwright Chromium did run and produced the documented actual interactions/screenshots. WebKit downloaded but could not launch because GTK4, GStreamer and related system libraries are missing; no Safari result is claimed. The original hosted CID's config requests through dweb.link/ipfs.io failed in the web tool. Prior documentation of a successful live request is not current-run evidence. Only the supplied repository configuration was confirmed empty.

No real wallet signature, hosted Supabase request, production RLS inspection/migration, independent multi-connection PostgreSQL contention test, real mobile hardware session, physical audio assessment or deployment took place. The exact remaining production dependency is the original Supabase public URL/key and owner configuration/migration access. The existing `src/config.js` is the owner-settable route for those values, so this job delivers usable code/export and setup instructions instead of inventing a project or stopping again for the same missing input.

## Modified files and database changes

- Application source: `src/config.js`, `src/rules.js`, `src/save.js`, `src/game.js`, `src/audio.js`, `src/index.html`, `src/styles.css`, `src/ui.js`, `src/types.d.ts`; `src/wallet.js` only changes focus return after the existing Connect control's move. `src/viewport.js` and domain configuration remain unchanged.
- Static export: corresponding changed files in `dist/`; the complete 18-file export and unchanged local runtime art/manifest remain present.
- Database: new `supabase/migrations/006_four_worlds.sql` and read-only `supabase/verify_major.sql`; migrations 001–005 are unchanged. Adds `produce_points`, checkpoints version-6 lifetime deltas/ledger, adds the v6 start RPC, extends compatible progress validation and advertises schema/rules 6. Applied only to local disposable databases.
- Test source: `scripts/major-fixture.mjs`, `scripts/typecheck-major.mjs`, `scripts/test-major.mjs`, `scripts/test-major-audio.mjs`, `scripts/validate-major.mjs`, `scripts/validate-major-cloud.mjs`, `supabase/tests/major-harness.mjs`, `supabase/tests/major.mjs`, `supabase/tests/major-client.mjs`, `supabase/tests/major-engine.mjs`.
- Documentation/evidence: `WORKPLAN.md`, `README.md`, `DESIGN.md`, `VALIDATION.md`, `supabase/README.md`, `docs/validation/major-results.json` and prefixed current screenshots. No ignore rule was changed. No frontend dependency, registry mirror, cache, archive or submodule is added to the submission.
