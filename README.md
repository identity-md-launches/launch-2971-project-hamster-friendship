# Hamster Friendship: The Lost Alice

This upgrades the existing game in place. The authored forest, Chang and Alice sprites, story, clues, Mrs. Pebble, movement physics, shield, weapons, equipment catalogue, wallet connection and Supabase integration remain. Existing player names, SQK, scores, inventory, cosmetics and unlocked maps keep their storage keys and database identities.

The complete static website is in **dist/**, including `index.html`, relative assets, the favicon and share image. Guest play works immediately. No runtime packages, downloaded music, wallet signatures or transactions are required.

## Install, preview and rebuild

Install Node.js 18 or newer. There are no application dependencies to install; the existing `package.json` and `package-lock.json` are retained unchanged.

```sh
npm run build
npm run check
npm run preview
```

Preview serves `http://localhost:4173/`; stop it with Ctrl+C. Edit `src/`, rebuild, and include all of `dist/` with the source and existing lockfile. The build copies 14 runtime files. It needs no server route rewrites and works under a static hosting subpath. Use HTTPS for deployed wallet/cloud features and browser storage locking. The game and menus have no third-party asset requests.

## What changed

| Area | Implemented behavior |
| --- | --- |
| Combat | Each defeated monster, including the boss, independently has exactly a 20% chance of dropping one SQK. Weapons retain their separate 30% drop chance and existing distribution/damage. Coins are about 14% smaller and Chang is drawn 15% larger without changing platform collisions. Player names appear above characters on a solid dark label. |
| Monsters | Each map randomizes beetles, ants, larvae and new fire-shooting ember monsters, with small/large sizes. Map 1 HP is 50/100/300 for small/large/boss. Map `n` HP is `ceil(base × 1.2^(n−1))`; enemy contact/projectile damage is `1.2^(n−1)`. The original one-unblocked-hit rule remains. Frontal shields block fire too. |
| Progression | Thirty regular enemies and one boss per map; boss appears after 60 active seconds. Defeat them and inspect the original metal fragment. Saved players can continue their deepest unlocked map or replay map 1. Retry preserves collected SQK, purchased equipment and progression. |
| Mobile | Circular left joystick; right Attack, Jump, Shield, Look and Swap buttons. Multiple pointers work together. Landscape fits controls beside the scene. Keyboard controls remain. |
| Audio | Original procedural cozy music and effects for footsteps, attacks, jumping, SQK, items, quests, the added shell chest, level progression and victory. Audio starts after an interaction. Separate music/SFX sliders and mutes persist locally. |
| GUILD | The collapsible instruction menu contains controls, combat tutorials, rules, Dice/badge rules and the original story. Opening any menu pauses active play; closing leaves an explicit Resume action. |
| Seasons | Each map randomly selects spring birds, summer sunlight, autumn leaves or winter snow, with a corresponding sky palette. The original forest artwork remains. Reduced motion stops decorative drift and parallax. |
| Victory | “Congratulations! You Win!”, a winking pixel hamster raising a large readable SQK coin, a short cheer animation, victory sound, retained statistics and the next-map action. |
| SQK Dice | Two independent fair six-sided dice, HIGH > 7, LOW < 7, DRAW = 7. HIGH/LOW each have 15/36 outcomes (41.67%); DRAW has 6/36 (16.67%). No staking, SQK losses, gambling or real-money rewards. Correct predictions, lifetime wins, rolls and draws persist. |
| Badges | Dice Bronze/Silver/Gold at 20/50/100 correct predictions are display-only. Separate skill and verified contribution badges can be removed once in **Marketplace → Badge Exchange** for 20/50/120 SQK. Dice never awards SQK. |

Skill badges are earned once for clearing maps 1, 3 and 5. This is the implemented skill criterion because the brief did not prescribe one. Contribution badges require the owner's verification and private database grant; no contribution is invented or auto-awarded. [Backend documentation](./supabase/README.md) describes that path.

All control instructions are in GUILD. Desktop: arrows/A/D walk; Space/W/Up/Z jump; X/J attack; Q swap; C/K/Down/S shield; E/Enter interact; Esc/P pause. Touch joystick movement is horizontal, appropriate to the existing platform game; Jump is separate.

The existing 10-item marketplace remains: vest, three shirts, three chestnut skins, Charged, Piercing and Ricochet. Skills stack and apply at map start; cosmetic choices apply immediately. SQK is an off-chain game balance. The optional existing MetaMask connection stays Mainnet/connect-only and independent of account ownership.

## Saves, integration and remaining setup

Guest profiles keep `hamster-friendship-v2-guest`; sessions and pending cloud events retain their original keys. New fields are additive. Guest reward and exchange updates re-read the profile within a shared Web Lock when available. Exchanges store removal and credit in one write. Browsers without Web Locks use a fresh-read, single-page fallback; concurrent-tab guarantees in those browsers were not verified. Clearing browser data still removes guest progress and anonymous-session access, as before.

Cloud rewards retain durable ordered events and acknowledgements. New requests are serialized so a delayed response cannot replace a newer balance. PostgreSQL locks profiles, validates drops, keeps Dice receipts by request ID and retains exchanged badges as private ledger entries. Retries cannot credit the same reward twice. Guest credit is never imported into global scores. Cloud event validation remains the existing protocol, not a new authoritative physics server.

**Live Supabase activation remains an owner step.** The provided configuration is blank; no live URL or publishable key was supplied. Existing configured deployments should apply **002 only** to their existing database. New databases apply 001, then 002. Never rerun 001 on an existing populated project.

1. Apply [002_seasons_dice_badges.sql](./supabase/migrations/002_seasons_dice_badges.sql). It adds fields/tables/functions without resetting accounts, balances or inventory. Active legacy runs retain their existing HP and coin entitlements. A separate v3 map-start RPC enforces the new rules. Older open pages can finish an existing run, then receive an explicit reload message before another map; they cannot start unlimited old-policy runs.
2. Keep anonymous Auth enabled and `hf_private` outside exposed Data API schemas.
3. Put the real HTTPS URL and browser-safe publishable key in [src/config.js](./src/config.js), then rebuild. Never add private/service-role credentials to the website.
4. Verify Auth, reward/reload/retry, purchases, Dice, badge exchanges and rankings against that live service. These live checks could not be performed without its configuration.

An older cloud backend still supports its original forest rules; the interface labels legacy rules and disables the new badge/Dice panels until migration 002 is applied. Guest play uses the complete new rules immediately. No backend credentials, contribution records, player balances, domain ownership or live validation results were fabricated.

## Branding and hosting

**SQUEEK.ALICE** remains the desired Web3 identity and **SQUEEK.HAMSTER** the desired domain concept, shown as concepts rather than working public-domain links. The existing website address, `hamster-friendship-the-lost-alic.identitymd.eth`, is retained. No DNS records, hosting aliases or domains were changed; no replacement has been verified. A future change must first verify actual DNS resolution, control and hosting/TLS compatibility. This submission supplies the export for the existing publishing process and performs no publication or on-chain deployment.

## Actual validation

[VALIDATION.md](./VALIDATION.md) records coverage, fixes and limitations. [DESIGN.md](./DESIGN.md) records the final source tokens and components. Final checks:

- Production build, static/export checks and real TypeScript checkJs: passed.
- Existing gameplay/save regressions: **32 passed**; new rules/achievements: **16 passed**.
- Original PostgreSQL contract: **43 passed**; additive migration/economy: **24 passed**.
- Legacy engine → save → PostgreSQL: **9 passed**; upgraded client/engine → PostgreSQL: **7 passed**.
- Chromium browser interactions: **28 existing + 16 upgrade checks passed**, including audio signal/mutes, portrait/landscape, two-tab exchanges and coin/purchase concurrency.
- Pinned taste@1: **16/16 passed**. Automated axe checks found zero violations on the inspected surfaces.
- **WebKit did not launch**; Safari/iPhone behavior remains unverified. Physical devices, screen readers and browser-native zoom were not tested. Text enlargement to 200% was tested separately.

`npm run typecheck` is the original static-check alias; it is not a TypeScript compiler. Actual compiler commands were also run:

```sh
tsc --noEmit -p jsconfig.json
tsc --noEmit --allowJs --checkJs --strict false --target es2022 --lib es2022,dom src/types.d.ts src/config.js src/rules.js src/save.js src/wallet.js src/ui.js src/audio.js
```

The original dynamic canvas engine is syntax-checked and exercised through gameplay/browser tests. Optional verification tools used: TypeScript 7.0.2, Playwright 1.64.1, PGlite 0.5.15 and axe-core 4.14.0. Install them into a disposable tools directory outside the delivered tree, not the application's manifest. To reproduce, pass the installed module paths:

```sh
node scripts/test.mjs
node scripts/test-upgrade.mjs
node supabase/tests/validation.mjs /path/to/pglite/dist/index.js
node supabase/tests/upgrade.mjs /path/to/pglite/dist/index.js
node supabase/tests/frontend.mjs /path/to/pglite/dist/index.js
node supabase/tests/upgrade-client.mjs /path/to/pglite/dist/index.js
node scripts/validate-browser.mjs /path/to/playwright/index.mjs /path/to/pglite/dist/index.js '' /path/to/axe-core/axe.min.js
node scripts/validate-upgrade.mjs /path/to/playwright/index.mjs /path/to/axe-core/axe.min.js
```

Browser scripts own a bounded preview under `/preview/` and close it on completion. Fixture profiles, forced encounters and interrupted transport are explicitly test-only; the delivered game exposes no testing/cheat hooks. No caches, downloaded browser runtimes or verification dependencies belong in the submission. [Guide attribution and licenses](./docs/licenses/better-interface.txt) remain included.
