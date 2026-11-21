import { beforeEach, describe, expect, it, vi } from 'vitest';
import { mockChrome } from './chrome';
import {
  chooseBestDailyHandIndices,
  extractCardIdFromUrl,
  matchCharacterChoice,
  pickMostLovedWinner,
  recommendArcadeLot,
  shouldHitKyara21,
  type DailyHandCard
} from '../src/lib/analytics/games-solver';

const mocks = vi.hoisted(() => ({
  api: vi.fn(),
  catalog: vi.fn(),
  journal: vi.fn(),
  navigate: vi.fn()
}));

vi.mock('../src/content/api', () => ({ kyaraApi: mocks.api }));
vi.mock('../src/content/cache', () => ({
  ensureCatalog: mocks.catalog,
  runtimeCache: { catalogById: new Map() }
}));
vi.mock('../src/content/journal', () => ({ appendJournal: mocks.journal }));
vi.mock('../src/content/safety', () => ({ isInterrupted: () => false }));
vi.mock('../src/content/automation/spa-navigator', () => ({ navigateSpaTo: mocks.navigate }));

describe('games solver & room farmer', () => {
  const catalog = new Map<number, any>([
    [101, { id: 101, name: 'Gojo Satoru', series: 'Jujutsu Kaisen', rarity: 'L', rank: 4 }],
    [102, { id: 102, name: 'Random Villager', series: 'Test Series', rarity: 'C', rank: 980 }],
    [103, { id: 103, name: 'Megumi Fushiguro', series: 'Jujutsu Kaisen', rarity: 'E', rank: 22 }]
  ]);

  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    mocks.catalog.mockResolvedValue(catalog);
    mocks.navigate.mockResolvedValue(true);
  });

  it('extracts card ids from Kyara CDN image urls', () => {
    expect(extractCardIdFromUrl('https://cdn.kyara.games/cards/sm/1042.webp?v=2')).toBe(1042);
    expect(extractCardIdFromUrl('https://cdn.kyara.games/cards/42.png')).toBe(42);
    expect(extractCardIdFromUrl('https://cdn.kyara.games/logo.svg')).toBeNull();
    expect(extractCardIdFromUrl(null)).toBeNull();
  });

  it('picks lowest popularity rank in Plus Aime duels', () => {
    const res = pickMostLovedWinner([102, 101], ['Random Villager', 'Gojo Satoru'], catalog);
    expect(res.winnerIndex).toBe(1);
    expect(res.ranks).toEqual([980, 4]);

    const byNameOnly = pickMostLovedWinner([null, null], ['Gojo Satoru', 'Random Villager'], catalog);
    expect(byNameOnly.winnerIndex).toBe(0);
  });

  it('matches character names and series for Qui est-ce and Serie Express', () => {
    expect(
      matchCharacterChoice([103], ['Naruto Uzumaki', 'Megumi Fushiguro', 'Luffy', 'Ichigo'], catalog, 'character')
    ).toBe(1);
    expect(
      matchCharacterChoice([101, 103], ['Bleach', 'One Piece', 'Jujutsu Kaisen', 'Naruto'], catalog, 'series')
    ).toBe(2);
  });

  it('chooses highest-scoring Daily Hand combination over weak singletons', () => {
    const hand: DailyHandCard[] = [
      { name: 'Gojo', series: 'Jujutsu Kaisen', family: 'Action', rarity: 'R' },
      { name: 'Yuji', series: 'Jujutsu Kaisen', family: 'Action', rarity: 'R' },
      { name: 'Megumi', series: 'Jujutsu Kaisen', family: 'Action', rarity: 'R' },
      { name: 'Nobara', series: 'Jujutsu Kaisen', family: 'Action', rarity: 'R' },
      { name: 'Yuta', series: 'Jujutsu Kaisen', family: 'Action', rarity: 'R' },
      { name: 'Random', series: 'Other', family: 'Slice', rarity: 'U' },
      { name: 'Solo', series: 'Misc', family: 'Drama', rarity: 'C' }
    ];
    const picked = chooseBestDailyHandIndices(hand);
    expect(picked).toEqual([0, 1, 2, 3, 4]);
  });

  it('evaluates Kyara 21 hit/stand thresholds and recommends best Arcade lot', () => {
    expect(shouldHitKyara21(14, 0)).toBe(true);
    expect(shouldHitKyara21(17, 1)).toBe(true);
    expect(shouldHitKyara21(17, 0)).toBe(false);
    expect(shouldHitKyara21(19, 1)).toBe(false);

    const lots = [
      { id: 'boosters-5', label: '+5 boosters bonus', price: 30 },
      { id: 'legendaire', label: 'Lot de la salle', price: 200 },
      { id: 'sceau-mythique', label: 'Sceau mythique', price: 1000 }
    ];
    expect(recommendArcadeLot(250, lots)?.id).toBe('legendaire');
    expect(recommendArcadeLot(45, lots)?.id).toBe('boosters-5');
    expect(recommendArcadeLot(10, lots)?.id).toBe('legendaire');
  });

  it('respects dryRun, discord guest gate, and daily ticket cap in executeAutoGames', async () => {
    mockChrome({ settings: { dryRun: true, autoGamesEnabled: true, autoGamesTargetGame: 'plus-aime' } });
    mocks.api.mockImplementation(async (path) => {
      if (path === '/play/arcade') {
        return { enabled: true, blocked: null, balance: 80, today: 12, dayCap: 60, week: 90, weekCap: 300, lots: [] };
      }
      return null;
    });
    const { executeAutoGames } = await import('../src/content/automation/games');
    const simRes = await executeAutoGames({ me: { id: 1 } }, { manual: true });
    expect(simRes.playedGames).toBe(0);
    expect(mocks.navigate).not.toHaveBeenCalled();
    expect(mocks.journal).toHaveBeenCalledWith('info', expect.stringContaining('[SIMULATION]'));

    mockChrome({ settings: { dryRun: false, autoGamesEnabled: true } });
    mocks.api.mockResolvedValue({ enabled: true, blocked: 'guest', balance: 0, today: 0, dayCap: 60, week: 0, weekCap: 300 });
    const blockedRes = await executeAutoGames({ me: { id: 1 } }, { manual: true });
    expect(blockedRes.blocked).toBe('guest');
    expect(mocks.navigate).not.toHaveBeenCalled();

    mocks.api.mockResolvedValue({ enabled: true, blocked: null, balance: 120, today: 60, dayCap: 60, week: 120, weekCap: 300 });
    const cappedRes = await executeAutoGames({ me: { id: 1 } }, { manual: false });
    expect(cappedRes.playedGames).toBe(0);
  });
});
