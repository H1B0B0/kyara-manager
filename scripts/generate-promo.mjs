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

// Realistic Kyara Manager mock state
const mockDataScript = `
  const mockSettings = {
    masterEnabled: true,
    autoSellDuplicates: true,
    autoRecycleDuplicates: true,
    autoBuyFlips: true,
    autoBuyMissing: true,
    autoOpenFreeBoosters: true,
    autoClaimMissions: true,
    antiAfk: true,
    chakraReserve: 5000,
    minUndercutPct: 70,
    autoSellMaxListings: 10,
    language: 'fr'
  };

  const mockDashboard = {
    authenticated: true,
    me: {
      id: 1,
      pseudo: "Etienne",
      chakra: 48290,
      freePacks: 10,
      freePacksMax: 10,
      bonusPacks: 0,
      pity: 242,
      pityMax: 250
    },
    collectionStats: {
      uniqueOwned: 142,
      catalogSize: 210,
      completionPct: 67.6,
      sellableDuplicatesCount: 12,
      sellableNetTotal: 28400,
      recyclableDuplicatesCount: 22,
      recyclableChakraTotal: 440
    },
    activeListings: [
      { card: { id: 101, name: "Sasuke Uchiha", rarity: "L" }, price: 4200, expiresAt: Date.now() + 86400000 },
      { card: { id: 102, name: "Pain Tendô", rarity: "L" }, price: 5400, expiresAt: Date.now() + 86400000 },
      { card: { id: 103, name: "Kakashi Hatake", rarity: "E" }, price: 1200, expiresAt: Date.now() + 86400000 },
      { card: { id: 104, name: "Gaara du Désert", rarity: "E" }, price: 1100, expiresAt: Date.now() + 86400000 },
      { card: { id: 105, name: "Itachi Uchiha", rarity: "M" }, price: 14500, expiresAt: Date.now() + 86400000 }
    ],
    duplicates: [
      {
        card: { id: 201, name: "Itachi Uchiha (Edo Tensei)", rarity: "M", resaleUntil: 0 },
        spareCopies: 2,
        evaluation: {
          median7d: 14500,
          suggestedPrice: 14200,
          netSalesProceeds: 13206,
          recycleValue: 500,
          action: "VENDRE",
          status: "OK",
          priceSurge: false
        }
      },
      {
        card: { id: 202, name: "Pain Tendô (Akatsuki)", rarity: "L", resaleUntil: 0 },
        spareCopies: 1,
        evaluation: {
          median7d: 5400,
          suggestedPrice: 5250,
          netSalesProceeds: 4882,
          recycleValue: 200,
          action: "VENDRE",
          status: "OK",
          priceSurge: false
        }
      },
      {
        card: { id: 203, name: "Kakashi Hatake (Raikiri)", rarity: "E", resaleUntil: 0 },
        spareCopies: 3,
        evaluation: {
          median7d: 1200,
          suggestedPrice: 1180,
          netSalesProceeds: 1097,
          recycleValue: 80,
          action: "VENDRE",
          status: "OK",
          priceSurge: false
        }
      },
      {
        card: { id: 204, name: "Ninja de Kiri", rarity: "C", resaleUntil: 0 },
        spareCopies: 14,
        evaluation: {
          median7d: 15,
          suggestedPrice: 15,
          netSalesProceeds: 13,
          recycleValue: 20,
          action: "RECYCLER",
          status: "OK",
          priceSurge: false
        }
      },
      {
        card: { id: 205, name: "Clone Aqueux", rarity: "C", resaleUntil: 0 },
        spareCopies: 8,
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
        listing: { price: 11500, id: 9001 },
        median7d: 16800,
        suggestedResalePrice: 16500,
        netResaleProceeds: 15345,
        netMargin: 3845,
        marginPct: 33.4,
        isMissing: false
      },
      {
        card: { id: 302, name: "Jiraiya (Mode Ermite)", rarity: "L" },
        listing: { price: 3200, id: 9002 },
        median7d: 4900,
        suggestedResalePrice: 4800,
        netResaleProceeds: 4464,
        netMargin: 1264,
        marginPct: 39.5,
        isMissing: false
      },
      {
        card: { id: 303, name: "Gaara du Désert", rarity: "E" },
        listing: { price: 750, id: 9003 },
        median7d: 1250,
        suggestedResalePrice: 1200,
        netResaleProceeds: 1116,
        netMargin: 366,
        marginPct: 48.8,
        isMissing: true
      }
    ],
    boosters: {
      isPityNear: true,
      recommendedNew: {
        id: "hokage",
        name: "Édition Hokage",
        probAtLeastOneNewPct: 34.2,
        expectedNewCards: 0.84,
        openableFreeCount: 5,
        expectedChakra: 842
      },
      recommendedPity: {
        id: "hokage",
        name: "Édition Hokage"
      },
      ranking: [
        { id: "hokage", name: "Édition Hokage", completionPct: 45, probAtLeastOneNewPct: 34.2, expectedNewCards: 0.84, expectedChakra: 842, canOpenNow: true },
        { id: "shippuden", name: "Édition Shippuden", completionPct: 62, probAtLeastOneNewPct: 22.1, expectedNewCards: 0.52, expectedChakra: 620, canOpenNow: true },
        { id: "akatsuki", name: "Édition Akatsuki", completionPct: 70, probAtLeastOneNewPct: 18.5, expectedNewCards: 0.41, expectedChakra: 580, canOpenNow: true },
        { id: "genin", name: "Édition Genin", completionPct: 88, probAtLeastOneNewPct: 6.0, expectedNewCards: 0.12, expectedChakra: 310, canOpenNow: true }
      ]
    }
  };

  const mockJournal = [
    { level: "success", text: "Vente réussie : Sasuke Uchiha (L) vendu à 4 200 ◆ (+3 990 ◆ net)", timestamp: Date.now() - 45000 },
    { level: "info", text: "18 doublons recyclés en Chakra (+360 ◆)", timestamp: Date.now() - 120000 },
    { level: "warn", text: "Booster Hokage ouvert en direct : Tirage Mythique Madara !", timestamp: Date.now() - 240000 },
    { level: "info", text: "Flip marché acheté : Pain Tendô à 3 200 ◆ (Cote : 4 900 ◆)", timestamp: Date.now() - 360000 }
  ];

  const mockCumulativeStats = {
    chakraFromSales: 16200,
    chakraFromRecycle: 8480,
    cardsSold: 38,
    cardsRecycled: 142,
    boostersOpenedCount: 12,
    mythicsPulledCount: 2,
    legendariesPulledCount: 3,
    startedAt: Date.now() - 86400000
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

// Helper to assemble real browser frame with Kyara.games + real Sidepanel
function buildScreenshotHtml({ activeTab, pageUrl, pageTitle, badgeText, headerTitle, headerSubtitle, gameContentHtml }) {
  return `<!DOCTYPE html>
