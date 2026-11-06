# Squeek revision validation — 2026-11-06

**Implementation and local checks are complete. Overall acceptance is incomplete:** no physical touchscreen was available, and production migration/function deployment could not be performed with the supplied public key. The original production project is reachable and reports migration 010; this export requires 011 and compatible engine-2 health. No production player data was changed and no site publication command was run.

This is the worker's record, not independent certification. Current machine-readable results are in [validation/summary.json](validation/summary.json). Earlier records in the root VALIDATION.md and docs/validation are historical.

## Scope and implementation

The existing vanilla-JavaScript game, canvas engine, sprites, four maps, combat, economics, audio, inventory, wallet authentication and Supabase project are retained. No framework or dependency replacement was introduced. `dist/` contains all 18 runtime files with relative URLs. The original package manifest/lockfile and build configuration remain.

A run means the existing map-run UUID, matching Current Map Score. Existing live checkpoint saving is preserved: a paid, validated run can establish a best during play. Lifetime Score is now `max(previous best, that run's paid score)`, never the sum of different runs. Lower/tied runs leave the best unchanged. Produce growth still accumulates its paid deltas; SQK has its existing independent settlement. Both leaderboard readers use the same canonical profile best.

011 reconstructs the historical maximum from server runs/ledgers, including original rules-2/3 HP/completion records. It archives prior cumulative totals in a private RLS-protected audit. A positive aggregate with incomplete run history aborts the complete transaction; it does not invent a best or erase it. The only one-time decrease is the audited cumulative-to-best correction. The no-decrease/no-delete retention trigger is re-enabled before commit. Wallet links, identity, balances, inventory, runs, queues and backend legacy safeguards remain.

Direct touch anchors a target to Chang at touch-down and maps finger displacement through the actual rendered canvas scale. A normalized vector follows that target, slows near it and stops driving when the finger rests. There is no fixed origin or circular movement boundary. Release brakes horizontal drift and restores normal platformer gravity; jump, hurt/stomp impulses, collisions and world limits remain. One movement finger owns capture; right actions have independent ownership. Touch Events provide a fallback when Pointer Events are absent. State transitions expose controls synchronously, including the first drag after dialogue.

The Profile warning and both requested buttons are absent from source/export and rendered Profile, even with the old browser key populated. Their exclusive snapshot/export UI state is removed. The browser record is untouched. Verified wallet information, personal best, name saving, pending saves and legitimate run-conflict recovery remain. Periodic/online saves remain, and manual Sync progress is available in wallet details.

## Files and functions changed

| Files | Functions / purpose |
| --- | --- |
| `src/game.js` | `newPlayer`, `clearInput`, action-button down/up handlers, `beginMovement`, `moveTouch`, `updateTouchVector`, `releaseMovement`, `touchEvents`, `updatePlayer`, `tick`: direct tracking, capture/fallback, bounded movement, release braking, replayable input and immediate control visibility |
| `src/save.js` | `requireBackend`, `beginMap`, `record`, `leaderboard`, `flush` status text, `snapshot`: require best-score mode and compatible engines, explicitly start engine 2, guest visit-only max, remove legacy UI detection/export and update sync guidance; durable saving remains |
| `src/ui.js` | `summary`, `profilePanel`, `leaderboardPanel`: clean Profile, full verified address, best-score copy and remove obsolete handlers/buttons |
| `src/wallet.js` | `renderOptions`: working manual Sync progress action alongside the existing connection flow |
| `src/styles.css` | `.touch-movement` gesture protection and landscape story/pickup positions, keeping the left half free |
| `src/index.html`, `src/types.d.ts`, `src/config.js` | Touch/best instructions, remove obsolete UI API fields, update migration comment; original public credentials unchanged |
| `supabase/migrations/011_personal_best.sql` | Historical backfill/audit; replace `settle_lifetime`, both ranking readers, replay context and service status; add authenticated engine-2 start overload; preserve old one-argument start and all existing migrations |
| `supabase/functions/_shared/replay.js`, `functions/hf-replay/index.ts` | `replayEngine`, `createReplay`, `validateReplay`, Edge handler: server-owned engine selection, correct hash validation/commit, engine-2 health with engine-1 support |
| `supabase/functions/_shared/engine.js`, `engine-v1.js` | Generated current game and the exact previous engine needed by existing checkpoints/cached clients; both are required server runtime source |
| `scripts/prepare-replay.mjs`, `prepare-supabase.mjs` | Replay tick bridge avoids recomputing browser targets; exact guarded missing suffix through 011 |
| `supabase/inspect_production.sql`, `verify_production.sql`, `verify_major.sql`, `verify_personal_best.sql` | Inspect audit metadata; verify current service, grants/RLS and exact best-score invariant independently of the displayed UI |
| Test scripts and fixtures | Current SQL/replay, direct-touch, Profile, cloud/browser, mouse/keyboard, compatibility and preservation checks; the existing `test-touch.mjs` command delegates to the current direct-touch suite |
| `dist/`, `README.md`, `DESIGN.md`, Supabase docs and this report | Complete production export, reproducible build/check instructions, implemented design system, coordinated release and evidence |

