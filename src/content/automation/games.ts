import { kyaraApi } from '../api';
import { ensureCatalog } from '../cache';
import { state, loadSettings } from '../state';
import { appendJournal } from '../journal';
import { isInterrupted } from '../safety';
import { navigateSpaTo } from './spa-navigator';
import {
  ALL_PLAYABLE_GAMES,
  extractCardIdFromUrl,
  matchCharacterChoice,
  pickMostLovedWinner,
  recommendArcadeLot,
  shouldHitKyara21
} from '../../lib/analytics/games-solver';
import type { ArcadeSummary, Rarity } from '../../types/kyara';
import type { KyaraGameId } from '../../types/settings';
import {
  NEXT_BTN_RE,
  REPLAY_BTN_RE,
  START_MODE_RE,
  advanceOrWaitTransition,
  cleanBtnText,
  clickAdvanceOrNextButton,
  findButtonByText,
  hasAnsweredChoices,
  hasDiscordGate,
  humanSleep,
  isButtonUsable,
  isDailyRaidAlreadyPlayed,
  markDailyRaidPlayed,
  safeInterrupted,
  setGamesFastModeForTest,
  solveExtraMiniGameRound,
  solveHandCardStep
} from './games-extra';

const RARITY_21_AVG: Record<Rarity, number> = { C: 3, U: 5.5, R: 7.5, E: 9, L: 10, M: 11 };
const MIN_RUN_MS: Record<string, number> = {
  memoire: 14_000,
  'plus-aime': 12_000,
  'qui-est-ce': 12_000,
  'serie-express': 12_000,
  'kyara-21': 12_000,
  'blind-test': 12_000,
  'main-kyara': 6_000,
  raid: 6_000,
  expedition: 8_000,
  'trois-arcs': 8_000
};
let allGamesCursor = 0;

export async function fetchArcadeSummary(): Promise<ArcadeSummary | null> {
  try {
    const [arcade, boss] = await Promise.all([
      kyaraApi('/play/arcade', { auth: true }).catch(() => null),
      kyaraApi('/play/arcade/boss', { auth: true }).catch(() => null)
    ]);
    if (!arcade || typeof arcade !== 'object' || Array.isArray(arcade)) return null;

    const balance = Number(arcade.balance) || 0;
    const lots = Array.isArray(arcade.lots) ? arcade.lots : [];
    const bestLot = recommendArcadeLot(balance, lots);
    const activeBoss = boss || arcade.boss || {};
    const secret = activeBoss?.secret;

    return {
      enabled: arcade.enabled !== false,
      blocked: arcade.blocked || null,
      balance,
      today: Number(arcade.today) || 0,
      dayCap: Number(arcade.dayCap) || 60,
      week: Number(arcade.week) || 0,
      weekCap: Number(arcade.weekCap) || 300,
      bestLotLabel: bestLot?.label || bestLot?.name || bestLot?.id || null,
      bestLotPrice: bestLot?.price ?? null,
      canBuyLot: Boolean(bestLot && balance >= Number(bestLot.price)),
      bossName: activeBoss?.name || null,
      bossDefeated: Boolean(activeBoss?.defeated),
      secretGoldenReady: Boolean(secret?.golden && secret?.defeated && !secret?.claimed)
    };
  } catch {
    return null;
  }
}

async function isDailyHandAlreadyPlayed(meId: string | number | undefined): Promise<boolean> {
  try {
    const board = await kyaraApi(`/play/daily/board${meId ? `?me=${encodeURIComponent(String(meId))}` : ''}`, { auth: true });
    if (!board || typeof board !== 'object') return false;
    if (board.played === true || board.mine?.score !== undefined) return true;
    const top = Array.isArray(board.top) ? board.top : [];
    return Boolean(meId && top.some((row: any) => String(row?.id) === String(meId)));
  } catch {
    return false;
  }
}

