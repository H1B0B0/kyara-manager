import { beforeEach, describe, expect, it, vi } from 'vitest';
import { mockChrome } from './chrome';

const mocks = vi.hoisted(() => ({
  api: vi.fn(),
  toggleOverlay: vi.fn(),
  navigate: vi.fn()
}));

vi.mock('../src/content/api', () => ({ kyaraApi: mocks.api }));
vi.mock('../src/content/overlay', () => ({ toggleCockpitOverlay: mocks.toggleOverlay }));
vi.mock('../src/content/automation/spa-navigator', () => ({ navigateSpaTo: mocks.navigate }));

class MiniClassList {
  private set = new Set<string>();
  constructor(initial = '') {
    initial.split(/\s+/).filter(Boolean).forEach((c) => this.set.add(c));
  }
  add(...names: string[]) { names.forEach((n) => this.set.add(n)); }
  remove(...names: string[]) { names.forEach((n) => this.set.delete(n)); }
  contains(name: string) { return this.set.has(name); }
  toggle(name: string, force?: boolean) {
    const next = force === undefined ? !this.set.has(name) : force;
    if (next) this.set.add(name);
    else this.set.delete(name);
    return next;
  }
  toString() { return Array.from(this.set).join(' '); }
}

class MiniElement {
  tagName: string;
  id = '';
  type = '';
  disabled = false;
  dataset: Record<string, string> = {};
  attrs: Record<string, string> = {};
  classList = new MiniClassList();
  children: MiniElement[] = [];
  parentNode: MiniElement | null = null;
  private _text = '';
  private listeners = new Map<string, Array<() => void>>();

  constructor(tag: string) {
    this.tagName = tag.toUpperCase();
  }

  get className() { return this.classList.toString(); }
  set className(val: string) { this.classList = new MiniClassList(val); }

  get textContent(): string {
    return this.children.length ? this.children.map((c) => c.textContent).join('') : this._text;
  }
  set textContent(val: string) {
    this._text = val;
    this.children = [];
  }

  get firstElementChild(): MiniElement | null {
    return this.children[0] || null;
  }

  get isConnected(): boolean {
    let cur: MiniElement | null = this;
    while (cur) {
      if (cur.tagName === 'BODY') return true;
      cur = cur.parentNode;
    }
    return false;
  }

  setAttribute(k: string, v: string) { this.attrs[k] = v; }
  getAttribute(k: string) { return this.attrs[k] ?? null; }

  appendChild(child: MiniElement) {
    child.remove();
    child.parentNode = this;
    this.children.push(child);
    return child;
  }

  append(...nodes: MiniElement[]) {
    nodes.forEach((n) => this.appendChild(n));
  }

  prepend(child: MiniElement) {
    child.remove();
    child.parentNode = this;
    this.children.unshift(child);
  }

  remove() {
    if (!this.parentNode) return;
    const idx = this.parentNode.children.indexOf(this);
    if (idx >= 0) this.parentNode.children.splice(idx, 1);
    this.parentNode = null;
  }

  addEventListener(evt: string, fn: () => void) {
    const arr = this.listeners.get(evt) || [];
    arr.push(fn);
    this.listeners.set(evt, arr);
  }

  click() {
    (this.listeners.get('click') || []).forEach((fn) => fn());
  }

  matches(sel: string): boolean {
    if (sel === 'main') return this.tagName === 'MAIN';
    if (sel === 'button') return this.tagName === 'BUTTON';
    if (sel === 'button:disabled') return this.tagName === 'BUTTON' && this.disabled;
    if (sel === 'main h1') return this.tagName === 'H1';
    if (sel.startsWith('#')) return this.id === sel.slice(1);
    if (sel.startsWith('.')) return this.classList.contains(sel.slice(1));
    return this.tagName === sel.toUpperCase();
  }

  querySelector(sel: string): MiniElement | null {
    for (const c of this.children) {
      if (c.matches(sel)) return c;
      const found = c.querySelector(sel);
      if (found) return found;
    }
    return null;
  }

  querySelectorAll(sel: string): MiniElement[] {
    const out: MiniElement[] = [];
    for (const c of this.children) {
      if (c.matches(sel)) out.push(c);
      out.push(...c.querySelectorAll(sel));
    }
    return out;
  }
}

function installMiniDom(initialPath = '/wiki/101') {
  const body = new MiniElement('body');
  const main = new MiniElement('main');
  body.appendChild(main);

  const doc = {
    body,
    createElement: (tag: string) => new MiniElement(tag),
    querySelector: (sel: string) => body.querySelector(sel),
    querySelectorAll: (sel: string) => body.querySelectorAll(sel),
    getElementById: (id: string) => body.querySelector(`#${id}`)
  };

  const win = {
    location: { pathname: initialPath }
  };

  (globalThis as any).document = doc;
  (globalThis as any).window = win;

  return {
    body,
    main,
    doc,
    setPath: (p: string) => { win.location.pathname = p; }
  };
}

