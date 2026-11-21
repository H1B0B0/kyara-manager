import {
  chooseBestDailyHandIndices,
  chooseBestRaidTeamIndices,
  matchBlindTestChoice,
  pickExpeditionNextIndex,
  pickThreeArcsLineIndex,
  type DailyHandCard
} from '../../lib/analytics/games-solver';
import type { Rarity } from '../../types/kyara';
import { isInterrupted } from '../safety';
import { sleep } from '../utils';

const KM_IGNORE_SEL = '#km-inpage-games-bar, .km-inpage-bar, #km-floating-hud, #km-cockpit-overlay';
const ADVANCE_IGNORE_SEL = `${KM_IGNORE_SEL}, .play-tool, .tabs, .sh`;
const RARITY_SCORE: Record<Rarity, number> = { C: 1, U: 2, R: 3, E: 4, L: 5, M: 6 };

export const START_MODE_RE = /^(?:Play solo|Jouer solo|Jouer en solo)\b/i;
export const REPLAY_BTN_RE =
  /^(?:Play again|Rejouer|Try again|Réessayer|New game|Nouvelle partie|New expedition|Nouvelle expédition|Rematch|Revanche|Jouer à Main Kyara|Play Kyara Hand)\b/i;
export const NEXT_BTN_RE =
  /^(?:Suivant(?:e)?|Suite|Continuer|Question suivante|Manche suivante|Main suivante|Tour suivant|Vague suivante|Étape suivante|Etape suivante|Combattre|Attaquer|Passer|Passer le tour|Valider|Confirmer(?:\s+l'[eé]quipe)?|Terminer(?:\s*[×x]\d+)?|Finir|Fin|Encaisser|Récupérer|Réclamer|Collecter|Distribuer|Next(?:\s+(?:question|round|hand|turn|wave|step|stage))?|Continue|Proceed|Advance|Submit|Confirm(?:\s+the\s+team)?|Validate|Fight|Finish(?:\s*[×x]\d+)?|Done|Claim|Collect|Deal)(?:\s*[→➜›»>▶].*)?$/i;
const ADVANCE_EXCLUDE_RE =
  /\b(?:discord|copier|copy|partager|share|classement|leaderboard|ranking|règles|regles|rules|son|sound|audio|mute|défausser|defausser|discard|abandonner|forfeit|quitter|exit|retour|back)\b/i;

let fastForTestMode = false;
export function setGamesFastModeForTest(enabled: boolean): void {
  fastForTestMode = enabled;
}

export function safeInterrupted(): boolean {
  try {
    return isInterrupted();
  } catch {
    return false;
  }
}

export async function humanSleep(minMs: number, maxMs = minMs): Promise<void> {
  if (fastForTestMode || safeInterrupted()) return;
  const lo = Math.max(0, minMs);
  const hi = Math.max(lo, maxMs);
  let remaining = Math.round(lo + ((Math.random() + Math.random()) / 2) * (hi - lo));
  while (remaining > 0 && !safeInterrupted()) {
    const step = Math.min(remaining, 250);
    await sleep(step);
    remaining -= step;
  }
}

export function cleanBtnText(el: Element): string {
  const raw = (el instanceof HTMLElement ? el.innerText || el.textContent : el.textContent) || '';
  return raw.replace(/[\u2018\u2019]/g, "'").replace(/\s+/g, ' ').trim();
}

export function isButtonUsable(btn: HTMLButtonElement, ignoreSelector = KM_IGNORE_SEL): boolean {
  if (btn.disabled || btn.getAttribute('aria-disabled') === 'true' || btn.closest(ignoreSelector)) return false;
  if (btn.hidden || btn.closest('[hidden]') || btn.style?.display === 'none' || btn.style?.visibility === 'hidden') return false;
  try {
    if (typeof getComputedStyle === 'function') {
      const style = getComputedStyle(btn);
      if (style.display === 'none' || style.visibility === 'hidden') return false;
    }
  } catch {}
  return true;
}

export function findButtonByText(root: ParentNode, re: RegExp): HTMLButtonElement | null {
  if (!root || typeof root.querySelectorAll !== 'function') return null;
  return Array.from(root.querySelectorAll<HTMLButtonElement>('button:not(:disabled)')).find(
    (b) => isButtonUsable(b) && re.test(cleanBtnText(b))
  ) || null;
}

export async function waitForEnabledButton(finder: () => HTMLButtonElement | null, timeoutMs = 2600): Promise<HTMLButtonElement | null> {
  const deadline = Date.now() + (fastForTestMode ? 0 : timeoutMs);
  while (true) {
    const btn = finder();
    if (btn && isButtonUsable(btn)) return btn;
    if (fastForTestMode || safeInterrupted() || Date.now() >= deadline) return null;
    await sleep(90);
  }
}

export function findAdvanceOrNextButton(root?: ParentNode): HTMLButtonElement | null {
  const scope = root ?? (typeof document !== 'undefined' ? document.querySelector('main') || document : null);
  if (!scope || typeof scope.querySelectorAll !== 'function') return null;

  const usable = Array.from(scope.querySelectorAll<HTMLButtonElement>('button:not(:disabled)')).filter((b) =>
    isButtonUsable(b, ADVANCE_IGNORE_SEL)
  );
  const labeled = usable.filter((b) => {
    const txt = cleanBtnText(b);
    return Boolean(txt) && !REPLAY_BTN_RE.test(txt) && !START_MODE_RE.test(txt) && !ADVANCE_EXCLUDE_RE.test(txt) && NEXT_BTN_RE.test(txt);
  });
  if (labeled.length > 0) {
    return labeled.find((b) => Boolean(b.closest('.arena, .foot .actions, .extra, .actions'))) || labeled[0];
  }

  const containers = Array.from(scope.querySelectorAll<HTMLElement>('.arena, .foot .actions, .extra, .actions'));
  for (const box of containers.length ? containers : [scope]) {
    const match = Array.from(box.querySelectorAll<HTMLButtonElement>('.btn.btn-acc:not(:disabled), button.next:not(:disabled)')).find((b) => {
      if (!isButtonUsable(b, ADVANCE_IGNORE_SEL) || b.classList.contains('mode') || b.closest('.modes, .hand, .pool, .picker')) return false;
      if (b.getAttribute('role') === 'tab' || b.querySelector('.tcg.pf, .pf-name')) return false;
      const txt = cleanBtnText(b);
      if (!txt) return b.classList.contains('next');
      if (REPLAY_BTN_RE.test(txt) || START_MODE_RE.test(txt) || ADVANCE_EXCLUDE_RE.test(txt)) return false;
      return !/^(?:Play|Jouer|Discard|Défausser|Hit|Tirer|Carte|Stand|Rester|Stopper)\b/i.test(txt);
    });
    if (match) return match;
  }
  return null;
}

export async function clickAdvanceOrNextButton(root?: ParentNode, preMinMs = 0, preMaxMs = preMinMs): Promise<boolean> {
  const initial = findAdvanceOrNextButton(root);
  if (!initial) return false;
  if (preMinMs > 0) await humanSleep(preMinMs, preMaxMs);
  if (safeInterrupted()) return false;
  const btn = preMinMs > 0 ? findAdvanceOrNextButton(root) : initial;
  if (!btn) return false;
  btn.click();
  await humanSleep(900, 1500);
  return true;
}

export async function advanceOrWaitTransition(): Promise<boolean> {
  if (await clickAdvanceOrNextButton(undefined, 900, 1600)) return true;
  await humanSleep(700, 1100);
  return false;
}

export function hasAnsweredChoices(arena: ParentNode, choiceEls: Element[] = []): boolean {
  const hasState = (el: Element) => /\b(?:ok|ko|chosen|right|wrong)\b/.test(el.className);
  const disabledCount = choiceEls.filter((el) => (el as HTMLButtonElement).disabled || el.getAttribute('aria-disabled') === 'true').length;
  if (choiceEls.some(hasState)) return true;
  if (choiceEls.length >= 2 && disabledCount >= Math.ceil(choiceEls.length / 2)) return true;
  return Array.from(arena.querySelectorAll('.ok, .ko, .chosen, .right, .wrong')).some((el) => !el.closest(`.hud, .score, ${KM_IGNORE_SEL}`));
}

export function hasDiscordGate(): boolean {
  if (typeof document === 'undefined') return false;
  return Array.from(document.querySelectorAll('main .wait .ko, main .err, .extra p.err, main p.err')).some((el) =>
    /discord|403|lie.*discord|connect.*discord/i.test(el.textContent || '')
  );
}

export function parseRarityFromCardEl(el: Element): Rarity {
  const rawSeal = el.querySelector('.pf-seal')?.textContent?.trim().toUpperCase() || '';
  if (['C', 'U', 'R', 'E', 'L', 'M'].includes(rawSeal)) return rawSeal as Rarity;
  const match = (el.querySelector('.tcg.pf')?.className || el.className || '').match(/\bp-([CURELM])\b/i);
  return (match ? match[1].toUpperCase() : 'C') as Rarity;
}

export function parseHandSlotsDom(): { cards: DailyHandCard[]; slots: HTMLButtonElement[] } {
  if (typeof document === 'undefined') return { cards: [], slots: [] };
  let slots = Array.from(document.querySelectorAll<HTMLButtonElement>('main div.hand button.slot'));
  if (!slots.length) slots = Array.from(document.querySelectorAll<HTMLButtonElement>('main button.slot[aria-pressed]'));
  const cards: DailyHandCard[] = slots.map((slot) => ({
    name: slot.querySelector('.pf-name')?.textContent?.trim() || '',
    series: slot.querySelector('.pf-ser')?.textContent?.trim() || '',
    family: slot.querySelector('.pf-rib')?.getAttribute('title')?.trim() || slot.querySelector('.pf-rib .pf-ser')?.textContent?.trim() || '',
    rarity: parseRarityFromCardEl(slot)
  }));
  return { cards, slots };
}

const dailyRaidStorageKey = (meId?: string | number) => `km_daily_raid_${meId ?? 'anon'}`;
const todayDateStamp = () => new Date().toISOString().slice(0, 10);

export function markDailyRaidPlayed(meId?: string | number): void {
  try {
    if (typeof localStorage !== 'undefined') localStorage.setItem(dailyRaidStorageKey(meId), todayDateStamp());
  } catch {}
}

export async function isDailyRaidAlreadyPlayed(meId?: string | number): Promise<boolean> {
  try {
    if (typeof localStorage !== 'undefined' && localStorage.getItem(dailyRaidStorageKey(meId)) === todayDateStamp()) return true;
    if (typeof document !== 'undefined' && window.location.pathname.startsWith('/jouer/raid-du-jour')) {
      if (/déjà joué|already played|revenez demain|come back tomorrow/i.test(document.querySelector('main')?.textContent || '')) {
        markDailyRaidPlayed(meId);
        return true;
      }
    }
  } catch {}
  return false;
}

async function clickAndHumanSleep(btn: HTMLButtonElement | null, minMs = 1100, maxMs = 1900): Promise<boolean> {
  if (!btn || !isButtonUsable(btn)) return false;
  btn.click();
  await humanSleep(minMs, maxMs);
  return true;
}

function findMainModeButton(): HTMLButtonElement | null {
  const mode = document.querySelector<HTMLButtonElement>('.gi .modes button.mode.main:not(:disabled)');
  return (mode && isButtonUsable(mode) ? mode : null) || findButtonByText(document, START_MODE_RE);
}

export async function solveHandCardStep(opts: { allowStart: boolean; allowDiscard: boolean }): Promise<boolean> {
  if (typeof document === 'undefined') return false;
  const scope = document.querySelector('main') || document;
  const { cards, slots } = parseHandSlotsDom();
  if (!cards.length) {
    if (await clickAdvanceOrNextButton(scope)) return true;
    if (!opts.allowStart) return false;
    const startBtn =
      findMainModeButton() || findButtonByText(scope, /^(?:New game|Nouvelle partie|Play again|Rejouer|Start|Commencer)\b/i);
    return clickAndHumanSleep(startBtn, 1100, 1800);
  }
  if (!slots.some((s) => !s.disabled)) return clickAdvanceOrNextButton(scope);

  const pick = new Set(chooseBestDailyHandIndices(cards));
  for (let i = 0; i < slots.length; i += 1) {
    if (!slots[i].disabled && (slots[i].getAttribute('aria-pressed') === 'true') !== pick.has(i)) {
      slots[i].click();
      await humanSleep(160, 340);
    }
  }

  const findPlay = () => {
    const cand =
      document.querySelector<HTMLButtonElement>('.foot .actions button.btn.btn-acc:not(:disabled)') ||
      document.querySelector<HTMLButtonElement>('main .actions button.btn-acc:not(:disabled)') ||
      findButtonByText(scope, /^(?:Play|Jouer)\b/i);
    return cand && !REPLAY_BTN_RE.test(cleanBtnText(cand)) ? cand : null;
  };
  let actionBtn = await waitForEnabledButton(findPlay, 2600);
  if (!actionBtn && opts.allowDiscard) {
    actionBtn = await waitForEnabledButton(
      () => document.querySelector<HTMLButtonElement>('.foot .actions button.btn-ghost:not(:disabled)') || findButtonByText(scope, /^(?:Discard|Défausser)\b/i),
      800
    );
  }
  if (!actionBtn) return false;
  actionBtn.click();
  await humanSleep(2200, 2900);
  return true;
}

export async function solveMainKyaraStep(): Promise<boolean> {
  return solveHandCardStep({ allowStart: true, allowDiscard: true });
}

export function parseRaidPoolCards(buttons: HTMLButtonElement[]) {
  return buttons.map((btn) => {
    const atkTxt = btn.querySelector('.stats [title="Attack"] b.mono, .stats [title="Attaque"] b.mono, [title*="Attack" i] b')?.textContent || '0';
    const hpTxt = btn.querySelector('.stats [title="Health"] b.mono, .stats [title="Vie"] b.mono, .stats [title="PV"] b.mono, [title*="Health" i] b')?.textContent || '0';
    return {
      attack: Number(atkTxt.replace(/[^\d.-]/g, '')) || 0,
      health: Number(hpTxt.replace(/[^\d.-]/g, '')) || 0,
      rarity: parseRarityFromCardEl(btn),
      series: btn.querySelector('.pf-ser')?.textContent?.trim() || ''
    };
  });
}

export async function solveRaidStep(isDaily = false, meId?: string | number): Promise<boolean> {
  const finishBtn = findButtonByText(
    document.querySelector('.panel.game.fighting') || document,
    /^(Finish(?:\s*[×x]\d+)?|Terminer(?:\s*[×x]\d+)?|Passer|Skip|Fast forward)\b/i
  );
  if (await clickAndHumanSleep(finishBtn, 1100, 1900)) {
    if (isDaily) markDailyRaidPlayed(meId);
    return true;
  }
  if (isDaily && /déjà joué|already played|revenez demain|come back tomorrow/i.test(document.querySelector('main')?.textContent || '')) {
    markDailyRaidPlayed(meId);
    return false;
  }
  const poolBtns = Array.from(document.querySelectorAll<HTMLButtonElement>('.arena .draft .pool button.pick, main .pool button.pick'));
  if (poolBtns.length > 0) {
    const best = new Set(chooseBestRaidTeamIndices(parseRaidPoolCards(poolBtns), 5));
    for (let i = 0; i < poolBtns.length; i += 1) {
      if (!poolBtns[i].disabled && (poolBtns[i].getAttribute('aria-pressed') === 'true') !== best.has(i)) {
        poolBtns[i].click();
        await humanSleep(180, 380);
      }
    }
    const launchBtn = await waitForEnabledButton(
      () =>
        document.querySelector<HTMLButtonElement>('.foot .actions button.btn.btn-acc:not(:disabled)') ||
        findButtonByText(document, /^(Start the raid|Lancer le raid|Start|Lancer|Confirm|Confirmer)\b/i),
      2600
    );
    return clickAndHumanSleep(launchBtn, 1100, 1900);
  }
  if (!document.querySelector('.status[role="status"]') && (await clickAndHumanSleep(findMainModeButton(), 1100, 1900))) {
    return true;
  }
  return clickAdvanceOrNextButton();
}

function parseCostFromBtn(btn: HTMLButtonElement): number {
  const raw = btn.querySelector('.cost, [title*="Cost" i], [title*="Coût" i]')?.textContent || '';
  const n = Number(raw.replace(/[^\d]/g, ''));
  return Number.isFinite(n) && n > 0 ? n : 1;
}

export async function solveExpeditionStep(): Promise<boolean> {
  const picker = document.querySelector('.picker');
  if (picker) {
    const pickedSlots = Array.from(picker.querySelectorAll('.pk-head .picked .slot'));
    const slotsNeeded = pickedSlots.length ? pickedSlots.filter((s) => !s.querySelector('.tcg.pf, .pf-name')).length : 5;
    const gaugeMatch = (picker.querySelector('.gauge')?.textContent || '').match(/(\d+)\s*\/\s*(\d+)/);
    let budgetLeft = gaugeMatch ? Math.max(0, Number(gaugeMatch[2]) - Number(gaugeMatch[1])) : Infinity;
    const candidates = Array.from(picker.querySelectorAll<HTMLButtonElement>('button:not(:disabled)')).filter(
      (b) => !b.closest(`.foot, .pk-head, .tabs, ${KM_IGNORE_SEL}`) && b.getAttribute('aria-pressed') !== 'true' && !b.classList.contains('picked') && Boolean(b.querySelector('.tcg.pf, .pf-name, img'))
    );
    if (slotsNeeded > 0 && candidates.length > 0 && budgetLeft > 0) {
      const affordable = candidates.filter((b) => parseCostFromBtn(b) <= budgetLeft);
      for (const idx of chooseBestRaidTeamIndices(parseRaidPoolCards(affordable), Math.min(slotsNeeded, affordable.length))) {
        const btn = affordable[idx];
        const cost = parseCostFromBtn(btn);
        if (cost <= budgetLeft && !btn.disabled) {
          btn.click();
          budgetLeft -= cost;
          await humanSleep(180, 380);
        }
      }
    }
    const confirmBtn = await waitForEnabledButton(
      () =>
        picker.querySelector<HTMLButtonElement>('.foot button.btn.btn-acc:not(:disabled)') ||
        document.querySelector<HTMLButtonElement>('.foot button.btn.btn-acc:not(:disabled)') ||
        findButtonByText(document, /^(Confirm the team|Confirmer l'équipe|Confirmer|Validate|Valider)\b/i),
      2600
    );
    return clickAndHumanSleep(confirmBtn, 1100, 1900);
  }

  const startBtn =
    findMainModeButton() ||
    findButtonByText(document, /^(Pick the team|Choisir l'équipe|New expedition|Nouvelle expédition)\b/i);
  if (await clickAndHumanSleep(startBtn, 1100, 1900)) return true;

  const mapNodes = Array.from(document.querySelectorAll<HTMLButtonElement>('.path.wide button, .arena .screen .map button')).filter(
    (b) => !b.closest(`.tabs, ${KM_IGNORE_SEL}`) && !/Pick the team|Choisir l'équipe/i.test(cleanBtnText(b))
  );
  if (!mapNodes.length && document.querySelector('.arena .screen')) {
    const routeTab = Array.from(document.querySelectorAll<HTMLButtonElement>('.tabs button[role="tab"]:not(:disabled)')).find(
      (t) => t.getAttribute('aria-selected') !== 'true' && /^(Route|Map|Carte)$/i.test(cleanBtnText(t))
    );
    if (await clickAndHumanSleep(routeTab || null, 450, 750)) return true;
  }
  if (mapNodes.length > 0) {
    const nodes = mapNodes.map((b) => ({
      label: (b.getAttribute('aria-label') || b.getAttribute('title') || cleanBtnText(b)).trim(),
      selectable: !b.disabled && b.getAttribute('aria-disabled') !== 'true' && !/\b(locked|done|visited)\b/i.test(b.className)
    }));
    const idx = pickExpeditionNextIndex(nodes);
    if (idx >= 0 && (await clickAndHumanSleep(mapNodes[idx], 1100, 1900))) return true;
  }

  const arena = document.querySelector('.arena') || document;
  const actionBtn =
    findButtonByText(arena, /^(Finish(?:\s*[×x]\d+)?|Terminer(?:\s*[×x]\d+)?|Fight|Combattre|Attack|Attaquer|Auto)\b/i) ||
    findButtonByText(arena, /^(Claim|Récupérer|Take|Prendre|Open|Ouvrir|Heal|Soigner|Rest|Se reposer|Collect|Collecter|Continue|Continuer|Next|Suivant|Confirm|Confirmer|Leave|Quitter|Skip|Passer)\b/i);
  if (await clickAndHumanSleep(actionBtn, 1100, 1900)) return true;

  const rewardCard = Array.from(arena.querySelectorAll<HTMLButtonElement>('button:not(:disabled)')).find(
    (b) => isButtonUsable(b, ADVANCE_IGNORE_SEL) && Boolean(b.querySelector('.tcg.pf, .pf-name'))
  );
  if (await clickAndHumanSleep(rewardCard || null, 850, 1400)) return true;
  return clickAdvanceOrNextButton();
}

function parsePower(el: Element | null): number {
  if (!el) return 0;
  const match = ((el.querySelector('.pow, .power, .score, .pts, b.mono') || el).textContent || '').match(/-?\d+/);
  return match ? Number(match[0]) : 0;
}

export function extractThreeArcsState() {
  const arcs = Array.from(document.querySelectorAll<HTMLElement>('.board .arcs > .arc'));
  const lines = arcs.map((arc) => ({
    myPower: parsePower(arc.querySelector('.side.me, .me')),
    oppPower: parsePower(arc.querySelector('.side.opp, .opp')),
    openSlots: Math.max(arc.querySelectorAll('button.side.me:not(:disabled)').length, arc.querySelectorAll('.side.me .slot:not(.filled)').length)
  }));
  return { arcs, lines };
}

export async function solveThreeArcsStep(): Promise<boolean> {
  const modeBtns = Array.from(document.querySelectorAll<HTMLButtonElement>('.gi .modes.stack button:not(:disabled)'));
  if (modeBtns.length > 0) {
    const soloAi =
      modeBtns.find((b) => /Against the computer|Contre l'ordinateur|VS AI|Contre l'IA|Bot/i.test(cleanBtnText(b))) ||
      modeBtns.find((b) => /Learn to play|Apprendre|Tutoriel|Tutorial/i.test(cleanBtnText(b)));
    if (await clickAndHumanSleep(soloAi || null, 1100, 1900)) return true;
  }
  const handBtns = Array.from(document.querySelectorAll<HTMLButtonElement>('.hand button:not(:disabled), .board button.slot:not(:disabled)')).filter(
    (b) => isButtonUsable(b) && !b.classList.contains('side')
  );
  if (!handBtns.some((b) => b.getAttribute('aria-pressed') === 'true' || b.classList.contains('selected')) && handBtns.length > 0) {
    const score = (btn: HTMLButtonElement) =>
      (RARITY_SCORE[parseRarityFromCardEl(btn)] || 1) * 10 + parsePower(btn.querySelector('.stats, .pow, b.mono') || btn);
    [...handBtns].sort((a, b) => score(b) - score(a))[0].click();
    await humanSleep(220, 420);
  }
  const { arcs, lines } = extractThreeArcsState();
  const lineIdx = pickThreeArcsLineIndex(lines);
  if (lineIdx >= 0 && arcs[lineIdx]) {
    const sideBtn =
      arcs[lineIdx].querySelector<HTMLButtonElement>('button.side.me:not(:disabled)') ||
      document.querySelector<HTMLButtonElement>(`button.side.me[aria-label*="line ${lineIdx + 1}" i]:not(:disabled)`) ||
      Array.from(document.querySelectorAll<HTMLButtonElement>('button.side.me:not(:disabled)'))[lineIdx];
    if (await clickAndHumanSleep(sideBtn || null, 1100, 1900)) return true;
  }
  const kyaraBtn =
    document.querySelector<HTMLButtonElement>('.who.me-who .acts button.btn-acc.kyara:not(:disabled)') ||
    document.querySelector<HTMLButtonElement>('.who.me-who .acts button:not(:disabled)');
  if (await clickAndHumanSleep(kyaraBtn, 1100, 1900)) return true;
  return clickAdvanceOrNextButton();
}

function getBlindTestAllChoices(arena: Element): HTMLButtonElement[] {
  return Array.from(arena.querySelectorAll<HTMLButtonElement>('button')).filter((b) => {
    if (b.closest(`.hud, .audio, .player, ${ADVANCE_IGNORE_SEL}`)) return false;
    const txt = cleanBtnText(b);
    const aria = b.getAttribute('aria-label') || '';
    if (!txt || /^(Play|Pause|Replay|Réécouter|Écouter|Listen|Mute)$/i.test(txt)) return false;
    if (START_MODE_RE.test(txt) || REPLAY_BTN_RE.test(txt) || NEXT_BTN_RE.test(txt)) return false;
    return !/Play|Pause|Mute|Volume|Replay|Réécouter|Audio/i.test(aria);
  });
}

export function extractBlindTestDom(catalogById: Map<number, any>) {
  const arena = document.querySelector('.arena');
  if (!arena) return { choiceBtns: [] as HTMLButtonElement[], hintText: '' };
  const choiceBtns = getBlindTestAllChoices(arena).filter((b) => isButtonUsable(b, ADVANCE_IGNORE_SEL));
  const hintParts: string[] = [];
  arena.querySelectorAll('.hint, .clue, .question, .prompt, .pf-name, .pf-ser, p, h2, h3').forEach((el) => {
    if (!el.closest('button, .hud') && el.textContent?.trim()) hintParts.push(el.textContent.trim());
  });
  arena.querySelectorAll<HTMLImageElement>('img').forEach((img) => {
    if (img.alt) hintParts.push(img.alt.trim());
    const m = img.src.match(/\/cards\/(?:sm|md|lg)?\/?(\d+)\./i);
    if (m && catalogById.get(Number(m[1]))?.series) hintParts.push(catalogById.get(Number(m[1])).series);
  });
  return { choiceBtns, hintText: hintParts.join(' ').trim() };
}

export async function solveBlindTestStep(catalogById: Map<number, any>): Promise<boolean> {
  if (await clickAndHumanSleep(findMainModeButton(), 1100, 1900)) return true;
  const arena = document.querySelector('.arena');
  const allChoices = arena ? getBlindTestAllChoices(arena) : [];
  if (arena && (!allChoices.length || hasAnsweredChoices(arena, allChoices))) return advanceOrWaitTransition();
  const { choiceBtns, hintText } = extractBlindTestDom(catalogById);
  if (!choiceBtns.length) return clickAdvanceOrNextButton();
  await humanSleep(1300, 2300);
  if (safeInterrupted()) return false;
  const idx = matchBlindTestChoice(hintText, choiceBtns.map(cleanBtnText), catalogById);
  return clickAndHumanSleep(choiceBtns[idx >= 0 ? idx : 0], 700, 1200);
}

export async function solveExtraMiniGameRound(path: string, catalogById: Map<number, any>, meId?: string | number): Promise<boolean> {
  if (typeof document === 'undefined') return false;
  if (path.startsWith('/jouer/main-kyara')) return solveMainKyaraStep();
  if (path.startsWith('/jouer/raid-du-jour')) return solveRaidStep(true, meId);
  if (path.startsWith('/jouer/raid')) return solveRaidStep(false, meId);
  if (path.startsWith('/jouer/expedition')) return solveExpeditionStep();
  if (path.startsWith('/jouer/trois-arcs')) return solveThreeArcsStep();
  if (path.startsWith('/jouer/blind-test')) return solveBlindTestStep(catalogById);
  return false;
}
