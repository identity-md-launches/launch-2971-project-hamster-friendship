# Validation and design review

Local implementation/export is complete. Chromium verification passes. Cross-browser verification remains incomplete because WebKit could not launch; live Supabase checks await the owner's URL/public key and application of migration 002. Nothing was fabricated to fill those gaps. These are worker-side results, not independent certification.

## Scope and assumptions

The existing dependency-free canvas game was upgraded, not replaced. Review covered the exported entry, play/dialogue/pause/retry/victory, original equipment/profile/rankings/wallet, GUILD, Audio, SQK Dice and Badge Exchange. The original one-hit rule is preserved; numerical enemy damage still compounds. Small/large sizes are selected independently of type. The authored forest is replayed in random seasons and deeper tiers. Skill badge milestones are maps 1/3/5; contribution issuance is an owner-verified administrative action. Dice correct predictions and lifetime wins count the same successful outcomes and never reset.

All browser testing served the real `dist/` beneath `/preview/`. Tests needing reliable threshold/encounter states use explicitly labeled temporary fixtures, injected into intercepted responses or browser storage. Production source has no such hooks, demo leaderboard or seeded player data. Local Auth/HTTP fixtures bridge to the actual PostgreSQL functions; they do not prove a live service works.

## Actual checks

| Command / suite | Result |
| --- | --- |
| `npm run build` | Passed; 14 runtime files, 222,899 bytes |
| `npm run check` and original `npm run typecheck` alias | Passed; syntax, metadata, 51 referenced element IDs, relative URLs and source/export equality |
| `tsc --noEmit -p jsconfig.json` | Passed; actual compiler, TypeScript 7.0.2 |
| Extended `tsc --noEmit --allowJs --checkJs --strict false ...` command in README | Passed; additionally checks the new audio module |
| `node scripts/test.mjs` | 32 passed: original physics/story, damage/weapons/burns, shield, pause/dialogue, retry, inventory, map/coin changes |
| `node scripts/test-upgrade.mjs` | 16 passed: exact drop boundary, random type/HP/damage, all 36 Dice pairs, byte rejection sampling, fire/shield, chest, legacy saves, milestones, exchanges/reload |
| `node supabase/tests/validation.mjs <pglite>` | 43 passed against unchanged historical migration 001 |
| `node supabase/tests/upgrade.mjs <pglite>` | 24 passed against populated 001 → 002, old-page reload gate, permissions, idempotence and a full legal v3 map replay |
| `node supabase/tests/frontend.mjs <pglite>` | 9 passed: actual old-backend client/engine, burn timing, durable retry/reload, SQK and purchases |
| `node supabase/tests/upgrade-client.mjs <pglite>` | 7 passed: actual upgraded engine/client/SQL; offline coin/reload; lost replies after committed Dice/exchange; ordered balance snapshots, failed-restart recovery |
| `node scripts/validate-browser.mjs <playwright> <pglite> '' <axe>` | 28 Chromium checks passed, including original wallet and browser-to-PostgreSQL flows |
| `node scripts/validate-upgrade.mjs <playwright> <axe>` | 16 Chromium checks passed, including real audio signal/mutes, two pointers, landscape, Dice UI, exchange UI, concurrent-tab rewards/purchase, all seasons and victory |
| Pinned `taste.mjs --out test/scratch/taste` | 16/16 passed against the final export |

Functional checks total 175; design probe checks are a separate 16. Optional tools were Playwright 1.64.1, PGlite 0.5.15 and axe-core 4.14.0. Temporary installations and browser downloads are excluded from the delivery. Structured counts, probe output, source hashes and axe summaries are in `docs/validation/results.json`.

The provided browser tool failed with “Socket path too long”. A temporary local Playwright Chromium installation then performed the rendered checks and screenshots. WebKit was downloaded and attempted but could not launch its runtime; it was never recorded as a pass. An early probe overlapped a rebuild and saw a temporary asset 404; rebuilding first and rerunning the probe resolved it. Final independent previews reported no missing local assets or uncaught script errors.

## Requirement coverage

