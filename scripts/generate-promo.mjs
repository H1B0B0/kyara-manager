import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, '..');
const promoDir = path.join(rootDir, 'promo');
const templatesDir = path.join(promoDir, 'templates');

fs.mkdirSync(promoDir, { recursive: true });
fs.mkdirSync(templatesDir, { recursive: true });

const CHROME_PATH = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
if (!fs.existsSync(CHROME_PATH)) {
  console.error('Error: Google Chrome not found at', CHROME_PATH);
  process.exit(1);
}

// Common CSS & design system tokens
const COMMON_CSS = `
  @import url('https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;500;600;700;800&family=Unbounded:wght@400;600;700;800;900&family=Zen+Kaku+Gothic+New:wght@400;500;700;900&display=swap');

  :root {
    --bg: #0a090e;
    --bg-card: rgba(21, 20, 26, 0.96);
    --bg-card-raise: #1e1c26;
    --border: #2e2b36;
    --border-light: rgba(255, 255, 255, 0.1);
    --border-focus: #ff4d2e;
    --fg: #edeae4;
    --fg-muted: #9d98a5;
    --fg-dim: #6b6675;
    --acc: #ff4d2e;
    --acc-glow: rgba(255, 77, 46, 0.35);
    --gold: #f5c518;
    --gold-glow: rgba(245, 197, 24, 0.3);
    --emerald: #3fbf7f;
    --cyan: #4dd6ff;
    --purple: #b072ff;
    --rarity-m: #ff4d2e;
    --rarity-l: #f5c518;
    --rarity-e: #b072ff;
    --rarity-r: #4d9bff;
    --rarity-u: #3fbf7f;
    --rarity-c: #b5b1bb;
    --font-title: 'Unbounded', system-ui, sans-serif;
    --font-body: 'Zen Kaku Gothic New', system-ui, sans-serif;
    --font-mono: 'JetBrains Mono', monospace;
  }

  * { box-sizing: border-box; margin: 0; padding: 0; }
  body {
    margin: 0;
    padding: 0;
    background: var(--bg);
    color: var(--fg);
    font-family: var(--font-body);
    -webkit-font-smoothing: antialiased;
    overflow: hidden;
  }

  .grid-pattern {
    position: absolute;
    inset: 0;
    background-image: 
      radial-gradient(rgba(255, 255, 255, 0.05) 1px, transparent 1px),
      radial-gradient(rgba(255, 77, 46, 0.04) 1px, transparent 1px);
    background-size: 24px 24px, 48px 48px;
    background-position: 0 0, 12px 12px;
    pointer-events: none;
    z-index: 0;
  }

  .glow-orb {
    position: absolute;
    border-radius: 50%;
    filter: blur(80px);
    pointer-events: none;
    z-index: 0;
  }
`;

