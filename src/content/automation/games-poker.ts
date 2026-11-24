import {
  DEFAULT_POW_BY_RARITY,
  chooseBestDailyHandIndices,
  decideMainKyaraAction,
  extractCardIdFromUrl,
  type DailyHandCard
} from '../../lib/analytics/games-solver';
import { sleep } from '../utils';
import {
  REPLAY_BTN_RE,
  START_MODE_RE,
  cleanBtnText,
  clickAdvanceOrNextButton,
  findButtonByText,
  humanSleep,
  isButtonUsable,
  isElementVisible,
  isGamesFastModeForTest,
  parseRarityFromCardEl,
  safeInterrupted,
  waitForEnabledButton
} from './games-core';

const TUTO_DISMISS_RE = /^(?:Compris|J'ai compris|Got it|Start|Commencer|OK)\b/i;
const DISCARD_BTN_RE = /^(?:D[eé]fausser|Discard)\b/i;
const PLAY_BTN_RE = /^(?:Jouer|Play)\b/i;

export interface PokerHudState {
  score: number;
  handsLeft: number;
  discardsLeft: number;
}

function normalizeName(value: unknown): string {
  return String(value || '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ');
}

function lookupCatalogEntry(
  cardId: number | null,
  name: string,
  catalogById?: Map<number, any>
): any | null {
  if (!catalogById || !catalogById.size) return null;
  if (cardId !== null && catalogById.has(cardId)) return catalogById.get(cardId);
  const norm = normalizeName(name);
  if (!norm) return null;
  for (const entry of catalogById.values()) {
    if (normalizeName(entry?.name) === norm) return entry;
  }
  return null;
}

export function parseHandSlotsDom(catalogById?: Map<number, any>): {
  cards: DailyHandCard[];
  slots: HTMLButtonElement[];
} {
  if (typeof document === 'undefined') return { cards: [], slots: [] };
  let slots = Array.from(document.querySelectorAll<HTMLButtonElement>('main div.hand button.slot'));
  if (!slots.length) {
    slots = Array.from(document.querySelectorAll<HTMLButtonElement>('main button.slot[aria-pressed]'));
  }
  const cards: DailyHandCard[] = slots.map((slot) => {
    const name = slot.querySelector('.pf-name')?.textContent?.trim() || '';
    const series = slot.querySelector('.pf-ser')?.textContent?.trim() || '';
    const family =
      slot.querySelector('.pf-rib')?.getAttribute('title')?.trim() ||
      slot.querySelector('.pf-rib .pf-ser')?.textContent?.trim() ||
      '';
    const rarity = parseRarityFromCardEl(slot);
    const imgSrc = slot.querySelector<HTMLImageElement>('img[src*="/cards/"]')?.src;
    const cardId = extractCardIdFromUrl(imgSrc);
    const entry = lookupCatalogEntry(cardId, name, catalogById);
    const rawPow = entry?.pow ?? entry?.power;
    const pow =
      rawPow !== undefined && rawPow !== null && Number.isFinite(Number(rawPow)) && Number(rawPow) > 0
        ? Number(rawPow)
        : DEFAULT_POW_BY_RARITY[rarity] ?? 30;
    return {
      name,
      series: series || String(entry?.series || '').trim(),
      family: family || String(entry?.family || '').trim(),
      rarity,
      pow
    };
  });
  return { cards, slots };
}

function parseMetricFromText(text: string, labelPattern: string): number | null {
  const forward = new RegExp(`(?:${labelPattern})\\s*[:·-]?\\s*(\\d[\\d\\s,.]*)`, 'i').exec(text);
  if (forward) {
    const num = Number(forward[1].replace(/[^\d]/g, ''));
    if (Number.isFinite(num)) return num;
  }
  const reverse = new RegExp(`(\\d[\\d\\s,.]*)\\s*(?:${labelPattern})`, 'i').exec(text);
  if (reverse) {
    const num = Number(reverse[1].replace(/[^\d]/g, ''));
    if (Number.isFinite(num)) return num;
  }
  return null;
}

export function readPokerHud(): PokerHudState {
  const fallback: PokerHudState = { score: 0, handsLeft: 4, discardsLeft: 3 };
  if (typeof document === 'undefined') return fallback;
  const hud = document.querySelector('main .hud') || document.querySelector('.hud');
  if (!hud) return fallback;
  const text = (hud.textContent || '').replace(/\s+/g, ' ').trim();
  if (!text) return fallback;

  const score = parseMetricFromText(text, 'Score|Points|Pts');
  const handsLeft = parseMetricFromText(text, 'Mains?|Hands?');
  const discardsLeft = parseMetricFromText(text, 'D[eé]fausses?|Discards?');

  return {
    score: score !== null ? score : fallback.score,
    handsLeft: handsLeft !== null ? handsLeft : fallback.handsLeft,
    discardsLeft: discardsLeft !== null ? discardsLeft : fallback.discardsLeft
  };
}

function findTutorialDismissButton(): HTMLButtonElement | null {
  const modals = Array.from(
    document.querySelectorAll('dialog[open], dialog, [role="dialog"], .modal, .tuto, [class*="tuto"], [id*="kyara_play_tuto"]')
  ).filter((el) => isElementVisible(el));
  for (const modal of modals) {
    const btn = findButtonByText(modal, TUTO_DISMISS_RE);
    if (btn) return btn;
  }
  return null;
}

function findDiscardActionButton(scope: ParentNode, requireUsable: boolean): HTMLButtonElement | null {
  const selectors = '.foot .actions button.btn-ghost, main .actions button.btn-ghost, .actions button.btn-ghost';
  const candidates = Array.from(scope.querySelectorAll<HTMLButtonElement>(selectors));
  const byClass = candidates.find((b) => {
    if (!isElementVisible(b)) return false;
    if (requireUsable && !isButtonUsable(b)) return false;
    const txt = cleanBtnText(b);
    return !txt || DISCARD_BTN_RE.test(txt);
  });
  if (byClass) return byClass;
  if (requireUsable) return findButtonByText(scope, DISCARD_BTN_RE);
  return (
    Array.from(scope.querySelectorAll<HTMLButtonElement>('button')).find(
      (b) => isElementVisible(b) && DISCARD_BTN_RE.test(cleanBtnText(b))
    ) || null
  );
}

function findPlayActionButton(scope: ParentNode): HTMLButtonElement | null {
  const selectors = '.foot .actions button.btn.btn-acc:not(:disabled), main .actions button.btn-acc:not(:disabled), .actions button.btn-acc:not(:disabled)';
  const candidates = Array.from(scope.querySelectorAll<HTMLButtonElement>(selectors));
  const byClass = candidates.find((b) => {
    if (!isButtonUsable(b)) return false;
    const txt = cleanBtnText(b);
    return !REPLAY_BTN_RE.test(txt) && !START_MODE_RE.test(txt) && (!txt || PLAY_BTN_RE.test(txt));
  });
  if (byClass) return byClass;
  const byText = findButtonByText(scope, PLAY_BTN_RE);
  if (byText && !REPLAY_BTN_RE.test(cleanBtnText(byText)) && !START_MODE_RE.test(cleanBtnText(byText))) {
    return byText;
  }
  return null;
}

export async function applySlotSelection(slots: HTMLButtonElement[], indices: number[]): Promise<boolean> {
  const targetSet = new Set(indices);
  // Pass 1: deselect unwanted pressed slots first so the 5-card UI selection cap never blocks new picks.
  for (let i = 0; i < slots.length; i += 1) {
    if (safeInterrupted()) return false;
    const slot = slots[i];
    if (!isButtonUsable(slot)) continue;
    const isPressed = slot.getAttribute('aria-pressed') === 'true';
    if (isPressed && !targetSet.has(i)) {
      slot.click();
      await humanSleep(160, 340);
    }
  }
  // Pass 2: select target slots now that freed slots are available.
  for (let i = 0; i < slots.length; i += 1) {
    if (safeInterrupted()) return false;
    const slot = slots[i];
    if (!isButtonUsable(slot)) continue;
    const isPressed = slot.getAttribute('aria-pressed') === 'true';
    if (!isPressed && targetSet.has(i)) {
      slot.click();
      await humanSleep(160, 340);
    }
  }
  return !safeInterrupted();
}

async function waitAfterPokerAction(hudBefore: string): Promise<void> {
  if (isGamesFastModeForTest() || safeInterrupted()) return;
  const totalWait = Math.round(2200 + Math.random() * 600);
  const deadline = Date.now() + totalWait;
  await humanSleep(900, 1200);
  while (!safeInterrupted() && Date.now() < deadline) {
    const hudNow = (document.querySelector('main .hud, .hud')?.textContent || '').trim();
    const hasSlots = document.querySelectorAll('main div.hand button.slot, main button.slot[aria-pressed]').length > 0;
    if (!hasSlots) return;
    if (hudBefore && hudNow && hudNow !== hudBefore) {
      await humanSleep(350, 550);
      return;
    }
    await sleep(180);
  }
}

export async function solvePokerHandStep(
  catalogById: Map<number, any>,
  options: { allowStart?: boolean } = {}
): Promise<boolean> {
  if (typeof document === 'undefined') return false;
  const scope = document.querySelector('main') || document;

  const tutoBtn = findTutorialDismissButton();
  if (tutoBtn) {
    tutoBtn.click();
    await humanSleep(450, 750);
    return true;
  }

  const { cards, slots } = parseHandSlotsDom(catalogById);
  if (!slots.length) {
    if (options.allowStart) {
      const modeBtn = document.querySelector<HTMLButtonElement>('.gi .modes button.mode.main:not(:disabled)');
      const startBtn = (modeBtn && isButtonUsable(modeBtn) ? modeBtn : null) || findButtonByText(scope, START_MODE_RE);
      if (startBtn) {
        startBtn.click();
        await humanSleep(900, 1500);
        return true;
      }
    }
    return clickAdvanceOrNextButton(scope);
  }

  if (!slots.some((s) => isButtonUsable(s))) {
    return clickAdvanceOrNextButton(scope);
  }

  const hud = readPokerHud();
  const decision = decideMainKyaraAction(cards, hud);
  const canDiscard = hud.discardsLeft > 0 && Boolean(findDiscardActionButton(scope, false));

  let action: 'play' | 'discard' = decision.action;
  let indices = decision.indices;
  if (action === 'discard' && !canDiscard) {
    action = 'play';
    indices = chooseBestDailyHandIndices(cards);
  }

  if (!(await applySlotSelection(slots, indices))) return false;

  let actionBtn = await waitForEnabledButton(
    () => (action === 'discard' ? findDiscardActionButton(scope, true) : findPlayActionButton(scope)),
    2800
  );

  if (!actionBtn && action === 'discard') {
    action = 'play';
    indices = chooseBestDailyHandIndices(cards);
    if (!(await applySlotSelection(slots, indices))) return false;
    actionBtn = await waitForEnabledButton(() => findPlayActionButton(scope), 2800);
  }

  if (!actionBtn) return false;

  const hudBefore = (document.querySelector('main .hud, .hud')?.textContent || '').trim();
  actionBtn.click();
  await waitAfterPokerAction(hudBefore);
  return true;
}
