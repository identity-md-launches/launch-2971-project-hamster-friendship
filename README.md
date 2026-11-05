# Squeek · The Lost Alice

An in-place update of the existing Hamster Friendship pixel-art adventure. The original canvas engine, Chang/Alice artwork, story clues, marketplace, costumes, SQK economy, MetaMask connector, audio settings, static build and hosting name remain.

**Production credentials are configured; production persistence is incomplete.** The supplied public URL/key now identify the existing project `nhtlwcukeyhvkrjveots`. Real requests reached Auth (HTTP 200), but the app's service, player-profile, score-progress and lifetime-leaderboard RPCs returned HTTP 404/PGRST202. No production migration or authenticated player write was possible with the publishable key. The game remains playable as an explicitly unsaved guest. See the [production report](VALIDATION.md#production-integration--2026-11-05) and [exact SQL Editor handoff](supabase/SQL_EDITOR.md).

## Install, preview and rebuild

Use Node 18 or newer. The website has no runtime npm dependencies; its existing root manifest and lockfile are retained unchanged.

This is **vanilla JavaScript, HTML and CSS with a custom static-copy build**, not Vite, Next.js or React. No framework environment variables are used or configured. The two existing public runtime settings are `window.HAMSTER_CONFIG.supabaseUrl` and `window.HAMSTER_CONFIG.supabasePublishableKey` in [src/config.js](src/config.js); the production build copies them to `dist/config.js`. The supplied URL and publishable key are set there. No `.env` file is required or edited. Publishable keys are browser-safe; secret/service-role keys are rejected locally and must never be shipped.

```sh
npm ci
npm run build
npm run check
npm run preview
```

Open `http://localhost:4173/`. Stop the preview with Ctrl+C. The production build copies 18 complete runtime files from `src/` to committed `dist/`. It uses relative URLs, a relative manifest/start URL, local art/icons/share image and no runtime CDN. The export was also tested beneath `/squeek/`, without route rewrites. The existing hosting name `hamster-friendship-the-lost-alic.identitymd.eth` and domain configuration are preserved; no deployment or naming action was performed.

## What changed

| Map | Exploration timer | Boss | Gameplay and scenery |
| --- | --- | --- | --- |
| Amber Canopy | 60 s | Cockroach | Original forest; airborne moths, wasps and gnats; telegraphed swoops and a winged boss swoop/charge. |
| Frostfall Reach | 90 s | Penguin | Glacier peaks, ice crystals and shelves; slippery movement; ice shooters; fan volleys and belly slides. |
| Cinder Caldera | 120 s | Dragon | Volcanoes, basalt pillars and embers; drakes and cinder creatures; fire projectiles, flame breath and wing-assisted hops. |
| Tidal Hollow | 150 s | Shark | Coral, reef terraces and distant wrecks; aerial currents and water bursts; arcing volleys and shark rushes. |

The timers count **active exploration time until boss appearance**, preserving the game's existing timed-boss convention. Boss combat can extend a map; dialogue, pause and menus stop the exploration timer. The boss waits at the exit. Defeating it automatically starts the next map after a short defeat animation, without a metal fragment or clearing every regular enemy. Enemy/projectile hazards cannot cancel a victory during the defeat animation; exiting during it queues completion synchronously. Shark ends the four-map adventure. Existing map unlocks above four remain stored; a completed returning profile starts a new four-map adventure rather than having its record reset.

- Carrots, apples, pears, strawberries and turnips replace collectible chestnuts. Nearby produce and SQK collect automatically. Small produce scores 1, large produce 5; existing cache values are unchanged.
- Weapons always require **E** on desktop or the visible **PICK UP** button on touch. One press claims only the nearest weapon. Gun/bomb/sword slots, ammunition and purchased damage upgrades remain.
- Every 20 produce points increases Chang's visual size. Growth carries across saved maps/visits through `produce_points`, rises from scale 1.15 toward 2.05 and leaves the original 12×14 collision body and foot anchor stable. Historical scores do not invent a produce-growth history.
- In-world SQK artwork is exactly 30% smaller: 36×31 → 25.2×21.7 logical pixels. Its horizontal SQK lettering never spins.
- Touch controls have larger targets, more space and pointer ownership. The narrowest layout puts weapon slots above the joystick. Screens adapt to the measured chrome height, including 200% text; orientation/fullscreen fallbacks remain.
- Chestnut ammunition, gun, sword and bomb each have a different procedural waveform/envelope. A 24-voice ceiling, per-effect rate limits and master compression limit overlap. The original music/SFX volume and mute storage key is preserved.

