import { describe, expect, it, vi } from 'vitest';
import { normalizeSettings, mergeSettings, DEFAULT_SETTINGS } from '../src/types/settings';
import { evaluateDuplicate } from '../src/lib/analytics/duplicates';

describe('settings migrations', () => {
  it.each([
    ['autoBoosterEnabled', 'autoOpenEnabled'],
    ['autoClaimMissionsEnabled', 'autoClaimMissions'],
    ['autoMarketEnabled', 'autoBuyFlipEnabled']
  ])('honors disabled UI switch %s over stale %s', (canonical, legacy) => {
    const settings = normalizeSettings({ [canonical]: false, [legacy]: true });
    expect(settings[canonical]).toBe(false);
    expect(settings[legacy]).toBe(false);
    expect(mergeSettings(DEFAULT_SETTINGS, { [canonical]: false })[legacy]).toBe(false);
  });
  it('migrates legacy settings and accepts partial updates from either key', () => {
    expect(normalizeSettings({ autoOpenEnabled: false }).autoBoosterEnabled).toBe(false);
    expect(mergeSettings(DEFAULT_SETTINGS, { autoBuyFlipEnabled: true }).autoMarketEnabled).toBe(true);
    expect(mergeSettings(DEFAULT_SETTINGS, { autoMarketReserveChakra: 400 }).autoBuyMinChakraReserve).toBe(400);
  });
  it('requires a 20% surge, not the numeric value of a boolean', () => {
    const result = evaluateDuplicate({ id: 1, rarity: 'L' }, { qty: 3 }, { median7d: 110, median30d: 100, sales7d: 20 });
    expect(result.isSurging).toBe(false);
  });
  it('disables real automation if persisted settings cannot be read', async () => {
    vi.stubGlobal('chrome', { storage: { local: { get: async () => { throw new Error('storage unavailable'); } } } });
    const { loadSettings } = await import('../src/content/state');
    expect(await loadSettings()).toMatchObject({ masterEnabled: false, dryRun: true });
  });
});
