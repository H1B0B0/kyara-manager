import type { Rarity } from '../../types/kyara';

export const DAILY_GAMES = ['main-du-jour', 'raid-du-jour'] as const;
export const ALL_PLAYABLE_GAMES = [
  'plus-aime', 'qui-est-ce', 'serie-express', 'memoire', 'kyara-21',
  'main-kyara', 'raid', 'expedition', 'trois-arcs', 'blind-test'
] as const;

export interface DailyHandCard {
  name: string;
  series: string;
  family: string;
  rarity: Rarity;
  pow?: number;
}

export type KyaraPokerKind = 'five' | 'sflush' | 'four' | 'flush' | 'full' | 'straight' | 'three' | 'two' | 'pair' | 'high';
export interface KyaraPokerEvaluation { kind: KyaraPokerKind; points: number; scoringIndices: number[]; }
export interface MainKyaraAction { action: 'play' | 'discard'; indices: number[]; expectedKind: KyaraPokerKind; expectedPoints: number; }

export const DEFAULT_POW_BY_RARITY: Record<Rarity, number> = { C: 30, U: 45, R: 60, E: 75, L: 90, M: 98 };
export const EXPEDITION_RARITY_COST: Record<Rarity, number> = { C: 1, U: 2, R: 3, E: 5, L: 8, M: 12 };
const RARITY_ORDER: Record<Rarity, number> = { C: 1, U: 2, R: 3, E: 4, L: 5, M: 6 };
const RAID_RARITY_WEIGHT: Record<Rarity, number> = { C: 10, U: 20, R: 32, E: 48, L: 70, M: 100 };
const POKER_TABLE: Record<KyaraPokerKind, { chips: number; mult: number }> = {
  five: { chips: 120, mult: 12 }, sflush: { chips: 100, mult: 8 }, four: { chips: 60, mult: 7 },
  flush: { chips: 45, mult: 5 }, full: { chips: 40, mult: 4 }, straight: { chips: 30, mult: 3 },
  three: { chips: 30, mult: 3 }, two: { chips: 20, mult: 2 }, pair: { chips: 10, mult: 2 }, high: { chips: 5, mult: 1 }
};

function normalizeText(value: unknown): string {
  return String(value || '').trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\s+/g, ' ');
}

export function extractCardIdFromUrl(url: string | null | undefined): number | null {
  if (!url || typeof url !== 'string') return null;
  const m = url.match(/\/cards\/(?:sm|md|lg)?\/?(\d+)\.(?:webp|png|jpe?g)/i) || url.match(/\/wiki\/(\d+)/);
  return m ? Number(m[1]) : null;
}

function findByCatalog(id: number | null, nameHint: string | null | undefined, catalogById: Map<number, any> | null | undefined): any | null {
  if (!catalogById) return null;
  if (id && catalogById.has(id)) return catalogById.get(id);
  const norm = normalizeText(nameHint);
  if (!norm) return null;
  for (const ch of catalogById.values()) if (normalizeText(ch?.name) === norm) return ch;
  return null;
}

/** In `/jouer/plus-aime`, lower catalog `rank` (#1 = most favorited) wins. */
export function pickMostLovedWinner(cardIds: Array<number | null>, nameHints: string[], catalogById: Map<number, any> | null | undefined): { winnerIndex: number; ranks: Array<number | null> } {
  const ranks = cardIds.map((id, idx) => { const r = Number(findByCatalog(id, nameHints[idx], catalogById)?.rank); return Number.isFinite(r) && r > 0 ? r : null; });
  let bestIdx = 0; let bestRank = Infinity; let anyKnown = false;
  for (let i = 0; i < ranks.length; i += 1) if (ranks[i] !== null && ranks[i]! < bestRank) { bestRank = ranks[i]!; bestIdx = i; anyKnown = true; }
  return { winnerIndex: anyKnown ? bestIdx : 0, ranks };
}