// =========================================================================
// 1. MARQUEE BANNER (1400 x 560)
// =========================================================================
const HTML_MARQUEE = `<!DOCTYPE html>
<html lang="fr">
<head>
<meta charset="utf-8">
<style>
${COMMON_CSS}
body {
  width: 1400px;
  height: 560px;
  display: flex;
  position: relative;
  background: radial-gradient(circle at 85% 30%, #1a1628 0%, #0c0b11 50%, #070609 100%);
}

.left-col {
  width: 680px;
  height: 100%;
  padding: 55px 0 50px 70px;
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  z-index: 2;
}

.badge-row {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  background: rgba(255, 77, 46, 0.12);
  border: 1px solid rgba(255, 77, 46, 0.35);
  border-radius: 999px;
  padding: 6px 14px;
  font-family: var(--font-mono);
  font-size: 11px;
  font-weight: 700;
  color: var(--acc);
  letter-spacing: 0.5px;
  width: fit-content;
}

.badge-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: var(--acc);
  box-shadow: 0 0 8px var(--acc);
}

.brand-title-wrap {
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
  background: linear-gradient(135deg, #242030, #14131a);
  border: 2px solid var(--acc);
  box-shadow: 0 0 24px var(--acc-glow), inset 0 0 12px rgba(255, 77, 46, 0.25);
  display: flex;
  align-items: center;
  justify-content: center;
  font-family: var(--font-title);
  font-size: 28px;
  font-weight: 900;
  color: var(--acc);
  flex-shrink: 0;
}

.brand-name {
  font-family: var(--font-title);
  font-size: 44px;
  font-weight: 900;
  letter-spacing: -0.5px;
  line-height: 1.05;
  background: linear-gradient(180deg, #ffffff 0%, #edeae4 55%, #c9c5ce 100%);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  text-shadow: 0 2px 20px rgba(0,0,0,0.8);
}

.hero-subtitle {
  font-size: 19px;
  font-weight: 700;
  color: var(--gold);
  margin-bottom: 14px;
  display: flex;
  align-items: center;
  gap: 8px;
}

.hero-desc {
  font-size: 14px;
  line-height: 1.55;
  color: var(--fg-muted);
  max-width: 580px;
  margin-bottom: 22px;
}

.features-grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 10px;
  max-width: 580px;
}

.feature-pill {
  display: flex;
  align-items: center;
  gap: 10px;
  background: rgba(30, 28, 38, 0.7);
  border: 1px solid var(--border);
  border-radius: 10px;
  padding: 8px 12px;
  font-size: 12.5px;
  font-weight: 600;
  color: var(--fg);
}

.feature-pill__icon {
  width: 24px;
  height: 24px;
  border-radius: 6px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 12px;
  font-weight: 800;
  flex-shrink: 0;
}

.icon-sell { background: rgba(245, 197, 24, 0.15); color: var(--gold); }
.icon-recycle { background: rgba(63, 191, 127, 0.15); color: var(--emerald); }
.icon-market { background: rgba(77, 214, 255, 0.15); color: var(--cyan); }
.icon-booster { background: rgba(255, 77, 46, 0.15); color: var(--acc); }

.guarantee-bar {
  display: flex;
  align-items: center;
  gap: 16px;
  font-size: 12px;
  color: var(--fg-dim);
  font-family: var(--font-mono);
  padding-top: 12px;
  border-top: 1px solid rgba(255, 255, 255, 0.06);
  max-width: 580px;
}

.guarantee-item {
  display: flex;
  align-items: center;
  gap: 6px;
  color: var(--emerald);
}

/* Right Column (Visual Mockups) */
.right-col {
  width: 720px;
  height: 100%;
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 2;
}

.dash-mockup {
  width: 440px;
  background: var(--bg-card);
  border: 1px solid var(--border);
  border-radius: 18px;
  box-shadow: 0 24px 60px rgba(0, 0, 0, 0.8), 0 0 40px rgba(255, 77, 46, 0.12);
  padding: 20px;
  position: relative;
  transform: rotate(-1.5deg) translateY(-8px);
}

.dash-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 16px;
  padding-bottom: 12px;
  border-bottom: 1px solid var(--border);
}

.dash-head__left {
  display: flex;
  align-items: center;
  gap: 10px;
}

.dash-head__status {
  display: flex;
  align-items: center;
  gap: 6px;
  background: rgba(63, 191, 127, 0.15);
  border: 1px solid rgba(63, 191, 127, 0.4);
  padding: 4px 10px;
  border-radius: 999px;
  font-size: 11px;
  font-weight: 700;
  color: var(--emerald);
  font-family: var(--font-mono);
}

.dash-kpis {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 10px;
  margin-bottom: 14px;
}

.kpi-tile {
  background: #191820;
  border: 1px solid var(--border);
  border-radius: 10px;
  padding: 10px 12px;
}

.kpi-tile__label {
  font-size: 10px;
  font-family: var(--font-mono);
  color: var(--fg-muted);
  display: flex;
  justify-content: space-between;
  margin-bottom: 4px;
}

.kpi-tile__val {
  font-size: 16px;
  font-weight: 800;
  font-family: var(--font-mono);
}

.val-gold { color: var(--gold); }
.val-white { color: #fff; }

.dash-roi {
  background: linear-gradient(135deg, rgba(245, 197, 24, 0.12), rgba(255, 77, 46, 0.08));
  border: 1px solid rgba(245, 197, 24, 0.35);
  border-radius: 12px;
  padding: 12px 14px;
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.dash-roi__label {
  font-size: 11px;
  font-weight: 700;
  color: var(--fg-muted);
}

.dash-roi__val {
  font-size: 20px;
  font-weight: 900;
  font-family: var(--font-mono);
  color: var(--gold);
  text-shadow: 0 0 16px var(--gold-glow);
}

/* Floating Card 1 (Mythique) */
.floating-card-1 {
  position: absolute;
  right: 25px;
  top: 60px;
  width: 190px;
  height: 260px;
  background: linear-gradient(150deg, #24141d 0%, #151119 100%);
  border: 2px solid var(--acc);
  border-radius: 16px;
  box-shadow: 0 20px 50px rgba(0, 0, 0, 0.9), 0 0 35px var(--acc-glow);
  transform: rotate(7deg);
  display: flex;
  flex-direction: column;
  overflow: hidden;
  padding: 12px;
  z-index: 3;
}

.card-top {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.rarity-pill-m {
  background: var(--acc);
  color: #fff;
  font-size: 9px;
  font-weight: 800;
  padding: 2px 6px;
  border-radius: 4px;
  font-family: var(--font-mono);
}

.card-art-box {
  flex: 1;
  margin: 8px 0;
  border-radius: 10px;
  background: radial-gradient(circle at 50% 40%, rgba(255, 77, 46, 0.4), #110d14 75%);
  border: 1px solid rgba(255, 77, 46, 0.3);
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 42px;
  position: relative;
}

.card-name {
  font-size: 11px;
  font-weight: 800;
  color: #fff;
  margin-bottom: 2px;
}

.card-val {
  font-size: 11px;
  font-family: var(--font-mono);
  font-weight: 700;
  color: var(--gold);
}

/* Floating HUD pill */
.floating-hud {
  position: absolute;
  bottom: 45px;
  left: 20px;
  background: rgba(21, 20, 26, 0.95);
  border: 1px solid var(--border-light);
  border-radius: 12px;
  padding: 8px 16px;
  display: flex;
  align-items: center;
  gap: 12px;
  box-shadow: 0 16px 36px rgba(0,0,0,0.8), 0 0 20px rgba(63, 191, 127, 0.2);
  z-index: 4;
}

.hud-seal {
  width: 26px;
  height: 26px;
  border-radius: 6px;
  background: var(--acc);
  color: #fff;
  font-weight: 900;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 13px;
}

.hud-text {
  font-size: 11.5px;
  font-weight: 700;
  color: #fff;
}

.hud-val {
  font-family: var(--font-mono);
  color: var(--emerald);
  font-size: 12px;
}
</style>
</head>
<body>
  <div class="grid-pattern"></div>
  <div class="glow-orb" style="top: -100px; left: 300px; width: 450px; height: 450px; background: rgba(255, 77, 46, 0.16);"></div>
  <div class="glow-orb" style="bottom: -150px; right: 100px; width: 500px; height: 500px; background: rgba(245, 197, 24, 0.14);"></div>

  <div class="left-col">
    <div>
      <div class="badge-row">
        <span class="badge-dot"></span>
        <span>EXTENSION GOOGLE CHROME · MANIFEST V3</span>
      </div>

      <div class="brand-title-wrap">
        <div class="brand-seal">操</div>
        <h1 class="brand-name">KYARA MANAGER</h1>
      </div>

      <div class="hero-subtitle">
        <span>⚡ Pilote Automatique & Arbitrage pour Kyara.games</span>
      </div>

      <p class="hero-desc">
        Optimisez vos cartes, vendez vos doublons au meilleur prix, recyclez intelligemment et repérez les plus gros bénéfices du marché sans aucun effort.
      </p>
    </div>

    <div>
      <div class="features-grid">
        <div class="feature-pill">
          <div class="feature-pill__icon icon-sell">売</div>
          <span>Auto-Vente des Doublons</span>
        </div>
        <div class="feature-pill">
          <div class="feature-pill__icon icon-recycle">転</div>
          <span>Auto-Recyclage Rentable</span>
        </div>
        <div class="feature-pill">
          <div class="feature-pill__icon icon-market">市</div>
          <span>Scanner Flips & Arbitrage</span>
        </div>
        <div class="feature-pill">
          <div class="feature-pill__icon icon-booster">札</div>
          <span>Ouverture Live des Boosters</span>
        </div>
      </div>

      <div class="guarantee-bar">
        <div class="guarantee-item">✓ 100% Local & Open-Source</div>
        <div class="guarantee-item">✓ Sanctuaire de Chakra</div>
        <div class="guarantee-item">✓ Zéro Latence</div>
      </div>
    </div>
  </div>

  <div class="right-col">
    <!-- Main Dashboard Mockup -->
    <div class="dash-mockup">
      <div class="dash-head">
        <div class="dash-head__left">
          <span style="font-family: var(--font-title); font-weight: 900; font-size: 14px; color: #fff;">キ KYARA MANAGER</span>
          <span style="font-size: 10px; color: var(--fg-dim); font-family: var(--font-mono);">v1.1</span>
        </div>
        <div class="dash-head__status">
          <span style="width: 6px; height: 6px; border-radius: 50%; background: var(--emerald); box-shadow: 0 0 6px var(--emerald);"></span>
          <span>PILOTE ACTIF</span>
        </div>
      </div>

      <div class="dash-kpis">
        <div class="kpi-tile">
          <div class="kpi-tile__label"><span>CHAKRA</span> <span>◆</span></div>
          <div class="kpi-tile__val val-gold">48 290 ◆</div>
        </div>
        <div class="kpi-tile">
          <div class="kpi-tile__label"><span>BOOSTERS</span> <span>札</span></div>
          <div class="kpi-tile__val val-white">10 / 10</div>
        </div>
        <div class="kpi-tile">
          <div class="kpi-tile__label"><span>MARCHÉ ACTIF</span> <span>市</span></div>
          <div class="kpi-tile__val val-white">10 / 10</div>
        </div>
        <div class="kpi-tile">
          <div class="kpi-tile__label"><span>PITIÉ MYTHIQUE</span> <span>神</span></div>
          <div class="kpi-tile__val val-gold">242 / 250</div>
        </div>
      </div>

      <div class="dash-roi">
        <div>
          <div class="dash-roi__label">GAIN CUMULÉ DU PILOTE</div>
          <div style="font-size: 11px; color: var(--emerald); font-weight: 700;">+38 ventes · +142 recyclages</div>
        </div>
        <div class="dash-roi__val">+24 680 ◆</div>
      </div>
    </div>

    <!-- Floating Mythic Card -->
    <div class="floating-card-1">
      <div class="card-top">
        <span class="rarity-pill-m">MYTHIQUE</span>
        <span style="font-size: 10px; font-weight: 800; color: var(--gold);">★ ★ ★</span>
      </div>
      <div class="card-art-box">
        <span>⚔️</span>
      </div>
      <div class="card-name">Madara Uchiha</div>
      <div class="card-val">Cote : 18 500 ◆</div>
    </div>

    <!-- Floating HUD -->
    <div class="floating-hud">
      <div class="hud-seal">操</div>
      <div>
        <div class="hud-text">Pilote Automatique en cours…</div>
        <div class="hud-val">Dernière vente : +3 990 ◆ net</div>
      </div>
    </div>
  </div>
</body>
</html>`;