Historical migrations 001–010, runtime art/icons, shared combat/environment rules, audio implementation, viewport implementation, domain configuration and original build/dependency files are unchanged.

## Actual checks

All local commands below exited 0. Test counts are named assertion groups, not certification of every possible state. Test-only tools were installed inside scratch and are not shipped.

| Command | Actual result |
| --- | --- |
| `npm run build` | 18 files, 276,238 bytes; complete static export |
| `npm run typecheck` | All scripts parse, required metadata/relative URLs present, 69 DOM references checked, every exported runtime file byte-identical to source |
| `node scripts/typecheck-major.mjs` | TypeScript `--noEmit --allowJs --checkJs` passes for all 8 runtime scripts and shared declarations |
| Edge-entry `tsc --noEmit` | Passes with minimal scratch Deno API declarations; not a real Supabase/Deno deployment check |
| `node scripts/prepare-replay.mjs --check` | Current generated engine exactly matches current game/rules source |
| `node supabase/tests/personal-best.mjs` | **13 groups:** 5000/8000/6000 → 8000, lower/tied/higher runs, deferred payments, no duplicate credit, preserved identity/SQK/inventory/history, exact best invariant, retained old engine hashes/cached starts, forged/foreign claims rejected, reload/reconnect, guarded generated upgrade and complete rollback on missing history |
| `node supabase/tests/context-replay.mjs` | **4 groups:** actual context handler, offline queue, exact-once reward, another-device recovery and ranked restart |
| `node supabase/tests/replay-http.mjs` | **5 groups:** actual Edge entry, health/CORS/Auth boundary, injection/body limits, current engine commit, rejected reward and retained engine-1 hash |
| `node scripts/test-direct-touch.mjs` / compatibility `test-touch.mjs` | **11 groups:** arbitrary origins, 8 directions, normalization, finger-rest stopping, long/reversed drag, rendered scale, release/cancel/lost capture, ownership, interruptions, existing impulses, boundaries and Touch Events fallback |
| `node scripts/test-major.mjs` | **17 groups:** four maps/bosses/enemies, progression, pickups, every weapon's damage/ammo/sounds, growth/collision stability, coins and guest best/legacy retention |
| `node scripts/test-major-audio.mjs` | **4 groups:** original settings, weapon envelopes, bounded overlap and mute persistence |
| `node scripts/test-weapon-labels.mjs` | **4 groups:** initial, empty, owned/selected and depleted labels |
| `node scripts/validate-context-replay.mjs` | **28 groups:** actual export, real replay/SQL, clean Profile with old browser data, cloud name saves, native Chromium touch plus simultaneous attack, points restored after refresh, board lower/higher refresh, wallet Sync progress/disconnect/reconnect/refresh, large-text Profile and no JS/local-asset/replay failures |
| `node scripts/validate-touch.mjs` | **54 groups:** product/Start, responsive actions, motion, native multi-touch/capture and right-release independence, resting/released finger, rotation, desktop keys/mouse, focus, GUILD large text, Axe checks and no JS/missing-local-asset failures |
| Pinned taste probe | **16/16**, on the final export |

