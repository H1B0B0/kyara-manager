import {
  evaluateKyara21,
  extractCardIdFromUrl,
  findBlindTestMatch,
  matchCharacterChoice,
  pickMostLovedWinner
} from '../../lib/analytics/games-solver';
import type { Rarity } from '../../types/kyara';
import {
  cleanBtnText,
  clickAdvanceOrNextButton,
  findButtonByText,
  humanSleep,
  isButtonUsable,
  isElementVisible,
  parseRarityFromCardEl,
  safeInterrupted
} from './games-core';

const KYARA21_NEXT_RE = /^(?:Main suivante|Next hand|Voir le r[eé]sultat|See the result)\b/i;
const KYARA21_HIT_RE = /^(?:Tirer|Hit|Carte)\b/i;
const KYARA21_STAND_RE = /^(?:Rester|Stand|Stopper)\b/i;
const QUIZ_NEXT_RE = /^(?:Suivant(?:e)?|Next|Voir le r[eé]sultat|See the result)\b/i;
const RARITY_21_FALLBACK: Record<Rarity, number> = { C: 3, U: 5, R: 7, E: 9, L: 10, M: 11 };

function readMemoryTileSig(tile: HTMLButtonElement): string | null {
  const isRevealed = tile.classList.contains('up') || tile.classList.contains('found');
  const frontImg = tile.querySelector<HTMLImageElement>('.face.front img[src*="/cards/"]');
  const img = frontImg || (isRevealed ? tile.querySelector<HTMLImageElement>('img[src*="/cards/"]') : null);
  const id = extractCardIdFromUrl(img?.src);
  return id !== null ? `id:${id}` : null;
}

export async function solveMemoryStep(memoryState: Map<number, string>): Promise<boolean> {
  if (typeof document === 'undefined') return false;
  let tiles = Array.from(document.querySelectorAll<HTMLButtonElement>('main div.grid button.tile'));
  if (!tiles.length) {
    tiles = Array.from(document.querySelectorAll<HTMLButtonElement>('main .felt button'));
  }
  if (tiles.length < 2) return clickAdvanceOrNextButton();

  if (memoryState.size > 0 && tiles.every((t) => !t.classList.contains('up') && !t.classList.contains('found'))) {
    memoryState.clear();
  }

  for (let i = 0; i < tiles.length; i += 1) {
    const sig = readMemoryTileSig(tiles[i]);
    if (sig) memoryState.set(i, sig);
  }

  const upUnfound: number[] = [];
  const unfoundHidden: number[] = [];
  for (let i = 0; i < tiles.length; i += 1) {
    const t = tiles[i];
    const isFound = t.classList.contains('found');
    const isUp = t.classList.contains('up');
    if (isUp && !isFound) {
      upUnfound.push(i);
    } else if (!isFound && !isUp && !t.disabled && isButtonUsable(t)) {
      unfoundHidden.push(i);
    }
  }

  if (upUnfound.length >= 2) {
    await humanSleep(600, 900);
    return true;
  }

  if (unfoundHidden.length === 0) {
    return clickAdvanceOrNextButton();
  }

  if (upUnfound.length === 1) {
    const flippedIdx = upUnfound[0];
    const sig = readMemoryTileSig(tiles[flippedIdx]) || memoryState.get(flippedIdx) || null;
    const mateIdx = sig ? unfoundHidden.find((j) => memoryState.get(j) === sig) : undefined;
    const targetIdx =
      mateIdx !== undefined ? mateIdx : unfoundHidden.find((j) => !memoryState.has(j)) ?? unfoundHidden[0];
    tiles[targetIdx].click();
    if (mateIdx !== undefined) {
      await humanSleep(850, 1300);
      return true;
    }
    await humanSleep(500, 750);
    if (safeInterrupted()) return false;
    const s2 = readMemoryTileSig(tiles[targetIdx]);
    if (s2) memoryState.set(targetIdx, s2);
    await humanSleep(650, 950);
    return true;
  }

  const bySig = new Map<string, number[]>();
  for (const idx of unfoundHidden) {
    const sig = memoryState.get(idx);
    if (sig) bySig.set(sig, [...(bySig.get(sig) || []), idx]);
  }
  for (const pair of bySig.values()) {
    if (pair.length >= 2) {
      tiles[pair[0]].click();
      await humanSleep(650, 1050);
      if (safeInterrupted()) return false;
      tiles[pair[1]].click();
      await humanSleep(850, 1300);
      return true;
    }
  }

  const firstIdx = unfoundHidden.find((i) => !memoryState.has(i)) ?? unfoundHidden[0];
  tiles[firstIdx].click();
  await humanSleep(500, 750);
  if (safeInterrupted()) return false;

  const s1 = readMemoryTileSig(tiles[firstIdx]);
  if (s1) memoryState.set(firstIdx, s1);

  const immediateMate = s1 ? unfoundHidden.find((j) => j !== firstIdx && memoryState.get(j) === s1) : undefined;
  if (immediateMate !== undefined) {
    tiles[immediateMate].click();
    await humanSleep(850, 1300);
    return true;
  }

  const remaining = unfoundHidden.filter((j) => j !== firstIdx);
  if (!remaining.length) return true;
  const secondIdx = remaining.find((j) => !memoryState.has(j)) ?? remaining[0];
  tiles[secondIdx].click();
  await humanSleep(500, 750);
  if (safeInterrupted()) return false;

  const s2 = readMemoryTileSig(tiles[secondIdx]);
  if (s2) memoryState.set(secondIdx, s2);
  await humanSleep(1100, 1500);
  return true;
}

