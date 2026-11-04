# Hamster Friendship: The Lost Alice

A short 2D pixel-art adventure for the browser. You play as Chang, a small but brave hamster. He searches an autumn chestnut forest for his friend Alice, who vanished after a strange beam of light struck their village. This is chapter one: a full level with three enemy types, hidden clues, a talking snail, lantern checkpoints, a giant cockroach boss and an ending scene.

No account, wallet or server is needed. The game is plain HTML, CSS and JavaScript with no runtime dependencies.

## Play

Open `dist/index.html` from any static host, or run the local preview below.

| Action | Keyboard | Touch |
| --- | --- | --- |
| Walk | Left/Right arrows or A/D | Arrow buttons |
| Jump (hold to jump higher) | Space, W, Up arrow or Z | Jump |
| Throw a chestnut shell | X or J | Throw |
| Hold up a shell as a shield | C, K, Down arrow or S (hold) | Shield (hold) |
| Look, talk, read, advance dialogue | E or Enter | Look |
| Pause / resume | Esc or P, or the Pause button | Pause button |

The pause screen has **Resume** and **Restart chapter**. If Chang runs out of health you can try again from the last lantern you lit, or restart the chapter.

### What is in chapter one

- **Story scenes**: an intro at the overturned basket, dialogue with Mrs. Pebble the snail, signposts, a boss introduction and an ending.
- **Collectibles**: 34 chestnut shells placed in the level, plus shells from the basket, two bushes, the hollow log, defeated enemies and a tree in the boss arena. The HUD shows how many you carry.
- **Enemies**: beetles that patrol, soldier ants in acorn-cap helmets that spot you and charge, and wood-boring larvae that surface when you come close and spit wood chips.
- **Combat**: throw shells as projectiles, jump on enemies, or hold a shell up as a shield to block contact damage, wood chips and the boss's charge.
- **Clues** (three, counted in the HUD): a scorched ring in the village, Alice's ribbon on a high branch, and oily prints inside a hollow log.
- **Boss**: a giant cockroach guards the forest exit. It charges, hops and gets dazed when it hits a wall or a raised shield. A dazed cockroach takes double damage from a stomp.
- **Ending**: Chang finds a humming metal fragment past the exit. The ending screen shows shells collected, clues found and play time.

## Install, preview and rebuild

Requirements: Node.js 18 or newer. There are no npm dependencies, so `npm install` only records the empty lockfile.

```sh
npm install        # optional; nothing to download
npm run build      # copies src/ into dist/ (the production export)
npm run check      # parses game.js, checks share metadata, relative URLs, element ids, and that dist/ matches src/
npm run preview    # serves dist/ at http://localhost:4173/ (Ctrl+C to stop)
```

`npm run typecheck` is an alias for `npm run check`. The project is plain JavaScript, so there is no TypeScript compiler step; the check script parses the game with V8 instead.

You can also open `dist/index.html` directly from the file system. The game uses a classic deferred script (not ES modules), so it runs from `file://` too.

## Project layout

```
src/            source of the site (edit these)
  index.html    page, HUD, game screens, touch controls, how-to-play section
  styles.css    design tokens and all page styles
  game.js       the game: sprites, level, physics, enemies, boss, dialogue, rendering
  favicon.svg   pixel-art Chang favicon
  og-image.svg  1200x630 share image
dist/           production export (committed; what gets published)
scripts/
  build.mjs     src/ to dist/ copy
  check.mjs     static checks
  preview.mjs   tiny static server for dist/
DESIGN.md       design system as implemented
VALIDATION.md   what was checked, how, and the limitations
```

All asset URLs are relative (`./styles.css`, `./game.js`), so the export works at a gateway subpath or an ENS name. There is only one page, so no routing is needed.

## Deployment

`dist/` is a complete static site. Hosting is handled by the publishing pipeline, which pins the committed `dist/` folder; it does not rebuild. After changing anything in `src/`, run `npm run build` and commit `dist/` too.

## Validation status

See [VALIDATION.md](./VALIDATION.md). Short version: in the session that produced this commit, the shell sandbox failed to start and the browser tool had no browser installed. **No command (build, check, preview, design probe) and no browser session ran.** The `dist/` files were written as exact copies of `src/` (line counts match) rather than produced by `npm run build`, and the code was reviewed by reading only. Run `npm run build && npm run check` and play through once in a desktop browser before relying on it.

## Credits

Original game, characters, art and writing for this project. All pixel art is drawn in code at runtime (`src/game.js`); there are no image files besides the two SVG icons.
