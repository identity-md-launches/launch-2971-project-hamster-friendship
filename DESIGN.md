# Hamster Friendship design system

## Overview

This is the existing pixel-art forest adventure, with compact HTML controls around its 320×192 canvas. Keep the bark-brown surfaces, cream text, amber actions, original hamster sprites and authored forest. Four seasonal skies and small ambient effects extend that scene. Player panels use the existing native dialog rather than a new page or marketing layout.

The product and Start chapter action are visible on the first 390×844 screen. A returning player instead sees Continue map N plus Replay map 1. SQUEEK.ALICE and SQUEEK.HAMSTER remain identity/domain concepts in the footer; they do not imply domain ownership or resolution.

Sources: `src/styles.css`, `src/index.html`, `src/game.js`, `src/ui.js`, `src/rules.js`, `src/audio.js`. The final compact overrides start at the “Compact upgrade” comment in styles.css; those values supersede earlier header, stage and control sizing. Browser evidence and review limits are in VALIDATION.md.

## Colors

Reuse the existing two-tier hex tokens in `styles.css :root`. Components use semantic roles. Sprite, coin, badge and seasonal artwork retain explicit art palettes.

| Semantic token | Resolved value | Role |
| --- | --- | --- |
| `--color-bg` | `#1a110b` | Page and input background; amber-button text |
| `--color-surface` | `#26180f` | HUD, dialogs, dialogue, toast, name labels |
| `--color-surface-raised` | `#352216` | Secondary buttons, key caps, joystick thumb |
| `--color-border` | `#563823` | Dividers and secondary hover |
| `--color-border-strong` | `#7a5233` | Inset outlines, field/joystick boundaries |
| `--color-text` | `#fbf3e4` | Primary text, Dice faces |
| `--color-text-muted` | `#e6d3b5` | Hints, rules and secondary labels |
| `--color-accent` | `#f2a93b` | Primary action fill, links, selected-control edge |
| `--color-accent-hover` | `#f8c878` | Primary hover fill |
| `--color-on-accent` | `#1a110b` | Text on amber |
| `--color-focus` | `#fbdba6` | 3px keyboard focus perimeter |
| `--color-health` | `#e9735f` | Health, inline errors |
| `--color-overlay` | `rgb(26 17 11 / 0.84)` | Translucent game screens |

Primitives are bark-950/900/800/700/600, cream-50/200, amber-400/300/200 and berry-400. There is one fixed HTML theme, not a separate light/dark mode. The dialog backdrop is `rgb(10 7 5 / 0.8)`.

The final rendered entry probe measured cream title/page **16.87:1**, secondary button text **13.68:1**, muted HUD label/surface **11.76:1**, and primary HUD value/surface **15.61:1**. These are identified HTML pairs, not a claim that canvas art or translucent overlays were measured. Eight text boxes over media remain outside the probe's contrast measurement.

Artwork: coin edge `#6d3d07`, shadow `#d78a16`, face `#f6c343`, highlight `#ffe28c`, lettering `#543006`. Badge faces use bronze `#c99160`, silver `#c4d2db`, gold `#f6c343`, with explicit source/tier labels so color alone never communicates exchangeability. Seasonal sky bands live in `game.js paintSky`; they are environment art, not additional UI themes.

## Typography

No fonts are downloaded. Requested display stack: Georgia, Iowan Old Style, Palatino Linotype, Book Antiqua, serif. Body stack: system-ui, -apple-system, Segoe UI, Roboto, Helvetica Neue, Arial, sans-serif. The exact selected platform font may vary; no installed-font inventory was used.

| Role | Active size | Weight / line height |
| --- | --- | --- |
| Header title | 1.25rem; 1.75rem from 53rem | 700 / 1.2 |
| Game/dialog/panel heading | 1.25rem | 700 / 1.1–1.3 |
| Body, field, ordinary action | 1rem | 400 body, 700 controls / 1.5 body, 1.2 controls |
| Toolbar, HUD, hints, touch labels, footer | 0.875rem | 400 or 700 / 1.5 text, 1.2 buttons |
| Profile quantities | 1.25rem | 700 / inherited 1.5 |
| Initial Dice question marks | 1.75rem | 400 |
| Short landscape title | 1rem | 700 / 1.2 |

The original five tokens remain `--text-sm/base/lg/xl/2xl` = 14/16/20/28/40px at the default root. The 40px token is retained for compatibility; final header overrides do not use it. The entry uses 14/16/20px at 390 and adds 28px at desktop. Two weights, 400 and 700; natural tracking. Headings balance, short prose wraps prettily, longer text caps around 60–65ch. Changing numbers use tabular figures. Mobile text inputs remain 16px.

Canvas player names use bold 10px sans-serif on opaque dark rectangles, centered/clamped above characters. They scale with the canvas. SQK on collected coins remains the original 5×7 pixel glyphs; the 42×36 source coin renders at 36×31. The victory SVG has large 25-unit SQK lettering. Those are artwork sizes, separate from the HTML scale.

## Layout

Reuse `.page`: content up to 960px with 16px nominal side padding. Both side paddings honor their respective `safe-area-inset-*`. Spacing tokens stay 4, 8, 12, 16, 24, 32 and 48px. Header utilities wrap in normal flow. HUD and weapon/season/timer status are compact. Instructions are disclosed through GUILD.

The stage uses one grid cell for canvas and overlays. Canvas remains 5:3 with pixelated scaling; an overlay can grow the stage instead of clipping essential text. At 390, the scene is about 358×215px. At 1440 it is 960×576px. The world remains 224×12 tiles; Chang's visual sprite scales by 1.15 while its original collision box and platform physics stay intact.

