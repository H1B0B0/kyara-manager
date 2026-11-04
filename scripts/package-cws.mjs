#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, '..');
const manifestPath = path.join(rootDir, 'manifest.json');

if (!fs.existsSync(manifestPath)) {
  console.error('Error: manifest.json not found');
  process.exit(1);
}

const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));

if (manifest.manifest_version !== 3) {
  console.error('Error: manifest_version must be 3');
  process.exit(1);
}

const requiredFiles = [
  'manifest.json',
  'LICENSE',
  manifest.background?.service_worker,
  manifest.side_panel?.default_path,
  ...Object.values(manifest.icons || {}),
  ...Object.values(manifest.action?.default_icon || {}),
  ...(manifest.content_scripts || []).flatMap((cs) => [...(cs.js || []), ...(cs.css || [])]),
  'lib/analytics.js'
].filter(Boolean);

const uniqueFiles = [...new Set(requiredFiles)];
for (const rel of uniqueFiles) {
  const abs = path.join(rootDir, rel);
  if (!fs.existsSync(abs)) {
    console.error(`Error: Referenced file missing: ${rel}`);
    process.exit(1);
  }
}

const distDir = path.join(rootDir, 'dist');
fs.mkdirSync(distDir, { recursive: true });
const zipPath = path.join(distDir, 'kyara-manager-cws.zip');
if (fs.existsSync(zipPath)) {
  fs.unlinkSync(zipPath);
}

const includeTargets = [
  'manifest.json',
  'LICENSE',
  'icons',
  'lib',
  'background',
  'content',
  'sidepanel'
];

execFileSync('zip', ['-r', '-q', zipPath, ...includeTargets, '-x', '*.DS_Store'], {
  cwd: rootDir,
  stdio: 'inherit'
});

const stats = fs.statSync(zipPath);
console.log(`Created ${path.relative(rootDir, zipPath)} (${stats.size} bytes) — Manifest v${manifest.version}`);