## Permanent saves and identity

The browser submits ordered **events**, never a score or SQK total. Supabase validates wallet ownership, run ownership, sequence, elapsed timing, damage, ammunition, loot eligibility and one-time collectibles. All private tables keep RLS enabled with no browser table privileges. Only narrow RPCs mutate data. Canonical verified wallet addresses retain unique profile links; row/advisory locks and acknowledgement sequences prevent duplicate profiles and duplicate credits. No service-role key belongs in the website; secret-format and service-role JWT configuration are rejected before a request.

Migration 006 checkpoints validated new-run score deltas, produce progression and a per-run lifetime ledger in the same transaction. Death, completion, restart, retries and device changes cannot settle an acknowledged point twice. The Top 100 reads permanent SQL totals, recomputes ordering on every query, refreshes every 15 seconds while open and refreshes on a local saved-score change. It retains loaded rows during refresh/failure and exposes an explicit retry.

Wallet connect itself requests no transaction. **Sign in to save** separately requests a domain/URI-bound, expiring login message through `personal_sign`; Supabase Web3 Auth verifies it. Saved sessions restore without another signature. The [Supabase Web3 documentation](https://supabase.com/docs/guides/auth/auth-web3) explains the required provider and redirect URL settings. Local Auth fixtures test the application's integration, not the hosted cryptographic verification.

Pending ranked events are written before transmission, partitioned by wallet and run, merged by acknowledgement sequence across tabs and retried after refresh/online/exit. `fetch` uses keepalive for progress. A browser can still terminate networking; an unsent event requires that original browser's retained queue to reconnect. A run ended on another device keeps rejected events in a downloadable recovery record and offers Restart from cloud profile. A different device can retrieve only progress already acknowledged by Supabase.

Revision: migration **007** allows independent version-6 runs for the same wallet. Starting a run on another device no longer ends the first device's run or rejects its queued rewards. Each run closes through its own ordered death/finish event; profile locking and the existing event validator checkpoint both devices' valid points exactly once. Legacy starts also leave version-6 runs intact. Previously ended runs are not automatically reopened or credited from unverified recovery files. The frontend requires schema **7**, game rules **6**, before signed login/ranked play.

The revision also fixes the offered weapon pickup range on PC and mobile. Pointer selection of a weapon slot returns focus to the canvas so Space jumps and Enter fires; deliberate keyboard activation retains native slot focus and toggling. See the [revision validation record](VALIDATION.md#revision-validation) and [review responses](.imd-responses.json).

Existing legacy cloud profiles can be linked through their authenticated, expiring server ticket. An existing verified wallet profile always wins. Older **unverified browser-only totals** are left untouched and offered as a download in Profile for owner review; they cannot overwrite or mint a verified score. Guests remain memory-only and unranked. See [Supabase migration and security details](supabase/README.md).

## Production database handoff

The existing backend and migrations are retained. Startup now checks backend readiness separately from having credentials and from having an authenticated saved profile. A missing/incompatible backend blocks signing before the wallet prompt, exposes a retry in Profile and the connected-wallet sheet, and keeps guest progress unranked. A healthy service check alone never labels a profile saved.

1. In the same project's SQL Editor, run `supabase/inspect_production.sql`. It inspects actual columns, indexes, constraints, RLS policies/grants, triggers and version markers. Table presence is currently **unknown**, not assumed empty from a REST error. No Supabase MCP administration tool or direct database credentials were available for this run.
2. Apply **only** missing files from `supabase/migrations/` in order, including 004 when absent. `node scripts/prepare-supabase.mjs --after 6` is an example **only for an inspected schema 6**; it generates exact guarded SQL for the missing 007. Other inspected versions select their own missing suffix. It never connects to or migrates a database. See [the complete version table and preservation procedure](supabase/SQL_EDITOR.md).
3. Run `supabase/verify_production.sql`, `supabase/verify_major.sql` and `supabase/test_access.sql`. Keep `hf_private` unexposed and deny direct browser table writes. Enable Ethereum Web3 Auth and allow the actual hosted HTTPS origin/URI in Auth redirect URLs.
4. Complete the [real-wallet acceptance run](supabase/SQL_EDITOR.md#required-real-wallet-acceptance-run): actual player write/read, score save, refresh, same-wallet recovery on another device, SQL-backed Top 100 and unauthorized modification checks. The frontend expects schema 7/rules 6. Do not mark integration complete until these production tests pass.

**Production migrations executed: none.** Actual endpoint results are in [the recorded JSON](docs/validation/supabase-production.json). Auth connectivity is verified; authenticated database read/write, installed table/policy status, real signature, score restoration and live leaderboard records are not verified. The Data API denied private-schema exposure (406); this does not prove installed RLS policies. The browser remains the authority for positions/collisions; server event validation is not a fully authoritative multiplayer anti-cheat engine.

## Validation

Current integration checks include the production build, source/export integrity, all eight runtime scripts typechecked, SQL migration/preparation and permission tests, score/wallet recovery regressions and browser interactions. Production HTTP probes intentionally exit 1 while the RPCs are unavailable:

```sh
node scripts/verify-production.mjs --out docs/validation/supabase-production.json
node supabase/tests/production-handoff.mjs
node supabase/tests/connection-state.mjs
PLAYWRIGHT_BROWSERS_PATH="$PWD/test/scratch/browsers" node scripts/validate-integration.mjs
PLAYWRIGHT_BROWSERS_PATH="$PWD/test/scratch/browsers" node scripts/validate-integration.mjs --relay
```

The optional `--relay` forwards real Supabase HTTP through Node when this sandbox's Chromium cannot reach the host directly; it supplies no simulated records or successful responses. Direct Chromium networking returned `ERR_EMPTY_RESPONSE`; Node reached the actual project and the relay showed the actual 404 failure in the website. Browser screenshots and local fixture results do not establish production persistence. The shared dialog now wraps long action labels at 200% text size instead of widening the profile form. Current results, six-domain design coverage and limitations supersede the historical validation below; see [VALIDATION.md](VALIDATION.md).

The final production build, existing check script and actual JavaScript typecheck all ran. Local checks exercise real PostgreSQL via disposable PGlite, and actual production-export interactions via Playwright Chromium. Test Auth, wallet and HTTP adapters are confined to test files and never shipped in `dist/`. WebKit could not launch because its system libraries are missing.

To reproduce the additional checks without changing the root dependency/build files:

```sh
npm install --prefix test/scratch --cache test/scratch/npm-cache --no-audit --no-fund --package-lock=false @electric-sql/pglite@0.3.14 typescript@5.9.3 playwright@1.56.1 @axe-core/playwright@4.11.0
PLAYWRIGHT_BROWSERS_PATH="$PWD/test/scratch/browsers" node test/scratch/node_modules/playwright/cli.js install chromium webkit
node scripts/typecheck-major.mjs
node scripts/test-major.mjs
node scripts/test-major-audio.mjs
node supabase/tests/major.mjs
node supabase/tests/major-client.mjs
node supabase/tests/major-engine.mjs
node supabase/tests/concurrent-runs.mjs
PLAYWRIGHT_BROWSERS_PATH="$PWD/test/scratch/browsers" node scripts/validate-major.mjs
PLAYWRIGHT_BROWSERS_PATH="$PWD/test/scratch/browsers" node scripts/validate-major-cloud.mjs
PLAYWRIGHT_BROWSERS_PATH="$PWD/test/scratch/browsers" node scripts/validate-revision.mjs
```

Historical migration regressions also ran with `node supabase/tests/verified-wallet.mjs` and `node supabase/tests/lifetime.mjs`; they intentionally test schemas up to 005. Older v1–v3 gameplay scripts describe superseded rules and are retained as history, not presented as current passing checks. Test dependencies and browser downloads stay in disposable `test/scratch/`; they are not part of the site/submission. The pinned taste probe passed 16/16 after the final layout fix. See [VALIDATION.md](VALIDATION.md), [machine-readable results](docs/validation/major-results.json), [DESIGN.md](DESIGN.md) and [the pre-edit plan](WORKPLAN.md) for coverage, findings and limitations.
