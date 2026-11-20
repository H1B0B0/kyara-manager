import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mockChrome } from './chrome';
import { DEFAULT_SETTINGS, mergeSettings } from '../src/types/settings';
import { PLAYSTYLE_PRESETS, detectActivePreset } from '../src/lib/presets';
import {
  openCockpitOverlay,
  closeCockpitOverlay,
  toggleCockpitOverlay,
  isCockpitOverlayOpen,
  setupOverlayListeners
} from '../src/content/overlay';
import { buildSettingsBackup, parseSettingsBackup } from '../src/sidepanel/components/tabs/SettingsTab';

function createMockDom() {
  const byId = new Map<string, any>();
  const winListeners: Record<string, Set<(e: any) => void>> = {};
  const makeEl = (tag: string) => {
    const classes = new Set<string>();
    const children: any[] = [];
    const el: any = {
      tagName: tag.toUpperCase(),
      attributes: {} as Record<string, string>,
      children,
      _id: '',
      get id() { return this._id; },
      set id(val: string) {
        if (this._id) byId.delete(this._id);
        this._id = val;
        if (val) byId.set(val, this);
      },
      set className(val: string) {
        classes.clear();
        val.split(/\s+/).filter(Boolean).forEach((c) => classes.add(c));
      },
      get className() { return [...classes].join(' '); },
      classList: {
        add: (...c: string[]) => c.forEach((x) => classes.add(x)),
        remove: (...c: string[]) => c.forEach((x) => classes.delete(x)),
        contains: (c: string) => classes.has(c)
      },
      setAttribute: (k: string, v: string) => { el.attributes[k] = v; },
      appendChild: (child: any) => { children.push(child); return child; },
      addEventListener: () => {},
      remove: () => { if (el._id) byId.delete(el._id); },
      focus: vi.fn()
    };
    return el;
  };
  const body = makeEl('body');
  vi.stubGlobal('document', { body, createElement: makeEl, getElementById: (id: string) => byId.get(id) ?? null });
  vi.stubGlobal('window', {
    addEventListener: (ev: string, fn: (e: any) => void) => { (winListeners[ev] ||= new Set()).add(fn); },
    removeEventListener: (ev: string, fn: (e: any) => void) => { winListeners[ev]?.delete(fn); }
  });
  return {
    body,
    dispatchWin: (ev: string, payload: any) => winListeners[ev]?.forEach((fn) => fn(payload))
  };
}

describe('v2.3.0 ergonomics, presets, overlay & backup', () => {
  beforeEach(() => { mockChrome(); });
  afterEach(() => { vi.unstubAllGlobals(); });

  it('PLAYSTYLE_PRESETS normalize cleanly via mergeSettings and detectActivePreset detects each preset', () => {
    expect(PLAYSTYLE_PRESETS.map((p) => p.id)).toEqual(['farm_chakra', 'rush_renaissance', 'zen_collector']);
    for (const preset of PLAYSTYLE_PRESETS) {
      expect(detectActivePreset(mergeSettings(DEFAULT_SETTINGS, preset.patch))).toBe(preset.id);
    }
    expect(detectActivePreset(mergeSettings(DEFAULT_SETTINGS, { renaissanceFocusEnabled: false, autoSellMode: 'adaptive' }))).toBeNull();
    expect(detectActivePreset(mergeSettings(DEFAULT_SETTINGS, { renaissanceFocusEnabled: true, autoSellMode: 'fast' }))).toBeNull();
    expect(detectActivePreset(mergeSettings(DEFAULT_SETTINGS, { renaissanceFocusEnabled: false, autoSellMode: 'normal' }))).toBeNull();
  });

  it('open/close/toggleCockpitOverlay and Alt+K / Escape shortcuts manage overlay lifecycle', () => {
    const dom = createMockDom();
    expect(isCockpitOverlayOpen()).toBe(false);

    openCockpitOverlay();
    expect(isCockpitOverlayOpen()).toBe(true);
    expect(dom.body.children).toHaveLength(1);
    const overlay = dom.body.children[0];
    expect(overlay.attributes.role).toBe('dialog');
    expect(overlay.children[0].children[0].src).toBe('chrome-extension://test-extension/sidepanel/index.html?mode=overlay');
    expect(overlay.focus).toHaveBeenCalledTimes(1);

    closeCockpitOverlay();
    expect(isCockpitOverlayOpen()).toBe(false);
    expect(overlay.classList.contains('is-hidden')).toBe(true);

    toggleCockpitOverlay();
    expect(isCockpitOverlayOpen()).toBe(true);
    expect(dom.body.children).toHaveLength(1);

    const dispose = setupOverlayListeners();
    const prevent = vi.fn();
    dom.dispatchWin('keydown', { key: 'Escape', preventDefault: prevent });
    expect(isCockpitOverlayOpen()).toBe(false);
    expect(prevent).toHaveBeenCalledTimes(1);

    dom.dispatchWin('keydown', { altKey: true, ctrlKey: false, metaKey: false, code: 'KeyK', key: 'k', preventDefault: prevent });
    expect(isCockpitOverlayOpen()).toBe(true);

    dom.dispatchWin('message', { origin: 'https://evil.example', data: { type: 'km:close-overlay' } });
    expect(isCockpitOverlayOpen()).toBe(true);
    dom.dispatchWin('message', { origin: new URL(chrome.runtime.getURL('')).origin, data: { type: 'km:close-overlay' } });
    expect(isCockpitOverlayOpen()).toBe(false);

    dispose();
    expect(document.getElementById('km-cockpit-overlay')).toBeNull();
  });

  it('buildSettingsBackup and parseSettingsBackup validate and normalize JSON config backups', () => {
    const backup = buildSettingsBackup(
      { ...DEFAULT_SETTINGS, renaissanceFocusEnabled: true, buyOrderDiscountPct: 35 },
      [{ characterId: 101, name: 'Gojo', series: 'JJK', rarity: 'L', budgetChakra: 80, lowestMarketPrice: null, bestListingId: null, addedAt: 1000 }],
      [101, 202]
    );
    expect(backup.version).toBe('2.3.0');
    expect(backup.settings.renaissanceFocusEnabled).toBe(true);

    const parsed = parseSettingsBackup({
      ...backup,
      settings: { autoOpenEnabled: false, buyOrderDiscountPct: 99 },
      wishlist: [...(backup.wishlist || []), { bad: true }],
      pinnedCards: [101, -5, '202', 101]
    });
    expect(parsed.settings.buyOrderDiscountPct).toBe(60);
    expect(parsed.settings.autoBoosterEnabled).toBe(false);
    expect(parsed.wishlist).toHaveLength(1);
    expect(parsed.pinnedCards).toEqual([101, 202]);

    expect(() => parseSettingsBackup(null)).toThrow();
    expect(() => parseSettingsBackup([])).toThrow();
    expect(() => parseSettingsBackup({ version: '2.3.0' })).toThrow();
  });
});
