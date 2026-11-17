import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = new URL('../', import.meta.url);
const publicFiles = new Set([
  '.nojekyll',
  'favicon.svg',
  'licenses/three.txt',
  'media/sublime-knob.glb',
  'media/panel.webp',
  'media/gallery/front.webp',
  'media/gallery/side.webp',
  'media/gallery/controls.webp',
]);

async function walk(directory, prefix = '') {
  if (directory instanceof URL) directory = fileURLToPath(directory);
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    assert.ok(!entry.isSymbolicLink(), `Unexpected symbolic link: ${entry.name}`);
    const name = `${prefix}${entry.name}`;
    if (entry.isDirectory()) files.push(...(await walk(join(directory, entry.name), `${name}/`)));
    else files.push(name);
  }
  return files;
}

assert.deepEqual(
  new Set(await walk(new URL('public/', root))),
  publicFiles,
  'Public assets must be explicitly included in the exhibition',
);

const forbidden =
  /SharedWorker|CircuitJS|circuitjs|component-explorer|component-details|inspection-protocol|instrument-worker|data-technical|\/lab\//;
for (const file of await walk(new URL('src/', root))) {
  if (!/\.(?:js|mjs|css)$/.test(file)) continue;
  const text = await readFile(new URL(`src/${file}`, root), 'utf8');
  assert.ok(!forbidden.test(text), `Non-exhibition feature in src/${file}`);
  assert.ok(!/\?v=\d/.test(text), `Manual cache version in src/${file}`);
}

const sourceHtml = await readFile(new URL('index.html', root), 'utf8');
assert.ok(!forbidden.test(sourceHtml), 'Non-exhibition markup in index.html');

const files = await walk(new URL('dist/', root));
const allowedOutput = /^(?:index\.html|assets\/[\w.-]+\.(?:js|css))$/;
for (const file of files) {
  assert.ok(publicFiles.has(file) || allowedOutput.test(file), `Unexpected public output: ${file}`);
  if (/\.(?:html|js|css)$/.test(file)) {
    const content = await readFile(new URL(`dist/${file}`, root), 'utf8');
    assert.ok(!forbidden.test(content), `Non-exhibition feature in dist/${file}`);
    assert.ok(
      !/local preview server|(?:window|globalThis)\.(?:viewerState|viewerPerformance)/.test(
        content,
      ),
      `Development-only content in dist/${file}`,
    );
  }
}
for (const file of publicFiles) assert.ok(files.includes(file), `Missing public asset: ${file}`);
const html = await readFile(new URL('dist/index.html', root), 'utf8');
assert.match(html, /data-mode="exhibition"/);
assert.match(html, /src="\/sublime-knob\/assets\//);
assert.ok(!html.includes('/src/'), 'Unbuilt application source in output');
console.log(`Public output checked: ${files.length} exhibition-only files under /sublime-knob/.`);
