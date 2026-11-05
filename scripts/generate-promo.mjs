import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, '..');
const promoDir = path.join(rootDir, 'promo');
const templatesDir = path.join(promoDir, 'templates');
const brainDir = '/Users/etiennementrel/.gemini/antigravity/brain/b940700c-9447-4038-95e4-aaf2f3023806';
const previewDir = path.join(brainDir, 'promo-preview');
const aiBannerPath = path.join(brainDir, 'kyara_manager_promo_banner_1793817710243.jpg');

fs.mkdirSync(promoDir, { recursive: true });
fs.mkdirSync(templatesDir, { recursive: true });
fs.mkdirSync(previewDir, { recursive: true });

const CHROME_PATH = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
if (!fs.existsSync(CHROME_PATH)) {
  console.error('Error: Google Chrome not found at', CHROME_PATH);
  process.exit(1);
}

// Common styles for all 5 promotional images (1280 x 800)
function getBaseHtml({ badge, titlePrefix, titleHighlight, subtitle, features, rightCardHtml, glowColor = '#ff4d2e' }) {
  return `<!DOCTYPE html>
<html lang="fr">
<head>
<meta charset="utf-8">
<style>
  @import url("https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@600;700;800&family=Unbounded:wght@700;800;900&family=Zen+Kaku+Gothic+New:wght@500;700;900&display=swap");
  * { box-sizing: border-box; margin: 0; padding: 0; }

  body {
    width: 1280px;
    height: 800px;
    background: #08070c;
    overflow: hidden;
    font-family: "Zen Kaku Gothic New", -apple-system, BlinkMacSystemFont, Segoe UI, Roboto, sans-serif;
    color: #edeae4;
    position: relative;
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 0 70px;
  }

  .bg-glow-1 {
    position: absolute;
    width: 600px;
    height: 600px;
    border-radius: 50%;
    background: radial-gradient(circle, ${glowColor}33 0%, transparent 70%);
    top: -150px;
    left: 180px;
    filter: blur(80px);
    pointer-events: none;
    z-index: 1;
  }

  .bg-glow-2 {
    position: absolute;
    width: 500px;
    height: 500px;
    border-radius: 50%;
    background: radial-gradient(circle, rgba(245, 197, 24, 0.14) 0%, transparent 70%);
    bottom: -120px;
    right: 120px;
    filter: blur(90px);
    pointer-events: none;
    z-index: 1;
  }

  .bg-art {
    position: absolute;
    inset: 0;
    background-image: url("file://${aiBannerPath}");
    background-size: cover;
    background-position: center right;
    opacity: 0.16;
    filter: saturate(1.2) contrast(1.1);
    z-index: 1;
  }
  .bg-art::after {
    content: "";
    position: absolute;
    inset: 0;
    background: linear-gradient(90deg, #08070c 0%, #08070c 45%, rgba(8,7,12,0.85) 70%, rgba(8,7,12,0.45) 100%);
  }

  /* Left Column */
  .left-col {
    position: relative;
    z-index: 2;
    max-width: 610px;
    display: flex;
    flex-direction: column;
    gap: 22px;
  }

  .top-pill {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    background: rgba(255, 77, 46, 0.14);
    border: 1px solid rgba(255, 77, 46, 0.45);
    border-radius: 999px;
    padding: 6px 14px;
    font-family: "JetBrains Mono", monospace;
    font-size: 11px;
    font-weight: 800;
    color: #ff4d2e;
    letter-spacing: 0.8px;
    width: fit-content;
  }

  .brand-title {
    font-family: "Unbounded", sans-serif;
    font-size: 40px;
    font-weight: 900;
    line-height: 1.15;
    color: #ffffff;
    letter-spacing: -0.5px;
  }
  .brand-title span {
    background: linear-gradient(135deg, #f5c518 0%, #ff4d2e 100%);
    -webkit-background-clip: text;
    -webkit-text-fill-color: transparent;
  }

  .brand-sub {
    font-size: 15.5px;
    line-height: 1.55;
    color: #b7b2bf;
    max-width: 560px;
  }

  .features-grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 12px;
    max-width: 580px;
  }

  .feat-card {
    background: rgba(22, 20, 28, 0.85);
    border: 1px solid #282434;
    border-radius: 12px;
    padding: 12px 14px;
    display: flex;
    align-items: flex-start;
    gap: 12px;
    backdrop-filter: blur(12px);
  }

  .feat-icon {
    width: 32px;
    height: 32px;
    border-radius: 8px;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 15px;
    font-weight: 800;
    flex-shrink: 0;
  }

  .feat-text {
    display: flex;
    flex-direction: column;
    gap: 2px;
  }
  .feat-title {
    font-size: 13px;
    font-weight: 800;
    color: #ffffff;
  }
  .feat-desc {
    font-size: 11.5px;
    color: #9d98a5;
    line-height: 1.35;
  }

  .trust-bar {
    display: flex;
    align-items: center;
    gap: 18px;
    font-family: "JetBrains Mono", monospace;
    font-size: 11px;
    color: #8e8a98;
    margin-top: 2px;
  }
  .trust-bar span {
    display: flex;
    align-items: center;
    gap: 6px;
  }

  /* Right Column (Showcase Frame) */
  .right-col {
    position: relative;
    z-index: 2;
    width: 490px;
  }

  .showcase-frame {
    background: #14131b;
    border: 1px solid #2e2a3c;
    border-radius: 20px;
    box-shadow: 0 25px 60px rgba(0,0,0,0.85), 0 0 40px ${glowColor}2b;
    overflow: hidden;
    display: flex;
    flex-direction: column;
  }

  .frame-header {
    background: #1c1a24;
    border-bottom: 1px solid #282434;
    padding: 14px 20px;
    display: flex;
    align-items: center;
    justify-content: space-between;
  }

  .frame-title {
    display: flex;
    align-items: center;
    gap: 10px;
    font-family: "Unbounded", sans-serif;
    font-size: 13.5px;
    font-weight: 800;
    color: #ffffff;
  }

  .frame-seal {
    width: 28px;
    height: 28px;
    border-radius: 7px;
    background: #ff4d2e;
    color: #fff;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 14px;
    font-weight: 900;
  }

  .frame-body {
    padding: 18px;
    display: flex;
    flex-direction: column;
    gap: 14px;
  }
</style>
</head>
<body>
  <div class="bg-art"></div>
  <div class="bg-glow-1"></div>
  <div class="bg-glow-2"></div>

  <div class="left-col">
    <div class="top-pill">${badge}</div>

    <h1 class="brand-title">
      ${titlePrefix}<br>
      <span>${titleHighlight}</span>
    </h1>

    <p class="brand-sub">${subtitle}</p>

    <div class="features-grid">
      ${features.map(f => `
      <div class="feat-card">
        <div class="feat-icon" style="background: ${f.bg}; color: ${f.color};">${f.icon}</div>
        <div class="feat-text">
          <div class="feat-title">${f.title}</div>
          <div class="feat-desc">${f.desc}</div>
        </div>
      </div>`).join('')}
    </div>

    <div class="trust-bar">
      <span><strong style="color:#3fbf7f;">✓</strong> 100% Local (Manifest V3)</span>
      <span><strong style="color:#3fbf7f;">✓</strong> Sécurité 0 Chakra</span>
      <span><strong style="color:#3fbf7f;">✓</strong> kyara.games</span>
    </div>
  </div>

  <div class="right-col">
    <div class="showcase-frame">
      <div class="frame-header">
        <div class="frame-title">
          <div class="frame-seal">操</div>
          <span>KYARA MANAGER</span>
        </div>
        <span style="font-size: 11px; font-family: 'JetBrains Mono', monospace; color: #3fbf7f; background: rgba(63,191,127,0.15); padding: 4px 8px; border-radius: 6px; font-weight: 700;">● ACTIF</span>
      </div>

      <div class="frame-body">
        ${rightCardHtml}
      </div>
    </div>
  </div>
</body>
</html>`;
}