<html lang="fr">
<head>
<meta charset="utf-8">
<title>${headerTitle}</title>
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
  border: 1px solid rgba(255, 77, 46, 0.3);
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

/* Left: Kyara.games Page */
.game-pane {
  flex: 1;
  background: radial-gradient(circle at 45% 25%, #16141f 0%, #0c0b10 75%);
  position: relative;
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  border-right: 2px solid #282534;
  overflow: hidden;
  padding: 24px 30px;
}

.game-navbar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  border-bottom: 1px solid #23212b;
  padding-bottom: 14px;
}

.game-logo {
  font-family: "Unbounded", sans-serif;
  font-weight: 900;
  font-size: 19px;
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

.game-user-badge {
  display: flex;
  align-items: center;
  gap: 8px;
  background: #171620;
  border: 1px solid #2e2b36;
  border-radius: 8px;
  padding: 6px 12px;
  font-family: "JetBrains Mono", monospace;
  font-size: 12.5px;
}

/* Feature Spotlight Callout on the Game Pane */
.spotlight-card {
  background: rgba(21, 20, 26, 0.94);
  border: 1px solid #ff4d2e;
  border-radius: 14px;
  padding: 20px;
  box-shadow: 0 16px 40px rgba(0,0,0,0.8), 0 0 30px rgba(255, 77, 46, 0.2);
  max-width: 500px;
  margin: 16px 0;
}

.spotlight-title {
  font-family: "Unbounded", sans-serif;
  font-size: 18px;
  font-weight: 900;
  color: #fff;
  margin-bottom: 8px;
}

.spotlight-desc {
  font-size: 13px;
  line-height: 1.5;
  color: #b7b2bd;
}

/* Right: The Real Kyara Manager Sidepanel */
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
${mockDataScript}

window.addEventListener('DOMContentLoaded', () => {
  // Activate target tab after sidepanel.js initializes
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
        <span style="margin-left: 10px; font-size: 11px; font-weight: 600; color: #8e8a98;">${pageTitle} — Google Chrome</span>
      </div>
      <div class="browser-promo-tag">
        <span>⚡</span>
        <span>${badgeText}</span>
      </div>
    </div>
    <div class="browser-bar">
      <div class="nav-arrows">‹ › ↻</div>
      <div class="url-field">
        <span style="color:#3fbf7f;">🔒</span>
        <span>${pageUrl}</span>
      </div>
      <div class="ext-badge">
        <div class="ext-badge__seal">操</div>
        <span>Kyara Manager v1.1</span>
      </div>
    </div>
  </div>

  <div class="workspace">
    <!-- Game Pane with context and in-game floating HUD -->
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
          <div class="game-user-badge">
            <span style="color:#f5c518; font-weight:800;">◆ 48 290</span>
            <span style="color:#6b6675;">|</span>
            <span style="color:#edeae4;">Etienne</span>
          </div>
        </div>

        <div style="margin-top: 24px;">
          <div class="spotlight-card">
            <div style="font-family:'JetBrains Mono'; font-size:10.5px; font-weight:800; color:#ff4d2e; margin-bottom:4px;">★ KYARA MANAGER · EXTENSION CHROME</div>
            <div class="spotlight-title">${headerTitle}</div>
            <div class="spotlight-desc">${headerSubtitle}</div>
          </div>

          ${gameContentHtml}
        </div>
      </div>

      <!-- Real In-Game Floating HUD -->
      <aside id="km-floating-hud" class="km-hud" style="position: relative; left: 0; bottom: 0;">
        <button type="button" class="km-hud__seal" id="km-hud-dot">操</button>
        <div class="km-hud__info">
          <strong class="km-hud__title">KYARA MANAGER</strong>
          <span class="km-hud__meta" id="km-hud-meta">Pilote en continu : Vente &amp; Recyclage OK</span>
        </div>
        <button type="button" class="km-hud__btn km-hud__btn--toggle" style="background:rgba(63,191,127,0.2); color:#3fbf7f; border-color:#3fbf7f;">AUTO ON</button>
        <button type="button" class="km-hud__btn km-hud__btn--primary">Panneau</button>
        <button type="button" class="km-hud__btn km-hud__btn--icon">−</button>
      </aside>
    </div>

    <!-- Right: Real Kyara Manager Sidepanel -->
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
// Screenshot 1: AUTOPILOT
// -------------------------------------------------------------------------
const HTML_SCREENSHOT_1 = buildScreenshotHtml({
  activeTab: 'autopilot',
  pageUrl: 'https://kyara.games/collection',
  pageTitle: 'Kyara.games Collection & Pilote Automatique',
  badgeText: 'MODULE 01 · PILOTE AUTOMATIQUE',
  headerTitle: 'Pilote Automatique Global & Tableau de Bord des Gains',
  headerSubtitle: 'Orchestration 100% autonome de votre compte Kyara.games : auto-vente des doublons, auto-recyclage, flips marché et ouverture live.',
  gameContentHtml: `
    <div style="display:grid; grid-template-columns:repeat(3, 1fr); gap:14px; margin-top:20px;">
      <div style="background:#15141a; border:2px solid #ff4d2e; border-radius:12px; padding:14px; text-align:center; box-shadow:0 0 24px rgba(255,77,46,0.25);">
        <span style="background:#ff4d2e; color:#fff; font-size:9px; font-weight:800; padding:2px 6px; border-radius:4px; font-family:'JetBrains Mono';">MYTHIQUE ★★★</span>
        <div style="font-size:38px; margin:8px 0;">⚔️</div>
        <div style="font-weight:800; color:#fff; font-size:12.5px;">Madara Uchiha</div>
        <div style="font-size:11px; color:#f5c518; font-family:'JetBrains Mono';">18 500 ◆</div>
      </div>
      <div style="background:#15141a; border:2px solid #f5c518; border-radius:12px; padding:14px; text-align:center; box-shadow:0 0 20px rgba(245,197,24,0.2);">
        <span style="background:#f5c518; color:#000; font-size:9px; font-weight:800; padding:2px 6px; border-radius:4px; font-family:'JetBrains Mono';">LÉGENDAIRE</span>
        <div style="font-size:38px; margin:8px 0;">🌀</div>
        <div style="font-weight:800; color:#fff; font-size:12.5px;">Minato Namikaze</div>
        <div style="font-size:11px; color:#f5c518; font-family:'JetBrains Mono';">6 800 ◆</div>
      </div>
      <div style="background:#15141a; border:1px solid #b072ff; border-radius:12px; padding:14px; text-align:center;">
        <span style="background:#b072ff; color:#fff; font-size:9px; font-weight:800; padding:2px 6px; border-radius:4px; font-family:'JetBrains Mono';">ÉPIQUE</span>
        <div style="font-size:38px; margin:8px 0;">🥷</div>
        <div style="font-weight:800; color:#fff; font-size:12.5px;">Sasuke Uchiha</div>
        <div style="font-size:11px; color:#f5c518; font-family:'JetBrains Mono';">4 200 ◆</div>
      </div>
    </div>
  `
});

// -------------------------------------------------------------------------
// Screenshot 2: DOUBLONS
// -------------------------------------------------------------------------
const HTML_SCREENSHOT_2 = buildScreenshotHtml({
  activeTab: 'duplicates',
  pageUrl: 'https://kyara.games/collection',
  pageTitle: 'Kyara.games Gestion des Doublons',
  badgeText: 'MODULE 02 · GESTION DES DOUBLONS',
  headerTitle: 'Arbitrage Intelligent : Vendre ou Recycler ?',
  headerSubtitle: 'Matrice décisionnelle automatique comparant le cours médian 7j/30j à la valeur de recyclage, avec garde-fou anti-bradage à 70%.',
  gameContentHtml: `
    <div style="background:#15141a; border:1px solid #2e2b36; border-radius:12px; padding:18px; margin-top:20px;">
      <div style="font-family:'Unbounded'; font-size:14px; font-weight:800; color:#fff; margin-bottom:8px;">Règles de Protection Sanctuarisées :</div>
      <ul style="font-size:12.5px; color:#b7b2bd; line-height:1.7; padding-left:18px;">
        <li><b style="color:#3fbf7f;">Conserve toujours ≥1 exemplaire</b> de chaque personnage pour votre collection.</li>
        <li><b style="color:#f5c518;">Garde-fou 70%</b> : aucune carte n'est bradée sous sa cote réelle.</li>
        <li><b style="color:#4dd6ff;">Protection Locked & Pinned</b> : vos cartes favorites sont 100% sécurisées.</li>
      </ul>
    </div>
  `
});

// -------------------------------------------------------------------------
// Screenshot 3: MARCHE & FLIPS
// -------------------------------------------------------------------------
const HTML_SCREENSHOT_3 = buildScreenshotHtml({
  activeTab: 'market',
  pageUrl: 'https://kyara.games/marche',
  pageTitle: 'Kyara.games Marché & Flips',
  badgeText: 'MODULE 03 · SCANNER MARCHÉ & FLIPS',
  headerTitle: 'Scanner d\'Arbitrage & Achat-Revente Automatique',
  headerSubtitle: 'Détecte les annonces sous-cotées en temps réel et calcule automatiquement le bénéfice net après taxe de 5% et frais de dépôt de 2%.',
  gameContentHtml: `
    <div style="background:#15141a; border:1px solid #2e2b36; border-radius:12px; padding:18px; margin-top:20px;">
      <div style="font-family:'Unbounded'; font-size:14px; font-weight:800; color:#fff; margin-bottom:8px;">Calcul Net de Rentabilité :</div>
      <div style="font-family:'JetBrains Mono'; font-size:12px; color:#edeae4; background:#0e0d14; padding:12px; border-radius:8px; line-height:1.6;">
        <div><b>Gain Net</b> = Prix de Revente − Taxe (5%) − Dépôt (2%) − Prix Achat</div>
        <div style="color:#3fbf7f; margin-top:4px;">Exemple Naruto Kurama : +3 845 ◆ de profit net (+33.4% de marge)</div>
      </div>
    </div>
  `
});

// -------------------------------------------------------------------------
// Screenshot 4: BOOSTERS
// -------------------------------------------------------------------------
const HTML_SCREENSHOT_4 = buildScreenshotHtml({
  activeTab: 'boosters',
  pageUrl: 'https://kyara.games/ouvrir/hokage',
  pageTitle: 'Kyara.games Ouverture Live des Boosters',
  badgeText: 'MODULE 04 · EV & TIRAGES LIVE',
  headerTitle: 'Rentabilité des Boosters (EV) & Tirage Live Piloté',
  headerSubtitle: 'Classement mathématique selon l\'espérance de gain en Chakra (EV) et pilotage interactif de l\'animation d\'ouverture sur Kyara.games.',
  gameContentHtml: `
    <div style="background:#15141a; border:2px solid #ff4d2e; border-radius:12px; padding:18px; margin-top:20px; box-shadow:0 0 25px rgba(255,77,46,0.2);">
      <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:10px;">
        <span style="font-family:'Unbounded'; font-size:14px; font-weight:800; color:#fff;">Tirage Live Piloté : /ouvrir/hokage</span>
        <span style="background:#ff4d2e; color:#fff; font-size:10px; font-weight:800; padding:3px 8px; border-radius:4px;">LIVE EN COURS</span>
      </div>
      <div style="font-size:12.5px; color:#b7b2bd; line-height:1.5;">
        L'extension navigue vers le booster optimal sans recharger la page, choisit le multiplicateur et retourne les cartes avec les effets visuels de Kyara.
      </div>
    </div>
  `
});

// -------------------------------------------------------------------------
// Screenshot 5: SECURITE & REGLAGES
// -------------------------------------------------------------------------
const HTML_SCREENSHOT_5 = buildScreenshotHtml({
  activeTab: 'settings',
  pageUrl: 'https://kyara.games/collection',
  pageTitle: 'Kyara.games Réglages & Sécurité',
  badgeText: 'MODULE 05 · GARDE-FOUS & CONFIDENTIALITÉ',
  headerTitle: 'Sanctuaire de Chakra, Garde-fous & Zéro Donnée Externe',
  headerSubtitle: 'Protégez votre solde avec des limites strictes. Exécution 100% locale dans votre navigateur (Manifest V3 sans serveur tiers).',
  gameContentHtml: `
    <div style="display:grid; grid-template-columns:repeat(2, 1fr); gap:12px; margin-top:20px;">
      <div style="background:#15141a; border:1px solid #3fbf7f; border-radius:10px; padding:14px;">
        <div style="color:#3fbf7f; font-size:18px; margin-bottom:4px;">🔒</div>
        <div style="font-weight:800; color:#fff; font-size:12px; margin-bottom:4px;">100% Local & Sécurisé</div>
        <div style="font-size:11px; color:#9d98a5;">Aucune donnée n'est transmise à l'extérieur. Stocké dans chrome.storage.local.</div>
      </div>
      <div style="background:#15141a; border:1px solid #f5c518; border-radius:10px; padding:14px;">
        <div style="color:#f5c518; font-size:18px; margin-bottom:4px;">⏱️</div>
        <div style="font-weight:800; color:#fff; font-size:12px; margin-bottom:4px;">File Anti-Rate-Limit</div>
        <div style="font-size:11px; color:#9d98a5;">Temporisation adaptative respectant les quotas officiels de Kyara.games.</div>
      </div>
    </div>
  `
});

// -------------------------------------------------------------------------
// MARQUEE HERO (1400 x 560) using Real Sidepanel Header & KPIs
// -------------------------------------------------------------------------
const HTML_MARQUEE = `<!DOCTYPE html>
<html lang="fr">
<head>
<meta charset="utf-8">
<style>
${sidepanelCss}
${contentCss}

body {
  width: 1400px;
  height: 560px;
  margin: 0;
  padding: 0;
  display: flex;
  position: relative;
  background: radial-gradient(circle at 85% 30%, #1a1628 0%, #0c0b11 50%, #070609 100%);
  overflow: hidden;
  color: var(--fg);
  font-family: var(--body);
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

.brand-badge {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  background: rgba(255, 77, 46, 0.12);
  border: 1px solid rgba(255, 77, 46, 0.35);
  border-radius: 999px;
  padding: 6px 14px;
  font-family: var(--mono);
  font-size: 11px;
  font-weight: 700;
  color: var(--acc);
}

.brand-title-wrap {
  display: flex;
  align-items: center;
  gap: 16px;
  margin-top: 14px;
  margin-bottom: 12px;
}

.brand-seal-icon {
  width: 58px;
  height: 58px;
  border-radius: 14px;
  background: linear-gradient(135deg, #242030, #14131a);
  border: 2px solid var(--acc);
  box-shadow: 0 0 24px rgba(255,77,46,0.35);
  display: flex;
  align-items: center;
  justify-content: center;
  font-family: var(--disp);
  font-size: 28px;
  font-weight: 900;
  color: var(--acc);
}

.brand-name {
  font-family: var(--disp);
  font-size: 44px;
  font-weight: 900;
  color: #fff;
  letter-spacing: -0.5px;
  line-height: 1.05;
}

.hero-subtitle {
  font-size: 18px;
  font-weight: 700;
  color: var(--gold);
  margin-bottom: 12px;
}

.hero-desc {
  font-size: 13.5px;
  line-height: 1.55;
  color: var(--mut);
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
  border: 1px solid var(--line2);
  border-radius: 10px;
  padding: 8px 12px;
  font-size: 12.5px;
  font-weight: 600;
}

.right-col {
  width: 740px;
  height: 100%;
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 2;
}

/* Tilted Real Sidepanel Mockup */
.sidepanel-showcase {
  width: 440px;
  background: var(--bg);
  border: 1px solid var(--line2);
  border-radius: 18px;
  box-shadow: 0 24px 60px rgba(0,0,0,0.8), 0 0 40px rgba(255,77,46,0.15);
  overflow: hidden;
  transform: rotate(-1.5deg) translateY(-10px);
}
</style>
<script>
${mockDataScript}
</script>
</head>
<body>
  <div class="left-col">
    <div>
      <div class="brand-badge">
        <span style="width:6px; height:6px; border-radius:50%; background:#ff4d2e; box-shadow:0 0 6px #ff4d2e;"></span>
        <span>EXTENSION GOOGLE CHROME · MANIFEST V3</span>
      </div>

      <div class="brand-title-wrap">
        <div class="brand-seal-icon">操</div>
        <h1 class="brand-name">KYARA MANAGER</h1>
      </div>

      <div class="hero-subtitle">⚡ Pilote Automatique &amp; Arbitrage pour Kyara.games</div>

      <p class="hero-desc">
        Optimisez votre compte : auto-vente des doublons sans bradage, auto-recyclage intelligent, scanner de flips rentables et ouverture live des boosters conseillés.
      </p>
    </div>

    <div>
      <div class="pills-grid">
        <div class="pill-card"><span style="color:var(--gold); font-weight:800;">売</span> Auto-Vente Doublons</div>
        <div class="pill-card"><span style="color:var(--ok); font-weight:800;">転</span> Auto-Recyclage Rentable</div>
        <div class="pill-card"><span style="color:var(--cyan); font-weight:800;">市</span> Scanner Flips Marché</div>
        <div class="pill-card"><span style="color:var(--acc); font-weight:800;">札</span> Ouverture Live Boosters</div>
      </div>

      <div style="margin-top:16px; font-size:11.5px; color:var(--ok); font-family:var(--mono);">
        ✓ 100% Local &amp; Open-Source · Sanctuaire de Chakra · Zéro Télémétrie
      </div>
    </div>
  </div>

  <div class="right-col">
    <!-- Real Sidepanel UI -->
    <div class="sidepanel-showcase">
      ${realSidepanelBody}
    </div>

    <!-- Floating HUD Pill -->
    <aside id="km-floating-hud" class="km-hud" style="position:absolute; bottom:30px; left:20px; z-index:5;">
      <button type="button" class="km-hud__seal">操</button>
      <div class="km-hud__info">
        <strong class="km-hud__title">KYARA MANAGER</strong>
        <span class="km-hud__meta">Pilote actif : Vente &amp; Recyclage</span>
      </div>
      <button type="button" class="km-hud__btn km-hud__btn--toggle" style="background:rgba(63,191,127,0.2); color:#3fbf7f;">AUTO ON</button>
      <button type="button" class="km-hud__btn km-hud__btn--primary">Panneau</button>
    </aside>
  </div>

  <script>${analyticsJs}</script>
  <script>${i18nJs}</script>
  <script>${sidepanelJs}</script>
</body>
</html>`;

// -------------------------------------------------------------------------
// SMALL PROMO TILE (440 x 280)
// -------------------------------------------------------------------------
const HTML_SMALL = `<!DOCTYPE html>
<html lang="fr">
<head>
<meta charset="utf-8">
<style>
${sidepanelCss}

body {
  width: 440px;
  height: 280px;
  margin: 0;
  padding: 24px 20px 20px 20px;
  background: radial-gradient(circle at 50% 35%, #1d182a 0%, #0c0b11 65%, #060508 100%);
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: space-between;
  text-align: center;
  overflow: hidden;
  font-family: var(--body);
}

.top-pill {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  background: rgba(255, 77, 46, 0.12);
  border: 1px solid rgba(255, 77, 46, 0.35);
  border-radius: 999px;
  padding: 4px 12px;
  font-family: var(--mono);
  font-size: 9.5px;
  font-weight: 700;
  color: var(--acc);
}

.center-box {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
}

.brand-seal-lg {
  width: 62px;
  height: 62px;
  border-radius: 16px;
  background: linear-gradient(135deg, #282236, #14131a);
  border: 2px solid var(--acc);
  box-shadow: 0 0 28px rgba(255, 77, 46, 0.35);
  display: flex;
  align-items: center;
  justify-content: center;
  font-family: var(--disp);
  font-size: 30px;
  font-weight: 900;
  color: var(--acc);
}

.brand-heading {
  font-family: var(--disp);
  font-size: 22px;
  font-weight: 900;
  color: #fff;
  letter-spacing: 0.5px;
}

.brand-tag {
  font-size: 12.5px;
  font-weight: 700;
  color: var(--gold);
}

.features-strip {
  display: flex;
  gap: 6px;
  justify-content: center;
}

.strip-pill {
  background: rgba(30, 28, 38, 0.85);
  border: 1px solid var(--line2);
  border-radius: 8px;
  padding: 5px 9px;
  font-size: 10.5px;
  font-weight: 600;
  color: var(--fg);
}
</style>
</head>
<body>
  <div class="top-pill">★ EXTENSION CHROME · MANIFEST V3</div>

  <div class="center-box">
    <div class="brand-seal-lg">操</div>
    <div class="brand-heading">KYARA MANAGER</div>
    <div class="brand-tag">Pilote Automatique &amp; Arbitrage</div>
  </div>

  <div class="features-strip">
    <div class="strip-pill"><span style="color:var(--gold)">売</span> Auto-Vente</div>
    <div class="strip-pill"><span style="color:var(--ok)">転</span> Recyclage</div>
    <div class="strip-pill"><span style="color:var(--cyan)">市</span> Flips</div>
    <div class="strip-pill"><span style="color:var(--acc)">札</span> Boosters</div>
  </div>

  <div style="font-size:10px; color:var(--dim); font-family:var(--mono);">
    POUR KYARA.GAMES · 100% LOCAL &amp; SÉCURISÉ
  </div>
</body>
</html>`;

const targets = [
  { id: 'promo-marquee-1400x560', width: 1400, height: 560, html: HTML_MARQUEE },
  { id: 'promo-small-440x280', width: 440, height: 280, html: HTML_SMALL },
  { id: 'screenshot-1-autopilot', width: 1280, height: 800, html: HTML_SCREENSHOT_1 },
  { id: 'screenshot-2-doublons', width: 1280, height: 800, html: HTML_SCREENSHOT_2 },
  { id: 'screenshot-3-marche', width: 1280, height: 800, html: HTML_SCREENSHOT_3 },
  { id: 'screenshot-4-boosters', width: 1280, height: 800, html: HTML_SCREENSHOT_4 },
  { id: 'screenshot-5-securite', width: 1280, height: 800, html: HTML_SCREENSHOT_5 },
];

console.log('Writing realistic HTML templates using authentic app markup & CSS...');
for (const t of targets) {
  const tplPath = path.join(templatesDir, `${t.id}.html`);
  fs.writeFileSync(tplPath, t.html, 'utf8');
}

console.log('Capturing realistic Chrome screenshots...');
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

console.log('All real promotional assets rendered successfully!');
