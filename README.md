# Squeek · The Lost Alice

An update to the existing dependency-free HTML/CSS/JavaScript adventure. The pixel art, four maps, combat, weapons, audio, marketplace, inventory and verified Supabase wallet integration are retained.

This revision changes Lifetime Score to a server-enforced personal best, replaces the floating movement origin with direct finger tracking, and removes the old browser-save warning and its two buttons from Profile. The complete static site is in `dist/`; all asset URLs are relative.

**Release status:** implemented and checked locally. The original production project responds to Auth, leaderboard, status and replay requests, but still reports migration **010**. This release requires **011** and the updated replay function. No production SQL, function deployment, real wallet signature or physical-phone test was performed. Do not release this export over the old backend. See [current validation and limitations](artifacts/validation.md), [production probe](artifacts/validation/production.json), and [safe rollout](supabase/PERSONAL_BEST.md).

## Install, rebuild and preview

Use Node.js 18 or newer. The original package manifest and lockfile are unchanged. There are no frontend runtime dependencies and no build-time secrets or environment substitutions.

```sh
npm ci
npm run build
npm run preview
```

Preview at `http://localhost:4173/` and stop with Ctrl+C. `npm run build` copies the existing 18 runtime files from `src/` to `dist/`. Serve that directory as static files; it also works at a gateway subpath. The deployed wallet flow requires the real HTTPS origin to be permitted by Supabase Auth. Guest play works without signing in and is not saved after a refresh.

After changing `src/game.js` or `src/rules.js`, regenerate the server package **before** validation/build:

```sh
node scripts/prepare-replay.mjs
npm run build
```

Keep `supabase/functions/_shared/engine-v1.js`: it is the exact previous replay engine required for existing saved checkpoints and cached browser versions, not an unnecessary packaging artifact.

For a later live gameplay upgrade, retain every engine pinned by an active run and add a new server-owned version before rollout. Regeneration alone is not a safe replacement for a deployed engine with pending saves.

## What changed

- **Personal best:** `hf_private.settle_lifetime()` now stores `max(existing personal best, this run’s paid score)` in the existing `profiles.total_score` field. It no longer adds different runs together. Existing checkpoint saves can raise a best during play; ending a run does not pay it twice. One run is the existing map-run UUID, matching Current Map Score. SQK and produce growth retain their separate cumulative behavior. Both leaderboard RPCs read the same canonical best.
- **Historical scores:** one transactional migration, `011_personal_best.sql`, reconstructs the maximum from stored server runs, retains every prior aggregate in a private audit table, and preserves wallet links, names, balances, purchases, run data and legacy safeguards. Missing positive run history aborts the entire migration instead of inventing or erasing a score. [Backend details](supabase/PERSONAL_BEST.md).
- **Direct touch:** touch anywhere in the left half, then drag. Finger displacement moves a target by the corresponding rendered distance; Chang follows it at the existing bounded movement speed and settles when the finger rests. There is no fixed origin or circular control limit. Releasing brakes horizontal drift and restores the platformer’s normal gravity. Jump, hurt and stomp impulses retain priority. Tiles and world bounds remain authoritative.
- **Independent actions:** the movement finger and right-side buttons have separate ownership/capture. Pointer cancellation, capture loss, blur, pause and rotation clear input. Older browsers have a Touch Events fallback. Attack, Jump, weapon slots and contextual actions stay on the right. Desktop keyboard and mouse actions remain.
- **Clean Profile:** the older-browser warning, Retry cloud save and Download older browser save controls, their export handler, and their exclusive snapshot state are gone. Stored browser data is neither imported nor deleted. Profile retains name saving, verified wallet, Lifetime Score, SQK, inventory counts and legitimate run-conflict recovery. Automatic saves continue; manual **Sync progress** is in wallet details.

## Local checks

`npm run typecheck` is the existing syntax/export integrity check. The additional TypeScript check below checks all eight JavaScript runtime scripts and the shared declarations using `tsc --noEmit`.

