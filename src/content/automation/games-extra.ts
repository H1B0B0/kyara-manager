import {
  chooseBestDailyHandIndices,
  chooseBestRaidTeamIndices,
  matchBlindTestChoice,
  pickExpeditionNextIndex,
  pickThreeArcsLineIndex,
  type DailyHandCard
} from '../../lib/analytics/games-solver';
import type { Rarity } from '../../types/kyara';
import { sleep } from '../utils';

const KM_IGNORE_SEL = '#km-inpage-games-bar, .km-inpage-bar, #km-floating-hud, #km-cockpit-overlay';
const RARITY_SCORE: Record<Rarity, number> = { C: 1, U: 2, R: 3, E: 4, L: 5, M: 6 };

function cleanBtnText(el: Element): string {
  return (el instanceof HTMLElement ? el.innerText : el.textContent || '').replace(/\s+/g, ' ').trim();
}

export function findButtonByText(root: ParentNode, re: RegExp): HTMLButtonElement | null {
  const buttons = Array.from(root.querySelectorAll<HTMLButtonElement>('button:not(:disabled)'));
  return buttons.find((b) => !b.closest(KM_IGNORE_SEL) && re.test(cleanBtnText(b))) || null;
}

export function hasDiscordGate(): boolean {
  const els = Array.from(document.querySelectorAll('main .wait .ko, main .err, .extra p.err, main p.err'));
  return els.some((el) => /discord|403|lie.*discord|connect.*discord/i.test(el.textContent || ''));
}

export function parseRarityFromCardEl(el: Element): Rarity {
  const rawSeal = el.querySelector('.pf-seal')?.textContent?.trim().toUpperCase() || '';
  if (['C', 'U', 'R', 'E', 'L', 'M'].includes(rawSeal)) return rawSeal as Rarity;
  const cls = el.querySelector('.tcg.pf')?.className || el.className || '';
  const match = cls.match(/\bp-([CURELM])\b/i);
  return (match ? match[1].toUpperCase() : 'C') as Rarity;
}

export function parseHandSlotsDom(): { cards: DailyHandCard[]; slots: HTMLButtonElement[] } {
  if (typeof document === 'undefined') return { cards: [], slots: [] };
  let slots = Array.from(document.querySelectorAll<HTMLButtonElement>('main div.hand button.slot'));
  if (!slots.length) {
    slots = Array.from(document.querySelectorAll<HTMLButtonElement>('main button.slot[aria-pressed]'));
  }
  const cards: DailyHandCard[] = slots.map((slot) => ({
    name: slot.querySelector('.pf-name')?.textContent?.trim() || '',
    series: slot.querySelector('.pf-ser')?.textContent?.trim() || '',
    family:
      slot.querySelector('.pf-rib')?.getAttribute('title')?.trim() ||
      slot.querySelector('.pf-rib .pf-ser')?.textContent?.trim() ||
      '',
    rarity: parseRarityFromCardEl(slot)
  }));
  return { cards, slots };
}

function dailyRaidStorageKey(meId?: string | number): string {
  return `km_daily_raid_${meId ?? 'anon'}`;
}

function todayDateStamp(): string {
  return new Date().toISOString().slice(0, 10);
}

export function markDailyRaidPlayed(meId?: string | number): void {
  try {
    if (typeof localStorage !== 'undefined') localStorage.setItem(dailyRaidStorageKey(meId), todayDateStamp());
  } catch {}
}

export async function isDailyRaidAlreadyPlayed(meId?: string | number): Promise<boolean> {
  try {
    if (typeof localStorage !== 'undefined' && localStorage.getItem(dailyRaidStorageKey(meId)) === todayDateStamp()) return true;
    if (typeof document !== 'undefined' && window.location.pathname.startsWith('/jouer/raid-du-jour')) {
      const mainText = document.querySelector('main')?.textContent || '';
      if (/déjà joué|already played|revenez demain|come back tomorrow/i.test(mainText)) {
        markDailyRaidPlayed(meId);
        return true;
      }
    }
  } catch {}
  return false;
}

async function clickAndSleep(btn: HTMLButtonElement | null, ms = 550): Promise<boolean> {
  if (!btn) return false;
  btn.click();
  await sleep(ms);
  return true;
}