| Requested area | Implemented / verified evidence |
| --- | --- |
| 20% SQK drops, size, names | Shared rule quantiles yield exactly 20,000/100,000; server coin masks reject ineligible claims. 36×31 coin, 1.15× hamster, opaque name label in game.js. |
| Ranged/random/scaled monsters | Four randomized types, two sizes, 50/100/300 bases and HP/damage compounding. Ember fire is blocked from the front and fatal unblocked under existing rules. |
| Mobile and keyboard | Captured circular joystick, independent action pointers, keyboard regression passes. 390 portrait plus 844×390 and 667×375 landscape. |
| Audio | Real Web Audio analyser detects generated music/effects; separate gains/volume/mutes produce signal then silence and persist after reload. Movement/attack/jump/item/coin/quest/chest/level/victory hooks present; victory and level hooks exercised. No subjective listening test claimed. |
| GUILD | Four native collapsible chapters, expanded trigger state, keyboard/focus return, all controls/rules/tutorials and original story. |
| Seasons | Four distinct canvas captures; birds, sunlight, leaves and snow source/render paths. Reduced-motion behavior inspected. |
| Compact/responsive UI | First 390 screen contains the product and main action. No overflow at 320/390/768/1440; menu checks at 200% text; landscape controls fit. |
| Map victory | Required heading, winking hamster with readable SQK, finite animation, victory sound hook, statistics, next-map 360 boss HP and scaled regular HP. |
| Fair optional Dice | Rejection sampling maps the 252 accepted byte values equally to six faces, separate draws per die. Enumeration yields HIGH 15, LOW 15, DRAW 6 out of 36. No SQK mutation. |
| Dice achievements | Thresholds 20/50/100, persistent counts/wins; visible Bronze threshold UI; all three real server milestones tested. Source and SQL reject exchange. |
| Badge Exchange | Separate sources; fixed 20/50/120 credits; actual UI exchange and focus return; SQL replays, two-tab local exchange and coin/purchase concurrency pass. Owner-only contribution issuance tested. |
| Branding/domain | Desired concepts remain explicit. Existing website address retained. No domain, DNS, hosting or on-chain change attempted; replacement verification not applicable to this unchanged configuration. |
| Account/backend preservation | Stable storage/session/outbox keys, retained unknown guest fields, populated migration tests, old active HP/coin entitlement, explicit old-page reload gate preventing old-policy new runs, purchase/cosmetic/map preservation, old/new client retry tests. |
| Static export and metadata | Final dist/index.html and all 14 local runtime files; relative asset URLs, favicon, description, og:title and 1200×630 og:image. Existing package manifest/lockfile unchanged. |
| Source/design/docs | Existing source extended; DESIGN.md extracts final tokens, components and responsive behavior; README includes rebuild and actual test results. |

## Better Interface: all six domains

| Domain | Coverage | Evidence and limits |
| --- | --- | --- |
| Accessibility | Checked: source + Chromium | Native dialog/details/radio/range/button semantics; field labels, error announcements, keyboard focus/return, pointer cancellation, reduced motion. Axe reported zero violations on the inspected entry/profile/shop/wallet/pause/GUILD/Audio/Dice/badge/victory surfaces. Screen-reader sessions and physical touch devices not verified. Canvas remains a visual, timed game, not a screen-reader gameplay mode. |
| Layout | Checked: source + Chromium | Entry, forms, market, help, Dice/audio, portrait/landscape, widths 320/390/768/1440 and 200% text. No final horizontal overflow. Native browser zoom, other locales/RTL and physical safe-area behavior not verified. |
| Writing | Checked: source + rendered panels | Existing cozy voice retained. Controls/rules moved into GUILD; real empty/error/retry states distinguish local/cloud data and legacy backend. Badge sources, no-staking Dice rules and concept-only domains are explicit. Singular/plural Dice labels corrected. |
| Typography | Checked: source + Chromium | Existing system stacks, two weights and four active entry sizes at most. Full names/amounts wrap or fit. Probe passes size/tracking checks. Exact platform fallback face not established. |
| Colors | Checked: source + rendered probe/axe | Existing hex/semantic palette retained. Measured entry pairs pass; examples in DESIGN.md. Eight media-overlay text boxes and per-pixel canvas/art contrast were not measured. No alternate theme exists to review. |
| UI | Checked: source + Chromium | Hover/focus/pressed/disabled/pending/error/success states; native focus trapping; 150ms named transitions, 0.96 press scale; finite Dice/victory motion and reduced-motion guards. Browser Animations-panel replay at 10% speed was not performed. |

