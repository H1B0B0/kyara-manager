import { kyaraApi } from '../api';
import { ensureCatalog } from '../cache';
import { state, loadSettings } from '../state';
import { appendJournal } from '../journal';
import { isInterrupted } from '../safety';
import { navigateSpaTo } from './spa-navigator';
import { ALL_PLAYABLE_GAMES, recommendArcadeLot } from '../../lib/analytics/games-solver';
import type { ArcadeSummary } from '../../types/kyara';
import type { KyaraGameId } from '../../types/settings';
import {
  REPLAY_BTN_RE,
  START_MODE_RE,
  cleanBtnText,
  clickAdvanceOrNextButton,
  findButtonByText,
  hasDiscordGate,
  humanSleep,
  isButtonUsable,
  isGameFinishedScreen,
  setGamesFastModeForTest
} from './games-core';
import { solvePokerHandStep } from './games-poker';
import { solveKyara21Step, solveMemoryStep, solveSoloQuizStep } from './games-classic';
import { isDailyRaidAlreadyPlayed, markDailyRaidPlayed, solveExtraMiniGameRound } from './games-extra';

const MIN_RUN_MS: Record<string, number> = {
  memoire: 14_000, 'plus-aime': 12_000, 'qui-est-ce': 12_000, 'serie-express': 12_000, 'kyara-21': 12_000,
  'blind-test': 12_000, 'main-kyara': 6_000, raid: 6_000, expedition: 8_000, 'trois-arcs': 8_000
};
const THREE_ARCS_AI_RE = /Against the computer|Contre l'ordinateur|VS AI|Contre l'IA|Bot/i;
let allGamesCursor = 0;

export async function fetchArcadeSummary(): Promise<ArcadeSummary | null> {
  try {
    const [arcade, boss] = await Promise.all([
      kyaraApi('/play/arcade', { auth: true }).catch(() => null),
      kyaraApi('/play/arcade/boss', { auth: true }).catch(() => null)
    ]);
    if (!arcade || typeof arcade !== 'object' || Array.isArray(arcade)) return null;
    const balance = Number(arcade.balance) || 0;
    const bestLot = recommendArcadeLot(balance, Array.isArray(arcade.lots) ? arcade.lots : []);
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
    if (board.played === true || (board.mine?.score !== undefined && board.mine?.score !== null)) return true;
    const top = Array.isArray(board.top) ? board.top : [];
    return Boolean(meId && top.some((row: any) => String(row?.id) === String(meId)));
  } catch {
    return false;
  }
}

async function clickSoloStartIfNeeded(gameSlug?: string): Promise<'started' | 'blocked' | 'already'> {
  if (hasDiscordGate()) return 'blocked';
  const scope = document.querySelector('main') || document;

  if (gameSlug === 'memoire') {
    const lv8 = Array.from(scope.querySelectorAll<HTMLButtonElement>('.lvs > button.lvb')).find(
      (b) => isButtonUsable(b) && /^8\b/.test(cleanBtnText(b))
    );
    if (lv8 && lv8.getAttribute('aria-pressed') !== 'true' && !lv8.classList.contains('active') && !lv8.classList.contains('on')) {
      lv8.click();
      await humanSleep(250, 450);
    }
  }

  if (gameSlug === 'trois-arcs') {
    const aiBtn = Array.from(scope.querySelectorAll<HTMLButtonElement>('.gi .modes.stack button:not(:disabled)')).find(
      (b) => isButtonUsable(b) && THREE_ARCS_AI_RE.test(cleanBtnText(b))
    );
    if (aiBtn) {
      aiBtn.click();
      await humanSleep(900, 1500);
      return hasDiscordGate() ? 'blocked' : 'started';
    }
    return 'already';
  }

  const modeBtn = document.querySelector<HTMLButtonElement>('.gi .modes button.mode.main:not(:disabled)');
  const startBtn = (modeBtn && isButtonUsable(modeBtn) ? modeBtn : null) || findButtonByText(scope, START_MODE_RE);
  if (startBtn) {
    startBtn.click();
    await humanSleep(900, 1500);
    return hasDiscordGate() ? 'blocked' : 'started';
  }
  return 'already';
}

