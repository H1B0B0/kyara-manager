import { beforeEach, describe, expect, it, vi } from 'vitest';
import { mockChrome } from './chrome';
import {
  ALL_PLAYABLE_GAMES,
  DAILY_GAMES,
  chooseBestDailyHandIndices,
  chooseBestRaidTeamIndices,
  extractCardIdFromUrl,
  findBlindTestMatch,
  matchBlindTestChoice,
  matchCharacterChoice,
  pickExpeditionNextIndex,
  pickMostLovedWinner,
  pickThreeArcsLineIndex,
  recommendArcadeLot,
  chooseExpeditionTeamIndices,
  decideMainKyaraAction,
  evaluateKyara21,
  evaluateKyaraPokerHand,
  shouldHitKyara21,
  type DailyHandCard
} from '../src/lib/analytics/games-solver';
import { normalizeSettings, type KyaraGameId } from '../src/types/settings';

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

  it('exposes DAILY_GAMES & ALL_PLAYABLE_GAMES and validates all 12 game slugs + all in normalizeSettings', () => {
    const expectedSlugs: KyaraGameId[] = [
      'main-du-jour',
      'raid-du-jour',
      'expedition',
      'trois-arcs',
      'main-kyara',
      'raid',
      'kyara-21',
      'qui-est-ce',
      'serie-express',
      'blind-test',
      'memoire',
      'plus-aime'
    ];

    expect([...DAILY_GAMES]).toEqual(['main-du-jour', 'raid-du-jour']);
    expect(ALL_PLAYABLE_GAMES).toHaveLength(10);
    const combined = new Set<string>([...DAILY_GAMES, ...ALL_PLAYABLE_GAMES]);
    expect(combined.size).toBe(12);
    for (const slug of expectedSlugs) {
      expect(combined.has(slug)).toBe(true);
    }

    for (const target of ['all', ...expectedSlugs] as KyaraGameId[]) {
      expect(normalizeSettings({ autoGamesTargetGame: target }).autoGamesTargetGame).toBe(target);
    }
    expect(normalizeSettings({ autoGamesTargetGame: 'unknown-slug' as any }).autoGamesTargetGame).toBe('all');
  });

  it('chooses top 5 raid cards by power, rarity and series synergy', () => {
    const raidPool = [
      { attack: 20, health: 100, rarity: 'C' as const, series: 'Misc' },
      { attack: 90, health: 500, rarity: 'M' as const, series: 'Jujutsu Kaisen' },
      { attack: 75, health: 400, rarity: 'L' as const, series: 'Jujutsu Kaisen' },
      { attack: 60, health: 300, rarity: 'E' as const, series: 'Jujutsu Kaisen' },
      { attack: 55, health: 250, rarity: 'R' as const, series: 'Jujutsu Kaisen' },
      { attack: 52, health: 200, rarity: 'R' as const, series: 'Jujutsu Kaisen' },
      { attack: 68, health: 300, rarity: 'E' as const, series: 'One Piece' }
    ];
    expect(chooseBestRaidTeamIndices(raidPool)).toEqual([1, 2, 3, 4, 5]);

    const distinctSeriesPool = [
      { attack: 10, health: 100, rarity: 'C' as const, series: 'S1' },
      { attack: 80, health: 400, rarity: 'M' as const, series: 'S2' },
      { attack: 40, health: 200, rarity: 'R' as const, series: 'S3' },
      { attack: 70, health: 350, rarity: 'L' as const, series: 'S4' },
      { attack: 60, health: 300, rarity: 'E' as const, series: 'S5' },
      { attack: 55, health: 250, rarity: 'E' as const, series: 'S6' },
      { attack: 30, health: 150, rarity: 'U' as const, series: 'S7' }
    ];
    expect(chooseBestRaidTeamIndices(distinctSeriesPool)).toEqual([1, 2, 3, 4, 5]);
    expect(chooseBestRaidTeamIndices([])).toEqual([]);
    expect(chooseBestRaidTeamIndices(distinctSeriesPool, 0)).toEqual([]);
  });

  it('matches normalized series clues in findBlindTestMatch and matchBlindTestChoice', () => {
    const choices = ['Bleach', 'Démon Slayer', 'One Piece', 'Jujutsu Kaisen'];

    expect(findBlindTestMatch('  DeMoN   SLAYER  ', choices)).toEqual({ index: 1, confident: true });
    expect(matchBlindTestChoice('  DeMoN   SLAYER  ', choices)).toBe(1);

    expect(findBlindTestMatch('Opening 1 — Jujutsu Kaisen (Arc Shibuya)', choices)).toEqual({
      index: 3,
      confident: true
    });
    expect(findBlindTestMatch('Theme de Gojo Satoru', choices, catalog)).toEqual({
      index: 3,
      confident: true
    });
    expect(findBlindTestMatch('Piste inconnue sans indice', choices, catalog)).toEqual({
      index: 0,
      confident: false
    });
    expect(findBlindTestMatch('Bleach', [])).toEqual({ index: -1, confident: false });
  });

  it('picks optimal open arc in pickThreeArcsLineIndex and highest-priority node in pickExpeditionNextIndex', () => {
    expect(
      pickThreeArcsLineIndex([
        { myPower: 100, oppPower: 40, openSlots: 2 },
        { myPower: 40, oppPower: 50, openSlots: 2 },
        { myPower: 10, oppPower: 70, openSlots: 3 }
      ])
    ).toBe(1);

    expect(
      pickThreeArcsLineIndex([
        { myPower: 90, oppPower: 40, openSlots: 1 },
        { myPower: 55, oppPower: 45, openSlots: 1 },
        { myPower: 10, oppPower: 90, openSlots: 2 }
      ])
    ).toBe(1);

    expect(
      pickThreeArcsLineIndex([
        { myPower: 40, oppPower: 50, openSlots: 0 },
        { myPower: 20, oppPower: 60, openSlots: 1 }
      ])
    ).toBe(1);
    expect(pickThreeArcsLineIndex([{ myPower: 10, oppPower: 20, openSlots: 0 }])).toBe(-1);

    expect(
      pickExpeditionNextIndex([
        { label: 'Boss Final', selectable: true },
        { label: 'Combat', selectable: true },
        { label: 'Boutique mystère', selectable: true },
        { label: 'Sanctuaire de soin', selectable: true },
        { label: 'Trésor caché', selectable: true }
      ])
    ).toBe(4);

    expect(
      pickExpeditionNextIndex([
        { label: 'Coffre légendaire', selectable: false },
        { label: 'Combat Elite', selectable: true },
        { label: 'Camp de repos', selectable: true }
      ])
    ).toBe(2);

    expect(
      pickExpeditionNextIndex([
        { label: 'Combat Elite', selectable: true },
        { label: 'Combat standard', selectable: true }
      ])
    ).toBe(1);
    expect(pickExpeditionNextIndex([])).toBe(-1);
  });
});

