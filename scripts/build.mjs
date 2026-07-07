#!/usr/bin/env node
// Build DaddyLens for Chrome (default) or Firefox (--firefox). Bundles the
// three entry points with esbuild, then copies static assets + the right
// manifest into dist/<target>/. --watch keeps rebuilding.

import { context, build } from 'esbuild';
import { cp, mkdir, readFile, writeFile, rm } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const args = new Set(process.argv.slice(2));
const FIREFOX = args.has('--firefox');
const WATCH = args.has('--watch');
const TARGET = FIREFOX ? 'firefox' : 'chrome';
const OUT = join(ROOT, 'dist', TARGET);

// Until @traderdaddy/sdk is on npm, resolve it from the sibling checkout and let
// esbuild bundle its TS source directly. Swap for the published package later.
const SDK = join(ROOT, '..', 'traderdaddy-sdk', 'src');

const entryPoints = {
  'content': join(ROOT, 'src/content/index.ts'),
  'background': join(ROOT, 'src/background/index.ts'),
  'options': join(ROOT, 'src/options/options.ts'),
};

/** @type {import('esbuild').BuildOptions} */
const esbuildOpts = {
  entryPoints,
  outdir: OUT,
  bundle: true,
  format: 'esm',
  target: 'es2022',
  sourcemap: WATCH ? 'inline' : false,
  minify: !WATCH,
  loader: { '.css': 'text' },
  logLevel: 'info',
  define: { '__TARGET__': JSON.stringify(TARGET) },
  alias: {
    '@traderdaddy/sdk/mock': join(SDK, 'mock', 'index.ts'),
    '@traderdaddy/sdk': join(SDK, 'index.ts'),
  },
};

async function copyStatic() {
  await mkdir(OUT, { recursive: true });
  // Manifest — merge base with target-specific background key.
  const base = JSON.parse(await readFile(join(ROOT, 'src/manifest.base.json'), 'utf8'));
  base.background = FIREFOX
    ? { scripts: ['background.js'], type: 'module' }
    : { service_worker: 'background.js', type: 'module' };
  if (FIREFOX) {
    base.browser_specific_settings = { gecko: { id: 'daddylens@traderdaddy.pro' } };
  }
  await writeFile(join(OUT, 'manifest.json'), JSON.stringify(base, null, 2));

  await cp(join(ROOT, 'src/options/options.html'), join(OUT, 'options.html'));
  await cp(join(ROOT, 'src/options/options.css'), join(OUT, 'options.css'));
  if (existsSync(join(ROOT, 'src/assets'))) {
    await cp(join(ROOT, 'src/assets'), join(OUT, 'assets'), { recursive: true });
  }
}

async function main() {
  await rm(OUT, { recursive: true, force: true });
  await copyStatic();
  if (WATCH) {
    const ctx = await context(esbuildOpts);
    await ctx.watch();
    console.log(`[build] watching → dist/${TARGET}/`);
  } else {
    await build(esbuildOpts);
    console.log(`[build] done → dist/${TARGET}/`);
  }
}

main().catch((err) => { console.error(err); process.exit(1); });