// -------------------------------------------------------------------------
// SLIDE 1 : PILOTE AUTOMATIQUE & ROI
// -------------------------------------------------------------------------
const HTML_PROMO_1 = getBaseHtml({
  badge: '★ MODULE 01 · GESTIONNAIRE COMPLET',
  titlePrefix: 'Pilote Automatique',
  titleHighlight: 'Pour Kyara.games',
  subtitle: 'Automatisez vos routines de jeu en toute sécurité. Gagnez du temps et optimisez chaque session directement depuis le panneau latéral.',
  features: [
    { icon: '売', bg: 'rgba(245,197,24,0.15)', color: '#f5c518', title: 'Auto-Vente Optimisée', desc: 'Remplissage des 10 slots selon la cote 7j' },
    { icon: '転', bg: 'rgba(63,191,127,0.15)', color: '#3fbf7f', title: 'Auto-Recyclage', desc: 'Recyclage immédiat des cartes sans valeur' },
    { icon: '市', bg: 'rgba(77,214,255,0.15)', color: '#4dd6ff', title: 'Radar de Flips', desc: 'Détection des annonces sous-cotées' },
    { icon: '操', bg: 'rgba(255,77,46,0.15)', color: '#ff4d2e', title: 'Mini-HUD en jeu', desc: 'Suivi live discret en bas de page' },
  ],
  rightCardHtml: `
    <div style="background:#191822; border:1px solid #282434; border-radius:14px; padding:16px;">
      <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:12px;">
        <span style="font-size:12px; font-weight:800; color:#edeae4;">📊 Tableau de bord des gains (ROI)</span>
        <span style="font-size:10.5px; color:#8e8a98; font-family:'JetBrains Mono',monospace;">Session live</span>
      </div>
      <div style="display:grid; grid-template-columns:1fr 1fr; gap:10px;">
        <div style="background:#121118; border:1px solid #23202c; border-radius:10px; padding:10px 12px;">
          <div style="font-size:10px; color:#8e8a98; font-family:'JetBrains Mono',monospace;">CHAKRA GÉNÉRÉ</div>
          <div style="font-family:'JetBrains Mono',monospace; font-size:16px; font-weight:800; color:#f5c518; margin-top:2px;">+1 240 ◆</div>
        </div>
        <div style="background:#121118; border:1px solid #23202c; border-radius:10px; padding:10px 12px;">
          <div style="font-size:10px; color:#8e8a98; font-family:'JetBrains Mono',monospace;">VENTES MARCHÉ</div>
          <div style="font-family:'JetBrains Mono',monospace; font-size:16px; font-weight:800; color:#3fbf7f; margin-top:2px;">10 vendue(s)</div>
        </div>
        <div style="background:#121118; border:1px solid #23202c; border-radius:10px; padding:10px 12px;">
          <div style="font-size:10px; color:#8e8a98; font-family:'JetBrains Mono',monospace;">RECYCLAGES</div>
          <div style="font-family:'JetBrains Mono',monospace; font-size:16px; font-weight:800; color:#edeae4; margin-top:2px;">14 cartes</div>
        </div>
        <div style="background:#121118; border:1px solid #23202c; border-radius:10px; padding:10px 12px;">
          <div style="font-size:10px; color:#8e8a98; font-family:'JetBrains Mono',monospace;">BOOSTERS PRÊTS</div>
          <div style="font-family:'JetBrains Mono',monospace; font-size:16px; font-weight:800; color:#ff4d2e; margin-top:2px;">10 / 10</div>
        </div>
      </div>
    </div>

    <div style="background:#191822; border:1px solid #282434; border-radius:12px; padding:12px 14px; display:flex; justify-content:space-between; align-items:center;">
      <div style="display:flex; align-items:center; gap:10px;">
        <span style="color:#f5c518; font-weight:800;">売</span>
        <span style="font-size:12.5px; font-weight:700;">Auto-Vente des doublons (10 slots)</span>
      </div>
      <div style="width:36px; height:20px; background:#3fbf7f; border-radius:999px; position:relative;">
        <span style="position:absolute; width:14px; height:14px; border-radius:50%; background:#fff; right:3px; top:3px;"></span>
      </div>
    </div>

    <div style="background:#111016; border:1px solid #23202c; border-radius:10px; padding:10px 12px; font-family:'JetBrains Mono',monospace; font-size:11px; display:flex; flex-direction:column; gap:6px;">
      <div style="display:flex; align-items:center; gap:8px;">
        <span style="width:6px; height:6px; border-radius:50%; background:#3fbf7f;"></span>
        <span style="color:#edeae4;">Carte vendue : Haruka Tenou pour 18 ◆ (net +16 ◆)</span>
      </div>
      <div style="display:flex; align-items:center; gap:8px;">
        <span style="width:6px; height:6px; border-radius:50%; background:#4dd6ff;"></span>
        <span style="color:#edeae4;">Flip détecté : Chelia Blendy (-48% sous la cote)</span>
      </div>
      <div style="display:flex; align-items:center; gap:8px;">
        <span style="width:6px; height:6px; border-radius:50%; background:#f5c518;"></span>
        <span style="color:#8e8a98;">Sécurité 0 Chakra : protection active</span>
      </div>
    </div>`
});

