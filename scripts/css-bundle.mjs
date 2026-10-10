import { glob, mkdir, readFile, writeFile } from 'node:fs/promises';
import { relative, resolve } from 'node:path';

/**
 * Order matters: design tokens and themes must land before any component rule,
 * otherwise a component would resolve `var(--u14u-*)` before it is defined.
 */
const LAYER_ORDER = ['tokens.css', 'themes.css', 'reset.css', 'base.css'];

/**
 * Opt-in files that are deliberately kept out of the bundle. The library ships
 * no global CSS, so a page reset is the consumer's decision, not ours.
 */
const OPT_IN_ONLY = new Set(['reset.css']);

/**
 * `fs.promises.glob` yields an async iterator; this drains it into an array.
 *
 * @param {AsyncIterable<string>} iterable
 * @returns {Promise<string[]>}
 */
async function collect(iterable) {
  /** @type {string[]} */
  const out = [];
  for await (const entry of iterable) out.push(entry);
  return out;
}

/**
 * Concatenates every stylesheet in the library into a single `dist/u14u.css`
 * so consumers can opt into a plain stylesheet instead of runtime injection.
 *
 * @param {string} root Absolute path to the repository root.
 * @returns {Promise<{ css: string; files: string[]; bytes: number }>}
 */
export async function buildCssBundle(root) {
  const styleRoot = resolve(root, 'src/styles');
  const componentRoot = resolve(root, 'src/components');

  const [layerFiles, componentFiles] = await Promise.all([
    collect(glob('*.css', { cwd: styleRoot })),
    collect(glob('*/*.css', { cwd: componentRoot })),
  ]);

  const ordered = [
    ...LAYER_ORDER.filter((name) => layerFiles.includes(name)),
    ...layerFiles.filter((name) => !LAYER_ORDER.includes(name)).sort(),
  ].map((name) => resolve(styleRoot, name));

  const orderedComponents = componentFiles.sort().map((name) => resolve(componentRoot, name));
  const files = [...ordered, ...orderedComponents].filter(
    (file) => !OPT_IN_ONLY.has(file.split(/[\\/]/).pop() ?? '')
  );

  const banner = [
    '/*!',
    ' * U14U — design tokens + component styles',
    ' * Themes are token overrides: set data-theme on <html> and override --u14u-* custom properties.',
    ' * Generated file — edit src/styles/*.css or src/components/*/*.css instead.',
    ' */',
    '',
  ].join('\n');

  const chunks = await Promise.all(files.map((file) => readFile(file, 'utf8')));
  const sections = files.map(
    (file, index) => `/* ${relative(root, file).replace(/\\/g, '/')} */\n${chunks[index].trim()}\n`
  );

  const css = `${banner}\n${sections.join('\n')}`;
  const outFile = resolve(root, 'dist/u14u.css');

  await mkdir(resolve(root, 'dist'), { recursive: true });
  await writeFile(outFile, css, 'utf8');

  return { css, files: files.map((file) => relative(root, file).replace(/\\/g, '/')), bytes: Buffer.byteLength(css) };
}