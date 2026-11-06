#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, '..');
const distSidepanel = path.join(rootDir, 'dist/sidepanel');

const indexHtmlPath = path.join(distSidepanel, 'index.html');
if (!fs.existsSync(indexHtmlPath)) {
  console.error('dist/sidepanel/index.html does not exist. Run npm run build first.');
  process.exit(1);
}

const originalHtml = fs.readFileSync(indexHtmlPath, 'utf8');
const version = JSON.parse(fs.readFileSync(path.join(rootDir, 'package.json'), 'utf8')).version;

const mockScript = `
<script>
window.mockDashboard = {
  authenticated: true,
  me: {
    pseudo: 'LuffyGamer99',
    chakra: 3420,
    freePacks: 7,
    freePacksMax: 10,
    bonusPacks: 2,
    pity: 244
  },
  collectionStats: {
    uniqueOwned: 184,
    catalogSize: 420,
    completionPct: 43.8,
    duplicatesCount: 16,
    sellableDuplicatesCount: 4,
    sellableNetTotal: 128,
    recyclableDuplicatesCount: 8,
    recyclableChakraTotal: 26
  },
  activeListings: [
    { id: 'lst-1', characterId: 101, name: 'Lelouch Lamperouge', rarity: 'L', price: 42, series: 'Code Geass' },
    { id: 'lst-2', characterId: 102, name: 'Zero Two', rarity: 'E', price: 28, series: 'Darling in the Franxx' },
    { id: 'lst-3', characterId: 103, name: 'Mai Sakurajima', rarity: 'R', price: 14, series: 'Bunny Girl Senpai' }
  ],
  duplicates: [
    {
      characterId: 101,
      name: 'Lelouch Lamperouge',
      series: 'Code Geass',
      rarity: 'L',
      owned: 3,
      spare: 2,
      recycleValue: 12,
      referenceMedian: 45,
      lowestFixed: 42,
      highestFixed: 55,
      sales7d: 14,
      verdict: 'VENDRE',
      verdictReason: 'Prix de marché élevé avec net proceeds rentable',
      pinned: false,
      prices: { recommended: 40, undercut: 41, median: 45, minSafe: 32 },
      fees: { sellerTax: 2, depositFee: 1, netProceeds: 37, netGainOverRecycle: 25 },
      pedagogy: {
        decision: 'VENDRE',
        title: 'Lelouch Lamperouge (Légendaire)',
        why: 'Demande active sur Code Geass. Forte probabilité de vente sous 12h à 40 ◆.',
        delayEstimate: '6h - 12h',
        gainAnalysis: '+37 ◆ net (+25 ◆ vs recyclage)',
        competition: '3 offres actives en concurrence',
        hourlyExpectedChakra: 3.1
      }
    },
    {
      characterId: 102,
      name: 'Zero Two',
      series: 'Darling in the Franxx',
      rarity: 'E',
      owned: 2,
      spare: 1,
      recycleValue: 8,
      referenceMedian: 30,
      lowestFixed: 28,
      highestFixed: 36,
      sales7d: 22,
      verdict: 'VENDRE',
      verdictReason: 'Forte rotation sur Zero Two',
      pinned: false,
      prices: { recommended: 27, undercut: 27, median: 30, minSafe: 21 },
      fees: { sellerTax: 1, depositFee: 1, netProceeds: 25, netGainOverRecycle: 17 },
      pedagogy: {
        decision: 'VENDRE',
        title: 'Zero Two (Épique)',
        why: 'Excellente vélocité : 22 ventes cette semaine. Vente rapide garantie.',
        delayEstimate: '< 6h',
        gainAnalysis: '+25 ◆ net (+17 ◆ vs recyclage)',
        competition: '2 offres actives',
        hourlyExpectedChakra: 4.2
      }
    },
    {
      characterId: 103,
      name: 'Natsu Dragneel',
      series: 'Fairy Tail',
      rarity: 'R',
      owned: 4,
      spare: 3,
      recycleValue: 4,
      referenceMedian: 15,
      lowestFixed: 9,
      highestFixed: 14,
      sales7d: 38,
      verdict: 'VENDRE',
      verdictReason: 'Médiane 20 offres appliquée face à la baisse rapide',
      pinned: false,
      prices: { recommended: 9, undercut: 8, median: 10, minSafe: 7 },
      fees: { sellerTax: 1, depositFee: 1, netProceeds: 7, netGainOverRecycle: 3 },
      pedagogy: {
        decision: 'VENDRE',
        title: 'Natsu Dragneel (Rare)',
        why: 'Prix en forte baisse. La stratégie Médiane 20 offres évite de sur-tarifer la carte.',
        delayEstimate: '12h - 24h',
        gainAnalysis: '+7 ◆ net (+3 ◆ vs recyclage)',
        competition: '8 offres actives',
        isCrash: true,
        crashDiscountPct: 35
      }
    },
    {
      characterId: 104,
      name: 'Ichigo Kurosaki',
      series: 'Bleach',
      rarity: 'C',
      owned: 6,
      spare: 5,
      recycleValue: 2,
      referenceMedian: 3,
      lowestFixed: 3,
      highestFixed: 4,
      sales7d: 4,
      verdict: 'RECYCLER',
      verdictReason: 'Prix plancher sans marge nette, recyclage instantané recommandé',
      pinned: false,
      prices: { recommended: 3, undercut: 2, median: 3, minSafe: 2 },
      fees: { sellerTax: 1, depositFee: 1, netProceeds: 2, netGainOverRecycle: 0 },
      pedagogy: {
        decision: 'RECYCLER',
        title: 'Ichigo Kurosaki (Commune)',
        why: 'Marché saturé au prix plancher. La vente bloquerait un emplacement pour 0 gain net.',
        delayEstimate: 'Instantané',
        gainAnalysis: '+2 ◆ par copie',
        competition: 'Plus de 20 offres à 3 ◆'
      }
    },
    {
      characterId: 105,
      name: 'Goku Black',
      series: 'Dragon Ball',
      rarity: 'L',
      owned: 2,
      spare: 1,
      recycleValue: 15,
      referenceMedian: 95,
      lowestFixed: 95,
      highestFixed: 120,
      sales7d: 8,
      verdict: 'PROTÉGÉ',
      verdictReason: 'Carte verrouillée par l\\'utilisateur',
      pinned: true
    }
  ],
  deals: [
    {
      listingId: 'deal-1',
      characterId: 201,
      name: 'Gojo Satoru',
      series: 'Jujutsu Kaisen',
      rarity: 'L',
      buyPrice: 45,
      refMedian: 78,
      targetResalePrice: 75,
      flipProfit: 25,
      roiPct: 55,
      isGoodFlip: true,
      isMissing: false,
      discountPct: 42,
      sales7d: 18
    },
    {
      listingId: 'deal-2',
      characterId: 202,
      name: 'Tanjiro Kamado',
      series: 'Demon Slayer',
      rarity: 'R',
      buyPrice: 12,
      refMedian: 22,
      targetResalePrice: 21,
      flipProfit: 7,
      roiPct: 58,
      isGoodFlip: true,
      isMissing: true,
      discountPct: 45,
      sales7d: 34
    },
    {
      listingId: 'deal-3',
      characterId: 203,
      name: 'Mikasa Ackerman',
      series: 'Attack on Titan',
      rarity: 'E',
      buyPrice: 20,
      refMedian: 35,
      targetResalePrice: 33,
      flipProfit: 10,
      roiPct: 50,
      isGoodFlip: true,
      isMissing: false,
      discountPct: 43,
      sales7d: 12
    }
  ],
  trades: [
    {
      listingId: 'tr-1',
      wanted: { characterId: 301, name: 'Saitama', rarity: 'E', median7d: 35 },
      offered: { characterId: 302, name: 'Genos', rarity: 'L', median7d: 55, isMissing: false },
      profit: 20,
      roiPct: 57
    }
  ],
  wishlistSuggestions: [
    { characterId: 401, name: 'Rukia Kuchiki', series: 'Bleach', rarity: 'E', completionPct: 91, refMedian: 24 },
    { characterId: 402, name: 'Erza Scarlet', series: 'Fairy Tail', rarity: 'L', completionPct: 88, refMedian: 60 }
  ],
  boosters: {
    recommendedNew: {
      packId: 'p-mecha',
      name: 'Pack Mecha',
      series: 'Multi',
      totalPool: 48,
      totalMissing: 14,
      completionPct: 62,
      probAtLeastOneNewPct: 88,
      expectedNewCards: 1.4,
      expectedChakraValue: 18,
      canOpenNow: true,
      openableFreeCount: 7
    },
    recommendedEv: {
      packId: 'p-shonen',
      name: 'Pack Shonen Legends',
      series: 'Multi',
      totalPool: 64,
      totalMissing: 5,
      completionPct: 85,
      probAtLeastOneNewPct: 35,
      expectedNewCards: 0.4,
      expectedChakraValue: 28,
      canOpenNow: true,
      openableFreeCount: 7
    },
    recommendedPity: {
      name: 'Pack Shonen Legends'
    },
    isPityNear: true,
    all: [
      {
        packId: 'p-mecha',
        name: 'Pack Mecha',
        series: 'Mecha',
        totalPool: 48,
        totalMissing: 14,
        completionPct: 62,
        probAtLeastOneNewPct: 88,
        expectedNewCards: 1.4,
        expectedChakraValue: 18,
        canOpenNow: true,
        openableFreeCount: 7
      },
      {
        packId: 'p-shonen',
        name: 'Pack Shonen Legends',
        series: 'Shonen',
        totalPool: 64,
        totalMissing: 5,
        completionPct: 85,
        probAtLeastOneNewPct: 35,
        expectedNewCards: 0.4,
        expectedChakraValue: 28,
        canOpenNow: true,
        openableFreeCount: 7
      }
    ]
  }
};

window.mockSettings = {
  masterEnabled: true,
  autoSellEnabled: true,
  autoSellStrategy: 'recent20_median',
  autoSellMinNetOverRecycle: 2,
  autoSellDurationHours: 12,
  autoSellMedianFloorPct: 70,
  autoSellMaxListings: 10,
  autoSellVelocityFirst: true,
  autoSellCrashProtection: true,
  autoSellTurboLiquidity: true,
  autoSellTurboMaxNetProfit: 4,
  autoSellExpireHours: 12,
  wishlistAutoBuyEnabled: false,
  speculateHoldSurging: true,
  autoRecycleEnabled: true,
  autoRecycleRarities: ['C', 'U'],
  autoRecycleKeepCopies: 1,
  autoBoosterEnabled: true,
  autoBoosterStrategy: 'new',
  autoBoosterReserveFree: 0,
  autoMarketEnabled: false,
  autoMarketMinMarginPct: 20,
  autoMarketMinProfit: 5,
  autoMarketReserveChakra: 200,
  autoClaimMissionsEnabled: true,
  antiAfkEnabled: true,
  refreshIntervalMinutes: 5,
  notificationsEnabled: true,
  soundEnabled: false,
  dryRun: false,
  language: 'fr'
};

window.mockStats = {
  chakraFromSales: 1140,
  chakraFromRecycle: 360,
  cardsSold: 28,
  cardsRecycled: 142,
  boostersOpenedCount: 45,
  mythicsPulledCount: 2,
  legendariesPulledCount: 7
};

window.mockJournal = [
  { type: 'sell', message: 'Mise en vente : Lelouch Lamperouge à 42 ◆ (Médiane 20)', ts: Date.now() - 1000 * 60 * 3 },
  { type: 'recycle', message: 'Turbo Liquidité : 5 cartes communes recyclées (+10 ◆)', ts: Date.now() - 1000 * 60 * 15 },
  { type: 'booster', message: 'Booster Pack Mecha ouvert en live : Zero Two (Épique !)', ts: Date.now() - 1000 * 60 * 42 },
  { type: 'market', message: 'Opportunité saisie : Gojo Satoru à 45 ◆ (-42% sous la cote)', ts: Date.now() - 1000 * 60 * 75 },
  { type: 'afk', message: 'Anti-AFK : Présence confirmée automatiquement', ts: Date.now() - 1000 * 60 * 120 }
];

window.mockBestPulls = [
  { characterId: 101, name: 'Zero Two', series: 'Darling in the Franxx', rarity: 'L', pulledAt: Date.now() - 1000 * 60 * 42, marketFloorPrice: 65 },
  { characterId: 105, name: 'Lelouch Lamperouge', series: 'Code Geass', rarity: 'L', pulledAt: Date.now() - 1000 * 60 * 180, marketFloorPrice: 55 }
];

window.mockWishlist = [
  { characterId: 501, name: 'Roronoa Zoro', series: 'One Piece', rarity: 'L', budgetChakra: 60, lowestMarketPrice: 52, bestListingId: 'deal-zoro' },
  { characterId: 502, name: 'Naruto Uzumaki', series: 'Naruto', rarity: 'E', budgetChakra: 20, lowestMarketPrice: 32, bestListingId: 'deal-naruto' }
];

// Mock Chrome Extension API
const storageListeners = new Set();
window.chrome = {
  runtime: {
    lastError: null,
    getManifest: function() {
      return { version: '${version}', side_panel: { default_path: 'sidepanel/index.html' } };
    },
    getURL: function(path) {
      return path;
    },
    sendMessage: function(cmd, callback) {
      callback ||= () => {};
      console.log('[Mock chrome.runtime.sendMessage]', cmd);
      if (cmd.type === 'km:save-settings') {
        Object.assign(window.mockSettings, cmd.settings);
        storageListeners.forEach(fn => fn({ settings: { newValue: window.mockSettings } }, 'local'));
      }
      if (cmd.type === 'km:update-check') {
        storageListeners.forEach(fn => fn({ kmUpdate: { newValue: { status: 'no_update', currentVersion: '${version}' } } }, 'local'));
      }
      if (cmd.type === 'km:cmd:refresh') {
        callback({ ok: true, dashboard: window.mockDashboard });
      } else if (cmd.type === 'km:cmd:run-cycle') {
        callback({ ok: true, summary: { opened: 1, recycledCopies: 3, listed: 2, bought: 0 } });
      } else if (cmd.type === 'km:cmd:sell-now') {
        callback({ ok: true, sellRes: { listedCount: 2 } });
      } else if (cmd.type === 'km:cmd:recycle-now') {
        callback({ ok: true, recRes: { recycledCopies: 4, chakraGained: 10 } });
      } else if (cmd.type === 'km:cmd:open-pack') {
        callback({ ok: true });
      } else if (cmd.type === 'km:cmd:toggle-pin') {
        callback({ ok: true, isPinned: true });
      } else {
        callback({ ok: true });
      }
    }
  },
  tabs: { create: async function() {} },
  storage: {
    local: {
      get: function(keys, callback) {
        const result = {
          kmDashboard: window.mockDashboard,
          kmSettings: window.mockSettings,
          settings: window.mockSettings,
          kmCumulativeStats: window.mockStats,
          kmJournal: window.mockJournal,
          kmBestPulls: window.mockBestPulls,
          kmWishlist: window.mockWishlist,
          kmPinnedCards: [105]
        };
        if (typeof keys === 'string') {
          const ret = {};
          ret[keys] = result[keys];
          if (callback) callback(ret);
          return Promise.resolve(ret);
        }
        if (Array.isArray(keys)) {
          const ret = {};
          keys.forEach(k => { ret[k] = result[k]; });
          if (callback) callback(ret);
          return Promise.resolve(ret);
        }
        if (callback) callback(result);
        return Promise.resolve(result);
      },
      set: function(items, callback) {
        console.log('[Mock chrome.storage.local.set]', items);
        if (callback) callback();
        return Promise.resolve();
      }
    },
    onChanged: {
      addListener: function(fn) { storageListeners.add(fn); },
      removeListener: function(fn) { storageListeners.delete(fn); }
    }
  }
};
</script>
`;

const previewHtml = originalHtml.replace('<head>', '<head>\n' + mockScript);
fs.writeFileSync(path.join(distSidepanel, 'preview.html'), previewHtml, 'utf8');
const standalone = previewHtml
  .replace(/<script type="module"[^>]*src="([^"]+)"[^>]*><\/script>/, (_tag, src) =>
    `<script type="module">${fs.readFileSync(path.join(distSidepanel, src), 'utf8').replace(/<\/script/gi, '<\\/script')}</script>`)
  .replace(/<link[^>]*href="([^"]+\.css)"[^>]*>/, (_tag, src) =>
    `<style>${fs.readFileSync(path.join(distSidepanel, src), 'utf8')}</style>`);
fs.writeFileSync(path.join(distSidepanel, 'preview-standalone.html'), standalone, 'utf8');
console.log('✅ Generated dist/sidepanel/preview.html with full mock data');