/** Matches clue card IDs to answer buttons in `/jouer/qui-est-ce` or `/jouer/serie-express`. */
export function matchCharacterChoice(clueIds: number[], choices: string[], catalogById: Map<number, any> | null | undefined, mode: 'character' | 'series'): number {
  if (!catalogById || !choices.length || !clueIds.length) return -1;
  const targets = new Map<string, number>();
  for (const id of clueIds) {
    const ch = catalogById.get(id);
    const norm = ch ? normalizeText(mode === 'series' ? ch.series : ch.name) : '';
    if (norm) targets.set(norm, (targets.get(norm) || 0) + 1);
  }
  if (!targets.size) return -1;
  let bestChoiceIdx = -1; let bestScore = 0;
  choices.forEach((choice, idx) => {
    const normChoice = normalizeText(choice);
    if (!normChoice) return;
    for (const [target, count] of targets.entries()) {
      const score = ((normChoice === target ? 10 : normChoice.includes(target) || target.includes(normChoice) ? 4 : 0)) * count;
      if (score > bestScore) { bestScore = score; bestChoiceIdx = idx; }
    }
  });
  return bestChoiceIdx;
}

const getCardPow = (c: DailyHandCard | undefined): number =>
  c?.pow !== undefined && c?.pow !== null && Number.isFinite(Number(c.pow)) ? Number(c.pow) : DEFAULT_POW_BY_RARITY[c?.rarity || 'C'] ?? 30;
const getCardBonus = (c: DailyHandCard | undefined): number => Math.round(getCardPow(c) / 10);

function groupIndicesBy(indices: number[], keyFn: (i: number) => string): Map<string, number[]> {
  const map = new Map<string, number[]>();
  for (const i of indices) { const k = keyFn(i); if (k) map.set(k, [...(map.get(k) || []), i]); }
  return map;
}

/** Exact Kyara Poker hand evaluator (`U` payout table & `W(e)` scoring cards bonus). */
export function evaluateKyaraPokerHand(cards: DailyHandCard[]): KyaraPokerEvaluation {
  const n = Array.isArray(cards) ? cards.length : 0;
  if (!n) return { kind: 'high', points: 0, scoringIndices: [] };
  const allIdxs = cards.map((_, i) => i);
  const familyMap = groupIndicesBy(allIdxs, (i) => normalizeText(cards[i]?.family));
  const seriesGroups = Array.from(groupIndicesBy(allIdxs, (i) => normalizeText(cards[i]?.series)).values())
    .map((g) => [...g].sort((a, b) => getCardPow(cards[b]) - getCardPow(cards[a])))
    .sort((a, b) => b.length - a.length || b.reduce((s, i) => s + getCardPow(cards[i]), 0) - a.reduce((s, i) => s + getCardPow(cards[i]), 0));
  const isFlush = n === 5 && familyMap.size === 1 && Array.from(familyMap.values())[0].length === 5;
  const sortedRanks = cards.map((c) => RARITY_ORDER[c?.rarity || 'C'] || 1).sort((a, b) => a - b);
  const isStraight = n === 5 && sortedRanks.every((v, idx) => idx === 0 || v === sortedRanks[idx - 1] + 1);
  const asc = (arr: number[]) => [...arr].sort((a, b) => a - b);
  const all5 = [0, 1, 2, 3, 4];
  const g0 = seriesGroups[0] || [];
  const g1 = seriesGroups[1] || [];

  let kind: KyaraPokerKind = 'high';
  let scoringIndices: number[];
  if (n === 5 && g0.length >= 5) { kind = 'five'; scoringIndices = all5; }
  else if (isStraight && isFlush) { kind = 'sflush'; scoringIndices = all5; }
  else if (g0.length >= 4) { kind = 'four'; scoringIndices = asc(g0.slice(0, 4)); }
  else if (isFlush) { kind = 'flush'; scoringIndices = all5; }
  else if (g0.length >= 3 && g1.length >= 2) { kind = 'full'; scoringIndices = asc([...g0.slice(0, 3), ...g1.slice(0, 2)]); }
  else if (isStraight) { kind = 'straight'; scoringIndices = all5; }
  else if (g0.length >= 3) { kind = 'three'; scoringIndices = asc(g0.slice(0, 3)); }
  else if (g0.length >= 2 && g1.length >= 2) { kind = 'two'; scoringIndices = asc([...g0.slice(0, 2), ...g1.slice(0, 2)]); }
  else if (g0.length >= 2) { kind = 'pair'; scoringIndices = asc(g0.slice(0, 2)); }
  else {
    let bestIdx = 0;
    for (let i = 1; i < n; i += 1) {
      const diff = getCardPow(cards[i]) - getCardPow(cards[bestIdx]);
      if (diff > 0 || (diff === 0 && (RARITY_ORDER[cards[i].rarity] || 1) > (RARITY_ORDER[cards[bestIdx].rarity] || 1))) bestIdx = i;
    }
    scoringIndices = [bestIdx];
  }
  const { chips, mult } = POKER_TABLE[kind];
  return { kind, points: (chips + scoringIndices.reduce((sum, idx) => sum + getCardBonus(cards[idx]), 0)) * mult, scoringIndices };
}

