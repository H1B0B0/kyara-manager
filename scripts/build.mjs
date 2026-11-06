#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import * as esbuild from 'esbuild';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, '..');
const distDir = path.join(rootDir, 'dist');
const packageJson = JSON.parse(fs.readFileSync(path.join(rootDir, 'package.json'), 'utf8'));
const sourceManifest = JSON.parse(fs.readFileSync(path.join(rootDir, 'manifest.json'), 'utf8'));
if (packageJson.version !== sourceManifest.version) {
  throw new Error('Versions package.json/manifest.json différentes. Exécute node scripts/sync-version.mjs.');
}

console.log('⚡ Building Kyara Manager (TypeScript + React 19 + Vite)...');

// Clean dist directory
if (fs.existsSync(distDir)) {
  fs.rmSync(distDir, { recursive: true, force: true });
}
fs.mkdirSync(distDir, { recursive: true });

// 1. Build Sidepanel with Vite
console.log('📦 [1/4] Building React Sidepanel with Vite...');
execFileSync('npx', ['vite', 'build'], {
  cwd: rootDir,
  stdio: 'inherit'
});

// 2. Bundle Background Service Worker with esbuild (ESM)
console.log('⚙️  [2/4] Bundling Service Worker...');
const bgOutDir = path.join(distDir, 'background');
fs.mkdirSync(bgOutDir, { recursive: true });
await esbuild.build({
  entryPoints: [path.join(rootDir, 'src/background/service-worker.ts')],
  outfile: path.join(bgOutDir, 'service-worker.js'),
  bundle: true,
  format: 'esm',
  minify: true,
  sourcemap: false
});

// 3. Bundle Content Script with esbuild (IIFE)
console.log('🌐 [3/4] Bundling Content Script...');
const contentOutDir = path.join(distDir, 'content');
fs.mkdirSync(contentOutDir, { recursive: true });
await esbuild.build({
  entryPoints: [path.join(rootDir, 'src/content/index.ts')],
  outfile: path.join(contentOutDir, 'content.js'),
  bundle: true,
  format: 'iife',
  minify: true,
  sourcemap: false
});

await esbuild.build({
  entryPoints: [path.join(rootDir, 'src/content/page-hook.ts')],
  outfile: path.join(contentOutDir, 'page-hook.js'),
  bundle: true,
  format: 'iife',
  minify: true
});

// Copy content CSS to dist
fs.copyFileSync(
  path.join(rootDir, 'src/content/content.css'),
  path.join(contentOutDir, 'content.css')
);

// 4. Copy icons and manifest.json
console.log('📋 [4/4] Copying Assets & Manifest...');
const iconsDist = path.join(distDir, 'icons');
fs.mkdirSync(iconsDist, { recursive: true });
for (const icon of ['icon-16.png', 'icon-32.png', 'icon-48.png', 'icon-128.png']) {
  fs.copyFileSync(path.join(rootDir, 'icons', icon), path.join(iconsDist, icon));
}

if (fs.existsSync(path.join(rootDir, 'LICENSE'))) {
  fs.copyFileSync(path.join(rootDir, 'LICENSE'), path.join(distDir, 'LICENSE'));
}

// Generate dist/manifest.json
const manifestSrc = JSON.parse(fs.readFileSync(path.join(rootDir, 'manifest.json'), 'utf8'));
manifestSrc.side_panel = {
  default_path: 'sidepanel/index.html'
};
manifestSrc.background = {
  service_worker: 'background/service-worker.js',
  type: 'module'
};
manifestSrc.content_scripts = manifestSrc.content_scripts.map((script) => ({
  ...script,
  js: script.js?.map((file) => file.replace(/^dist\//, '')),
  css: script.css?.map((file) => file.replace(/^dist\//, ''))
}));

fs.writeFileSync(path.join(distDir, 'manifest.json'), JSON.stringify(manifestSrc, null, 2));

console.log('✅ Extension built successfully into dist/');
