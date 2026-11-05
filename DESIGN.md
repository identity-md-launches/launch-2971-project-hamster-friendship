# Implemented design: squeek.hamster

## Overview

An existing pixel-art adventure for desktop and touch players. Hamster Friendship remains the project; `squeek.hamster` is the public display/app name. The original forest, sprites, story, animation, seasonal art and audio carry the visual identity. Warm bark, cream and amber controls float over the canvas. The first screen presents the game and Start adventure at 390 pixels wide, with Change it and Menu in the header.

Source: `src/index.html`, `styles.css`, `game.js`, `ui.js`, `wallet.js`, `save.js`, `viewport.js`. There is no replacement framework, second engine, marketing hero, font download or new decorative system. Final stylesheet rules at `src/styles.css:443` override older header/HUD positioning rules.

## Colors

The existing hex primitives and semantic aliases at `src/styles.css:3` remain canonical.

| Semantic role | Value | Use |
| --- | --- | --- |
| `--color-bg` | `#1a110b` | Page/letterbox and primary-button text |
| `--color-surface` | `#26180f` | HUD, dialogs, rotation panel, messages |
| `--color-surface-raised` | `#352216` | Secondary buttons |
| `--color-border` | `#563823` | Separators and secondary hover |
| `--color-border-strong` | `#7a5233` | Inset control edges |
| `--color-text` | `#fbf3e4` | Main text |
| `--color-text-muted` | `#e6d3b5` | Labels and help |
| `--color-accent` | `#f2a93b` | Primary action and selected slot |
| `--color-accent-hover` | `#f8c878` | Action hover/pressed state |
| `--color-focus` | `#fbdba6` | 3px focus ring |
| `--color-danger` | `#e9735f` | Errors and existing enemy/boss indicators |

Calculated sRGB token pairs: text/surface 15.61:1; muted/surface 11.76:1; bark/amber 9.31:1; error/surface 5.81:1; focus/raised 11.34:1. Opaque dialog/button backgrounds were rendered and inspected. These numbers do not establish contrast for moving pixels or every image-backed label. The taste probe explicitly left 20 image/canvas-backed text boxes unmeasured. No new theme or color ramp was introduced.

## Typography

`--font-display`: Georgia, Iowan Old Style, Palatino Linotype, Book Antiqua, serif. `--font-body`: system-ui, -apple-system, Segoe UI, Roboto, Helvetica Neue, Arial, sans-serif. No font asset or dependency is required; exact system fallback appearance varies by OS.

Weights are 400/700. Existing token scale: 14px, 16px, 20px, 28px, 40px at the default root size; unused display steps need not be applied. Active entry screen uses 14/16/20px at 390 and 14/16/20/28px at 1440. Headings use 1.1 line-height, body 1.5, controls 1.2; content keeps natural letter spacing. Numbers use tabular figures. Body/help measure is bounded; wallet addresses, table names and large values wrap rather than truncate. Inputs remain 16px to avoid focus zoom on iPhone. Root text enlargement to 200% was checked; browser-native desktop zoom and physical iOS text settings were not.

## Layout

Spacing tokens are 4, 8, 12, 16, 24, 32 and 48px. The stage uses `100dvw`/`100dvh`, overridden by scale-adjusted VisualViewport dimensions when available. It has no outer margin, page scroll or arbitrary content padding. Controls honor the existing safe-area insets. Pinch magnifies the stage without shrinking its CSS box; toolbar/keyboard viewport changes resize it.

The canvas retains 192 source rows and 288–416 aspect-matched columns. `object-fit: contain`, disabled smoothing and `image-rendering: pixelated` preserve square pixels; extreme aspect ratios letterbox. Portrait retains a centered 5:3 scene. Utilities flow below a wrapping header instead of sharing its horizontal center: this accommodates the explicit Current Map Score label and long values without overlapping controls. `minmax(0,1fr)` prevents intrinsic grid expansion at enlarged text.

