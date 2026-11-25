import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mockChrome } from './chrome';
import { DEFAULT_SETTINGS } from '../src/types/settings';
import { RenaissancePanel } from '../src/sidepanel/components/market/RenaissancePanel';
import type { Rarity, RarityProgress, RenaissanceSummary } from '../src/types/kyara';

function makeSummary(overrides: Partial<Record<Rarity, Partial<RarityProgress>>> = {}): RenaissanceSummary {
  const defaults: Record<Rarity, RarityProgress> = {
    C: { rarity: 'C', owned: 1000, total: 1600, missing: 600, target: 1500, remainingForTarget: 500, pct: 62.5, targetPct: 66.7, estimatedCostChakra: 1500 },
    U: { rarity: 'U', owned: 1400, total: 1600, missing: 200, target: 1500, remainingForTarget: 100, pct: 87.5, targetPct: 93.3, estimatedCostChakra: 300 },
    R: { rarity: 'R', owned: 1432, total: 1600, missing: 168, target: 1500, remainingForTarget: 68, pct: 89.5, targetPct: 95.5, estimatedCostChakra: 408 },
    E: { rarity: 'E', owned: 505, total: 900, missing: 395, target: 550, remainingForTarget: 45, pct: 56.1, targetPct: 91.8, estimatedCostChakra: 810 },
    L: { rarity: 'L', owned: 72, total: 200, missing: 128, target: 80, remainingForTarget: 8, pct: 36, targetPct: 90, estimatedCostChakra: 1040 },
    M: { rarity: 'M', owned: 12, total: 100, missing: 88, target: 12, remainingForTarget: 0, pct: 12, targetPct: 100, estimatedCostChakra: 0 }
  };
  const byRarity = { ...defaults };
  for (const [k, patch] of Object.entries(overrides) as [Rarity, Partial<RarityProgress>][]) {
    byRarity[k] = { ...defaults[k], ...patch };
  }
  return {
    enabled: true,
    focusRarities: ['C', 'U', 'R', 'E'],
    totalOwned: 4337,
    totalTarget: 5050,
    overallPct: 85.9,
    ready: false,
    byRarity,
    priorityRarities: ['C', 'U', 'R', 'E'],
    estimatedRemainingCost: 3018,
    boostersOpened: 500,
    boostersTarget: 1600,
    blockingListingsCount: 0,
    rebirthPayoutChakra: 0,
    estimatedRenown: 0,
    conditionsMet: 1,
    conditionsTotal: 8
  };
}

describe('RenaissancePanel target resolution', () => {
  beforeEach(() => {
    mockChrome();
    vi.stubGlobal('window', {
      innerWidth: 1024,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn()
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('uses base.target in Rebirth 2+ (e.g. L=80 instead of 70, C=1500 instead of 1432) when settings.renaissanceTargets is absent', () => {
    const html = renderToStaticMarkup(
      React.createElement(RenaissancePanel, {
        renaissance: makeSummary(),
        settings: { ...DEFAULT_SETTINGS, renaissanceTargets: undefined },
        onUpdateSettings: vi.fn(),
        onQuickBatchForRarity: vi.fn()
      })
    );

    expect(html).toContain('72/80');
    expect(html).not.toContain('72/70');
    expect(html).toContain('-8');
    expect(html).toContain('1000/1500');
    expect(html).not.toContain('1000/1432');
    expect(html).toContain('12/12');
  });

  it('caps explicit settings.renaissanceTargets to base.total when explicit > total, and respects explicit <= total', () => {
    const htmlCapped = renderToStaticMarkup(
      React.createElement(RenaissancePanel, {
        renaissance: makeSummary({
          L: { owned: 50, total: 60, missing: 10, target: 60, remainingForTarget: 10, targetPct: 83.3 }
        }),
        settings: { ...DEFAULT_SETTINGS, renaissanceTargets: { L: 999 } },
        onUpdateSettings: vi.fn(),
        onQuickBatchForRarity: vi.fn()
      })
    );

    expect(htmlCapped).toContain('50/60');
    expect(htmlCapped).not.toContain('50/999');
    expect(htmlCapped).toContain('-10');

    const htmlExplicit = renderToStaticMarkup(
      React.createElement(RenaissancePanel, {
        renaissance: makeSummary({
          L: { owned: 50, total: 200, missing: 150, target: 80, remainingForTarget: 30, targetPct: 62.5 }
        }),
        settings: { ...DEFAULT_SETTINGS, renaissanceTargets: { L: 55 } },
        onUpdateSettings: vi.fn(),
        onQuickBatchForRarity: vi.fn()
      })
    );

    expect(htmlExplicit).toContain('50/55');
    expect(htmlExplicit).toContain('-5');
  });
});