async function clickSoloStartIfNeeded(gameSlug?: string): Promise<'started' | 'blocked' | 'already'> {
  if (hasDiscordGate()) return 'blocked';
  const scope = document.querySelector('main') || document;

  if (gameSlug === 'trois-arcs') {
    const modeBtns = Array.from(scope.querySelectorAll<HTMLButtonElement>('.gi .modes.stack button:not(:disabled)'));
    const aiBtn =
      modeBtns.find((b) => /Against the computer|Contre l'ordinateur|VS AI|Contre l'IA|Bot/i.test(cleanBtnText(b))) ||
      modeBtns.find((b) => /Learn to play|Apprendre|Tutoriel|Tutorial/i.test(cleanBtnText(b))) ||
      findButtonByText(scope, REPLAY_BTN_RE);
    if (aiBtn && isButtonUsable(aiBtn)) {
      aiBtn.click();
      await humanSleep(900, 1500);
      return hasDiscordGate() ? 'blocked' : 'started';
    }
    return 'already';
  }

  const modeBtn = document.querySelector<HTMLButtonElement>('.gi .modes button.mode.main:not(:disabled)');
  const startBtn =
    (modeBtn && isButtonUsable(modeBtn) ? modeBtn : null) ||
    findButtonByText(scope, START_MODE_RE) ||
    findButtonByText(scope, REPLAY_BTN_RE);
  if (startBtn) {
    startBtn.click();
    await humanSleep(900, 1500);
    return hasDiscordGate() ? 'blocked' : 'started';
  }
  return 'already';
}

export async function solveDailyHandStep(): Promise<boolean> {
  return solveHandCardStep({ allowStart: false, allowDiscard: false });
}

