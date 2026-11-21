import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import { mockChrome } from './chrome';

describe('update lifecycle', () => {
  beforeEach(() => vi.resetModules());
  afterEach(() => vi.useRealTimers());
  it('waits for active actions and applies automatically when tabs become idle', async () => {
    vi.useFakeTimers();
    const { chrome, data } = mockChrome();
    chrome.tabs.query.mockResolvedValue([{ id: 1 }]);
    chrome.tabs.sendMessage.mockResolvedValue({ ok: true, busy: true });
    const { updateAvailable, applyPendingUpdate } = await import('../src/background/updates');
    await updateAvailable('1.4.3');
    expect(data.kmUpdate.status).toBe('waiting');
    expect(chrome.runtime.reload).not.toHaveBeenCalled();
    chrome.tabs.sendMessage.mockResolvedValue({ ok: true, busy: false });
    const applying = applyPendingUpdate();
    await vi.advanceTimersByTimeAsync(2000); await applying;
    expect(data.kmUpdate.status).toBe('installing');
    expect(chrome.runtime.reload).toHaveBeenCalledTimes(1);
  });
  it('checks on demand and reports Chrome throttling honestly', async () => {
    const { chrome, data } = mockChrome();
    const { checkForUpdate } = await import('../src/background/updates');
    await checkForUpdate();
    expect(data.kmUpdate.status).toBe('no_update');
    await checkForUpdate();
    expect(data.kmUpdate.status).toBe('throttled');
    expect(chrome.runtime.requestUpdateCheck).toHaveBeenCalledTimes(1);
  });
  it('deduplicates a simultaneous event and manual update check', async () => {
    vi.useFakeTimers();
    const { chrome } = mockChrome();
    chrome.runtime.requestUpdateCheck.mockResolvedValue({ status: 'update_available', version: '1.4.3' } as any);
    const { checkForUpdate, updateAvailable } = await import('../src/background/updates');
    const a = checkForUpdate(); const b = updateAvailable('1.4.3');
    await vi.advanceTimersByTimeAsync(2000); await Promise.all([a, b]);
    expect(chrome.runtime.reload).toHaveBeenCalledTimes(1);
  });
  it('polls GitHub releases silently and supports dismissing available updates', async () => {
    const fetchSpy = vi.fn(async () => ({
      ok: true,
      json: async () => ({ tag_name: 'v2.9.0', html_url: 'https://github.com/H1B0B0/kyara-manager/releases/tag/v2.9.0', body: 'Optimisations UI' })
    }));
    vi.stubGlobal('fetch', fetchSpy);
    const { data } = mockChrome();
    const { isNewerVersion, pollForUpdateSilently, dismissUpdateNotification } = await import('../src/background/updates');
    expect(isNewerVersion('2.4.0', '2.3.5')).toBe(true);
    expect(isNewerVersion('2.3.5', '2.3.5')).toBe(false);

    await pollForUpdateSilently(true);
    expect(data.kmUpdate).toMatchObject({
      status: 'available',
      availableVersion: '2.9.0',
      source: 'github',
      releaseUrl: 'https://github.com/H1B0B0/kyara-manager/releases/tag/v2.9.0'
    });

    await dismissUpdateNotification();
    expect(data.kmUpdate.dismissedVersion).toBe('2.9.0');
    vi.unstubAllGlobals();
  });

  it('tracks CWS propagation pending state and auto-installs once CWS becomes available', async () => {
    vi.useFakeTimers();
    const fetchSpy = vi.fn(async () => ({
      ok: true,
      json: async () => ({ tag_name: 'v2.6.2', html_url: 'https://github.com/H1B0B0/kyara-manager/releases/tag/v2.6.2', body: 'Fix CWS' })
    }));
    vi.stubGlobal('fetch', fetchSpy);
    const { chrome, data } = mockChrome();
    (chrome.runtime.getManifest as any).mockReturnValue({
      version: '2.6.1',
      update_url: 'https://clients2.google.com/service/update2/crx',
      content_scripts: []
    });
    const { checkForUpdate, applyPendingUpdate, dismissUpdateNotification, updateAvailable } = await import('../src/background/updates');

    await checkForUpdate({ includeRemote: true });
    expect(data.kmUpdate).toMatchObject({
      status: 'available',
      availableVersion: '2.6.2',
      source: 'github',
      cwsInstall: true,
      cwsPending: true,
      cwsUrl: 'https://chromewebstore.google.com/detail/test-extension'
    });

    await dismissUpdateNotification();
    expect(data.kmUpdate.dismissedVersion).toBe('2.6.2');

    // Manual retry while CWS still reports no_update keeps cwsPending: true without reloading
    await applyPendingUpdate();
    expect(data.kmUpdate).toMatchObject({ status: 'available', source: 'github', cwsPending: true });
    expect(chrome.runtime.reload).not.toHaveBeenCalled();

    // Bypass 60s throttle on CWS re-check when GitHub update is pending
    await checkForUpdate({ includeRemote: true });
    expect(chrome.runtime.requestUpdateCheck).toHaveBeenCalledTimes(3);

    // Once CWS pushes the update, updateAvailable clears dismissedVersion and cwsPending, shows modal 2000ms, then reloads
    chrome.runtime.requestUpdateCheck.mockResolvedValue({ status: 'update_available', version: '2.6.2' } as any);
    const p = updateAvailable('2.6.2');
    await vi.advanceTimersByTimeAsync(2000);
    await p;
    expect(data.kmUpdate).toMatchObject({
      status: 'installing',
      source: 'cws',
      cwsPending: false,
      dismissedVersion: undefined,
      cwsInstall: true
    });
    expect(chrome.runtime.reload).toHaveBeenCalledTimes(1);
    vi.unstubAllGlobals();
  });

  it('transitions a pending github update directly to CWS installing when requestUpdateCheck reports update_available', async () => {
    vi.useFakeTimers();
    const { chrome, data } = mockChrome({
      kmUpdate: {
        status: 'available',
        currentVersion: '2.6.1',
        availableVersion: '2.6.2',
        source: 'github',
        cwsInstall: true,
        cwsPending: true,
        dismissedVersion: '2.6.2'
      }
    });
    chrome.runtime.requestUpdateCheck.mockResolvedValue({ status: 'update_available', version: '2.6.2' } as any);
    const { applyPendingUpdate, checkForUpdate } = await import('../src/background/updates');

    const p = applyPendingUpdate();
    await vi.advanceTimersByTimeAsync(2000);
    await p;

    expect(data.kmUpdate).toMatchObject({
      status: 'installing',
      source: 'cws',
      cwsPending: false,
      dismissedVersion: undefined
    });
    expect(chrome.runtime.reload).toHaveBeenCalledTimes(1);

    // bypassThrottle forces checkForUpdate even within 60s
    data.kmUpdate = { status: 'no_update', currentVersion: '2.6.1', checkedAt: Date.now() };
    chrome.runtime.requestUpdateCheck.mockResolvedValue({ status: 'no_update' } as any);
    await checkForUpdate({ bypassThrottle: true });
    expect(chrome.runtime.requestUpdateCheck).toHaveBeenCalledTimes(2);
  });

  it('polls CWS every 5 minutes instead of 15 minutes while cwsPending is true', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(1_000_000);
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false })));
    const { chrome } = mockChrome({
      kmUpdate: {
        status: 'available',
        currentVersion: '2.6.1',
        availableVersion: '2.6.2',
        source: 'github',
        cwsPending: true,
        remoteCheckedAt: 1_000_000
      }
    });
    const { pollForUpdateSilently } = await import('../src/background/updates');

    await vi.advanceTimersByTimeAsync(4 * 60 * 1000);
    await pollForUpdateSilently();
    expect(chrome.runtime.requestUpdateCheck).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(60 * 1000);
    await pollForUpdateSilently();
    expect(chrome.runtime.requestUpdateCheck).toHaveBeenCalledTimes(1);
    vi.unstubAllGlobals();
  });
});