| Condition | Active behavior |
| --- | --- |
| From 53rem | Display title 28px; lede and utility row share the next header row |
| At most 52rem, or coarse pointer | Show touchpad: 96px circular joystick left; right actions in three columns with 44px minimum height |
| Coarse landscape and height ≤34rem | Hide lede/footer/save summary; compact 32px utility buttons; 80px joystick; 168px action group beside scene. Stage width `min(100%, (100dvh − 184px) × 5/3)`, minimum 240px. Floating touchpad has automatic width and separate safe-area insets. Game-screen actions are 36px. |
| At most 40rem | Dialog padding 16px; shop actions below descriptions; wallet becomes a bottom sheet |
| At most 22rem | GUILD keyboard definition list stacks |

Dialogs are at most 640px wide (wallet 420px), normally viewport minus 32px, and at most viewport height minus 48px. Sticky title/Close stay reachable while content scrolls. Tested reflow: 320, 390, 768, 1440; landscape 667×375 and 844×390. Tested 200% text enlargement is not browser-native zoom or physical-notch testing.

## Elevation & Depth

Keep flat tonal surfaces with inset structural outlines. Do not add decorative drop shadows or nested card systems. Secondary controls use one inset outline; filled amber emphasizes the current primary action. The original forest layers and vignette provide visual depth.

Stage stacking: canvas, dialogue 3, toast 4, overlays 5; landscape controls 6 beside the scene. Native dialogs use the browser top layer and make the background inert. A dialog's sticky header uses the same opaque surface.

Victory cheers run three times; Dice settles once for 260ms. Both are enabled only without reduced motion. Ordinary button transitions name background/color/scale, run 150ms with `cubic-bezier(0.2,0,0,1)`, and use a 0.96 active scale. Reduced motion removes these scales/transitions, seasonal drift, decorative parallax, shake and intro flashes. Essential player movement and camera tracking remain.

## Shapes

Keep the original radii: small 6px, medium 10px, large 16px. The final stage uses medium; dialogs large; buttons and dice medium; keys/choice fields small. Joystick/thumb/pips are circular. Toast/HP track use pill ends. Badge shield silhouettes use a polygon clip; pixel art uses square pixels.

## Components

- **Buttons:** `.btn`, `.btn-primary`, `.btn-secondary`, `.btn-small`; neutral peer controls, one amber main action. Hover gated by hover support; visible focus 3px with 2px offset; disabled opacity 0.6. Compact sizes above are deliberate, with touch combat controls at least 44px.
- **HUD:** `.hud-item`, `.hud-value`, `.map-status`; balance/pending credit, map, enemies, shells, numeric one-hit health, clues, boss HP, weapon/ammo, season and active-time timer. No color-only state.
- **Game screens:** `.overlay`, `.dialogue`, `.stats`, `.toast`; focus moves to the active action. Dialogue cannot advance under Pause or a menu. Resume restores its line. Victory uses `victory.svg` and the existing next-map path.
- **Joystick:** `#joystick`, `.joystick-thumb`; one captured pointer, 12% dead zone and 28% travel limit, separate action pointers. Release, cancel, lost capture, blur and pause clear movement. Keyboard arrows remain available.
- **Player dialog:** `#player-dialog`, `.panel-header`; native focus trapping, Escape, Close/backdrop handling and opener focus return. Opening pauses play; closing does not silently resume combat.
- **GUILD:** template in index.html cloned by `guildPanel`; native details/summary chapters for controls, combat/rewards, Dice/badges and story. The trigger exposes expanded state.
- **Dice:** `dicePanel`, `.dice-pair`, `.die`, `.pip`, `.dice-predictions`; two distinct faces, native labeled radios, one Roll action, a stable live result and persistent counters. Empty question marks stay centered. Pending requests retry the same ID; errors preserve retry. No staking or payout control exists.
- **Badges:** `.badge-list`, `.badge-row`, `.badge-art`; explicit Dice/Skill/Contribution and display-only/exchangeable text. Marketplace Exchange controls include their full visible label in the accessible name; pending disables the button; success removes the badge, refreshes balance and focuses the section heading. Errors stay next to the badge.
- **Audio:** `audioPanel`, `.audio-setting`, `.mute-label`; native labeled range/checkbox controls with percent outputs. Preview requires a gesture, validates actual audio availability and reports storage failure honestly. The procedural engine has separate music/SFX gains and stops music on pause/hidden state.
- **Existing panels:** Profile, 10-item Marketplace, Top 100 and Mainnet/connect-only wallet keep their existing form, table, empty/error/retry and ownership patterns. Unconfigured cloud data is never replaced with sample rankings.

## Do's and Don'ts

- Start new panels from the native player dialog and existing semantic tokens/type/spacing.
- Keep the game on the first phone screen. Put extra rules in GUILD and keep controls beside their task.
- Keep device-only, pending cloud and acknowledged cloud balances distinct. Retain unknown save fields and stable profile identities.
- Show badge source in text; never make a Dice achievement look redeemable.
- Preserve keyboard/pointer cancellation, focus return, name visibility and reduced motion.
- Do not add a font, marketing hero, wallet signing, token deployment or unverified domain mapping.
- To add another utility: register it in ui.js, reuse the native dialog header, add honest empty/error states, test its 320px and enlarged-text layout, then extend the static copy list only if it needs a new runtime file.

Guidance: Jakub Krehel's Better Interface (MIT); documentation method: Paul Bakaus's Impeccable (Apache-2.0). Existing notices and full licenses remain in `docs/licenses/better-interface.txt`.
