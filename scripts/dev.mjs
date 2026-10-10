import { context } from 'esbuild';
import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import { createServer } from 'node:http';
import { dirname, extname, join, normalize, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildCssBundle } from './css-bundle.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const port = Number(process.env.PORT ?? 5173);

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
};

/**
 * esbuild watch. Regenerates the concatenated stylesheet after every rebuild so
 * the dev server and the published `dist/u14u.css` never drift apart.
 */
const ctx = await context({
  entryPoints: [resolve(root, 'src/index.js')],
  outfile: resolve(root, 'dist/u14u.esm.js'),
  bundle: true,
  format: 'esm',
  target: ['es2022'],
  loader: { '.css': 'text' },
  sourcemap: true,
  logLevel: 'info',
  define: { __U14U_VERSION__: JSON.stringify('0.1.0-dev') },
  plugins: [
    {
      name: 'u14u-css-bundle',
      setup(build) {
        build.onEnd(async () => {
          await buildCssBundle(root);
        });
      },
    },
  ],
});

await ctx.watch();
console.log('esbuild watching src/ …');

/** Minimal static file server rooted at the repository, for the demo pages. */
const server = createServer(async (req, res) => {
  const url = new URL(req.url ?? '/', `http://localhost:${port}`);
  let pathname = decodeURIComponent(url.pathname);
  if (pathname === '/') pathname = '/demo/index.html';

  const target = join(root, normalize(pathname).replace(/^([/\\])+/, ''));
  if (!target.startsWith(root + sep)) {
    res.writeHead(403).end('Forbidden');
    return;
  }

  try {
    const info = await stat(target);
    const file = info.isDirectory() ? join(target, 'index.html') : target;
    await stat(file);
    res.writeHead(200, {
      'Content-Type': MIME[extname(file)] ?? 'application/octet-stream',
      'Cache-Control': 'no-store',
    });
    createReadStream(file).pipe(res);
  } catch {
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }).end('Not found');
  }
});

server.listen(port, () => {
  console.log(`\n  U14U dev server → http://localhost:${port}/`);
  console.log('  Demo index     → http://localhost:5173/demo/index.html\n');
});