function findBestPokerSubset(cards: DailyHandCard[]): { indices: number[]; evalRes: KyaraPokerEvaluation } {
  const n = Math.min(Array.isArray(cards) ? cards.length : 0, 12);
  if (!n) return { indices: [], evalRes: { kind: 'high', points: 0, scoringIndices: [] } };
  let bestIndices = [0];
  let bestEval = evaluateKyaraPokerHand([cards[0]]);
  let bestRawPow = getCardPow(cards[0]);
  const cur: number[] = [];
  const dfs = (start: number) => {
    if (cur.length) {
      const ev = evaluateKyaraPokerHand(cur.map((i) => cards[i]));
      const rawPow = ev.scoringIndices.reduce((s, p) => s + getCardPow(cards[cur[p]]), 0);
      if (ev.points > bestEval.points || (ev.points === bestEval.points && (cur.length < bestIndices.length || (cur.length === bestIndices.length && rawPow > bestRawPow)))) {
        bestEval = ev; bestIndices = [...cur]; bestRawPow = rawPow;
      }
    }
    if (cur.length >= 5) return;
    for (let i = start; i < n; i += 1) { cur.push(i); dfs(i + 1); cur.pop(); }
  };
  dfs(0);
  return { indices: bestIndices, evalRes: bestEval };
}

/** Finds the highest-scoring 1..5 card combination using exact `evaluateKyaraPokerHand`. */
export function chooseBestDailyHandIndices(cards: DailyHandCard[]): number[] {
  return findBestPokerSubset(cards).indices;
}

function chooseDiscardIndices(cards: DailyHandCard[]): number[] {
  const n = cards.length;
  const maxKeep = n >= 6 ? 4 : Math.min(4, Math.max(1, n - 2));
  const allIdxs = cards.map((_, i) => i);
  const seriesGroups = groupIndicesBy(allIdxs, (i) => normalizeText(cards[i]?.series));
  const familyGroups = groupIndicesBy(allIdxs, (i) => normalizeText(cards[i]?.family));
  let bestKeep: number[] = [];
  let bestPot = -1;
  const avgB = (idxs: number[]) => idxs.reduce((s, i) => s + getCardBonus(cards[i]), 0) / Math.max(1, idxs.length);
  const consider = (idxs: number[], pot: number) => { if (idxs.length && idxs.length <= maxKeep && pot > bestPot) { bestPot = pot; bestKeep = idxs; } };
  const fitsStraight = (idxs: number[]) => {
    const ranks = idxs.map((i) => RARITY_ORDER[cards[i]?.rarity || 'C'] || 1);
    return new Set(ranks).size === idxs.length && (ranks.every((r) => r <= 5) || ranks.every((r) => r >= 2));
  };

  const pairs: number[][] = [];
  for (const grp of seriesGroups.values()) {
    const s = [...grp].sort((a, b) => getCardPow(cards[b]) - getCardPow(cards[a]));
    if (s.length >= 3 && maxKeep >= 3) consider(s.slice(0, 3), 215 + avgB(s.slice(0, 3)) * 4 + (new Set(s.slice(0, 3).map((i) => normalizeText(cards[i]?.family)).filter(Boolean)).size === 1 ? 20 : 0));
    if (s.length >= 2) { const p = s.slice(0, 2); pairs.push(p); consider(p, 125 + avgB(p) * 5); }
  }
  if (pairs.length >= 2 && maxKeep >= 4) {
    pairs.sort((a, b) => avgB(b) - avgB(a));
    consider([...pairs[0], ...pairs[1]], 135 + avgB([...pairs[0], ...pairs[1]]) * 4);
  }
  for (const grp of familyGroups.values()) {
    const byPow = [...grp].sort((a, b) => getCardPow(cards[b]) - getCardPow(cards[a]));
    if (grp.length >= 4 && maxKeep >= 4) {
      const seen = new Set<number>();
      const distinct = byPow.filter((i) => { const r = RARITY_ORDER[cards[i]?.rarity || 'C'] || 1; return seen.has(r) ? false : (seen.add(r), true); });
      const k = (distinct.length >= 4 ? distinct : byPow).slice(0, 4);
      consider(k, 225 + avgB(k) * 4 + (fitsStraight(k) ? 55 : 0));
    } else if (grp.length >= 3 && maxKeep >= 3) consider(byPow.slice(0, 3), (fitsStraight(byPow.slice(0, 3)) ? 155 : 110) + avgB(byPow.slice(0, 3)) * 4);
  }
  if (maxKeep >= 4) {
    for (const lo of [1, 2]) {
      const picked = [0, 1, 2, 3, 4].map((d) => allIdxs.filter((i) => (RARITY_ORDER[cards[i]?.rarity || 'C'] || 1) === lo + d).sort((a, b) => (familyGroups.get(normalizeText(cards[b]?.family))?.length || 0) - (familyGroups.get(normalizeText(cards[a]?.family))?.length || 0) || getCardPow(cards[b]) - getCardPow(cards[a]))[0]).filter((i) => i !== undefined);
      if (picked.length >= 4) {
        const k = picked.slice(0, 4);
        const maxF = Math.max(0, ...Array.from(groupIndicesBy(k, (i) => normalizeText(cards[i]?.family)).values()).map((g) => g.length));
        consider(k, (maxF >= 3 ? 165 : 120) + avgB(k) * 3);
      }
    }
  }
  if (!bestKeep.length) bestKeep = [...allIdxs].sort((a, b) => getCardPow(cards[b]) - getCardPow(cards[a])).slice(0, Math.max(1, n - 5));
  const keepSet = new Set(bestKeep);
  return allIdxs.filter((i) => !keepSet.has(i)).sort((a, b) => (familyGroups.get(normalizeText(cards[a]?.family))?.length || 0) - (familyGroups.get(normalizeText(cards[b]?.family))?.length || 0) || getCardPow(cards[a]) - getCardPow(cards[b])).slice(0, 5).sort((a, b) => a - b);
}