// =========================================================================
// 2. SMALL PROMOTIONAL TILE (440 x 280)
// =========================================================================
const HTML_SMALL = `<!DOCTYPE html>
<html lang="fr">
<head>
<meta charset="utf-8">
<style>
${COMMON_CSS}
body {
  width: 440px;
  height: 280px;
  position: relative;
  background: radial-gradient(circle at 50% 35%, #1d182a 0%, #0c0b11 65%, #060508 100%);
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: space-between;
  padding: 24px 20px 20px 20px;
  text-align: center;
}

.top-tag {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  background: rgba(255, 77, 46, 0.12);
  border: 1px solid rgba(255, 77, 46, 0.35);
  border-radius: 999px;
  padding: 4px 12px;
  font-family: var(--font-mono);
  font-size: 9.5px;
  font-weight: 700;
  color: var(--acc);
  letter-spacing: 0.5px;
}

.center-box {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  margin-top: -2px;
}

.logo-seal {
  width: 62px;
  height: 62px;
  border-radius: 16px;
  background: linear-gradient(135deg, #282236, #14131a);
  border: 2px solid var(--acc);
  box-shadow: 0 0 28px var(--acc-glow), inset 0 0 14px rgba(255, 77, 46, 0.3);
  display: flex;
  align-items: center;
  justify-content: center;
  font-family: var(--font-title);
  font-size: 30px;
  font-weight: 900;
  color: var(--acc);
}

.brand-title {
  font-family: var(--font-title);
  font-size: 22px;
  font-weight: 900;
  letter-spacing: 0.5px;
  color: #fff;
  text-shadow: 0 2px 14px rgba(0, 0, 0, 0.8);
}

.brand-subtitle {
  font-size: 12.5px;
  font-weight: 700;
  color: var(--gold);
}

.pills-row {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  flex-wrap: wrap;
}

.pill {
  background: rgba(30, 28, 38, 0.85);
  border: 1px solid var(--border);
  border-radius: 8px;
  padding: 5px 9px;
  font-size: 10.5px;
  font-weight: 600;
  color: var(--fg);
  display: flex;
  align-items: center;
  gap: 4px;
}

.footer-bar {
  font-size: 10px;
  color: var(--fg-dim);
  font-family: var(--font-mono);
  letter-spacing: 0.5px;
}
</style>
</head>
<body>
  <div class="grid-pattern"></div>
  <div class="glow-orb" style="top: 20px; left: 120px; width: 200px; height: 200px; background: rgba(255, 77, 46, 0.2);"></div>

  <div class="top-tag">
    <span>★ EXTENSION CHROME · MANIFEST V3</span>
  </div>

  <div class="center-box">
    <div class="logo-seal">操</div>
    <h1 class="brand-title">KYARA MANAGER</h1>
    <div class="brand-subtitle">Pilote Automatique & Arbitrage</div>
  </div>

  <div>
    <div class="pills-row">
      <div class="pill"><span style="color:var(--gold)">売</span> Auto-Vente</div>
      <div class="pill"><span style="color:var(--emerald)">転</span> Recyclage</div>
      <div class="pill"><span style="color:var(--cyan)">市</span> Flips Marché</div>
      <div class="pill"><span style="color:var(--acc)">札</span> Boosters</div>
    </div>
  </div>

  <div class="footer-bar">
    POUR KYARA.GAMES · 100% LOCAL & SÉCURISÉ
  </div>
</body>
</html>`;

// =========================================================================
// SCREENSHOT TEMPLATE HELPER
// =========================================================================
function makeScreenshotHtml({ moduleNum, moduleTitle, moduleSubtitle, contentHtml }) {
  return `<!DOCTYPE html>
<html lang="fr">
<head>
<meta charset="utf-8">
<style>
${COMMON_CSS}
body {
  width: 1280px;
  height: 800px;
  background: #09080d;
  display: flex;
  flex-direction: column;
  position: relative;
}

/* Header Banner */
.header-banner {
  height: 94px;
  background: linear-gradient(180deg, #181522 0%, #0f0e15 100%);
  border-bottom: 1px solid var(--border);
  padding: 0 40px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  position: relative;
  z-index: 10;
}

.header-banner__left {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.header-badge {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-family: var(--font-mono);
  font-size: 11px;
  font-weight: 700;
  color: var(--acc);
  letter-spacing: 0.5px;
}

.header-title {
  font-family: var(--font-title);
  font-size: 21px;
  font-weight: 800;
  color: #fff;
  letter-spacing: -0.3px;
}

.header-subtitle {
  font-size: 13px;
  color: var(--fg-muted);
}

.header-banner__right {
  display: flex;
  align-items: center;
  gap: 12px;
}

.header-brand {
  display: flex;
  align-items: center;
  gap: 10px;
  background: rgba(30, 28, 38, 0.8);
  border: 1px solid var(--border);
  border-radius: 12px;
  padding: 8px 14px;
}

.header-seal {
  width: 32px;
  height: 32px;
  border-radius: 8px;
  background: var(--acc);
  color: #fff;
  font-size: 16px;
  font-weight: 900;
  display: flex;
  align-items: center;
  justify-content: center;
}

/* Main Mockup Area */
.main-stage {
  flex: 1;
  padding: 24px 36px 28px 36px;
  position: relative;
  z-index: 2;
  display: flex;
  gap: 24px;
  overflow: hidden;
}

/* Shared UI Components */
.kpi-row {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 12px;
  margin-bottom: 16px;
}

.kpi-box {
  background: #15141a;
  border: 1px solid var(--border);
  border-radius: 10px;
  padding: 9px 12px;
}

.kpi-box__head {
  display: flex;
  justify-content: space-between;
  font-size: 10px;
  font-family: var(--font-mono);
  color: var(--fg-muted);
  margin-bottom: 4px;
}

.kpi-box__val {
  font-size: 17px;
  font-weight: 800;
  font-family: var(--font-mono);
}

.badge-m { background: var(--rarity-m); color: #fff; font-size: 10px; font-weight: 800; padding: 2px 7px; border-radius: 4px; font-family: var(--font-mono); }
.badge-l { background: var(--rarity-l); color: #000; font-size: 10px; font-weight: 800; padding: 2px 7px; border-radius: 4px; font-family: var(--font-mono); }
.badge-e { background: var(--rarity-e); color: #fff; font-size: 10px; font-weight: 800; padding: 2px 7px; border-radius: 4px; font-family: var(--font-mono); }
.badge-c { background: var(--rarity-c); color: #000; font-size: 10px; font-weight: 800; padding: 2px 7px; border-radius: 4px; font-family: var(--font-mono); }

.btn-buy { background: var(--cyan); color: #000; font-weight: 800; font-size: 11px; padding: 6px 12px; border-radius: 6px; border: none; font-family: var(--font-body); }
.btn-sell { background: var(--gold); color: #000; font-weight: 800; font-size: 11px; padding: 6px 12px; border-radius: 6px; border: none; font-family: var(--font-body); }
.btn-recycle { background: var(--emerald); color: #000; font-weight: 800; font-size: 11px; padding: 6px 12px; border-radius: 6px; border: none; font-family: var(--font-body); }
</style>
</head>
<body>
  <div class="grid-pattern"></div>
  <div class="glow-orb" style="top: 80px; left: 100px; width: 400px; height: 400px; background: rgba(255, 77, 46, 0.1);"></div>
  <div class="glow-orb" style="bottom: 50px; right: 150px; width: 450px; height: 450px; background: rgba(245, 197, 24, 0.1);"></div>

  <div class="header-banner">
    <div class="header-banner__left">
      <div class="header-badge">
        <span>⚡ KYARA MANAGER</span>
        <span>•</span>
        <span>MODULE ${moduleNum}</span>
      </div>
      <h1 class="header-title">${moduleTitle}</h1>
      <p class="header-subtitle">${moduleSubtitle}</p>
    </div>
    <div class="header-banner__right">
      <div class="header-brand">
        <div class="header-seal">操</div>
        <div>
          <div style="font-family: var(--font-title); font-size: 13px; font-weight: 900; color: #fff;">KYARA MANAGER</div>
          <div style="font-size: 10.5px; color: var(--emerald); font-weight: 700;">● Pilote Connecté (v1.1)</div>
        </div>
      </div>
    </div>
  </div>

  <div class="main-stage">
    ${contentHtml}
  </div>
</body>
</html>`;
}

