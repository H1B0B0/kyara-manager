import { beforeEach, describe, expect, it, vi } from 'vitest';
import { mockChrome } from './chrome';
import { DEFAULT_SETTINGS } from '../src/types/settings';
import { evaluateDuplicate } from '../src/lib/analytics/duplicates';
import { computeRecyclableCopies, computeSpareCopies } from '../src/lib/analytics/fees';
import { buildCardLedger } from '../src/content/safety';
import { resolveSellProfile } from '../src/lib/analytics/sell-profile';
import { state } from '../src/content/state';

const mocks = vi.hoisted(() => ({
  api: vi.fn(),
  journal: vi.fn(),
  metric: vi.fn()
}));

vi.mock('../src/content/api', () => ({
  kyaraApi: mocks.api
}));

vi.mock('../src/content/journal', () => ({
  appendJournal: mocks.journal,
  recordCumulativeMetric: mocks.metric
}));

describe('v2.0.0 market triage & auto-recycle engine', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    mockChrome();
    state.currentSettings = { ...DEFAULT_SETTINGS };
  });

  describe('evaluateDuplicate unpriced bulk cards (C, U, R)', () => {
    const emptyMarketStats = {
      median7d: null,
      median30d: null,
      lowestFixed: null,
      sales7d: 0
    };

    it('marks unpriced C/U/R duplicates as RECYCLER with canAutoRecycle: true', () => {
      const resC = evaluateDuplicate(
        { id: 101, name: 'Gobelin Inconnu', rarity: 'C' },
        { characterId: 101, qty: 3, locked: 0 },
        emptyMarketStats
      );
      expect(resC.verdict).toBe('RECYCLER');
      expect(resC.canAutoRecycle).toBe(true);
      expect(resC.canAutoSell).toBe(false);
      expect(resC.verdictReason).toContain('Aucune demande marché');

      const resU = evaluateDuplicate(
        { id: 102, name: 'Loup Inconnu', rarity: 'U' },
        { characterId: 102, qty: 2, locked: 0 },
        emptyMarketStats
      );
      expect(resU.verdict).toBe('RECYCLER');
      expect(resU.canAutoRecycle).toBe(true);
      expect(resU.canAutoSell).toBe(false);

      const resR = evaluateDuplicate(
        { id: 103, name: 'Golem Inconnu', rarity: 'R' },
        { characterId: 103, qty: 2, locked: 0 },
        emptyMarketStats
      );
      expect(resR.verdict).toBe('RECYCLER');
      expect(resR.canAutoRecycle).toBe(true);
      expect(resR.canAutoSell).toBe(false);
    });

    it('keeps high-tier unpriced cards (E, L, M) as CONSERVER', () => {
      const resE = evaluateDuplicate(
        { id: 104, name: 'Dragon Épique', rarity: 'E' },
        { characterId: 104, qty: 2, locked: 0 },
        emptyMarketStats
      );
      expect(resE.verdict).toBe('CONSERVER');
      expect(resE.canAutoRecycle).toBe(false);

      const resL = evaluateDuplicate(
        { id: 105, name: 'Seigneur Légendaire', rarity: 'L' },
        { characterId: 105, qty: 2, locked: 0 },
        emptyMarketStats
      );
      expect(resL.verdict).toBe('CONSERVER');
      expect(resL.canAutoRecycle).toBe(false);
    });

    it('keeps unpriced cards as CONSERVER if their rarity is excluded from autoRecycleRarities', () => {
      const resR = evaluateDuplicate(
        { id: 103, name: 'Golem Inconnu', rarity: 'R' },
        { characterId: 103, qty: 2, locked: 0 },
        emptyMarketStats,
        undefined,
        { ...DEFAULT_SETTINGS, autoRecycleRarities: ['C', 'U'] }
      );
      expect(resR.verdict).toBe('CONSERVER');
      expect(resR.canAutoRecycle).toBe(false);
    });
  });

  describe('computeRecyclableCopies and buildCardLedger resale isolation', () => {
    it('allows recycling copies on resale cooldown or listable: 0 while blocking market listing', () => {
      const cooldownEntry = {
        characterId: 201,
        qty: 4,
        locked: 0,
        resaleLocked: true
      };

      expect(computeSpareCopies(cooldownEntry, 0)).toBe(0);
      expect(computeRecyclableCopies(cooldownEntry, 0)).toBe(3);

      const listableZeroEntry = {
        characterId: 202,
        qty: 3,
        locked: 0,
        listable: 0
      };

      expect(computeSpareCopies(listableZeroEntry, 0)).toBe(0);
      expect(computeRecyclableCopies(listableZeroEntry, 0)).toBe(2);

      const book = buildCardLedger([cooldownEntry, listableZeroEntry], [], []);
      const avail201 = book.get(201);
      expect(avail201.spare).toBe(0);
      expect(avail201.recyclable).toBe(3);
      expect(book.reserve(201, 1, 'list')).toBe(false);
      expect(book.reserve(201, 2, 'recycle')).toBe(true);
      expect(book.get(201).recyclable).toBe(1);

      const avail202 = book.get(202);
      expect(avail202.spare).toBe(0);
      expect(avail202.recyclable).toBe(2);
      expect(book.reserve(202, 1, 'list')).toBe(false);
      expect(book.reserve(202, 1, 'recycle')).toBe(true);
      expect(book.get(202).recyclable).toBe(1);
    });
  });

  describe('executeAutoRecycle with live market triage', () => {
    it('recycles unpriced bulk C/U/R cards and queries live triage', async () => {
      const { executeAutoRecycle } = await import('../src/content/automation/auto-recycle');

      mocks.api.mockImplementation(async (path: string, options: any = {}) => {
        if (options.method === 'POST' && path.includes('/recycle')) {
          const qty = Number(options.body?.qty) || 1;
          const val = path.includes('301') ? 1 : 2;
          return { gained: qty * val };
        }
        if (path.startsWith('/market/listings?')) return { items: [] };
        if (path.startsWith('/market/buy-orders')) return [];
        if (path.startsWith('/market/prices')) return { median7d: null, lowestFixed: null };
        return [];
      });

      const book = buildCardLedger(
        [
          { characterId: 301, qty: 3, locked: 0 },
          { characterId: 302, qty: 2, locked: 0 }
        ],
        [],
        []
      );

      const rawDuplicates = [
        {
          characterId: 301,
          name: 'Bulk Common',
          rarity: 'C',
          spare: 2,
          recyclableSpare: 2,
          recycleValue: 1,
          referenceMedian: null,
          lowestFixed: null,
          verdict: 'CONSERVER', // will be triaged to RECYCLER
          canAutoRecycle: false
        },
        {
          characterId: 302,
          name: 'Bulk Uncommon',
          rarity: 'U',
          spare: 1,
          recyclableSpare: 1,
          recycleValue: 2,
          referenceMedian: null,
          lowestFixed: null,
          verdict: 'CONSERVER', // will be triaged to RECYCLER
          canAutoRecycle: false
        }
      ];

      state.currentSettings = {
        ...DEFAULT_SETTINGS,
        autoRecycleEnabled: true,
        autoRecycleRarities: ['C', 'U', 'R'],
        dryRun: false
      };

      const res = await executeAutoRecycle({ duplicates: rawDuplicates }, book);

      expect(res.recycledCards).toBe(2);
      expect(res.recycledCopies).toBe(3);
      expect(res.chakraGained).toBe(4); // 2 * 1 + 1 * 2 = 4
      expect(mocks.api).toHaveBeenCalledWith(
        '/me/collection/301/recycle',
        expect.objectContaining({ method: 'POST', body: { qty: 2 } })
      );
      expect(mocks.api).toHaveBeenCalledWith(
        '/me/collection/302/recycle',
        expect.objectContaining({ method: 'POST', body: { qty: 1 } })
      );
    });
  });

  describe('retireStaleListings v2.0.0 triggers', () => {
    it('cancels active listing when undercut on live market after 15 minutes', async () => {
      const { retireStaleListings, loadRepriceHints } = await import('../src/content/automation/reprice');

      mocks.api.mockImplementation(async (path: string, options: any = {}) => {
        if (options.method === 'POST' && path.includes('/cancel')) return { ok: true };
        if (path.startsWith('/market/listings?characterId=401')) {
          // Live market has an undercut listing at 18
          return { items: [{ price: 18 }, { price: 20 }] };
        }
        if (path.startsWith('/market/prices/401')) return { median7d: 22, sales7d: 10 };
        return { items: [] };
      });

      const fifteenMinAgo = new Date(Date.now() - 16 * 60 * 1000).toISOString();
      const listing = {
        id: 'list-401',
        status: 'active',
        characterId: 401,
        character: { id: 401, rarity: 'R' },
        price: 20,
        createdAt: fifteenMinAgo
      };

      const book = buildCardLedger([{ characterId: 401, qty: 2 }], [listing], []);
      const dup = {
        characterId: 401,
        name: 'Undercut Card',
        rarity: 'R',
        spare: 0,
        canAutoSell: false,
        sellProfile: resolveSellProfile({ ...DEFAULT_SETTINGS, autoSellMode: 'normal' }, 22),
        prices: { minSafe: 10 }
      };

      const hints = new Map();
      const res = await retireStaleListings({
        book,
        duplicates: [dup],
        hints,
        settings: { ...DEFAULT_SETTINGS, autoSellMode: 'normal' }
      });

      expect(res.cancelled).toBe(1);
      expect(mocks.api).toHaveBeenCalledWith(
        '/market/listings/list-401/cancel',
        expect.objectContaining({ method: 'POST', priority: 'high' })
      );

      const savedHints = await loadRepriceHints();
      const hint = savedHints.get(401);
      expect(hint).toBeDefined();
      // Undercut live lowest was 18, so ceiling must be liveLowest - 1 = 17
      expect(hint?.ceiling).toBe(17);
    });

    it('evicts a floor-locked listing after 2 * staleMinutes when slots are full or other cards wait', async () => {
      const { retireStaleListings, loadRepriceHints } = await import('../src/content/automation/reprice');

      mocks.api.mockImplementation(async (path: string, options: any = {}) => {
        if (options.method === 'POST' && path.includes('/cancel')) return { ok: true };
        if (path.startsWith('/market/listings?')) return { items: [{ price: 13 }] };
        return [];
      });

      // Fast mode staleMinutes = 20. 2 * staleMinutes = 40 minutes.
      // 1) Test at 25 minutes (between 20 and 40): should NOT be cancelled
      const twentyFiveMinAgo = new Date(Date.now() - 25 * 60 * 1000).toISOString();
      const listing1 = {
        id: 'list-floor-1',
        status: 'active',
        characterId: 501,
        character: { id: 501, rarity: 'R' },
        price: 13,
        createdAt: twentyFiveMinAgo
      };

      const book1 = buildCardLedger([{ characterId: 501, qty: 2 }], [listing1], []);
      const dup1 = {
        characterId: 501,
        name: 'Floor Locked Card',
        rarity: 'R',
        spare: 0,
        canAutoSell: false,
        sellProfile: resolveSellProfile({ ...DEFAULT_SETTINGS, autoSellMode: 'fast' }, 13),
        prices: { minSafe: 13 }
      };

      const waitingCard = {
        characterId: 502,
        name: 'Waiting Card',
        rarity: 'R',
        spare: 2,
        canAutoSell: true
      };

      const res1 = await retireStaleListings({
        book: book1,
        duplicates: [dup1, waitingCard],
        hints: new Map(),
        settings: { ...DEFAULT_SETTINGS, autoSellMode: 'fast', autoRecycleEnabled: false }
      });
      expect(res1.cancelled).toBe(0);

      // 2) Test at 45 minutes (> 40 min = 2 * 20m): should be cancelled & evicted
      const fortyFiveMinAgo = new Date(Date.now() - 45 * 60 * 1000).toISOString();
      const listing2 = {
        id: 'list-floor-2',
        status: 'active',
        characterId: 501,
        character: { id: 501, rarity: 'R' },
        price: 13,
        createdAt: fortyFiveMinAgo
      };

      const book2 = buildCardLedger([{ characterId: 501, qty: 2 }], [listing2], []);
      const hints2 = new Map();
      const res2 = await retireStaleListings({
        book: book2,
        duplicates: [dup1, waitingCard],
        hints: hints2,
        settings: { ...DEFAULT_SETTINGS, autoSellMode: 'fast', autoRecycleEnabled: false }
      });

      expect(res2.cancelled).toBe(1);
      expect(mocks.api).toHaveBeenCalledWith(
        '/market/listings/list-floor-2/cancel',
        expect.objectContaining({ method: 'POST', priority: 'high' })
      );

      const savedHints2 = await loadRepriceHints();
      const hint = savedHints2.get(501);
      expect(hint).toBeDefined();
      expect(hint?.evictedUntil).toBeGreaterThan(Date.now());
    });
  });
});
