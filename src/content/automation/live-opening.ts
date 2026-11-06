import { kyaraApi } from '../api';
import { state } from '../state';
import { recordCumulativeMetric, appendJournal, recordBestPulls } from '../journal';
import { sleep, newRequestId, notifyDesktop } from '../utils';
import { setHudStatusText } from '../hud';
import { navigateSpaTo, waitForElement } from './spa-navigator';
import { refreshDashboardSnapshot } from '../snapshot';
import { RARITIES } from '../../lib/analytics/constants';

export async function fallbackApiOpenBooster(packId: string, packName: string, countToOpen = 1): Promise<{ openedCount: number; newCardsCount: number }> {
  if (state.currentSettings.dryRun) {
    await appendJournal('open', `[SIMULATION] Ouvrirait ${countToOpen}× « ${packName} »`);
    return { openedCount: 0, newCardsCount: 0 };
  }
  const reqId = newRequestId();
  let results: any[] = [];
  if (countToOpen <= 1) {
    const single = await kyaraApi(`/packs/${encodeURIComponent(packId)}/open`, {
      method: 'POST',
      withPass: true,
      extraHeaders: { 'x-request-id': reqId },
      body: { maxChakra: 0 }
    });
    if (single) {
      results = [single];

    }
  } else {
    const many = await kyaraApi(`/packs/${encodeURIComponent(packId)}/open-many`, {
      method: 'POST',
      withPass: true,
      extraHeaders: { 'x-request-id': reqId },
      body: { count: Math.min(10, countToOpen), maxChakra: 0 }
    });
    results = Array.isArray(many?.results) ? many.results : [];

  }

  const pulledCards = results.flatMap((r: any) => r.cards || []);
  const newCards = pulledCards.filter((c: any) => c.isNew);
  const highRarity = pulledCards.filter((c: any) => c.rarity === 'L' || c.rarity === 'M');

  if (results.length > 0) {
    await recordCumulativeMetric({
      boostersOpenedCount: results.length,
      newCardsPulledCount: newCards.length,
      mythicsPulledCount: pulledCards.filter((c: any) => c.rarity === 'M').length,
      legendariesPulledCount: pulledCards.filter((c: any) => c.rarity === 'L').length
    });

    const raritySummary = RARITIES.map((r) => {
      const n = pulledCards.filter((c: any) => c.rarity === r).length;
      return n > 0 ? `${r}×${n}` : null;
    })
      .filter(Boolean)
      .join(' ');

    await appendJournal(
      'open',
      `Booster « ${packName} » ×${results.length} ouvert : ${newCards.length} nouveau(x) perso(s) (${raritySummary})`
    );

    if (highRarity.length > 0) {
      const names = highRarity.map((c: any) => `${c.name} [${c.rarity}]`).join(', ');
      notifyDesktop('Tirage Légendaire / Mythique !', `Obtenu dans ${packName} : ${names}`, 'km-pull');
    }

    await recordBestPulls(pulledCards, packName);
  }

  return { openedCount: results.length, newCardsCount: newCards.length };
}

