# Squeek major update: inspection and implementation plan

Inspected 2026-11-05 before application edits. This is an upgrade of the existing dependency-free canvas engine, static-copy build, Supabase REST/RPC client, EIP-6963/MetaMask connector, wardrobe, marketplace, audio, viewport and authored forest. The existing root manifest/lockfile and build configuration stay intact. The existing ENS/IPFS domain stays intact.

## Findings and risks

- `src/config.js` and `dist/config.js` contain empty Supabase URL/public key settings. Project history provides no project ID or database access. No original hosted database could be identified; no production Auth/database operation is possible. Retain the explicit owner-settable public configuration already offered by this project; do not invent a backend. Live configuration request through the web tool failed to resolve in this run. Historical documentation of a previous live request is not current verification.
- Migrations 001–005 define private profiles, purchases, wallet links, runs, event validation, lifetime ledger and RLS. Canonical addresses come from Supabase-verified Web3 identity claims, never editable metadata. Wallet uniqueness and advisory/row locks already prevent duplicate profiles. Legacy Auth tickets preserve original server-side records. Old browser-only totals cannot be trusted for cloud scoring and must remain intact for owner-assisted recovery.
- Rules version 4 currently uses a fixed 60-second boss and requires all 30 enemies plus a metal fragment to progress. New timings/progression must change together in client and SQL without invalidating pending version-4 events.
- Scores currently settle on session termination. Closing a browser can leave a score absent from the leaderboard until another run abandons it. Checkpoint validated score deltas atomically with idempotent acknowledgements, without double-counting historical totals.
- Existing touch pickup automatically takes weapons; desktop produce requires E. Separate produce proximity from manual weapon pickup on both inputs.
- Preserve SQK probabilities, marketplace costs, cosmetics, purchased upgrades, one-hit combat, name validation, audio settings and existing wallet behavior. Growth is cosmetic with a stable collision body and foot anchor so it cannot trap the player in existing geometry.

## Implementation sequence

1. Add migration 006 to the same schema: checkpoint lifetime deltas, preserve version-4 queues, add version-6 map rules and produce progression; test populated upgrades, identity, permissions, replay and Top 100 against real PostgreSQL in local PGlite. Auth/HTTP fixtures are tests only.
2. Update save client for the new version, durable outbox/exit checkpoints, identity races, configuration validation and immediate board refresh. Preserve old keys and legacy cloud ticket flow; expose untrusted local data as a download rather than importing forged totals.
3. Extend original engine with forest/flying roaches (60s), glacier/ice/penguin (90s), caldera/fire/dragon (120s), reef/water/shark (150s). Duration means exploration time before boss appearance, preserving existing timed-boss behavior. Boss combat can extend a map. Automatic transition after defeat; fourth map ends the adventure.
4. Add colorful procedural produce, proximity collection, manual E/PICK UP weapons, progressive bounded visual growth; test thresholds and collision stability.
5. Enlarge/space touch controls with pointer ownership; shrink world SQK artwork by 30% from 36×31; give each weapon its own bounded procedural sound. Preserve mute/volume keys.
6. Build/check each phase; run actual JavaScript typecheck, SQL/client regression, browser interactions in Chromium/WebKit when available, mobile/desktop and pinned taste probe. Fix applicable findings across all six Better Interface domains. Rebuild `dist/`, update README/DESIGN/VALIDATION, audit allowed paths and 8 MiB added-byte budget.

## Decisions and limits

Use the project's existing public owner configuration, keeping ranked functionality unavailable until the original project is configured and migration 006 applied. No replacement backend, production reset, new project, deployment, seeded live leaderboard, guessed key or address. Local test identities are never exported as runtime data. Original records are not deleted or reset. Production claims require production evidence and will not be inferred from local tests.
