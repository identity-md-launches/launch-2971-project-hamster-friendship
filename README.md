# Squeek · The Lost Alice

An in-place update of the existing Hamster Friendship pixel-art adventure. The original canvas engine, Chang/Alice artwork, story clues, marketplace, costumes, SQK economy, MetaMask connector, audio settings, static build and hosting name remain.

**Production Supabase is not connected or verified.** The supplied `src/config.js` and `dist/config.js` have empty public settings, and the supplied project history identifies no Supabase project. This update implements and locally tests the integration and an additive migration for the **original** database. It does not substitute a new backend or fabricate credentials. Guest play is usable immediately and clearly marked as unsaved. The original project's owner must complete the configuration below before permanent saves and global rankings can be used on the hosted site.

## Install, preview and rebuild

Use Node 18 or newer. The website has no runtime npm dependencies; its existing root manifest and lockfile are retained unchanged.

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

Existing legacy cloud profiles can be linked through their authenticated, expiring server ticket. An existing verified wallet profile always wins. Older **unverified browser-only totals** are left untouched and offered as a download in Profile for owner review; they cannot overwrite or mint a verified score. Guests remain memory-only and unranked. See [Supabase migration and security details](supabase/README.md).

## After launch: original-project owner configuration

These are owner-settable settings, not invented credentials or a request to replace the backend:

1. Identify the existing Supabase project. Set its public URL and browser-safe publishable/anon key in `src/config.js`. Keep private/service-role keys out of source and `dist/`.
2. Back up the original database and inspect its installed migration versions. Keep installed migrations unchanged. A project already on 005 applies **only `supabase/migrations/006_four_worlds.sql`**, once. Earlier projects first apply only their missing historical migrations, in order. Never reset the database or replay installed migrations.
3. Run `supabase/preservation_snapshot.sql` before and after 006 during a maintenance window; compare every historical count/fingerprint/SQK/lifetime sum. Enable Ethereum Web3 Auth and allow the actual HTTPS origin/URI in Auth redirect URLs. Expose `public`, never `hf_private`, through the Data API.
4. Run `supabase/verify_major.sql`, rebuild the export and verify actual signed login, score save, refresh, a second device, Top 100 and unauthorized access against that **same** hosted database. The frontend expects schema/rules version 6 before requesting a signature.

No production database was inspected, migrated or reset here. No live signature, real-device wallet or hosted Supabase result is claimed. The browser remains the authority for positions/collisions; server event validation is not a fully authoritative multiplayer anti-cheat engine.

## Validation

The final production build, existing check script and actual JavaScript typecheck all ran. Local checks exercise real PostgreSQL via disposable PGlite, and actual production-export interactions via Playwright Chromium. Test Auth, wallet and HTTP adapters are confined to test files and never shipped in `dist/`. WebKit could not launch because its system libraries are missing.

To reproduce the additional checks without changing the root dependency/build files:

```sh
npm install --prefix test/scratch --no-audit --no-fund --ignore-scripts @electric-sql/pglite typescript playwright @axe-core/playwright
PLAYWRIGHT_BROWSERS_PATH="$PWD/test/scratch/browsers" node test/scratch/node_modules/playwright/cli.js install chromium webkit
node scripts/typecheck-major.mjs
node scripts/test-major.mjs
node scripts/test-major-audio.mjs
node supabase/tests/major.mjs
node supabase/tests/major-client.mjs
node supabase/tests/major-engine.mjs
PLAYWRIGHT_BROWSERS_PATH="$PWD/test/scratch/browsers" node scripts/validate-major.mjs
PLAYWRIGHT_BROWSERS_PATH="$PWD/test/scratch/browsers" node scripts/validate-major-cloud.mjs
```

Historical migration regressions also ran with `node supabase/tests/verified-wallet.mjs` and `node supabase/tests/lifetime.mjs`; they intentionally test schemas up to 005. Older v1–v3 gameplay scripts describe superseded rules and are retained as history, not presented as current passing checks. Test dependencies and browser downloads stay in disposable `test/scratch/`; they are not part of the site/submission. The pinned taste probe passed 16/16 after the final layout fix. See [VALIDATION.md](VALIDATION.md), [machine-readable results](docs/validation/major-results.json), [DESIGN.md](DESIGN.md) and [the pre-edit plan](WORKPLAN.md) for coverage, findings and limitations.
