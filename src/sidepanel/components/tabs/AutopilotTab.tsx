import React, { useState } from 'react';
import type { DashboardState, AutopilotPullRecord } from '../../../types/kyara';
import type { KyaraSettings, PricingStrategy } from '../../../types/settings';
import type { CumulativeStats, JournalItem } from '../../../types/journal';
import { t } from '../../../lib/i18n';
import { sendCommand } from '../../hooks/useDashboard';
import { BestPullsShowcase } from '../showcase/BestPullsShowcase';

export interface AutopilotTabProps {
  dashboard: DashboardState | null;
  settings: KyaraSettings;
  stats: CumulativeStats;
  journal: JournalItem[];
  bestPulls: AutopilotPullRecord[];
  onUpdateSettings: (partial: Partial<KyaraSettings>) => void;
  onResetRoi: () => void;
  onClearJournal: () => void;
  onClearBestPulls: () => void;
  onToast: (msg: string) => void;
}

export const AutopilotTab: React.FC<AutopilotTabProps> = ({
  dashboard,
  settings,
  stats,
  journal,
  bestPulls,
  onUpdateSettings,
  onResetRoi,
  onClearJournal,
  onClearBestPulls,
  onToast
}) => {
  const [runningCycle, setRunningCycle] = useState(false);
  const [actingSell, setActingSell] = useState(false);
  const [actingRecycle, setActingRecycle] = useState(false);
  const [actingOpen, setActingOpen] = useState(false);

  const me = dashboard?.me;
  const collStats = dashboard?.collectionStats;
  const sellNet = collStats?.sellableNetTotal ?? 0;
  const sellCount = collStats?.sellableDuplicatesCount ?? 0;
  const recTotal = collStats?.recyclableChakraTotal ?? 0;
  const recCount = collStats?.recyclableDuplicatesCount ?? 0;

  const recPack = dashboard?.boosters?.recommendedNew;
  const freePacks = me?.freePacks ?? 0;
  const canOpen = freePacks > 0 && recPack?.canOpenNow !== false;

  const dealsCount = dashboard?.deals?.length ?? 0;
  const tradesCount = dashboard?.trades?.length ?? 0;

  const pity = me?.pity ?? 0;
  const isPityNear = Boolean(dashboard?.boosters?.isPityNear || pity >= 240);
  const pityTargetPack = dashboard?.boosters?.recommendedPity?.name || recPack?.name || 'Pack avec le plus de Mythiques';

  const totalRoiChakra = (stats.chakraFromSales || 0) + (stats.chakraFromRecycle || 0);

  const handleRunCycle = async () => {
    setRunningCycle(true);
    onToast('Cycle Autopilot en cours…');
    const res = await sendCommand({ type: 'km:cmd:run-cycle' });
    setRunningCycle(false);
    if (res?.ok && res.summary) {
      const s = res.summary;
      onToast(`Cycle terminé : ${s.opened} booster(s), ${s.recycledCopies} recyclée(s), ${s.listed} en vente, ${s.bought} achetée(s)`);
    } else if (res?.error) {
      onToast(res.error);
    }
  };

  const handleSellNow = async () => {
    setActingSell(true);
    onToast('Mise en vente des doublons…');
    const res = await sendCommand({ type: 'km:cmd:sell-now' });
    setActingSell(false);
    if (res?.ok) {
      onToast(`${res.sellRes?.listedCount ?? 0} annonce(s) créée(s)`);
    } else if (res?.error) {
      onToast(res.error);
    }
  };

  const handleRecycleNow = async () => {
    setActingRecycle(true);
    onToast('Recyclage des doublons…');
    const res = await sendCommand({ type: 'km:cmd:recycle-now' });
    setActingRecycle(false);
    if (res?.ok) {
      onToast(`${res.recRes?.recycledCopies ?? 0} copie(s) recyclée(s) (+${res.recRes?.chakraGained ?? 0} ◆)`);
    } else if (res?.error) {
      onToast(res.error);
    }
  };

  const handleOpenLive = async () => {
    if (!recPack) {
      onToast('Aucun booster recommandé disponible');
      return;
    }
    setActingOpen(true);
    onToast(`Ouverture live : ${recPack.name}…`);
    const res = await sendCommand({
      type: 'km:cmd:open-pack',
      packId: recPack.packId,
      packName: recPack.name,
      count: 1
    });
    setActingOpen(false);
    if (res?.ok) {
      onToast(`Booster ${recPack.name} ouvert en live !`);
    } else {
      onToast(res?.error || "Erreur d'ouverture");
    }
  };

  return (
    <section className="tab-panel is-active">
      {/* Pity Sniper Alert when pity >= 240 */}
      {isPityNear && (
        <div className="pity-banner">
          <div className="pity-banner__icon">🎯</div>
          <div className="pity-banner__content">
            <strong className="pity-banner__title">Pitié Mythique imminente ({pity}/250) !</strong>
            <p className="pity-banner__desc">
              Le pilote automatique cible en priorité le booster contenant le plus de cartes Mythiques manquantes :{' '}
              <strong style={{ color: '#ffd700' }}>{pityTargetPack}</strong>.
            </p>
          </div>
        </div>
      )}

      {/* Hero Global Switch */}
      <div className="card card--hero">
        <div className="hero-top">
          <div className="hero-status">
            <span
              className={`status-beacon ${settings.masterEnabled ? 'is-active' : ''}`}
              aria-hidden="true"
            />
            <span className="hero-status-text">
              {settings.masterEnabled ? t('statusActive') : t('statusIdle')}
            </span>
          </div>
          <input
            type="checkbox"
            role="switch"
            id="sw-master"
            className="switch switch--lg"
            aria-label="Activer le Pilote Automatique Global"
            checked={settings.masterEnabled}
            onChange={(e) => onUpdateSettings({ masterEnabled: e.target.checked })}
          />
        </div>

        <div className="hero-body">
          <h2 className="hero-title">{t('heroTitle')}</h2>
          <p className="hero-desc">{t('heroDesc')}</p>
        </div>

        <button
          type="button"
          onClick={handleRunCycle}
          disabled={runningCycle}
          className="btn btn--primary btn--hero"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" style={{ marginRight: 6 }}>
            <polygon points="5 3 19 12 5 21 5 3" />
          </svg>
          <span>{runningCycle ? 'Cycle en cours…' : t('runCycleNow')}</span>
        </button>
      </div>

      {/* Modules Grid (Clean Full-Width Stack) */}
      <div className="module-grid">
        {/* Module 1: Sell */}
        <div className="module-card module-card--sell">
          <div className="switch-row">
            <div className="tile-head">
              <span className="kanji-box kanji-box--gold" aria-hidden="true">売</span>
              <div>
                <label htmlFor="sw-autosell" className="module-card__title">{t('modSellTitle')}</label>
                <p className="module-card__desc">{t('modSellDesc')}</p>
              </div>
            </div>
            <input
              type="checkbox"
              role="switch"
              id="sw-autosell"
              className="switch switch--sm"
              checked={settings.autoSellEnabled}
              onChange={(e) => onUpdateSettings({ autoSellEnabled: e.target.checked })}
            />
          </div>

          {/* Pricing Strategy Selector */}
          <div className="module-card__sub-config">
            <div className="strategy-selector-row">
              <label htmlFor="sel-pricing-strat" className="strategy-selector-label">Stratégie :</label>
              <select
                id="sel-pricing-strat"
                value={settings.autoSellStrategy || 'recent20_median'}
                onChange={(e) => onUpdateSettings({ autoSellStrategy: e.target.value as PricingStrategy })}
                className="select select--xs"
                title="Stratégie de fixation des prix de vente"
              >
                <option value="recent20_median">Médiane 20 offres (Anti-krach Fairy Tail)</option>
                <option value="recent20_avg">Moyenne 20 offres (Réactif)</option>
                <option value="quick">Vente Rapide (Undercut -1 ◆)</option>
                <option value="balanced">Médiane 7 jours (Historique)</option>
              </select>
            </div>
          </div>

          <div className="module-card__footer">
            <span className="mono-stat">
              {t('copiesCount', { n: sellCount })} · +{sellNet} ◆ net
            </span>
            <button
              type="button"
              onClick={handleSellNow}
              disabled={actingSell || sellCount === 0}
              className="btn btn--xs btn--ghost"
            >
              {actingSell ? 'En cours…' : t('sellNow')}
            </button>
          </div>
        </div>

        {/* Module 2: Recycle */}
        <div className="module-card module-card--recycle">
          <div className="switch-row">
            <div className="tile-head">
              <span className="kanji-box kanji-box--ok" aria-hidden="true">転</span>
              <div>
                <label htmlFor="sw-autorecycle" className="module-card__title">{t('modRecycleTitle')}</label>
                <p className="module-card__desc">{t('modRecycleDesc')}</p>
              </div>
            </div>
            <input
              type="checkbox"
              role="switch"
              id="sw-autorecycle"
              className="switch switch--sm"
              checked={settings.autoRecycleEnabled}
              onChange={(e) => onUpdateSettings({ autoRecycleEnabled: e.target.checked })}
            />
          </div>
          <div className="module-card__footer">
            <span className="mono-stat">
              {t('copiesCount', { n: recCount })} · +{recTotal} ◆
            </span>
            <button
              type="button"
              onClick={handleRecycleNow}
              disabled={actingRecycle || recCount === 0}
              className="btn btn--xs btn--ghost"
            >
              {actingRecycle ? 'En cours…' : t('recycleNow')}
            </button>
          </div>
        </div>

        {/* Module 3: Live Booster Opening */}
        <div className="module-card module-card--boosters">
          <div className="switch-row">
            <div className="tile-head">
              <span className="kanji-box kanji-box--acc" aria-hidden="true">札</span>
              <div>
                <label htmlFor="sw-autobooster" className="module-card__title">{t('modBoostersTitle')}</label>
                <p className="module-card__desc">{t('modBoostersDesc')}</p>
              </div>
            </div>
            <input
              type="checkbox"
              role="switch"
              id="sw-autobooster"
              className="switch switch--sm"
              checked={settings.autoBoosterEnabled}
              onChange={(e) => onUpdateSettings({ autoBoosterEnabled: e.target.checked })}
            />
          </div>
          <div className="module-card__footer">
            <span className="mono-stat">
              {recPack ? `${recPack.name} (${recPack.probAtLeastOneNewPct}% nouv.)` : 'Aucun booster prêt'}
            </span>
            <button
              type="button"
              onClick={handleOpenLive}
              disabled={actingOpen || !canOpen}
              className="btn btn--xs btn--ghost"
            >
              {actingOpen ? 'Ouverture…' : (canOpen ? t('openLive') : t('noFreeReady'))}
            </button>
          </div>
        </div>

        {/* Module 4: Market Flip */}
        <div className="module-card module-card--market">
          <div className="switch-row">
            <div className="tile-head">
              <span className="kanji-box kanji-box--cyan" aria-hidden="true">市</span>
              <div>
                <label htmlFor="sw-automarket" className="module-card__title">{t('modMarketTitle')}</label>
                <p className="module-card__desc">{t('modMarketDesc')}</p>
              </div>
            </div>
            <input
              type="checkbox"
              role="switch"
              id="sw-automarket"
              className="switch switch--sm"
              checked={settings.autoMarketEnabled}
              onChange={(e) => onUpdateSettings({ autoMarketEnabled: e.target.checked })}
            />
          </div>

          <div className="switch-row switch-row--compact">
            <label htmlFor="sw-autobuy-missing" className="module-card__sublabel">
              {t('modBuyMissing')}
            </label>
            <input
              type="checkbox"
              role="switch"
              id="sw-autobuy-missing"
              className="switch switch--xs"
              checked={settings.wishlistAutoBuyEnabled}
              onChange={(e) => onUpdateSettings({ wishlistAutoBuyEnabled: e.target.checked })}
            />
          </div>

          <div className="module-card__footer">
            <span className="mono-stat">
              {dealsCount} deal(s) · {tradesCount} trade(s) rentables
            </span>
          </div>
        </div>

        {/* Micro-Modules: Auto-Missions & Anti-AFK */}
        <div className="module-row-pair">
          <div className="module-card module-card--compact">
            <div className="switch-row">
              <div className="tile-head tile-head--sm">
                <span className="kanji-box kanji-box--sm kanji-box--purple" aria-hidden="true">務</span>
                <label htmlFor="sw-autoclaim" className="module-card__title">{t('modMissionsTitle')}</label>
              </div>
              <input
                type="checkbox"
                role="switch"
                id="sw-autoclaim"
                className="switch switch--sm"
                checked={settings.autoClaimMissionsEnabled}
                onChange={(e) => onUpdateSettings({ autoClaimMissionsEnabled: e.target.checked })}
              />
            </div>
          </div>

          <div className="module-card module-card--compact">
            <div className="switch-row">
              <div className="tile-head tile-head--sm">
                <span className="kanji-box kanji-box--sm kanji-box--gold" aria-hidden="true">⚡</span>
                <label htmlFor="sw-antiafk" className="module-card__title">{t('modAntiAfkTitle')}</label>
              </div>
              <input
                type="checkbox"
                role="switch"
                id="sw-antiafk"
                className="switch switch--sm"
                checked={settings.antiAfkEnabled}
                onChange={(e) => onUpdateSettings({ antiAfkEnabled: e.target.checked })}
              />
            </div>
          </div>
        </div>
      </div>

      {/* ROI Gains Dashboard */}
      <div className="card card--roi">
        <div className="card__header">
          <div>
            <h3 className="card__title">{t('roiTitle')}</h3>
            <p className="card__subtitle">{t('roiSubtitle')}</p>
          </div>
          <button type="button" onClick={onResetRoi} className="btn btn--ghost btn--xs">
            {t('reset')}
          </button>
        </div>

        <div className="roi-grid">
          <div className="roi-stat-box roi-stat-box--chakra">
            <span className="roi-stat-box__label">{t('roiTotalChakra')}</span>
            <strong className="roi-stat-box__val">+{new Intl.NumberFormat('fr-FR').format(totalRoiChakra)} ◆</strong>
          </div>
          <div className="roi-stat-box">
            <span className="roi-stat-box__label">{t('roiSales')}</span>
            <strong className="roi-stat-box__val">
              {stats.cardsSold || 0} vendue(s)
            </strong>
            <span className="roi-stat-box__sub">+{stats.chakraFromSales || 0} ◆ net</span>
          </div>
          <div className="roi-stat-box">
            <span className="roi-stat-box__label">{t('roiRecycle')}</span>
            <strong className="roi-stat-box__val">
              {stats.cardsRecycled || 0} recyclée(s)
            </strong>
            <span className="roi-stat-box__sub">+{stats.chakraFromRecycle || 0} ◆</span>
          </div>
          <div className="roi-stat-box">
            <span className="roi-stat-box__label">{t('roiBoosters')}</span>
            <strong className="roi-stat-box__val">
              {stats.boostersOpenedCount || 0} ouverts
            </strong>
            <span className="roi-stat-box__sub">
              {(stats.mythicsPulledCount || 0) + (stats.legendariesPulledCount || 0)} L/M tirées
            </span>
          </div>
        </div>
      </div>

      {/* Rarest Characters Loot Showcase */}
      <BestPullsShowcase pulls={bestPulls} onClear={onClearBestPulls} />

      {/* Activity Journal */}
      <div className="card card--compact">
        <div className="card__header">
          <h3 className="card__title">{t('journalTitle')}</h3>
          <button type="button" onClick={onClearJournal} className="btn btn--ghost btn--xs">
            {t('clear')}
          </button>
        </div>
        <ul className="journal-list">
          {journal.length === 0 ? (
            <li className="journal-empty">{t('journalEmpty')}</li>
          ) : (
            journal.slice(0, 40).map((item, idx) => {
              const iconMap: Record<string, string> = {
                sell: '💰',
                recycle: '♻️',
                booster: '🎁',
                market: '🛒',
                mission: '務',
                afk: '⚡',
                error: '⚠️'
              };
              const icon = iconMap[item.type] || '•';
              return (
                <li key={idx} className={`journal-item journal-item--${item.type}`}>
                  <span className="journal-item__icon" aria-hidden="true">{icon}</span>
                  <span className="journal-item__msg">{item.message}</span>
                  <time className="journal-time">
                    {new Date(item.ts).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                  </time>
                </li>
              );
            })
          )}
        </ul>
      </div>
    </section>
  );
};
