import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { initDevPreviewIfNeeded } from '../src/sidepanel/dev-preview';

describe('dev-preview harness', () => {
  const originalChrome = (globalThis as any).chrome;

  beforeEach(() => {
    delete (globalThis as any).chrome;
  });

  afterEach(() => {
    (globalThis as any).chrome = originalChrome;
  });

  it('installs mock chrome when chrome is undefined', async () => {
    expect((globalThis as any).chrome).toBeUndefined();
    initDevPreviewIfNeeded();
    expect((globalThis as any).chrome).toBeDefined();
    expect((globalThis as any).chrome.storage.local).toBeDefined();

    const stored = await (globalThis as any).chrome.storage.local.get(['kmDashboard', 'settings']);
    expect(stored.kmDashboard).toBeDefined();
    expect(stored.kmDashboard.me.pseudo).toBe('KyaraMaster');
    expect(stored.kmDashboard.me.chakra).toBe(4850);
    expect(stored.kmDashboard.duplicates.length).toBe(8);
    expect(stored.kmDashboard.activeListings.length).toBe(6);
    expect(stored.settings.autoSellMode).toBe('adaptive');
  });

  it('handles runtime.sendMessage interactively', async () => {
    initDevPreviewIfNeeded();
    const chrome = (globalThis as any).chrome;

    const resRefresh = await chrome.runtime.sendMessage({ type: 'km:cmd:refresh' });
    expect(resRefresh.ok).toBe(true);
    expect(resRefresh.dashboard.me.pseudo).toBe('KyaraMaster');

    const resCycle = await chrome.runtime.sendMessage({ type: 'km:cmd:run-cycle' });
    expect(resCycle.ok).toBe(true);
    expect(resCycle.summary.listed).toBe(3);

    const storedJournal = await chrome.storage.local.get('kmJournal');
    expect(storedJournal.kmJournal[0].message).toContain('Lot Vente Rapide');

    const resSell = await chrome.runtime.sendMessage({ type: 'km:sell-duplicates-live' });
    expect(resSell.ok).toBe(true);
    expect(resSell.data.listedCount).toBe(4);
  });

  it('does nothing if native chrome.storage.local already exists', () => {
    const nativeMock = { storage: { local: { get: () => {} } } };
    (globalThis as any).chrome = nativeMock;

    initDevPreviewIfNeeded();
    expect((globalThis as any).chrome).toBe(nativeMock);
  });
});
