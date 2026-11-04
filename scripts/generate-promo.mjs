import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, '..');
const promoDir = path.join(rootDir, 'promo');
const rawDir = path.join(promoDir, 'raw');
const templatesDir = path.join(promoDir, 'templates');
const brainDir = '/Users/etiennementrel/.gemini/antigravity/brain/b940700c-9447-4038-95e4-aaf2f3023806';
const previewDir = path.join(brainDir, 'promo-preview');
const aiBannerPath = path.join(brainDir, 'kyara_manager_promo_banner_1793817710243.jpg');

fs.mkdirSync(promoDir, { recursive: true });
fs.mkdirSync(rawDir, { recursive: true });
fs.mkdirSync(templatesDir, { recursive: true });
fs.mkdirSync(previewDir, { recursive: true });

const CHROME_PATH = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
if (!fs.existsSync(CHROME_PATH)) {
  console.error('Error: Google Chrome not found at', CHROME_PATH);
  process.exit(1);
}

// -------------------------------------------------------------------------
// 1. MARQUEE BANNER (1400 x 560)
// -------------------------------------------------------------------------
const HTML_MARQUEE = `<!DOCTYPE html>
<html lang="fr">
<head>
<meta charset="utf-8">
<style>
  @import url('https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@600;700;800&family=Unbounded:wght@700;800;900&family=Zen+Kaku+Gothic+New:wght@500;700;900&display=swap');
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body {
    width: 1400px;
    height: 560px;
    background: #09080c;
    overflow: hidden;
    font-family: 'Zen Kaku Gothic New', -apple-system, BlinkMacSystemFont, Segoe UI, Roboto, sans-serif;
    color: #edeae4;
    position: relative;
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 0 70px;
  }

  .backdrop-ai {
    position: absolute;
    inset: 0;
    background-image: url('file://${aiBannerPath}');
    background-size: cover;
    background-position: center right;
    opacity: 0.38;
    filter: saturate(1.2) contrast(1.1);
    z-index: 1;
  }

  .backdrop-ai::after {
    content: '';
    position: absolute;
    inset: 0;
    background: linear-gradient(90deg, #09080c 0%, #09080c 45%, rgba(9,8,12,0.85) 65%, rgba(9,8,12,0.4) 100%);
  }

  .ambient-glow {
    position: absolute;
    width: 600px;
    height: 600px;
    border-radius: 50%;
    filter: blur(120px);
    pointer-events: none;
    z-index: 2;
  }

  .left-col {
    position: relative;
    z-index: 3;
    max-width: 780px;
    display: flex;
    flex-direction: column;
    justify-content: center;
    gap: 20px;
  }

  .tag-pill {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    background: rgba(255, 77, 46, 0.12);
    border: 1px solid rgba(255, 77, 46, 0.35);
    border-radius: 999px;
    padding: 6px 14px;
    font-family: 'JetBrains Mono', monospace;
    font-size: 11px;
    font-weight: 700;
    color: #ff4d2e;
    letter-spacing: 0.5px;
  }

  .brand-row {
    display: flex;
    align-items: center;
    gap: 16px;
  }

  .brand-seal {
    width: 60px;
    height: 60px;
    border-radius: 16px;
    background: linear-gradient(135deg, #2b2438, #15131c);
    border: 2px solid #ff4d2e;
    box-shadow: 0 0 30px rgba(255, 77, 46, 0.5), inset 0 0 14px rgba(255, 77, 46, 0.2);
    display: flex;
    align-items: center;
    justify-content: center;
    font-family: 'Unbounded', sans-serif;
    font-size: 30px;
    font-weight: 900;
    color: #ff4d2e;
  }

  .brand-name {
    font-family: 'Unbounded', sans-serif;
    font-size: 44px;
    font-weight: 900;
    color: #ffffff;
    letter-spacing: -0.5px;
    text-shadow: 0 4px 20px rgba(0,0,0,0.8);
  }

  .hero-tag {
    font-size: 21px;
    font-weight: 800;
    color: #f5c518;
    letter-spacing: -0.2px;
  }

  .hero-desc {
    font-size: 14.5px;
    line-height: 1.6;
    color: #b7b2bd;
    max-width: 680px;
  }

  .pills-grid {
    display: grid;
    grid-template-columns: repeat(2, auto);
    gap: 10px;
    max-width: 620px;
    margin-top: 4px;
  }

  .pill-card {
    background: rgba(21, 20, 26, 0.85);
    border: 1px solid #282534;
    border-radius: 10px;
    padding: 9px 14px;
    font-size: 13px;
    font-weight: 600;
    color: #edeae4;
    display: flex;
    align-items: center;
    gap: 8px;
    backdrop-filter: blur(10px);
  }

  .guarantee {
    font-family: 'JetBrains Mono', monospace;
    font-size: 11px;
    color: #8e8a98;
    display: flex;
    align-items: center;
    gap: 12px;
    margin-top: 6px;
  }

  .right-hud-float {
    position: relative;
    background: rgba(21, 20, 26, 0.92);
    border: 1px solid rgba(255, 77, 46, 0.4);
    border-radius: 14px;
    padding: 18px 24px;
    display: flex;
    align-items: center;
    gap: 16px;
    box-shadow: 0 16px 40px rgba(0,0,0,0.9), 0 0 30px rgba(245, 197, 24, 0.25);
    z-index: 3;
    font-family: 'JetBrains Mono', monospace;
  }
</style>
</head>
<body>
  <div class="backdrop-ai"></div>
  <div class="ambient-glow" style="top: -100px; left: 300px; background: rgba(255, 77, 46, 0.2);"></div>

  <div class="left-col">
    <div>
      <div class="tag-pill">
        <span style="width:6px; height:6px; border-radius:50%; background:#ff4d2e; box-shadow:0 0 6px #ff4d2e;"></span>
        <span>EXTENSION GOOGLE CHROME · MANIFEST V3</span>
      </div>

      <div class="brand-row">
        <div class="brand-seal">操</div>
        <h1 class="brand-name">KYARA MANAGER</h1>
      </div>

      <div class="hero-tag">⚡ Pilote Automatique &amp; Arbitrage Kyara.games</div>

      <p class="hero-desc">
        Gagnez du temps et du Chakra : auto-vente des doublons au meilleur prix, auto-recyclage intelligent, scanner de flips rentables et ouverture live des boosters conseillés.
      </p>
    </div>

    <div>
      <div class="pills-grid">
        <div class="pill-card"><span style="color:#f5c518; font-weight:800;">売</span> Auto-Vente Optimisée</div>
        <div class="pill-card"><span style="color:#3fbf7f; font-weight:800;">転</span> Auto-Recyclage Rentable</div>
        <div class="pill-card"><span style="color:#4dd6ff; font-weight:800;">市</span> Scanner de Flips Marché</div>
        <div class="pill-card"><span style="color:#ff4d2e; font-weight:800;">札</span> Tirage Live Boosters (EV)</div>
      </div>

      <div class="guarantee">
        ✓ 100% Local (MV3) · Sanctuaire de Chakra Garanti · Zéro Télémétrie
      </div>
    </div>
  </div>

  <div class="right-hud-float">
    <div style="width:36px; height:36px; border-radius:8px; background:#ff4d2e; color:#fff; display:flex; align-items:center; justify-content:center; font-family:'Unbounded'; font-size:18px; font-weight:900;">操</div>
    <div>
      <div style="font-size:11px; color:#f5c518; font-weight:800;">PILOTE ACTIF · EXTENSION CHROME</div>
      <div style="font-size:14px; color:#fff; font-weight:800;">AUTOMATISATION INTELLIGENTE</div>
    </div>
  </div>
</body>
</html>`;

