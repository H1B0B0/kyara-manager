import {
  EXPEDITION_RARITY_COST,
  chooseBestRaidTeamIndices,
  chooseExpeditionTeamIndices,
  extractCardIdFromUrl,
  pickExpeditionNextIndex,
  pickThreeArcsLineIndex
} from '../../lib/analytics/games-solver';
import type { Rarity } from '../../types/kyara';
import { solveSoloQuizStep } from './games-classic';
import {
  ADVANCE_IGNORE_SEL,
  KM_IGNORE_SEL,
  START_MODE_RE,
  cleanBtnText,
  clickAdvanceOrNextButton,
  findButtonByText,
  hasDiscordGate,
  humanSleep,
  isButtonUsable,
  isElementVisible,
  isGameFinishedScreen,
  parseRarityFromCardEl,
  safeInterrupted,
  waitForEnabledButton
} from './games-core';
import { solvePokerHandStep } from './games-poker';

export * from './games-core';
export * from './games-poker';

const RARITY_SCORE: Record<Rarity, number> = { C: 1, U: 2, R: 3, E: 4, L: 5, M: 6 };
const RAID_ALREADY_RE = /d[eé]j[aà] jou[eé]|already played|revenez demain|come back tomorrow/i;
const EXPEDITION_LIMIT_RE = /plus de cases aujourd'hui|no cases left today/i;
const EXPEDITION_CONT_RE = /^(?:Continuer|Continue|Reprendre la route|Back to route|Passer|Skip)\b/i;
const EXPEDITION_TILE_ACT_RE = /^(?:Combattre|Affronter le boss|Entrer dans la boutique|Ouvrir le tr[eé]sor|Choisir un bonus|Fight|Face the boss|Enter the shop|Open the treasure|Choose a bonus|Boss|Shop|Treasure)\b/i;
const EXPEDITION_INTRO_RE = /^(?:Choisir l'[eé]quipe|Pick the team|Play solo|Jouer solo|Jouer en solo)\b/i;
const THREE_ARCS_AI_RE = /Contre l'ordinateur|Against the computer|VS AI|Contre l'IA|Bot/i;
const THREE_ARCS_TUTO_RE = /Apprendre [aà] jouer|Learn to play|Tutoriel|Tutorial/i;
const THREE_ARCS_RETREAT_RE = /Se retirer|Retreat|Abandonner|Forfeit/i;

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
      if (RAID_ALREADY_RE.test(document.querySelector('main')?.textContent || '')) {
        markDailyRaidPlayed(meId);
        return true;
      }
    }
  } catch {}
  return false;
}

async function clickAndSleep(btn: HTMLButtonElement | null, minMs = 900, maxMs = 1500): Promise<boolean> {
  if (!btn || !isButtonUsable(btn)) return false;
  btn.click();
  await humanSleep(minMs, maxMs);
  return true;
}

function findMainModeButton(): HTMLButtonElement | null {
  const mode = document.querySelector<HTMLButtonElement>('.gi .modes button.mode.main:not(:disabled)');
  return (mode && isButtonUsable(mode) ? mode : null) || findButtonByText(document, START_MODE_RE);
}

function parsePower(el: Element | null): number {
  if (!el) return 0;
  const match = ((el.querySelector('.pow, .power, .score, .pts, b.mono') || el).textContent || '').match(/-?\d+/);
  return match ? Number(match[0]) : 0;
}

function scoreCardButton(btn: HTMLButtonElement): number {
  return (RARITY_SCORE[parseRarityFromCardEl(btn)] || 1) * 100 + parsePower(btn.querySelector('.stats, .pow, b.mono') || btn);
}

function isCardPicked(btn: HTMLButtonElement): boolean {
  return btn.getAttribute('aria-pressed') === 'true' || btn.classList.contains('picked');
}

function pickBestPerkButton(scope: ParentNode): HTMLButtonElement | null {
  const perks = Array.from(scope.querySelectorAll<HTMLButtonElement>('button.perk:not(:disabled)')).filter((b) => isButtonUsable(b));
  if (!perks.length) return null;
  return perks.find((p) => /attaque|atk|d[eé]g[aâ]t|damage|soin|heal|crit|puissance/i.test(cleanBtnText(p))) || perks[0];
}