/** Strategic play/discard decision for `/jouer/main-kyara` targeting 3★ (1200+ pts in 4 hands). */
export function decideMainKyaraAction(cards: DailyHandCard[], stateInfo: { handsLeft: number; discardsLeft: number; score: number }): MainKyaraAction {
  if (!Array.isArray(cards) || !cards.length) return { action: 'play', indices: [], expectedKind: 'high', expectedPoints: 0 };
  const { indices: bestIndices, evalRes } = findBestPokerSubset(cards);
  const handsLeft = Math.max(0, Number(stateInfo?.handsLeft) || 0);
  const discardsLeft = Math.max(0, Number(stateInfo?.discardsLeft) || 0);
  const score = Number(stateInfo?.score) || 0;
  if (!(evalRes.points >= 220 || (evalRes.kind === 'full' && handsLeft <= 2) || score + evalRes.points >= 1200 || discardsLeft <= 0 || handsLeft <= 0) && cards.length > 1) {
    const discardIndices = chooseDiscardIndices(cards);
    if (discardIndices.length) return { action: 'discard', indices: discardIndices, expectedKind: evalRes.kind, expectedPoints: evalRes.points };
  }
  let playIndices = [...bestIndices];
  if (handsLeft > 1 && evalRes.points < 220 && playIndices.length <= 3 && cards.length > playIndices.length) {
    const used = new Set(playIndices);
    const rem = cards.map((_, i) => i).filter((i) => !used.has(i));
    const remSeries = groupIndicesBy(rem, (i) => normalizeText(cards[i]?.series));
    const remFamily = groupIndicesBy(rem, (i) => normalizeText(cards[i]?.family));
    const fillers = rem
      .filter((i) => (!normalizeText(cards[i]?.series) || (remSeries.get(normalizeText(cards[i]?.series))?.length || 0) < 2) && (!normalizeText(cards[i]?.family) || (remFamily.get(normalizeText(cards[i]?.family))?.length || 0) < 3) && cards[i]?.rarity !== 'L' && cards[i]?.rarity !== 'M')
      .sort((a, b) => (remFamily.get(normalizeText(cards[a]?.family))?.length || 0) - (remFamily.get(normalizeText(cards[b]?.family))?.length || 0) || getCardPow(cards[a]) - getCardPow(cards[b]));
    playIndices = [...playIndices, ...fillers.slice(0, 5 - playIndices.length)].sort((a, b) => a - b);
  }
  const finalEval = evaluateKyaraPokerHand(playIndices.map((i) => cards[i]));
  return { action: 'play', indices: playIndices, expectedKind: finalEval.kind, expectedPoints: finalEval.points };
}

