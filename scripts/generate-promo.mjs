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
// 1. MARQUEE HERO BANNER (1400 x 560)
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
// 3. 5 SHOWCASE SLIDES (1280 x 800) FOR CHROME WEB STORE CAROUSEL
// -------------------------------------------------------------------------
// Formats each real screenshot with a clear, high-impact header showcase banner:
// - Badge, H1 title, subtitle, and 3 feature pills
// - 100% genuine Kyara app interface below, seamlessly anonymized as Invité-DA66E2
function buildShowcaseHtml(config) {
  const rawBase64 = fs.readFileSync(path.join(rawDir, config.raw)).toString('base64');
  return `<!DOCTYPE html>
<html lang="fr">
<head>
<meta charset="utf-8">
<style>
  @import url('https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@700;800&family=Unbounded:wght@800;900&family=Zen+Kaku+Gothic+New:wght@600;700;900&display=swap');
  * { margin:0; padding:0; box-sizing:border-box; }
  body {
    width: 1280px;
    height: 800px;
    background: #0b0a0f;
    overflow: hidden;
    font-family: 'Zen Kaku Gothic New', -apple-system, BlinkMacSystemFont, Segoe UI, Roboto, sans-serif;
    color: #edeae4;
    position: relative;
  }

  /* Header banner (y: 0 to 95px) */
  .header-bar {
    width: 1280px;
    height: 95px;
    background: linear-gradient(180deg, #171522 0%, #0d0c12 100%);
    border-bottom: 2px solid #282434;
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 0 32px;
    position: relative;
    z-index: 10;
  }

  .header-bar::after {
    content: '';
    position: absolute;
    bottom: -2px;
    left: 0;
    width: 360px;
    height: 2px;
    background: linear-gradient(90deg, #ff4d2e, #f5c518, transparent);
  }

  .title-group {
    display: flex;
    flex-direction: column;
    gap: 4px;
    max-width: 820px;
  }

  .tag-row {
    display: flex;
    align-items: center;
    gap: 12px;
  }

  .badge-tag {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    background: rgba(255, 77, 46, 0.16);
    border: 1px solid rgba(255, 77, 46, 0.45);
    border-radius: 999px;
    padding: 2px 10px;
    font-family: 'JetBrains Mono', monospace;
    font-size: 10.5px;
    font-weight: 800;
    color: #ff4d2e;
    letter-spacing: 0.5px;
  }

  .subline {
    font-size: 12.5px;
    color: #9d98a5;
    font-weight: 500;
  }

  .headline {
    font-family: 'Unbounded', sans-serif;
    font-size: 20px;
    font-weight: 900;
    color: #ffffff;
    letter-spacing: -0.3px;
  }

  .headline span {
    color: #f5c518;
  }

  .features-strip {
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .feature-pill {
    background: #171620;
    border: 1px solid #282534;
    border-radius: 8px;
    padding: 7px 12px;
    font-family: 'JetBrains Mono', monospace;
    font-size: 11px;
    font-weight: 700;
    color: #d8d4dc;
    display: flex;
    align-items: center;
    gap: 6px;
  }

  .canvas-wrapper {
    width: 1280px;
    height: 705px;
    position: relative;
    background: #0e0d12;
  }

  canvas {
    display: block;
    width: 1280px;
    height: 705px;
  }
</style>
</head>
<body>
  <div class="header-bar">
    <div class="title-group">
      <div class="tag-row">
        <span class="badge-tag">${config.badge}</span>
        <span class="subline">${config.subtitle}</span>
      </div>
      <h1 class="headline">${config.titleHtml}</h1>
    </div>

    <div class="features-strip">
      ${config.pills.map(p => `<div class="feature-pill">${p}</div>`).join('\n      ')}
    </div>
  </div>

  <div class="canvas-wrapper">
    <canvas id="cv" width="1280" height="705"></canvas>
  </div>

  <script>
  async function run() {
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
    ctx.fillRect(0, 0, 1280, 705);

    // 2. Right sidepanel background extends full height (from x=960 to 1280)
    ctx.fillStyle = "#111015";
    ctx.fillRect(960, 0, 320, 705);

    // 3. Draw raw screenshot scaled 1.25x (1024 * 1.25 = 1280, 560 * 1.25 = 700)
    // Placed at y = 2px
    const scale = 1.25;
    const offX = 0;
    const offY = 2;
    ctx.drawImage(img, offX, offY, 1024 * scale, 560 * scale);

    ${config.isGuest ? `
    // Screenshot 1 is already natively taken with guest account Invité-DA66E2
    // Top & bottom blend
    ctx.fillStyle = "#0e0d12";
    ctx.fillRect(0, 0, 960, 2);
    ctx.fillStyle = "#111015";
    ctx.fillRect(960, 702, 320, 3);
    ` : `
    // Navbar Avatar patch (match guest avatar / neutral seal 操)
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

    // Sidepanel Header username patch: replace HIB0-2 with Invité-DA66E2
    const pX = 790 * scale + offX;
    const pY = 79 * scale + offY;
    const pW = 85 * scale;
    const pH = 15 * scale;

    ctx.save();
    ctx.fillStyle = "#15141b";
    ctx.fillRect(pX, pY, pW, pH);

    ctx.fillStyle = "#9d98a5";
    ctx.font = "600 11.5px -apple-system, BlinkMacSystemFont, Segoe UI, Roboto, sans-serif";
    ctx.textAlign = "left";
    ctx.textBaseline = "middle";
    ctx.fillText("Invité-DA66E2 · 0/6736 cartes", pX, pY + pH / 2);
    ctx.restore();

    // Floating HUD username patch: replace HIB0-2 with Invité-DA66E2
    const hX = 48 * scale + offX;
    const hY = 527 * scale + offY;
    const hW = 60 * scale;
    const hH = 14 * scale;

    ctx.save();
    ctx.fillStyle = "#17161e";
    ctx.fillRect(hX, hY, hW, hH);

    ctx.fillStyle = "#edeae4";
    ctx.font = "500 10px -apple-system, BlinkMacSystemFont, Segoe UI, Roboto, sans-serif";
    ctx.textAlign = "left";
    ctx.textBaseline = "middle";
    ctx.fillText("Invité-DA66E2", hX, hY + hH / 2);
    ctx.restore();

    // Clean browser link hover tooltip if present at bottom-left
    ctx.fillStyle = "#0e0d12";
    ctx.fillRect(0, 546 * scale + offY, 200 * scale, 14 * scale);
    `}
  }
  run();
  </script>
</body>
</html>`;
}

