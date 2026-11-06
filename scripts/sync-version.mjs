import fs from 'node:fs';

const root = new URL('../', import.meta.url);
const pkg = JSON.parse(fs.readFileSync(new URL('package.json', root), 'utf8'));
const manifestPath = new URL('manifest.json', root);
const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
manifest.version = pkg.version;
fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + '\n');