/** Exact Blackjack optimal strategy for `/jouer/kyara-21`. */
export function evaluateKyara21(playerCardValues: number[], dealerVisibleValue?: number | null): 'hit' | 'stand' {
  let total = 0;
  let softAces = 0;
  for (const raw of Array.isArray(playerCardValues) ? playerCardValues : []) {
    const v = Number(raw);
    if (!Number.isFinite(v) || v <= 0) continue;
    if (v === 11 || v === 1) { total += 11; softAces += 1; } else total += v;
  }
  while (total > 21 && softAces > 0) { total -= 10; softAces -= 1; }
  const rawD = dealerVisibleValue === undefined || dealerVisibleValue === null ? null : Number(dealerVisibleValue);
  const dealer = rawD !== null && Number.isFinite(rawD) && rawD > 0 ? rawD : null;
  if (softAces > 0) return total <= 17 || (total === 18 && dealer !== null && (dealer >= 9 || dealer === 1)) ? 'hit' : 'stand';
  if (total <= 11) return 'hit';
  if (total === 12) return dealer !== 4 && dealer !== 5 && dealer !== 6 ? 'hit' : 'stand';
  return total <= 16 && (dealer === null || dealer >= 7 || dealer <= 1) ? 'hit' : 'stand';
}

export function shouldHitKyara21(handSum: number, softMythicCount = 0): boolean {
  return (softMythicCount > 0 && handSum <= 17) || handSum < 17;
}

const LOT_PRIORITY = ['sceau-mythique', 'legendaire', 'dores-3', 'boosters-5'];

export function recommendArcadeLot(balance: number, lots: any[]): any | null {
  if (!Array.isArray(lots) || !lots.length) return null;
  const available = lots.filter((l) => l && typeof l.price === 'number' && !l.soldOut && (l.left === undefined || l.left === null || l.left > 0));
  const candidates = available.filter((l) => LOT_PRIORITY.includes(String(l.id)) || l.kind === 'pack' || l.kind === 'golden' || l.kind === 'boosters');
  const pool = candidates.length ? candidates : available;
  const affordable = pool.filter((l) => balance >= Number(l.price));
  const sortList = (arr: any[]) => [...arr].sort((a, b) => {
    const ia = LOT_PRIORITY.indexOf(String(a.id));
    const ib = LOT_PRIORITY.indexOf(String(b.id));
    return ia !== -1 && ib !== -1 ? ia - ib : ia !== -1 ? -1 : ib !== -1 ? 1 : (b.price || 0) - (a.price || 0);
  });
  return affordable.length ? sortList(affordable)[0] : sortList(pool).find((l) => l.id === 'boosters-5' || l.id === 'legendaire') || pool[0] || null;
}

const cardCombatBase = (c: { attack?: number; health?: number; rarity?: Rarity }) =>
  (Number(c?.attack) || 0) * 2 + (Number(c?.health) || 0) / 5 + (RAID_RARITY_WEIGHT[c?.rarity || 'C'] || 10);