// -------------------------------------------------------------------------
// 2. SMALL PROMO TILE (440 x 280)
// -------------------------------------------------------------------------
const HTML_SMALL = `<!DOCTYPE html>
<html lang="fr">
<head>
<meta charset="utf-8">
<style>
  @import url('https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@700&family=Unbounded:wght@800;900&family=Zen+Kaku+Gothic+New:wght@500;700&display=swap');
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body {
    width: 440px;
    height: 280px;
    background: #09080c;
    overflow: hidden;
    font-family: 'Zen Kaku Gothic New', system-ui, sans-serif;
    color: #edeae4;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: space-between;
    padding: 22px 20px 18px 20px;
    text-align: center;
    position: relative;
  }

  .backdrop-ai-small {
    position: absolute;
    inset: 0;
    background-image: url('file://${aiBannerPath}');
    background-size: cover;
    background-position: center;
    opacity: 0.28;
    filter: blur(2px);
    z-index: 1;
  }

  .top-pill {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    background: rgba(255, 77, 46, 0.15);
    border: 1px solid rgba(255, 77, 46, 0.4);
    border-radius: 999px;
    padding: 4px 12px;
    font-family: 'JetBrains Mono', monospace;
    font-size: 9.5px;
    font-weight: 700;
    color: #ff4d2e;
    position: relative;
    z-index: 2;
  }

  .center-box {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 8px;
    position: relative;
    z-index: 2;
  }

  .brand-seal-lg {
    width: 62px;
    height: 62px;
    border-radius: 16px;
    background: linear-gradient(135deg, #282236, #14131a);
    border: 2px solid #ff4d2e;
    box-shadow: 0 0 28px rgba(255, 77, 46, 0.45);
    display: flex;
    align-items: center;
    justify-content: center;
    font-family: 'Unbounded', sans-serif;
    font-size: 30px;
    font-weight: 900;
    color: #ff4d2e;
  }

  .brand-heading {
    font-family: 'Unbounded', sans-serif;
    font-size: 22px;
    font-weight: 900;
    color: #fff;
    letter-spacing: 0.5px;
  }

  .brand-tag {
    font-size: 12.5px;
    font-weight: 700;
    color: #f5c518;
  }

  .features-strip {
    display: flex;
    gap: 6px;
    justify-content: center;
    position: relative;
    z-index: 2;
  }

  .strip-pill {
    background: rgba(21, 20, 26, 0.9);
    border: 1px solid #2e2b36;
    border-radius: 8px;
    padding: 5px 9px;
    font-size: 10.5px;
    font-weight: 600;
    color: #edeae4;
  }

  .footer-text {
    font-size: 10px;
    color: #8e8a98;
    font-family: 'JetBrains Mono', monospace;
    position: relative;
    z-index: 2;
  }
</style>
</head>
<body>
  <div class="backdrop-ai-small"></div>

  <div class="top-pill">★ EXTENSION CHROME · MANIFEST V3</div>

  <div class="center-box">
    <div class="brand-seal-lg">操</div>
    <div class="brand-heading">KYARA MANAGER</div>
    <div class="brand-tag">Pilote Automatique &amp; Arbitrage</div>
  </div>

  <div class="features-strip">
    <div class="strip-pill"><span style="color:#f5c518">売</span> Auto-Vente</div>
    <div class="strip-pill"><span style="color:#3fbf7f">転</span> Recyclage</div>
    <div class="strip-pill"><span style="color:#4dd6ff">市</span> Flips</div>
    <div class="strip-pill"><span style="color:#ff4d2e">札</span> Boosters</div>
  </div>

  <div class="footer-text">
    POUR KYARA.GAMES · 100% LOCAL &amp; SÉCURISÉ
  </div>
</body>
</html>`;