export async function solveActiveMiniGameRound(
  catalogById: Map<number, any>,
  memoryState?: Map<number, string>,
  meId?: string | number
): Promise<boolean> {
  if (typeof window === 'undefined' || typeof document === 'undefined') return false;
  const path = window.location.pathname || '';
  if (path.startsWith('/jouer/main-du-jour')) return solveDailyHandStep();

  if (path.startsWith('/jouer/plus-aime')) {
    const arena = document.querySelector('main .arena');
    if (arena) {
      const candidates = Array.from(arena.querySelectorAll<HTMLElement>('button, [role="button"]')).filter((el) =>
        Boolean(el.querySelector('img[src*="/cards/"]') || el.querySelector('.pf-name'))
      );
      if (candidates.length >= 2 && !hasAnsweredChoices(arena, candidates)) {
        const ids = candidates.map((c) => extractCardIdFromUrl(c.querySelector<HTMLImageElement>('img')?.src));
        const names = candidates.map((c) => c.querySelector('.pf-name')?.textContent?.trim() || c.textContent?.trim() || '');
        const { winnerIndex } = pickMostLovedWinner(ids, names, catalogById);
        await humanSleep(1300, 2300);
        if (safeInterrupted()) return false;
        candidates[winnerIndex]?.click();
        await humanSleep(700, 1200);
        return true;
      }
      if (candidates.length > 0) return advanceOrWaitTransition();
    }
  }

  if (path.startsWith('/jouer/qui-est-ce') || path.startsWith('/jouer/serie-express')) {
    const arena = document.querySelector('main .arena');
    if (arena) {
      const allChoices = Array.from(arena.querySelectorAll<HTMLButtonElement>('button')).filter((b) => {
        if (b.querySelector('img[src*="/cards/"]')) return false;
        const txt = cleanBtnText(b);
        return Boolean(txt) && !NEXT_BTN_RE.test(txt) && !REPLAY_BTN_RE.test(txt) && !START_MODE_RE.test(txt);
      });
      const enabledChoices = allChoices.filter((b) => isButtonUsable(b));
      if (allChoices.length > 0 && (hasAnsweredChoices(arena, allChoices) || !enabledChoices.length)) {
        return advanceOrWaitTransition();
      }
      const clueIds = Array.from(arena.querySelectorAll<HTMLImageElement>('img[src*="/cards/"]'))
        .map((img) => extractCardIdFromUrl(img.src))
        .filter((id): id is number => id !== null);
      if (clueIds.length > 0 && enabledChoices.length > 0) {
        const idx = matchCharacterChoice(
          clueIds,
          enabledChoices.map(cleanBtnText),
          catalogById,
          path.startsWith('/jouer/serie-express') ? 'series' : 'character'
        );
        if (idx >= 0) {
          await humanSleep(1300, 2300);
          if (safeInterrupted()) return false;
          enabledChoices[idx].click();
          await humanSleep(700, 1200);
          return true;
        }
      }
      return clickAdvanceOrNextButton(undefined, 900, 1600);
    }
  }

  if (path.startsWith('/jouer/memoire') && memoryState) {
    const tiles = Array.from(document.querySelectorAll<HTMLButtonElement>('main .felt button'));
    if (tiles.length >= 4) {
      const sig = (el: HTMLButtonElement): string | null => {
        const img = el.querySelector<HTMLImageElement>('img[src*="/cards/"]');
        if (img?.src) return `id:${extractCardIdFromUrl(img.src) || img.src}`;
        const name = el.querySelector('.pf-name')?.textContent?.trim();
        return name ? `name:${name}` : null;
      };
      tiles.forEach((t, idx) => {
        const s = sig(t);
        if (s && !t.disabled) memoryState.set(idx, s);
      });
      const activeTiles = tiles
        .map((el, idx) => ({ el, idx }))
        .filter(({ el }) => !el.disabled && el.getAttribute('aria-disabled') !== 'true');
      if (activeTiles.length >= 2) {
        const byKey = new Map<string, number[]>();
        for (const { idx } of activeTiles) {
          const key = memoryState.get(idx);
          if (key) byKey.set(key, [...(byKey.get(key) || []), idx]);
        }
        for (const pair of byKey.values()) {
          if (pair.length >= 2) {
            tiles[pair[0]].click();
            await humanSleep(900, 1650);
            if (safeInterrupted()) return false;
            tiles[pair[1]].click();
            await humanSleep(900, 1650);
            return true;
          }
        }
        const unknown = activeTiles.filter(({ idx }) => !memoryState.has(idx));
        const pick = unknown.length >= 2 ? unknown.slice(0, 2) : activeTiles.slice(0, 2);
        tiles[pick[0].idx].click();
        await humanSleep(900, 1650);
        if (safeInterrupted()) return false;
        const s1 = sig(tiles[pick[0].idx]);
        if (s1) memoryState.set(pick[0].idx, s1);
        const mate = activeTiles.find(({ idx }) => idx !== pick[0].idx && memoryState.get(idx) === s1);
        const secondIdx = mate ? mate.idx : pick[1].idx;
        tiles[secondIdx].click();
        await humanSleep(900, 1650);
        const s2 = sig(tiles[secondIdx]);
        if (s2) memoryState.set(secondIdx, s2);
        return true;
      }
    }
    return clickAdvanceOrNextButton(undefined, 800, 1400);
  }

  if (path.startsWith('/jouer/kyara-21')) {
    const felt = document.querySelector('main .felt');
    const mainScope = document.querySelector('main') || document;
    const hitBtn = felt ? findButtonByText(felt, /^(?:Hit|Tirer|Carte)\b/i) || findButtonByText(mainScope, /^(?:Hit|Tirer|Carte)\b/i) : null;
    const standBtn = felt ? findButtonByText(felt, /^(?:Stand|Rester|Stopper)\b/i) || findButtonByText(mainScope, /^(?:Stand|Rester|Stopper)\b/i) : null;
    if (felt && hitBtn && standBtn) {
      let sum = 0;
      let softM = 0;
      for (const c of Array.from(felt.querySelectorAll('.tcg.pf')).slice(-6)) {
        const rMatch = c.className.match(/\bp-([CURELM])\b/i);
        const r = (rMatch ? rMatch[1].toUpperCase() : 'R') as Rarity;
        sum += RARITY_21_AVG[r] || 6;
        if (r === 'M') softM += 1;
      }
      await humanSleep(1000, 1800);
      if (safeInterrupted()) return false;
      (shouldHitKyara21(sum, softM) ? hitBtn : standBtn).click();
      await humanSleep(600, 1000);
      return true;
    }
    return clickAdvanceOrNextButton(undefined, 800, 1300);
  }

  if (await solveExtraMiniGameRound(path, catalogById, meId)) return true;
  if (path.startsWith('/jouer/')) return clickAdvanceOrNextButton(undefined, 800, 1400);
  return false;
}

