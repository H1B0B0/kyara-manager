import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mockChrome } from './chrome';

type StubElement = {
  tagName: string;
  id: string;
  className: string;
  hidden: boolean;
  disabled: boolean;
  textContent: string;
  title: string;
  type: string;
  dataset: Record<string, string>;
  children: StubElement[];
  parentElement: StubElement | null;
  classList: {
    add: (...names: string[]) => void;
    remove: (...names: string[]) => void;
    toggle: (name: string, force?: boolean) => boolean;
    contains: (name: string) => boolean;
  };
  setAttribute: (name: string, value: string) => void;
  getAttribute: (name: string) => string | null;
  append: (...nodes: StubElement[]) => void;
  appendChild: (node: StubElement) => StubElement;
  remove: () => void;
  addEventListener: (event: string, listener: (ev: any) => any) => void;
};

function createStubElement(tagName: string): StubElement {
  const classes = new Set<string>();
  const attrs: Record<string, string> = {};
  const el: StubElement = {
    tagName: tagName.toUpperCase(),
    id: '',
    get className() {
      return [...classes].join(' ');
    },
    set className(value: string) {
      classes.clear();
      for (const token of String(value || '').split(/\s+/).filter(Boolean)) classes.add(token);
    },
    hidden: false,
    disabled: false,
    textContent: '',
    title: '',
    type: '',
    dataset: {},
    children: [],
    parentElement: null,
    classList: {
      add: (...names: string[]) => names.forEach((name) => classes.add(name)),
      remove: (...names: string[]) => names.forEach((name) => classes.delete(name)),
      toggle: (name: string, force?: boolean) => {
        const shouldHave = force === undefined ? !classes.has(name) : Boolean(force);
        if (shouldHave) classes.add(name);
        else classes.delete(name);
        return shouldHave;
      },
      contains: (name: string) => classes.has(name)
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
    addEventListener: () => {}
  };
  return el;
}

function installDomStub() {
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
  vi.stubGlobal('document', {
    body,
    createElement: (tag: string) => createStubElement(tag),
    getElementById: (id: string) => findById(body, id)
  });
  vi.stubGlobal('window', { open: vi.fn() });
  vi.stubGlobal('localStorage', {
    getItem: (key: string) => storage.get(key) ?? null,
    setItem: (key: string, value: string) => {
      storage.set(key, String(value));
    }
  });
}

describe('mountFloatingHud cleanup', () => {
  beforeEach(() => {
    vi.resetModules();
    installDomStub();
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
    vi.resetModules();
  });

  it('removes the storage.onChanged listener and HUD DOM nodes on cleanup', async () => {
    const { chrome } = mockChrome();
    let resolveInitialGet!: (value: Record<string, any>) => void;
    chrome.storage.local.get.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveInitialGet = resolve;
        })
    );

    const { mountFloatingHud } = await import('../src/content/hud');
    const cleanup = mountFloatingHud();

    expect(document.getElementById('km-floating-hud')).not.toBeNull();
    expect(document.getElementById('km-update-toast')).not.toBeNull();
    expect(chrome.storage.onChanged.addListener).toHaveBeenCalledTimes(1);
    const registeredHandler = chrome.storage.onChanged.addListener.mock.calls[0][0];
    expect(typeof registeredHandler).toBe('function');

    cleanup();

    expect(chrome.storage.onChanged.removeListener).toHaveBeenCalledTimes(1);
    expect(chrome.storage.onChanged.removeListener).toHaveBeenCalledWith(registeredHandler);
    expect(chrome.storage.onChanged.listeners.size).toBe(0);
    expect(document.getElementById('km-floating-hud')).toBeNull();
    expect(document.getElementById('km-update-toast')).toBeNull();

    // Resolving the pending storage.get after cleanup must be a safe no-op.
    resolveInitialGet({
      kmUpdate: { status: 'installing', availableVersion: '2.9.0', source: 'cws', cwsInstall: true }
    });
    await Promise.resolve();
    await Promise.resolve();
    expect(document.getElementById('km-update-toast')).toBeNull();
  });
});
