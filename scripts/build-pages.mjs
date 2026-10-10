import { build } from 'esbuild';
import { copyFile, mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildCssBundle } from './css-bundle.mjs';

/**
 * Assembles the static demo site that GitHub Pages serves.
 *
 * The dev server serves the repo root, so demo pages use absolute paths like
 * `/dist/ui4u.esm.js`. Pages serves from a sub-path (`/UI4U/`), where absolute
 * paths would resolve to the domain root and 404. So the output is flattened and
 * every reference is rewritten to be relative.
 */

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const outDir = resolve(root, '.pages');

/** Absolute reference -> filename in the flattened output. */
const REWRITES = new Map([
  ['/dist/ui4u.esm.js', './ui4u.esm.js'],
  ['/dist/ui4u.css', './ui4u.css'],
  ['/src/styles/reset.css', './reset.css'],
  ['/demo/demo.css', './demo.css'],
  ['/demo/demo.js', './demo.js'],
]);

/** Non-HTML files from `demo/` that pages reference but are not themselves pages. */
const DEMO_ASSETS = ['demo.css', 'demo.js'];

await rm(outDir, { recursive: true, force: true });
await mkdir(outDir, { recursive: true });

/* ------------------------------------------------------------------ build */

await build({
  entryPoints: [resolve(root, 'src/index.js')],
  outfile: resolve(outDir, 'ui4u.esm.js'),
  bundle: true,
  format: 'esm',
  target: ['es2022', 'chrome100', 'firefox100', 'safari15'],
  loader: { '.css': 'text' },
  sourcemap: false,
  minify: true,
  logLevel: 'warning',
  define: { __UI4U_VERSION__: JSON.stringify('0.1.0') },
  banner: { js: '/*! UI4U v0.1.0 | MIT */' },
});

// Reuse the canonical CSS bundler so the site and the npm package never drift.
await buildCssBundle(root);
await copyFile(resolve(root, 'dist/ui4u.css'), resolve(outDir, 'ui4u.css'));
await copyFile(resolve(root, 'src/styles/reset.css'), resolve(outDir, 'reset.css'));

/* ------------------------------------------------------------------ pages */

const demoDir = resolve(root, 'demo');
const pages = (await readdir(demoDir)).filter((name) => name.endsWith('.html'));

for (const name of pages) {
  const source = await readFile(resolve(demoDir, name), 'utf8');

  let html = source;
  for (const [from, to] of REWRITES) {
    html = html.split(`"${from}"`).join(`"${to}"`).split(`'${from}'`).join(`'${to}'`);
  }

  // `/demo/<other>.html` -> `./<other>.html`, now that everything is flat.
  html = html.replace(/(["'])\/demo\/([\w.-]+\.html)\1/g, '$1./$2$1');

  // The demo imports the ESM bundle with an absolute specifier in markup.
  html = html.replace(/(["'])\/dist\/(ui4u\.esm\.js)\1/g, '$1./$2$1');

  const outName = name === 'index.html' ? 'index.html' : name;
  await writeFile(resolve(outDir, outName), html, 'utf8');
  console.log(`  demo/${name} -> .pages/${outName}`);
}

// Shared demo chrome (styles + behaviour) travels with the flattened pages.
for (const name of DEMO_ASSETS) {
  await copyFile(resolve(demoDir, name), resolve(outDir, name));
  console.log(`  demo/${name} -> .pages/${name}`);
}

// Stops Jekyll from hiding any underscore-prefixed paths.
await writeFile(resolve(outDir, '.nojekyll'), '', 'utf8');

console.log('\nStatic site ready in .pages/ — set Pages source to "GitHub Actions".');