Existing breakpoints remain: 52rem/coarse pointer enables touch controls; 40rem simplifies dialogs/shop; 28rem compacts controls and moves Fullscreen into Menu; 22rem reduces joystick size; landscape height below 34rem compacts overlays. Change it remains visible at narrow widths. Table columns are 18/32/34/16%, with smaller inline cell padding on phones so Rank remains a word. Native dialogs scroll internally. Checked widths include 320, 390, 568, 667, 767, 768, 844 and 1440; Android emulation also uses 393/851.

## Elevation & Depth

The transparent header has no full-width band. Brand text keeps its existing bark shadow for legibility over the art. HUD/dialogs use opaque tonal surfaces; secondary controls use an inset edge rather than a separate card border plus drop shadow. Start/pause/end use the inherited scrim. Native dialog backdrops occupy the top layer. Touch controls, chrome, rotation panel and fullscreen notice retain separate stacking levels.

The compact rotation panel covers its own text area, not the entire scene. While it is shown, redundant rotation text and the paused-screen content are hidden. Gameplay stays paused, while the accessible portrait action and Menu remain available. Fullscreen denial uses a dismissible inline panel with focus returned to the visible Fullscreen control or Menu; important errors are not silently timed away.

## Shapes

Existing radii: 6px small, 10px medium, 16px dialog. Joystick and action buttons are circular; weapon slots are small rounded rectangles. Pixel art stays on its existing coordinate grid. App icons are raster exports of the existing favicon. The share image only changes its heading to the display name; underlying forest/hamster art is unchanged.

## Components

| Pattern | Source and behavior |
| --- | --- |
| Buttons | `.btn`, `.btn-primary`, `.btn-secondary`; minimum 44px, hover/active/focus states, 150ms named-property transitions, `.96` press scale. Ordinary controls use manipulation touch behavior. |
| Game actions | Existing `.joystick`, `.pad-btn`, `.weapon-slot`; independent pointers, immediate pressed cue, pointer capture/cancellation, owned/disabled/selected/ammo states. Direct gameplay surfaces isolate gestures. |
| Menus/dialogs | Native dialogs in `index.html`; `ui.js` handles pause, Escape/backdrop/close, focus return. Direct Change it returns focus to its own button; menu-originated panels return to Menu. |
| Change it / shop | `shopPanel()` shares item art, owned inventory, pending state, row errors and equip RPC. Wardrobe mode lists owned costumes and offers Marketplace when empty. It has no second inventory or price model. |
| Profile | Labeled name form, format hint, inline validation, saved SQK/Lifetime Score/unlocks/inventory, explicit cloud state and retry. |
| Lifetime ranking | `leaderboardPanel()`; loading, empty, error/refresh and actual SQL rows. Polls only while open/visible, without a reset deadline. No seed players. |
| Wallet | Existing EIP-6963/EIP-1193 sheet, named injected wallets, MetaMask deep link, chain check, explicit login and separate disconnect. Connection alone never enables cloud saves. No transactions or approvals. |
| Rotation/fullscreen | `viewport.js`; preserves the live world and wallet, requests supported landscape lock, offers portrait fallback, hides unsupported fullscreen and explains Home Screen mode. Manifest is relative to this same site. |

Reduced-motion CSS removes button transitions/press transforms; the engine retains its existing decorative-motion reductions. Audio starts through player interaction and retains separate music/effects controls. Continuous game simulation is gameplay, not a decorative CSS animation.

## Do and do not

Reuse the existing tokens, native dialogs, shared shop handlers and canvas art. Keep input help beside its action or in GUILD. Keep server state, pending state and guest state explicit. Use `--color-danger` with actual error text and a recovery path. Another utility belongs in the existing menu/dialog structure with the same focus/error behavior.

Do not change game balance/art to solve viewport issues, stretch the canvas, add fonts/hero sections, fake rankings, import guest balances or treat wallet connection as verified ownership. Do not globally disable pinch zoom, request fullscreen automatically, or promise that iOS will hide its browser bars.

Review coverage and repaired findings across all six Better Interface domains are in `VALIDATION.md`. Screen-reader, physical-device and WebKit/native Safari checks remain unperformed. The existing notices remain at `docs/licenses/better-interface.txt`: Jakub Krehel's Better Interface (MIT), plus the adapted Paul Bakaus/Impeccable documentation guidance (Apache-2.0).
