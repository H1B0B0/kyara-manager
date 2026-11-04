import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, '..');
const promoDir = path.join(rootDir, 'promo');
const rawDir = path.join(promoDir, 'raw');
const templatesDir = path.join(promoDir, 'templates');

fs.mkdirSync(promoDir, { recursive: true });
fs.mkdirSync(templatesDir, { recursive: true });

const CHROME_PATH = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
if (!fs.existsSync(CHROME_PATH)) {
  console.error('Error: Google Chrome not found at', CHROME_PATH);
  process.exit(1);
}

// Ensure raw screenshots exist
const rawScreens = {
  screen1: path.join(rawDir, 'screen-1-pilote.png'),
  screen2: path.join(rawDir, 'screen-2-doublons.png'),
  screen3: path.join(rawDir, 'screen-3-marche.png'),
  screen4: path.join(rawDir, 'screen-4-boosters.png'),
  screen5: path.join(rawDir, 'screen-5-reglages.png'),
};

for (const [key, p] of Object.entries(rawScreens)) {
  if (!fs.existsSync(p)) {
    console.error(`Error: Missing raw screenshot: ${p}`);
    process.exit(1);
  }
}

// Common styles for screenshots
const COMMON_STYLE = `
  @import url('https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@700&family=Unbounded:wght@800;900&family=Zen+Kaku+Gothic+New:wght@500;700&display=swap');
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body {
    width: 1280px;
    height: 800px;
    background: #09080c;
    overflow: hidden;
    font-family: 'Zen Kaku Gothic New', system-ui, sans-serif;
    color: #edeae4;
    display: flex;
    flex-direction: column;
    position: relative;
  }

  .ambient-glow {
    position: absolute;
    top: -120px;
    left: 200px;
    width: 600px;
    height: 350px;
    background: radial-gradient(ellipse, rgba(255, 77, 46, 0.16) 0%, rgba(245, 197, 24, 0.08) 50%, transparent 80%);
    pointer-events: none;
    z-index: 0;
  }

  .header-bar {
    height: 88px;
    background: linear-gradient(180deg, #171520 0%, #0e0d13 100%);
    border-bottom: 1px solid #282534;
    padding: 0 36px;
    display: flex;
    align-items: center;
    justify-content: space-between;
    position: relative;
    z-index: 2;
    flex-shrink: 0;
  }

  .badge-tag {
    font-family: 'JetBrains Mono', monospace;
    font-size: 11px;
    font-weight: 700;
    color: #ff4d2e;
    letter-spacing: 0.5px;
    display: flex;
    align-items: center;
    gap: 6px;
    margin-bottom: 3px;
  }

  .title-text {
    font-family: 'Unbounded', sans-serif;
    font-size: 20px;
    font-weight: 900;
    color: #fff;
    letter-spacing: -0.3px;
  }

  .subtitle-text {
    font-size: 12.5px;
    color: #9d98a5;
  }

  .brand-pill {
    display: flex;
    align-items: center;
    gap: 10px;
    background: rgba(30, 28, 38, 0.85);
    border: 1px solid #2e2b36;
    border-radius: 12px;
    padding: 8px 14px;
  }

  .seal-box {
    width: 32px;
    height: 32px;
    border-radius: 8px;
    background: #ff4d2e;
    color: #fff;
    font-family: 'Unbounded', sans-serif;
    font-size: 16px;
    font-weight: 900;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  /* Screenshot Container */
  .screen-container {
    flex: 1;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 16px 28px 22px 28px;
    position: relative;
    z-index: 2;
  }

  .screen-frame {
    width: 100%;
    height: 100%;
    border-radius: 14px;
    overflow: hidden;
    border: 1px solid #2e2b36;
    box-shadow: 0 20px 50px rgba(0, 0, 0, 0.85), 0 0 30px rgba(255, 77, 46, 0.12);
    display: flex;
    background: #0e0d12;
  }

  .screen-img {
    width: 100%;
    height: 100%;
    object-fit: cover;
    object-position: top center;
  }
`;

