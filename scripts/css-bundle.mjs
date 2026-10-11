import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import { join, relative, resolve } from 'node:path';

/**
 * Order matters: design tokens and themes must land before any component rule,
 * otherwise a component would resolve `var(--ui4u-*)` before it is defined.
 */
const LAYER_ORDER = ['tokens.css', 'themes.css', 'reset.css', 'base.css'];

/**
 * Opt-in files that are deliberately kept out of the bundle. The library ships
 * no global CSS, so a page reset is the consumer's decision, not ours.
 */
const OPT_IN_ONLY = new Set(['reset.css']);

/**
 * Recursively lists `.css` files under a directory.
 *
 * Deliberately avoids `fs.promises.glob`, which only exists on Node 22+ and
 * would break the build on the Node 18/20 this package supports.
 *
 * @param {string} dir
 * @returns {Promise<string[]>} absolute paths, sorted
 */
async function findCss(dir) {
  /** @param {string} current @returns {Promise<string[]>} */
  async function walk(current) {
    const entries = await readdir(current, { withFileTypes: true });
    const found = await Promise.all(
      entries
        .filter((entry) => entry.isDirectory() || entry.name.endsWith('.css'))
        .map((entry) =>
          entry.isDirectory()
            ? walk(join(current, entry.name))
            : Promise.resolve([join(current, entry.name)])
        )
    );
    return found.flat();
  }

  return (await walk(dir)).sort();
}

/**
 * Concatenates every stylesheet in the library into a single `dist/ui4u.css`
 * so consumers can opt into a plain stylesheet instead of runtime injection.
 *
 * @param {string} root Absolute path to the repository root.
 * @returns {Promise<{ css: string; files: string[]; bytes: number }>}
 */
export async function buildCssBundle(root) {
  const styleRoot = resolve(root, 'src/styles');
  const componentRoot = resolve(root, 'src/components');

  const [stylePaths, componentPaths] = await Promise.all([
    findCss(styleRoot),
    findCss(componentRoot),
  ]);

  const layerFiles = stylePaths.map((file) => file.slice(styleRoot.length + 1));

  const ordered = [
    ...LAYER_ORDER.filter((name) => layerFiles.includes(name)),
    ...layerFiles.filter((name) => !LAYER_ORDER.includes(name)).sort(),
  ].map((name) => resolve(styleRoot, name));

  const orderedComponents = [...componentPaths].sort();
  const files = [...ordered, ...orderedComponents].filter(
    (file) => !OPT_IN_ONLY.has(file.split(/[\\/]/).pop() ?? '')
  );

  const banner = [
    '/*!',
    ' * UI4U — design tokens + component styles',
    ' * Themes are token overrides: set data-theme on <html> and override --ui4u-* custom properties.',
    ' * Generated file — edit src/styles/*.css or src/components/*/*.css instead.',
    ' */',
    '',
  ].join('\n');

  const chunks = await Promise.all(files.map((file) => readFile(file, 'utf8')));
  const sections = files.map(
    (file, index) => `/* ${relative(root, file).replace(/\\/g, '/')} */\n${chunks[index].trim()}\n`
  );

  const css = `${banner}\n${sections.join('\n')}`;
  const outFile = resolve(root, 'dist/ui4u.css');

  await mkdir(resolve(root, 'dist'), { recursive: true });
  await writeFile(outFile, css, 'utf8');

  return {
    css,
    files: files.map((file) => relative(root, file).replace(/\\/g, '/')),
    bytes: Buffer.byteLength(css),
  };
}
