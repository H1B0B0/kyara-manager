import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, '..');
const promoDir = path.join(rootDir, 'promo');
const templatesDir = path.join(promoDir, 'templates');
const brainDir = '/Users/etiennementrel/.gemini/antigravity/brain/b940700c-9447-4038-95e4-aaf2f3023806';
const aiBannerPath = path.join(brainDir, 'kyara_manager_promo_banner_1793817710243.jpg');

fs.mkdirSync(promoDir, { recursive: true });
fs.mkdirSync(templatesDir, { recursive: true });

const CHROME_PATH = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
if (!fs.existsSync(CHROME_PATH)) {
  console.error('Error: Google Chrome not found at', CHROME_PATH);
  process.exit(1);
}

// Read real app files
const sidepanelHtmlRaw = fs.readFileSync(path.join(rootDir, 'sidepanel', 'sidepanel.html'), 'utf8');
const sidepanelCss = fs.readFileSync(path.join(rootDir, 'sidepanel', 'sidepanel.css'), 'utf8');
const contentCss = fs.readFileSync(path.join(rootDir, 'content', 'content.css'), 'utf8');
const analyticsJs = fs.readFileSync(path.join(rootDir, 'lib', 'analytics.js'), 'utf8');
const i18nJs = fs.readFileSync(path.join(rootDir, 'lib', 'i18n.js'), 'utf8');
const sidepanelJs = fs.readFileSync(path.join(rootDir, 'sidepanel', 'sidepanel.js'), 'utf8');

// Extract the header and main content from sidepanel.html
const bodyMatch = sidepanelHtmlRaw.match(/<header class="app-header">[\s\S]*<\/main>/);
const realSidepanelBody = bodyMatch ? bodyMatch[0] : '';