function parseCardValText(raw: string | null | undefined): number | null {
  const txt = String(raw || '').trim().toUpperCase();
  if (!txt) return null;
  if (txt === 'A' || txt === 'AS' || txt === 'ACE') return 11;
  const match = txt.match(/\d+/);
  if (!match) return null;
  const num = Number(match[0]);
  return Number.isFinite(num) && num > 0 ? num : null;
}

function readRowCardValues(row: Element | undefined): number[] {
  if (!row) return [];
  const vals = Array.from(row.querySelectorAll('.val.mono'))
    .map((el) => parseCardValText(el.textContent))
    .filter((v): v is number => v !== null);
  if (vals.length > 0) return vals;

  const whoMatch = (row.querySelector('.who')?.textContent || '').match(/\b(\d{1,2})\b/);
  if (whoMatch) {
    const total = Number(whoMatch[1]);
    if (Number.isFinite(total) && total > 0) return [total];
  }

  return Array.from(row.querySelectorAll('.tcg.pf')).map(
    (card) => RARITY_21_FALLBACK[parseRarityFromCardEl(card)] ?? 6
  );
}

export async function solveKyara21Step(): Promise<boolean> {
  if (typeof document === 'undefined') return false;
  const main = document.querySelector('main') || document;

  const nextCand = Array.from(main.querySelectorAll<HTMLButtonElement>('div.actions > button.btn.btn-acc')).find(
    (b) => isElementVisible(b) && KYARA21_NEXT_RE.test(cleanBtnText(b))
  );
  if (nextCand) {
    if (isButtonUsable(nextCand)) {
      await humanSleep(700, 1200);
      if (safeInterrupted()) return false;
      nextCand.click();
      await humanSleep(600, 950);
      return true;
    }
    await humanSleep(500, 750);
    return true;
  }

  const actionsScope = main.querySelector('.actions') || main;
  const standBtn =
    Array.from(actionsScope.querySelectorAll<HTMLButtonElement>('button.btn-ghost')).find(
      (b) => isButtonUsable(b) && KYARA21_STAND_RE.test(cleanBtnText(b))
    ) ||
    findButtonByText(actionsScope, KYARA21_STAND_RE) ||
    findButtonByText(main, KYARA21_STAND_RE);

  const hitBtn =
    Array.from(actionsScope.querySelectorAll<HTMLButtonElement>('button.btn-acc')).find(
      (b) => isButtonUsable(b) && KYARA21_HIT_RE.test(cleanBtnText(b))
    ) ||
    findButtonByText(actionsScope, KYARA21_HIT_RE) ||
    findButtonByText(main, KYARA21_HIT_RE);

  if (hitBtn && standBtn) {
    let rows = Array.from(main.querySelectorAll('div.felt-in div.row, .felt-in .row'));
    if (rows.length < 2) rows = Array.from(main.querySelectorAll('div.row'));
    const dealerVals = readRowCardValues(rows[0]);
    const dealerVisibleVal = dealerVals.length ? dealerVals[0] : null;
    const playerValues = readRowCardValues(rows[1]);

    const move = evaluateKyara21(playerValues, dealerVisibleVal);
    await humanSleep(900, 1600);
    if (safeInterrupted()) return false;
    (move === 'hit' ? hitBtn : standBtn).click();
    await humanSleep(550, 900);
    return true;
  }

  return clickAdvanceOrNextButton(main, 700, 1200);
}

function extractBlindTestHintText(arena: ParentNode, catalogById: Map<number, any>): string {
  const parts: string[] = [];
  arena.querySelectorAll('.hint, .clue, .question, .prompt, .pf-name, .pf-ser, p, h2, h3').forEach((el) => {
    if (!el.closest('button, .hud')) {
      const txt = el.textContent?.trim();
      if (txt) parts.push(txt);
    }
  });
  arena.querySelectorAll<HTMLImageElement>('img').forEach((img) => {
    if (img.alt) parts.push(img.alt.trim());
    const id = extractCardIdFromUrl(img.src);
    if (id !== null && catalogById.get(id)?.series) {
      parts.push(String(catalogById.get(id).series));
    }
  });
  return parts.join(' ').trim();
}

