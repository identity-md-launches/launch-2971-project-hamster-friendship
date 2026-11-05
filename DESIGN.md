# Squeek design system

## Overview

Squeek is the existing Hamster Friendship browser adventure for keyboard and touch players. Keep its locally drawn pixel art, warm bark/cream/amber interface, serif game titles and compact utilities over the scene. The game and Start action occupy the first screen; there is no separate marketing page. Four environments change the scenery and combat while the interface keeps the same visual language.

Canonical sources are `src/styles.css` (DOM tokens/components), `src/rules.js` (environment metadata and growth), `src/game.js` (pixel art/engine) and `src/ui.js` (native dialog contents). `dist/` is generated from these sources. Do not hand-edit a separate design in the export.

## Colors

The existing hex primitive/semantic system is retained in `src/styles.css:3`.

| Role/token | Implemented value | Use |
| --- | --- | --- |
| `--color-bg` / `--bark-950` | `#1a110b` | Page, canvas letterboxing, accent-button text. |
| `--color-surface` / `--bark-900` | `#26180f` | HUD, dialog, readable status backgrounds. |
| `--color-surface-raised` / `--bark-800` | `#352216` | Secondary buttons and fields. |
| `--color-border` / `--bark-700` | `#563823` | Separators and hover surface. |
| `--color-border-strong` / `--bark-600` | `#7a5233` | Field boundaries and inset button outlines. |
| `--color-text` / `--cream-50` | `#fbf3e4` | Primary labels/headings. |
| `--color-text-muted` / `--cream-200` | `#e6d3b5` | Hints, statistics labels and secondary prose. |
| `--color-accent` / `--amber-400` | `#f2a93b` | Primary actions, selected weapons, range controls. |
| `--color-accent-hover` / `--amber-300` | `#f8c878` | Hover and pressed touch action. |
| `--color-focus` / `--amber-200` | `#fbdba6` | 3px keyboard focus outline, 2px offset. |
| `--color-danger` / `--berry-400` | `#e9735f` | Errors and boss-health fill. |
| `--color-overlay` | `rgb(26 17 11 / 0.84)` | Existing overlay role; game screens also use their established 0.68 alpha surface. |

Environment materials are canvas art, defined by `HamsterRules.maps`: forest floor/edge/accent `#73502b/#c9bc52/#e0a653`; glacier `#487b92/#cff4f4/#83dce8`; caldera `#443941/#e59052/#ffb269`; reef `#366b75/#b6ded0/#75d9ce`. Do not use those art colors as a parallel DOM button theme. There is one intentional dark interface, not a new light/dark toggle.

The current taste probe checks contrast pairs it can resolve on opaque DOM backgrounds. Text composited over the canvas/alpha overlays is excluded from that numeric result; no contrast ratio for those pixels is asserted. See the current production-integration section of VALIDATION.md for browser observations and accessibility audit limits.

## Typography

`--font-display` is Georgia, Iowan Old Style, Palatino Linotype, Book Antiqua, serif; headings use 700 and 1.1 line height. `--font-body` is system-ui, -apple-system, Segoe UI, Roboto, Helvetica Neue, Arial, sans-serif; body is 400 and 1.5 line height, buttons 700 and 1.2. No fonts are downloaded. System fallback choice depends on the visitor's platform.

The available existing scale is `--text-sm: .875rem`, `--text-base: 1rem`, `--text-lg: 1.25rem`, `--text-xl: 1.75rem`, `--text-2xl: 2.5rem` (14/16/20/28/40px at default root size). The final first screen uses fewer than six sizes. The largest token is retained, not claimed as a currently rendered role. Mobile header/title adaptations reuse the existing scale. Labels and body have natural letter spacing; HUD values, balances and ranking columns use tabular numerals. Canvas name tags use a separate bold 10px pixel-scene label.

Keep prose in ordinary casing. `PICK UP` is explicitly requested touch-action wording; GUILD and SQK retain the product's established names. Preserve readable full values in profile/dialog/table cells with wrapping rather than ellipsis. `.leaderboard` uses fixed column proportions (18/32/34/16 percent), with scores aligned to the end.