export async function solveMainKyaraStep(): Promise<boolean> {
  const { cards, slots } = parseHandSlotsDom();
  if (!cards.length) {
    return clickAndSleep(findButtonByText(document, /^(Play solo|Jouer solo|New game|Nouvelle partie|Play again|Rejouer|Start|Commencer)$/i));
  }

  const pick = new Set(chooseBestDailyHandIndices(cards));
  for (let i = 0; i < slots.length; i += 1) {
    if (slots[i].disabled) continue;
    if ((slots[i].getAttribute('aria-pressed') === 'true') !== pick.has(i)) {
      slots[i].click();
      await sleep(80);
    }
  }

  const playBtn =
    document.querySelector<HTMLButtonElement>('.foot .actions button.btn.btn-acc:not(:disabled)') ||
    document.querySelector<HTMLButtonElement>('main .actions button.btn-acc:not(:disabled)') ||
    findButtonByText(document, /^(Play|Jouer)$/i);
  if (await clickAndSleep(playBtn)) return true;

  const discardBtn =
    document.querySelector<HTMLButtonElement>('.foot .actions button.btn-ghost:not(:disabled)') ||
    findButtonByText(document, /^(Discard|Défausser)$/i);
  return clickAndSleep(discardBtn);
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
    /^(Finish(?:\s*[×x]\d+)?|Terminer(?:\s*[×x]\d+)?|Passer|Skip|Fast forward)$/i
  );
  if (await clickAndSleep(finishBtn)) {
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
        await sleep(75);
      }
    }
    const launchBtn =
      document.querySelector<HTMLButtonElement>('.foot .actions button.btn.btn-acc:not(:disabled)') ||
      findButtonByText(document, /^(Start the raid|Lancer le raid|Start|Lancer|Confirm|Confirmer)$/i);
    return clickAndSleep(launchBtn, 600);
  }

  if (document.querySelector('.status[role="status"]')) return false;
  const modeBtn =
    document.querySelector<HTMLButtonElement>('.gi .modes button.mode.main:not(:disabled)') ||
    findButtonByText(document, /^(Play solo|Jouer solo)$/i);
  return clickAndSleep(modeBtn, 600);
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
    const emptySlots = pickedSlots.filter((s) => !s.querySelector('.tcg.pf, .pf-name')).length;
    const slotsNeeded = pickedSlots.length ? emptySlots : 5;

    const gaugeTxt = picker.querySelector('.gauge')?.textContent || '';
    const gaugeMatch = gaugeTxt.match(/(\d+)\s*\/\s*(\d+)/);
    let budgetLeft = gaugeMatch ? Math.max(0, Number(gaugeMatch[2]) - Number(gaugeMatch[1])) : Infinity;

    const candidates = Array.from(picker.querySelectorAll<HTMLButtonElement>('button:not(:disabled)')).filter(
      (b) =>
        !b.closest(`.foot, .pk-head, .tabs, ${KM_IGNORE_SEL}`) &&
        b.getAttribute('aria-pressed') !== 'true' &&
        !b.classList.contains('picked') &&
        Boolean(b.querySelector('.tcg.pf, .pf-name, img'))
    );

    if (slotsNeeded > 0 && candidates.length > 0 && budgetLeft > 0) {
      const affordable = candidates.filter((b) => parseCostFromBtn(b) <= budgetLeft);
      const order = chooseBestRaidTeamIndices(parseRaidPoolCards(affordable), Math.min(slotsNeeded, affordable.length));
      for (const idx of order) {
        const btn = affordable[idx];
        const cost = parseCostFromBtn(btn);
        if (cost <= budgetLeft && !btn.disabled) {
          btn.click();
          budgetLeft -= cost;
          await sleep(90);
        }
      }
    }

    const confirmBtn =
      picker.querySelector<HTMLButtonElement>('.foot button.btn.btn-acc:not(:disabled)') ||
      document.querySelector<HTMLButtonElement>('.foot button.btn.btn-acc:not(:disabled)') ||
      findButtonByText(document, /^(Confirm the team|Confirmer l'équipe|Confirmer|Validate|Valider)$/i);
    if (confirmBtn) {
      confirmBtn.click();
      await sleep(550);
      return true;
    }
    return false;
  }

  const startBtn =
    document.querySelector<HTMLButtonElement>('.gi .modes button.mode.main:not(:disabled)') ||
    findButtonByText(document, /^(Pick the team|Choisir l'équipe|Play solo|Jouer solo|New expedition|Nouvelle expédition)$/i);
  if (startBtn) {
    startBtn.click();
    await sleep(550);
    return true;
  }

  const mapNodes = Array.from(
    document.querySelectorAll<HTMLButtonElement>('.path.wide button, .arena .screen .map button')
  ).filter((b) => !b.closest(`.tabs, ${KM_IGNORE_SEL}`) && !/Pick the team|Choisir l'équipe/i.test(cleanBtnText(b)));

  if (!mapNodes.length && document.querySelector('.arena .screen')) {
    const routeTab = Array.from(document.querySelectorAll<HTMLButtonElement>('.tabs button[role="tab"]:not(:disabled)')).find(
      (t) => t.getAttribute('aria-selected') !== 'true' && /^(Route|Map|Carte)$/i.test(cleanBtnText(t))
    );
    if (routeTab) {
      routeTab.click();
      await sleep(300);
      return true;
    }
  }

  if (mapNodes.length > 0) {
    const nodes = mapNodes.map((b) => ({
      label: (b.getAttribute('aria-label') || b.getAttribute('title') || cleanBtnText(b)).trim(),
      selectable: !b.disabled && b.getAttribute('aria-disabled') !== 'true' && !/\b(locked|done|visited)\b/i.test(b.className)
    }));
    const idx = pickExpeditionNextIndex(nodes);
    if (idx >= 0) {
      mapNodes[idx].click();
      await sleep(550);
      return true;
    }
  }

  const arena = document.querySelector('.arena') || document;
  const actionBtn =
    findButtonByText(arena, /^(Finish(?:\s*[×x]\d+)?|Terminer(?:\s*[×x]\d+)?|Fight|Combattre|Attack|Attaquer|Auto)$/i) ||
    findButtonByText(arena, /^(Claim|Récupérer|Take|Prendre|Open|Ouvrir|Heal|Soigner|Rest|Se reposer|Collect|Collecter|Continue|Continuer|Next|Suivant|Confirm|Confirmer|Leave|Quitter|Skip|Passer)$/i);
  if (actionBtn) {
    actionBtn.click();
    await sleep(500);
    return true;
  }

  const rewardCard = Array.from(arena.querySelectorAll<HTMLButtonElement>('button:not(:disabled)')).find(
    (b) => !b.closest(`.tabs, ${KM_IGNORE_SEL}`) && Boolean(b.querySelector('.tcg.pf, .pf-name'))
  );
  if (rewardCard) {
    rewardCard.click();
    await sleep(450);
    return true;
  }
  return false;
}

function parsePower(el: Element | null): number {
  if (!el) return 0;
  const numEl = el.querySelector('.pow, .power, .score, .pts, b.mono') || el;
  const match = (numEl.textContent || '').match(/-?\d+/);
  return match ? Number(match[0]) : 0;
}

export function extractThreeArcsState() {
  const arcs = Array.from(document.querySelectorAll<HTMLElement>('.board .arcs > .arc'));
  const lines = arcs.map((arc) => {
    const myPower = parsePower(arc.querySelector('.side.me, .me'));
    const oppPower = parsePower(arc.querySelector('.side.opp, .opp'));
    const sideBtns = Array.from(arc.querySelectorAll<HTMLButtonElement>('button.side.me:not(:disabled)'));
    const emptySlots = arc.querySelectorAll('.side.me .slot:not(.filled)').length;
    return { myPower, oppPower, openSlots: Math.max(sideBtns.length, emptySlots) };
  });
  return { arcs, lines };
}

export async function solveThreeArcsStep(): Promise<boolean> {
  const modeBtns = Array.from(document.querySelectorAll<HTMLButtonElement>('.gi .modes.stack button:not(:disabled)'));
  if (modeBtns.length > 0) {
    const soloAi =
      modeBtns.find((b) => /Against the computer|Contre l'ordinateur|VS AI|Contre l'IA|Bot/i.test(cleanBtnText(b))) ||
      modeBtns.find((b) => /Learn to play|Apprendre|Tutoriel|Tutorial/i.test(cleanBtnText(b)));
    if (soloAi) {
      soloAi.click();
      await sleep(650);
      return true;
    }
  }

  const handBtns = Array.from(document.querySelectorAll<HTMLButtonElement>('.hand button:not(:disabled), .board button.slot:not(:disabled)'))
    .filter((b) => !b.closest(KM_IGNORE_SEL) && !b.classList.contains('side'));
  const hasSelected = handBtns.some((b) => b.getAttribute('aria-pressed') === 'true' || b.classList.contains('selected'));

  if (!hasSelected && handBtns.length > 0) {
    const bestCard = [...handBtns].sort((a, b) => {
      const score = (btn: HTMLButtonElement) =>
        (RARITY_SCORE[parseRarityFromCardEl(btn)] || 1) * 10 + parsePower(btn.querySelector('.stats, .pow, b.mono') || btn);
      return score(b) - score(a);
    })[0];
    bestCard.click();
    await sleep(160);
  }

  const { arcs, lines } = extractThreeArcsState();
  const lineIdx = pickThreeArcsLineIndex(lines);
  if (lineIdx >= 0 && arcs[lineIdx]) {
    const sideBtn =
      arcs[lineIdx].querySelector<HTMLButtonElement>('button.side.me:not(:disabled)') ||
      document.querySelector<HTMLButtonElement>(`button.side.me[aria-label*="line ${lineIdx + 1}" i]:not(:disabled)`) ||
      Array.from(document.querySelectorAll<HTMLButtonElement>('button.side.me:not(:disabled)'))[lineIdx];
    if (sideBtn) {
      sideBtn.click();
      await sleep(450);
      return true;
    }
  }

  const kyaraBtn =
    document.querySelector<HTMLButtonElement>('.who.me-who .acts button.btn-acc.kyara:not(:disabled)') ||
    document.querySelector<HTMLButtonElement>('.who.me-who .acts button:not(:disabled)');
  if (kyaraBtn) {
    kyaraBtn.click();
    await sleep(500);
    return true;
  }
  return false;
}

export function extractBlindTestDom(catalogById: Map<number, any>) {
  const arena = document.querySelector('.arena');
  if (!arena) return { choiceBtns: [] as HTMLButtonElement[], hintText: '' };
  const choiceBtns = Array.from(arena.querySelectorAll<HTMLButtonElement>('button:not(:disabled)')).filter((b) => {
    if (b.closest(`.hud, .audio, .player, ${KM_IGNORE_SEL}`)) return false;
    const txt = cleanBtnText(b);
    const aria = b.getAttribute('aria-label') || '';
    if (!txt || /^(Play solo|Jouer solo|Play again|Rejouer|Play|Pause|Replay|Réécouter|Écouter|Listen|Mute)$/i.test(txt)) return false;
    if (/Play|Pause|Mute|Volume|Replay|Réécouter|Audio/i.test(aria)) return false;
    return true;
  });

  const hintParts: string[] = [];
  arena.querySelectorAll('.hint, .clue, .question, .prompt, .pf-name, .pf-ser, p, h2, h3').forEach((el) => {
    if (el.closest('button, .hud')) return;
    const t = el.textContent?.trim();
    if (t) hintParts.push(t);
  });
  arena.querySelectorAll<HTMLImageElement>('img').forEach((img) => {
    if (img.alt) hintParts.push(img.alt.trim());
    const m = img.src.match(/\/cards\/(?:sm|md|lg)?\/?(\d+)\./i);
    if (m && catalogById.has(Number(m[1]))) {
      const ch = catalogById.get(Number(m[1]));
      if (ch?.series) hintParts.push(ch.series);
    }
  });
  return { choiceBtns, hintText: hintParts.join(' ').trim() };
}

export async function solveBlindTestStep(catalogById: Map<number, any>): Promise<boolean> {
  const startBtn =
    document.querySelector<HTMLButtonElement>('.gi .modes button.mode.main:not(:disabled)') ||
    findButtonByText(document, /^(Play solo|Jouer solo)$/i);
  if (startBtn) {
    startBtn.click();
    await sleep(600);
    return true;
  }

  const { choiceBtns, hintText } = extractBlindTestDom(catalogById);
  if (!choiceBtns.length) return false;
  const idx = matchBlindTestChoice(hintText, choiceBtns.map(cleanBtnText), catalogById);
  choiceBtns[idx >= 0 ? idx : 0].click();
  await sleep(550);
  return true;
}

export async function solveExtraMiniGameRound(
  path: string,
  catalogById: Map<number, any>,
  meId?: string | number
): Promise<boolean> {
  if (path.startsWith('/jouer/main-kyara')) return solveMainKyaraStep();
  if (path.startsWith('/jouer/raid-du-jour')) return solveRaidStep(true, meId);
  if (path.startsWith('/jouer/raid')) return solveRaidStep(false, meId);
  if (path.startsWith('/jouer/expedition')) return solveExpeditionStep();
  if (path.startsWith('/jouer/trois-arcs')) return solveThreeArcsStep();
  if (path.startsWith('/jouer/blind-test')) return solveBlindTestStep(catalogById);
  return false;
}