// -------------------------------------------------------------------------
// SLIDE 2 : AUTO-VENTE DES DOUBLONS
// -------------------------------------------------------------------------
const HTML_PROMO_2 = getBaseHtml({
  badge: '★ MODULE 02 · ARBITRAGE DES DOUBLONS',
  titlePrefix: 'Vente Intelligente',
  titleHighlight: 'Sans Jamais Brader',
  subtitle: 'Calcul automatique des prix de vente basé sur les médianes réelles à 7 jours. Vos 10 emplacements sont toujours remplis au prix le plus rentable.',
  glowColor: '#f5c518',
  features: [
    { icon: '📊', bg: 'rgba(245,197,24,0.15)', color: '#f5c518', title: 'Médiane Réelle 7j', desc: 'Analyse continue des transactions du marché' },
    { icon: '🛡️', bg: 'rgba(255,77,46,0.15)', color: '#ff4d2e', title: 'Garde-fou 70%', desc: 'Protection anti-crash pour ne pas casser les cours' },
    { icon: '💰', bg: 'rgba(63,191,127,0.15)', color: '#3fbf7f', title: 'Taxes Déduites', desc: 'Calcul net exact (taxe 5% + 2% frais de dépôt)' },
    { icon: '🔒', bg: 'rgba(77,214,255,0.15)', color: '#4dd6ff', title: 'Protection Collection', desc: 'Conserve toujours ≥1 exemplaire pour vos albums' },
  ],
  rightCardHtml: `
    <div style="background:#191822; border:1px solid #282434; border-radius:14px; padding:16px; display:flex; flex-direction:column; gap:10px;">
      <div style="display:flex; justify-content:space-between; align-items:center;">
        <span style="font-size:12px; font-weight:800; color:#edeae4;">💎 Cartes en surplus détectées</span>
        <span style="font-size:11px; color:#f5c518; font-weight:700;">Conseil vente active</span>
      </div>

      <!-- Card row 1 -->
      <div style="background:#121118; border:1px solid #23202c; border-radius:10px; padding:10px 12px; display:flex; justify-content:space-between; align-items:center;">
        <div>
          <div style="display:flex; align-items:center; gap:6px;">
            <span style="background:#1c3d5a; color:#4dd6ff; font-size:10px; font-weight:800; padding:1px 5px; border-radius:4px; font-family:'JetBrains Mono';">R</span>
            <span style="font-size:13px; font-weight:700; color:#fff;">Haruka Tenou</span>
            <span style="font-size:11px; color:#8e8a98;">(Surplus ×1)</span>
          </div>
          <div style="font-size:11px; color:#8e8a98; margin-top:3px; font-family:'JetBrains Mono';">Médiane 7j : 18 ◆ · Net : 16 ◆ · 24h: 99%</div>
        </div>
        <div style="background:#3fbf7f; color:#0b0a0f; font-size:11px; font-weight:800; padding:5px 12px; border-radius:6px; font-family:'JetBrains Mono';">VENDRE</div>
      </div>

      <!-- Card row 2 -->
      <div style="background:#121118; border:1px solid #23202c; border-radius:10px; padding:10px 12px; display:flex; justify-content:space-between; align-items:center;">
        <div>
          <div style="display:flex; align-items:center; gap:6px;">
            <span style="background:#1c3d5a; color:#4dd6ff; font-size:10px; font-weight:800; padding:1px 5px; border-radius:4px; font-family:'JetBrains Mono';">R</span>
            <span style="font-size:13px; font-weight:700; color:#fff;">Evileye</span>
            <span style="font-size:11px; color:#8e8a98;">(Surplus ×1)</span>
          </div>
          <div style="font-size:11px; color:#8e8a98; margin-top:3px; font-family:'JetBrains Mono';">Médiane 7j : 7 ◆ · Net : 5 ◆ · 24h: 99%</div>
        </div>
        <div style="background:#3fbf7f; color:#0b0a0f; font-size:11px; font-weight:800; padding:5px 12px; border-radius:6px; font-family:'JetBrains Mono';">VENDRE</div>
      </div>

      <!-- Card row 3 (recycle) -->
      <div style="background:#121118; border:1px solid #23202c; border-radius:10px; padding:10px 12px; display:flex; justify-content:space-between; align-items:center;">
        <div>
          <div style="display:flex; align-items:center; gap:6px;">
            <span style="background:#2a2834; color:#a8a3b0; font-size:10px; font-weight:800; padding:1px 5px; border-radius:4px; font-family:'JetBrains Mono';">C</span>
            <span style="font-size:13px; font-weight:700; color:#fff;">Danzou Shimura</span>
            <span style="font-size:11px; color:#8e8a98;">(Surplus ×2)</span>
          </div>
          <div style="font-size:11px; color:#8e8a98; margin-top:3px; font-family:'JetBrains Mono';">Prix plancher · Recyclage immédiat : 3 ◆/u</div>
        </div>
        <div style="background:#ff4d2e; color:#fff; font-size:11px; font-weight:800; padding:5px 10px; border-radius:6px; font-family:'JetBrains Mono';">RECYCLER</div>
      </div>
    </div>

    <div style="background:#191822; border:1px solid #282434; border-radius:12px; padding:12px 14px; font-size:12px; color:#edeae4; display:flex; align-items:center; gap:10px;">
      <span style="color:#ff4d2e; font-size:16px;">🛡️</span>
      <span><strong>Garde-fou 70% actif :</strong> impossible de brader une carte sous sa valeur de marché.</span>
    </div>`
});