Review idea: the existing chestnut forest is the visual center, with compact bark-and-amber controls and seasonal life around it. No unrelated visual redesign, extra font or marketing hero was added. Guide notices/licenses remain in `docs/licenses/better-interface.txt`.

## Findings, fixes and rechecks

| Severity / source | Observed issue | Fix and recheck |
| --- | --- | --- |
| High — `src/styles.css:789` | At 844 landscape, the touchpad's inherited 100% width plus absolute side insets made the document 860px wide. At 667×375 the joystick extended below the viewport. | Automatic width, separate safe-area insets, compact overlay actions and a scene height budget of 184px. Both landscape sizes now pass bounding-box and overflow checks; screenshot inspected. |
| High — `src/ui.js:85` | Axe reported `label-content-name-mismatch` on the exchange button: the longer accessible name omitted its exact visible “Exchange · 20 SQK” label. | Accessible name now starts with that full visible label, followed by source/tier. Badge audit re-run: zero violations. Actual exchange removes it, updates SQK and restores useful focus. |
| High — `src/save.js:35`, `src/save.js:155` | Source review found guest reward writes could replace a profile updated in another tab. Delayed cloud response acceptance also needed one ordering path. | Guest mutations share a fresh-read Web Lock when available; cloud RPC acceptance is serialized at `src/save.js:79`. Concurrent two-tab badge exchange and a coin reward alongside another tab's purchase preserve both balance/inventory. No-lock fallback concurrency remains unverified. |
| Medium — `src/game.js:1750` | Decorative tree parallax still followed the camera under reduced motion. | Background camera offset becomes zero when reduced motion is enabled; existing particle/shake guards and new CSS motion guards remain. Source branch and reduced-motion render inspected. |

A final screenshot review also found two long character labels overlapping in the non-playable title illustration. Those ornamental title labels were removed; the active player keeps the opaque name label above Chang (`src/game.js:1739`). The named-player gameplay capture and final entry were rechecked.

A final stability review found that a failed cloud restart had already ended the old run, but its old pause screen could still resume that unsaved world (`src/game.js:675`). The error path now ends that world and offers Retry; the actual client/SQL test verifies the old run cannot resume and retry retains SQK/name.

An intentionally uppercase GUILD label and SQK/HIGH/LOW/DRAW branding/rules follow the brief. Lettering within game/SVG art is not HTML typography. Compact landscape utilities are 32px high, above the 24px minimum; primary touch combat controls remain at least 44px.

## Evidence and limitations

Current screenshots under `docs/validation/screenshots/` show entry, play, desktop, GUILD, Audio, Dice, Badge Exchange, landscape and victory. Badge/victory/season encounter screenshots use explicitly injected test fixtures; they are interface evidence, not live-user balances or a real leaderboard. The game exports no seeded fixture data.

Outstanding: real Supabase configuration/activation and live smoke tests, WebKit/Safari, physical phones/notches/audio output, screen readers, native zoom and long-duration play across many maps. Server/backend unit tests ran with the real SQL locally, not a hosted project. No load/security audit or claim of complete accessibility certification is made. Publication and future domain verification belong to the existing hosting process; no replacement address, deployment or external verification was fabricated.

## Packaging path budget

Temporary verification packages, browser downloads and scratch outputs were removed after copying the required evidence. Deleting the tool-managed root cache encountered a read-only `lock`; its contents were not read or included in the delivery. The narrow `/.cache/` ignore rule has an explicit submission budget of **0 files / 0 bytes**. No source, runtime asset, lockfile, documentation or required export path is covered by that rule.