Install test-only tools in scratch; none are site dependencies or submitted caches:

```sh
npm install --prefix test/scratch --no-audit --no-fund --package-lock=false --ignore-scripts @electric-sql/pglite@0.3.14 typescript@5.9.3 playwright@1.56.1 @axe-core/playwright@4.11.0
PLAYWRIGHT_BROWSERS_PATH="$PWD/test/scratch/browsers" node test/scratch/node_modules/playwright/cli.js install chromium
npm run build
npm run typecheck
node scripts/typecheck-major.mjs
node scripts/prepare-replay.mjs --check
node supabase/tests/personal-best.mjs
node supabase/tests/context-replay.mjs
node supabase/tests/replay-http.mjs
node scripts/test-direct-touch.mjs
node scripts/test-major.mjs
node scripts/test-major-audio.mjs
node scripts/test-weapon-labels.mjs
PLAYWRIGHT_BROWSERS_PATH="$PWD/test/scratch/browsers" node scripts/validate-context-replay.mjs
PLAYWRIGHT_BROWSERS_PATH="$PWD/test/scratch/browsers" node scripts/validate-touch.mjs
```

The SQL/browser suites use disposable PostgreSQL and explicit Auth, provider and transport fixtures. The browser runs the actual `dist/` under `/squeek/`; touch movement, controls, event recording, replay, SQL settlement and Profile interactions use the shipped implementation. Fixtures never ship as a backend fallback or fake leaderboard.

Actual local results on 2026-11-06: production build **18 files / 276,238 bytes**, source/export checks and all eight runtime typechecks passed; **13 personal-best**, **4 context-replay**, **5 Edge HTTP**, **11 direct-touch**, **17 gameplay**, **4 audio**, **4 weapon-label**, **28 cloud/Profile/browser** and **54 touch/layout/browser** groups passed. The pinned taste probe passed **16/16**. The read-only production probe exited **1** because the live service still reports 010 rather than the required 011.

Results, screenshots and the six-domain Better Interface review are recorded in [artifacts/validation.md](artifacts/validation.md). Physical touchscreen hardware, real wallet signatures, production writes, independent database-connection contention, screen readers and browser-native zoom remain unverified. Chromium touch input is not a physical-phone result. WebKit could not launch because required system libraries are absent; the supplied browser tool could not launch its missing Chrome executable. Bounded local Playwright Chromium supplied rendered verification.

For a read-only production readiness report:

```sh
node scripts/verify-production.mjs --out test/scratch/production.json
```

Exit 1 currently means migration 011 / engine 2 is not deployed; it does not mean the existing project is unreachable. Public responses do not grant database administration access or prove authenticated player persistence. Older documents and screenshots under `docs/validation/` and the historical portion of `VALIDATION.md` describe earlier revisions.

## Source and delivery

- `src/game.js`, `src/rules.js`: existing game, sprites, maps, physics and shared rules.
- `src/save.js`, `src/wallet.js`: durable wallet queues, verified login and synchronization.
- `src/ui.js`, `src/index.html`, `src/styles.css`: Profile, rankings, controls and original visual system.
- `supabase/migrations/011_personal_best.sql`: required personal-best upgrade; migrations 001–010 remain unchanged.
- `supabase/functions/`: trusted replay server code. Server credentials stay in the function runtime, never in `src/` or `dist/`.
- `DESIGN.md`: implemented tokens, components and responsive behavior.
- `dist/`: complete production export, including local share art, favicon and install icons.

No original build configuration, manifest, lockfile, dependency tree, domain configuration or deployed token was changed. The only ignore change whitelists the exact validation report/JSON/screenshot paths with an explicit **768 KiB total path budget**; other artifacts remain ignored. Installation tools and generated browser/test caches stay only in scratch and are excluded from the submission. Keep the finished `dist/` alongside source and the existing lockfile.