// -------------------------------------------------------------------------
// SLIDE 3 : SCANNER DE FLIPS MARCHÉ
// -------------------------------------------------------------------------
const HTML_PROMO_3 = getBaseHtml({
  badge: '★ MODULE 03 · ARBITRAGE DU MARCHÉ',
  titlePrefix: 'Scanner de Flips',
  titleHighlight: 'Radar de Bons Plans',
  subtitle: 'Repérez immédiatement les cartes vendues sous leur cours moyen et achetez-les en un clic pour dégager un profit net garanti à la revente.',
  glowColor: '#4dd6ff',
  features: [
    { icon: '🎯', bg: 'rgba(77,214,255,0.15)', color: '#4dd6ff', title: 'Radar Temps Réel', desc: 'Scan automatique des dernières annonces' },
    { icon: '📈', bg: 'rgba(63,191,127,0.15)', color: '#3fbf7f', title: 'Marge Nette +◆', desc: 'Calcul du bénéfice réel après déduction des taxes' },
    { icon: '⚡', bg: 'rgba(245,197,24,0.15)', color: '#f5c518', title: 'Achat en 1 Clic', desc: 'Acquisition instantanée sans quitter votre page' },
    { icon: '🏷️', bg: 'rgba(255,77,46,0.15)', color: '#ff4d2e', title: 'Filtres de Rareté', desc: 'Ciblez les cartes Communes, Rares ou Épiques' },
  ],
  rightCardHtml: `
    <div style="background:#191822; border:1px solid #282434; border-radius:14px; padding:16px; display:flex; flex-direction:column; gap:10px;">
      <div style="display:flex; justify-content:space-between; align-items:center;">
        <span style="font-size:12px; font-weight:800; color:#edeae4;">🎯 Opportunités de Flips Rentables</span>
        <span style="font-size:11px; color:#4dd6ff; font-weight:700;">Radar actif</span>
      </div>

      <!-- Flip 1 -->
      <div style="background:#121118; border:1px solid #23202c; border-radius:10px; padding:12px; display:flex; justify-content:space-between; align-items:center;">
        <div>
          <div style="display:flex; align-items:center; gap:6px;">
            <span style="background:#2a2834; color:#a8a3b0; font-size:10px; font-weight:800; padding:1px 5px; border-radius:4px; font-family:'JetBrains Mono';">C</span>
            <span style="font-size:13px; font-weight:700; color:#fff;">Chelia Blendy</span>
            <span style="background:rgba(63,191,127,0.2); color:#3fbf7f; font-size:10px; font-weight:800; padding:1px 6px; border-radius:4px; font-family:'JetBrains Mono';">-48% sous cote</span>
          </div>
          <div style="font-size:11px; color:#8e8a98; margin-top:3px; font-family:'JetBrains Mono';">Achat : 12 ◆ · Revente : 20 ◆ · <strong>Marge : +6 ◆ (ROI 50%)</strong></div>
        </div>
        <button style="background:#ff4d2e; color:#fff; border:none; padding:7px 14px; border-radius:6px; font-weight:800; font-family:'JetBrains Mono'; font-size:11px; cursor:pointer;">Acheter</button>
      </div>

      <!-- Flip 2 -->
      <div style="background:#121118; border:1px solid #23202c; border-radius:10px; padding:12px; display:flex; justify-content:space-between; align-items:center;">
        <div>
          <div style="display:flex; align-items:center; gap:6px;">
            <span style="background:#3d1a45; color:#d946ef; font-size:10px; font-weight:800; padding:1px 5px; border-radius:4px; font-family:'JetBrains Mono';">E</span>
            <span style="font-size:13px; font-weight:700; color:#fff;">Mejiro McQueen</span>
            <span style="background:rgba(63,191,127,0.2); color:#3fbf7f; font-size:10px; font-weight:800; padding:1px 6px; border-radius:4px; font-family:'JetBrains Mono';">-24% sous cote</span>
          </div>
          <div style="font-size:11px; color:#8e8a98; margin-top:3px; font-family:'JetBrains Mono';">Achat : 25 ◆ · Revente : 32 ◆ · <strong>Marge : +4 ◆ (ROI 16%)</strong></div>
        </div>
        <button style="background:#ff4d2e; color:#fff; border:none; padding:7px 14px; border-radius:6px; font-weight:800; font-family:'JetBrains Mono'; font-size:11px; cursor:pointer;">Acheter</button>
      </div>
    </div>

    <div style="background:#191822; border:1px solid #282434; border-radius:12px; padding:12px 14px; font-size:12px; color:#edeae4; display:flex; align-items:center; gap:10px;">
      <span style="color:#4dd6ff; font-size:16px;">💡</span>
      <span><strong>Calcul automatique :</strong> la marge affichée intègre déjà les 5% de taxe et 2% de frais de dépôt.</span>
    </div>`
});