// =========================================================================
// 3. SCREENSHOT 1: AUTOPILOT (1280 x 800)
// =========================================================================
const HTML_SCREENSHOT_1 = makeScreenshotHtml({
  moduleNum: '01',
  moduleTitle: 'Pilote Automatique Global & Tableau de Bord des Gains (ROI)',
  moduleSubtitle: 'Automatisez la vente, le recyclage, les flips et l\'ouverture live tout en mesurant vos gains nets en direct.',
  contentHtml: `
    <!-- Left: Game preview & in-game HUD -->
    <div style="flex: 1; background: #121117; border: 1px solid var(--border); border-radius: 14px; padding: 18px; display: flex; flex-direction: column; justify-content: space-between; position: relative;">
      <div>
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 14px; border-bottom: 1px solid var(--border); padding-bottom: 10px;">
          <div style="font-size: 12px; font-family: var(--font-mono); color: var(--fg-muted);">NAVIGATION : https://kyara.games/collection</div>
          <div style="background: rgba(255, 77, 46, 0.15); color: var(--acc); font-size: 10px; font-weight: 800; padding: 3px 8px; border-radius: 6px;">PAGE KYARA.GAMES</div>
        </div>
        <div style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px;">
          <div style="background: #181720; border: 1px solid #2e2b36; border-radius: 10px; padding: 12px; text-align: center;">
            <div style="font-size: 36px; margin: 8px 0;">🥷</div>
            <div style="font-size: 12px; font-weight: 800; color: #fff;">Sasuke Uchiha</div>
            <div style="font-size: 10px; color: var(--gold); font-family: var(--font-mono);">Légendaire · 4 200 ◆</div>
          </div>
          <div style="background: #181720; border: 1px solid #ff4d2e; border-radius: 10px; padding: 12px; text-align: center; box-shadow: 0 0 16px rgba(255,77,46,0.2);">
            <div style="font-size: 36px; margin: 8px 0;">⚡</div>
            <div style="font-size: 12px; font-weight: 800; color: #fff;">Madara Uchiha</div>
            <div style="font-size: 10px; color: var(--acc); font-family: var(--font-mono);">Mythique · 18 500 ◆</div>
          </div>
          <div style="background: #181720; border: 1px solid #2e2b36; border-radius: 10px; padding: 12px; text-align: center;">
            <div style="font-size: 36px; margin: 8px 0;">🌀</div>
            <div style="font-size: 12px; font-weight: 800; color: #fff;">Minato Namikaze</div>
            <div style="font-size: 10px; color: var(--gold); font-family: var(--font-mono);">Légendaire · 6 800 ◆</div>
          </div>
        </div>
      </div>

      <!-- In-Game Floating HUD -->
      <div style="background: rgba(21, 20, 26, 0.96); border: 1px solid #3f3b4a; border-radius: 12px; padding: 10px 14px; display: flex; align-items: center; justify-content: space-between; box-shadow: 0 12px 30px rgba(0,0,0,0.8);">
        <div style="display: flex; align-items: center; gap: 10px;">
          <div style="width: 28px; height: 28px; border-radius: 7px; background: var(--acc); color: #fff; display: flex; align-items: center; justify-content: center; font-weight: 900; font-size: 14px;">操</div>
          <div>
            <div style="font-size: 11.5px; font-weight: 800; color: #fff;">HUD Kyara Manager (En jeu)</div>
            <div style="font-size: 10px; color: var(--emerald); font-family: var(--font-mono);">Pilote en continu : Vente & Recyclage OK</div>
          </div>
        </div>
        <div style="font-family: var(--font-mono); font-size: 12px; font-weight: 800; color: var(--gold);">48 290 ◆</div>
      </div>
    </div>

    <!-- Right: Side Panel Full View -->
    <div style="width: 580px; background: #15141a; border: 1px solid var(--border); border-radius: 14px; padding: 18px; display: flex; flex-direction: column; gap: 12px; overflow: hidden;">
      <!-- KPIs -->
      <div class="kpi-row">
        <div class="kpi-box">
          <div class="kpi-box__head"><span>CHAKRA</span> <span>◆</span></div>
          <div class="kpi-box__val" style="color: var(--gold);">48 290 ◆</div>
        </div>
        <div class="kpi-box">
          <div class="kpi-box__head"><span>BOOSTERS</span> <span>札</span></div>
          <div class="kpi-box__val" style="color: #fff;">10 / 10</div>
        </div>
        <div class="kpi-box">
          <div class="kpi-box__head"><span>MARCHÉ</span> <span>市</span></div>
          <div class="kpi-box__val" style="color: #fff;">10 / 10</div>
        </div>
        <div class="kpi-box">
          <div class="kpi-box__head"><span>PITIÉ</span> <span>神</span></div>
          <div class="kpi-box__val" style="color: var(--gold);">242 / 250</div>
        </div>
      </div>

      <!-- Master Hero Switch Card -->
      <div style="background: linear-gradient(135deg, #201c2b, #171520); border: 1px solid var(--border-light); border-radius: 12px; padding: 14px 16px;">
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
          <div style="display: flex; align-items: center; gap: 8px;">
            <span style="width: 8px; height: 8px; border-radius: 50%; background: var(--emerald); box-shadow: 0 0 8px var(--emerald);"></span>
            <span style="font-size: 11px; font-weight: 800; font-family: var(--font-mono); color: var(--emerald);">PILOTE ACTIF (EN CONTINU)</span>
          </div>
          <div style="width: 44px; height: 24px; background: var(--emerald); border-radius: 12px; padding: 2px; display: flex; justify-content: flex-end; align-items: center;">
            <div style="width: 20px; height: 20px; border-radius: 50%; background: #fff;"></div>
          </div>
        </div>
        <h2 style="font-size: 15px; font-weight: 800; color: #fff; margin-bottom: 4px;">Pilote Automatique Global</h2>
        <p style="font-size: 11.5px; color: var(--fg-muted);">Orchestration autonome des 4 modules avec respect des quotas anti-ban et sanctuarisation du Chakra.</p>
      </div>

      <!-- ROI Card -->
      <div style="background: #191822; border: 1px solid rgba(245, 197, 24, 0.3); border-radius: 12px; padding: 12px 14px;">
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
          <span style="font-size: 11px; font-weight: 800; color: var(--gold);">益 TABLEAU DE BORD DES GAINS NETS (ROI)</span>
          <span style="font-family: var(--font-mono); font-size: 16px; font-weight: 900; color: var(--gold);">+24 680 ◆ TOTAL</span>
        </div>
        <div style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; font-family: var(--font-mono); font-size: 10.5px;">
          <div style="background: #14131a; padding: 6px 8px; border-radius: 6px;">Ventes : <b style="color:#fff;">38</b> (+16 200 ◆)</div>
          <div style="background: #14131a; padding: 6px 8px; border-radius: 6px;">Recyclages : <b style="color:#fff;">142</b> (+8 480 ◆)</div>
          <div style="background: #14131a; padding: 6px 8px; border-radius: 6px;">Boosters : <b style="color:#fff;">12</b> (2M / 3L)</div>
        </div>
      </div>

      <!-- Live Activity Log -->
      <div style="flex: 1; background: #0e0d13; border: 1px solid var(--border); border-radius: 10px; padding: 10px 12px; font-family: var(--font-mono); font-size: 10.5px; display: flex; flex-direction: column; gap: 6px;">
        <div style="color: var(--fg-muted); font-weight: 700; margin-bottom: 2px;">JOURNAL D'ACTIVITÉ EN TEMPS RÉEL :</div>
        <div style="color: var(--gold);"><span style="color:var(--fg-dim);">[18:54:12]</span> 💰 Vente réussie : Sasuke Uchiha (L) vendu à 4 200 ◆ (+3 990 ◆ net)</div>
        <div style="color: var(--emerald);"><span style="color:var(--fg-dim);">[18:53:45]</span> ♻️ 18 doublons recyclés intelligemment (+360 ◆ chakra)</div>
        <div style="color: var(--acc);"><span style="color:var(--fg-dim);">[18:52:10]</span> 札 Tirage live réussi : Booster Hokage ouvert (Mythique Madara obtenu !)</div>
        <div style="color: var(--cyan);"><span style="color:var(--fg-dim);">[18:50:02]</span> ⚡ Flip marché détecté et acheté : Pain Tendô (-32% de décote)</div>
      </div>
    </div>
  `
});

