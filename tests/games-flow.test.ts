import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mockChrome, mockLocks } from './chrome';

const mocks = vi.hoisted(() => ({
  api: vi.fn(),
  catalog: vi.fn(),
  journal: vi.fn(),
  navigate: vi.fn(),
  interrupted: false
}));

vi.mock('../src/content/api', () => ({ kyaraApi: mocks.api }));
vi.mock('../src/content/cache', () => ({
  ensureCatalog: mocks.catalog,
  runtimeCache: { catalogById: new Map() }
}));
vi.mock('../src/content/journal', () => ({ appendJournal: mocks.journal }));
vi.mock('../src/content/safety', () => ({ isInterrupted: () => mocks.interrupted }));
vi.mock('../src/content/automation/spa-navigator', () => ({ navigateSpaTo: mocks.navigate }));

import {
  clickAdvanceOrNextButton,
  findButtonByText,
  humanSleep,
  isGameFinishedScreen,
  setGamesFastModeForTest,
  solveExpeditionStep,
  solveMainKyaraStep,
  waitForEnabledButton
} from '../src/content/automation/games-extra';
import { REPLAY_BTN_RE } from '../src/content/automation/games-core';
import { applySlotSelection, solvePokerHandStep } from '../src/content/automation/games-poker';
import { solveKyara21Step, solveMemoryStep, solveSoloQuizStep } from '../src/content/automation/games-classic';
import {
  executeAutoGames,
  solveActiveMiniGameRound,
  solveDailyHandStep
} from '../src/content/automation/games';

type ClickHandler = (ev: any) => void;

class StubClassList {
  private set = new Set<string>();
  setFromString(raw: string): void {
    this.set = new Set(raw.split(/\s+/).filter(Boolean));
  }
  toString(): string {
    return Array.from(this.set).join(' ');
  }
  contains(cls: string): boolean {
    return this.set.has(cls);
  }
  add(...tokens: string[]): void {
    tokens.forEach((t) => t && this.set.add(t));
  }
  remove(...tokens: string[]): void {
    tokens.forEach((t) => this.set.delete(t));
  }
  toggle(token: string, force?: boolean): boolean {
    const next = force !== undefined ? force : !this.set.has(token);
    if (next) this.set.add(token);
    else this.set.delete(token);
    return next;
  }
}

class StubElement {
  nodeType = 1;
  tagName: string;
  id = '';
  classList = new StubClassList();
  parentElement: StubElement | null = null;
  children: StubElement[] = [];
  style: Record<string, string> = {};
  hidden = false;
  clickCount = 0;
  onclick: ClickHandler | null = null;
  private attrs = new Map<string, string>();
  private listeners = new Map<string, ClickHandler[]>();
  private _text = '';

  constructor(tag: string) {
    this.tagName = tag.toUpperCase();
  }

  get firstChild(): any {
    if (this._text) {
      return { nodeType: 3, nodeValue: this._text, nextSibling: this.children[0] ?? null };
    }
    return this.children[0] ?? null;
  }

  get nextSibling(): any {
    if (!this.parentElement) return null;
    const idx = this.parentElement.children.indexOf(this);
    return idx >= 0 && idx + 1 < this.parentElement.children.length ? this.parentElement.children[idx + 1] : null;
  }

  get className(): string {
    return this.classList.toString();
  }
  set className(val: string) {
    this.classList.setFromString(val || '');
  }

  get textContent(): string {
    if (!this.children.length) return this._text;
    return this._text + this.children.map((c) => c.textContent).join('');
  }
  set textContent(val: string) {
    this._text = val || '';
    this.children = [];
  }

  get innerText(): string {
    return this.textContent;
  }
  set innerText(val: string) {
    this.textContent = val;
  }

  getAttribute(name: string): string | null {
    if (name === 'id') return this.id || null;
    if (name === 'class') return this.className || null;
    if (name === 'hidden') return this.hidden ? '' : null;
    return this.attrs.has(name) ? this.attrs.get(name)! : null;
  }

  setAttribute(name: string, value: string): void {
    const str = String(value);
    if (name === 'id') this.id = str;
    else if (name === 'class') this.className = str;
    else if (name === 'hidden') this.hidden = true;
    else this.attrs.set(name, str);
  }

  removeAttribute(name: string): void {
    if (name === 'id') this.id = '';
    else if (name === 'class') this.className = '';
    else if (name === 'hidden') this.hidden = false;
    else this.attrs.delete(name);
  }

  hasAttribute(name: string): boolean {
    if (name === 'hidden') return this.hidden;
    if (name === 'disabled') return Boolean((this as any).disabled);
    return this.attrs.has(name);
  }

  append(...nodes: StubElement[]): void {
    for (const n of nodes) {
      n.parentElement = this;
      this.children.push(n);
    }
  }

  appendChild<T extends StubElement>(node: T): T {
    this.append(node);
    return node;
  }

  replaceChildren(...nodes: StubElement[]): void {
    this._text = '';
    this.children = [];
    this.append(...nodes);
  }

  addEventListener(type: string, fn: ClickHandler): void {
    const arr = this.listeners.get(type) || [];
    arr.push(fn);
    this.listeners.set(type, arr);
  }

  click(): void {
    if ((this as any).disabled) return;
    this.clickCount += 1;
    const ev = { type: 'click', target: this, currentTarget: this, preventDefault() {}, stopPropagation() {} };
    if (typeof this.onclick === 'function') this.onclick(ev);
    for (const fn of this.listeners.get('click') || []) fn(ev);
  }

  matches(selectorList: string): boolean {
    return selectorList
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean)
      .some((sel) => matchesComplex(this, tokenizeSelector(sel)));
  }

  closest(selectorList: string): StubElement | null {
    let cur: StubElement | null = this;
    while (cur) {
      if (cur.matches(selectorList)) return cur;
      cur = cur.parentElement;
    }
    return null;
  }

  querySelectorAll<T = StubElement>(selectorList: string): T[] {
    const branches = selectorList
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean)
      .map(tokenizeSelector);
    const out: StubElement[] = [];
    const visit = (node: StubElement) => {
      for (const child of node.children) {
        if (branches.some((parts) => matchesComplex(child, parts))) out.push(child);
        visit(child);
      }
    };
    visit(this);
    return out as unknown as T[];
  }

  querySelector<T = StubElement>(selectorList: string): T | null {
    return this.querySelectorAll<T>(selectorList)[0] ?? null;
  }
}

class StubHTMLElement extends StubElement {}

class StubHTMLButtonElement extends StubHTMLElement {
  disabled = false;
  constructor() {
    super('button');
  }
}

class StubHTMLImageElement extends StubHTMLElement {
  constructor() {
    super('img');
  }
  get src(): string {
    return this.getAttribute('src') || '';
  }
  set src(val: string) {
    this.setAttribute('src', val);
  }
  get alt(): string {
    return this.getAttribute('alt') || '';
  }
  set alt(val: string) {
    this.setAttribute('alt', val);
  }
}

function tokenizeSelector(sel: string): string[] {
  const tokens: string[] = [];
  let i = 0;
  let cur = '';
  let bracketDepth = 0;
  let parenDepth = 0;
  while (i < sel.length) {
    const ch = sel[i];
    if (ch === '[') bracketDepth += 1;
    else if (ch === ']') bracketDepth = Math.max(0, bracketDepth - 1);
    else if (ch === '(') parenDepth += 1;
    else if (ch === ')') parenDepth = Math.max(0, parenDepth - 1);

    if (bracketDepth === 0 && parenDepth === 0 && (ch === '>' || /\s/.test(ch))) {
      if (cur) {
        tokens.push(cur);
        cur = '';
      }
      if (ch === '>') tokens.push('>');
    } else {
      cur += ch;
    }
    i += 1;
  }
  if (cur) tokens.push(cur);
  return tokens;
}