// -------------------------------------------------------------------------
// SLIDE 4 : RENTABILITÉ DES BOOSTERS (EV) & PITY SNIPER
// -------------------------------------------------------------------------
const HTML_PROMO_4 = getBaseHtml({
  badge: '★ MODULE 04 · PROBABILITÉS & TIRAGES',
  titlePrefix: 'Rentabilité Boosters',
  titleHighlight: 'Espérance Chakra (EV)',
  subtitle: 'Ne tirez plus au hasard. Ouvrez les boosters les plus rentables mathématiquement et sécurisez vos cartes Mythiques manquantes dès que la Pitié approche.',
  glowColor: '#3fbf7f',
  features: [
    { icon: '🎲', bg: 'rgba(63,191,127,0.15)', color: '#3fbf7f', title: 'Espérance de Valeur (EV)', desc: 'Chakra moyen attendu par booster ouvert' },
    { icon: '✨', bg: 'rgba(245,197,24,0.15)', color: '#f5c518', title: 'Probabilité Nouvelles', desc: 'Chances d\'obtenir une carte manquante' },
    { icon: '🎯', bg: 'rgba(255,77,46,0.15)', color: '#ff4d2e', title: 'Pity Sniper (240/250)', desc: 'Cible le pack avec le plus de Mythiques manquantes' },
    { icon: '📦', bg: 'rgba(77,214,255,0.15)', color: '#4dd6ff', title: 'Tirage Live Piloté', desc: 'Ouverture instantanée depuis le volet latéral' },
  ],
  rightCardHtml: `
    <div style="background:#191822; border:1px solid #282434; border-radius:14px; padding:16px; display:flex; flex-direction:column; gap:10px;">
      <div style="display:flex; justify-content:space-between; align-items:center;">
        <span style="font-size:12px; font-weight:800; color:#edeae4;">📦 Classement des Boosters par Rentabilité</span>
        <span style="font-size:11px; color:#3fbf7f; font-weight:700;">EV live</span>
      </div>

      <!-- Booster 1 -->
      <div style="background:#121118; border:1px solid #2e2a3c; border-radius:10px; padding:12px; display:flex; justify-content:space-between; align-items:center;">
        <div>
          <div style="display:flex; align-items:center; gap:6px;">
            <span style="background:rgba(245,197,24,0.2); color:#f5c518; font-size:10px; font-weight:800; padding:1px 6px; border-radius:4px; font-family:'JetBrains Mono';">#1 CONSEILLÉ</span>
            <span style="font-size:13.5px; font-weight:700; color:#fff;">Shōnen Mix</span>
          </div>
          <div style="font-size:11px; color:#8e8a98; margin-top:4px; font-family:'JetBrains Mono';">
            EV : <strong>~40 ◆</strong> · P(≥1 nouvelle) : <strong style="color:#3fbf7f;">99.4%</strong> · Manquants : 4 651
          </div>
        </div>
        <button style="background:#ff4d2e; color:#fff; border:none; padding:8px 14px; border-radius:6px; font-weight:800; font-family:'JetBrains Mono'; font-size:11px; cursor:pointer;">Ouvrir</button>
      </div>

      <!-- Pity Sniper Banner -->
      <div style="background:linear-gradient(135deg, rgba(245,197,24,0.15), rgba(255,77,46,0.15)); border:1px solid #f5c518; border-radius:10px; padding:12px;">
        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:6px;">
          <span style="font-size:12px; font-weight:800; color:#f5c518;">🎯 JAUGE PITIÉ MYTHIQUE</span>
          <span style="font-family:'JetBrains Mono'; font-weight:800; color:#fff; font-size:12px;">240 / 250</span>
        </div>
        <div style="width:100%; height:6px; background:#121118; border-radius:999px; overflow:hidden; margin-bottom:6px;">
          <div style="width:96%; height:100%; background:linear-gradient(90deg, #f5c518, #ff4d2e);"></div>
        </div>
        <div style="font-size:10.5px; color:#edeae4; font-family:'JetBrains Mono';">
          Alerte active : sélection automatique du booster maximisant vos Mythiques.
        </div>
      </div>
    </div>

    <div style="background:#191822; border:1px solid #282434; border-radius:12px; padding:12px 14px; font-size:12px; color:#edeae4; display:flex; align-items:center; gap:10px;">
      <span style="color:#f5c518; font-size:16px;">✨</span>
      <span><strong>Sécurité 0 Chakra :</strong> seuls les boosters gratuits sont ouverts, aucun achat payant par erreur.</span>
    </div>`
});

