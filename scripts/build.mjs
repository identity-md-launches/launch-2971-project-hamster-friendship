// Production build: copies the static site from src/ into dist/.
// The game has no dependencies and no bundling step, so the export is the
// source files themselves with relative URLs, ready for any static host.
import { cp, mkdir, readdir, rm, stat } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const src = join(root, 'src');
const dist = join(root, 'dist');
const FILES = ['index.html', 'styles.css', 'game.js', 'audio.js', 'config.js', 'rules.js', 'save.js', 'wallet.js', 'ui.js', 'viewport.js', 'manifest.webmanifest', 'app-icon-192.png', 'app-icon-512.png', 'sqk.svg', 'favicon.svg', 'og-image.svg', 'og-image.png', 'victory.svg'];

await rm(dist, { recursive: true, force: true });
await mkdir(dist, { recursive: true });
for (const name of FILES) {
  await cp(join(src, name), join(dist, name));
}

let total = 0;
for (const name of await readdir(dist)) {
  const { size } = await stat(join(dist, name));
  total += size;
  console.log(`dist/${name}  ${size} bytes`);
}
console.log(`Built ${FILES.length} files, ${total} bytes.`);