// =========================================================================
// 4. SCREENSHOT 2: DOUBLONS (1280 x 800)
// =========================================================================
const HTML_SCREENSHOT_2 = makeScreenshotHtml({
  moduleNum: '02',
  moduleTitle: 'Arbitrage Économique & Gestion des Doublons',
  moduleSubtitle: 'Matrice de décision VENDRE vs RECYCLER basée sur les médianes réelles 7j/30j avec garde-fou anti-bradage.',
  contentHtml: `
    <div style="flex: 1; background: #15141a; border: 1px solid var(--border); border-radius: 14px; padding: 22px; display: flex; flex-direction: column; gap: 16px;">
      <!-- Summary Bar -->
      <div style="display: flex; justify-content: space-between; align-items: center; background: #1c1a24; border: 1px solid var(--border); border-radius: 12px; padding: 14px 18px;">
        <div>
          <div style="font-size: 15px; font-weight: 800; color: #fff;">34 Cartes en Doublon Détectées</div>
          <div style="font-size: 12px; color: var(--fg-muted); margin-top: 2px;">12 cartes profitables à la vente (+28 400 ◆) · 22 cartes à recycler (+440 ◆)</div>
        </div>
        <div style="display: flex; gap: 10px;">
          <button class="btn-sell">Vendre tous les doublons rentables</button>
          <button class="btn-recycle">Recycler les surplus</button>
        </div>
      </div>

      <!-- Data Table -->
      <div style="flex: 1; background: #111016; border: 1px solid var(--border); border-radius: 12px; overflow: hidden; display: flex; flex-direction: column;">
        <div style="display: grid; grid-template-columns: 2fr 1fr 1fr 1.2fr 1.2fr; padding: 10px 16px; background: #17161e; border-bottom: 1px solid var(--border); font-size: 11px; font-family: var(--font-mono); color: var(--fg-muted); font-weight: 700;">
          <div>CARTE & RARETÉ</div>
          <div>DOUBLONS</div>
          <div>MÉDIANE 7J</div>
          <div>ESTIMATION</div>
          <div style="text-align: right;">ACTION CONSEILLÉE</div>
        </div>

        <div style="display: flex; flex-direction: column; font-size: 12px; divide-y: 1px solid var(--border);">
          <div style="display: grid; grid-template-columns: 2fr 1fr 1fr 1.2fr 1.2fr; padding: 12px 16px; align-items: center; border-bottom: 1px solid var(--border);">
            <div style="display: flex; align-items: center; gap: 8px;">
              <span class="badge-m">M</span>
              <span style="font-weight: 800; color: #fff;">Itachi Uchiha (Edo Tensei)</span>
            </div>
            <div style="font-family: var(--font-mono); color: var(--gold); font-weight: 700;">×2</div>
            <div style="font-family: var(--font-mono);">14 500 ◆</div>
            <div style="font-family: var(--font-mono); color: var(--emerald); font-weight: 700;">14 200 ◆ net</div>
            <div style="text-align: right;"><button class="btn-sell">VENDRE (14 200 ◆)</button></div>
          </div>

          <div style="display: grid; grid-template-columns: 2fr 1fr 1fr 1.2fr 1.2fr; padding: 12px 16px; align-items: center; border-bottom: 1px solid var(--border);">
            <div style="display: flex; align-items: center; gap: 8px;">
              <span class="badge-l">L</span>
              <span style="font-weight: 800; color: #fff;">Pain Tendô (Akatsuki)</span>
            </div>
            <div style="font-family: var(--font-mono); color: var(--gold); font-weight: 700;">×1</div>
            <div style="font-family: var(--font-mono);">5 400 ◆</div>
            <div style="font-family: var(--font-mono); color: var(--emerald); font-weight: 700;">5 250 ◆ net</div>
            <div style="text-align: right;"><button class="btn-sell">VENDRE (5 250 ◆)</button></div>
          </div>

          <div style="display: grid; grid-template-columns: 2fr 1fr 1fr 1.2fr 1.2fr; padding: 12px 16px; align-items: center; border-bottom: 1px solid var(--border);">
            <div style="display: flex; align-items: center; gap: 8px;">
              <span class="badge-e">E</span>
              <span style="font-weight: 800; color: #fff;">Kakashi Hatake (Raikiri)</span>
            </div>
            <div style="font-family: var(--font-mono); color: var(--gold); font-weight: 700;">×3</div>
            <div style="font-family: var(--font-mono);">1 200 ◆</div>
            <div style="font-family: var(--font-mono); color: var(--emerald); font-weight: 700;">1 180 ◆ net</div>
            <div style="text-align: right;"><button class="btn-sell">VENDRE (1 180 ◆)</button></div>
          </div>

          <div style="display: grid; grid-template-columns: 2fr 1fr 1fr 1.2fr 1.2fr; padding: 12px 16px; align-items: center; border-bottom: 1px solid var(--border);">
            <div style="display: flex; align-items: center; gap: 8px;">
              <span class="badge-c">C</span>
              <span style="font-weight: 700; color: var(--fg-muted);">Ninja de Kiri</span>
            </div>
            <div style="font-family: var(--font-mono); color: var(--fg-dim);">×14</div>
            <div style="font-family: var(--font-mono); color: var(--fg-dim);">15 ◆ (Trop bas)</div>
            <div style="font-family: var(--font-mono); color: var(--emerald); font-weight: 700;">Recyclage : 20 ◆</div>
            <div style="text-align: right;"><button class="btn-recycle">RECYCLER (20 ◆)</button></div>
          </div>

          <div style="display: grid; grid-template-columns: 2fr 1fr 1fr 1.2fr 1.2fr; padding: 12px 16px; align-items: center;">
            <div style="display: flex; align-items: center; gap: 8px;">
              <span class="badge-c">C</span>
              <span style="font-weight: 700; color: var(--fg-muted);">Clone Aqueux</span>
            </div>
            <div style="font-family: var(--font-mono); color: var(--fg-dim);">×8</div>
            <div style="font-family: var(--font-mono); color: var(--fg-dim);">12 ◆ (Trop bas)</div>
            <div style="font-family: var(--font-mono); color: var(--emerald); font-weight: 700;">Recyclage : 20 ◆</div>
            <div style="text-align: right;"><button class="btn-recycle">RECYCLER (20 ◆)</button></div>
          </div>
        </div>
      </div>

      <!-- Protection Callout -->
      <div style="background: rgba(63, 191, 127, 0.08); border: 1px solid rgba(63, 191, 127, 0.3); border-radius: 10px; padding: 10px 14px; display: flex; align-items: center; gap: 10px; font-size: 11.5px; color: var(--emerald);">
        <span style="font-size: 16px;">🛡️</span>
        <span><b>Garde-fou anti-bradage actif (70%) :</b> Aucune carte n'est bradée sous sa cote. Vos cartes verrouillées et au moins 1 exemplaire de chaque personnage sont toujours protégés.</span>
      </div>
    </div>
  `
});

