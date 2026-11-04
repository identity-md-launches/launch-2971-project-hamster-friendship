# DESIGN.md: Hamster Friendship, The Lost Alice

Source of truth: `src/styles.css` (tokens and components), `src/index.html` (structure) and `src/game.js` (in-game pixel art). `dist/` is a copy of `src/`. Values below are taken from that source. None of the rendered appearance has been confirmed in a browser yet (see `VALIDATION.md`).

## Overview

A single page for a browser game. Players are anyone who wants a short, cosy adventure, on a desktop keyboard or a phone. The page exists to put the game in front of them: title and one plain line, then the HUD, the game stage and its **Start chapter** button, all on the first screen at 390px wide. Instructions and the story sit below the game.

Visual character: a warm autumn dusk. The page chrome is a dark bark-brown frame with cream text and a single amber accent, so the colourful pixel-art stage carries the mood. Chrome is quiet and rounded; the game art is crisp pixels at a 320x192 internal resolution scaled up with `image-rendering: pixelated`.

System-wide rules versus one-off arrangement: the tokens, button styles, focus ring and overlay pattern are reusable. The header/HUD/stage/touchpad stack is this page's arrangement, not a rule for other pages.

## Colors

Two tiers in `src/styles.css` `:root`. Primitives are named by hue (`--bark-*`, `--cream-*`, `--amber-*`, `--berry-400`) and are not used by components. Components use only the semantic tokens:

| Token | Value | Job |
| --- | --- | --- |
| `--color-bg` | `--bark-950` `#1a110b` | Page background |
| `--color-surface` | `--bark-900` `#26180f` | HUD bar, dialogue box, toast |
| `--color-surface-raised` | `--bark-800` `#352216` | Secondary buttons, `kbd`, boss bar track |
| `--color-border` | `--bark-700` `#563823` | Footer divider, secondary button hover, pressed touch button |
| `--color-border-strong` | `--bark-600` `#7a5233` | Secondary button outline, dialogue outline, `kbd` underside |
| `--color-text` | `--cream-50` `#fbf3e4` | Primary text |
| `--color-text-muted` | `--cream-200` `#e6d3b5` | Lede, HUD labels, hints, prose, footer |
| `--color-accent` | `--amber-400` `#f2a93b` | The one filled action per view, links, dialogue speaker name |
| `--color-accent-hover` | `--amber-300` `#f8c878` | Primary button hover |
| `--color-on-accent` | `--bark-950` | Text on amber |
| `--color-focus` | `--amber-200` `#fbdba6` | Focus outline |
| `--color-health` | `--berry-400` `#e9735f` | Hearts and the cockroach health bar |
| `--color-overlay` | `rgb(26 17 11 / 0.84)` | Game screens drawn over the canvas |

The stage background `#2e2245` matches the top band of the in-game sky, so the stage never flashes a different colour before the first frame.

In-game art uses its own fixed palette inside `src/game.js` (sprite palettes `PAL_CHANG`, `PAL_ALICE`, `PAL_BEETLE`, the sky `bands` array, tile colours in `buildWorldArt`). It is warm: dusk purples to amber sky, rust and orange canopies, olive-gold grass, brown earth. Chang is orange with a green scarf; Alice is cream with a red ribbon. Keep new art inside these families.

Contrast ratios have not been measured in a browser; see `VALIDATION.md`.

## Typography

| Role | Family | Size token | Weight | Line height |
| --- | --- | --- | --- | --- |
| Page title `h1` | `--font-display` (Georgia, Iowan Old Style, Palatino Linotype, Book Antiqua, serif) | `--text-xl` 1.75rem; `--text-2xl` 2.5rem from 48rem | 700 | 1.1, `text-wrap: balance` |
| Section and screen titles `h2` | `--font-display` | `--text-lg` 1.25rem | 700 | 1.1 |
| Body, buttons | `--font-body` (system-ui stack) | `--text-base` 1rem | 400 body, 700 buttons | 1.5 body, 1.2 buttons |
| HUD, hints, `kbd`, toast, footer | `--font-body` | `--text-sm` 0.875rem | 400 / 700 | 1.5 |

No web fonts are loaded; both stacks are system fonts, so no font files are needed. Only weights 400 and 700 are used. At any one width the page uses four sizes (14, 16, 20 and 28 or 40px). Changing numbers (shell count, health, clues, end stats) use `font-variant-numeric: tabular-nums`. Text is sentence case and never letter-spaced. Prose is capped at 60 to 62ch; descriptions use `text-wrap: pretty`.

In-game text (the "E" and "!" prompt bubbles) is drawn as 3x5 pixel glyphs (`GLYPHS` in `game.js`). Story text is always HTML, never canvas text, so it stays readable and accessible.