interface StubElement {
  tagName: string;
  id: string;
  type: string;
  title: string;
  hidden: boolean;
  disabled: boolean;
  dataset: Record<string, string>;
  children: StubElement[];
  parentElement: StubElement | null;
  className: string;
  textContent: string;
  classList: {
    add: (...tokens: string[]) => void;
    remove: (...tokens: string[]) => void;
    toggle: (token: string, force?: boolean) => boolean;
    contains: (token: string) => boolean;
  };
  setAttribute: (name: string, value: string) => void;
  getAttribute: (name: string) => string | null;
  append: (...nodes: StubElement[]) => void;
  appendChild: (node: StubElement) => StubElement;
  remove: () => void;
  addEventListener: (event: string, listener: (ev: any) => any) => void;
  click: () => void;
}

function createStubElement(tagName: string): StubElement {
  const classes = new Set<string>();
  const listeners = new Map<string, Array<(ev: any) => any>>();
  const attrs: Record<string, string> = {};
  let ownText = '';

  const el: StubElement = {
    tagName: tagName.toUpperCase(),
    id: '',
    type: '',
    title: '',
    hidden: false,
    disabled: false,
    dataset: {},
    children: [],
    parentElement: null,
    get className() {
      return [...classes].join(' ');
    },
    set className(value: string) {
      classes.clear();
      for (const token of String(value || '').split(/\s+/).filter(Boolean)) classes.add(token);
    },
    get textContent(): string {
      return el.children.length ? el.children.map((child) => child.textContent).join('') : ownText;
    },
    set textContent(value: string) {
      ownText = String(value ?? '');
      el.children.length = 0;
    },
    classList: {
      add: (...tokens: string[]) => tokens.filter(Boolean).forEach((t) => classes.add(t)),
      remove: (...tokens: string[]) => tokens.forEach((t) => classes.delete(t)),
      toggle: (token: string, force?: boolean) => {
        const next = force === undefined ? !classes.has(token) : Boolean(force);
        if (next) classes.add(token);
        else classes.delete(token);
        return next;
      },
      contains: (token: string) => classes.has(token)
    },
    setAttribute: (name: string, value: string) => {
      attrs[name] = String(value);
      if (name === 'id') el.id = String(value);
      if (name === 'class') el.className = String(value);
    },
    getAttribute: (name: string) => attrs[name] ?? null,
    append: (...nodes: StubElement[]) => {
      for (const node of nodes) el.appendChild(node);
    },
    appendChild: (node: StubElement) => {
      node.remove();
      node.parentElement = el;
      el.children.push(node);
      return node;
    },
    remove: () => {
      if (!el.parentElement) return;
      el.parentElement.children = el.parentElement.children.filter((child) => child !== el);
      el.parentElement = null;
    },
    addEventListener: (event: string, listener: (ev: any) => any) => {
      listeners.set(event, [...(listeners.get(event) || []), listener]);
    },
    click: () => {
      const event = { target: el, currentTarget: el, stopPropagation: () => {} };
      for (const listener of listeners.get('click') || []) {
        void listener(event);
      }
    }
  };
  return el;
}