Browser suites used headless Chromium 141 / Playwright 1.56.1 at a gateway-style `/squeek/` subpath. Mobile sizes were **320×568, 390×844, 768×1024, 568×320, 844×390 and 1024×768**; desktop was **1440×900**. Chromium native CDP touch is browser-level touch input, **not physical hardware**. The successful cloud path uses disposable PostgreSQL with explicit provider/Auth/session/transport fixtures and accelerated elapsed SQL time. Large score/ranking examples are clearly administrative local fixtures; the touch-to-score and basket tests separately use actual engine controls/replay. None is a production fallback or seeded public leaderboard.

Profile and GUILD were also checked with **200% root text enlargement**, including the full wallet address below the measured sticky heading at 390/1440. This is separate from browser-native zoom, which was not tested. Automated Axe A/AA checks found no violations in the inspected gameplay/Profile states; this is not full accessibility or screen-reader certification.

### Visual evidence actually inspected

- [390 first screen](validation/screenshots/entry-390.png): the existing product scene and Start adventure action are visible; the nearby touch hint explains the invisible control.
- [Desktop first screen](validation/screenshots/entry-1440.png): original scene, compact utilities and Start remain.
- [Clean Profile at 390](validation/screenshots/profile-390.png): verified local-fixture wallet, saved name, Lifetime Score and no old warning/buttons.
- [Profile with 200% root text](validation/screenshots/profile-large-text-390.png): full address wraps and remains reachable below the sticky heading.
- [Cloud touch gameplay](validation/screenshots/cloud-touch-844.png): native movement/attack with actual control replay and SQL-backed points, using explicit test identities.
- [Personal-best board](validation/screenshots/leaderboard-390.png): locally computed best after lower/higher run fixtures, not production records.

## Better Interface review

Applied the pinned guide during the changes, then reviewed the final export in all six domains. Existing pixel art, palette, fonts, compact HUD and physical left/right game geometry remain authoritative.

| Domain | Coverage and evidence | Unperformed / not applicable |
| --- | --- | --- |
| Accessibility — Checked | Native labeled form/buttons/dialogs, focus return, keyboard movement/jump/attack and mouse attack; action targets ≥44px at inspected mobile sizes; Axe gameplay/Profile audits; reduced-motion probe | No screen-reader session, physical touch, full forced-colors session or complete accessibility certification |
| Layout — Checked | Six portrait/landscape sizes, 320/390/1440 probe, no horizontal overflow, both contextual prompts clear of chrome/actions and in right half; clean Profile grid and large-text full address | No browser-native zoom or physical orientation session; physical left/right controls intentionally remain directional per the brief |
| Writing — Checked | Best-score explanations replace accumulated-score wording; directions beside Start/GUILD; sync guidance points to wallet details; removed warning is absent everywhere in source/export | No new localization scope; existing product names retained |
| Typography — Checked | Existing two families/two weights/five-token scale, natural tracking, wrapped names/address, tabular score values, 200% root-text reflow | Actual font fallback depends on installed platform fonts; no font-file-loading claim |
| Colors — Checked | Existing semantic tokens preserved; taste solid-background checks and Axe inspected states pass; screenshots inspected | **24 composited canvas/image/gradient text boxes excluded from taste contrast calculations**; no numerical contrast claim for those pixels or another theme |
| UI — Checked | Clean native Profile, stable leaderboard refresh, working Sync progress, disabled/loading form state, independent touch owners, resting/release states, immediate post-dialogue control and reduced-motion styles | No physical feel/audio assessment, WebKit rendering or 10%-speed animation-panel inspection |