/** Picks up to `maxTeam` cards maximizing combat power plus series synergy for `/jouer/raid`. */
export function chooseBestRaidTeamIndices(
  cards: Array<{ attack?: number; health?: number; rarity?: Rarity; series?: string }>,
  maxTeam = 5
): number[] {
  if (!Array.isArray(cards) || !cards.length || maxTeam <= 0) return [];
  const targetCount = Math.min(maxTeam, cards.length);
  const poolSeries = new Map<string, number>();
  const normSeriesList = cards.map((c) => { const s = normalizeText(c?.series); if (s) poolSeries.set(s, (poolSeries.get(s) || 0) + 1); return s; });
  const chosen = new Set<number>();
  const pickedSeries = new Map<string, number>();
  for (let step = 0; step < targetCount; step += 1) {
    let bestIdx = -1;
    let bestScore = -Infinity;
    for (let i = 0; i < cards.length; i += 1) {
      if (chosen.has(i)) continue;
      const s = normSeriesList[i];
      const alreadyPicked = s ? pickedSeries.get(s) || 0 : 0;
      const remainingSame = s ? Math.max(0, (poolSeries.get(s) || 0) - alreadyPicked - 1) : 0;
      const total = cardCombatBase(cards[i]) + alreadyPicked * 24 + Math.min(remainingSame, targetCount - step - 1) * 6;
      if (total > bestScore) { bestScore = total; bestIdx = i; }
    }
    if (bestIdx < 0) break;
    chosen.add(bestIdx);
    const s = normSeriesList[bestIdx];
    if (s) pickedSeries.set(s, (pickedSeries.get(s) || 0) + 1);
  }
  return Array.from(chosen).sort((a, b) => a - b);
}

/** Selects `Math.min(maxTeam, cards.length)` cards within `teamBudget` for `/jouer/expedition`. */
export function chooseExpeditionTeamIndices(
  cards: Array<{ attack?: number; health?: number; rarity?: Rarity; series?: string; cost?: number; rank?: number }>,
  teamBudget: number, maxTeam = 5, chapterSeries?: string
): number[] {
  if (!Array.isArray(cards) || !cards.length || maxTeam <= 0 || teamBudget < 0) return [];
  const normChapter = normalizeText(chapterSeries);
  const items = cards.map((c, origIdx) => {
    const cost = typeof c?.cost === 'number' && Number.isFinite(c.cost) && c.cost >= 0 ? c.cost : EXPEDITION_RARITY_COST[c?.rarity || 'C'] ?? 1;
    const base = cardCombatBase(c) + Math.max(0, Number(c?.rank) || 0) * 15;
    const series = normalizeText(c?.series);
    return { origIdx, cost, score: normChapter && series === normChapter ? base * 1.2 : base, series };
  });
  const targetCount = Math.min(maxTeam, items.length);
  const cheapest = [...items].sort((a, b) => a.cost - b.cost || b.score - a.score);
  if (cheapest.slice(0, targetCount).reduce((s, it) => s + it.cost, 0) > teamBudget) {
    let rem = teamBudget; const out: number[] = [];
    for (const it of [...items].sort((a, b) => b.score / Math.max(1, b.cost) - a.score / Math.max(1, a.cost))) {
      if (out.length < targetCount && it.cost <= rem) { out.push(it.origIdx); rem -= it.cost; }
    }
    return out.sort((a, b) => a - b);
  }

  let pool = [...items].sort((a, b) => b.score - a.score || a.cost - b.cost);
  if (pool.length > 24) {
    const keep = new Set<number>(cheapest.slice(0, targetCount).map((it) => it.origIdx));
    const buckets = Array.from(pool.reduce((map, it) => map.set(it.cost, [...(map.get(it.cost) || []), it]), new Map<number, typeof items>()).values());
    for (let r = 0; keep.size < 24 && buckets.some((b) => r < b.length); r += 1) {
      for (const b of buckets) if (r < b.length && keep.size < 24) keep.add(b[r].origIdx);
    }
    pool = pool.filter((it) => keep.has(it.origIdx)).sort((a, b) => b.score - a.score || a.cost - b.cost);
  }

  const m = pool.length;
  const minCost = Array.from({ length: m + 1 }, () => Array<number>(targetCount + 1).fill(Infinity));
  for (let i = 0; i <= m; i += 1) minCost[i][0] = 0;
  for (let i = m - 1; i >= 0; i -= 1) for (let k = 1; k <= targetCount; k += 1) minCost[i][k] = Math.min(minCost[i + 1][k], pool[i].cost + minCost[i + 1][k - 1]);
  const poolByCost = pool.map((p, idx) => ({ idx, cost: p.cost })).sort((a, b) => a.cost - b.cost);
  const scoreTeam = (idxs: number[]) => {
    const sc = new Map<string, number>(); let total = 0;
    for (const i of idxs) { total += pool[i].score; if (pool[i].series) sc.set(pool[i].series, (sc.get(pool[i].series) || 0) + 1); }
    for (const c of sc.values()) if (c >= 2) total += ((c * (c - 1)) / 2) * 24;
    return total;
  };

  let bestTeam = cheapest.slice(0, targetCount).map((it) => pool.findIndex((p) => p.origIdx === it.origIdx));
  let bestScore = scoreTeam(bestTeam);
  const picked = new Set<number>(); let rem = teamBudget;
  while (picked.size < targetCount) {
    const needAfter = targetCount - picked.size - 1;
    let pick = -1; let pickVal = -Infinity;
    for (let i = 0; i < m; i += 1) {
      if (picked.has(i)) continue;
      let minRest = 0; let added = 0;
      for (const pc of poolByCost) if (added < needAfter && pc.idx !== i && !picked.has(pc.idx)) { minRest += pc.cost; added += 1; }
      if (added < needAfter || pool[i].cost + minRest > rem) continue;
      const syn = pool[i].series ? Array.from(picked).filter((j) => pool[j].series === pool[i].series).length * 24 : 0;
      if (pool[i].score + syn > pickVal) { pickVal = pool[i].score + syn; pick = i; }
    }
    if (pick < 0) break;
    picked.add(pick); rem -= pool[pick].cost;
  }
  if (picked.size === targetCount && scoreTeam(Array.from(picked)) > bestScore) { bestTeam = Array.from(picked); bestScore = scoreTeam(bestTeam); }

  if (m <= 24 && targetCount <= 6) {
    let visits = 0; const cur: number[] = [];
    const dfs = (pos: number, remBudget: number, curScore: number) => {
      if (++visits > 45000) return;
      const need = targetCount - cur.length;
      if (!need) { const s = scoreTeam(cur); if (s > bestScore) { bestScore = s; bestTeam = [...cur]; } return; }
      if (pos + need > m || minCost[pos][need] > remBudget) return;
      let upper = curScore + ((targetCount * (targetCount - 1)) / 2) * 24;
      for (let k = 0; k < need; k += 1) upper += pool[pos + k].score;
      if (upper <= bestScore) return;
      cur.push(pos); dfs(pos + 1, remBudget - pool[pos].cost, curScore + pool[pos].score); cur.pop();
      dfs(pos + 1, remBudget, curScore);
    };
    dfs(0, teamBudget, 0);
  }
  return bestTeam.map((idx) => pool[idx].origIdx).sort((a, b) => a - b);
}