function installHudDomStub() {
  const body = createStubElement('body');
  const findById = (node: StubElement, id: string): StubElement | null => {
    if (node.id === id) return node;
    for (const child of node.children) {
      const match = findById(child, id);
      if (match) return match;
    }
    return null;
  };
  const storage = new Map<string, string>();
  const windowOpen = vi.fn();

  vi.stubGlobal('document', {
    body,
    createElement: (tag: string) => createStubElement(tag),
    getElementById: (id: string) => findById(body, id)
  });
  vi.stubGlobal('window', { open: windowOpen });
  vi.stubGlobal('localStorage', {
    getItem: (key: string) => storage.get(key) ?? null,
    setItem: (key: string, value: string) => {
      storage.set(key, String(value));
    }
  });

  return { windowOpen };
}

describe('floating HUD update toast', () => {
  let windowOpenSpy: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.resetModules();
    const dom = installHudDomStub();
    windowOpenSpy = dom.windowOpen;
    vi.doMock('../src/content/state', () => ({
      state: { currentSettings: { masterEnabled: false, autoSellMaxListings: 10 } },
      loadSettings: vi.fn(async () => ({}))
    }));
    vi.doMock('../src/content/journal', () => ({
      appendJournal: vi.fn(async () => {})
    }));
    vi.doMock('../src/content/automation/cycle', () => ({
      runAutomationCycle: vi.fn(async () => ({}))
    }));
    vi.doMock('../src/content/overlay', () => ({
      toggleCockpitOverlay: vi.fn()
    }));
  });

  afterEach(() => {
    vi.doUnmock('../src/content/state');
    vi.doUnmock('../src/content/journal');
    vi.doUnmock('../src/content/automation/cycle');
    vi.doUnmock('../src/content/overlay');
    vi.unstubAllGlobals();
    vi.useRealTimers();
    vi.resetModules();
  });

  it('shows modal CWS installing toast when kmUpdate becomes installing', async () => {
    const { chrome } = mockChrome();
    const { mountFloatingHud } = await import('../src/content/hud');
    mountFloatingHud();

    await Promise.resolve();
    await Promise.resolve();

    await chrome.storage.local.set({
      kmUpdate: { status: 'installing', availableVersion: '2.6.2', source: 'cws', cwsInstall: true }
    });

    const toast = document.getElementById('km-update-toast');
    expect(toast).not.toBeNull();
    expect(toast?.classList.contains('km-update-toast--modal')).toBe(true);
    expect(toast?.hidden).toBe(false);
    expect(document.getElementById('km-update-toast-title')?.textContent).toBe(
      'Kyara Manager se met à jour (v2.6.2)…'
    );
    expect(toast?.textContent).toContain('Kyara Manager se met à jour (v2.6.2)…');
  });

  it('sends km:update-apply and does not open GitHub URL on CWS install when clicking apply', async () => {
    const githubReleaseUrl = 'https://github.com/H1B0B0/kyara-manager/releases/tag/v2.6.2';
    const availableUpdate = {
      status: 'available',
      availableVersion: '2.6.2',
      source: 'github',
      releaseUrl: githubReleaseUrl,
      cwsInstall: true,
      cwsUrl: 'https://chromewebstore.google.com/detail/test'
    };
    const { chrome } = mockChrome({ kmUpdate: availableUpdate });
    chrome.runtime.sendMessage.mockResolvedValue({ ok: true, kmUpdate: availableUpdate } as any);

    const { mountFloatingHud } = await import('../src/content/hud');
    mountFloatingHud();

    await vi.waitFor(() => {
      expect(document.getElementById('km-update-toast')?.hidden).toBe(false);
    });

    const applyBtn = document.getElementById('km-update-toast-apply') as HTMLButtonElement | null;
    expect(applyBtn).not.toBeNull();
    applyBtn?.click();

    await vi.waitFor(() => {
      expect(chrome.runtime.sendMessage).toHaveBeenCalledWith({ type: 'km:update-apply' });
      expect(applyBtn?.disabled).toBe(false);
    });
    expect(windowOpenSpy).not.toHaveBeenCalledWith(githubReleaseUrl, expect.anything(), expect.anything());
    expect(windowOpenSpy).not.toHaveBeenCalled();
  });
});
