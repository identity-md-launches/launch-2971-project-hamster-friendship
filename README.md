# Hamster Friendship: The Lost Alice

An upgrade of the [original game](https://github.com/identity-md-launches/launch-2971-project-hamster-friendship), continuing commit `6fe0476cf3c4da8a61321e06312aac3b9b1815d9`. Chang, Alice, Mrs. Pebble, the autumn forest, enemy sprites, movement physics, shield, clues, dialogue and ending remain in the existing canvas game. This is the same project, with progression, equipment and saves added.

Guest play and the marketplace work immediately. **Live Supabase features need owner configuration:** no project URL or public key was supplied. The migration and client are implemented and tested locally; the export labels device-only guest saves and does not invent global rankings.

## Install, preview and rebuild

Install Node.js 18 or newer. The existing project has no runtime dependencies; nothing needs downloading for the game. The original package manifest and lockfile are unchanged.

```sh
npm run build
npm run check
npm run preview
```

Preview opens at `http://localhost:4173/`. Stop it with Ctrl+C. Edit `src/`, rebuild, and include the resulting `dist/` with the source. The production build copies 12 complete runtime files, including local artwork. URLs are relative, so hosting at an IPFS gateway subpath works. No route rewrites are required. Guest play also works from a local `dist/index.html`; wallet and cloud use should use a served website.

`npm run check` parses every runtime script, checks metadata and element references, rejects root-absolute asset paths, and compares every exported file byte for byte. The existing `npm run typecheck` alias runs those checks too. A separate TypeScript `checkJs` configuration covers all five added frontend modules and their declarations: run `tsc -p jsconfig.json` with TypeScript 5.9.3 or a compatible installation. The original canvas engine remains JavaScript and is checked with syntax, gameplay and browser tests.

## Play

| Action | Keyboard | Touch |
| --- | --- | --- |
| Walk | Left/Right or A/D | Hold arrows |
| Jump higher | Hold Space, W, Up or Z | Hold Jump |
| Attack with equipped weapon | X or J | Attack |
| Change equipped weapon | Q | Swap |
| Shield | Hold C, K, Down or S | Hold Shield |
| Look, talk, advance dialogue | E or Enter | Look / dialogue button |
| Pause or resume | Esc or P | Pause / Resume |

One unblocked enemy hit or a fall kills Chang. The original retry screen is retained: **Try again** rebuilds the current map from its beginning, including its enemies and boss. Collected SQK, purchases and cosmetics remain. Uncollected coins, temporary weapons and ammunition are lost. There is no healing or lantern respawn. Lanterns now provide spare shells.

The original forest is replayed as deeper map tiers rather than replaced with new environments. Each tier has 30 regular enemies and one cockroach boss. The boss appears at the forest exit after 60 seconds of active gameplay; dialogue and pause stop that timer. Map 1 HP is 100 / 500. Map `n` HP is `ceil(baseHP × 1.2^(n−1))`. Defeat all 30 enemies and the boss, then inspect the original metal fragment to reach the next tier.

Every defeated enemy, including the boss, drops one large gold SQK coin. Walk over it to save it. Its lettering is centered, horizontal and drawn in bold pixels. Weapons have a 30% drop chance per defeated enemy; among those drops, guns are 30%, swords 30% and grenades 40%. Drops automatically equip, and Q/Swap cycles collected weapons.

| Attack | Effect |
| --- | --- |
| Chestnut | 25 damage; uses a shell |
| Stomp | 50 damage; boss must be dazed |
| Gun | 20 damage per bullet; each gun pickup supplies 30 bullets |
| Sword | 50 damage per hit; reusable for this map |
| Grenade | 5 damage per second to each enemy in an 80×48 pixel area, for 8 seconds; each pickup supplies 3 grenades |

Shells still come from original collectibles, basket, bushes, log, enemy drops and the arena tree. Low supplies also trigger falling shells in the forest so the larger enemy population remains playable. The shield blocks frontal contact, wood chips and the boss charge, but cannot stop a hit from behind.

## Marketplace and score

| Purchase | SQK | Behavior |
| --- | ---: | --- |
| Forest vest | 100 | Cosmetic; does not prevent one-hit death |
| Coral, sky or lilac T-shirt | 20 each | Equip one shirt |
| Jade, rose or honey chestnut skin | 100 each | Colors projectiles and the held shell shield |
| Charged Chestnut | 150 | +50% chestnut damage: 37.5 |
| Piercing Chestnut | 250 | One chestnut can hit up to 3 different enemies |
| Ricochet Chestnut | 300 | One bounce off solid terrain |

Skills stack and activate on map start/restart. Cosmetics can be equipped immediately. Owned items are not charged twice. The vest is cosmetic to respect the no-healing, one-hit rule.

The global board ranks lifetime score: 100 points per regular enemy, 500 per boss and 1,000 per completed map. Spending SQK does not reduce score. Supabase derives points from validated events; the client never submits a score or balance total. Guest scores are local and never mixed into the global board.

## Saves and wallet connection

Without Supabase configuration, name, SQK, score, purchases and cosmetics use browser storage. Clearing that storage removes guest progress. With configuration, Supabase anonymous Auth supplies a private profile session, and PostgreSQL stores profile and inventory. Pending cloud events remain in a local outbox across reloads. **Profile → Retry cloud save** retries them; pending coins cannot be spent until acknowledged.

Cloud profiles also depend on retaining their private browser session for access. Database records survive closing the page, but this upgrade does not add email recovery or cross-device sign-in. Guest balances are not uploaded when cloud service becomes available. Restart a guest run to earn cloud credit after connecting cloud saves.

**Connect MetaMask** discovers providers through EIP-6963, prefers MetaMask, supports its mobile browser link, and requires Ethereum Mainnet (`0x1`). The only allowed provider calls are `eth_accounts`, `eth_requestAccounts`, `eth_chainId` and `wallet_switchEthereumChain`. No signing, transactions, token approvals, contract deployment or token changes occur. The optional wallet is a local connection, not proof of profile ownership. Disconnect clears the site's connection; extension permissions remain controlled by the wallet.

## After launch: connect the owner's Supabase project

1. Apply [001_friendship.sql](./supabase/migrations/001_friendship.sql) to the existing Supabase project through its SQL Editor or normal migration process. It creates namespaced tables and six RPCs; the website needs no private key.
2. Enable **anonymous sign-ins** in Supabase Auth. Keep the Data API enabled with `public` exposed and `hf_private` outside exposed schemas.
3. Set `supabaseUrl` and `supabasePublishableKey` in [src/config.js](./src/config.js) to the real HTTPS project URL and browser-safe publishable key. A legacy public anon key also works while that project supports it. Never put a secret/service-role key in the site.
4. Run `npm run build && npm run check`. Update this existing site's export through its normal publishing pipeline. No duplicate project is required.
5. Verify a new browser session, profile, coin collection/reload, purchase and Top 100 against that live project. Those service checks remain outstanding until configuration exists.

See [backend setup and validation boundaries](./supabase/README.md). Blank settings deliberately disable cloud features; they are not guessed credentials. Primary references: [anonymous Auth](https://supabase.com/docs/guides/auth/auth-anonymous), [API keys](https://supabase.com/docs/guides/getting-started/api-keys), [database functions](https://supabase.com/docs/guides/database/functions), [EIP-6963](https://eips.ethereum.org/EIPS/eip-6963).

## Requested address: squeek.hamster

`.hamster` is absent from [IANA's delegated TLD list](https://data.iana.org/TLD/tlds-alpha-by-domain.txt), checked 2026-11-04. `squeek.hamster` is therefore not a normal public DNS hostname. A CNAME alone cannot make that undelegated ending work in ordinary desktop and mobile browsers.

The existing project retains `hamster-friendship-the-lost-alic.identitymd.eth`. The closest compatible short alias to request from its existing hosting operator is **`squeek-hamster.identitymd.eth`**, subject to their name availability and alias support; it has not been reserved or claimed. An exact-looking ENS alternative, `squeek.hamster.eth`, would require control of `hamster.eth` and its subdomain records. For conventional DNS, use `squeek` under a supported domain the owner controls, with DNS, TLS and host mapping pointed to this same export. Static source cannot register a domain or change ownership/hosting aliases. Nothing here creates or publishes a second project.

## Validation and maintenance

Results and limitations are in [VALIDATION.md](./VALIDATION.md); the implemented design system is in [DESIGN.md](./DESIGN.md).

- `npm run build` and `npm run check`: passed.
- TypeScript `checkJs` for the five added modules: passed.
- `node scripts/test.mjs`: 29 gameplay/save checks passed.
- `node supabase/tests/validation.mjs /path/to/pglite/dist/index.js`: 43 PostgreSQL checks passed with PGlite 0.5.15.
- `node scripts/validate-browser.mjs /path/to/playwright/index.mjs /path/to/pglite/dist/index.js [webkit-launcher] [axe.min.js]`: 26 Chromium checks passed, including a local browser-to-PostgreSQL bridge. WebKit was attempted but could not start because system libraries were unavailable.
- The pinned design probe passed 16/16. Axe 4.14.0 found no violations on five inspected surfaces; manual-review items remain documented.

Optional test tools (TypeScript, Playwright, PGlite and axe-core) belong in a separate tools installation, not the static export. None are game dependencies. Test-only state injection stays in verification scripts; production exposes only a read-only gameplay snapshot and the pause method used by menus.

`dist/` is the complete static delivery. The original SVG favicon and share art remain. `og-image.png` is a 1200×630 raster copy of the existing share art for link previews. No dependencies, caches or vendored registry are included. [Design-guide attribution and licenses](./docs/licenses/better-interface.txt) are retained.
