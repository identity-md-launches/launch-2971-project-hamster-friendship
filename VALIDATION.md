# Validation record

Worker's report for the chapter one build. It is not an independent certification.

## Completion: Incomplete (useful, unverified delivery)

The game, source, export, README and DESIGN.md are complete for the stated scope. **Nothing was executed.** In this session:

- The Bash tool failed on every call with: `Sandbox is required but failed to initialize: Failed to create bridge sockets after 5 attempts.` No shell command could run: no `npm install`, `npm run build`, `npm run check`, `node`, `git`, or the design probe.
- The browser tool failed to navigate with: `Browser "chrome-for-testing" is not installed; ... Run npx @playwright/mcp install-browser chrome-for-testing`. That install needs the shell, which was unavailable.

So the required build, typecheck, interaction validation and rendered review **did not run**. Everything below that is marked as checked was done by reading the source.

## 1. Scope and assumptions

- One page: `src/index.html`, exported to `dist/index.html` with `styles.css`, `game.js`, `favicon.svg` and `og-image.svg`. Relative URLs only.
- Stack: plain HTML/CSS/JavaScript with no dependencies, instead of the default Vite + React + TypeScript. Reason: no package could be installed or built in this session, and a dependency-free classic script needs no build to run. The build step (`scripts/build.mjs`) is a copy from `src/` to `dist/`.
- `dist/` was written by hand as copies of `src/` because the build script could not run. Line counts were compared with the search tool and match for all five files (index.html 171, styles.css 621, game.js 1668, og-image.svg 37, favicon.svg 15). A byte-for-byte comparison was not possible; `npm run check` does that.
- No wallet code: the brief asks for a game playable without a wallet, and the site is not a dapp.
- `og:image` is an SVG (`og-image.svg`), because no PNG could be generated without a shell. Some link-unfurl services do not render SVG images.
- Inferred choices: Chang's green scarf and Alice's red ribbon as identifying details; Mrs. Pebble the snail as the hint-giving character; lanterns as checkpoints; the cockroach being dazed by a shield block as the boss's weak point.

## 2. Coverage by Better Interface domain

| Domain | Status | What was done | Unperformed |
| --- | --- | --- | --- |
| Accessibility | Checked (source only) | Native `button`s for every action; one `h1`; `main` landmark; skip link to the stage; `:focus-visible` 3px outline token; focus moves to the primary button on every game screen and to **Next** in dialogue, then back to the canvas; full keyboard path for start, play, dialogue, pause, retry, restart and ending; touch buttons are at least 48px tall; icon-only pad buttons have `aria-label`; decorative SVGs `aria-hidden`; dialogue text and toast are polite live regions; health shown as hearts plus a number; reduced motion turns off falling leaves, fireflies, screen shake, the intro flash and beam, idle bob and particle density | Screen-reader session; rendered focus ring visibility over each background; 200% zoom; forced-colors rendering; physical touch device |
| Layout | Checked (source only) | First screen order at 390px: title, one-line lede, HUD, stage with **Start chapter**, touchpad. Stage is a one-cell grid so tall screens grow instead of clipping. Inline margins of 16px; controls grouped; Pause sits at the HUD's trailing edge | Rendered check at 320, 390 and 1440 for overflow, overlap and the first screen |
| Writing | Checked | Verb-first labels (Start chapter, Resume, Restart chapter, Try again, Play again); sentence case throughout; directions next to their controls (keyboard hint under the stage, "or press E" beside Next); one term per thing (shells, clues, lanterns); empty-ammo message says what to do ("No shells left. Look for more.") | None beyond rendered review |
| Typography | Checked (source only) | Two system font stacks, weights 400 and 700, four sizes per width (14, 16, 20, 28 or 40px); heading line-height 1.1 with `text-wrap: balance`; body 1.5; prose capped at 60 to 62ch; `tabular-nums` on changing values; no letter-spacing; no all-caps; no em dashes or emoji in copy | Rendered wrapping and measured line lengths |
| Colors | Checked (source only) | Two-tier tokens (hue primitives, role semantics); one amber filled action per view; health colour paired with a number | **Contrast not measured.** No ratio is claimed. Pairs to measure: `--color-text-muted` on `--color-surface`; `--color-text` on `--color-overlay` over the canvas; `--color-on-accent` on `--color-accent` |
| UI | Checked (source only) | Concentric radii on nested elements are not used (no nesting of rounded surfaces); inset rings instead of border-plus-shadow; transitions name their properties (150ms, `cubic-bezier(0.2, 0, 0, 1)`); press scale 0.96; no `transition: all`; no endless CSS animation | Rendered motion review; reduced-motion run |

