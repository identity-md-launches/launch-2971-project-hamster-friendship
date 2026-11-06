# Squeek design system

## Overview

The existing canvas adventure remains the product: pixel art and four authored environments, with compact bark, cream and amber controls over the scene. There is no separate marketing page. The game, title and Start adventure action appear on the first screen at 390 CSS pixels.

The canonical sources are `src/styles.css` for DOM tokens and components, `src/game.js` for canvas art/physics, `src/rules.js` for environments and `src/ui.js` for dialog contents. `dist/` is a generated copy. This revision preserves the visual identity and changes movement behavior, Profile content and score explanations.

## Colors

The original hex primitive/semantic system in `src/styles.css:3` is retained. Components use semantic roles.

| Semantic role | Value / primitive | Use |
| --- | --- | --- |
| `--color-bg` | `#1a110b` / bark-950 | Page, letterboxing, primary-button text |
| `--color-surface` | `#26180f` / bark-900 | Dialogs, HUD and readable status surfaces |
| `--color-surface-raised` | `#352216` / bark-800 | Secondary buttons |
| `--color-border` | `#563823` / bark-700 | Separators and hover structure |
| `--color-border-strong` | `#7a5233` / bark-600 | Inputs and inset control boundaries |
| `--color-text` | `#fbf3e4` / cream-50 | Headings, values and main text |
| `--color-text-muted` | `#e6d3b5` / cream-200 | Hints, statistics labels and supporting prose |
| `--color-accent` | `#f2a93b` / amber-400 | Primary action and selected weapons |
| `--color-accent-hover` | `#f8c878` / amber-300 | Hover and pressed controls |
| `--color-focus` | `#fbdba6` / amber-200 | Keyboard focus |
| `--color-danger` | `#e9735f` / berry-400 | Errors and boss health |
| `--color-overlay` | `rgb(26 17 11 / 0.84)` | Existing overlay role |

The forest, glacier, caldera and reef colors in `HamsterRules.maps` are canvas materials, not alternative DOM themes. No new theme or font dependency was introduced. Opaque DOM text is covered by the taste/Axe checks; composited canvas/alpha text is excluded from the taste probe’s contrast measurements. See the validation report for precise coverage.

## Typography

- Display: `Georgia, "Iowan Old Style", "Palatino Linotype", "Book Antiqua", serif`, weight 700, heading line-height 1.1.
- Body: `system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif`, weight 400, line-height 1.5. Buttons use 700 and 1.2.
- Existing scale: `--text-sm: .875rem`, `--text-base: 1rem`, `--text-lg: 1.25rem`, `--text-xl: 1.75rem`, `--text-2xl: 2.5rem` (14/16/20/28/40px at the default root). The largest token is retained, not a claim that it appears on this screen.
- Natural casing and tracking; headings use `text-wrap: balance`. SQK, scores, timers and tables use tabular numbers. Full wallet addresses and large values wrap; they are not ellipsized in Profile.

Fonts use the visitor’s installed fallbacks; there are no font downloads. The canvas’s small pixel-scene labels are separate from the DOM type scale. Preserve the established SQK, GUILD and PICK UP labels.

## Layout

Spacing tokens are 4, 8, 12, 16, 24, 32 and 48px. Controls use existing 12–16px gutters and safe-area insets; dialog content uses a 16px grid gap and 16/24px padding. The stage follows `--play-width` and `--play-height`, synchronized by VisualViewport in `src/viewport.js`.

The canvas keeps 192 logical rows and a 288–416-column backing view. Portrait centers a 5:3 scene; other aspect ratios letterbox instead of stretching the pixels. Retain `image-rendering: pixelated` and disabled canvas smoothing.

`.game-chrome` keeps the title/utilities, wrapping HUD, environment/countdown and boss status over the scene. A ResizeObserver writes its measured height to `--chrome-height`. The final rules at the end of `styles.css` place overlays, dialogue, errors and notices below that measured chrome. Scrollable overlays use flex-start with safe-center enhancement when content fits.

Responsive behavior from the final CSS:

- At 52rem or a coarse pointer, `.touch-movement` covers the full left half and touch combat controls appear. It is transparent, unfocusable and has no ring, thumb, border or fixed movement radius. `touch-action: none`, local overscroll suppression and disabled touch callouts protect the gesture.
- Coarse defaults: Attack 92×92px, Jump 68×68px, weapon targets 56×68px with 10px gaps. At 28rem the existing smaller variants apply; at 42rem landscape weapon targets become 44px wide.
- Portrait stacks weapon slots and story/pickup prompts in the right half above Jump and Attack. Short portrait screens use the existing action-row arrangement. At 320px Profile statistics become one column.
- Landscape story actions begin 4px inside the right half with a minimum 64px target; PICK UP begins 76px inside that half with its 112×52px minimum. Both remain below the chrome and avoid the weapon/attack controls at the checked sizes. This closes the previous left-half obstruction.
- At 40rem dialogs use the existing 16px padding and mobile wallet-sheet treatment. Dialog bodies scroll vertically, headings stay sticky and focus targets account for the actual sticky heading height.

The physical left/right game geometry intentionally follows the brief. It is not mirrored for RTL. Current rendered widths and unverified zoom/device variants are recorded in `artifacts/validation.md`.

## Elevation & Depth

Keep the flat, dark surface hierarchy. Secondary controls use an inset boundary rather than a new outer border plus shadow. Native dialogs use the existing dark backdrop; the canvas title keeps its established text shadow for readability. The invisible movement surface is at z-index 2, action controls above it, chrome at 8, rotation UI at 9 and notices at 10. Decorative layers do not intercept controls.

## Shapes

Existing radii are 6px (`--radius-sm`), 10px (`--radius-md`) and 16px (`--radius-lg`). Jump and Attack remain circular; weapon slots use the small radius. Their circular visual shape is an action-button convention, not a movement boundary.

## Components

**Buttons and focus** (`styles.css`, `.btn`, `.btn-primary`, `.btn-secondary`): native buttons/links with 44px minimum height, 700 weight and explicit background/color/scale transitions over 150ms. Press scale is .96. `:focus-visible` uses a 3px focus outline with 2px offset; canvas focus is inset. Reduced motion removes transitions/scale feedback; forced-colors rules retain system outlines/borders.

**Direct movement** (`game.js`, `beginMovement`, `moveTouch`, `updateTouchVector`, `releaseMovement`, `updatePlayer`): drag displacement maps to a bounded world target using the rendered canvas scale. Normalized vectors approach the target and settle when the finger rests. Capture belongs to one finger; action buttons keep separate pointers. Release/cancel/lost capture, blur, pause and orientation changes clear steering. A short horizontal brake ends drift; normal gravity, jump, damage, stomp and tile collision remain. `clearInput` synchronizes control visibility immediately at state transitions so the first drag after dialogue is available before the next animation frame. The Touch Events fallback runs only without Pointer Events. Desktop keys/mouse stay available.

**Profile** (`ui.js`, `profilePanel` and `summary`): native labeled nickname form, live save status, responsive statistics, full verified wallet address and plain personal-best explanation. The old browser-save warning and both requested buttons are absent; exclusive detection/export UI state is removed. Removing them closes their grid rows naturally. Run-conflict recovery remains conditional and distinct. Wallet details provide Sync progress; periodic/online saving remains automatic.

**Rankings** (`ui.js`, `leaderboardPanel`): semantic caption/headers, positive verified-wallet personal bests, deterministic server order and a 100-row cap. Loading, empty, retained-row error and success states remain. Refresh updates cells without remounting the table or moving reading position. Scores use the same backend value as Profile. Column widths remain 18/32/34/16 percent.

**Other panels**: reuse the existing native dialog, sticky header, close button, focus return, labeled audio controls, marketplace rows and GUILD disclosure. No unrelated design or feature was replaced.

## Do’s and Don’ts

Reuse semantic tokens, the existing type scale, `.btn` variants and the native dialog pattern. Keep instructions beside controls, let wallet values wrap and keep the left half free for movement. Preserve the local sprites, environment colors and pixel rendering. Do not add a visible stick, decorative badge system, new font, theme toggle or replacement game framework.

To add another panel, reuse `el()`/`action()` and the existing dialog grid, provide a real heading and labeled controls, retain Escape/focus return, and inspect narrow/large-text wrapping. Generate `dist/` from source after changes.

Design guidance: Jakub Krehel’s Better Interface (MIT); documentation method: Paul Bakaus’s Impeccable (Apache-2.0). Existing notices/licenses remain in `docs/licenses/better-interface.txt`. Current review evidence and limitations are in `artifacts/validation.md`.
