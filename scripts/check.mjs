// Static checks for the plain-JavaScript project (there is no TypeScript).
// 1. Parses every script with V8 so a syntax error fails the check.
// 2. Confirms index.html has the share metadata and only relative asset URLs.
// 3. Confirms dist/ matches src/ byte for byte (run `npm run build` first).
import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const FILES = ['index.html', 'styles.css', 'game.js', 'config.js', 'rules.js', 'save.js', 'wallet.js', 'ui.js', 'sqk.svg', 'favicon.svg', 'og-image.svg', 'og-image.png'];
let failures = 0;
const fail = (msg) => { failures++; console.error(`FAIL ${msg}`); };
const pass = (msg) => console.log(`ok   ${msg}`);

const game = await readFile(join(root, 'src/game.js'), 'utf8');
for (const name of FILES.filter(name => name.endsWith('.js'))) {
  try { new vm.Script(await readFile(join(root, 'src', name), 'utf8'), { filename: 'src/' + name }); pass('src/' + name + ' parses'); }
  catch (err) { fail(`src/${name} does not parse: ${err.message}`); }
}

const html = await readFile(join(root, 'src/index.html'), 'utf8');
const required = [
  [/<title>[^<]+<\/title>/, 'title'],
  [/<meta name="description" content="[^"]+"/, 'description'],
  [/<link rel="icon" href="\.\/favicon\.svg"/, 'favicon'],
  [/<meta property="og:title" content="[^"]+"/, 'og:title'],
  [/<meta property="og:image" content="[^"]+"/, 'og:image'],
];
for (const [re, label] of required) (re.test(html) ? pass : fail)(`index.html has ${label}`);
const absolute = html.match(/(?:src|href)="\/(?!\/)[^"]*"/g);
if (absolute) fail(`root-absolute asset URLs: ${absolute.join(', ')}`); else pass('asset URLs are relative');

const ids = [...game.matchAll(/byId\('([^']+)'\)/g)].map((m) => m[1]);
for (const name of ['wallet.js','ui.js']) {
  const source = await readFile(join(root,'src',name),'utf8');
  const dynamicIds = [...source.matchAll(/\.id\s*=\s*'([^']+)'/g)].map(m => m[1]);
  ids.push(...[...source.matchAll(/getElementById\('([^']+)'\)/g)].map(m => m[1]).filter(id => !dynamicIds.includes(id)));
}
for (const id of new Set(ids)) if (!html.includes(`id="${id}"`)) fail(`game.js expects #${id} in index.html`);
pass(`${new Set(ids).size} element ids referenced by game.js checked`);

for (const name of FILES) {
  try {
    const [a, b] = await Promise.all([readFile(join(root, 'src', name)), readFile(join(root, 'dist', name))]);
    (a.equals(b) ? pass : fail)(`dist/${name} matches src/${name}`);
  } catch (err) { fail(`dist/${name}: ${err.message}`); }
}

if (failures) { console.error(`${failures} check(s) failed.`); process.exit(1); }
console.log('All checks passed.');