export async function pilotLiveBoosterOpening(
  packId: string,
  packName: string,
  requestedCount = 1
): Promise<{ openedCount: number; newCardsCount: number; busy?: boolean; blockedForChakra?: boolean }> {
  if (state.currentSettings.dryRun) {
    await appendJournal('open', `[SIMULATION] Ouvrirait ${requestedCount}× « ${packName} »`);
    return { openedCount: 0, newCardsCount: 0 };
  }
  if (state.isLiveOpening) {
    return { openedCount: 0, newCardsCount: 0, busy: true };
  }
  state.isLiveOpening = true;
  setHudStatusText(`Ouverture live : ${packName}…`);

  try {
    const targetPath = `/ouvrir/${encodeURIComponent(packId)}`;
    if (!await navigateSpaTo(targetPath)) throw new Error('Navigation vers le booster impossible');

    const openModalCloseBtn = document.querySelector(
      ".modal .close, button.close, [class*='modal'] [class*='close'], button[aria-label='Close'], .overlay [class*='close']"
    ) as HTMLElement | null;
    if (openModalCloseBtn && !(openModalCloseBtn as any).disabled) {
      openModalCloseBtn.click();
      await sleep(200);
    }
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', code: 'Escape', bubbles: true, cancelable: true }));

    const summaryAgainBtn = document.querySelector('.summary button, button.again, button.btn-again') as HTMLElement | null;
    if (summaryAgainBtn && !(summaryAgainBtn as any).disabled) {
      // "Again" can initiate another opening immediately. Use the capped API instead.
      return await fallbackApiOpenBooster(packId, packName, requestedCount);
    }

    await waitForElement('.multi, button.btn.btn-open, button.btn-open, button.btn', {
      timeoutMs: 6500
    });

    const targetMult = requestedCount >= 10 ? 10 : requestedCount >= 5 ? 5 : 1;
    const multButtons = Array.from(
      document.querySelectorAll(".multi button, button.mult, [class*='multi'] button")
    ) as HTMLElement[];
    if (multButtons.length > 0) {
      const matchBtn =
        multButtons.find((b) => {
          const txt = (b.textContent || '').trim();
          return txt === `×${targetMult}` || txt === `x${targetMult}`;
        }) ||
        multButtons.find((b) => {
          const txt = (b.textContent || '').trim();
          return txt === '×1' || txt === 'x1';
        });

      if (!matchBtn) return await fallbackApiOpenBooster(packId, packName, requestedCount);

      if (matchBtn && !matchBtn.classList.contains('on') && !matchBtn.classList.contains('active')) {
        matchBtn.click();
        await sleep(250);
      }
    }

    const scanCandidateButtons = (): HTMLButtonElement[] => {
      return (Array.from(
        document.querySelectorAll('button.btn.btn-open, button.btn-open, button.btn, button')
      ) as HTMLButtonElement[]).filter((btn) => !btn.disabled && (btn.offsetWidth > 0 || btn.offsetHeight > 0));
    };

    let candidateButtons = scanCandidateButtons();
    let openBtn = candidateButtons.find((btn) => {
      const txt = (btn.innerText || '').trim();
      const html = btn.innerHTML || '';
      const isFree =
        /Free|Gratuit|Gratis/i.test(txt) ||
        /Free|Gratuit|Gratis/i.test(html) ||
        btn.classList.contains('free') ||
        btn.classList.contains('btn-free');
      const hasChakra = /◆|Chakra/i.test(txt) || /◆|Chakra/i.test(html);
      return isFree && !hasChakra;
    });

    if (!openBtn) {
      const force1 = multButtons.find((b) => {
        const txt = (b.textContent || '').trim();
        return txt === '×1' || txt === 'x1';
      });
      if (force1 && !force1.classList.contains('on') && !force1.classList.contains('active')) {
        force1.click();
        await sleep(250);
        candidateButtons = scanCandidateButtons();
        openBtn = candidateButtons.find((btn) => {
          const txt = (btn.innerText || '').trim();
          const html = btn.innerHTML || '';
          const isFree =
            /Free|Gratuit|Gratis/i.test(txt) ||
            /Free|Gratuit|Gratis/i.test(html) ||
            btn.classList.contains('free') ||
            btn.classList.contains('btn-free');
          const hasChakra = /◆|Chakra/i.test(txt) || /◆|Chakra/i.test(html);
          return isFree && !hasChakra;
        });
      }
    }

    if (!openBtn) {
      return await fallbackApiOpenBooster(packId, packName, requestedCount);
    }

    const openDialog = document.querySelector('dialog[open], .modal, .card-zoom') as any;
    if (openDialog) {
      try { if (typeof openDialog.close === 'function') openDialog.close(); } catch {}
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', code: 'Escape', bubbles: true }));
      await sleep(250);
    }

    let btnText = (openBtn.innerText || '').trim();
    let btnHtml = openBtn.innerHTML || '';
    if (/◆|Chakra/i.test(btnText) || /◆|Chakra/i.test(btnHtml)) {
      const mButtons = Array.from(document.querySelectorAll('button')).filter((b) => /^×\d+$/.test((b.innerText || '').trim()));
      const safeMultiplier = mButtons.find((b) => (b.innerText || '').trim() === '×1') || mButtons[0];
      if (safeMultiplier) {
        safeMultiplier.click();
        await sleep(300);
        const refreshedOpen = Array.from(document.querySelectorAll('button')).find((b) =>
          /Open again|Ouvrir à nouveau|Abrir de nuevo|Open Free|Ouvrir gratuit/i.test((b.innerText || '').trim())
        );
        if (refreshedOpen) openBtn = refreshedOpen;
      }
    }

    btnText = (openBtn.innerText || '').trim();
    btnHtml = openBtn.innerHTML || '';
    const isExplicitlyFree =
      /Free|Gratuit|Gratis/i.test(btnText) ||
      /Free|Gratuit|Gratis/i.test(btnHtml) ||
      openBtn.classList.contains('free') ||
      openBtn.classList.contains('btn-free');
    const containsChakraPrice = /◆|Chakra/i.test(btnText) || /◆|Chakra/i.test(btnHtml);

    if (!isExplicitlyFree || containsChakraPrice) {
      try {
        const apiRes = await fallbackApiOpenBooster(packId, packName, requestedCount);
        if (apiRes && apiRes.openedCount > 0) {
          return apiRes;
        }
      } catch {}

      await appendJournal(
        'warn',
        `SÉCURITÉ 0 ◆ : Ce booster n'est pas gratuit (« ${btnText.replace(/\n/g, ' ')} »). Ouverture annulée pour protéger votre Chakra !`
      );
      notifyDesktop(
        'Garde-fou 0 ◆ actif',
        `Ouverture annulée : ce booster requiert du Chakra (« ${btnText.replace(/\n/g, ' ')} »).`,
        'km-guard'
      );
      return { openedCount: 0, newCardsCount: 0, blockedForChakra: true };
    }

    const freeLeftMatch = btnText.match(/(\d+)\s*(?:left|restant|restante)/i);
    const detectedFreeLeft = freeLeftMatch ? parseInt(freeLeftMatch[1], 10) : null;
    if (detectedFreeLeft !== null && detectedFreeLeft <= 0) {
      await appendJournal('warn', "SÉCURITÉ 0 ◆ : Aucun booster gratuit restant détecté sur l'interface. Clic annulé !");
      return { openedCount: 0, newCardsCount: 0, blockedForChakra: true };
    }

    const pullTimestampBefore = Date.now();
    openBtn.click();

    const stageReached = await waitForElement('.reveal, .summary', { timeoutMs: 14000 });
    if (!stageReached) {
      return { openedCount: 0, newCardsCount: 0 };
    }

    const revealStart = Date.now();
    let lastStepAttr: string | null = null;
    let sameStepCount = 0;

    while (Date.now() - revealStart < 55000) {
      if (document.querySelector('.summary')) {
        break;
      }

      const activeModal = document.querySelector(".modal, .card-preview, .card-zoom, dialog[open], .wo, [class*='overlay']") as HTMLElement | null;
      if (activeModal && (activeModal.offsetWidth > 0 || activeModal.offsetHeight > 0)) {
        const dismissBtn = activeModal.querySelector("button.close, button[aria-label='Close'], [class*='close'], button.skip") as HTMLElement | null;
        if (dismissBtn) {
          try { dismissBtn.click(); } catch {}
        }
        window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', code: 'Escape', bubbles: true, cancelable: true }));
        await sleep(250);
      }

      const revealAllBtn = Array.from(document.querySelectorAll('button')).find((b) =>
        /Reveal all|Tout révéler|Revelar todo/i.test((b.innerText || '').trim())
      );
      if (revealAllBtn) {
        revealAllBtn.click();
        await sleep(500);
        if (document.querySelector('.summary')) break;
      }

      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', code: 'ArrowRight', bubbles: true, cancelable: true }));
      const deckEl = document.querySelector('.reveal .deck, .deck');
      if (deckEl) {
        deckEl.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', code: 'ArrowRight', bubbles: true, cancelable: true }));
        const stepAttr = deckEl.getAttribute('data-step') || '';
        if (stepAttr === lastStepAttr) {
          sameStepCount++;
          if (sameStepCount >= 2) {
            window.dispatchEvent(new KeyboardEvent('keydown', { key: ' ', code: 'Space', bubbles: true, cancelable: true }));
            const globalSkip = document.querySelector('.reveal button.skip, button.skip, button.reveal-all, .btn-skip') as HTMLElement | null;
            if (globalSkip) globalSkip.click();
          }
        } else {
          lastStepAttr = stepAttr;
          sameStepCount = 0;
        }
      }
      await sleep(550);
    }

    const leftoverDialogs = document.querySelectorAll('dialog[open], .modal, .card-preview, .card-zoom');
    for (const d of Array.from(leftoverDialogs)) {
      try { if (typeof (d as any).close === 'function') (d as any).close(); } catch {}
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', code: 'Escape', bubbles: true }));
    }

    const recentPull = state.lastPullEvents.find((e) => e.at >= pullTimestampBefore)?.detail || null;
    const results = Array.isArray(recentPull?.results) ? recentPull.results : recentPull?.cards ? [recentPull] : [];
    const pulledCards = results.flatMap((result: any) => Array.isArray(result.cards) ? result.cards : []);
    const newCards = pulledCards.filter((c: any) => c.isNew);
    const highRarity = pulledCards.filter((c: any) => c.rarity === 'L' || c.rarity === 'M');
    const openedCount = results.length;
    if (!openedCount) {
      await appendJournal('warn', 'Ouverture non confirmée par Kyara. Aucun tirage ajouté aux statistiques.');
      return { openedCount: 0, newCardsCount: 0 };
    }

    const raritySummary = RARITIES.map((r) => {
      const n = pulledCards.filter((c: any) => c.rarity === r).length;
      return n > 0 ? `${r}×${n}` : null;
    })
      .filter(Boolean)
      .join(' ');

    await recordCumulativeMetric({
      boostersOpenedCount: openedCount,
      newCardsPulledCount: newCards.length,
      mythicsPulledCount: pulledCards.filter((c: any) => c.rarity === 'M').length,
      legendariesPulledCount: pulledCards.filter((c: any) => c.rarity === 'L').length
    });

    await appendJournal(
      'open',
      `Booster « ${packName} » ouvert en live (×${openedCount}) : ${newCards.length} nouveau(x) perso(s)${
        raritySummary ? ` (${raritySummary})` : ''
      }`
    );

    if (highRarity.length > 0) {
      const names = highRarity.map((c: any) => `${c.name} [${c.rarity}]`).join(', ');
      notifyDesktop('Tirage Légendaire / Mythique !', `Obtenu dans ${packName} : ${names}`, 'km-pull');
    }

    await recordBestPulls(pulledCards, packName);
    await refreshDashboardSnapshot({ forcePrices: false }).catch(() => null);

    return { openedCount, newCardsCount: newCards.length };
  } catch (err: any) {
    await appendJournal('warn', `Ouverture live « ${packName} » interrompue : ${err.message}`);
    return { openedCount: 0, newCardsCount: 0 };
  } finally {
    state.isLiveOpening = false;
  }
}

