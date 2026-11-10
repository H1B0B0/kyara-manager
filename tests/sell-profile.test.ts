import { describe, expect, it } from 'vitest';
import { DEFAULT_SETTINGS, normalizeSettings } from '../src/types/settings';
import { nextRepriceCeiling, resolveSellProfile, resolveSellTier } from '../src/lib/analytics/sell-profile';
import { DEFAULT_RECYCLE_VALUES } from '../src/lib/analytics/constants';
import { evaluateDuplicate } from '../src/lib/analytics/duplicates';

describe('sell profiles', () => {
  it('adaptive mode sells cheap cards fast and expensive cards patiently', () => {
    expect(resolveSellTier(DEFAULT_SETTINGS, 5)).toBe('fast');
    expect(resolveSellTier(DEFAULT_SETTINGS, 30)).toBe('normal');
    expect(resolveSellTier(DEFAULT_SETTINGS, 120)).toBe('patient');
    expect(resolveSellTier(DEFAULT_SETTINGS, null)).toBe('normal');
  });
  it('a forced mode ignores the price', () => {
    for (const mode of ['fast', 'normal', 'patient'] as const) {
      expect(resolveSellTier({ ...DEFAULT_SETTINGS, autoSellMode: mode }, 5)).toBe(mode);
      expect(resolveSellTier({ ...DEFAULT_SETTINGS, autoSellMode: mode }, 500)).toBe(mode);
    }
  });
  it('fast profiles stall faster than patient ones and drop the velocity filter', () => {
    const fast = resolveSellProfile({ ...DEFAULT_SETTINGS, autoSellMode: 'fast' }, 5);
    const patient = resolveSellProfile({ ...DEFAULT_SETTINGS, autoSellMode: 'patient' }, 5);
    expect(fast.staleMinutes).toBeLessThan(patient.staleMinutes);
    expect(fast.velocityFirst).toBe(false);
    expect(fast.strategy).toBe('flash');
    expect(patient.turbo).toBe(false);
  });
  it('normal mode follows the user settings', () => {
    const profile = resolveSellProfile({ ...DEFAULT_SETTINGS, autoSellMode: 'normal', autoSellStrategy: 'quick', autoSellDurationHours: 24 }, 30);
    expect(profile).toMatchObject({ strategy: 'quick', durationHours: 24 });
  });
  it('reprice ceilings always go down by at least 1 ◆', () => {
    expect(nextRepriceCeiling(20, 8)).toBe(18);
    expect(nextRepriceCeiling(5, 8)).toBe(4);
    expect(nextRepriceCeiling(1, 8)).toBe(1);
  });
  it('sanitizes invalid stored sell settings', () => {
    const s = normalizeSettings({ autoSellMode: 'warp' as any, autoSellCheapBelow: -4, autoSellPremiumAbove: 1 });
    expect(s.autoSellMode).toBe('adaptive');
    expect(s.autoSellCheapBelow).toBeGreaterThanOrEqual(2);
    expect(s.autoSellPremiumAbove).toBeGreaterThan(s.autoSellCheapBelow);
  });
});

describe('duplicate evaluation across tiers', () => {
  const evaluate = (rarity: string, median: number, lowest: number, settings: any = {}) =>
    evaluateDuplicate(
      { id: 1, name: 'X', rarity },
      { characterId: 1, qty: 4 },
      { median7d: median, median30d: median, sales7d: 1, lowestFixed: lowest },
      DEFAULT_RECYCLE_VALUES,
      { ...DEFAULT_SETTINGS, ...settings }
    );

  it('does not park a slow cheap card as CONSERVER in fast mode: it sells at the lowest price', () => {
    const slow = evaluate('E', 40, 38, { autoSellMode: 'fast', autoSellTurboLiquidity: false });
    expect(slow.verdict).toBe('VENDRE');
    expect(slow.sellTier).toBe('fast');
    expect(slow.prices?.recommended).toBe(37);
  });
  it('does not strand a recycle verdict on a rarity that auto-recycle ignores', () => {
    const res = evaluate('R', 8, 7, { autoSellMode: 'fast', autoRecycleRarities: ['C'] });
    expect(res.verdict === 'VENDRE' ? res.canAutoSell : res.canAutoRecycle).toBe(true);
  });
  it('patient mode never sits far above the cheapest live offer, nor below 85% of the median', () => {
    const res = evaluate('E', 100, 90, { autoSellMode: 'patient' });
    expect(res.prices?.recommended).toBeLessThanOrEqual(95);
    expect(res.prices?.recommended).toBeGreaterThanOrEqual(85);
    expect(evaluate('E', 100, 60, { autoSellMode: 'patient' }).prices?.recommended).toBe(85);
  });
});