export async function solveMainKyaraStep(catalogById?: Map<number, any>): Promise<boolean> {
  return solvePokerHandStep(catalogById || new Map(), { allowStart: true });
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
  if (typeof document === 'undefined') return false;
  const main = document.querySelector('main') || document;
  if (isGameFinishedScreen(isDaily ? 'raid-du-jour' : 'raid')) {
    if (isDaily) markDailyRaidPlayed(meId);
    return false;
  }
  if (isDaily && RAID_ALREADY_RE.test(main.textContent || '')) {
    markDailyRaidPlayed(meId);
    return false;
  }

  const perkBtn = pickBestPerkButton(document);
  if (perkBtn) {
    await humanSleep(650, 1100);
    if (safeInterrupted()) return false;
    return clickAndSleep(perkBtn, 550, 900);
  }
  if (main.querySelector('.panel.game.fighting')) {
    await humanSleep(900, 1400);
    return true;
  }

  const poolBtns = Array.from(document.querySelectorAll<HTMLButtonElement>('.arena .draft .pool button.pick, main .pool button.pick'));
  if (poolBtns.length > 0) {
    const best = new Set(chooseBestRaidTeamIndices(parseRaidPoolCards(poolBtns), 5));
    for (let i = 0; i < poolBtns.length; i += 1) {
      if (safeInterrupted()) return false;
      const btn = poolBtns[i];
      if (!btn.disabled && isCardPicked(btn) && !best.has(i)) {
        btn.click();
        await humanSleep(180, 380);
      }
    }
    for (let i = 0; i < poolBtns.length; i += 1) {
      if (safeInterrupted()) return false;
      const btn = poolBtns[i];
      if (!btn.disabled && !isCardPicked(btn) && best.has(i)) {
        btn.click();
        await humanSleep(180, 380);
      }
    }
    const launchBtn = await waitForEnabledButton(
      () =>
        document.querySelector<HTMLButtonElement>('.foot .actions button.btn.btn-acc:not(:disabled)') ||
        findButtonByText(main, /^(?:Lancer le raid|Start the raid|Lancer|Start|Confirmer|Confirm)\b/i),
      2800
    );
    return clickAndSleep(launchBtn, 1000, 1600);
  }

  if (!document.querySelector('.status[role="status"]') && (await clickAndSleep(findMainModeButton(), 1000, 1600))) return true;
  return clickAdvanceOrNextButton(main);
}

function parseExpeditionCost(btn: HTMLButtonElement, rarity: Rarity): number {
  const raw = btn.querySelector('.pcost, .cost, [title*="Cost" i], [title*="Coût" i]')?.textContent || '';
  const n = Number(raw.replace(/[^\d]/g, ''));
  return Number.isFinite(n) && n > 0 ? n : EXPEDITION_RARITY_COST[rarity] ?? 1;
}