export async function executeAutoOpenBoosters(dashboard: any): Promise<{ openedCount: number; newCardsCount: number; targetPack?: any }> {
  let boosters = dashboard?.boosters;
  let openedCount = 0;
  let newCardsCount = 0;
  if (!boosters) return { openedCount, newCardsCount };

  if (state.currentSettings.autoOpenDailyPack !== false) {
    const dailyPack = (boosters.all || []).find((p: any) => p.packId === 'daily');
    if (dailyPack?.canOpenNow) {
      const dailyRes = await pilotLiveBoosterOpening('daily', dailyPack.name || 'Pack du Jour', 1);
      openedCount += dailyRes.openedCount;
      newCardsCount += dailyRes.newCardsCount;
      if (dailyRes.openedCount > 0) {
        dashboard = await refreshDashboardSnapshot({ forcePrices: false });
        boosters = dashboard.boosters;
      }
    }
  }

  let targetPack = state.currentSettings.autoBoosterStrategy === 'ev' || state.currentSettings.autoOpenMode === 'recommended_ev'
    ? boosters.recommendedEv : boosters.recommendedNew;
  if (state.currentSettings.autoOpenMode === 'custom' && state.currentSettings.autoOpenCustomPackId) {
    targetPack = boosters.all.find((p: any) => p.packId === state.currentSettings.autoOpenCustomPackId);
  }
  if (!targetPack?.canOpenNow || (targetPack.packId === 'daily' && openedCount > 0)) return { openedCount, newCardsCount };

  const reserve = targetPack.usesFreePacks
    ? Math.min(Number(dashboard?.me?.freePacks) || 0, Math.max(0, Number(state.currentSettings.autoBoosterReserveFree) || 0)) : 0;
  const freeAvailable = Math.max(0, (Number(targetPack.openableFreeCount) || 0) - reserve);
  const minBatch = Math.max(1, Math.min(10, Number(state.currentSettings.autoOpenMinBatch) || 1));
  const isGaugeFull = Number(dashboard?.me?.freePacks) >= Number(dashboard?.me?.freePacksMax ?? 10);
  if (!freeAvailable || (freeAvailable < minBatch && !isGaugeFull)) return { openedCount, newCardsCount, targetPack };

  const liveRes = await pilotLiveBoosterOpening(targetPack.packId, targetPack.name, Math.min(10, freeAvailable));
  return { openedCount: openedCount + liveRes.openedCount, newCardsCount: newCardsCount + liveRes.newCardsCount, targetPack };
}