// -------------------------------------------------------------------------
// ANONYMIZED WHALE ACCOUNT MOCK DATA ("GROS CHIFFRES")
// -------------------------------------------------------------------------
const mockWhaleDataScript = `
  const mockSettings = {
    masterEnabled: true,
    autoSellDuplicates: true,
    autoRecycleDuplicates: true,
    autoBuyFlips: true,
    autoBuyMissing: true,
    autoOpenFreeBoosters: true,
    autoClaimMissions: true,
    antiAfk: true,
    chakraReserve: 15000,
    minUndercutPct: 70,
    autoSellMaxListings: 10,
    language: 'fr'
  };

  const mockDashboard = {
    authenticated: true,
    me: {
      id: 777,
      pseudo: "KyaraMaster",
      chakra: 285450,
      freePacks: 10,
      freePacksMax: 10,
      bonusPacks: 5,
      pity: 244,
      pityMax: 250
    },
    collectionStats: {
      uniqueOwned: 5842,
      catalogSize: 6736,
      completionPct: 86.7,
      sellableDuplicatesCount: 18,
      sellableNetTotal: 94500,
      recyclableDuplicatesCount: 42,
      recyclableChakraTotal: 2840
    },
    activeListings: [
      { card: { id: 101, name: "Madara Uchiha (Susanoo)", rarity: "M" }, price: 24000, expiresAt: Date.now() + 86400000 },
      { card: { id: 102, name: "Itachi Uchiha (Edo Tensei)", rarity: "M" }, price: 18500, expiresAt: Date.now() + 86400000 },
      { card: { id: 103, name: "Goku (Ultra Instinct)", rarity: "M" }, price: 22000, expiresAt: Date.now() + 86400000 },
      { card: { id: 104, name: "Minato Namikaze", rarity: "L" }, price: 7800, expiresAt: Date.now() + 86400000 },
      { card: { id: 105, name: "Pain Tendô (Akatsuki)", rarity: "L" }, price: 5400, expiresAt: Date.now() + 86400000 },
      { card: { id: 106, name: "Sasuke Uchiha (Rinnegan)", rarity: "L" }, price: 6900, expiresAt: Date.now() + 86400000 },
      { card: { id: 107, name: "Kakashi Hatake (Double Kamui)", rarity: "L" }, price: 5800, expiresAt: Date.now() + 86400000 },
      { card: { id: 108, name: "Levi Ackerman", rarity: "E" }, price: 2400, expiresAt: Date.now() + 86400000 },
      { card: { id: 109, name: "Gojo Satoru", rarity: "E" }, price: 2800, expiresAt: Date.now() + 86400000 },
      { card: { id: 110, name: "Megumin (Explosion)", rarity: "E" }, price: 1950, expiresAt: Date.now() + 86400000 }
    ],
    duplicates: [
      {
        card: { id: 201, name: "Madara Uchiha (Susanoo)", rarity: "M", resaleUntil: 0 },
        spareCopies: 2,
        evaluation: {
          median7d: 24000,
          suggestedPrice: 24000,
          netSalesProceeds: 22320,
          recycleValue: 500,
          action: "VENDRE",
          status: "OK",
          priceSurge: false
        }
      },
      {
        card: { id: 202, name: "Itachi Uchiha (Edo Tensei)", rarity: "M", resaleUntil: 0 },
        spareCopies: 1,
        evaluation: {
          median7d: 18500,
          suggestedPrice: 18500,
          netSalesProceeds: 17205,
          recycleValue: 500,
          action: "VENDRE",
          status: "OK",
          priceSurge: false
        }
      },
      {
        card: { id: 203, name: "Minato Namikaze (Éclair Jaune)", rarity: "L", resaleUntil: 0 },
        spareCopies: 3,
        evaluation: {
          median7d: 7800,
          suggestedPrice: 7800,
          netSalesProceeds: 7254,
          recycleValue: 200,
          action: "VENDRE",
          status: "OK",
          priceSurge: false
        }
      },
      {
        card: { id: 204, name: "Pain Tendô (Akatsuki)", rarity: "L", resaleUntil: 0 },
        spareCopies: 2,
        evaluation: {
          median7d: 5400,
          suggestedPrice: 5400,
          netSalesProceeds: 5022,
          recycleValue: 200,
          action: "VENDRE",
          status: "OK",
          priceSurge: false
        }
      },
      {
        card: { id: 205, name: "Ninja de Kiri (Garde)", rarity: "C", resaleUntil: 0 },
        spareCopies: 28,
        evaluation: {
          median7d: 12,
          suggestedPrice: 12,
          netSalesProceeds: 10,
          recycleValue: 20,
          action: "RECYCLER",
          status: "OK",
          priceSurge: false
        }
      }
    ],
    deals: [
      {
        card: { id: 301, name: "Naruto Uzumaki (Mode Kurama)", rarity: "M" },
        listing: { price: 12500, id: 9001 },
        median7d: 18900,
        suggestedResalePrice: 18900,
        netResaleProceeds: 17577,
        netMargin: 5077,
        marginPct: 40.6,
        isMissing: true
      },
      {
        card: { id: 302, name: "Goku (Super Saiyan)", rarity: "M" },
        listing: { price: 15000, id: 9002 },
        median7d: 22000,
        suggestedResalePrice: 21800,
        netResaleProceeds: 20274,
        netMargin: 5274,
        marginPct: 35.2,
        isMissing: false
      },
      {
        card: { id: 303, name: "Jiraiya (Mode Ermite)", rarity: "L" },
        listing: { price: 3400, id: 9003 },
        median7d: 5200,
        suggestedResalePrice: 5150,
        netResaleProceeds: 4790,
        netMargin: 1390,
        marginPct: 40.9,
        isMissing: true
      },
      {
        card: { id: 304, name: "Chelia Blendy", rarity: "C" },
        listing: { price: 12, id: 9004 },
        median7d: 20,
        suggestedResalePrice: 20,
        netResaleProceeds: 18,
        netMargin: 6,
        marginPct: 50.0,
        isMissing: true
      }
    ],
    boosters: {
      isPityNear: true,
      recommendedNew: {
        id: "hokage",
        name: "Édition Hokage",
        probAtLeastOneNewPct: 38.4,
        expectedNewCards: 1.15,
        openableFreeCount: 10,
        expectedChakra: 842
      },
      recommendedPity: {
        id: "hokage",
        name: "Édition Hokage"
      },
      ranking: [
        { id: "hokage", name: "Édition Hokage", completionPct: 72, probAtLeastOneNewPct: 38.4, expectedNewCards: 1.15, expectedChakra: 842, canOpenNow: true },
        { id: "shonen", name: "Shōnen Mix", completionPct: 68, probAtLeastOneNewPct: 34.2, expectedNewCards: 0.95, expectedChakra: 620, canOpenNow: true },
        { id: "waifus", name: "Waifus Edition", completionPct: 65, probAtLeastOneNewPct: 31.0, expectedNewCards: 0.88, expectedChakra: 580, canOpenNow: true },
        { id: "akatsuki", name: "Édition Akatsuki", completionPct: 82, probAtLeastOneNewPct: 18.2, expectedNewCards: 0.45, expectedChakra: 540, canOpenNow: true }
      ]
    }
  };

  const mockJournal = [
    { level: "success", text: "Vente réussie : Madara Uchiha (M) vendu à 24 000 ◆ (+22 320 ◆ net)", timestamp: Date.now() - 32000 },
    { level: "info", text: "Flip marché acheté : Naruto Kurama (M) à 12 500 ◆ (Cote : 18 900 ◆ · Gain net : +5 077 ◆)", timestamp: Date.now() - 95000 },
    { level: "warn", text: "Booster Hokage ouvert en direct : Tirage Mythique Hashirama !", timestamp: Date.now() - 180000 },
    { level: "info", text: "34 surplus recyclés intelligemment en Chakra (+680 ◆)", timestamp: Date.now() - 290000 },
    { level: "success", text: "Vente réussie : Itachi Uchiha (M) vendu à 18 500 ◆ (+17 205 ◆ net)", timestamp: Date.now() - 410000 }
  ];

  const mockCumulativeStats = {
    chakraFromSales: 128400,
    chakraFromRecycle: 34850,
    cardsSold: 142,
    cardsRecycled: 580,
    boostersOpenedCount: 42,
    mythicsPulledCount: 4,
    legendariesPulledCount: 4,
    startedAt: Date.now() - 86400000 * 7
  };

  window.chrome = {
    storage: {
      local: {
        get: async () => ({
          settings: mockSettings,
          kmDashboard: mockDashboard,
          kmJournal: mockJournal,
          kmCumulativeStats: mockCumulativeStats,
          kmPinnedCards: []
        }),
        set: async () => {},
        remove: async () => {}
      },
      onChanged: { addListener: () => {} }
    },
    runtime: {
      sendMessage: async (msg) => {
        if (msg.type === "km:cmd:refresh") return { ok: true, dashboard: mockDashboard };
        return { ok: true };
      },
      onMessage: { addListener: () => {} }
    }
  };
`;