// =========================================================================
// 5. SCREENSHOT 3: MARCHÉ & FLIPS (1280 x 800)
// =========================================================================
const HTML_SCREENSHOT_3 = makeScreenshotHtml({
  moduleNum: '03',
  moduleTitle: 'Scanner de Marché & Achat-Revente (Flips Automatiques)',
  moduleSubtitle: 'Détectez les cartes sous-cotées en temps réel avec calcul automatique de rentabilité nette (taxe 5% & dépôt 2%).',
  contentHtml: `
    <div style="flex: 1; background: #15141a; border: 1px solid var(--border); border-radius: 14px; padding: 22px; display: flex; flex-direction: column; gap: 16px;">
      <!-- Stats Summary -->
      <div style="display: flex; justify-content: space-between; align-items: center; background: #191822; border: 1px solid rgba(77, 214, 255, 0.3); border-radius: 12px; padding: 14px 18px;">
        <div>
          <div style="font-size: 15px; font-weight: 800; color: #fff;">18 Bons Plans Identifiés sur le Marché Kyara</div>
          <div style="font-size: 12px; color: var(--cyan); margin-top: 2px;">Marge nette moyenne : +34.5% · Profit potentiel total : +12 850 ◆</div>
        </div>
        <div style="display: flex; gap: 8px;">
          <span style="background: rgba(77, 214, 255, 0.15); border: 1px solid var(--cyan); color: var(--cyan); font-size: 11px; font-weight: 700; padding: 6px 12px; border-radius: 6px; font-family: var(--font-mono);">SCAN ACTIF TOUTES LES 60S</span>
        </div>
      </div>

      <!-- Deals Grid -->
      <div style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 16px;">
        <!-- Deal 1 -->
        <div style="background: #191722; border: 2px solid var(--acc); border-radius: 14px; padding: 16px; display: flex; flex-direction: column; justify-content: space-between; box-shadow: 0 10px 30px rgba(255,77,46,0.15);">
          <div>
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px;">
              <span class="badge-m">MYTHIQUE</span>
              <span style="background: rgba(255, 77, 46, 0.2); color: var(--acc); font-size: 10px; font-weight: 800; padding: 3px 8px; border-radius: 999px;">-31.5% SOUS-COTÉ</span>
            </div>
            <div style="font-size: 15px; font-weight: 900; color: #fff; margin-bottom: 6px;">Naruto (Mode Kurama)</div>
            <div style="font-size: 11px; color: var(--fg-muted); margin-bottom: 12px;">Vendeur pressé · Prix plancher immédiat</div>
            
            <div style="background: #111016; border-radius: 8px; padding: 10px; font-family: var(--font-mono); font-size: 11px; display: flex; flex-direction: column; gap: 4px; margin-bottom: 14px;">
              <div style="display: flex; justify-content: space-between;"><span>Prix d'achat :</span> <b style="color:#fff;">11 500 ◆</b></div>
              <div style="display: flex; justify-content: space-between;"><span>Cote marché 7j :</span> <span>16 800 ◆</span></div>
              <div style="display: flex; justify-content: space-between; color: var(--fg-dim);"><span>Frais (5% + 2%) :</span> <span>-1 176 ◆</span></div>
              <div style="border-top: 1px solid var(--border); padding-top: 4px; display: flex; justify-content: space-between; color: var(--emerald); font-weight: 800;">
                <span>Gain Net Estimé :</span>
                <span>+4 124 ◆ (+35.8%)</span>
              </div>
            </div>
          </div>
          <button class="btn-buy" style="width: 100%; padding: 10px;">⚡ Acheter pour Flip Immédiat</button>
        </div>

        <!-- Deal 2 -->
        <div style="background: #191722; border: 2px solid var(--gold); border-radius: 14px; padding: 16px; display: flex; flex-direction: column; justify-content: space-between; box-shadow: 0 10px 30px rgba(245,197,24,0.15);">
          <div>
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px;">
              <span class="badge-l">LÉGENDAIRE</span>
              <span style="background: rgba(245, 197, 24, 0.2); color: var(--gold); font-size: 10px; font-weight: 800; padding: 3px 8px; border-radius: 999px;">-34.7% SOUS-COTÉ</span>
            </div>
            <div style="font-size: 15px; font-weight: 900; color: #fff; margin-bottom: 6px;">Jiraiya (Mode Ermite)</div>
            <div style="font-size: 11px; color: var(--fg-muted); margin-bottom: 12px;">Forte demande sur les 30 derniers jours</div>
            
            <div style="background: #111016; border-radius: 8px; padding: 10px; font-family: var(--font-mono); font-size: 11px; display: flex; flex-direction: column; gap: 4px; margin-bottom: 14px;">
              <div style="display: flex; justify-content: space-between;"><span>Prix d'achat :</span> <b style="color:#fff;">3 200 ◆</b></div>
              <div style="display: flex; justify-content: space-between;"><span>Cote marché 7j :</span> <span>4 900 ◆</span></div>
              <div style="display: flex; justify-content: space-between; color: var(--fg-dim);"><span>Frais (5% + 2%) :</span> <span>-343 ◆</span></div>
              <div style="border-top: 1px solid var(--border); padding-top: 4px; display: flex; justify-content: space-between; color: var(--emerald); font-weight: 800;">
                <span>Gain Net Estimé :</span>
                <span>+1 357 ◆ (+42.4%)</span>
              </div>
            </div>
          </div>
          <button class="btn-buy" style="width: 100%; padding: 10px;">⚡ Acheter pour Flip Immédiat</button>
        </div>

        <!-- Deal 3 -->
        <div style="background: #191722; border: 2px solid var(--purple); border-radius: 14px; padding: 16px; display: flex; flex-direction: column; justify-content: space-between; box-shadow: 0 10px 30px rgba(176,114,255,0.15);">
          <div>
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px;">
              <span class="badge-e">ÉPIQUE</span>
              <span style="background: rgba(176, 114, 255, 0.2); color: var(--purple); font-size: 10px; font-weight: 800; padding: 3px 8px; border-radius: 999px;">-40.0% SOUS-COTÉ</span>
            </div>
            <div style="font-size: 15px; font-weight: 900; color: #fff; margin-bottom: 6px;">Gaara du Désert</div>
            <div style="font-size: 11px; color: var(--fg-muted); margin-bottom: 12px;">Personnage manquant pour votre collection !</div>
            
            <div style="background: #111016; border-radius: 8px; padding: 10px; font-family: var(--font-mono); font-size: 11px; display: flex; flex-direction: column; gap: 4px; margin-bottom: 14px;">
              <div style="display: flex; justify-content: space-between;"><span>Prix d'achat :</span> <b style="color:#fff;">750 ◆</b></div>
              <div style="display: flex; justify-content: space-between;"><span>Cote marché 7j :</span> <span>1 250 ◆</span></div>
              <div style="display: flex; justify-content: space-between; color: var(--fg-dim);"><span>Frais (5% + 2%) :</span> <span>-88 ◆</span></div>
              <div style="border-top: 1px solid var(--border); padding-top: 4px; display: flex; justify-content: space-between; color: var(--emerald); font-weight: 800;">
                <span>Gain Net Estimé :</span>
                <span>+412 ◆ (+54.9%)</span>
              </div>
            </div>
          </div>
          <button class="btn-buy" style="width: 100%; padding: 10px;">⚡ Acheter pour Flip Immédiat</button>
        </div>
      </div>
    </div>
  `
});

