import esbuild from 'esbuild';
import builtins from 'builtin-modules';

const prod = process.argv[2] === 'production';
const ctx = await esbuild.context({
  entryPoints: ['src/main.ts'],
  bundle: true,
  external: ['obsidian', 'electron', '@codemirror/*', '@lezer/*', ...builtins],
  format: 'cjs',
  target: 'es2020',
  platform: 'browser',
  logLevel: 'info',
  sourcemap: prod ? false : 'inline',
  minify: prod,
  treeShaking: true,
  outfile: 'main.js',
  loader: { '.csstxt': 'text' },
  define: { 'process.env.NODE_ENV': '"production"' },
});
if (prod) { await ctx.rebuild(); process.exit(0); } else await ctx.watch();