async function playGameRuns(
  slug: string,
  runs: number,
  catalogById: Map<number, any>,
  meId?: string | number
): Promise<{ played: number; blocked: boolean }> {
  const ok = await navigateSpaTo(`/jouer/${encodeURIComponent(slug)}`);
  if (!ok) return { played: 0, blocked: false };
  await humanSleep(700, 1200);
  if (hasDiscordGate()) return { played: 0, blocked: true };

  let played = 0;
  for (let run = 0; run < runs && !isInterrupted(); run += 1) {
    const runStartedAt = Date.now();
    const startRes = await clickSoloStartIfNeeded(slug);
    if (startRes === 'blocked') return { played, blocked: true };

    const memState = new Map<number, string>();
    let didMove = false;
    let idleSteps = 0;
    for (let step = 0; step < 100 && !isInterrupted(); step += 1) {
      if (hasDiscordGate()) return { played, blocked: true };
      const mainScope = document.querySelector('main') || document;
      if (didMove && findButtonByText(mainScope, REPLAY_BTN_RE)) {
        if (await clickAdvanceOrNextButton(undefined, 600, 1100)) {
          idleSteps = 0;
          continue;
        }
        break;
      }
      if (await solveActiveMiniGameRound(catalogById, memState, meId)) {
        didMove = true;
        idleSteps = 0;
      } else {
        idleSteps += 1;
        if (idleSteps >= 22) break;
        await humanSleep(450, 650);
      }
    }
    if (didMove) {
      const minRunMs = MIN_RUN_MS[slug] ?? 0;
      const elapsed = Date.now() - runStartedAt;
      if (minRunMs > 0 && elapsed < minRunMs && !isInterrupted()) {
        await humanSleep(minRunMs - elapsed, minRunMs - elapsed + 1200);
      }
      played += 1;
      if (slug === 'raid-du-jour') markDailyRaidPlayed(meId);
    }
    if (run + 1 < runs && !isInterrupted()) {
      await humanSleep(2400, 4200);
    }
  }
  return { played, blocked: false };
}

