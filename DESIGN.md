# Hamster Friendship design system

Source of truth: [styles.css](./src/styles.css), [index.html](./src/index.html), [game.js](./src/game.js), [ui.js](./src/ui.js), [rules.js](./src/rules.js) and [wallet.js](./src/wallet.js). This records the implemented upgrade, reviewed in Chromium. Evidence and coverage limits are in [VALIDATION.md](./VALIDATION.md).

## Overview

The existing autumn pixel-art adventure remains the product. Bark-brown HTML chrome, cream text, amber actions and rounded controls surround the original 320×192 canvas. Chang, Alice, enemies, tiles and layered scenery remain intact. Player menus add profiles, equipment, rankings and an optional wallet without replacing the game or adding a marketing page.

At 390 CSS pixels the title, controls, HUD, game and **Start chapter** action are visible on the first screen. Instructions and story follow. The visual idea is the existing chestnut forest at dusk, with quiet chrome around it.

## Colors

The two-tier hex palette stays in `styles.css :root`. Components reference semantic roles; pixel art retains explicit sprite palettes.

| Token | Value | Use |
| --- | --- | --- |
| `--color-bg` | `#1a110b` | Page, input backgrounds |
| `--color-surface` | `#26180f` | HUD, dialogue, player dialogs, toast |
| `--color-surface-raised` | `#352216` | Secondary controls, key caps, HP track |
| `--color-border` | `#563823` | Dividers and hover/pressed surfaces |
| `--color-border-strong` | `#7a5233` | Input borders, inset outlines |
| `--color-text` | `#fbf3e4` | Main text and numbers |
| `--color-text-muted` | `#e6d3b5` | Hints, descriptions and labels |
| `--color-accent` | `#f2a93b` | Main actions, links, dialogue speaker |
| `--color-accent-hover` | `#f8c878` | Action hover |
| `--color-on-accent` | `#1a110b` | Text on amber |
| `--color-focus` | `#fbdba6` | 3px focus perimeter, 2px offset |
| `--color-health` | `#e9735f` | Health and inline errors |
| `--color-overlay` | `rgb(26 17 11 / 0.84)` | Game screen overlay |

Native dialogs have an opaque surface and `rgb(10 7 5 / 0.8)` backdrop. The stage retains sky-matching `#2e2245`.

Browser-computed profile hints `rgb(230,211,181)` on `rgb(38,24,15)` measured **11.76:1**. Marketplace errors `rgb(233,115,95)` on that surface measured **5.81:1**. The probe passes measured text pairs; canvas overlays retain explicit measurement limits in the review.

SQK art uses edge `#6d3d07`, shadow `#d78a16`, highlight `#ffe28c`, face `#f6c343`, lettering `#543006` and glint `#fff2bd`. Cosmetics in `rules.js` use coral `#df786e`, sky `#78b8dc`, lilac `#b49bdc`, jade `#68c2ad`, rose `#e88eac`, honey `#f2c45b` and vest `#687a60`. Those are artwork data, not extra UI accent themes.

## Typography

Two system stacks and two weights remain; no fonts are downloaded.

| Role | Family | Size | Weight / line height |
| --- | --- | --- | --- |
| Main title | Georgia, Iowan Old Style, Palatino Linotype, Book Antiqua, serif | 1.75rem; 2.5rem from 48rem | 700 / 1.1 |
| Section, game-screen and dialog titles | Same display stack | 1.25rem | 700 / 1.1 |
| Body, buttons, labels, inputs | system-ui, -apple-system, Segoe UI, Roboto, Helvetica Neue, Arial, sans-serif | 1rem | 400 body, 700 controls / 1.5 body, 1.2 buttons |
| HUD, hints, errors, descriptions, table, footer | Same body stack | 0.875rem | 400 or 700 / 1.5 |
| Profile numbers | Same body stack | 1.25rem | 700 / inherited 1.5 |

The five tokens are `--text-sm/base/lg/xl/2xl`: 14, 16, 20, 28 and 40px at default root size. Four appear at any entry width. Headings balance; descriptions wrap prettily; prose is capped around 60–62ch. Quantities use tabular numbers. Labels have natural casing and tracking. Full wallet addresses wrap in the sheet; the shortened header address is not the only available value.

Original game prompts retain 3×5 pixel `E` and `!`. SQK is an intentional uppercase-art exception: 5×7 glyphs in 2×2 pixels make a centered 34×14 word on a 42×36 coin. At the observed 358px-wide mobile canvas that is approximately a 47×40 CSS-pixel coin with 38×16 lettering. At 960px it is 126×108 with 102×42 lettering.

## Layout

Reuse `.page`: 960px content plus 16px inline padding per side, centered. Spacing tokens are 4, 8, 12, 16, 24, 32 and 48px. Header, wrapping navigation, HUD, status, stage, touch controls, hints and save state stay in normal flow.