## 3. Findings and fixes (from source review)

| # | Severity | Location | Evidence | Fix | Recheck |
| --- | --- | --- | --- | --- | --- |
| 1 | High | `src/styles.css:260` (`.hud-item { display: inline-flex }`) | The `hidden` attribute on `#hud-boss` would be overridden by the class's `display`, so the cockroach bar would show before the fight | Added a global `[hidden] { display: none !important; }` at `src/styles.css:63` | Source reread; not rendered |
| 2 | Medium | `src/styles.css:357` and `:404` | The dialogue box (`z-index: 3`) was above game screens (`z-index: 2`), so pausing during dialogue would show the dialogue on top of the pause screen | Game screens raised to `z-index: 5` | Source reread; not rendered |
| 3 | Medium | `src/game.js:786` | The variable-jump rule cut any upward speed when Jump was not held, which would also cut the bounce after stomping an enemy | Added a `noCut` flag set on stomp bounces (`src/game.js:899`, `:1007`), cleared once falling | Source reread; not played |
| 4 | Low | `src/game.js:1341` (`drawHamster`) | Idle pose drew a stray 14px dark line every 40 frames | Removed; idle now bobs the body by 1px instead | Source reread |
| 5 | Low | `src/game.js:1015` | A shield block pushed the boss 6px with no bound, which could place it inside a gate column | Push is clamped to the arena | Source reread |

Remaining limitations, not fixed:

- `og:image` is SVG (see scope).
- The canvas is scaled to the container width, so at non-integer scales (for example 390px wide is about 1.22x) pixels are not all the same size. At 960px it is an exact 3x.
- No audio.
- Progress is not saved between page loads.

## 4. Verification

| Check | Command or method | Result |
| --- | --- | --- |
| Production build | `npm run build` | **Not run** (shell unavailable). `dist/` written as copies of `src/` |
| Typecheck / syntax | `npm run typecheck` (`scripts/check.mjs`, V8 parse) | **Not run**. Source was read through once in full for syntax and logic |
| dist matches src | `npm run check` | **Not run**. Line counts compared with the search tool: all five files match |
| Share metadata | Source read | `title`, `meta description`, `link rel=icon`, `og:title`, `og:image` present in `src/index.html` and `dist/index.html` |
| Relative asset URLs | Source read | `./styles.css`, `./game.js`, `./favicon.svg`, `./og-image.svg`; no root-absolute URLs |
| Element ids used by `game.js` | Source read | Every `byId(...)` id exists in `index.html` |
| Design probe | `node .imd/reads/skills/design-critic/scripts/taste.mjs --out test/scratch/taste` | **Not run** (shell unavailable). No screenshots exist |
| Browser inspection at 320, 390, 1440 | Browser tool | **Not run** (browser not installed) |
| Primary interactions (start, move, jump, throw, shield, interact, dialogue, pause, resume, restart, game over, retry, boss, ending) | Browser or Playwright | **Not run**. Logic traced by reading only. `window.__hamster.snapshot()` is exposed so a future Playwright check can assert state |

### Suggested commands for the next run

```sh
npm run build && npm run check
node .imd/reads/skills/design-critic/scripts/taste.mjs --out test/scratch/taste
npm run preview   # then play: start, read intro, collect shells, light a lantern, beat the cockroach, read the ending
```
