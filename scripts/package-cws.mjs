#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, '..');
const distDir = path.join(rootDir, 'dist');
const manifestPath = path.join(distDir, 'manifest.json');

if (!fs.existsSync(manifestPath)) {
  console.log('Building dist/ first...');
  execFileSync('node', [path.join(__dirname, 'build.mjs')], { cwd: rootDir, stdio: 'inherit' });
}

const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));

if (manifest.manifest_version !== 3) {
  console.error('Error: manifest_version must be 3');
  process.exit(1);
}

if (!manifest.description || manifest.description.length > 132) {
  console.error(`Error: manifest.description length is ${manifest.description?.length || 0}, max allowed by CWS is 132`);
  process.exit(1);
}

const zipPath = path.join(distDir, 'kyara-manager-cws.zip');
if (fs.existsSync(zipPath)) {
  fs.unlinkSync(zipPath);
}

const includeTargets = [
  'manifest.json',
  'LICENSE',
  'icons',
  'background',
  'content',
  'sidepanel'
];

execFileSync('zip', ['-r', '-q', 'kyara-manager-cws.zip', ...includeTargets, '-x', '*.DS_Store'], {
  cwd: distDir,
  stdio: 'inherit'
});

const stats = fs.statSync(zipPath);
console.log(`Created dist/kyara-manager-cws.zip (${stats.size} bytes) — Manifest v${manifest.version}`);