## Layout

Spacing tokens are 4, 8, 12, 16, 24, 32 and 48px. Use the existing 12–16px screen gutters and safe-area insets for controls; dialog content uses 16px gaps and 16/24px padding. The stage fills `--play-width`/`--play-height`, synchronized with VisualViewport in `src/viewport.js`.

The canvas keeps 192 logical rows and a 288–416-column backing view. In portrait it retains a centered 5:3 scene; wide views letterbox beyond the supported aspect instead of stretching pixels. `image-rendering: pixelated` and disabled canvas smoothing preserve the art.

Header utilities, four primary HUD metrics, environment/countdown and boss status live in `.game-chrome`. `src/game.js` observes its actual height and writes `--chrome-height` on the stage. The **final** `.overlay`, `.rotate-overlay`, `.dialogue`, toast and error rules at the end of `src/styles.css` use that measured height. These supersede the earlier fixed padding/insets: screens get their own scroll space below the chrome, including enlarged text. `justify-content: safe center` centers when content fits and starts at the top when it needs to scroll, with a flex-start fallback. The redundant title-state rotate hint is hidden; the functional rotate overlay remains after Start.

Responsive behavior:

- At 52rem or a coarse pointer, show joystick and action controls. Joystick/Attack/Jump are 104/92/68px; weapon slots are 56×68px with 10px gaps.
- At 28rem, joystick/Attack/Jump become 88/76/64px and weapon slots 48×68px with 8px gaps. Utilities wrap; fullscreen moves into Menu on the narrow entry screen.
- At 23rem, put weapon slots above the joystick to keep their hit regions apart.
- Touch `PICK UP` is at least 112×52px and appears only near a weapon. PC uses E. Contextual story actions remain separate.
- Under 40rem, wallet dialogs become bottom sheets and shop actions move below item descriptions. Profile stats collapse to one column below 22rem.
- Dialog actions wrap their complete labels and stay at most 100% of the content width. `#panel-content` and `.profile-form` use `minmax(0, 1fr)` tracks so long retry labels cannot force the name input outside a 390px viewport at 200% root text size, including the RTL mirror. This uses the existing gaps, type scale and button styles.
- Landscape under 34rem height keeps compact chrome and hides the duplicate header wardrobe shortcut; Change it stays available in Menu.

Actual export checks covered 320/390/1440 widths, 844×390 touch landscape and 390×844 portrait, plus 200% root text with an RTL mirror. The pixel world and physical left/right control layout remain directional game conventions. This is not a translated RTL locale or native iPhone validation.

## Elevation & Depth

The scene is the base plane. Touch controls are z-index 3; game screens/context pickup 4; dialogue 6; toast 7; chrome 8; rotation overlay 9; viewport/error notices 10. Native `<dialog>` elements use the browser top layer with a dark backdrop and automatic focus containment. The HUD and dialogs use opaque tonal surfaces. Secondary buttons/weapon slots use inset outlines; there is no added card grid, gradient text, or nested decorative elevation. The brand keeps its original text-shadow to remain visible against the scene.

## Shapes

Existing `--radius-sm/md/lg` are 6/10/16px. Buttons use 10px, fields/HUD/weapon slots 6px and dialogs 16px. Joystick, thumb and Attack/Jump retain circular geometry. A selected weapon has its own inset selected outline and `aria-pressed` state. Pixel art uses integer rectangles/ovals, except the intentionally exact 70% world-coin destination size of 25.2×21.7 logical pixels.

## Components