// -------------------------------------------------------------------------
// 3. AUTHENTIC SCREENSHOTS (1280 x 800) WITH SEAMLESS ANONYMIZATION
// -------------------------------------------------------------------------
// Takes the user's authentic screenshots, preserves 100% of the UI, cards and stats,
// and applies surgical anonymization:
// - If isGuest is true: user already took the screen with an anonymous guest account (Invité-DA66E2),
//   so we preserve 100% of the original pixels and seamlessly format to 1280x800.
// - If isGuest is false: replaces personal avatar and HIB0-2 with clean neutral values.
function buildAnonymizedScreenshotHtml(rawPngPath, isGuest = false) {
  const rawBase64 = fs.readFileSync(rawPngPath).toString('base64');
  return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<style>
  * { margin:0; padding:0; box-sizing:border-box; }
  body {
    width: 1280px;
    height: 800px;
    background: #0e0d12;
    overflow: hidden;
  }
  canvas {
    display: block;
    width: 1280px;
    height: 800px;
  }
</style>
</head>
<body>
<canvas id="cv" width="1280" height="800"></canvas>
<script>
async function render() {
  const img = new Image();
  await new Promise((res, rej) => {
    img.onload = res;
    img.onerror = rej;
    img.src = "data:image/png;base64,${rawBase64}";
  });

  const cv = document.getElementById("cv");
  const ctx = cv.getContext("2d");

  // 1. Fill base background with page dark color #0e0d12
  ctx.fillStyle = "#0e0d12";
  ctx.fillRect(0, 0, 1280, 800);

  // 2. Right sidepanel background extends full height (from x=960 to 1280)
  ctx.fillStyle = "#111015";
  ctx.fillRect(960, 0, 320, 800);

  // 3. Draw raw screenshot scaled 1.25x (1024 * 1.25 = 1280, 560 * 1.25 = 700)
  // Centered vertically at y = 50px
  const scale = 1.25;
  const offX = 0;
  const offY = 50;
  ctx.drawImage(img, offX, offY, 1024 * scale, 560 * scale);

  ${isGuest ? `
  // Screenshot is already 100% anonymous (guest account Invité-DA66E2)
  // Just ensure clean letterboxing top and bottom
  ctx.fillStyle = "#0e0d12";
  ctx.fillRect(0, 0, 960, 50);
  ctx.fillStyle = "#111015";
  ctx.fillRect(960, 750, 320, 50);
  ` : `
  // Navbar Avatar patch
  const avX = 713.5 * scale + offX;
  const avY = 22.5 * scale + offY;
  const avR = 14 * scale;

  ctx.save();
  ctx.beginPath();
  ctx.arc(avX, avY, avR, 0, Math.PI * 2);
  ctx.fillStyle = "#1e1d28";
  ctx.fill();

  ctx.lineWidth = 1.5;
  ctx.strokeStyle = "#e6a23c";
  ctx.stroke();

  ctx.fillStyle = "#f5d485";
  ctx.font = "bold 15px -apple-system, sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText("操", avX, avY);
  ctx.restore();

  // Sidepanel Header username patch: replace 'HIB0-2' with 'Joueur'
  const pX = 790 * scale + offX;
  const pY = 79 * scale + offY;
  const pW = 38 * scale;
  const pH = 15 * scale;

  ctx.save();
  ctx.fillStyle = "#15141b";
  ctx.fillRect(pX, pY, pW, pH);

  ctx.fillStyle = "#9d98a5";
  ctx.font = "600 12.5px -apple-system, BlinkMacSystemFont, Segoe UI, Roboto, sans-serif";
  ctx.textAlign = "left";
  ctx.textBaseline = "middle";
  ctx.fillText("Joueur", pX, pY + pH / 2);
  ctx.restore();

  // Floating HUD username patch: replace 'HIB0-2' with 'Joueur'
  const hX = 48 * scale + offX;
  const hY = 527 * scale + offY;
  const hW = 28 * scale;
  const hH = 14 * scale;

  ctx.save();
  ctx.fillStyle = "#17161e";
  ctx.fillRect(hX, hY, hW, hH);

  ctx.fillStyle = "#edeae4";
  ctx.font = "500 11px -apple-system, BlinkMacSystemFont, Segoe UI, Roboto, sans-serif";
  ctx.textAlign = "left";
  ctx.textBaseline = "middle";
  ctx.fillText("Joueur", hX, hY + hH / 2);
  ctx.restore();

  // Clean browser link hover tooltip if present at bottom-left
  ctx.fillStyle = "#0e0d12";
  ctx.fillRect(0, 546 * scale + offY, 200 * scale, 14 * scale);
  `}
}
render();
</script>
</body>
</html>`;
}

// Map each of the 5 raw screenshots to the 5 Chrome Web Store screenshots
const screensConfig = [
  { id: 'screenshot-1-autopilot', raw: 'screen-1-pilote.png', isGuest: true, label: 'Onglet 1 : Pilote Automatique Global & HUD' },
  { id: 'screenshot-2-doublons', raw: 'screen-2-doublons.png', isGuest: false, label: 'Onglet 2 : Gestion des Doublons & Vente' },
  { id: 'screenshot-3-marche', raw: 'screen-3-marche.png', isGuest: false, label: 'Onglet 3 : Scanner de Flips Marché' },
  { id: 'screenshot-4-boosters', raw: 'screen-4-boosters.png', isGuest: false, label: 'Onglet 4 : Rentabilité Boosters (EV)' },
  { id: 'screenshot-5-securite', raw: 'screen-5-reglages.png', isGuest: false, label: 'Onglet 5 : Réglages & Sécurité' },
];

const targets = [
  { id: 'promo-marquee-1400x560', width: 1400, height: 560, html: HTML_MARQUEE, label: 'Bannière Marquee Hero (1400x560)' },
  { id: 'promo-small-440x280', width: 440, height: 280, html: HTML_SMALL, label: 'Petite tuile promo (440x280)' },
  ...screensConfig.map(s => ({
    id: s.id,
    width: 1280,
    height: 800,
    html: buildAnonymizedScreenshotHtml(path.join(rawDir, s.raw), s.isGuest),
    label: s.label
  }))
];

console.log('--- GÉNÉRATION DES ASSETS CHROME WEB STORE ---');
console.log(`Cible : ${targets.length} fichiers (7 PNG + 7 JPEG 24-bits sans alpha)\n`);

for (const t of targets) {
  const tplPath = path.join(templatesDir, `${t.id}.html`);
  const pngPath = path.join(promoDir, `${t.id}.png`);
  const jpgPath = path.join(promoDir, `${t.id}.jpg`);
  const previewJpgPath = path.join(previewDir, `${t.id}.jpg`);

  fs.writeFileSync(tplPath, t.html, 'utf8');

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

  // Copy to preview directory for user viewing
  fs.copyFileSync(jpgPath, previewJpgPath);
}

console.log('\nVérification des dimensions et canaux alpha (sips)...');
const checkFiles = fs.readdirSync(promoDir)
  .filter(f => /\.(png|jpg)$/i.test(f) && !f.startsWith('tmp'))
  .map(f => path.join(promoDir, f));

const sipsOutput = execFileSync('sips', ['-g', 'pixelWidth', '-g', 'pixelHeight', '-g', 'hasAlpha', ...checkFiles], { encoding: 'utf8' });
console.log(sipsOutput);

console.log('✅ Tous les assets promotionnels ont été générés avec succès !');
