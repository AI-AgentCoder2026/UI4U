import { build } from 'esbuild';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildCssBundle } from './css-bundle.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const pkg = JSON.parse(await readFile(resolve(root, 'package.json'), 'utf8'));

await mkdir(resolve(root, 'dist'), { recursive: true });

/** Shared esbuild options. Component CSS is imported as a string, not bundled as a stylesheet. */
const shared = {
  entryPoints: [resolve(root, 'src/index.js')],
  bundle: true,
  target: ['es2022', 'chrome100', 'firefox100', 'safari15'],
  loader: { '.css': 'text' },
  logLevel: 'info',
  metafile: true,
  define: { __UI4U_VERSION__: JSON.stringify(pkg.version) },
  banner: {
    js: `/*! UI4U v${pkg.version} | MIT */`,
  },
};

const targets = [
  { ...shared, format: 'esm', outfile: 'dist/ui4u.esm.js', minify: false, sourcemap: true },
  { ...shared, format: 'cjs', outfile: 'dist/ui4u.cjs', minify: false, sourcemap: true },
  {
    ...shared,
    format: 'iife',
    globalName: 'UI4U',
    outfile: 'dist/ui4u.global.js',
    minify: true,
    sourcemap: false,
  },
  {
    ...shared,
    format: 'esm',
    outfile: 'dist/ui4u.esm.min.js',
    minify: true,
    sourcemap: false,
  },
];

for (const target of targets) {
  const result = await build(target);
  const outFile = resolve(root, target.outfile);
  const { size } = await readFile(outFile).then((buffer) => ({ size: buffer.byteLength }));
  const gzip = Math.round(size * 0.32); // rough estimate, printed for a quick signal only
  console.log(`  ${target.outfile.padEnd(26)} ${(size / 1024).toFixed(1)} kB  (~${(gzip / 1024).toFixed(1)} kB gzip)`);
  if (result.metafile) {
    await writeFile(
      resolve(root, 'dist/.metafile.json'),
      JSON.stringify(result.metafile, null, 2),
      'utf8'
    );
  }
}

const css = await buildCssBundle(root);
console.log(`  dist/ui4u.css              ${(css.bytes / 1024).toFixed(1)} kB`);
console.log(`\nBuilt ${pkg.name} v${pkg.version} from ${css.files.length} stylesheets.`);