## Layout

- Spacing steps `--space-1` to `--space-7`: 4, 8, 12, 16, 24, 32, 48px.
- `.page` is the layout primitive: full width, max `--stage-max` (960px) plus 16px inline padding on each side, centred.
- Vertical order: header, `.game` (HUD, stage, touchpad, hint), `.info` (how to play, story), footer.
- `.stage` is a one-cell CSS grid. The canvas and every screen (`.overlay`, `.dialogue`, `.toast`) sit in the same cell, so a screen taller than the canvas grows the stage instead of being clipped.
- The canvas keeps a 5:3 aspect ratio at 100% width (390px wide gives about 234px tall; 960px gives exactly 3x).
- Breakpoints: `min-width: 48rem` makes the title 2.5rem and puts how-to-play and story side by side. `max-width: 52rem` or `pointer: coarse` shows the touchpad and the touch hint (and hides the keyboard hint). `max-width: 22rem` stacks the controls list into one column.
- The HUD is a wrapping flex row; the Pause button is pushed to the trailing edge with `margin-inline-start: auto`.
- Logical properties are used for inline spacing (`margin-inline`, `padding-inline-start`, `inset-inline-start`).

## Elevation and depth

Flat chrome. Depth comes from tone (bg, surface, raised surface), not drop shadows. Inset `box-shadow` rings outline secondary buttons, the dialogue box and `kbd` keys; no element has both a border and a shadow. Stacking inside the stage: canvas, dialogue (`z-index: 3`), toast (4), game screens (5). Depth inside the game comes from parallax layers (clouds 0.08, hills 0.15, far trees 0.3, mid trees 0.55, world 1.0) and a soft vignette.

## Shapes

`--radius-sm` 6px (`kbd`), `--radius-md` 10px (buttons, HUD bar, dialogue), `--radius-lg` 16px (stage), `999px` pills (toast, boss bar). The stage clips the canvas to its radius.

## Components

All in `src/styles.css`, used in `src/index.html`.

- **Button** `.btn` with `.btn-primary` (amber fill, one per view) or `.btn-secondary` (raised surface with an inset outline). `.btn-small` is 40px tall; the default is 44px. States: hover brightens (only on `hover: hover` devices), `:active` scales to 0.96, `:focus-visible` shows a 3px `--color-focus` outline. Transitions name their properties (`background-color, color, scale`, 150ms).
- **HUD** `.hud`, `.hud-item`, `.hud-value`, `.hearts` and `.heart.is-full`, `.hud-bar` and `.hud-bar-fill`. Health shows hearts and a numeric `2/3`, so state is not carried by colour alone. The cockroach bar appears only during the boss fight and carries an updated `aria-label`.
- **Game screen** `.overlay` with an `h2`, `.overlay-text` and `.overlay-actions`. Variants: start, pause, game over, chapter complete (adds `.stats`). Opening a screen moves focus to its primary button (`showScreen` in `game.js`).
- **Dialogue** `.dialogue`: speaker `.dialogue-name`, text `.dialogue-text` (`aria-live="polite"`), a **Next**/**Continue** button and the hint "or press E". Focus moves to the button while it is open and back to the canvas when it closes.
- **Toast** `.toast` (`role="status"`): short non-blocking messages such as "Clue found: 2 of 3". Hidden with opacity after about 2.5 seconds; the element stays in the DOM so repeat announcements work.
- **Touchpad** `.touchpad`, `.pad-group`, `.pad-btn` (at least 52x48px, `touch-action: none`, `.is-pressed` state). Hold-to-move uses pointer capture; keyboard activation of a pad button gives one tap.
- **Key cap** `kbd`, used in the controls list and hints.
- **Skip link** `.skip-link` to `#stage`, visible on focus.

## Do's and Don'ts

- Do start a new page from `.page` and the semantic tokens; never use a `--bark-*` or `--amber-*` primitive directly in a component.
- Do give each view one `.btn-primary`; use `.btn-secondary` for its peers.
- Do keep story and UI text in HTML. The canvas draws art and the two pixel prompt glyphs only.
- Do add new game screens as `.overlay` siblings inside `.stage` and register them in the `screens` list in `game.js`.
- Don't add a third typeface, another font weight or a sixth size step.
- Don't add tracked uppercase labels above headings, em dashes or emoji in copy.
- Don't use `transition: all`, and keep in-game motion behind the `reduceMotion` flag as the existing code does.
- Recipe for another page (for example chapter two's landing page): copy the `head` metadata block, keep `header.site-header.page` with one `h1` and one plain lede, put the primary action in the first screen, reuse `.info`/`.prose`/`.controls` for supporting content, and finish with `footer.site-footer.page`.
