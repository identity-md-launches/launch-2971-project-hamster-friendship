# Implemented design: squeek.hamster

## Overview

A playable pixel-art forest adventure for touch and desktop players. The original 192-row pixel renderer (now with an aspect-matched column count), authored world and animated sprites remain the visual anchor. The original five-line opening dialogue remains before first play. Warm bark, cream and amber UI from the existing site now floats over that scene. Utilities are disclosed through a single menu; the opening screen presents the forest and Start adventure immediately, including at 390 pixels wide.

This is a game surface rather than a marketing page. There is no subtitle/footer block, feature grid or new decorative system. Implementation lives in `src/index.html`, `src/styles.css`, `src/game.js`, `src/rules.js`, `src/ui.js` and `src/wallet.js`. The final `.game-chrome` rules in the stylesheet supersede earlier absolute-position values for header/HUD children.

## Colors

Reuse the existing hex primitives and their semantic aliases in `src/styles.css:3`.

| Semantic token | Actual color | Job |
| --- | --- | --- |
| `--color-bg` | `#1a110b` | Page/portrait letterbox and primary-button text |
| `--color-surface` | `#26180f` | Opaque HUD, dialogs, slots, contextual messages |
| `--color-surface-raised` | `#352216` | Secondary buttons, fields/controls |
| `--color-border` | `#563823` | Separators, secondary hover |
| `--color-border-strong` | `#7a5233` | Inset control structure |
| `--color-text` | `#fbf3e4` | Primary text |
| `--color-text-muted` | `#e6d3b5` | Help, labels and secondary text |
| `--color-accent` | `#f2a93b` | Primary action and selected weapon |
| `--color-accent-hover` | `#f8c878` | Hover/pressed action |
| `--color-focus` | `#fbdba6` | 3px keyboard focus perimeter |
| `--color-danger` | `#e9735f` | Errors and retained monster/boss health indicators |

The header has no band: it is transparent, the brand carries a 1px bark outline plus 6px bark glow (`text-shadow`) for legibility over the scene, and the Fullscreen/Menu buttons keep their own opaque surfaces. Joystick at 88%, start/pause/game-over scrim at 68%. Opaque control/text surfaces establish stable contrast over the seasonal artwork. Do not use a separator token for text.

Computed sRGB ratios for the actual opaque pairs are cream/surface **15.61:1**, muted/surface **11.76:1**, bark/amber **9.31:1**, error/surface **5.81:1**, focus/raised **11.34:1**. These are token-pair calculations, supported by the observed opaque panel/button backgrounds; they are not measurements of every antialiased canvas pixel or translucent overlay. The probe also checks measurable rendered text; its canvas-overlay exclusions are recorded in VALIDATION.md.

## Typography

- Display: `Georgia, "Iowan Old Style", "Palatino Linotype", "Book Antiqua", serif` for the brand and headings.
- Body/control: `system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif`.
- Native font stacks; no font dependency/download. DOM weights are 400 and 700.
- Tokens: `--text-sm: .875rem` (14px), `--text-base: 1rem` (16px), `--text-lg: 1.25rem` (20px), `--text-xl: 1.75rem` (28px). The inherited 2.5rem token remains available but is unused by this layout.
- Body line height 1.5; display 1.1. Buttons use 1.2. No tracked capitals or kicker labels. Headings balance, descriptions wrap naturally, long field/address values break without clipping.
- Numeric HUD/leaderboard/ammo/balance values use tabular figures. Input text remains at least 1rem. The retained canvas name label uses bold 10px sans-serif on an opaque bark rectangle.

## Layout

The stage fills `100dvh`, with a `100vh` fallback. In landscape the canvas keeps its 192-row height and `fitView()` (`src/game.js`) sets its column count to `round(192 × stage width / stage height)`, clamped to 288–416, on load, `resize` and stage `ResizeObserver`. Both axes therefore scale by the same factor: the view shows more or less of the forest instead of stretching the sprites (844×390 → 416 columns; 1440×900 → 307). Beyond the clamp, `object-fit: contain` letterboxes with the bark stage colour rather than distorting. World tiles, collision and sprites are unchanged; the camera centres on the boss arena when the view is wider than its 384px. Portrait uses 320 columns and centers the original 5:3 strip without cropping, with a rotate hint. Landscape is the intended touch format.

`.game-chrome` is an overlay grid in normal flow: header, four HUD metrics, conditional boss status, rotation hint. Its rows grow for large text/values. The brand stays top-left; Fullscreen and Menu stay top-right. The base HUD is static with `translate: none`. The landscape override follows that base rule and centres the HUD in the header row (`position: absolute`, 50% left inset, `translate: -50% 0`, zero inline margin). It requires both a 48rem-wide landscape viewport and a named `game-chrome` container at least 48em wide. Container em units follow the chrome's text size: at 200% root text, 844px and 1440px layouts retain the untranslated wrapping row below the header, avoiding overlap with the brand/tools. Browsers without container queries retain that same base row. At normal text, the centred row was measured at y=11px at 768px, 844px and 1440px landscape widths. On short wide landscape screens the Fullscreen label collapses to its ⛶ icon to keep that row clear. The wrapper and the header strip do not intercept gameplay pointers; only the tool buttons do. Fullscreen is hidden where `requestFullscreen` is missing (iPhone Safari); a refused request shows a 4-second notice in the rotate-hint slot. Supplementary weapon/season/timer/save text belongs inside the menu.

