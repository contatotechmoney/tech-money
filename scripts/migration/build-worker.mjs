import { build } from 'esbuild';

// Node resolution preserves iconv-lite's streaming exports. Browser resolution
// substitutes them with empty modules, crashing Express in the Workers runtime.
await build({
  entryPoints: ['cloudflare/express-runtime.mjs'],
  outfile: 'dist/cloudflare/worker.mjs',
  bundle: true,
  platform: 'node',
  format: 'esm',
  target: 'es2022',
  external: ['cloudflare:*', 'node:*'],
  banner: { js: "import { createRequire } from 'node:module'; const require = createRequire('/worker.mjs');" },
});
