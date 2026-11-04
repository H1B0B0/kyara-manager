import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, '..');
const rawDir = path.join(rootDir, 'promo', 'raw');
const promoDir = path.join(rootDir, 'promo');
const CHROME_PATH = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';

fs.mkdirSync(rawDir, { recursive: true });

const files = fs.readdirSync(rawDir).filter(f => /\.(png|jpe?g|webp)$/i.test(f)).sort();

if (files.length === 0) {
  console.log(`Aucune image trouvée dans promo/raw/.\nDépose tes captures d'écran réelles (ex: screen1.png) dans : ${rawDir}`);
  process.exit(0);
}

console.log(`Traitement de ${files.length} capture(s) d'écran trouvée(s) dans promo/raw/...`);

files.slice(0, 5).forEach((file, index) => {
  const inputPath = path.join(rawDir, file);
  const num = index + 1;
  const outPng = path.join(promoDir, `screenshot-${num}.png`);
  const outJpg = path.join(promoDir, `screenshot-${num}.jpg`);

  console.log(`Calibration de ${file} -> screenshot-${num} (1280x800 sans alpha)...`);

  // HTML page that centers and fits the user's screenshot into an exact 1280x800 24-bit canvas
  const helperHtml = `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body {
    width: 1280px;
    height: 800px;
    background: #0e0d12;
    overflow: hidden;
    display: flex;
    align-items: center;
    justify-content: center;
  }
  img {
    width: 100%;
    height: 100%;
    object-fit: contain;
    background: #0e0d12;
  }
</style>
</head>
<body>
  <img src="file://${inputPath}" />
</body>
</html>`;

  const tmpHtml = path.join(promoDir, `tmp_format_${num}.html`);
  fs.writeFileSync(tmpHtml, helperHtml, 'utf8');

  execFileSync(CHROME_PATH, [
    '--headless=new',
    '--disable-gpu',
    '--virtual-time-budget=1000',
    '--window-size=1280,800',
    `--screenshot=${outPng}`,
    `file://${tmpHtml}`
  ], { stdio: 'ignore' });

  fs.unlinkSync(tmpHtml);

  // Convert to 95% JPEG without alpha
  execFileSync('sips', [
    '-s', 'format', 'jpeg',
    '-s', 'formatOptions', '95',
    outPng,
    '--out', outJpg
  ], { stdio: 'ignore' });
});

console.log('Toutes les captures ont été calibrées avec succès au format Chrome Web Store !');
