#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import * as esbuild from 'esbuild';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const desktopDir = path.resolve(__dirname, '..');
const rootDir = path.resolve(desktopDir, '..');
const rootDistDir = path.join(rootDir, 'dist');
const extResDir = path.join(desktopDir, 'resources', 'extension');
const desktopDistDir = path.join(desktopDir, 'dist');
const extensionOnly = process.argv.includes('--extension-only');

function copyDir(src, dest) {
  fs.mkdirSync(dest, { recursive: true });
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    const s = path.join(src, entry.name);
    const d = path.join(dest, entry.name);
    if (entry.isDirectory()) copyDir(s, d);
    else fs.copyFileSync(s, d);
  }
}

console.log('⚡ Ensuring root Chrome extension dist/ is up to date...');
execFileSync('npm', ['run', 'build'], { cwd: rootDir, stdio: 'inherit' });

if (fs.existsSync(extResDir)) fs.rmSync(extResDir, { recursive: true, force: true });
fs.mkdirSync(extResDir, { recursive: true });
copyDir(path.join(rootDistDir, 'content'), path.join(extResDir, 'content'));
copyDir(path.join(rootDistDir, 'sidepanel'), path.join(extResDir, 'sidepanel'));
copyDir(path.join(rootDistDir, 'icons'), path.join(extResDir, 'icons'));
fs.copyFileSync(path.join(rootDistDir, 'manifest.json'), path.join(extResDir, 'manifest.json'));
if (extensionOnly) {
  console.log('✅ Synced extension assets into desktop/resources/extension.');
  process.exit(0);
}

if (fs.existsSync(desktopDistDir)) fs.rmSync(desktopDistDir, { recursive: true, force: true });
fs.mkdirSync(desktopDistDir, { recursive: true });

console.log('📦 [1/3] Building Desktop React shell with Vite...');
execFileSync('npx', ['vite', 'build'], { cwd: desktopDir, stdio: 'inherit' });

console.log('⚙️  [2/3] Bundling Electron Main process (ESM)...');
await esbuild.build({
  entryPoints: [path.join(desktopDir, 'src/main/index.ts')],
  outfile: path.join(desktopDistDir, 'main/index.js'),
  bundle: true,
  platform: 'node',
  target: 'node22',
  format: 'esm',
  external: ['electron', 'electron-updater'],
  banner: {
    js: 'import { createRequire as __createRequire } from "node:module"; const require = __createRequire(import.meta.url);'
  }
});

console.log('🔌 [3/3] Bundling Preload scripts (CJS)...');
const preloadEntries = ['kyara-preload.ts', 'cockpit-preload.ts', 'shell-preload.ts'];
for (const entry of preloadEntries) {
  await esbuild.build({
    entryPoints: [path.join(desktopDir, 'src/preload', entry)],
    outfile: path.join(desktopDistDir, 'preload', entry.replace(/\.ts$/, '.cjs')),
    bundle: true,
    platform: 'node',
    target: 'node22',
    format: 'cjs',
    external: ['electron']
  });
}

console.log('✅ Kyara Manager Desktop built into desktop/dist/');