export async function solveExpeditionStep(): Promise<boolean> {
  if (typeof document === 'undefined') return false;
  const main = document.querySelector('main') || document;

  const limitDisabled = Array.from(main.querySelectorAll<HTMLButtonElement>('button:disabled, button[aria-disabled="true"]')).some(
    (b) => EXPEDITION_LIMIT_RE.test(cleanBtnText(b))
  );
  if (limitDisabled || isGameFinishedScreen('expedition')) return false;

  const perkBtn = pickBestPerkButton(document);
  if (perkBtn) {
    await humanSleep(650, 1100);
    if (safeInterrupted()) return false;
    return clickAndSleep(perkBtn, 550, 900);
  }
  const contBtn =
    findButtonByText(main.querySelector('.arena, .foot') || main, EXPEDITION_CONT_RE) ||
    findButtonByText(main.querySelector('.foot') || main, EXPEDITION_CONT_RE);
  if (contBtn && (await clickAndSleep(contBtn, 750, 1250))) return true;

  if (main.querySelector('.panel.game.fighting')) {
    await humanSleep(900, 1400);
    return true;
  }

  const picker = document.querySelector('.picker');
  if (picker) {
    const gaugeMatch = (picker.querySelector('.gauge')?.textContent || '').match(/(\d+)\s*\/\s*(\d+)/);
    const budget = gaugeMatch ? Number(gaugeMatch[2]) : 14;
    let poolBtns = Array.from(picker.querySelectorAll<HTMLButtonElement>('.pool > button.pick'));
    if (!poolBtns.length) {
      poolBtns = Array.from(picker.querySelectorAll<HTMLButtonElement>('button')).filter(
        (b) => !b.closest(`.foot, .pk-head, .tabs, ${KM_IGNORE_SEL}`) && Boolean(b.querySelector('.tcg.pf, .pf-name, img'))
      );
    }
    if (poolBtns.length > 0) {
      const cards = parseRaidPoolCards(poolBtns).map((c, idx) => ({ ...c, cost: parseExpeditionCost(poolBtns[idx], c.rarity) }));
      const targetSet = new Set(chooseExpeditionTeamIndices(cards, budget, 5));
      for (let i = 0; i < poolBtns.length; i += 1) {
        if (safeInterrupted()) return false;
        const btn = poolBtns[i];
        if (!btn.disabled && isCardPicked(btn) && !targetSet.has(i)) {
          btn.click();
          await humanSleep(180, 360);
        }
      }
      for (let i = 0; i < poolBtns.length; i += 1) {
        if (safeInterrupted()) return false;
        const btn = poolBtns[i];
        if (!btn.disabled && !isCardPicked(btn) && targetSet.has(i)) {
          btn.click();
          await humanSleep(180, 360);
        }
      }
    }
    const confirmBtn = await waitForEnabledButton(
      () =>
        picker.querySelector<HTMLButtonElement>('.foot button.btn.btn-acc:not(:disabled)') ||
        findButtonByText(main, /^(?:Valider l'[eé]quipe|Confirm the team|Confirmer l'[eé]quipe|Valider|Confirm)\b/i),
      2800
    );
    return clickAndSleep(confirmBtn, 1000, 1600);
  }

  const tileActionBtn = Array.from(main.querySelectorAll<HTMLButtonElement>('.foot .actions button.btn-acc:not(:disabled)')).find(
    (b) => isButtonUsable(b) && EXPEDITION_TILE_ACT_RE.test(cleanBtnText(b))
  );
  if (tileActionBtn && (await clickAndSleep(tileActionBtn, 850, 1350))) return true;

  const mapNodes = Array.from(main.querySelectorAll<HTMLButtonElement>('.path.wide button')).filter(
    (b) => !b.closest(`.tabs, ${KM_IGNORE_SEL}`) && !EXPEDITION_INTRO_RE.test(cleanBtnText(b))
  );
  if (mapNodes.length > 0) {
    const nodes = mapNodes.map((b) => ({
      label: (b.getAttribute('aria-label') || b.getAttribute('title') || cleanBtnText(b)).trim(),
      selectable: isButtonUsable(b) && !/\b(locked|done|visited)\b/i.test(b.className)
    }));
    const idx = pickExpeditionNextIndex(nodes);
    if (idx >= 0 && (await clickAndSleep(mapNodes[idx], 900, 1500))) return true;
  }

  const introBtn = findMainModeButton() || findButtonByText(main, EXPEDITION_INTRO_RE);
  if (introBtn && (await clickAndSleep(introBtn, 1000, 1600))) return true;
  return clickAdvanceOrNextButton(main);
}

export function extractThreeArcsState() {
  const arcs = Array.from(document.querySelectorAll<HTMLElement>('.board .arcs > .arc, div.arc'));
  const lines = arcs.map((arc) => ({
    myPower: parsePower(arc.querySelector('.side.me, .me')),
    oppPower: parsePower(arc.querySelector('.side.opp, .opp')),
    openSlots: Math.max(
      arc.querySelectorAll('button.side.me.target:not(:disabled)').length,
      arc.querySelectorAll('button.side.me:not(:disabled)').length,
      arc.querySelectorAll('.side.me .slot:not(.filled)').length
    )
  }));
  return { arcs, lines };
}