const BLIND_STOPWORDS = new Set([
  'opening', 'ending', 'theme', 'ost', 'piste', 'track', 'audio', 'extrait', 'son', 'arc', 'part',
  'season', 'saison', 'episode', 'question', 'indice', 'reponse', 'musique', 'music', 'the', 'and',
  'for', 'with', 'from', 'les', 'des', 'une', 'sur', 'par', 'dans', 'avec', 'sans', 'est', 'qui',
  'que', 'one', 'two', 'air', 'ran', 'out', 'new', 'old', 'man', 'her', 'his', 'she', 'him', 'you'
]);

const hasDistinctBoundary = (haystack: string, needle: string): boolean =>
  new RegExp(`(?:^|[^a-z0-9])${needle.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?:$|[^a-z0-9])`).test(haystack);

function isSafeTermMatch(haystack: string, needle: string): boolean {
  if (!needle || !haystack || BLIND_STOPWORDS.has(needle)) return false;
  if (needle.length >= 5 && haystack.includes(needle)) return true;
  return needle.length < 5 ? haystack === needle : hasDistinctBoundary(haystack, needle);
}

function scoreBlindTestChoice(normTarget: string, normChoice: string): number {
  if (!normTarget || !normChoice) return 0;
  if (normChoice === normTarget) return 140;
  if (hasDistinctBoundary(normTarget, normChoice) && isSafeTermMatch(normTarget, normChoice)) return 95 + normChoice.length;
  if (normChoice.length >= 5 && !BLIND_STOPWORDS.has(normChoice) && normTarget.includes(normChoice)) return 70 + normChoice.length;
  if (isSafeTermMatch(normChoice, normTarget)) return 50 + normTarget.length;
  const targetTokens = new Set(normTarget.split(/[^a-z0-9]+/).filter((t) => t.length >= 3 && !BLIND_STOPWORDS.has(t)));
  const choiceTokens = normChoice.split(/[^a-z0-9]+/).filter((t) => t.length >= 3 && !BLIND_STOPWORDS.has(t));
  let shared = 0;
  let longShared = 0;
  for (const tok of choiceTokens) if (targetTokens.has(tok)) { shared += 1; if (tok.length >= 5) longShared += 1; }
  return longShared >= 1 ? 35 + longShared * 20 + shared * 5 : shared >= 2 ? shared * 18 : 0;
}