const screensConfig = [
  {
    id: 'screenshot-1-autopilot',
    raw: 'screen-1-pilote.png',
    isGuest: true,
    badge: '⚡ MODULE 01 · PILOTE AUTOMATIQUE',
    titleHtml: 'Pilote Automatique Global &amp; <span>Tableau de Bord ROI</span>',
    subtitle: 'Orchestration en continu sans brader vos cartes sur Kyara.games',
    pills: [
      '<span style="color:#f5c518;">売</span> Auto-Vente',
      '<span style="color:#3fbf7f;">転</span> Auto-Recyclage',
      '<span style="color:#ff4d2e;">操</span> HUD en jeu'
    ],
    label: 'Capture 1 : Pilote Automatique Global & HUD'
  },
  {
    id: 'screenshot-2-doublons',
    raw: 'screen-2-doublons.png',
    isGuest: false,
    badge: '💎 MODULE 02 · GESTION DES DOUBLONS',
    titleHtml: 'Arbitrage Doublons : <span>Vendre au Meilleur Prix ou Recycler</span>',
    subtitle: 'Calcul en direct des prix nets après taxes (5% + 2%) avec garde-fou anti-bradage',
    pills: [
      '<span style="color:#f5c518;">📊</span> Médianes 7j',
      '<span style="color:#ff4d2e;">🛡️</span> Garde-fou 70%',
      '<span style="color:#3fbf7f;">🔒</span> Protection cartes'
    ],
    label: 'Capture 2 : Gestion des Doublons & Vente'
  },
  {
    id: 'screenshot-3-marche',
    raw: 'screen-3-marche.png',
    isGuest: false,
    badge: '🎯 MODULE 03 · SCANNER DE FLIPS MARCHÉ',
    titleHtml: 'Radar d\'Opportunités &amp; <span>Achat-Revente (Flips Directs)</span>',
    subtitle: 'Détection instantanée des annonces sous-cotées avec calcul automatique du bénéfice net',
    pills: [
      '<span style="color:#4dd6ff;">📈</span> Marge nette +◆',
      '<span style="color:#f5c518;">⚡</span> Achat 1-clic',
      '<span style="color:#ff4d2e;">🏷️</span> Filtres raretés'
    ],
    label: 'Capture 3 : Scanner de Flips Marché'
  },
  {
    id: 'screenshot-4-boosters',
    raw: 'screen-4-boosters.png',
    isGuest: false,
    badge: '📦 MODULE 04 · ESPÉRANCE CHAKRA (EV)',
    titleHtml: 'Rentabilité des Boosters (EV) &amp; <span>Pity Sniper Mythique</span>',
    subtitle: 'Classement probabiliste des packs selon l\'EV en Chakra et Pity Sniper dès 240/250',
    pills: [
      '<span style="color:#3fbf7f;">🎲</span> P(≥1 nouvelle)',
      '<span style="color:#f5c518;">🎯</span> Pity (240/250)',
      '<span style="color:#ff4d2e;">⚡</span> Tirage Live'
    ],
    label: 'Capture 4 : Rentabilité Boosters (EV)'
  },
  {
    id: 'screenshot-5-securite',
    raw: 'screen-5-reglages.png',
    isGuest: false,
    badge: '🛡️ MODULE 05 · CONTRÔLE & SÉCURITÉ',
    titleHtml: 'Sanctuaire de Chakra Protégé &amp; <span>Confidentialité 100% Locale</span>',
    subtitle: 'Sécurité stricte 0 Chakra sur les boosters, réserve minimale et zéro télémétrie',
    pills: [
      '<span style="color:#3fbf7f;">✓</span> 0 Chakra garanti',
      '<span style="color:#f5c518;">🔒</span> Réserve protégée',
      '<span style="color:#4dd6ff;">🛡️</span> 100% Local MV3'
    ],
    label: 'Capture 5 : Réglages & Sécurité'
  }
];

const targets = [
  { id: 'promo-marquee-1400x560', width: 1400, height: 560, html: HTML_MARQUEE, label: 'Bannière Marquee Hero (1400x560)' },
  { id: 'promo-small-440x280', width: 440, height: 280, html: HTML_SMALL, label: 'Petite tuile promo (440x280)' },
  ...screensConfig.map(s => ({
    id: s.id,
    width: 1280,
    height: 800,
    html: buildShowcaseHtml(s),
    label: s.label
  }))
];

console.log('--- GÉNÉRATION DES 5 SHOWCASES + BANNIÈRES CHROME WEB STORE ---');
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

console.log('✅ Tous les 5 visuels de présentation ont été générés avec succès !');