export async function solveThreeArcsStep(options: { allowTutorial?: boolean } = {}): Promise<boolean> {
  if (typeof document === 'undefined' || hasDiscordGate() || isGameFinishedScreen('trois-arcs')) return false;

  const modeBtns = Array.from(document.querySelectorAll<HTMLButtonElement>('.gi .modes.stack button:not(:disabled)')).filter((b) => isButtonUsable(b));
  if (modeBtns.length > 0) {
    const aiBtn = modeBtns.find((b) => THREE_ARCS_AI_RE.test(cleanBtnText(b)));
    const tutoBtn = options.allowTutorial ? modeBtns.find((b) => THREE_ARCS_TUTO_RE.test(cleanBtnText(b))) : null;
    return aiBtn || tutoBtn ? clickAndSleep(aiBtn || tutoBtn || null, 1000, 1600) : false;
  }

  const sheet = Array.from(document.querySelectorAll<HTMLElement>('div.sheet[role="dialog"]')).find((el) => isElementVisible(el));
  if (sheet) {
    const peekBtns = Array.from(sheet.querySelectorAll<HTMLButtonElement>('div.choices.peek > button.pc.big:not(:disabled)')).filter((b) => isButtonUsable(b));
    if (peekBtns.length > 0) return clickAndSleep([...peekBtns].sort((a, b) => scoreCardButton(b) - scoreCardButton(a))[0], 700, 1200);
    const riverBtns = Array.from(sheet.querySelectorAll<HTMLButtonElement>('div.grp .cards > button.pc.big:not(:disabled)')).filter(
      (b) => isButtonUsable(b) && !b.classList.contains('deck')
    );
    if (riverBtns.length > 0) return clickAndSleep([...riverBtns].sort((a, b) => scoreCardButton(b) - scoreCardButton(a))[0], 700, 1200);
    const deckBtn = Array.from(sheet.querySelectorAll<HTMLButtonElement>('button.pc.big.deck:not(:disabled)')).find((b) => isButtonUsable(b));
    if (deckBtn) return clickAndSleep(deckBtn, 700, 1200);
  }

  let handBtns = Array.from(document.querySelectorAll<HTMLButtonElement>('div.hand .row > button.pc:not(:disabled)')).filter(
    (b) => isButtonUsable(b) && !THREE_ARCS_RETREAT_RE.test(cleanBtnText(b))
  );
  if (!handBtns.length) {
    handBtns = Array.from(document.querySelectorAll<HTMLButtonElement>('.hand button:not(:disabled)')).filter(
      (b) => isButtonUsable(b) && !b.classList.contains('side') && !THREE_ARCS_RETREAT_RE.test(cleanBtnText(b))
    );
  }
  if (handBtns.length > 0) {
    if (!handBtns.some((b) => b.classList.contains('picked') || b.classList.contains('selected') || b.getAttribute('aria-pressed') === 'true')) {
      [...handBtns].sort((a, b) => scoreCardButton(b) - scoreCardButton(a))[0].click();
      await humanSleep(240, 440);
      if (safeInterrupted()) return false;
    }
    const { arcs, lines } = extractThreeArcsState();
    const lineIdx = pickThreeArcsLineIndex(lines);
    const sideBtn =
      (lineIdx >= 0 && arcs[lineIdx]
        ? arcs[lineIdx].querySelector<HTMLButtonElement>('button.side.me.target:not(:disabled)') ||
          arcs[lineIdx].querySelector<HTMLButtonElement>('button.side.me:not(:disabled)')
        : null) ||
      Array.from(document.querySelectorAll<HTMLButtonElement>('div.arc > button.side.me.target:not(:disabled)')).find((b) => isButtonUsable(b)) ||
      null;
    if (sideBtn && (await clickAndSleep(sideBtn, 900, 1400))) return true;
  }

  if (!handBtns.length && !sheet && !document.querySelector('.box.end') && document.querySelector('.board, .arcs')) {
    await humanSleep(600, 900);
    return true;
  }
  return clickAdvanceOrNextButton();
}

export function extractBlindTestDom(catalogById: Map<number, any>) {
  const arena = document.querySelector('.arena');
  if (!arena) return { choiceBtns: [] as HTMLButtonElement[], hintText: '' };
  const choiceBtns = Array.from(arena.querySelectorAll<HTMLButtonElement>('div.choices > button.choice')).filter((b) => isButtonUsable(b, ADVANCE_IGNORE_SEL));
  const hintParts: string[] = [];
  arena.querySelectorAll('.hint, .clue, .question, .prompt, .pf-name, .pf-ser, p, h2, h3').forEach((el) => {
    if (!el.closest('button, .hud') && el.textContent?.trim()) hintParts.push(el.textContent.trim());
  });
  arena.querySelectorAll<HTMLImageElement>('img').forEach((img) => {
    if (img.alt) hintParts.push(img.alt.trim());
    const id = extractCardIdFromUrl(img.src);
    if (id !== null && catalogById.get(id)?.series) hintParts.push(String(catalogById.get(id).series));
  });
  return { choiceBtns, hintText: hintParts.join(' ').trim() };
}

export async function solveExtraMiniGameRound(
  path: string,
  catalogById: Map<number, any>,
  meId?: string | number,
  options: { allowTutorial?: boolean } = {}
): Promise<boolean> {
  if (typeof document === 'undefined') return false;
  if (path.startsWith('/jouer/main-kyara')) return solveMainKyaraStep(catalogById);
  if (path.startsWith('/jouer/raid-du-jour')) return solveRaidStep(true, meId);
  if (path.startsWith('/jouer/raid')) return solveRaidStep(false, meId);
  if (path.startsWith('/jouer/expedition')) return solveExpeditionStep();
  if (path.startsWith('/jouer/trois-arcs')) return solveThreeArcsStep(options);
  if (path.startsWith('/jouer/blind-test')) return solveSoloQuizStep(path, catalogById);
  return false;
}