/** Matches an anime/series clue in `/jouer/blind-test`, guarding short-word false positives. */
export function findBlindTestMatch(hintText: string, choices: string[], catalogById?: Map<number, any>): { index: number; confident: boolean } {
  if (!Array.isArray(choices) || !choices.length) return { index: -1, confident: false };
  const normHint = normalizeText(hintText);
  if (!normHint) return { index: 0, confident: false };
  let bestIdx = 0; let bestScore = 0;
  const normChoices = choices.map((c) => normalizeText(c));
  normChoices.forEach((nc, idx) => { const s = scoreBlindTestChoice(normHint, nc); if (s > bestScore) { bestScore = s; bestIdx = idx; } });
  if (bestScore < 50 && catalogById && normHint.length >= 3) {
    const derived = new Set<string>();
    for (const ch of catalogById.values()) {
      const cName = normalizeText(ch?.name); const cSeries = normalizeText(ch?.series);
      if (cSeries && ((cName && isSafeTermMatch(normHint, cName)) || isSafeTermMatch(normHint, cSeries))) derived.add(cSeries);
    }
    for (const series of derived) normChoices.forEach((nc, idx) => { const s = Math.round(scoreBlindTestChoice(series, nc) * 0.85); if (s > bestScore) { bestScore = s; bestIdx = idx; } });
  }
  return bestScore > 0 ? { index: bestIdx, confident: true } : { index: 0, confident: false };
}

export function matchBlindTestChoice(hintText: string, choices: string[], catalogById?: Map<number, any>): number {
  return findBlindTestMatch(hintText, choices, catalogById).index;
}

/** Selects the optimal open arc (lane 0..2) in `/jouer/trois-arcs`, prioritizing winning 2 of 3 lanes. */
export function pickThreeArcsLineIndex(lines: Array<{ myPower: number; oppPower: number; openSlots: number }>): number {
  if (!Array.isArray(lines) || !lines.length) return -1;
  const alreadyWinning = lines.filter((l) => l.myPower > l.oppPower).length;
  let bestIdx = -1; let bestScore = -Infinity;
  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];
    if (!line || line.openSlots <= 0) continue;
    const diff = line.myPower - line.oppPower;
    let score = 300 + diff + line.openSlots;
    if (alreadyWinning < 2) score = diff <= 0 ? 1000 - Math.abs(diff) * 10 + line.openSlots : 500 - diff * 5 + line.openSlots;
    else if (diff > 0 && diff <= 25) score = 950 - diff * 5 + line.openSlots;
    else if (diff <= 0 && diff >= -15) score = 720 + diff * 10 + line.openSlots;
    else if (diff > 0) score = 650 - diff + line.openSlots;
    if (score > bestScore) { bestScore = score; bestIdx = i; }
  }
  return bestIdx;
}

/** Selects the best next selectable node in `/jouer/expedition` (chest > heal > shop/event > combat > boss). */
export function pickExpeditionNextIndex(nodes: Array<{ label: string; selectable: boolean }>): number {
  if (!Array.isArray(nodes) || !nodes.length) return -1;
  let bestIdx = -1; let bestWeight = -1;
  nodes.forEach((node, idx) => {
    if (!node?.selectable) return;
    const label = normalizeText(node.label);
    const weight =
      /(coffre|tresor|chest|treasure|loot|recompense|reward|relique|relic)/.test(label) ? 100
      : /(soin|heal|camp|repos|rest|sanctuaire|shrine|fontaine|fountain)/.test(label) ? 85
      : /(boutique|shop|marchand|merchant|store|evenement|event|mystere|mystery)/.test(label) ? 65
      : /(elite)/.test(label) ? 45
      : /(combat|fight|battle|duel|ennemi|enemy|monstre|mob)/.test(label) ? 50
      : /(boss|gardien|guardian|final)/.test(label) ? 30 : 10;
    if (weight > bestWeight) { bestWeight = weight; bestIdx = idx; }
  });
  return bestIdx;
}