// -------------------------------------------------------------------------
// SLIDE 5 : SÉCURITÉ 0 CHAKRA & CONFIDENTIALITÉ
// -------------------------------------------------------------------------
const HTML_PROMO_5 = getBaseHtml({
  badge: '★ MODULE 05 · CONTRÔLE & PROTECTION',
  titlePrefix: 'Sanctuaire de Chakra',
  titleHighlight: 'Sécurité & Contrôle Total',
  subtitle: 'Une architecture sécurisée et 100% locale pour jouer en toute sérénité. Vos ressources sont protégées par des garde-fous stricts.',
  glowColor: '#3fbf7f',
  features: [
    { icon: '🛡️', bg: 'rgba(63,191,127,0.15)', color: '#3fbf7f', title: 'Sécurité 0 Chakra', desc: 'Impossible d\'ouvrir un pack payant par erreur' },
    { icon: '🔒', bg: 'rgba(245,197,24,0.15)', color: '#f5c518', title: 'Réserve Intouchable', desc: 'Seuil minimal inviolable sous lequel aucun flip n\'est acheté' },
    { icon: '🔐', bg: 'rgba(77,214,255,0.15)', color: '#4dd6ff', title: 'Cadenas de Cartes', desc: 'Verrouillez vos cartes précieuses du recyclage' },
    { icon: '💻', bg: 'rgba(255,77,46,0.15)', color: '#ff4d2e', title: '100% Local (MV3)', desc: 'Aucun serveur distant, zéro tracking, open-source' },
  ],
  rightCardHtml: `
    <div style="background:#191822; border:1px solid #282434; border-radius:14px; padding:16px; display:flex; flex-direction:column; gap:10px;">
      <div style="display:flex; justify-content:space-between; align-items:center;">
        <span style="font-size:12px; font-weight:800; color:#edeae4;">🛡️ Garde-fous et Réglages de Sécurité</span>
        <span style="font-size:11px; color:#3fbf7f; font-weight:700;">Haute sécurité</span>
      </div>

      <div style="background:#121118; border:1px solid #23202c; border-radius:10px; padding:10px 12px; display:flex; justify-content:space-between; align-items:center;">
        <div>
          <div style="font-size:12.5px; font-weight:700; color:#fff;">Garde-fou 70% de la médiane 7j</div>
          <div style="font-size:10.5px; color:#8e8a98;">Bloque la mise en vente sous 70% de la cote</div>
        </div>
        <div style="width:34px; height:18px; background:#3fbf7f; border-radius:999px; position:relative;">
          <span style="position:absolute; width:12px; height:12px; border-radius:50%; background:#fff; right:3px; top:3px;"></span>
        </div>
      </div>

      <div style="background:#121118; border:1px solid #23202c; border-radius:10px; padding:10px 12px; display:flex; justify-content:space-between; align-items:center;">
        <div>
          <div style="font-size:12.5px; font-weight:700; color:#fff;">Vélocité rapide du marché (48h)</div>
          <div style="font-size:10.5px; color:#8e8a98;">Ne liste que les cartes vendables en 12h</div>
        </div>
        <div style="width:34px; height:18px; background:#3fbf7f; border-radius:999px; position:relative;">
          <span style="position:absolute; width:12px; height:12px; border-radius:50%; background:#fff; right:3px; top:3px;"></span>
        </div>
      </div>

      <div style="background:#121118; border:1px solid #23202c; border-radius:10px; padding:10px 12px; display:flex; justify-content:space-between; align-items:center;">
        <div>
          <div style="font-size:12.5px; font-weight:700; color:#fff;">Réserve minimale de Chakra protégée</div>
          <div style="font-size:10.5px; color:#8e8a98;">Solde sanctuarisé intouchable pour les achats</div>
        </div>
        <span style="font-family:'JetBrains Mono'; font-weight:800; color:#f5c518; font-size:13px;">500 ◆</span>
      </div>

      <div style="background:#121118; border:1px solid #23202c; border-radius:10px; padding:10px 12px; display:flex; justify-content:space-between; align-items:center;">
        <div>
          <div style="font-size:12.5px; font-weight:700; color:#fff;">Exemplaires toujours conservés</div>
          <div style="font-size:10.5px; color:#8e8a98;">Protection stricte de votre collection</div>
        </div>
        <span style="font-family:'JetBrains Mono'; font-weight:800; color:#3fbf7f; font-size:13px;">≥ 1 copie</span>
      </div>
    </div>

    <div style="background:#111016; border:1px solid #23202c; border-radius:12px; padding:12px 14px; font-size:11.5px; color:#9d98a5; display:flex; align-items:center; gap:10px;">
      <span style="color:#3fbf7f; font-size:15px;">✓</span>
      <span><strong>Confidentialité garantie :</strong> aucune donnée personnelle n'est collectée, analysée ou transmise.</span>
    </div>`
});