// Helper to construct a screenshot template combining the real game backdrop + real sidepanel
function buildWhaleScreenshotHtml({ activeTab, badge, title, subtitle }) {
  return `<!DOCTYPE html>
<html lang="fr">
<head>
<meta charset="utf-8">
<title>${title}</title>
<style>
${sidepanelCss}
${contentCss}

* { box-sizing: border-box; }
body {
  width: 1280px;
  height: 800px;
  margin: 0;
  padding: 0;
  background: #09080c;
  overflow: hidden;
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
  display: flex;
  flex-direction: column;
}

/* Chrome Browser Top Frame */
.browser-chrome {
  height: 74px;
  background: #181622;
  border-bottom: 1px solid #282534;
  display: flex;
  flex-direction: column;
  padding: 0 16px;
  justify-content: center;
  gap: 6px;
  flex-shrink: 0;
  position: relative;
  z-index: 10;
}

.browser-dots-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.window-dots {
  display: flex;
  align-items: center;
  gap: 8px;
}
.dot { width: 12px; height: 12px; border-radius: 50%; }
.dot-red { background: #ff5f56; }
.dot-yellow { background: #ffbd2e; }
.dot-green { background: #27c93f; }

.browser-promo-tag {
  font-family: "JetBrains Mono", monospace;
  font-size: 11px;
  font-weight: 700;
  color: #ff4d2e;
  background: rgba(255, 77, 46, 0.12);
  border: 1px solid rgba(255, 77, 46, 0.35);
  padding: 3px 10px;
  border-radius: 999px;
  display: flex;
  align-items: center;
  gap: 6px;
}

.browser-bar {
  display: flex;
  align-items: center;
  gap: 12px;
}

.nav-arrows {
  display: flex;
  gap: 10px;
  color: #7a7685;
  font-size: 14px;
  font-weight: bold;
}

.url-field {
  flex: 1;
  height: 28px;
  background: #0e0d14;
  border: 1px solid #2e2b36;
  border-radius: 8px;
  display: flex;
  align-items: center;
  padding: 0 12px;
  font-family: "JetBrains Mono", monospace;
  font-size: 11.5px;
  color: #edeae4;
  gap: 8px;
}

.ext-badge {
  display: flex;
  align-items: center;
  gap: 6px;
  background: rgba(255, 77, 46, 0.15);
  border: 1px solid #ff4d2e;
  padding: 4px 10px;
  border-radius: 6px;
  font-size: 11px;
  font-weight: 800;
  color: #fff;
}

.ext-badge__seal {
  background: #ff4d2e;
  color: #fff;
  width: 18px;
  height: 18px;
  border-radius: 4px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 11px;
  font-weight: 900;
}

/* Split Workspace */
.workspace {
  flex: 1;
  display: flex;
  overflow: hidden;
}

/* Left: Authentic Game Pane */
.game-pane {
  flex: 1;
  background: radial-gradient(circle at 45% 25%, #16141f 0%, #0c0b10 75%);
  position: relative;
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  border-right: 2px solid #282534;
  overflow: hidden;
  padding: 22px 28px;
}

.game-navbar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  border-bottom: 1px solid #23212b;
  padding-bottom: 12px;
}

.game-logo {
  font-family: "Unbounded", sans-serif;
  font-weight: 900;
  font-size: 18px;
  color: #fff;
  letter-spacing: 1px;
}
.game-logo span { color: #ff4d2e; }

.game-tabs {
  display: flex;
  gap: 16px;
  font-size: 13px;
  font-weight: 600;
  color: #8e8a98;
}
.game-tabs .active { color: #fff; border-bottom: 2px solid #ff4d2e; padding-bottom: 4px; }

/* Anonymized Whale Game Header Badge */
.game-whale-stats {
  display: flex;
  align-items: center;
  gap: 12px;
}

.game-stat-capsule {
  display: flex;
  align-items: center;
  gap: 6px;
  background: #171620;
  border: 1px solid #2e2b36;
  border-radius: 8px;
  padding: 5px 10px;
  font-family: "JetBrains Mono", monospace;
  font-size: 12px;
}

.whale-avatar {
  width: 32px;
  height: 32px;
  border-radius: 50%;
  background: linear-gradient(135deg, #f5c518, #ff4d2e);
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 16px;
  box-shadow: 0 0 12px rgba(245, 197, 24, 0.4);
}

/* Feature Spotlight Callout on the Game Pane */
.spotlight-card {
  background: rgba(21, 20, 26, 0.94);
  border: 1px solid #ff4d2e;
  border-radius: 14px;
  padding: 16px 20px;
  box-shadow: 0 16px 40px rgba(0,0,0,0.8), 0 0 30px rgba(255, 77, 46, 0.2);
  margin-top: 14px;
  margin-bottom: 16px;
}

.spotlight-badge {
  font-family: "JetBrains Mono", monospace;
  font-size: 10.5px;
  font-weight: 800;
  color: #ff4d2e;
  margin-bottom: 4px;
}

.spotlight-title {
  font-family: "Unbounded", sans-serif;
  font-size: 17px;
  font-weight: 900;
  color: #fff;
  margin-bottom: 6px;
  letter-spacing: -0.3px;
}

.spotlight-desc {
  font-size: 12.5px;
  line-height: 1.45;
  color: #b7b2bd;
}

/* Kyara Cards Banner Display */
.game-hero-banner {
  background: linear-gradient(135deg, #1c182a, #110f18);
  border: 1px solid #2e2b36;
  border-radius: 14px;
  padding: 16px 20px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  box-shadow: 0 12px 30px rgba(0,0,0,0.6);
  position: relative;
  overflow: hidden;
}

.hero-banner-title {
  font-family: "Unbounded", sans-serif;
  font-size: 22px;
  font-weight: 900;
  color: #fff;
  letter-spacing: -0.5px;
}

.hero-cards-preview {
  display: flex;
  gap: 10px;
}

.mini-card {
  width: 72px;
  height: 100px;
  border-radius: 8px;
  background: #181622;
  border: 1px solid #2e2b36;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  text-align: center;
  padding: 6px;
  box-shadow: 0 8px 16px rgba(0,0,0,0.6);
}

.mini-card--mythic {
  border-color: #ff4d2e;
  box-shadow: 0 0 16px rgba(255, 77, 46, 0.35);
}

.mini-card--legendary {
  border-color: #f5c518;
  box-shadow: 0 0 14px rgba(245, 197, 24, 0.3);
}

/* In-Game Floating HUD (Anonymized & Active) */
#km-floating-hud.km-hud {
  position: relative;
  left: 0;
  bottom: 0;
  box-shadow: 0 12px 30px rgba(0,0,0,0.8), 0 0 20px rgba(63, 191, 127, 0.25);
  border-color: rgba(63, 191, 127, 0.5);
}

/* Right: Real Sidepanel with Huge Numbers */
.sidepanel-pane {
  width: 480px;
  height: 100%;
  background: var(--bg);
  color: var(--fg);
  display: flex;
  flex-direction: column;
  overflow-y: auto;
  position: relative;
}
</style>
<script>
${mockWhaleDataScript}

window.addEventListener('DOMContentLoaded', () => {
  setTimeout(() => {
    const tabBtn = document.getElementById('tab-${activeTab}');
    if (tabBtn) tabBtn.click();
  }, 120);
});
</script>
</head>
<body>
  <div class="browser-chrome">
    <div class="browser-dots-row">
      <div class="window-dots">
        <div class="dot dot-red"></div>
        <div class="dot dot-yellow"></div>
        <div class="dot dot-green"></div>
        <span style="margin-left: 10px; font-size: 11px; font-weight: 600; color: #8e8a98;">Kyara.games — Pilote Automatique (v1.1)</span>
      </div>
      <div class="browser-promo-tag">
        <span>⚡</span>
        <span>${badge}</span>
      </div>
    </div>
    <div class="browser-bar">
      <div class="nav-arrows">‹ › ↻</div>
      <div class="url-field">
        <span style="color:#3fbf7f;">🔒</span>
        <span>https://kyara.games/collection</span>
      </div>
      <div class="ext-badge">
        <div class="ext-badge__seal">操</div>
        <span>Kyara Manager (Actif)</span>
      </div>
    </div>
  </div>

  <div class="workspace">
    <!-- Left: Anonymized Game Pane with Whale Stats -->
    <div class="game-pane">
      <div>
        <div class="game-navbar">
          <div class="game-logo">KYARA<span>.GAMES</span></div>
          <div class="game-tabs">
            <span class="${activeTab === 'autopilot' || activeTab === 'duplicates' ? 'active' : ''}">Collection</span>
            <span class="${activeTab === 'market' ? 'active' : ''}">Marché</span>
            <span class="${activeTab === 'boosters' ? 'active' : ''}">Ouvrir</span>
            <span>Missions</span>
          </div>
          <div class="game-whale-stats">
            <div class="game-stat-capsule">
              <span style="color:#ff4d2e; font-weight:800;">札 10/10</span>
            </div>
            <div class="game-stat-capsule">
              <span style="color:#f5c518; font-weight:800;">◆ 285 450</span>
            </div>
            <div class="whale-avatar">👑</div>
          </div>
        </div>

        <div class="spotlight-card">
          <div class="spotlight-badge">★ KYARA MANAGER · COMPTE PRO &amp; COLLECTEUR</div>
          <div class="spotlight-title">${title}</div>
          <div class="spotlight-desc">${subtitle}</div>
        </div>

        <div class="game-hero-banner">
          <div>
            <div style="font-size:10px; font-family:'JetBrains Mono'; color:#f5c518; font-weight:700; margin-bottom:2px;">ÉDITION LIMITÉE · 2026</div>
            <div class="hero-banner-title">Automne 2026</div>
            <div style="font-size:11.5px; color:#9d98a5; margin-top:2px;">Animes de la saison · 5 842 / 6 736 cartes débloquées</div>
          </div>
          <div class="hero-cards-preview">
            <div class="mini-card mini-card--mythic">
              <span style="font-size:8px; font-weight:800; color:#ff4d2e;">MYTHIQUE</span>
              <div style="font-size:24px; margin:4px 0;">⚔️</div>
              <div style="font-size:9.5px; font-weight:800; color:#fff;">Madara</div>
            </div>
            <div class="mini-card mini-card--legendary">
              <span style="font-size:8px; font-weight:800; color:#f5c518;">LÉGENDAIRE</span>
              <div style="font-size:24px; margin:4px 0;">🌀</div>
              <div style="font-size:9.5px; font-weight:800; color:#fff;">Minato</div>
            </div>
            <div class="mini-card mini-card--mythic">
              <span style="font-size:8px; font-weight:800; color:#ff4d2e;">MYTHIQUE</span>
              <div style="font-size:24px; margin:4px 0;">⚡</div>
              <div style="font-size:9.5px; font-weight:800; color:#fff;">Goku UI</div>
            </div>
          </div>
        </div>
      </div>

      <!-- Real Floating HUD with Anonymized Whale Status -->
      <aside id="km-floating-hud" class="km-hud">
        <button type="button" class="km-hud__seal">操</button>
        <div class="km-hud__info">
          <strong class="km-hud__title">KYARA MANAGER</strong>
          <span class="km-hud__meta">KyaraMaster · 285 450 ◆ · 10/10 札 · 10/10 市</span>
        </div>
        <button type="button" class="km-hud__btn km-hud__btn--toggle" style="background:rgba(63,191,127,0.25); color:#3fbf7f; border-color:#3fbf7f; font-weight:800;">AUTO ON</button>
        <button type="button" class="km-hud__btn km-hud__btn--primary">Panneau</button>
        <button type="button" class="km-hud__btn km-hud__btn--icon">−</button>
      </aside>
    </div>

    <!-- Right: Real Kyara Manager Sidepanel with Big Whale Numbers -->
    <div class="sidepanel-pane">
      ${realSidepanelBody}
    </div>
  </div>

  <script>${analyticsJs}</script>
  <script>${i18nJs}</script>
  <script>${sidepanelJs}</script>
</body>
</html>`;
}