Spacing tokens are 4/8/12/16/24/32/48px. Safe-area insets pad top tools and bottom controls. The default content inset is 12–16px, not a new centered website container.

At coarse-pointer or up-to-52rem widths, touch controls overlay the game: joystick bottom-left; large Attack bottom-right; Jump above Attack; slots in one row left of Attack. At up-to-28rem, slots are 44px wide, Attack 64px and Jump 52px. At up-to-22rem the joystick is 76px wide with an 8px inset, leaving a gap beside the weapon row even at 320px. Ordinary landscape sizes use a 96px joystick, 84px Attack, 60px Jump and 56px-minimum slots. Fine-pointer desktop keeps the three slots and uses mouse/keyboard movement/combat.

Dialogs use `min(640px, 100% - 32px)`, 16px corners and at most viewport height minus 48px. They scroll internally with a sticky close/title row. The wallet sheet sits at the bottom on narrow screens. Marketplace rows collapse from art/details/action columns to art/details plus an action row. GUILD controls use one column below 40rem. The page does not scroll horizontally.

## Elevation and shapes

The existing system is mostly flat. Inset shadows define secondary controls; no new card stack, glow, gradient text or texture layer is added. Structure/state may use inset borders. Radii: 6px for compact slots/messages, 10px for buttons/context panels, 16px for dialogs, 50% for joystick/Attack/Jump. Modal backdrops separate utility tasks from the paused game.

## Components and states

| Component | Reuse and behavior |
| --- | --- |
| `.btn-primary` | Amber fill/dark text for the principal action. Attack is the main live-game action. |
| `.btn-secondary` | Raised bark with cream text, 44px minimum height; utility buttons wrap when necessary. |
| `:focus-visible` | 3px cream-amber outline; canvas outline is inset so the viewport cannot hide it. Forced-colors retains visible boundaries. |
| `.weapon-slot` | Numeric mapping, icon, name, ammo. Unowned is disabled and hides the weapon icon. Owned shows icon/ammo. Selected adds amber fill, inner perimeter and `aria-pressed=true`. Selecting it again restores chestnuts. |
| `.joystick` | Circular base/thumb; one captured pointer owns movement. Cancel/lost capture resets it while other touches remain available. |
| `.pad-btn` | Circular direct action; immediate pressed-color feedback. Keyboard/button semantics retained. |
| `.overlay` | Start, pause, game over and victory; each supplies an actual next action rather than blocking behind explanatory content. |
| Native `<dialog>` | Menu, player tasks and wallet sheet; Escape/backdrop/close paths and focus return to Menu. Opening utilities pauses the game and clears held input. |
| Marketplace row | Shared `HamsterRules.costumeArt()` pixel rectangles preview the same costume overlay used on Chang. Prices/owned/equipped states are explicit. Pending buttons disable; errors stay beside the product and allow retry. |
| Leaderboard | Loading, empty, failure/retry and actual server rows; day/zone/reset text accompanies the table. No sample players. |
| Status/error | Stable polite status regions; errors use alert text, a recovery instruction and the existing danger token. |

The five costume overlays retain Chang’s original body, feet and animation and use the same 16×16 coordinate grid. Deadpool has a red mask/dark eye patches; Batman a cowl/cape/belt; Spider-Man red web lines and blue suit; Superman blue/red with a gold crest; Samurai a horned helmet and layered armor. They do not change collisions or confer protection.

High-frequency control feedback is immediate. Existing button transitions name background/color/scale and last 150ms. Press scale is .96. Reduced motion disables these transforms/transitions and the engine’s decorative movement/shake. Audio remains opt-in through interaction, with separate music/effect volumes and mutes.

## Do and do not

Reuse the bark/cream/amber tokens, native dialogs, existing sprites, numeric slots and compact menu. Put help in GUILD and owner setup in documentation. Keep utility text off the live scene. Preserve labels, visible focus, safe-area padding, retry paths and state cues beyond color.

Do not add a landing-page hero, new font, wallet relay, second game engine, fake leaderboard, guest persistence or client-priced purchase. Do not infer that a wallet connection authenticates an account; saved play requires the explicit verified login.

## Review and attribution

All six Better Interface domains were reviewed against source and rendered Chromium states; fixes and unperformed subchecks are recorded in VALIDATION.md. Physical-device/Safari, native screen-reader and native browser-zoom checks remain unperformed. The original guide attribution and licenses are preserved at `docs/licenses/better-interface.txt` (Better Interface/MIT and documentation guidance/Apache-2.0).