describe('in-page-bars tactical bar refresh & wiki price fallback', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    mockChrome();
  });

  it('replaces the wiki bar on SPA navigation /wiki/101 -> /wiki/202 and uses median30d when median7d is null', async () => {
    const dom = installMiniDom('/wiki/101');
    const sendMessage = vi.fn().mockResolvedValue({ ok: true });
    (globalThis as any).chrome.runtime.sendMessage = sendMessage;

    const { runtimeCache } = await import('../src/content/cache');
    runtimeCache.collectionPrices.clear();
    runtimeCache.catalogById = new Map<number, any>([
      [101, { id: 101, name: 'Gojo Satoru' }],
      [202, { id: 202, name: 'Naruto Uzumaki' }]
    ]);
    runtimeCache.collectionPrices.set(101, {
      median7d: 100,
      median30d: 80,
      sales7d: 5,
      sales30d: 10,
      at: Date.now()
    });
    runtimeCache.collectionPrices.set(202, {
      median7d: null,
      median30d: 200,
      sales7d: 0,
      sales30d: 4,
      at: Date.now()
    });

    const { renderInPageBars } = await import('../src/content/in-page-bars');
    const ctx = {
      ownedIds: new Set<number>([101]),
      wishlistIds: new Set<number>(),
      pinnedIds: new Set<number>(),
      duplicateById: new Map(),
      dashboard: {},
      settings: {}
    };

    renderInPageBars(ctx);
    const bar101 = dom.doc.getElementById('km-inpage-wiki-bar');
    expect(bar101).not.toBeNull();
    expect(bar101!.textContent).toContain('Carte #101');
    expect(bar101!.textContent).toContain('~100 ◆');

    // Navigate SPA to /wiki/202 (median7d is null, median30d is 200)
    dom.setPath('/wiki/202');
    renderInPageBars(ctx);

    const bar202 = dom.doc.getElementById('km-inpage-wiki-bar');
    expect(bar202).not.toBeNull();
    expect(bar202).not.toBe(bar101);
    expect(bar101!.isConnected).toBe(false);
    expect(bar202!.textContent).toContain('Carte #202');
    expect(bar202!.textContent).toContain('~200 ◆');
    expect(bar202!.textContent).toContain('~180 ◆');
    expect(bar202!.textContent).toContain('150 ◆');

    const buttons = bar202!.querySelectorAll('button');
    const wishBtn = buttons.find((b) => b.textContent.includes('+ Envie'));
    const orderBtn = buttons.find((b) => b.textContent.includes('Ordre -25%'));
    expect(wishBtn).toBeDefined();
    expect(orderBtn).toBeDefined();

    wishBtn!.click();
    orderBtn!.click();

    expect(sendMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'km:cmd:wishlist-add',
        characterId: 202,
        name: 'Naruto Uzumaki',
        budgetChakra: 180
      })
    );
    expect(sendMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'km:cmd:place-buy-order',
        characterId: 202,
        name: 'Naruto Uzumaki',
        price: 150
      })
    );
  });

  it('refreshes the games bar when arcade counters change', async () => {
    const dom = installMiniDom('/jouer');
    const { renderGamesBar } = await import('../src/content/in-page-games');

    const makeCtx = (today: number, balance: number, canBuyLot: boolean) => ({
      ownedIds: new Set<number>(),
      wishlistIds: new Set<number>(),
      pinnedIds: new Set<number>(),
      duplicateById: new Map(),
      dashboard: {
        arcade: {
          today,
          dayCap: 60,
          week: 100 + today,
          weekCap: 300,
          balance,
          canBuyLot,
          bestLotLabel: 'Lot Lég.',
          bestLotPrice: 200
        }
      },
      settings: {}
    });

    renderGamesBar(makeCtx(12, 180, false));
    const bar1 = dom.doc.getElementById('km-inpage-games-bar');
    expect(bar1?.textContent).toContain('12/60');
    expect(bar1?.textContent).toContain('180 🎟');

    renderGamesBar(makeCtx(20, 204, true));
    const bar2 = dom.doc.getElementById('km-inpage-games-bar');
    expect(bar2).not.toBe(bar1);
    expect(bar2?.textContent).toContain('20/60');
    expect(bar2?.textContent).toContain('204 🎟');
    expect(bar2?.textContent).toContain('✓ Dispo : Lot Lég.');
  });
});