// =========================================================================
// 6. SCREENSHOT 4: BOOSTERS (1280 x 800)
// =========================================================================
const HTML_SCREENSHOT_4 = makeScreenshotHtml({
  moduleNum: '04',
  moduleTitle: 'Rentabilité des Boosters (EV) & Pilotage Live de l\'Ouverture',
  moduleSubtitle: 'Classement mathématique selon l\'espérance de gain en Chakra (EV) et tirage interactif direct sur Kyara.games.',
  contentHtml: `
    <!-- Left: EV Ranking & Recommended Booster -->
    <div style="width: 480px; background: #15141a; border: 1px solid var(--border); border-radius: 14px; padding: 20px; display: flex; flex-direction: column; gap: 14px;">
      <div style="background: linear-gradient(135deg, rgba(255,77,46,0.15), rgba(245,197,24,0.1)); border: 1px solid var(--acc); border-radius: 12px; padding: 14px;">
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 6px;">
          <span style="background: var(--acc); color:#fff; font-size: 10px; font-weight: 900; padding: 2px 7px; border-radius: 4px;">BOOSTER #1 CONSEILLÉ</span>
          <span style="font-family: var(--font-mono); font-size: 12px; font-weight: 800; color: var(--gold);">EV : +842 ◆ / pack</span>
        </div>
        <div style="font-size: 16px; font-weight: 900; color: #fff;">Booster Édition Hokage</div>
        <div style="font-size: 11.5px; color: var(--fg-muted); margin: 4px 0 12px 0;">Rentabilité maximale du jeu · Probabilité L/M : 18.6%</div>
        <button style="width: 100%; background: var(--acc); color: #fff; font-weight: 800; font-size: 12px; padding: 8px; border-radius: 8px; border: none; font-family: var(--font-body); cursor: pointer;">札 Ouvrir en direct sur Kyara.games</button>
      </div>

      <!-- Pity Sniper Banner -->
      <div style="background: #1c1a24; border: 1px solid var(--gold); border-radius: 10px; padding: 12px;">
        <div style="display: flex; justify-content: space-between; font-size: 11.5px; font-weight: 800; margin-bottom: 6px;">
          <span style="color: var(--gold);">🎯 PITIÉ MYTHIQUE IMMINENTE</span>
          <span style="font-family: var(--font-mono); color: #fff;">242 / 250</span>
        </div>
        <div style="height: 8px; background: #0c0b10; border-radius: 4px; overflow: hidden; margin-bottom: 6px;">
          <div style="width: 96.8%; height: 100%; background: linear-gradient(90deg, var(--gold), var(--acc));"></div>
        </div>
        <div style="font-size: 10.5px; color: var(--fg-muted);">Plus que 8 tirages avant un nouveau personnage Mythique garanti à 100% !</div>
      </div>

      <!-- Other packs -->
      <div style="display: flex; flex-direction: column; gap: 8px; font-family: var(--font-mono); font-size: 11.5px;">
        <div style="display: flex; justify-content: space-between; background: #181720; padding: 8px 12px; border-radius: 8px; border: 1px solid var(--border);">
          <span>#2 Booster Shippuden</span>
          <span style="color: var(--emerald);">EV : +620 ◆</span>
        </div>
        <div style="display: flex; justify-content: space-between; background: #181720; padding: 8px 12px; border-radius: 8px; border: 1px solid var(--border);">
          <span>#3 Booster Akatsuki</span>
          <span style="color: var(--emerald);">EV : +580 ◆</span>
        </div>
        <div style="display: flex; justify-content: space-between; background: #181720; padding: 8px 12px; border-radius: 8px; border: 1px solid var(--border);">
          <span>#4 Booster Genin</span>
          <span style="color: var(--fg-muted);">EV : +310 ◆</span>
        </div>
      </div>
    </div>

    <!-- Right: In-Game Live Opening Animation View -->
    <div style="flex: 1; background: #0f0e14; border: 1px solid var(--border); border-radius: 14px; padding: 22px; display: flex; flex-direction: column; justify-content: space-between; position: relative;">
      <div style="display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid var(--border); padding-bottom: 10px;">
        <span style="font-size: 12px; font-family: var(--font-mono); color: var(--fg-muted);">PILOTAGE DU NAVIGATEUR : kyara.games/ouvrir/hokage</span>
        <span style="background: rgba(63, 191, 127, 0.15); color: var(--emerald); font-size: 10.5px; font-weight: 800; padding: 3px 8px; border-radius: 6px;">ANIMATION EN DIRECT</span>
      </div>

      <div style="display: flex; justify-content: center; align-items: center; gap: 20px; margin: 20px 0;">
        <!-- Card 1 Pulled (Mythic) -->
        <div style="width: 170px; background: linear-gradient(145deg, #2a1520, #131018); border: 2px solid var(--acc); border-radius: 14px; padding: 12px; text-align: center; box-shadow: 0 0 30px var(--acc-glow);">
          <span class="badge-m">MYTHIQUE ★★★</span>
          <div style="font-size: 48px; margin: 12px 0;">🌳</div>
          <div style="font-size: 13px; font-weight: 800; color: #fff;">Hashirama Senju</div>
          <div style="font-size: 11px; color: var(--gold); font-family: var(--font-mono); margin-top: 4px;">NOUVEAU ! (22 000 ◆)</div>
        </div>

        <!-- Card 2 Pulled (Legendary) -->
        <div style="width: 160px; background: linear-gradient(145deg, #262013, #131018); border: 2px solid var(--gold); border-radius: 14px; padding: 12px; text-align: center; box-shadow: 0 0 20px var(--gold-glow);">
          <span class="badge-l">LÉGENDAIRE</span>
          <div style="font-size: 44px; margin: 12px 0;">🌊</div>
          <div style="font-size: 13px; font-weight: 800; color: #fff;">Tobirama Senju</div>
          <div style="font-size: 11px; color: var(--gold); font-family: var(--font-mono); margin-top: 4px;">Doublon (5 800 ◆)</div>
        </div>

        <!-- Card 3 Pulled (Epic) -->
        <div style="width: 150px; background: #171520; border: 1px solid var(--purple); border-radius: 14px; padding: 12px; text-align: center;">
          <span class="badge-e">ÉPIQUE</span>
          <div style="font-size: 40px; margin: 12px 0;">🌸</div>
          <div style="font-size: 12px; font-weight: 800; color: #fff;">Tsunade</div>
          <div style="font-size: 10.5px; color: var(--purple); font-family: var(--font-mono); margin-top: 4px;">1 400 ◆</div>
        </div>
      </div>

      <!-- Toast Pilot Notification -->
      <div style="background: rgba(255, 77, 46, 0.15); border: 1px solid var(--acc); border-radius: 10px; padding: 10px 14px; display: flex; align-items: center; gap: 10px;">
        <span style="font-size: 18px;">🔔</span>
        <div style="font-size: 11.5px; color: #fff;">
          <b>Kyara Manager :</b> Tirage Mythique exceptionnel détecté et journalisé sans rechargement de page.
        </div>
      </div>
    </div>
  `
});