### Findings, corrections and rechecks

| Severity / source | Observation and reproduction | Implemented correction / actual recheck |
| --- | --- | --- |
| High — `supabase/migrations/009_deferred_rewards.sql:55` (historical source), replacement `011_personal_best.sql:62` | Three stored runs added into one profile total; 5000/8000/6000 produced 19000 | Replace settlement with per-run maximum, audit/backfill history and retain safeguards. PostgreSQL now gives 8000, ignores lower/tied runs and accepts higher ones; tests include pending payments and denied forged totals |
| High — `src/game.js:624`, `src/game.js:633` | Previous floating origin/radius acted as a velocity stick; a resting displaced finger kept moving | Displacement-based target, viewport scale and bounded normalized steering. VM and native browser tests now settle at rest, follow all axes and release without horizontal drift; actual cloud replay accepts the same inputs |
| Medium — `src/ui.js:51`, `src/save.js` snapshot/API | Old browser record inserted a warning/download and Profile retry UI | Remove entire obsolete section, handler and exclusive state; close its grid rows naturally. Six rendered Profile sizes with a retained 99999-point browser fixture show verified score 2, no warning/buttons and unchanged browser data; cloud name save and wallet sync pass |
| Medium — `src/game.js:545` | Immediate first drag after closing dialogue could hit a still-hidden surface before the next animation frame; initial native test stayed at x=96 | Synchronize body game-state in `clearInput`. Final native test checks visibility before another frame and moves, attacks, earns a validated point and restores it after refresh |
| Medium — `src/styles.css:515` | Landscape PICK UP occupied the movement half | Place both contextual controls in the right half. Final six-size geometry checks show no prompt/chrome/action overlaps and a free left movement region |

No unresolved local first-screen/repeated design finding remains in the inspected states. This does not resolve the physical-device or production release gates.

## Production responses and release limits

The actual public-key probe exited **1**, correctly indicating the new release is not deployed. [Raw responses](validation/production.json): Auth settings 200; service 200 reporting migration **10**; Top 100 200 returning actual existing rows; replay health 200 with the original engine hash. Unauthenticated profile/progress calls return 401/42501; the private schema is unexposed (406); catalog discovery requires administration access (401). A credential-free Web3 preflight returns 400/validation_failed, which does not establish real signed login or a disabled provider.

The public key cannot apply 011 or deploy the function. No real wallet signature, authenticated production write, production refresh/reconnect, private catalog/RLS inspection, SQL migration, function deployment or site publication was performed. The new source refuses to label migration-010 cumulative values as personal bests; guest play remains usable. The old deployed game/database were not modified.

[PERSONAL_BEST.md](../supabase/PERSONAL_BEST.md) contains the concrete reviewed rollout: inspect/backup original data, deploy the compatible function with both engines, apply only the inspected missing SQL, verify preservation/RLS/best invariant, perform real-wallet and physical-touchscreen acceptance, then release `dist/` through existing hosting. If historical data is incomplete, the migration safely rolls back and requires trusted server history rather than a guessed value.

**Remaining limitations:** physical mobile hardware and Safari/WebKit are untested; WebKit could not launch because system libraries are missing. The supplied browser tool also could not launch its missing Chrome; local Playwright Chromium supplied rendered evidence. Independent PostgreSQL connections, screen readers, native zoom and physical audio remain untested. Local fixtures and public endpoint reads do not certify production behavior.

## Submission integrity

The production export and necessary backend engine packages remain complete. No dependency/cache/archive, submodule or original manifest/lockfile/build-configuration change is added. `.gitignore` narrowly whitelists the exact report, ten JSON records and six screenshots under `artifacts/`, with an explicit **786,432-byte (768 KiB) combined path budget**; other artifacts stay ignored. Test tools/browser downloads stay in scratch; scratch and pinned inputs are excluded by the task. The final changed-file byte/path audit is recorded in [bundle-audit.json](validation/bundle-audit.json), below the 8,388,608-byte limit.