export async function solveDailyHandStep(catalogById?: Map<number, any>): Promise<boolean> {
  return solvePokerHandStep(catalogById || new Map(), { allowStart: false });
}

export async function solveActiveMiniGameRound(
  catalogById: Map<number, any>,
  memoryState?: Map<number, string>,
  meId?: string | number,
  options: { allowTutorial?: boolean } = {}
): Promise<boolean> {
  if (typeof window === 'undefined' || typeof document === 'undefined') return false;
  const path = window.location.pathname || '';
  if (path.startsWith('/jouer/main-du-jour')) return solveDailyHandStep(catalogById);
  if (path.startsWith('/jouer/memoire')) return solveMemoryStep(memoryState || new Map());
  if (path.startsWith('/jouer/kyara-21')) return solveKyara21Step();
  if (/^\/jouer\/(?:plus-aime|qui-est-ce|serie-express|blind-test)\b/.test(path)) {
    return solveSoloQuizStep(path, catalogById);
  }
  if (await solveExtraMiniGameRound(path, catalogById, meId, options)) return true;
  return path.startsWith('/jouer/') ? clickAdvanceOrNextButton(undefined, 700, 1200) : false;
}

function isMemoryAllFound(): boolean {
  if (typeof document === 'undefined') return false;
  const tiles = Array.from(document.querySelectorAll<HTMLButtonElement>('main div.grid button.tile, main .felt button.tile'));
  return tiles.length >= 2 && tiles.every((t) => t.classList.contains('found'));
}

async function playGameRuns(
  slug: string,
  runs: number,
  catalogById: Map<number, any>,
  meId?: string | number
): Promise<{ played: number; blocked: boolean }> {
  const targetPath = `/jouer/${encodeURIComponent(slug)}`;
  if (!(await navigateSpaTo(targetPath, { owner: 'games' }))) return { played: 0, blocked: false };
  await humanSleep(700, 1200);
  if (hasDiscordGate()) return { played: 0, blocked: true };

  const isOnGamePath = () => typeof window !== 'undefined' && (window.location.pathname || '').startsWith(targetPath);
  let played = 0;

  for (let run = 0; run < runs && !isInterrupted(); run += 1) {
    if (!isOnGamePath()) return { played, blocked: false };
    const runStartedAt = Date.now();
    if ((await clickSoloStartIfNeeded(slug)) === 'blocked') return { played, blocked: true };

    const memState = new Map<number, string>();
    let didMove = false;
    let finished = false;
    let idleSteps = 0;
    let memoryFoundTicks = 0;

    for (let step = 0; step < 140 && !isInterrupted(); step += 1) {
      if (!isOnGamePath()) return { played, blocked: false };
      if (hasDiscordGate()) return { played, blocked: true };
      if (didMove && isGameFinishedScreen(slug)) {
        finished = true;
        break;
      }
      if (slug === 'memoire' && didMove && isMemoryAllFound()) {
        await clickAdvanceOrNextButton(undefined, 400, 700);
        if (isGameFinishedScreen('memoire') || ++memoryFoundTicks >= 2) {
          finished = true;
          break;
        }
        await humanSleep(600, 900);
        continue;
      }
      if (!didMove && idleSteps > 0 && idleSteps % 3 === 0 && !isGameFinishedScreen(slug)) {
        const retry = await clickSoloStartIfNeeded(slug);
        if (retry === 'blocked') return { played, blocked: true };
        if (retry === 'started') {
          idleSteps = 0;
          continue;
        }
      }
      if (await solveActiveMiniGameRound(catalogById, memState, meId)) {
        didMove = true;
        idleSteps = 0;
      } else {
        if (didMove && isGameFinishedScreen(slug)) {
          finished = true;
          break;
        }
        if (++idleSteps >= 18) break;
        await humanSleep(450, 650);
      }
    }

    if (!isOnGamePath()) return { played, blocked: false };
    if (!finished) break;

    await humanSleep(1800, 2500);
    const minRunMs = MIN_RUN_MS[slug] ?? 0;
    const elapsed = Date.now() - runStartedAt;
    if (minRunMs > 0 && elapsed < minRunMs && !isInterrupted()) {
      await humanSleep(minRunMs - elapsed, minRunMs - elapsed + 1000);
    }

    played += 1;
    if (slug === 'raid-du-jour') markDailyRaidPlayed(meId);

    if (run + 1 < runs && !isInterrupted()) {
      const replayBtn = findButtonByText(document.querySelector('main') || document, REPLAY_BTN_RE);
      if (replayBtn) {
        replayBtn.click();
        await humanSleep(1200, 2000);
      } else {
        await humanSleep(1800, 2800);
      }
    }
  }
  return { played, blocked: false };
}

