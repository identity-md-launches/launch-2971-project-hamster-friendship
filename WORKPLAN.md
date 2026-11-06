# Current task plan — 2026-11-06

Continue the existing vanilla JavaScript canvas game and static-copy build. Preserve its maps, art, combat, wallet implementation, server event protocol, historical migrations and all existing data.

1. Inspect production with the supplied public settings only; review migrations 001–009 and the existing guarded SQL handoff. Run disposable PostgreSQL migration, preservation, authorization, score/SQK/inventory, offline and same-wallet recovery checks. No available administration connector or SQL credentials can apply production SQL; do not infer installed tables from a 404 or replay migrations blindly. Record this limitation and actual HTTP results.
2. Remove the fixed visible joystick. Use a transparent left-half movement surface, a gesture-local floating origin, radial dead zone and normalized two-axis steering through existing collision code. Preserve gravity on release, Jump/stomps/knockback, desktop keys and all combat/UI controls. Keep touch combat controls wholly in the right half at narrow widths. No camera gestures. Clear ownership on release, cancellation, lost capture, pause, visibility and viewport changes.
3. Repair the observed offline-start restoration gap: a retained signed-in wallet whose session cannot restore while offline must retry its existing session when the browser comes online. Never import editable browser totals into permanent ranked scores.
4. Build and typecheck the unchanged stack; exercise the actual export at a static subpath with Chromium and attempt WebKit. Validate real touch dispatch, eight-way movement, finger ownership, simultaneous actions, cleanup, mobile layouts, desktop keys, menus and real backend error/retry states. Run the pinned taste probe and review all six Better Interface domains. Document final source and actual results in DESIGN.md, README.md and artifacts/validation.md.

## Decisions and limits

- Two-axis touch steering is the requested control change to an existing side-scrolling world. Solid tiles, jump mechanics, speeds, hurt/stomp behavior and released-touch gravity remain authoritative. Touch steering never raises the existing horizontal speed ceiling or changes server reward rules.
- The provided production URL/key are public configuration, already present. Production administration is unavailable; finish the useful controls, client fixes, validation and static export without another needs-input stop. Do not label production integration complete.
- Dependencies and browser binaries exist only under disposable test/scratch/. Root manifests, lockfile, build configuration and ignore files remain unchanged. New delivery budget: at most 1 MiB for source/scripts/docs/JSON plus 1 MiB for selected screenshots; rebuilt dist below 600 KiB; total added/changed file bytes must remain under 8 MiB. No new runtime dependency.

## Final status

The planned invisible controls, responsive prompt placement and offline-reload reconnect repair are implemented. Rendered review additionally fixed sticky dialog-header masking/scroll padding for enlarged help. The production build, actual JavaScript typecheck, local SQL/gameplay/audio/interaction suites and pinned taste probe passed; see artifacts/validation.md for exact outcomes and the six-domain review. Production remains incomplete: live RPCs return 404 and Auth explicitly reports web3_provider_disabled. No production migration or authenticated write was performed. The usable static export and the existing administrator handoff are delivered without another needs-input stop.