- **Buttons:** `.btn`, `.btn-primary`, `.btn-secondary`, `.btn-small` in `src/styles.css`. Native buttons expose rest/hover/pressed/focus/disabled states. Transitions explicitly name color/background/scale, last 150ms and use `cubic-bezier(0.2,0,0,1)`. Press scale is 0.96; reduced motion disables transitions/scale.
- **Game screens:** `#screen-start/pause/over/end` in `src/index.html`, controlled by `showScreen` in `src/game.js`. Start is the entry action; ending offers Play again. Boss celebrations suspend combat hazards and automatically travel after the short animation; exiting queues a completed victory. Preparing-map errors remain visible and retryable. The first screen's existing `#entry-save` is now a polite status region: checking/unavailable states explicitly retain the unsaved-guest label without moving the Start action off the screen.
- **Controls:** `.joystick`, `.pad-btn`, `.weapon-slot`, `#pickup-weapon`. Each action owns its pointer until release/cancel; a second pointer cannot release it. The joystick has separate ownership, so moving and attacking still work together. Inactive slots retain the existing empty appearance; owned/selected slots show weapon, count and pressed state. A pointer click on a weapon slot returns focus to the canvas for Space/Enter gameplay; deliberate keyboard activation keeps slot focus and native toggling. These paths were rechecked at 1440×900 and touch 844×390 in the revision.
- **Produce/growth:** `SPR.produce` contains five local pixel sprites. Proximity collection differs from explicit weapon collection. `nearbyWeapon()` in `src/game.js` defines both the offered prompt and the manual collection target: nearest horizontal center within 29 logical pixels and vertical center within 25, with strict bounds. One E/PICK UP action takes that one weapon; produce/coin proximity uses its existing overlap test. `HamsterRules.growth` increases at each 20-point boundary, with foot-anchored drawing and a fixed collision body.
- **Wallet:** one `#btn-wallet` on the first screen, original EIP-6963/legacy MetaMask provider logic in `src/wallet.js`, 48px connection rows, full wrapped address in the sheet and short address in the header. Connect and explicit signed login remain distinct. Escape/backdrop/close dismiss the dialog; close returns focus to that Connect control. Existing mobile Open in MetaMask behavior remains.
- **Panels:** `src/ui.js` builds labeled profile fields, stats, audio ranges/mutes, marketplace/wardrobe and the lifetime table. Native dialogs provide modal keyboard behavior. Name errors use `aria-invalid`/associated text. Async mutations disable the relevant action and expose plain error/retry messages. Profile offers **Check cloud connection** before authentication and **Retry cloud save** for authenticated players. Retrying an unavailable backend restores the enabled control and displays a short retry outcome instead of duplicating the full status paragraph. Legacy/recovery downloads are explicitly unverified or uncredited.
- **Cloud readiness:** `src/save.js` distinguishes valid public configuration, backend readiness and a successfully authenticated profile. Only the last is a saved wallet. A missing/incompatible backend blocks signing before a wallet prompt. The connected-wallet sheet exposes the same connection retry. UI text describes finishing cloud setup; schema versions and SQL details belong in the owner documentation. Startup/retry states are textual, use existing muted/error roles, and do not rely on color.
- **Rankings:** uses the SQL Top 100 RPC with table/caption/column headers and loading/empty/error/success states. Refresh retains rows, table identity and reading position. The current production RPC is unavailable and the interface shows a recoverable error with zero invented rows; local SQL fixture tests separately exercise successful records and refresh. No local guest score or seeded player becomes a production ranking.
- **Audio:** `src/audio.js` retains the original volume/mute key and lullaby. Distinct weapon waveforms share compression, a conservative master gain, a 24-voice limit and bounded scheduling. Audio starts through a user play/preview action.

## Do's and Don'ts

Reuse these tokens and native panels when adding a utility: add its Menu button, render into the existing player dialog, supply a useful empty/error state and preserve focus return. Keep a primary game action visible on a normal 390-wide entry. Keep directions near the controls, and expose pending/unsaved states truthfully.

Do not turn art palettes into competing interface themes, shrink critical text to fit, add another wallet identity store, import local totals into verified rankings, or place controls beneath fixed chrome. Preserve the existing economics, domain, data keys and source/build structure. A new environment belongs in the shared map rules and the compatible database protocol together.

Design guidance: Jakub Krehel's Better Interface, MIT. Documentation guidance: Paul Bakaus's Impeccable, Apache-2.0. Existing combined attribution/licenses are retained in `docs/licenses/better-interface.txt`. Review evidence and unverified areas are in `VALIDATION.md`.