function readPlusAimeStreak(): number {
  if (typeof document === 'undefined') return 0;
  const hud = document.querySelector('main .hud');
  const match = (hud?.textContent || '').match(/(?:Streak|S[eé]rie)\s*:?\s*(\d+)/i);
  return match ? Number(match[1]) || 0 : 0;
}

export async function solveSoloQuizStep(path: string, catalogById: Map<number, any>): Promise<boolean> {
  if (typeof document === 'undefined') return false;
  const main = document.querySelector('main') || document;

  const nextBtn = Array.from(
    main.querySelectorAll<HTMLButtonElement>('.foot button.btn-acc, .actions button.btn-acc')
  ).find((b) => isButtonUsable(b) && QUIZ_NEXT_RE.test(cleanBtnText(b)));
  if (nextBtn) {
    await humanSleep(700, 1300);
    if (safeInterrupted()) return false;
    nextBtn.click();
    await humanSleep(650, 1050);
    return true;
  }

  if (path.startsWith('/jouer/plus-aime')) {
    const picks = Array.from(main.querySelectorAll<HTMLButtonElement>('div.duel > button.pick'));
    if (picks.length >= 2) {
      const hasResult = picks.some((p) => p.classList.contains('win') || p.classList.contains('lose'));
      const anyUsable = picks.some((p) => isButtonUsable(p));
      if (hasResult || !anyUsable) {
        await humanSleep(450, 700);
        return true;
      }
      const ids = picks.map((p) => extractCardIdFromUrl(p.querySelector<HTMLImageElement>('img')?.src));
      const names = picks.map((p) => p.querySelector('.pf-name')?.textContent?.trim() || cleanBtnText(p));
      const { winnerIndex } = pickMostLovedWinner(ids, names, catalogById);
      const streak = readPlusAimeStreak();
      const pickIdx = streak >= 16 ? (winnerIndex === 0 ? 1 : 0) : winnerIndex;
      await humanSleep(1300, 2200);
      if (safeInterrupted()) return false;
      picks[pickIdx]?.click();
      await humanSleep(650, 1050);
      return true;
    }
    return clickAdvanceOrNextButton(main);
  }

  if (path.startsWith('/jouer/qui-est-ce') || path.startsWith('/jouer/serie-express')) {
    const choices = Array.from(main.querySelectorAll<HTMLButtonElement>('div.choices > button.choice'));
    if (choices.length > 0) {
      const hasResult = choices.some(
        (c) => c.classList.contains('right') || c.classList.contains('wrong') || c.classList.contains('mine')
      );
      const enabledChoices = choices.filter((c) => isButtonUsable(c));
      if (hasResult || !enabledChoices.length) {
        await humanSleep(450, 700);
        return true;
      }
      const arena = main.querySelector('.arena') || main;
      const clueIds = Array.from(arena.querySelectorAll<HTMLImageElement>('img[src*="/cards/"]'))
        .map((img) => extractCardIdFromUrl(img.src))
        .filter((id): id is number => id !== null);
      if (clueIds.length === 0) {
        await humanSleep(450, 700);
        return true;
      }
      const mode = path.startsWith('/jouer/serie-express') ? 'series' : 'character';
      let idx = matchCharacterChoice(clueIds, enabledChoices.map(cleanBtnText), catalogById, mode);
      if (idx < 0 || idx >= enabledChoices.length) idx = 0;
      await humanSleep(1500, 2500);
      if (safeInterrupted()) return false;
      enabledChoices[idx]?.click();
      await humanSleep(650, 1050);
      return true;
    }
    return clickAdvanceOrNextButton(main);
  }

  if (path.startsWith('/jouer/blind-test')) {
    const choices = Array.from(main.querySelectorAll<HTMLButtonElement>('div.choices > button.choice'));
    if (choices.length > 0) {
      const hasResult = choices.some(
        (c) => c.classList.contains('right') || c.classList.contains('wrong') || c.classList.contains('mine')
      );
      if (hasResult) {
        await humanSleep(450, 700);
        return true;
      }
      const enabledChoices = choices.filter((c) => isButtonUsable(c));
      if (!enabledChoices.length) {
        await humanSleep(600, 900);
        return true;
      }
      const arena = main.querySelector('.arena') || main;
      const hintText = extractBlindTestHintText(arena, catalogById);
      const { index } = findBlindTestMatch(hintText, enabledChoices.map(cleanBtnText), catalogById);
      const pickIdx = index >= 0 && index < enabledChoices.length ? index : 0;
      await humanSleep(1800, 3000);
      if (safeInterrupted()) return false;
      enabledChoices[pickIdx]?.click();
      await humanSleep(650, 1050);
      return true;
    }
    return clickAdvanceOrNextButton(main);
  }

  return false;
}