// =========================================================================
// 7. SCREENSHOT 5: SECURITE & GARDE-FOUS (1280 x 800)
// =========================================================================
const HTML_SCREENSHOT_5 = makeScreenshotHtml({
  moduleNum: '05',
  moduleTitle: 'Sanctuaire de Chakra, Garde-fous & Confidentialité Totale',
  moduleSubtitle: 'Protégez votre solde avec des limites strictes. Exécution 100% locale dans votre navigateur (Manifest V3).',
  contentHtml: `
    <div style="flex: 1; display: grid; grid-template-columns: 1.1fr 0.9fr; gap: 20px;">
      <!-- Left: Settings Panels -->
      <div style="background: #15141a; border: 1px solid var(--border); border-radius: 14px; padding: 22px; display: flex; flex-direction: column; gap: 16px;">
        <!-- Card 1: Chakra Reserve -->
        <div style="background: #1b1923; border: 1px solid var(--border); border-radius: 12px; padding: 14px;">
          <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
            <span style="font-size: 13px; font-weight: 800; color: #fff;">Sanctuaire de Chakra (Réserve Protégée)</span>
            <span style="font-family: var(--font-mono); font-size: 14px; font-weight: 900; color: var(--gold);">5 000 ◆</span>
          </div>
          <p style="font-size: 11.5px; color: var(--fg-muted); margin-bottom: 10px;">Le pilote automatique ne dépensera jamais en-dessous de ce seuil de sécurité.</p>
          <div style="height: 6px; background: #0c0b10; border-radius: 3px; position: relative;">
            <div style="width: 40%; height: 100%; background: var(--gold); border-radius: 3px;"></div>
            <div style="position: absolute; left: 40%; top: -5px; width: 16px; height: 16px; border-radius: 50%; background: #fff; box-shadow: 0 0 8px var(--gold);"></div>
          </div>
        </div>

        <!-- Card 2: Anti-Bradage -->
        <div style="background: #1b1923; border: 1px solid var(--border); border-radius: 12px; padding: 14px;">
          <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
            <span style="font-size: 13px; font-weight: 800; color: #fff;">Garde-Fou Anti-Bradage</span>
            <span style="font-family: var(--font-mono); font-size: 14px; font-weight: 900; color: var(--acc);">70% DE LA COTE</span>
          </div>
          <p style="font-size: 11.5px; color: var(--fg-muted); margin-bottom: 10px;">Bloque toute vente automatique si le prix du marché plonge sous 70% de la médiane 7j.</p>
          <div style="height: 6px; background: #0c0b10; border-radius: 3px; position: relative;">
            <div style="width: 70%; height: 100%; background: var(--acc); border-radius: 3px;"></div>
            <div style="position: absolute; left: 70%; top: -5px; width: 16px; height: 16px; border-radius: 50%; background: #fff; box-shadow: 0 0 8px var(--acc);"></div>
          </div>
        </div>

        <!-- Card 3: Collection Rules -->
        <div style="background: #1b1923; border: 1px solid var(--border); border-radius: 12px; padding: 14px; display: flex; flex-direction: column; gap: 8px;">
          <span style="font-size: 13px; font-weight: 800; color: #fff; margin-bottom: 4px;">Règles de Protection de la Collection</span>
          <div style="display: flex; align-items: center; gap: 8px; font-size: 11.5px; color: var(--fg);">
            <span style="color: var(--emerald); font-weight: 900;">✓</span>
            <span>Toujours conserver au moins 1 exemplaire pour le Pokédex / Collection</span>
          </div>
          <div style="display: flex; align-items: center; gap: 8px; font-size: 11.5px; color: var(--fg);">
            <span style="color: var(--emerald); font-weight: 900;">✓</span>
            <span>Protéger les cartes verrouillées (Locked, Pinned, En Réincarnation)</span>
          </div>
          <div style="display: flex; align-items: center; gap: 8px; font-size: 11.5px; color: var(--emerald); font-weight: 900;">
            <span style="color: var(--emerald); font-weight: 900;">✓</span>
            <span>Exclure automatiquement les raretés Mythiques & Légendaires du recyclage</span>
          </div>
        </div>
      </div>

      <!-- Right: Privacy & Security Trust Badges -->
      <div style="display: flex; flex-direction: column; gap: 14px;">
        <div style="background: #15141a; border: 1px solid rgba(63, 191, 127, 0.35); border-radius: 14px; padding: 18px; display: flex; gap: 14px; align-items: flex-start;">
          <div style="width: 40px; height: 40px; border-radius: 10px; background: rgba(63, 191, 127, 0.15); color: var(--emerald); font-size: 20px; display: flex; align-items: center; justify-content: center; flex-shrink: 0;">🔒</div>
          <div>
            <div style="font-size: 14px; font-weight: 800; color: #fff; margin-bottom: 4px;">100% Local & Zéro Télémétrie</div>
            <div style="font-size: 11.5px; color: var(--fg-muted); line-height: 1.45;">Kyara Manager s'exécute exclusivement dans votre navigateur (Manifest V3). Aucune donnée personnelle, identifiant ou historique de navigation n'est collecté ni transmis à des serveurs tiers.</div>
          </div>
        </div>

        <div style="background: #15141a; border: 1px solid rgba(77, 214, 255, 0.35); border-radius: 14px; padding: 18px; display: flex; gap: 14px; align-items: flex-start;">
          <div style="width: 40px; height: 40px; border-radius: 10px; background: rgba(77, 214, 255, 0.15); color: var(--cyan); font-size: 20px; display: flex; align-items: center; justify-content: center; flex-shrink: 0;">⏱️</div>
          <div>
            <div style="font-size: 14px; font-weight: 800; color: #fff; margin-bottom: 4px;">Cadence Anti-Rate-Limit Adaptative</div>
            <div style="font-size: 11.5px; color: var(--fg-muted); line-height: 1.45;">Les actions d'écriture sont espacées intelligemment (file d'attente à temporisation dynamique) afin de respecter scrupuleusement les quotas officiels des serveurs de Kyara.games.</div>
          </div>
        </div>

        <div style="background: #15141a; border: 1px solid rgba(245, 197, 24, 0.35); border-radius: 14px; padding: 18px; display: flex; gap: 14px; align-items: flex-start;">
          <div style="width: 40px; height: 40px; border-radius: 10px; background: rgba(245, 197, 24, 0.15); color: var(--gold); font-size: 20px; display: flex; align-items: center; justify-content: center; flex-shrink: 0;">📜</div>
          <div>
            <div style="font-size: 14px; font-weight: 800; color: #fff; margin-bottom: 4px;">Open-Source & Auditable (Licence MIT)</div>
            <div style="font-size: 11.5px; color: var(--fg-muted); line-height: 1.45;">L'intégralité du code source est ouverte, sans code distant ni obfuscation, garantissant une transparence totale pour la communauté.</div>
          </div>
        </div>
      </div>
    </div>
  `
});

// Write HTML templates
const targets = [
  { id: 'promo-marquee-1400x560', width: 1400, height: 560, html: HTML_MARQUEE },
  { id: 'promo-small-440x280', width: 440, height: 280, html: HTML_SMALL },
  { id: 'screenshot-1-autopilot', width: 1280, height: 800, html: HTML_SCREENSHOT_1 },
  { id: 'screenshot-2-doublons', width: 1280, height: 800, html: HTML_SCREENSHOT_2 },
  { id: 'screenshot-3-marche', width: 1280, height: 800, html: HTML_SCREENSHOT_3 },
  { id: 'screenshot-4-boosters', width: 1280, height: 800, html: HTML_SCREENSHOT_4 },
  { id: 'screenshot-5-securite', width: 1280, height: 800, html: HTML_SCREENSHOT_5 },
];

for (const t of targets) {
  const tplPath = path.join(templatesDir, `${t.id}.html`);
  fs.writeFileSync(tplPath, t.html, 'utf8');
}

console.log(`Rendered ${targets.length} HTML templates in promo/templates/`);

// Render each template with Google Chrome headless
for (const t of targets) {
  const tplPath = path.join(templatesDir, `${t.id}.html`);
  const pngPath = path.join(promoDir, `${t.id}.png`);
  const jpgPath = path.join(promoDir, `${t.id}.jpg`);

  console.log(`Capturing ${t.id} (${t.width}x${t.height})...`);
  execFileSync(CHROME_PATH, [
    '--headless=new',
    '--disable-gpu',
    '--virtual-time-budget=2000',
    `--window-size=${t.width},${t.height}`,
    `--screenshot=${pngPath}`,
    `file://${tplPath}`
  ], { stdio: 'ignore' });

  // Convert to high-quality JPEG (95%) without alpha
  execFileSync('sips', [
    '-s', 'format', 'jpeg',
    '-s', 'formatOptions', '95',
    pngPath,
    '--out', jpgPath
  ], { stdio: 'ignore' });
}

console.log('All promotional assets generated successfully!');