The stage is a one-cell grid, allowing tall overlays to grow rather than clip. Canvas ratio is 5:3 with pixelated scaling. Observed dimensions: 358×214.8px at 390; 960×576px at desktop. The authored world remains 224×12 tiles.

| Condition | Response |
| --- | --- |
| From 48rem | 2.5rem title; instructions and story in two columns |
| At most 52rem, or coarse pointer | Show touch controls/hints, hide keyboard hint |
| Touch action group | Columns fit `minmax(min(100%,4.6em),1fr)`; arrows do not stretch vertically |
| At most 22rem | Controls definition list stacks |
| At most 40rem | 16px dialog padding; wallet bottom sheet with safe-area inset |

Player dialogs are at most 640px wide or viewport minus 32px, and viewport height minus 48px tall. Wallet is at most 420px, spanning the phone's bottom. Content scrolls; title and Close stay sticky. Shop rows are icon / description / action on desktop; action moves below description on phones. Shrinkable control-list tracks and wrapping accommodate enlarged text.

Observed: no horizontal overflow at 320, 390, 768 or 1440; product and Start visible at 390; 200% text enlargement keeps page and menus reachable. Text enlargement is not native browser zoom verification.

## Elevation & Depth

Flat tonal surfaces remain. Secondary buttons, key caps and dialogue use inset outlines, not drop shadows. Regular surfaces do not combine border and shadow. Stage layers: canvas, dialogue at 3, toast at 4, game screens at 5. Native `<dialog>` uses the browser top layer and makes background controls inert.

Original clouds, hills, distant/near trees and vignette provide depth. Ambient particles, poses, camera and boss animations remain. Reduced motion stops decorative drift, leaf movement, shake, intro flash/beam and idle bob where the game supports it. Gameplay movement, character blinking and player-driven scenery remain.

## Shapes

Keep 6px small, 10px control and 16px stage/dialog radii. Toasts and HP ends use 999px. Stage edges clip the canvas. Artwork uses square pixels, including the new coin, clothing and drops.

## Components

- **Buttons:** `.btn`, `.btn-primary`, `.btn-secondary`, `.btn-small`. Minimum 44px; touch controls at least 44×48px. Hover only on hover-capable devices, active scale 0.96, disabled opacity 0.6, shared focus perimeter. Named properties transition for 150ms; reduced motion removes scale and duration. Existing Jump emphasis remains alongside Start.
- **HUD:** `.hud-item`, `.hud-value`, `.hearts`, `.hud-bar`. SQK/pending credit, map, defeated enemies, shells, one-hit health, clues, boss HP, weapon/ammo and active-time countdown. Color has numeric/text cues. The coin SVG has an accessible SQK name.
- **Game screens:** `.overlay`, `.dialogue`, `.stats`, `.toast`. Actions receive focus; dialogue returns it to the canvas. Retry explains retained SQK and lost loose coins.
- **Player dialog:** `#player-dialog`, `.player-dialog`, `.panel-header`, built by `ui.js`. Native trapping and Escape; Close/backdrop dismissal; opener focus restoration. Opening pauses combat; closing keeps the existing Resume screen available.
- **Profile:** labeled 16px input, hint and live result. Errors use `aria-invalid`/`aria-describedby`; pending submit is disabled. Save notifications refresh stats/status without replacing the typed name field.
- **Marketplace:** `.shop-list`, `.shop-item`, `.item-art`, `.item-feedback`. Pixel icons, descriptions, prices, Buy / Equip / Unequip / Owned states. Stable item-level alerts keep errors beside their controls. Skills explain next-map activation. Balance updates on acknowledgement.
- **Leaderboard:** `.leaderboard`, caption and semantic column headers. Loading, empty, unavailable, retry and real server rows. Names are text nodes; no seeded rankings.
- **Wallet:** `.wallet-options`, `.wallet-row`, `.wallet-address`. 48px provider rows; pending, rejected and wrong-network states; Mainnet switch; shortened header/full sheet address; local disconnect. Discovery uses announced names/icons. No-provider state offers MetaMask opening/install links.

## Do's and Don'ts

- Start additions from `.page`, semantic tokens, the existing type scale and native controls.
- Keep story/status in HTML and art in canvas. Reuse original sprites and scenery.
- Distinguish device saves, pending cloud credit and acknowledged balances.
- Preserve keyboard, touch, pause, Escape, focus return and reduced-motion paths.
- Keep full names, amounts and addresses reachable; do not hide overflow to conceal important text.
- Do not add fonts, type steps, tracked captions or marketing sections before the game.
- Do not turn cosmetics into healing or add signing to the wallet connection.
- Another player panel should reuse the native dialog, sticky header, tokens and live-feedback patterns, leaving the game beneath it.

Guidance: Jakub Krehel's Better Interface (MIT); documentation method: Paul Bakaus's Impeccable (Apache-2.0). [Notices and licenses](./docs/licenses/better-interface.txt) are retained.