function matchesCompound(el: StubElement, compound: string): boolean {
  if (compound === ':disabled') return Boolean((el as any).disabled);
  let rest = compound;
  const tagMatch = rest.match(/^([a-zA-Z][a-zA-Z0-9-]*)/);
  if (tagMatch) {
    if (el.tagName !== tagMatch[1].toUpperCase()) return false;
    rest = rest.slice(tagMatch[0].length);
  }
  while (rest.length > 0) {
    if (rest.startsWith('#')) {
      const m = rest.match(/^#([a-zA-Z0-9_-]+)/);
      if (!m || el.id !== m[1]) return false;
      rest = rest.slice(m[0].length);
    } else if (rest.startsWith('.')) {
      const m = rest.match(/^\.([a-zA-Z0-9_-]+)/);
      if (!m || !el.classList.contains(m[1])) return false;
      rest = rest.slice(m[0].length);
    } else if (rest.startsWith('[')) {
      const end = rest.indexOf(']');
      if (end < 0) return false;
      const inner = rest.slice(1, end).trim();
      rest = rest.slice(end + 1);
      const attrMatch = inner.match(/^([a-zA-Z0-9_-]+)(?:\s*(\*?=)\s*["']?([^"'\]]*?)["']?(?:\s+(i))?)?$/);
      if (!attrMatch) return false;
      const [, attrName, op, expected, ci] = attrMatch;
      if (!op) {
        if (!el.hasAttribute(attrName)) return false;
      } else {
        const actual = el.getAttribute(attrName);
        if (actual === null) return false;
        const lhs = ci ? actual.toLowerCase() : actual;
        const rhs = ci ? (expected || '').toLowerCase() : expected || '';
        if (op === '=' && lhs !== rhs) return false;
        if (op === '*=' && !lhs.includes(rhs)) return false;
      }
    } else if (rest.startsWith(':not(')) {
      const end = rest.indexOf(')');
      if (end < 0) return false;
      const inner = rest.slice(5, end).trim();
      rest = rest.slice(end + 1);
      if (matchesCompound(el, inner)) return false;
    } else if (rest.startsWith(':disabled')) {
      if (!(el as any).disabled) return false;
      rest = rest.slice(':disabled'.length);
    } else {
      return false;
    }
  }
  return true;
}

function matchesComplex(el: StubElement, parts: string[], idx = parts.length - 1): boolean {
  if (idx < 0 || !matchesCompound(el, parts[idx])) return false;
  if (idx === 0) return true;
  if (parts[idx - 1] === '>') {
    if (!el.parentElement || idx - 2 < 0) return false;
    return matchesComplex(el.parentElement, parts, idx - 2);
  }
  let anc = el.parentElement;
  while (anc) {
    if (matchesComplex(anc, parts, idx - 1)) return true;
    anc = anc.parentElement;
  }
  return false;
}

class StubDocument {
  body = new StubHTMLElement('body');
  createElement(tag: string): StubHTMLElement {
    const low = tag.toLowerCase();
    if (low === 'button') return new StubHTMLButtonElement();
    if (low === 'img') return new StubHTMLImageElement();
    return new StubHTMLElement(low);
  }
  querySelector<T = StubElement>(selectorList: string): T | null {
    return this.body.querySelector<T>(selectorList);
  }
  querySelectorAll<T = StubElement>(selectorList: string): T[] {
    return this.body.querySelectorAll<T>(selectorList);
  }
}

function installDomEnv(initialPath = '/'): {
  doc: StubDocument;
  setPath: (path: string) => void;
  el: (tag: string, opts?: { className?: string; id?: string; text?: string; disabled?: boolean; attrs?: Record<string, string> }, children?: StubElement[]) => StubHTMLElement;
  btn: (text: string, opts?: { className?: string; id?: string; disabled?: boolean; attrs?: Record<string, string> }) => StubHTMLButtonElement;
  img: (src: string, alt?: string) => StubHTMLImageElement;
  cleanup: () => void;
} {
  const saved = {
    document: (globalThis as any).document,
    window: (globalThis as any).window,
    location: (globalThis as any).location,
    Element: (globalThis as any).Element,
    HTMLElement: (globalThis as any).HTMLElement,
    HTMLButtonElement: (globalThis as any).HTMLButtonElement,
    HTMLImageElement: (globalThis as any).HTMLImageElement
  };

  const doc = new StubDocument();
  const loc = { pathname: initialPath };
  const win = { location: loc };

  (globalThis as any).Element = StubElement;
  (globalThis as any).HTMLElement = StubHTMLElement;
  (globalThis as any).HTMLButtonElement = StubHTMLButtonElement;
  (globalThis as any).HTMLImageElement = StubHTMLImageElement;
  (globalThis as any).document = doc;
  (globalThis as any).window = win;
  (globalThis as any).location = loc;

  const el = (
    tag: string,
    opts: { className?: string; id?: string; text?: string; disabled?: boolean; attrs?: Record<string, string> } = {},
    children: StubElement[] = []
  ) => {
    const node = doc.createElement(tag);
    if (opts.className) node.className = opts.className;
    if (opts.id) node.id = opts.id;
    if (opts.text) node.textContent = opts.text;
    if (opts.disabled !== undefined && 'disabled' in node) (node as StubHTMLButtonElement).disabled = opts.disabled;
    if (opts.attrs) {
      for (const [k, v] of Object.entries(opts.attrs)) node.setAttribute(k, v);
    }
    if (children.length) node.append(...children);
    return node;
  };

  const btn = (
    text: string,
    opts: { className?: string; id?: string; disabled?: boolean; attrs?: Record<string, string> } = {}
  ) => el('button', { ...opts, text }) as StubHTMLButtonElement;

  const img = (src: string, alt = '') => {
    const node = doc.createElement('img') as StubHTMLImageElement;
    node.src = src;
    if (alt) node.alt = alt;
    return node;
  };

  return {
    doc,
    setPath: (path: string) => {
      loc.pathname = path;
    },
    el,
    btn,
    img,
    cleanup: () => {
      for (const [k, v] of Object.entries(saved)) {
        if (v === undefined) delete (globalThis as any)[k];
        else (globalThis as any)[k] = v;
      }
    }
  };
}

describe('games DOM flow, next buttons, and anti-bot pacing', () => {
  const catalog = new Map<number, any>([
    [101, { id: 101, name: 'Gojo Satoru', series: 'Jujutsu Kaisen', rarity: 'L', rank: 4 }],
    [102, { id: 102, name: 'Random Villager', series: 'Filler', rarity: 'C', rank: 980 }],
    [103, { id: 103, name: 'Megumi Fushiguro', series: 'Jujutsu Kaisen', rarity: 'E', rank: 19 }]
  ]);

  let dom: ReturnType<typeof installDomEnv>;

  beforeEach(() => {
    vi.clearAllMocks();
    mocks.interrupted = false;
    mocks.catalog.mockResolvedValue(catalog);
    mocks.navigate.mockResolvedValue(true);
    dom = installDomEnv('/');
  });

  afterEach(() => {
    setGamesFastModeForTest(false);
    dom.cleanup();
  });

  function buildSixCardHandDom(delayEnableMs = 0) {
    const cardSpecs = [
      { name: 'Gojo', series: 'Jujutsu Kaisen', family: 'Action', rarity: 'R' },
      { name: 'Yuji', series: 'Jujutsu Kaisen', family: 'Action', rarity: 'R' },
      { name: 'Villager', series: 'Other', family: 'Slice', rarity: 'C' },
      { name: 'Megumi', series: 'Jujutsu Kaisen', family: 'Action', rarity: 'R' },
      { name: 'Nobara', series: 'Jujutsu Kaisen', family: 'Action', rarity: 'R' },
      { name: 'Yuta', series: 'Jujutsu Kaisen', family: 'Action', rarity: 'R' }
    ];

    const playBtn = dom.btn('Jouer', { className: 'btn btn-acc', disabled: true });
    const slots = cardSpecs.map((c) => {
      const slot = dom.el('button', { className: 'slot', attrs: { 'aria-pressed': 'false' } }, [
        dom.el('div', { className: `tcg pf p-${c.rarity}` }, [
          dom.el('span', { className: 'pf-seal', text: c.rarity }),
          dom.el('span', { className: 'pf-name', text: c.name }),
          dom.el('span', { className: 'pf-ser', text: c.series }),
          dom.el('span', { className: 'pf-rib', attrs: { title: c.family } })
        ])
      ]) as StubHTMLButtonElement;
      slot.addEventListener('click', () => {
        const next = slot.getAttribute('aria-pressed') !== 'true';
        slot.setAttribute('aria-pressed', next ? 'true' : 'false');
        const anyPressed = slots.some((s) => s.getAttribute('aria-pressed') === 'true');
        if (anyPressed) {
          if (delayEnableMs > 0) {
            setTimeout(() => {
              playBtn.disabled = false;
            }, delayEnableMs);
          } else {
            playBtn.disabled = false;
          }
        }
      });
      return slot;
    });

    const hand = dom.el('div', { className: 'hand' }, slots);
    const actions = dom.el('div', { className: 'actions' }, [playBtn]);
    const foot = dom.el('div', { className: 'foot' }, [actions]);
    const main = dom.el('main', {}, [hand, foot]);
    dom.doc.body.replaceChildren(main);

    return { slots, playBtn, main };
  }

  it('selects optimal cards in main-du-jour and main-kyara, waits for enabled Jouer, and clicks Jouer', async () => {
    setGamesFastModeForTest(true);
    dom.setPath('/jouer/main-du-jour');
    const daily = buildSixCardHandDom(0);

    expect(await solveDailyHandStep()).toBe(true);
    expect(daily.slots.map((s) => s.getAttribute('aria-pressed'))).toEqual([
      'true',
      'true',
      'false',
      'true',
      'true',
      'true'
    ]);
    expect(daily.playBtn.disabled).toBe(false);
    expect(daily.playBtn.clickCount).toBe(1);

    dom.setPath('/jouer/main-kyara');
    const solo = buildSixCardHandDom(0);
    expect(await solveMainKyaraStep()).toBe(true);
    expect(solo.slots.map((s) => s.getAttribute('aria-pressed'))).toEqual([
      'true',
      'true',
      'false',
      'true',
      'true',
      'true'
    ]);
    expect(solo.playBtn.clickCount).toBe(1);

    // Also verifies async button activation polling when fast mode is disabled
    setGamesFastModeForTest(false);
    const asyncHand = buildSixCardHandDom(25);
    asyncHand.slots[0].click();
    expect(asyncHand.playBtn.disabled).toBe(true);
    const waited = await waitForEnabledButton(
      () => findButtonByText(dom.doc as unknown as ParentNode, /^Jouer$/i),
      400
    );
    expect(waited).toBe(asyncHand.playBtn as unknown as HTMLButtonElement);
    expect(asyncHand.playBtn.disabled).toBe(false);
  });

  it('clicks advance/next buttons including typographic apostrophes and ignores excluded buttons', async () => {
    setGamesFastModeForTest(true);

    const buildIgnoredSet = () => {
      const discordBtn = dom.btn('Me connecter avec Discord');
      const copyBtn = dom.btn('Copier le résultat');
      const leaderboardBtn = dom.btn('Classement');
      const replayBtn = dom.btn('Rejouer');
      const newGameBtn = dom.btn('Nouvelle partie');
      const playMainKyaraBtn = dom.btn('Jouer à Main Kyara');
      const barNextBtn = dom.btn('Suivant');
      const barContinueBtn = dom.btn('Continuer');
      const inpageBar = dom.el('div', { id: 'km-inpage-games-bar' }, [barNextBtn, barContinueBtn]);
      const actionsAccDiscord = dom.el('div', { className: 'actions' }, [
        dom.btn('Me connecter avec Discord', { className: 'btn btn-acc' })
      ]);
      const excluded = [
        discordBtn,
        copyBtn,
        leaderboardBtn,
        replayBtn,
        newGameBtn,
        playMainKyaraBtn,
        barNextBtn,
        barContinueBtn,
        actionsAccDiscord.children[0] as StubHTMLButtonElement
      ];
      return { excluded, inpageBar, actionsAccDiscord };
    };

    // Only excluded buttons -> clickAdvanceOrNextButton must return false and click nothing
    const onlyExcluded = buildIgnoredSet();
    dom.doc.body.replaceChildren(
      dom.el('main', {}, [...onlyExcluded.excluded.slice(0, 6), onlyExcluded.actionsAccDiscord, onlyExcluded.inpageBar])
    );
    expect(findButtonByText(dom.doc as unknown as ParentNode, /^Suivant$/)).toBeNull();
    expect(await clickAdvanceOrNextButton()).toBe(false);
    expect(onlyExcluded.excluded.every((b) => b.clickCount === 0)).toBe(true);

    // Each valid advance label (including typographic apostrophe ’) must be clicked while ignoring all exclusions
    const validLabels = [
      'Suivant',
      'Main suivante',
      'Question suivante',
      'Continuer',
      'Terminer',
      'Voir le résultat',
      'Confirmer l’équipe'
    ];
    for (const label of validLabels) {
      const set = buildIgnoredSet();
      const targetBtn = dom.btn(label);
      const main = dom.el('main', {}, [...set.excluded.slice(0, 6), set.actionsAccDiscord, set.inpageBar, targetBtn]);
      dom.doc.body.replaceChildren(main);

      expect(await clickAdvanceOrNextButton()).toBe(true);
      expect(targetBtn.clickCount).toBe(1);
      expect(set.excluded.every((b) => b.clickCount === 0)).toBe(true);
    }
  });

  it('chains quiz rounds on /jouer/qui-est-ce and next hand on /jouer/kyara-21 without double-clicking choices', async () => {
    setGamesFastModeForTest(true);

    // 1. /jouer/qui-est-ce: answer once, then on .right + Suivant in .foot, advance without re-clicking
    dom.setPath('/jouer/qui-est-ce');
    const c1 = dom.btn('Naruto Uzumaki', { className: 'choice' });
    const c2 = dom.btn('Gojo Satoru', { className: 'choice' });
    const c3 = dom.btn('Monkey D. Luffy', { className: 'choice' });
    const c4 = dom.btn('Ichigo Kurosaki', { className: 'choice' });
    const choicesBox = dom.el('div', { className: 'choices' }, [c1, c2, c3, c4]);
    const arena = dom.el('div', { className: 'arena' }, [
      dom.img('https://cdn.kyara.games/cards/sm/101.webp'),
      choicesBox
    ]);
    const mainEl = dom.el('main', {}, [arena]);
    dom.doc.body.replaceChildren(mainEl);

    expect(await solveActiveMiniGameRound(catalog)).toBe(true);
    expect(c2.clickCount).toBe(1);
    expect(c1.clickCount + c3.clickCount + c4.clickCount).toBe(0);

    // Post-answer state: c2 marked .right, Suivant visible in .foot
    c2.classList.add('right');
    c1.disabled = true;
    c2.disabled = true;
    c3.disabled = true;
    const nextQuestionBtn = dom.btn('Suivant', { className: 'btn btn-acc' });
    mainEl.append(dom.el('div', { className: 'foot' }, [nextQuestionBtn]));

    expect(await solveActiveMiniGameRound(catalog)).toBe(true);
    expect(nextQuestionBtn.clickCount).toBe(1);
    expect(c2.clickCount).toBe(1);
    expect(c4.clickCount).toBe(0);

    // 2. /jouer/kyara-21: plays Hit when sum < 17, then clicks Main suivante when Hit/Stand are absent
    dom.setPath('/jouer/kyara-21');
    const hitBtn = dom.btn('Tirer', { className: 'btn btn-acc' });
    const standBtn = dom.btn('Rester', { className: 'btn btn-ghost' });
    const felt = dom.el('div', { className: 'felt' }, [
      dom.el('div', { className: 'tcg pf p-C' }),
      dom.el('div', { className: 'tcg pf p-U' }),
      hitBtn,
      standBtn
    ]);
    dom.doc.body.replaceChildren(dom.el('main', {}, [felt]));

    expect(await solveActiveMiniGameRound(catalog)).toBe(true);
    expect(hitBtn.clickCount).toBe(1);
    expect(standBtn.clickCount).toBe(0);

    // Round resolved: Hit/Stand absent, Main suivante shown
    const nextHandBtn = dom.btn('Main suivante', { className: 'btn btn-acc' });
    felt.replaceChildren(dom.el('div', { className: 'tcg pf p-L' }), dom.el('div', { className: 'tcg pf p-E' }));
    dom.doc.querySelector('main')!.append(dom.el('div', { className: 'foot' }, [dom.el('div', { className: 'actions' }, [nextHandBtn])]));

    expect(await solveActiveMiniGameRound(catalog)).toBe(true);
    expect(nextHandBtn.clickCount).toBe(1);
  });

  it('handles rotation, end-of-game replay buttons, real humanSleep delay, and MIN_RUN_MS pacing', async () => {
    mockChrome({
      settings: {
        dryRun: false,
        autoGamesEnabled: true,
        autoGamesDailyEnabled: false,
        autoGamesTargetGame: 'all'
      }
    });

    let balance = 100;
    mocks.api.mockImplementation(async (path: string) => {
      if (path === '/play/arcade') {
        return { enabled: true, blocked: null, balance, today: 10, dayCap: 60, week: 20, weekCap: 300, lots: [] };
      }
      return null;
    });

    const mountGameRoute = (path: string) => {
      dom.setPath(path);
      if (path.startsWith('/jouer/main-kyara')) {
        const handState = buildSixCardHandDom(0);
        handState.playBtn.addEventListener('click', () => {
          const replayBtn = dom.btn('Jouer à Main Kyara');
          replayBtn.addEventListener('click', () => mountGameRoute('/jouer/main-kyara'));
          handState.main.replaceChildren(replayBtn);
        });
        return;
      }
      if (path.startsWith('/jouer/plus-aime')) {
        const cardA = dom.el('button', { className: 'pick' }, [
          dom.img('https://cdn.kyara.games/cards/sm/102.webp'),
          dom.el('span', { className: 'pf-name', text: 'Random Villager' })
        ]);
        const cardB = dom.el('button', { className: 'pick' }, [
          dom.img('https://cdn.kyara.games/cards/sm/101.webp'),
          dom.el('span', { className: 'pf-name', text: 'Gojo Satoru' })
        ]);
        const duel = dom.el('div', { className: 'duel' }, [cardA, cardB]);
        const arena = dom.el('div', { className: 'arena' }, [duel]);
        const main = dom.el('main', {}, [arena]);
        cardB.addEventListener('click', () => {
          balance += 3;
          const newGame = dom.btn('Nouvelle partie');
          newGame.addEventListener('click', () => mountGameRoute('/jouer/plus-aime'));
          main.replaceChildren(newGame);
        });
        dom.doc.body.replaceChildren(main);
        return;
      }
      // Generic quiz/duel route (e.g. /jouer/qui-est-ce)
      const qChoice = dom.btn('Gojo Satoru', { className: 'choice' });
      const choices = dom.el('div', { className: 'choices' }, [
        dom.btn('Naruto Uzumaki', { className: 'choice' }),
        qChoice
      ]);
      const arena = dom.el('div', { className: 'arena' }, [
        dom.img('https://cdn.kyara.games/cards/sm/101.webp'),
        choices
      ]);
      const main = dom.el('main', {}, [arena]);
      qChoice.addEventListener('click', () => {
        balance += 3;
        const newGame = dom.btn('Nouvelle partie');
        newGame.addEventListener('click', () => mountGameRoute(path));
        main.replaceChildren(newGame);
      });
      dom.doc.body.replaceChildren(main);
    };

    mocks.navigate.mockImplementation(async (path: string) => {
      mountGameRoute(path);
      return true;
    });

    // 1. main-kyara stops cleanly when "Jouer à Main Kyara" appears and plays 2 runs via replay trigger
    const mkRes = await executeAutoGames({ me: { id: 1 } }, { manual: false, gameId: 'main-kyara', _fastForTest: true });
    expect(mkRes.playedGames).toBe(2);

    // 2. Rotation ("all") plays multiple games cleanly and stops each run on "Nouvelle partie"
    const rotRes = await executeAutoGames({ me: { id: 1 } }, { manual: false, gameId: 'all', _fastForTest: true });
    expect(rotRes.playedGames).toBe(2);
    expect(rotRes.ticketsEarned).toBe(6);

    // 3. executeAutoGames resets fast mode in finally, so humanSleep waits >= 100ms in real time
    const realStart = Date.now();
    await humanSleep(120, 180);
    const realElapsed = Date.now() - realStart;
    expect(realElapsed).toBeGreaterThanOrEqual(100);

    // 4. Verify setGamesFastModeForTest(true) skips sleep, and MIN_RUN_MS enforces >= 12s/run when _fastForTest is false
    setGamesFastModeForTest(true);
    const fastStart = Date.now();
    await humanSleep(120, 180);
    expect(Date.now() - fastStart).toBeLessThan(50);
    setGamesFastModeForTest(false);

    vi.useFakeTimers();
    try {
      const simStart = Date.now();
      const pacedPromise = executeAutoGames({ me: { id: 1 } }, { manual: false, gameId: 'plus-aime', _fastForTest: false });
      await vi.advanceTimersByTimeAsync(45_000);
      const pacedRes = await pacedPromise;
      expect(pacedRes.playedGames).toBe(2);
      expect(Date.now() - simStart).toBeGreaterThanOrEqual(24_000);
    } finally {
      vi.useRealTimers();
    }
  });

  it('solves Memory (8 tiles = 4 pairs) with .tile.up/.found and NO disabled attribute without re-clicking found tiles', async () => {
    setGamesFastModeForTest(true);
    dom.setPath('/jouer/memoire');

    const cardIds = [201, 202, 203, 204, 202, 204, 201, 203];
    const openQueue: number[] = [];
    let clickedFoundTile = false;

    const tiles = cardIds.map((id, idx) => {
      const front = dom.el('div', { className: 'face front' }, [
        dom.img(`https://cdn.kyara.games/cards/sm/${id}.webp`)
      ]);
      const tile = dom.el('button', { className: 'tile' }, [front]) as StubHTMLButtonElement;
      // Note: real Kyara DOM never sets tile.disabled = true on .found tiles!
      tile.addEventListener('click', () => {
        if (tile.classList.contains('found')) {
          clickedFoundTile = true;
          return;
        }
        if (tile.classList.contains('up')) return;
        tile.classList.add('up');
        openQueue.push(idx);
        if (openQueue.length === 2) {
          const [a, b] = openQueue.splice(0, 2);
          if (cardIds[a] === cardIds[b]) {
            tiles[a].classList.add('found');
            tiles[b].classList.add('found');
          } else {
            tiles[a].classList.remove('up');
            tiles[b].classList.remove('up');
          }
        }
      });
      return tile;
    });

    const grid = dom.el('div', { className: 'grid' }, tiles);
    dom.doc.body.replaceChildren(dom.el('main', {}, [grid]));

    const memState = new Map<number, string>();
    for (let step = 0; step < 20; step += 1) {
      if (tiles.every((t) => t.classList.contains('found'))) break;
      expect(await solveMemoryStep(memState)).toBe(true);
    }

    expect(tiles.every((t) => t.classList.contains('found'))).toBe(true);
    expect(clickedFoundTile).toBe(false);
  });

  it('plays Kyara 21 with div.felt-in .row (.val.mono), external div.actions, disabled->enabled Main suivante, and Voir le résultat', async () => {
    setGamesFastModeForTest(true);
    dom.setPath('/jouer/kyara-21');

    const dealerRow = dom.el('div', { className: 'row' }, [
      dom.el('span', { className: 'val mono', text: '10' })
    ]);
    const playerRow = dom.el('div', { className: 'row' }, [
      dom.el('span', { className: 'val mono', text: '10' }),
      dom.el('span', { className: 'val mono', text: '9' })
    ]);
    const feltIn = dom.el('div', { className: 'felt-in' }, [dealerRow, playerRow]);
    const felt = dom.el('div', { className: 'felt' }, [feltIn]);

    const hitBtn = dom.btn('Tirer', { className: 'btn btn-acc' });
    const standBtn = dom.btn('Rester', { className: 'btn btn-ghost' });
    const actions = dom.el('div', { className: 'actions' }, [hitBtn, standBtn]);
    const main = dom.el('main', {}, [felt, actions]);
    dom.doc.body.replaceChildren(main);

    // Player has 19 vs dealer 10 -> must click Rester
    expect(await solveKyara21Step()).toBe(true);
    expect(standBtn.clickCount).toBe(1);
    expect(hitBtn.clickCount).toBe(0);

    // Main suivante initially disabled -> waits and returns true without clicking
    const nextHandBtn = dom.btn('Main suivante', { className: 'btn btn-acc', disabled: true });
    actions.replaceChildren(nextHandBtn);
    expect(await solveKyara21Step()).toBe(true);
    expect(nextHandBtn.clickCount).toBe(0);

    // Main suivante becomes enabled -> clicked
    nextHandBtn.disabled = false;
    expect(await solveKyara21Step()).toBe(true);
    expect(nextHandBtn.clickCount).toBe(1);

    // Final round: Voir le résultat -> clicked
    const resultBtn = dom.btn('Voir le résultat', { className: 'btn btn-acc' });
    actions.replaceChildren(resultBtn);
    expect(await solveKyara21Step()).toBe(true);
    expect(resultBtn.clickCount).toBe(1);
  });

  it('does not get blocked by ol.dots (.ok/.ko) on Quiz round 2, clicks answer, Suivant, then Voir le résultat', async () => {
    setGamesFastModeForTest(true);
    dom.setPath('/jouer/qui-est-ce');

    const dots = dom.el('ol', { className: 'dots' }, [
      dom.el('li', { className: 'dot ok' }),
      dom.el('li', { className: 'dot ko' }),
      dom.el('li', { className: 'dot cur' })
    ]);
    const c1 = dom.btn('Naruto Uzumaki', { className: 'choice' });
    const c2 = dom.btn('Gojo Satoru', { className: 'choice' });
    const choices = dom.el('div', { className: 'choices' }, [c1, c2]);
    const arena = dom.el('div', { className: 'arena' }, [
      dots,
      dom.img('https://cdn.kyara.games/cards/sm/101.webp'),
      choices
    ]);
    const foot = dom.el('div', { className: 'foot' }, []);
    const main = dom.el('main', {}, [arena, foot]);
    dom.doc.body.replaceChildren(main);

    // Presence of .ok/.ko in ol.dots must NOT prevent clicking the answer on round 2
    expect(await solveSoloQuizStep('/jouer/qui-est-ce', catalog)).toBe(true);
    expect(c2.clickCount).toBe(1);
    expect(c1.clickCount).toBe(0);

    // After answer, Suivant appears in .foot -> clicked
    c2.classList.add('right');
    const nextBtn = dom.btn('Suivant', { className: 'btn btn-acc' });
    foot.replaceChildren(nextBtn);
    expect(await solveSoloQuizStep('/jouer/qui-est-ce', catalog)).toBe(true);
    expect(nextBtn.clickCount).toBe(1);

    // Last question -> Voir le résultat appears -> clicked
    const seeResultBtn = dom.btn('Voir le résultat', { className: 'btn btn-acc' });
    foot.replaceChildren(seeResultBtn);
    expect(await solveSoloQuizStep('/jouer/qui-est-ce', catalog)).toBe(true);
    expect(seeResultBtn.clickCount).toBe(1);
  });

  it('discards non-flush cards in Main Kyara when holding 4 same-family cards and discardsLeft=3, and plays when holding a flush', async () => {
    setGamesFastModeForTest(true);
    dom.setPath('/jouer/main-kyara');

    const mountPokerHand = (
      specs: Array<{ name: string; series: string; family: string; rarity: string }>,
      discardsLeft: number
    ) => {
      const hud = dom.el('div', { className: 'hud', text: `Score 0 · Mains 4 · Défausses ${discardsLeft}` });
      const discardBtn = dom.btn('Défausser', { className: 'btn btn-ghost', disabled: true });
      const playBtn = dom.btn('Jouer', { className: 'btn btn-acc', disabled: true });
      const slots = specs.map((c) => {
        const slot = dom.el('button', { className: 'slot', attrs: { 'aria-pressed': 'false' } }, [
          dom.el('div', { className: `tcg pf p-${c.rarity}` }, [
            dom.el('span', { className: 'pf-seal', text: c.rarity }),
            dom.el('span', { className: 'pf-name', text: c.name }),
            dom.el('span', { className: 'pf-ser', text: c.series }),
            dom.el('span', { className: 'pf-rib', attrs: { title: c.family } })
          ])
        ]) as StubHTMLButtonElement;
        slot.addEventListener('click', () => {
          const next = slot.getAttribute('aria-pressed') !== 'true';
          slot.setAttribute('aria-pressed', next ? 'true' : 'false');
          const pressedCount = slots.filter((s) => s.getAttribute('aria-pressed') === 'true').length;
          playBtn.disabled = pressedCount === 0;
          discardBtn.disabled = pressedCount === 0 || discardsLeft <= 0;
        });
        return slot;
      });
      const main = dom.el('main', {}, [
        hud,
        dom.el('div', { className: 'hand' }, slots),
        dom.el('div', { className: 'foot' }, [dom.el('div', { className: 'actions' }, [discardBtn, playBtn])])
      ]);
      dom.doc.body.replaceChildren(main);
      return { slots, discardBtn, playBtn };
    };

    // 4 same family ('Shonen') + 4 other cards (including a weak pair) -> must discard non-Shonen cards!
    const drawCase = mountPokerHand(
      [
        { name: 'A', series: 'S1', family: 'Shonen', rarity: 'R' },
        { name: 'B', series: 'S2', family: 'Shonen', rarity: 'U' },
        { name: 'C', series: 'S3', family: 'Shonen', rarity: 'C' },
        { name: 'D', series: 'S4', family: 'Shonen', rarity: 'E' },
        { name: 'E', series: 'PairS', family: 'Other1', rarity: 'C' },
        { name: 'F', series: 'PairS', family: 'Other2', rarity: 'C' },
        { name: 'G', series: 'S7', family: 'Other3', rarity: 'C' },
        { name: 'H', series: 'S8', family: 'Other4', rarity: 'C' }
      ],
      3
    );

    expect(await solveMainKyaraStep(catalog)).toBe(true);
    expect(drawCase.discardBtn.clickCount).toBe(1);
    expect(drawCase.playBtn.clickCount).toBe(0);
    expect(drawCase.slots.slice(0, 4).every((s) => s.getAttribute('aria-pressed') === 'false')).toBe(true);
    expect(drawCase.slots.slice(4).some((s) => s.getAttribute('aria-pressed') === 'true')).toBe(true);

    // 5 same family ('Shonen') -> flush! Must click Jouer!
    const flushCase = mountPokerHand(
      [
        { name: 'A', series: 'S1', family: 'Shonen', rarity: 'R' },
        { name: 'B', series: 'S2', family: 'Shonen', rarity: 'U' },
        { name: 'C', series: 'S3', family: 'Shonen', rarity: 'C' },
        { name: 'D', series: 'S4', family: 'Shonen', rarity: 'E' },
        { name: 'E', series: 'S5', family: 'Shonen', rarity: 'L' }
      ],
      3
    );

    expect(await solveMainKyaraStep(catalog)).toBe(true);
    expect(flushCase.playBtn.clickCount).toBe(1);
    expect(flushCase.discardBtn.clickCount).toBe(0);
  });

  it('prevents false positive in isGameFinishedScreen("main-du-jour") while button.slot is present', () => {
    const slot = dom.el('button', { className: 'slot', attrs: { 'aria-pressed': 'false' } });
    const linkBtn = dom.btn('Jouer à Main Kyara');
    const main = dom.el('main', {}, [dom.el('div', { className: 'hand' }, [slot]), linkBtn]);
    dom.doc.body.replaceChildren(main);

    expect(isGameFinishedScreen('main-du-jour')).toBe(false);

    // Once button.slot disappears, the replay button indicates the finished screen
    main.replaceChildren(linkBtn);
    expect(isGameFinishedScreen('main-du-jour')).toBe(true);
  });

  it('uses wall-clock deadline in humanSleep so 1Hz throttled timers do not multiply duration by 4x', async () => {
    setGamesFastModeForTest(false);
    let now = 1_000_000;
    let timerCalls = 0;
    const nowSpy = vi.spyOn(Date, 'now').mockImplementation(() => now);
    const timeoutSpy = vi.spyOn(globalThis, 'setTimeout').mockImplementation(((fn: (...args: any[]) => void, ms?: number) => {
      timerCalls += 1;
      // Simulate Chrome background tab 1Hz throttling: any <= 1000ms timer fires after 1000ms wall clock
      now += Math.max(Number(ms) || 0, 1000);
      queueMicrotask(() => fn());
      return timerCalls as unknown as ReturnType<typeof setTimeout>;
    }) as typeof setTimeout);

    try {
      const start = Date.now();
      await humanSleep(2000, 2000);
      const elapsed = Date.now() - start;
      expect(timerCalls).toBe(2);
      expect(elapsed).toBe(2000);
    } finally {
      timeoutSpy.mockRestore();
      nowSpy.mockRestore();
    }
  });

  it('serializes runSpaPilotTask locally per tab without acquiring an origin-wide Web Lock', async () => {
    mockChrome();
    const { request } = mockLocks();
    const { runSpaPilotTask } = await import('../src/content/operations');

    const order: string[] = [];
    let releaseFirst!: () => void;
    const firstGate = new Promise<void>((resolve) => { releaseFirst = resolve; });

    const p1 = runSpaPilotTask('games', async () => {
      order.push('games:start');
      await firstGate;
      order.push('games:end');
      return 'g';
    });
    const p2 = runSpaPilotTask('boosters', async () => {
      order.push('boosters:start');
      order.push('boosters:end');
      return 'b';
    });

    await new Promise((r) => setTimeout(r, 10));
    expect(order).toEqual(['games:start']);
    releaseFirst();

    expect(await Promise.all([p1, p2])).toEqual(['g', 'b']);
    expect(order).toEqual(['games:start', 'games:end', 'boosters:start', 'boosters:end']);
    expect(request).not.toHaveBeenCalled();
  });

  it('waits on /jouer/serie-express and /jouer/qui-est-ce when no card image is mounted yet instead of blind-clicking choice[0]', async () => {
    setGamesFastModeForTest(true);
    dom.setPath('/jouer/serie-express');
    const c1 = dom.btn('Naruto', { className: 'choice' });
    const c2 = dom.btn('Jujutsu Kaisen', { className: 'choice' });
    const arena = dom.el('div', { className: 'arena' }, [
      dom.el('div', { className: 'choices' }, [c1, c2])
    ]);
    dom.doc.body.replaceChildren(dom.el('main', {}, [arena]));

    expect(await solveSoloQuizStep('/jouer/serie-express', catalog)).toBe(true);
    expect(c1.clickCount).toBe(0);
    expect(c2.clickCount).toBe(0);
  });

  it('picks winner on /jouer/plus-aime at Streak 5 and intentionally picks loser at Streak 16 to cash out 3-star tickets', async () => {
    setGamesFastModeForTest(true);
    dom.setPath('/jouer/plus-aime');

    const mountPlusAime = (hudText: string) => {
      const hud = dom.el('div', { className: 'hud', text: hudText });
      const loserCard = dom.el('button', { className: 'pick' }, [
        dom.img('https://cdn.kyara.games/cards/sm/102.webp'),
        dom.el('span', { className: 'pf-name', text: 'Random Villager' })
      ]) as StubHTMLButtonElement;
      const winnerCard = dom.el('button', { className: 'pick' }, [
        dom.img('https://cdn.kyara.games/cards/sm/101.webp'),
        dom.el('span', { className: 'pf-name', text: 'Gojo Satoru' })
      ]) as StubHTMLButtonElement;
      const duel = dom.el('div', { className: 'duel' }, [loserCard, winnerCard]);
      dom.doc.body.replaceChildren(dom.el('main', {}, [hud, dom.el('div', { className: 'arena' }, [duel])]));
      return { loserCard, winnerCard };
    };

    const s5 = mountPlusAime('Streak 5');
    expect(await solveSoloQuizStep('/jouer/plus-aime', catalog)).toBe(true);
    expect(s5.winnerCard.clickCount).toBe(1);
    expect(s5.loserCard.clickCount).toBe(0);

    const s16 = mountPlusAime('Streak 16');
    expect(await solveSoloQuizStep('/jouer/plus-aime', catalog)).toBe(true);
    expect(s16.loserCard.clickCount).toBe(1);
    expect(s16.winnerCard.clickCount).toBe(0);
  });

  it('matches EN replay buttons in REPLAY_BTN_RE (New team, Replay for practice, Replay chapter)', () => {
    expect(REPLAY_BTN_RE.test('New team')).toBe(true);
    expect(REPLAY_BTN_RE.test('Replay for practice')).toBe(true);
    expect(REPLAY_BTN_RE.test('Replay chapter')).toBe(true);
  });

  it('clicks button.perk rendered in a document.body portal outside <main> in solveExpeditionStep', async () => {
    setGamesFastModeForTest(true);
    dom.setPath('/jouer/expedition');
    const main = dom.el('main', {}, [dom.el('div', { className: 'arena' })]);
    const atkPerk = dom.btn('+20% Attack damage', { className: 'perk' });
    const otherPerk = dom.btn('+5% Speed', { className: 'perk' });
    const portal = dom.el('div', { className: 'pk' }, [otherPerk, atkPerk]);
    dom.doc.body.replaceChildren(main, portal);

    expect(await solveExpeditionStep()).toBe(true);
    expect(atkPerk.clickCount).toBe(1);
    expect(otherPerk.clickCount).toBe(0);
  });

  it('clicks "Open the treasure" and "Choose a bonus" tile actions in solveExpeditionStep', async () => {
    setGamesFastModeForTest(true);
    dom.setPath('/jouer/expedition');

    const treasureBtn = dom.btn('Open the treasure', { className: 'btn btn-acc' });
    dom.doc.body.replaceChildren(
      dom.el('main', {}, [dom.el('div', { className: 'foot' }, [dom.el('div', { className: 'actions' }, [treasureBtn])])])
    );
    expect(await solveExpeditionStep()).toBe(true);
    expect(treasureBtn.clickCount).toBe(1);

    const bonusBtn = dom.btn('Choose a bonus', { className: 'btn btn-acc' });
    dom.doc.body.replaceChildren(
      dom.el('main', {}, [dom.el('div', { className: 'foot' }, [dom.el('div', { className: 'actions' }, [bonusBtn])])])
    );
    expect(await solveExpeditionStep()).toBe(true);
    expect(bonusBtn.clickCount).toBe(1);
  });

  it('clicks "Back on the road" in the EN expedition shop in solveExpeditionStep', async () => {
    setGamesFastModeForTest(true);
    dom.setPath('/jouer/expedition');

    const backBtn = dom.btn('Back on the road', { className: 'btn btn-acc' });
    dom.doc.body.replaceChildren(
      dom.el('main', {}, [
        dom.el('div', { className: 'arena' }, [dom.el('div', { className: 'shop' }, [backBtn])])
      ])
    );
    expect(await solveExpeditionStep()).toBe(true);
    expect(backBtn.clickCount).toBe(1);
  });

  it('uses 2-pass unpick-then-pick in solveExpeditionStep when pre-selected cards fill the budget and disable stronger cards', async () => {
    setGamesFastModeForTest(true);
    dom.setPath('/jouer/expedition');

    const budget = 6;
    const specs = [
      { name: 'WeakA', rarity: 'C', atk: 5, hp: 5, cost: 3, picked: true },
      { name: 'WeakB', rarity: 'C', atk: 5, hp: 5, cost: 3, picked: true },
      { name: 'StrongA', rarity: 'M', atk: 80, hp: 80, cost: 3, picked: false },
      { name: 'StrongB', rarity: 'M', atk: 80, hp: 80, cost: 3, picked: false }
    ];
    const clickOrder: string[] = [];
    const confirmBtn = dom.btn('Confirm the team', { className: 'btn btn-acc' });
    const buttons: StubHTMLButtonElement[] = [];

    const syncDisabled = () => {
      const used = specs.reduce((sum, s, idx) => sum + (buttons[idx].classList.contains('picked') ? s.cost : 0), 0);
      specs.forEach((s, idx) => {
        const picked = buttons[idx].classList.contains('picked');
        buttons[idx].disabled = !picked && used + s.cost > budget;
      });
    };

    specs.forEach((s) => {
      const btn = dom.el(
        'button',
        { className: s.picked ? 'pick picked' : 'pick', attrs: { 'aria-pressed': s.picked ? 'true' : 'false' } },
        [
          dom.el('div', { className: `tcg pf p-${s.rarity}` }, [
            dom.el('span', { className: 'pf-seal', text: s.rarity }),
            dom.el('span', { className: 'pf-name', text: s.name }),
            dom.el('span', { className: 'pcost', text: String(s.cost) }),
            dom.el('div', { className: 'stats' }, [
              dom.el('span', { attrs: { title: 'Attack' } }, [dom.el('b', { className: 'mono', text: String(s.atk) })]),
              dom.el('span', { attrs: { title: 'Health' } }, [dom.el('b', { className: 'mono', text: String(s.hp) })])
            ])
          ])
        ]
      ) as StubHTMLButtonElement;
      btn.addEventListener('click', () => {
        const next = !btn.classList.contains('picked');
        btn.classList.toggle('picked', next);
        btn.setAttribute('aria-pressed', next ? 'true' : 'false');
        clickOrder.push(`${next ? 'pick' : 'unpick'}:${s.name}`);
        syncDisabled();
      });
      buttons.push(btn);
    });
    syncDisabled();

    // Initially StrongA and StrongB are disabled because budget is 6/6
    expect(buttons[2].disabled).toBe(true);
    expect(buttons[3].disabled).toBe(true);

    const picker = dom.el('div', { className: 'picker' }, [
      dom.el('div', { className: 'gauge', text: '6 / 6' }),
      dom.el('div', { className: 'pool' }, buttons),
      dom.el('div', { className: 'foot' }, [confirmBtn])
    ]);
    dom.doc.body.replaceChildren(dom.el('main', {}, [picker]));

    expect(await solveExpeditionStep()).toBe(true);
    expect(clickOrder).toEqual(['unpick:WeakA', 'unpick:WeakB', 'pick:StrongA', 'pick:StrongB']);
    expect(confirmBtn.clickCount).toBe(1);
  });

  it('clicks Next button on /jouer/blind-test when choices display .right/.wrong (hasResult)', async () => {
    setGamesFastModeForTest(true);
    dom.setPath('/jouer/blind-test');

    const c1 = dom.btn('Jujutsu Kaisen', { className: 'choice right' });
    const c2 = dom.btn('Naruto', { className: 'choice wrong' });
    // Button outside .foot/.actions (or without .btn-acc) so it exercises the blind-test hasResult branch
    const nextBtn = dom.btn('Next', { className: 'btn' });
    const arena = dom.el('div', { className: 'arena' }, [
      dom.el('div', { className: 'choices' }, [c1, c2]),
      nextBtn
    ]);
    dom.doc.body.replaceChildren(dom.el('main', {}, [arena]));

    expect(await solveSoloQuizStep('/jouer/blind-test', catalog)).toBe(true);
    expect(nextBtn.clickCount).toBe(1);
    expect(c1.clickCount).toBe(0);
    expect(c2.clickCount).toBe(0);
  });

  it('restarts a game cleanly from a residual end screen (Play again) and stops mid-batch when cap is reached', async () => {
    mockChrome({
      settings: {
        dryRun: false,
        autoGamesEnabled: true,
        autoGamesDailyEnabled: false,
        autoGamesTargetGame: 'qui-est-ce'
      }
    });

    let today = 56;
    let balance = 100;
    mocks.api.mockImplementation(async (path: string) => {
      if (path === '/play/arcade') {
        return { enabled: true, blocked: null, balance, today, dayCap: 60, week: 120, weekCap: 300, lots: [] };
      }
      return null;
    });

    const mountActiveQuiz = () => {
      const qChoice = dom.btn('Gojo Satoru', { className: 'choice' });
      const choices = dom.el('div', { className: 'choices' }, [
        dom.btn('Naruto Uzumaki', { className: 'choice' }),
        qChoice
      ]);
      const arena = dom.el('div', { className: 'arena' }, [
        dom.img('https://cdn.kyara.games/cards/sm/101.webp'),
        choices
      ]);
      const main = dom.el('main', {}, [arena]);
      qChoice.addEventListener('click', () => {
        balance += 4;
        today += 4; // reaches dayCap (60/60) after 1st run
        const replay = dom.btn('Play again');
        replay.addEventListener('click', () => mountActiveQuiz());
        main.replaceChildren(replay);
      });
      dom.doc.body.replaceChildren(main);
    };

    // Start already on /jouer/qui-est-ce showing a residual finished screen ("Play again")
    dom.setPath('/jouer/qui-est-ce');
    const initialReplay = dom.btn('Play again');
    initialReplay.addEventListener('click', () => mountActiveQuiz());
    dom.doc.body.replaceChildren(dom.el('main', {}, [initialReplay]));

    // Dedicated tab SPA navigation stays on the existing DOM without resetting it
    mocks.navigate.mockResolvedValue(true);

    const res = await executeAutoGames(
      { me: { id: 1 } },
      { manual: false, gameId: 'qui-est-ce', dedicatedTab: true, _fastForTest: true }
    );

    expect(initialReplay.clickCount).toBe(1);
    expect(res.playedGames).toBe(1);
    expect(res.ticketsEarned).toBe(4);
    expect(res.arcade?.today).toBe(60);
  });

  it('deselects [3,4,5,6,7] before selecting [0,1,2] in applySlotSelection and solvePokerHandStep under a strict 5-card selection cap', async () => {
    setGamesFastModeForTest(true);
    dom.setPath('/jouer/main-kyara');

    const MAX_SELECTED = 5;
    const clickLog: string[] = [];

    const makeCappedSlots = (initialPressed: number[]) => {
      const pressedSet = new Set(initialPressed);
      const specs = [
        { name: 'Tri1', series: 'SameSer', family: 'Fam1', rarity: 'L' },
        { name: 'Tri2', series: 'SameSer', family: 'Fam2', rarity: 'L' },
        { name: 'Tri3', series: 'SameSer', family: 'Fam3', rarity: 'L' },
        { name: 'Junk3', series: 'S3', family: 'Fam4', rarity: 'C' },
        { name: 'Junk4', series: 'S4', family: 'Fam5', rarity: 'C' },
        { name: 'Junk5', series: 'S5', family: 'Fam6', rarity: 'C' },
        { name: 'Junk6', series: 'S6', family: 'Fam7', rarity: 'C' },
        { name: 'Junk7', series: 'S7', family: 'Fam8', rarity: 'C' }
      ];
      const slots: StubHTMLButtonElement[] = [];
      specs.forEach((c, idx) => {
        const slot = dom.el(
          'button',
          { className: 'slot', attrs: { 'aria-pressed': pressedSet.has(idx) ? 'true' : 'false' } },
          [
            dom.el('div', { className: `tcg pf p-${c.rarity}` }, [
              dom.el('span', { className: 'pf-seal', text: c.rarity }),
              dom.el('span', { className: 'pf-name', text: c.name }),
              dom.el('span', { className: 'pf-ser', text: c.series }),
              dom.el('span', { className: 'pf-rib', attrs: { title: c.family } })
            ])
          ]
        ) as StubHTMLButtonElement;
        slot.addEventListener('click', () => {
          const isPressed = slot.getAttribute('aria-pressed') === 'true';
          if (isPressed) {
            slot.setAttribute('aria-pressed', 'false');
            clickLog.push(`deselect:${idx}`);
          } else {
            const count = slots.filter((s) => s.getAttribute('aria-pressed') === 'true').length;
            if (count >= MAX_SELECTED) {
              clickLog.push(`blocked:${idx}`);
              return;
            }
            slot.setAttribute('aria-pressed', 'true');
            clickLog.push(`select:${idx}`);
          }
        });
        slots.push(slot);
      });
      return slots;
    };

    // 1) Direct applySlotSelection test: [3,4,5,6,7] already selected -> switch to [0,1,2]
    const directSlots = makeCappedSlots([3, 4, 5, 6, 7]);
    const ok = await applySlotSelection(directSlots as unknown as HTMLButtonElement[], [0, 1, 2]);
    expect(ok).toBe(true);
    expect(clickLog).toEqual([
      'deselect:3',
      'deselect:4',
      'deselect:5',
      'deselect:6',
      'deselect:7',
      'select:0',
      'select:1',
      'select:2'
    ]);
    expect(directSlots.map((s) => s.getAttribute('aria-pressed'))).toEqual([
      'true',
      'true',
      'true',
      'false',
      'false',
      'false',
      'false',
      'false'
    ]);

    // 2) End-to-end solvePokerHandStep test: [3,4,5,6,7] selected via discard -> discard stays disabled -> fallback play selects [0,1,2]
    clickLog.length = 0;
    const hud = dom.el('div', { className: 'hud', text: 'Score 0 · Mains 4 · Défausses 3' });
    const discardBtn = dom.btn('Défausser', { className: 'btn btn-ghost', disabled: true });
    const playBtn = dom.btn('Jouer', { className: 'btn btn-acc', disabled: true });
    const pokerSlots = makeCappedSlots([]);
    pokerSlots.forEach((slot) => {
      slot.addEventListener('click', () => {
        const pressedCount = pokerSlots.filter((s) => s.getAttribute('aria-pressed') === 'true').length;
        // Discard stays disabled to force the discard -> play fallback path
        playBtn.disabled = pressedCount === 0;
      });
    });

    const main = dom.el('main', {}, [
      hud,
      dom.el('div', { className: 'hand' }, pokerSlots),
      dom.el('div', { className: 'foot' }, [dom.el('div', { className: 'actions' }, [discardBtn, playBtn])])
    ]);
    dom.doc.body.replaceChildren(main);

    expect(await solvePokerHandStep(catalog)).toBe(true);
    expect(discardBtn.clickCount).toBe(0);
    expect(playBtn.clickCount).toBe(1);
    expect(clickLog.some((e) => e.startsWith('blocked:'))).toBe(false);
    expect(pokerSlots.map((s) => s.getAttribute('aria-pressed'))).toEqual([
      'true',
      'true',
      'true',
      'false',
      'false',
      'false',
      'false',
      'false'
    ]);
  });
});
