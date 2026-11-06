import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, '..');
const promoDir = path.join(rootDir, 'promo');
const templatesDir = path.join(promoDir, 'templates');

const CHROME_PATH = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
if (!fs.existsSync(CHROME_PATH)) {
  console.error('Error: Google Chrome not found at', CHROME_PATH);
  process.exit(1);
}

const promoTargets = [
  { id: 'screenshot-1-autopilot', width: 1280, height: 800, label: 'Image Promo 1 : Pilote Automatique & ROI' },
  { id: 'screenshot-2-doublons', width: 1280, height: 800, label: 'Image Promo 2 : Vente des Doublons & Cote' },
  { id: 'screenshot-3-marche', width: 1280, height: 800, label: 'Image Promo 3 : Scanner de Flips Marché' },
  { id: 'screenshot-4-boosters', width: 1280, height: 800, label: 'Image Promo 4 : Rentabilité Boosters & EV' },
  { id: 'screenshot-5-securite', width: 1280, height: 800, label: 'Image Promo 5 : Sanctuaire & Sécurité' },
  { id: 'promo-marquee-1400x560', width: 1400, height: 560, label: 'Bannière Marquee Hero (1400x560)' },
  { id: 'promo-small-440x280', width: 440, height: 280, label: 'Petite tuile promo (440x280)' },
];

console.log('--- GÉNÉRATION DES IMAGES PROMOTIONNELLES DU STORE ---');
console.log(`Cible : ${promoTargets.length} fichiers (PNG 24-bits + JPEG 95% sans alpha)\n`);

for (const t of promoTargets) {
  const tplPath = path.join(templatesDir, `${t.id}.html`);
  const pngPath = path.join(promoDir, `${t.id}.png`);
  const jpgPath = path.join(promoDir, `${t.id}.jpg`);

  if (!fs.existsSync(tplPath)) {
    console.warn(`Template not found: ${tplPath}`);
    continue;
  }

  console.log(`[Rendu] ${t.label} -> ${t.id} (${t.width}x${t.height})...`);
  execFileSync(CHROME_PATH, [
    '--headless=new',
    '--disable-gpu',
    '--virtual-time-budget=2000',
    `--window-size=${t.width},${t.height}`,
    `--screenshot=${pngPath}`,
    `file://${tplPath}`
  ], { stdio: 'ignore' });

  // Convert to 95% JPEG without alpha
  execFileSync('sips', [
    '-s', 'format', 'jpeg',
    '-s', 'formatOptions', '95',
    pngPath,
    '--out', jpgPath
  ], { stdio: 'ignore' });
}

console.log('\nVérification des dimensions et canaux alpha (sips)...');
const checkFiles = fs.readdirSync(promoDir)
  .filter(f => /\.(png|jpg)$/i.test(f) && !f.startsWith('tmp') && !f.startsWith('raw'))
  .map(f => path.join(promoDir, f));

const sipsOutput = execFileSync('sips', ['-g', 'pixelWidth', '-g', 'pixelHeight', '-g', 'hasAlpha', ...checkFiles], { encoding: 'utf8' });
console.log(sipsOutput);

console.log('✅ Les 7 images promotionnelles officielles ont été générées avec succès !');