// -------------------------------------------------------------------------
// 6. MARQUEE HERO BANNER (1400 x 560)
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
// 7. SMALL PROMO TILE (440 x 280)
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

const promoTargets = [
  { id: 'screenshot-1-autopilot', width: 1280, height: 800, html: HTML_PROMO_1, label: 'Image Promo 1 : Pilote Automatique & ROI' },
  { id: 'screenshot-2-doublons', width: 1280, height: 800, html: HTML_PROMO_2, label: 'Image Promo 2 : Vente des Doublons & Cote' },
  { id: 'screenshot-3-marche', width: 1280, height: 800, html: HTML_PROMO_3, label: 'Image Promo 3 : Scanner de Flips Marché' },
  { id: 'screenshot-4-boosters', width: 1280, height: 800, html: HTML_PROMO_4, label: 'Image Promo 4 : Rentabilité Boosters & EV' },
  { id: 'screenshot-5-securite', width: 1280, height: 800, html: HTML_PROMO_5, label: 'Image Promo 5 : Sanctuaire & Sécurité' },
  { id: 'promo-marquee-1400x560', width: 1400, height: 560, html: HTML_MARQUEE, label: 'Bannière Marquee Hero (1400x560)' },
  { id: 'promo-small-440x280', width: 440, height: 280, html: HTML_SMALL, label: 'Petite tuile promo (440x280)' },
];

console.log('--- GÉNÉRATION DES 5 IMAGES PROMOTIONNELLES DU STORE (1280x800) ---');
console.log(`Cible : ${promoTargets.length} fichiers (PNG 24-bits + JPEG 95% sans alpha)\n`);

for (const t of promoTargets) {
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

console.log('✅ Les 5 images promotionnelles officielles ont été générées avec succès !');