describe('Kyara solver exact specs', () => {
  const c = (series: string, family: string, rarity: any, pow?: number) => ({ name: series + family + rarity, series, family, rarity, pow });

  it('evaluates pair with pow bonus only on scoring cards', () => {
    const r = evaluateKyaraPokerHand([c('A', 'f1', 'C', 100), c('A', 'f2', 'E', 50), c('B', 'f3', 'L', 999), c('D', 'f4', 'M', 999), c('E', 'f5', 'R', 999)]);
    expect(r.kind).toBe('pair');
    expect(r.scoringIndices).toEqual([0, 1]);
    expect(r.points).toBe((10 + 10 + 5) * 2);
  });

  it('evaluates flush and straight flush', () => {
    const flush = evaluateKyaraPokerHand([c('A', 'f', 'C', 10), c('B', 'f', 'C', 10), c('D', 'f', 'U', 10), c('E', 'f', 'R', 10), c('F', 'f', 'L', 10)]);
    expect(flush.kind).toBe('flush');
    expect(flush.points).toBe((45 + 5) * 5);
    const sf = evaluateKyaraPokerHand([c('A', 'f', 'C', 10), c('B', 'f', 'U', 10), c('D', 'f', 'R', 10), c('E', 'f', 'E', 10), c('F', 'f', 'L', 10)]);
    expect(sf.kind).toBe('sflush');
    expect(sf.points).toBe((100 + 5) * 8);
  });

  it('decides discard with 4 same family and play on flush', () => {
    const hand = [c('A', 'f', 'C'), c('B', 'f', 'U'), c('D', 'f', 'R'), c('E', 'f', 'C'), c('F', 'g', 'C'), c('G', 'h', 'U'), c('H', 'i', 'R'), c('I', 'j', 'E')];
    const d = decideMainKyaraAction(hand, { handsLeft: 4, discardsLeft: 3, score: 0 });
    expect(d.action).toBe('discard');
    expect([0, 1, 2, 3].some((i) => d.indices.includes(i))).toBe(false);
    const flush = decideMainKyaraAction([c('A', 'f', 'C'), c('B', 'f', 'C'), c('D', 'f', 'U'), c('E', 'f', 'R'), c('F', 'f', 'L')], { handsLeft: 4, discardsLeft: 3, score: 0 });
    expect(flush.action).toBe('play');
    expect(flush.expectedKind).toBe('flush');
  });

  it('plays Kyara 21 basic strategy with soft ace handling', () => {
    expect(evaluateKyara21([10, 6], 10)).toBe('hit');
    expect(evaluateKyara21([10, 7], 10)).toBe('stand');
    expect(evaluateKyara21([11, 6], 10)).toBe('hit');
    expect(evaluateKyara21([11, 6, 10], 10)).toBe('stand');
  });

  it('chooses exactly 5 expedition cards within budget', () => {
    const cards = ['M', 'L', 'E', 'R', 'U', 'C', 'C', 'U'].map((rarity: any, i) => ({ rarity, attack: 10 + i, health: 100, series: i % 2 ? 'A' : 'B' }));
    const idx = chooseExpeditionTeamIndices(cards, 14);
    expect(idx).toHaveLength(5);
    expect(new Set(idx).size).toBe(5);
    const cost: Record<string, number> = { C: 1, U: 2, R: 3, E: 5, L: 8, M: 12 };
    expect(idx.reduce((s, i) => s + cost[cards[i].rarity], 0)).toBeLessThanOrEqual(14);
  });
});