export async function executeAutoGames(
  dashboard: any,
  options: { manual?: boolean; gameId?: string; solveOnce?: boolean; dedicatedTab?: boolean; _fastForTest?: boolean } = {}
): Promise<{ playedGames: number; ticketsEarned: number; blocked?: string | null; arcade?: ArcadeSummary | null }> {
  setGamesFastModeForTest(Boolean(options._fastForTest));
  try {
    await loadSettings();
    const arcadeBefore = await fetchArcadeSummary();
    if (!arcadeBefore || !arcadeBefore.enabled) {
      return { playedGames: 0, ticketsEarned: 0, blocked: arcadeBefore?.blocked || 'disabled', arcade: arcadeBefore };
    }

    const targetGame = (options.gameId || state.currentSettings.autoGamesTargetGame || 'all') as KyaraGameId;
    const { today, week } = arcadeBefore;
    const dayCap = arcadeBefore.dayCap || 60;
    const weekCap = arcadeBefore.weekCap || 300;

    if (state.currentSettings.dryRun) {
      await appendJournal('info', `[SIMULATION] Farmerait la Salle de Jeux (${targetGame}) · ${today}/${dayCap} tickets aujourd'hui`);
      return { playedGames: 0, ticketsEarned: 0, arcade: arcadeBefore };
    }

    const catalogById = await ensureCatalog(false).catch(() => new Map<number, any>());
    const meId = dashboard?.me?.id;

    if (options.solveOnce) {
      const solved = await solveActiveMiniGameRound(catalogById, new Map(), meId, { allowTutorial: true });
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
      if (!(await isDailyHandAlreadyPlayed(meId)) && !isInterrupted()) {
        playedGames += (await playGameRuns('main-du-jour', 1, catalogById, meId)).played;
      }
    }
    if (allowDaily && (targetGame === 'raid-du-jour' || targetGame === 'all' || !options.gameId)) {
      if (!(await isDailyRaidAlreadyPlayed(meId)) && !isInterrupted()) {
        playedGames += (await playGameRuns('raid-du-jour', 1, catalogById, meId)).played;
      }
    }

    const maxRuns = options.manual ? 5 : 2;
    if (!isInterrupted() && targetGame !== 'main-du-jour' && targetGame !== 'raid-du-jour' && today < dayCap && week < weekCap) {
      if (playedGames > 0) await humanSleep(2000, 3400);
      if (targetGame === 'all') {
        let soloPlayed = 0;
        for (let tries = 0; tries < ALL_PLAYABLE_GAMES.length && soloPlayed < maxRuns && !isInterrupted(); tries += 1) {
          const slug = ALL_PLAYABLE_GAMES[allGamesCursor % ALL_PLAYABLE_GAMES.length];
          allGamesCursor = (allGamesCursor + 1) % ALL_PLAYABLE_GAMES.length;
          const res = await playGameRuns(slug, 1, catalogById, meId);
          if (res.blocked || !res.played) continue;
          playedGames += res.played;
          soloPlayed += 1;
          if (soloPlayed < maxRuns && !isInterrupted()) await humanSleep(2000, 3400);
        }
      } else {
        playedGames += (await playGameRuns(targetGame, maxRuns, catalogById, meId)).played;
      }
    }

    if (!options.manual && !options.dedicatedTab && previousPath && !previousPath.startsWith('/jouer') && typeof location !== 'undefined' && location.pathname !== previousPath) {
      await navigateSpaTo(previousPath, { owner: 'games' }).catch(() => false);
    }
    if (playedGames > 0 && !isInterrupted()) await humanSleep(1500, 2200);

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