// -------------------------------------------------------------------------
// 1. MARQUEE BANNER (1400 x 560) using AI Artwork + High Numbers
// -------------------------------------------------------------------------
const HTML_MARQUEE = `<!DOCTYPE html>
<html lang="fr">
<head>
<meta charset="utf-8">
<style>
  @import url('https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@700;800&family=Unbounded:wght@800;900&family=Zen+Kaku+Gothic+New:wght@500;700&display=swap');
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body {
    width: 1400px;
    height: 560px;
    background: #09080c;
    overflow: hidden;
    font-family: 'Zen Kaku Gothic New', system-ui, sans-serif;
    color: #edeae4;
    display: flex;
    position: relative;
  }

  /* AI Artwork Backdrop */
  .backdrop-ai {
    position: absolute;
    right: 0;
    top: 0;
    width: 860px;
    height: 560px;
    background-image: url('file://${aiBannerPath}');
    background-size: cover;
    background-position: center right;
    mask-image: linear-gradient(to left, black 65%, transparent 100%);
    -webkit-mask-image: linear-gradient(to left, black 65%, transparent 100%);
    opacity: 0.95;
    z-index: 1;
  }

  .ambient-glow {
    position: absolute;
    width: 600px;
    height: 600px;
    border-radius: 50%;
    filter: blur(100px);
    pointer-events: none;
    z-index: 1;
  }

  .left-col {
    width: 680px;
    height: 100%;
    padding: 50px 0 45px 65px;
    display: flex;
    flex-direction: column;
    justify-content: space-between;
    position: relative;
    z-index: 3;
    background: linear-gradient(to right, rgba(9, 8, 12, 0.95) 75%, transparent 100%);
  }

  .tag-pill {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    background: rgba(255, 77, 46, 0.15);
    border: 1px solid rgba(255, 77, 46, 0.4);
    border-radius: 999px;
    padding: 6px 14px;
    font-family: 'JetBrains Mono', monospace;
    font-size: 11px;
    font-weight: 700;
    color: #ff4d2e;
    box-shadow: 0 0 16px rgba(255, 77, 46, 0.2);
  }

  .brand-row {
    display: flex;
    align-items: center;
    gap: 16px;
    margin-top: 14px;
    margin-bottom: 12px;
  }

  .brand-seal {
    width: 62px;
    height: 62px;
    border-radius: 16px;
    background: linear-gradient(135deg, #262134, #14131b);
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

  .brand-name {
    font-family: 'Unbounded', sans-serif;
    font-size: 46px;
    font-weight: 900;
    color: #fff;
    letter-spacing: -0.5px;
    text-shadow: 0 4px 20px rgba(0,0,0,0.8);
  }

  .hero-tag {
    font-size: 19px;
    font-weight: 700;
    color: #f5c518;
    margin-bottom: 12px;
  }

  .hero-desc {
    font-size: 13.5px;
    line-height: 1.55;
    color: #b7b2bd;
    max-width: 550px;
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
    background: rgba(21, 20, 26, 0.9);
    border: 1px solid #2e2b36;
    border-radius: 10px;
    padding: 8px 12px;
    font-size: 12.5px;
    font-weight: 600;
    backdrop-filter: blur(10px);
  }

  .guarantee {
    margin-top: 16px;
    font-size: 11.5px;
    color: #3fbf7f;
    font-family: 'JetBrains Mono', monospace;
  }

  /* Right floating whale HUD banner */
  .right-hud-float {
    position: absolute;
    bottom: 35px;
    right: 40px;
    background: rgba(14, 13, 18, 0.94);
    border: 1px solid #f5c518;
    border-radius: 14px;
    padding: 12px 20px;
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
        <div class="pill-card"><span style="color:#f5c518; font-weight:800;">売</span> Auto-Vente (+94 500 ◆ net)</div>
        <div class="pill-card"><span style="color:#3fbf7f; font-weight:800;">転</span> Auto-Recyclage Rentable</div>
        <div class="pill-card"><span style="color:#4dd6ff; font-weight:800;">市</span> Scanner Flips (+42 850 ◆)</div>
        <div class="pill-card"><span style="color:#ff4d2e; font-weight:800;">札</span> Tirage Live Boosters (EV 842 ◆)</div>
      </div>

      <div class="guarantee">
        ✓ 100% Local (MV3) · Sanctuaire de Chakra Garanti · Zéro Télémétrie
      </div>
    </div>
  </div>

  <div class="right-hud-float">
    <div style="width:36px; height:36px; border-radius:8px; background:#ff4d2e; color:#fff; display:flex; align-items:center; justify-content:center; font-family:'Unbounded'; font-size:18px; font-weight:900;">操</div>
    <div>
      <div style="font-size:11px; color:#f5c518; font-weight:800;">PILOTE ACTIF · COMPTE PRO</div>
      <div style="font-size:14px; color:#fff; font-weight:800;">285 450 ◆ · +184 250 ◆ GÉNÉRÉS</div>
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
// Build the 5 Whale Screenshots
// -------------------------------------------------------------------------
const HTML_SCREENSHOT_1 = buildWhaleScreenshotHtml({
  activeTab: 'autopilot',
  badge: '01 / PILOTE AUTOMATIQUE GLOBAL & ROI',
  title: 'Pilote Automatique Global & Tableau de Bord des Gains (ROI)',
  subtitle: 'Auto-vente des doublons, auto-recyclage intelligent, scanner d\'arbitrage et widget HUD actif en bas à gauche sur Kyara.games.'
});

const HTML_SCREENSHOT_2 = buildWhaleScreenshotHtml({
  activeTab: 'duplicates',
  badge: '02 / GESTION DES DOUBLONS & VENTE OPTIMISÉE',
  title: 'Arbitrage Intelligent des Doublons : Vendre ou Recycler ?',
  subtitle: 'Comparaison en direct avec les médianes 7 jours réelles, garde-fou anti-bradage à 70% et protection des cartes de collection.'
});

const HTML_SCREENSHOT_3 = buildWhaleScreenshotHtml({
  activeTab: 'market',
  badge: '03 / SCANNER D\'OPPORTUNITÉS & FLIPS MARCHÉ',
  title: 'Radar de Bons Plans & Achat-Revente (Flips Automatiques)',
  subtitle: 'Détection instantanée des cartes sous-cotées avec calcul automatique du bénéfice net (taxe 5% & dépôt 2% déduits).'
});

const HTML_SCREENSHOT_4 = buildWhaleScreenshotHtml({
  activeTab: 'boosters',
  badge: '04 / ESPÉRANCE CHAKRA (EV) & PILOTAGE LIVE',
  title: 'Rentabilité des Boosters (EV) & Tirage Live Piloté',
  subtitle: 'Classement probabiliste des packs selon l\'EV en Chakra, alerte de Pitié Mythique (244/250) et animation de tirage en direct.'
});

const HTML_SCREENSHOT_5 = buildWhaleScreenshotHtml({
  activeTab: 'settings',
  badge: '05 / GARDE-FOUS PERSONNALISÉS & SÉCURITÉ',
  title: 'Sanctuaire de Chakra Protégé & Confidentialité Totale',
  subtitle: 'Réserve minimale de 15 000 ◆ protégée, filtres stricts par rareté et exécution 100% locale dans votre navigateur (Manifest V3).'
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

console.log('Writing anonymized templates with big numbers...');
for (const t of targets) {
  const tplPath = path.join(templatesDir, `${t.id}.html`);
  fs.writeFileSync(tplPath, t.html, 'utf8');
}

console.log('Rendering 7 promotional assets at exact Chrome Web Store dimensions...');
for (const t of targets) {
  const tplPath = path.join(templatesDir, `${t.id}.html`);
  const pngPath = path.join(promoDir, `${t.id}.png`);
  const jpgPath = path.join(promoDir, `${t.id}.jpg`);

  console.log(`Rendering ${t.id} (${t.width}x${t.height})...`);
  execFileSync(CHROME_PATH, [
    '--headless=new',
    '--disable-gpu',
    '--virtual-time-budget=2500',
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

console.log('All anonymized big-number promotional assets generated successfully!');