function buildScreenshotHtml({ badge, title, subtitle, imgPath }) {
  return `<!DOCTYPE html>
<html lang="fr">
<head>
<meta charset="utf-8">
<style>${COMMON_STYLE}</style>
</head>
<body>
  <div class="ambient-glow"></div>

  <div class="header-bar">
    <div>
      <div class="badge-tag">
        <span style="width:6px; height:6px; border-radius:50%; background:#ff4d2e;"></span>
        <span>${badge}</span>
      </div>
      <div class="title-text">${title}</div>
      <div class="subtitle-text">${subtitle}</div>
    </div>
    <div class="brand-pill">
      <div class="seal-box">操</div>
      <div>
        <div style="font-family:'Unbounded'; font-size:13px; font-weight:900; color:#fff;">KYARA MANAGER</div>
        <div style="font-size:10.5px; color:#3fbf7f; font-weight:700;">● Pilote Connecté (v1.1)</div>
      </div>
    </div>
  </div>

  <div class="screen-container">
    <div class="screen-frame">
      <img class="screen-img" src="file://${imgPath}" />
    </div>
  </div>
</body>
</html>`;
}

// -------------------------------------------------------------------------
// 1. MARQUEE BANNER (1400 x 560)
// -------------------------------------------------------------------------
const HTML_MARQUEE = `<!DOCTYPE html>
<html lang="fr">
<head>
<meta charset="utf-8">
<style>
  @import url('https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@700&family=Unbounded:wght@800;900&family=Zen+Kaku+Gothic+New:wght@500;700&display=swap');
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body {
    width: 1400px;
    height: 560px;
    background: radial-gradient(circle at 80% 35%, #1c182a 0%, #0d0c12 55%, #070609 100%);
    overflow: hidden;
    font-family: 'Zen Kaku Gothic New', system-ui, sans-serif;
    color: #edeae4;
    display: flex;
    position: relative;
  }

  .ambient-glow {
    position: absolute;
    width: 550px;
    height: 550px;
    border-radius: 50%;
    filter: blur(90px);
    pointer-events: none;
  }

  .left-col {
    width: 660px;
    height: 100%;
    padding: 50px 0 45px 65px;
    display: flex;
    flex-direction: column;
    justify-content: space-between;
    z-index: 2;
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
  }

  .brand-row {
    display: flex;
    align-items: center;
    gap: 16px;
    margin-top: 14px;
    margin-bottom: 12px;
  }

  .brand-seal {
    width: 58px;
    height: 58px;
    border-radius: 14px;
    background: linear-gradient(135deg, #262134, #14131b);
    border: 2px solid #ff4d2e;
    box-shadow: 0 0 24px rgba(255, 77, 46, 0.35);
    display: flex;
    align-items: center;
    justify-content: center;
    font-family: 'Unbounded', sans-serif;
    font-size: 28px;
    font-weight: 900;
    color: #ff4d2e;
  }

  .brand-name {
    font-family: 'Unbounded', sans-serif;
    font-size: 44px;
    font-weight: 900;
    color: #fff;
    letter-spacing: -0.5px;
  }

  .hero-tag {
    font-size: 18px;
    font-weight: 700;
    color: #f5c518;
    margin-bottom: 12px;
  }

  .hero-desc {
    font-size: 13.5px;
    line-height: 1.55;
    color: #9d98a5;
    max-width: 560px;
    margin-bottom: 20px;
  }

  .pills-grid {
    display: grid;
    grid-template-columns: repeat(2, 1fr);
    gap: 10px;
    max-width: 560px;
  }

  .pill-card {
    display: flex;
    align-items: center;
    gap: 10px;
    background: rgba(30, 28, 38, 0.75);
    border: 1px solid #2e2b36;
    border-radius: 10px;
    padding: 8px 12px;
    font-size: 12.5px;
    font-weight: 600;
  }

  .guarantee {
    margin-top: 16px;
    font-size: 11.5px;
    color: #3fbf7f;
    font-family: 'JetBrains Mono', monospace;
  }

  /* Right column with real app screenshot mockup */
  .right-col {
    width: 740px;
    height: 100%;
    position: relative;
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 2;
  }

  .mockup-window {
    width: 660px;
    height: 440px;
    border-radius: 14px;
    overflow: hidden;
    border: 1px solid #3f3b4a;
    box-shadow: 0 24px 60px rgba(0,0,0,0.85), 0 0 40px rgba(255, 77, 46, 0.2);
    transform: rotate(-1.5deg) translateY(-8px);
    background: #0e0d12;
    position: relative;
  }

  .mockup-img {
    width: 100%;
    height: 100%;
    object-fit: cover;
    object-position: top center;
  }

  .floating-hud-badge {
    position: absolute;
    bottom: 24px;
    left: 20px;
    background: rgba(21, 20, 26, 0.96);
    border: 1px solid rgba(255, 77, 46, 0.5);
    border-radius: 12px;
    padding: 8px 16px;
    display: flex;
    align-items: center;
    gap: 10px;
    box-shadow: 0 12px 30px rgba(0,0,0,0.8);
    z-index: 4;
  }
</style>
</head>
<body>
  <div class="ambient-glow" style="top: -100px; right: 100px; background: rgba(255, 77, 46, 0.18);"></div>

  <div class="left-col">
    <div>
      <div class="tag-pill">
        <span style="width:6px; height:6px; border-radius:50%; background:#ff4d2e;"></span>
        <span>EXTENSION GOOGLE CHROME · MANIFEST V3</span>
      </div>

      <div class="brand-row">
        <div class="brand-seal">操</div>
        <h1 class="brand-name">KYARA MANAGER</h1>
      </div>

      <div class="hero-tag">⚡ Pilote Automatique &amp; Arbitrage Kyara.games</div>

      <p class="hero-desc">
        Gérez vos cartes automatiquement : auto-vente des doublons sans bradage, auto-recyclage intelligent, scanner de flips rentables et ouverture live des boosters conseillés.
      </p>
    </div>

    <div>
      <div class="pills-grid">
        <div class="pill-card"><span style="color:#f5c518; font-weight:800;">売</span> Auto-Vente Doublons</div>
        <div class="pill-card"><span style="color:#3fbf7f; font-weight:800;">転</span> Auto-Recyclage Rentable</div>
        <div class="pill-card"><span style="color:#4dd6ff; font-weight:800;">市</span> Scanner Flips Marché</div>
        <div class="pill-card"><span style="color:#ff4d2e; font-weight:800;">札</span> Tirage Live Boosters</div>
      </div>

      <div class="guarantee">
        ✓ 100% Local (MV3) · Sanctuaire de Chakra Garanti · Zéro Télémétrie
      </div>
    </div>
  </div>

  <div class="right-col">
    <div class="mockup-window">
      <img class="mockup-img" src="file://${rawScreens.screen1}" />
    </div>

    <div class="floating-hud-badge">
      <span style="width:24px; height:24px; border-radius:6px; background:#ff4d2e; color:#fff; display:flex; align-items:center; justify-content:center; font-family:'Unbounded'; font-size:12px; font-weight:900;">操</span>
      <span style="font-size:12px; font-weight:800; color:#fff;">Pilote Automatique Actif sur Kyara.games</span>
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
    background: radial-gradient(circle at 50% 35%, #1e192c 0%, #0c0b11 65%, #060508 100%);
    overflow: hidden;
    font-family: 'Zen Kaku Gothic New', system-ui, sans-serif;
    color: #edeae4;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: space-between;
    padding: 24px 20px 20px 20px;
    text-align: center;
    position: relative;
  }

  .ambient-glow {
    position: absolute;
    width: 260px;
    height: 260px;
    top: 20px;
    background: radial-gradient(circle, rgba(255, 77, 46, 0.22) 0%, transparent 70%);
    pointer-events: none;
  }

  .top-pill {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    background: rgba(255, 77, 46, 0.12);
    border: 1px solid rgba(255, 77, 46, 0.35);
    border-radius: 999px;
    padding: 4px 12px;
    font-family: 'JetBrains Mono', monospace;
    font-size: 9.5px;
    font-weight: 700;
    color: #ff4d2e;
    z-index: 2;
  }

  .center-box {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 8px;
    z-index: 2;
  }

  .brand-seal-lg {
    width: 62px;
    height: 62px;
    border-radius: 16px;
    background: linear-gradient(135deg, #282236, #14131a);
    border: 2px solid #ff4d2e;
    box-shadow: 0 0 28px rgba(255, 77, 46, 0.4);
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
    z-index: 2;
  }

  .strip-pill {
    background: rgba(30, 28, 38, 0.85);
    border: 1px solid #2e2b36;
    border-radius: 8px;
    padding: 5px 9px;
    font-size: 10.5px;
    font-weight: 600;
    color: #edeae4;
  }

  .footer-text {
    font-size: 10px;
    color: #6b6675;
    font-family: 'JetBrains Mono', monospace;
    z-index: 2;
  }
</style>
</head>
<body>
  <div class="ambient-glow"></div>

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

// Build all 5 real screenshots
const HTML_SCREENSHOT_1 = buildScreenshotHtml({
  badge: '01 / PILOTE AUTOMATIQUE & HUD EN JEU',
  title: 'Pilote Automatique Global & Tableau de Bord des Gains (ROI)',
  subtitle: 'Auto-vente des doublons, auto-recyclage, ouverture live et widget HUD en direct sur Kyara.games',
  imgPath: rawScreens.screen1
});

const HTML_SCREENSHOT_2 = buildScreenshotHtml({
  badge: '02 / GESTION DES DOUBLONS & VENTE OPTIMISÉE',
  title: 'Arbitrage Intelligent des Doublons : Vendre ou Recycler ?',
  subtitle: 'Comparaison en direct avec les médianes 7 jours réelles et garde-fou anti-bradage à 70%',
  imgPath: rawScreens.screen2
});

const HTML_SCREENSHOT_3 = buildScreenshotHtml({
  badge: '03 / SCANNER D\'OPPORTUNITÉS & FLIPS MARCHÉ',
  title: 'Radar de Bons Plans & Achat-Revente (Flips Automatiques)',
  subtitle: 'Détection des cartes sous-cotées avec calcul automatique du bénéfice net (taxe 5% & dépôt 2%)',
  imgPath: rawScreens.screen3
});

const HTML_SCREENSHOT_4 = buildScreenshotHtml({
  badge: '04 / ESPÉRANCE CHAKRA (EV) & PILOTAGE LIVE',
  title: 'Rentabilité des Boosters & Tirage Live Piloté',
  subtitle: 'Classement probabiliste des packs selon l\'EV, suivi de la Pitié Mythique et ouverture animée',
  imgPath: rawScreens.screen4
});

const HTML_SCREENSHOT_5 = buildScreenshotHtml({
  badge: '05 / GARDE-FOUS PERSONNALISÉS & 100% LOCAL',
  title: 'Sanctuaire de Chakra Protégé & Confidentialité Totale',
  subtitle: 'Réserve minimale de Chakra, filtres par rareté et exécution 100% locale sans serveur tiers (Manifest V3)',
  imgPath: rawScreens.screen5
});

const targets = [
  { id: 'promo-marquee-1400x560', width: 1400, height: 560, html: HTML_MARQUEE },
  { id: 'promo-small-440x280', width: 440, height: 280, html: HTML_SMALL },
  { id: 'screenshot-1-autopilot', width: 1280, height: 800, html: HTML_SCREENSHOT_1 },
  { id: 'screenshot-2-doublons', width: 1280, height: 800, html: HTML_SCREENSHOT_2 },
  { id: 'screenshot-3-marche', width: 1280, height: 800, html: HTML_SCREENSHOT_3 },
  { id: 'screenshot-4-boosters', width: 1280, height: 800, html: HTML_SCREENSHOT_4 },
  { id: 'screenshot-5-securite', width: 1280, height: 800, html: HTML_SCREENSHOT_5 },
];

console.log('Generating HTML templates with authentic user screenshots...');
for (const t of targets) {
  const tplPath = path.join(templatesDir, `${t.id}.html`);
  fs.writeFileSync(tplPath, t.html, 'utf8');
}

console.log('Rendering all promotional assets at exact Chrome Web Store dimensions...');
for (const t of targets) {
  const tplPath = path.join(templatesDir, `${t.id}.html`);
  const pngPath = path.join(promoDir, `${t.id}.png`);
  const jpgPath = path.join(promoDir, `${t.id}.jpg`);

  console.log(`Rendering ${t.id} (${t.width}x${t.height})...`);
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

console.log('All real promotional assets rendered successfully!');