export async function executeAutoGames(
  dashboard: any,
  options: { manual?: boolean; gameId?: string; solveOnce?: boolean; _fastForTest?: boolean } = {}
): Promise<{ playedGames: number; ticketsEarned: number; blocked?: string | null; arcade?: ArcadeSummary | null }> {
  setGamesFastModeForTest(Boolean(options._fastForTest));
  try {
    await loadSettings();
    const arcadeBefore = await fetchArcadeSummary();
    if (!arcadeBefore || !arcadeBefore.enabled) {
      return { playedGames: 0, ticketsEarned: 0, blocked: arcadeBefore?.blocked || 'disabled', arcade: arcadeBefore };
    }

    const targetGame = (options.gameId || state.currentSettings.autoGamesTargetGame || 'all') as KyaraGameId;
    const today = arcadeBefore.today;
    const dayCap = arcadeBefore.dayCap || 60;
    const week = arcadeBefore.week;
    const weekCap = arcadeBefore.weekCap || 300;

    if (state.currentSettings.dryRun) {
      await appendJournal('info', `[SIMULATION] Farmerait la Salle de Jeux (${targetGame}) · ${today}/${dayCap} tickets aujourd'hui`);
      return { playedGames: 0, ticketsEarned: 0, arcade: arcadeBefore };
    }

    const catalogById = await ensureCatalog(false).catch(() => new Map<number, any>());
    const meId = dashboard?.me?.id;

    if (options.solveOnce) {
      const solved = await solveActiveMiniGameRound(catalogById, new Map(), meId);
      const after = await fetchArcadeSummary();
      return {
        playedGames: solved ? 1 : 0,
        ticketsEarned: Math.max(0, (after?.balance ?? arcadeBefore.balance) - arcadeBefore.balance),
        arcade: after || arcadeBefore
      };
    }

    if (arcadeBefore.blocked) {
      if (options.manual) {
        await appendJournal('warn', 'Salle de Jeux bloquée : lie ton compte Discord sur kyara.games pour débloquer les mini-jeux.');
      }
      return { playedGames: 0, ticketsEarned: 0, blocked: arcadeBefore.blocked, arcade: arcadeBefore };
    }

    if ((today >= dayCap || week >= weekCap) && !options.manual) {
      return { playedGames: 0, ticketsEarned: 0, arcade: arcadeBefore };
    }

    let playedGames = 0;
    const previousPath = typeof location !== 'undefined' ? location.pathname : '';
    const dailyEnabled = state.currentSettings.autoGamesDailyEnabled !== false;
    const allowDaily = dailyEnabled || (Boolean(options.manual) && (targetGame === 'main-du-jour' || targetGame === 'raid-du-jour'));

    if (allowDaily && (targetGame === 'main-du-jour' || targetGame === 'all' || !options.gameId)) {
      const already = await isDailyHandAlreadyPlayed(meId);
      if (!already && !isInterrupted()) {
        const ok = await navigateSpaTo('/jouer/main-du-jour');
        if (ok) {
          await humanSleep(700, 1200);
          let acted = false;
          for (let hand = 0; hand < 10 && !isInterrupted(); hand += 1) {
            const mainScope = document.querySelector('main') || document;
            if (hasDiscordGate() || findButtonByText(mainScope, REPLAY_BTN_RE)) break;
            if (!(await solveDailyHandStep())) break;
            acted = true;
            await humanSleep(450, 750);
          }
          if (acted) playedGames += 1;
        }
      }
    }

    if (allowDaily && (targetGame === 'raid-du-jour' || targetGame === 'all' || !options.gameId)) {
      const alreadyRaid = await isDailyRaidAlreadyPlayed(meId);
      if (!alreadyRaid && !isInterrupted()) {
        const res = await playGameRuns('raid-du-jour', 1, catalogById, meId);
        playedGames += res.played;
      }
    }

    const maxRuns = options.manual ? 5 : 2;
    if (!isInterrupted() && targetGame !== 'main-du-jour' && targetGame !== 'raid-du-jour' && today < dayCap && week < weekCap) {
      if (playedGames > 0) await humanSleep(2400, 4200);
      if (targetGame === 'all') {
        let soloPlayed = 0;
        for (let tries = 0; tries < ALL_PLAYABLE_GAMES.length && soloPlayed < maxRuns && !isInterrupted(); tries += 1) {
          const slug = ALL_PLAYABLE_GAMES[allGamesCursor % ALL_PLAYABLE_GAMES.length];
          allGamesCursor = (allGamesCursor + 1) % ALL_PLAYABLE_GAMES.length;
          const res = await playGameRuns(slug, 1, catalogById, meId);
          if (res.blocked) continue;
          if (res.played > 0) {
            playedGames += res.played;
            soloPlayed += 1;
            if (soloPlayed < maxRuns && !isInterrupted()) await humanSleep(2400, 4200);
          }
        }
      } else {
        const res = await playGameRuns(targetGame, maxRuns, catalogById, meId);
        playedGames += res.played;
      }
    }

    if (!options.manual && previousPath && !previousPath.startsWith('/jouer') && typeof location !== 'undefined' && location.pathname !== previousPath) {
      await navigateSpaTo(previousPath).catch(() => false);
    }

    if (playedGames > 0 && !isInterrupted()) {
      await humanSleep(1500, 2200);
    }

    const arcadeAfter = await fetchArcadeSummary();
    const balanceNow = arcadeAfter?.balance ?? arcadeBefore.balance;
    const ticketsEarned = Math.max(0, balanceNow - arcadeBefore.balance);
    const isDailyOnly = targetGame === 'main-du-jour' || targetGame === 'raid-du-jour';
    const noCreditNote =
      playedGames > 0 && ticketsEarned === 0 && !isDailyOnly && today < dayCap && week < weekCap
        ? ' · aucun ticket crédité (manche incomplète ou délai serveur)'
        : '';
    if (playedGames > 0 || ticketsEarned > 0) {
      await appendJournal(
        'info',
        `Salle de Jeux : ${playedGames} partie(s) jouée(s)${ticketsEarned > 0 ? `, +${ticketsEarned} ticket(s)` : ''}${noCreditNote} · Solde ${balanceNow} 🎟`
      );
    }
    return { playedGames, ticketsEarned, arcade: arcadeAfter || arcadeBefore };
  } finally {
    setGamesFastModeForTest(false);
  }
}
