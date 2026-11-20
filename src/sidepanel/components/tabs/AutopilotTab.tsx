import React, { useState } from 'react';
import type { DashboardState, AutopilotPullRecord } from '../../../types/kyara';
import type { KyaraSettings, PricingStrategy, SellMode } from '../../../types/settings';
import type { CumulativeStats, JournalItem } from '../../../types/journal';
import { t } from '../../../lib/i18n';
import { sendCommand } from '../../hooks/useDashboard';
import type { TabId } from '../Navigation';
import { PresetsBar } from '../common/PresetsBar';
import { DailyChecklistBar } from '../common/DailyChecklistBar';
import { BestPullsShowcase } from '../showcase/BestPullsShowcase';
import { AutopilotJournal } from './AutopilotJournal';

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
  onNavigateTab?: (tab: TabId) => void;
  onToast: (msg: string) => void;
}

const rhythmExplanations: Record<SellMode, string> = {
  adaptive: 'Auto par prix : <12 ◆ Rapide (20m) · 12–60 ◆ Normal (45m) · ≥60 ◆ Patient (90m) · Undercut dès 15 min',
  fast: 'Rotation 20 min · Reprisage auto (-8%) · Détection undercut dès 15 min',
  normal: 'Rotation 45 min · Reprisage auto (-6%) · Détection undercut dès 15 min',
  patient: 'Rotation 90 min · Reprisage auto (-4%) · Détection undercut dès 15 min'
};

const rhythmModes: Array<{ key: SellMode; label: string }> = [
  { key: 'adaptive', label: 'Adaptatif' },
  { key: 'fast', label: 'Rapide' },
  { key: 'normal', label: 'Normal' },
  { key: 'patient', label: 'Patient' }
];

const ChevronIcon: React.FC = () => (
  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <polyline points="6 9 12 15 18 9" />
  </svg>
);

interface CollapsibleModuleProps {
  id: string;
  variant: string;
  kanji: string;
  kanjiTone: string;
  title: string;
  summary: string;
  switchId: string;
  checked: boolean;
  expanded: boolean;
  onToggleExpand: (id: string) => void;
  onToggleSwitch: (checked: boolean) => void;
  children: React.ReactNode;
}

const CollapsibleModuleCard: React.FC<CollapsibleModuleProps> = ({
  id, variant, kanji, kanjiTone, title, summary, switchId,
  checked, expanded, onToggleExpand, onToggleSwitch, children
}) => (
  <div className={`module-card module-card--${variant} ${expanded ? 'is-expanded' : ''}`}>
    <div className="switch-row module-card__head">
      <button type="button" className="module-card__toggle" aria-expanded={expanded} onClick={() => onToggleExpand(id)}>
        <span className={`kanji-box kanji-box--${kanjiTone}`} aria-hidden="true">{kanji}</span>
        <span className="module-card__titles">
          <span className="module-card__title">{title}</span>
          <span className="module-card__summary mono-stat">{summary}</span>
        </span>
      </button>
      <div className="module-card__controls">
        <button type="button" className={`module-card__toggle-btn ${expanded ? 'is-open' : ''}`} aria-expanded={expanded} onClick={() => onToggleExpand(id)}>
          <span>Options</span><ChevronIcon />
        </button>
        <input type="checkbox" role="switch" id={switchId} aria-label={title} className="switch switch--sm" checked={checked} onChange={(e) => onToggleSwitch(e.target.checked)} />
      </div>
    </div>
    {expanded && <div className="module-card__body">{children}</div>}
  </div>
);

export const AutopilotTab: React.FC<AutopilotTabProps> = ({
  dashboard, settings, stats, journal, bestPulls,
  onUpdateSettings, onResetRoi, onClearJournal, onClearBestPulls, onNavigateTab, onToast
}) => {
  const [runningCycle, setRunningCycle] = useState(false);
  const [actingSell, setActingSell] = useState(false);
  const [actingRecycle, setActingRecycle] = useState(false);
  const [actingOpen, setActingOpen] = useState(false);
  const [actingWatch, setActingWatch] = useState(false);
  const [expandedModule, setExpandedModule] = useState<string | null>(null);

  const toggleModule = (id: string) => setExpandedModule((cur) => (cur === id ? null : id));

  const me = dashboard?.me;
  const collStats = dashboard?.collectionStats;
  const sellNet = collStats?.sellableNetTotal ?? 0;
  const sellCount = collStats?.sellableDuplicatesCount ?? 0;
  const recTotal = collStats?.recyclableChakraTotal ?? 0;
  const recCount = collStats?.recyclableDuplicatesCount ?? 0;
  const recPack = dashboard?.boosters?.recommendedNew;
  const dailyPack = (dashboard?.boosters?.all || []).find((p) => p.packId === 'daily');
  const canOpen = Boolean(recPack?.canOpenNow && (recPack?.openableFreeCount ?? me?.freePacks ?? 0) > 0);
  const dealsCount = dashboard?.deals?.length ?? 0;
  const tradesCount = dashboard?.trades?.length ?? 0;
  const pity = me?.pity ?? 0;
  const isPityNear = Boolean(dashboard?.boosters?.isPityNear || pity >= 240);
  const pityTargetPack = dashboard?.boosters?.recommendedPity?.name || recPack?.name || 'Pack avec le plus de Mythiques';
  const totalRoiChakra = (stats.chakraFromSales || 0) + (stats.chakraFromRecycle || 0);
  const activeSellMode: SellMode = settings.autoSellMode || 'adaptive';
  const activeRhythmLabel = rhythmModes.find((m) => m.key === activeSellMode)?.label || 'Adaptatif';
  const hourlyHistory = Array.isArray(stats.hourlyHistory) ? stats.hourlyHistory : [];
  const elapsedHours = Math.max(1, (Date.now() - (stats.startedAt || Date.now())) / 3600000);
  const hourlyRate = hourlyHistory.length > 0
    ? Math.round(hourlyHistory.reduce((sum, b) => sum + (b.totalChakra || 0), 0) / hourlyHistory.length)
    : Math.round(totalRoiChakra / elapsedHours);
  const projected8h = Math.round(hourlyRate * 8);

  const sparklineCoords = (() => {
    if (hourlyHistory.length < 2) return null;
    const vals = hourlyHistory.map((b) => Math.max(0, b.totalChakra || 0));
    const maxVal = Math.max(1, ...vals);
    const pts = vals.map((v, idx) => `${((idx / (vals.length - 1)) * 240).toFixed(1)},${(31 - (v / maxVal) * 28).toFixed(1)}`);
    return { polyline: pts.join(' '), area: `0,34 ${pts.join(' ')} 240,34` };
  })();

  const handleRunCycle = async () => {
    setRunningCycle(true);
    onToast('Cycle Autopilot en cours…');
    const res = await sendCommand({ type: 'km:cmd:run-cycle' });
    setRunningCycle(false);
    if (res?.ok && res.summary) {
      const s = res.summary;
      onToast(`Cycle terminé : ${s.opened} booster(s), ${s.recycledCopies} recyclée(s), ${s.listed} en vente${s.repriced ? ` (+${s.repriced} relancées)` : ''}, ${s.bought} achetée(s)`);
    } else if (res?.error) onToast(res.error);
  };

  const handleSellNow = async (mode?: SellMode) => {
    setActingSell(true);
    onToast(mode === 'fast' ? 'Écoulement rapide des doublons…' : 'Mise en vente des doublons…');
    const res = await sendCommand({ type: 'km:cmd:sell-now', mode });
    setActingSell(false);
    if (res?.ok) {
      const { listedCount = 0, repriced = 0, recycledCopies = 0 } = res.sellRes ?? {};
      onToast(`${listedCount} annonce(s) créée(s)${repriced ? `, ${repriced} relancée(s)` : ''}${recycledCopies ? `, ${recycledCopies} recyclée(s)` : ''}`);
    } else if (res?.error) onToast(res.error);
  };

  const handleRecycleNow = async () => {
    setActingRecycle(true);
    onToast('Recyclage des doublons…');
    const res = await sendCommand({ type: 'km:cmd:recycle-now' });
    setActingRecycle(false);
    if (res?.ok) onToast(`${res.recRes?.recycledCopies ?? 0} copie(s) recyclée(s) (+${res.recRes?.chakraGained ?? 0} ◆)`);
    else if (res?.error) onToast(res.error);
  };

  const openPackLive = async (packId: string, packName: string) => {
    setActingOpen(true);
    onToast(`Ouverture live : ${packName}…`);
    const res = await sendCommand({ type: 'km:cmd:open-pack', packId, packName, count: 1 });
    setActingOpen(false);
    if (res?.ok) onToast(`${packName} ouvert en live !`);
    else onToast(res?.error || "Erreur d'ouverture");
  };

  const handleOpenLive = () => {
    if (!recPack) return onToast('Aucun booster recommandé disponible');
    return openPackLive(recPack.packId, recPack.name);
  };

  const handleOpenDailyPack = () => openPackLive(dailyPack?.packId || 'daily', dailyPack?.name || 'Pack du Jour');

  const handleRunMarketWatch = async () => {
    setActingWatch(true);
    onToast('Observation & achat marché en cours…');
    const res = await (sendCommand({ type: 'km:cmd:run-market-watch' } as any) as Promise<any>);
    setActingWatch(false);
    if (res?.ok) {
      const bought = res.boughtCount ?? 0;
      const found = res.dealsFound ?? dealsCount;
      onToast(`Radar marché : ${found} deal(s) analysé(s), ${bought} achat(s)`);
    } else if (res?.error) onToast(res.error);
  };

  const mw = (dashboard as any)?.marketWatch;
  const radarDeals = typeof mw?.dealsFound === 'number' ? mw.dealsFound : dealsCount;
  const sellSummary = `${activeRhythmLabel} · ${sellCount} doublons (+${sellNet} ◆)`;
  const recycleSummary = `${(settings.autoRecycleRarities || ['C', 'U', 'R']).join(', ')} · ${recCount} à recycler`;
  const boostersSummary = `${recPack ? recPack.name.replace(/^Pack\s+/i, '') : 'Aucun booster'} · ${me?.freePacks ?? 0} gratuits`;
  const marketModes = [
    settings.autoMarketEnabled && 'Flips', settings.autoBuyMissingEnabled && 'Manquantes',
    settings.wishlistAutoBuyEnabled && 'Envies', settings.renaissanceFocusEnabled && 'Renaissance'
  ].filter(Boolean);
  const marketSummary = mw?.active
    ? `Radar actif (20s) · ${radarDeals} deal(s)`
    : `${marketModes.length ? marketModes.join(' · ') : 'Veille'} · ${dealsCount} offres`;

  return (
    <section className="tab-panel is-active">
      <div className="autopilot-cockpit-grid">
        <div className="cockpit-col cockpit-col--main">
          {isPityNear && (
            <div className="pity-banner">
              <span className="kanji-box kanji-box--acc" aria-hidden="true">神</span>
              <div className="pity-banner__content">
                <strong className="pity-banner__title">Pitié Mythique imminente ({pity}/250) !</strong>
                <p className="pity-banner__desc">Cible prioritaire : <strong style={{ color: 'var(--gold)' }}>{pityTargetPack}</strong></p>
              </div>
            </div>
          )}

          <PresetsBar settings={settings} onUpdateSettings={onUpdateSettings} onToast={onToast} />
          <DailyChecklistBar
            dashboard={dashboard}
            onNavigateTab={(tab) => onNavigateTab?.(tab)}
            onOpenDailyPack={handleOpenDailyPack}
            onClaimMissions={handleRunCycle}
          />

          <div className="card card--hero">
            <div className="hero-top">
              <div className="hero-identity">
                <span className="kanji-box kanji-box--acc" aria-hidden="true">操</span>
                <div className="hero-status">
                  <span className={`status-beacon ${settings.masterEnabled ? 'is-active' : ''}`} aria-hidden="true" />
                  <span className="hero-status-text">{settings.masterEnabled ? t('statusActive') : t('statusIdle')}</span>
                </div>
              </div>
              <input
                type="checkbox" role="switch" id="sw-master" className="switch switch--lg"
                aria-label="Activer le Pilote Automatique Global" checked={settings.masterEnabled}
                onChange={(e) => onUpdateSettings({ masterEnabled: e.target.checked })}
              />
            </div>
            <div className="hero-body">
              <h2 className="hero-title">{t('heroTitle')}</h2>
              <p className="hero-desc">{t('heroDesc')}</p>
            </div>
            <div className="hero-actions-dual">
              <button type="button" onClick={handleRunCycle} disabled={runningCycle} className="btn btn--primary btn--hero-primary">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><polygon points="5 3 19 12 5 21 5 3" /></svg>
                <span>{runningCycle ? 'Cycle en cours…' : 'Lancer un cycle'}</span>
              </button>
              <button
                type="button" onClick={() => handleSellNow('fast')} disabled={actingSell || sellCount === 0}
                className="btn btn--secondary btn--hero-secondary" title="Écoulement accéléré du stock au prix le plus compétitif"
              >
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" /></svg>
                <span>{actingSell ? 'Écoulement…' : `Écouler (${sellCount})`}</span>
              </button>
            </div>
          </div>

          <div className="module-grid">
            <CollapsibleModuleCard
              id="sell" variant="sell" kanji="売" kanjiTone="gold"
              title={t('modSellTitle')} summary={sellSummary} switchId="sw-autosell"
              checked={settings.autoSellEnabled} expanded={expandedModule === 'sell'}
              onToggleExpand={toggleModule} onToggleSwitch={(v) => onUpdateSettings({ autoSellEnabled: v })}
            >
              <p className="module-card__desc">{t('modSellDesc')}</p>
              <div className="module-card__sub-config">
                <div className="rhythm-control-group">
                  <div className="rhythm-header"><span className="strategy-selector-label">Rythme de vente :</span></div>
                  <div className="kyara-segmented" role="radiogroup" aria-label="Rythme d'écoulement du stock">
                    {rhythmModes.map(({ key, label }) => (
                      <button
                        key={key} type="button" role="radio" aria-checked={activeSellMode === key}
                        className={`kyara-segmented__pill ${activeSellMode === key ? 'is-active' : ''}`}
                        onClick={() => onUpdateSettings({ autoSellMode: key })}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                  <div className="mono-stat rhythm-hint">{rhythmExplanations[activeSellMode]}</div>
                </div>
                <div className="strategy-selector-row">
                  <label htmlFor="sel-pricing-strat" className="strategy-selector-label">Stratégie (normal) :</label>
                  <select
                    id="sel-pricing-strat" value={settings.autoSellStrategy || 'recent20_median'}
                    onChange={(e) => onUpdateSettings({ autoSellStrategy: e.target.value as PricingStrategy })}
                    className="select select--xs" title="Stratégie de fixation des prix de vente"
                  >
                    <option value="recent20_median">Médiane 20 offres (Anti-krach)</option>
                    <option value="recent20_avg">Moyenne 20 offres (Réactif)</option>
                    <option value="quick">Vente Rapide (Undercut -1 ◆)</option>
                    <option value="balanced">Médiane 7 jours (Historique)</option>
                  </select>
                </div>
              </div>
              <div className="module-card__footer">
                <span className="mono-stat">{t('copiesCount', { n: sellCount })} · +{sellNet} ◆ net</span>
                <button type="button" onClick={() => handleSellNow()} disabled={actingSell || sellCount === 0} className="btn btn--xs btn--ghost">
                  {actingSell ? 'En cours…' : t('sellNow')}
                </button>
              </div>
            </CollapsibleModuleCard>

            <CollapsibleModuleCard
              id="recycle" variant="recycle" kanji="転" kanjiTone="ok"
              title={t('modRecycleTitle')} summary={recycleSummary} switchId="sw-autorecycle"
              checked={settings.autoRecycleEnabled} expanded={expandedModule === 'recycle'}
              onToggleExpand={toggleModule} onToggleSwitch={(v) => onUpdateSettings({ autoRecycleEnabled: v })}
            >
              <p className="module-card__desc">{t('modRecycleDesc')}</p>
              <div className="module-card__footer">
                <span className="mono-stat">{t('copiesCount', { n: recCount })} · +{recTotal} ◆</span>
                <button type="button" onClick={handleRecycleNow} disabled={actingRecycle || recCount === 0} className="btn btn--xs btn--ghost">
                  {actingRecycle ? 'En cours…' : t('recycleNow')}
                </button>
              </div>
            </CollapsibleModuleCard>

            <CollapsibleModuleCard
              id="boosters" variant="boosters" kanji="札" kanjiTone="acc"
              title={t('modBoostersTitle')} summary={boostersSummary} switchId="sw-autobooster"
              checked={settings.autoBoosterEnabled} expanded={expandedModule === 'boosters'}
              onToggleExpand={toggleModule} onToggleSwitch={(v) => onUpdateSettings({ autoBoosterEnabled: v })}
            >
              <p className="module-card__desc">{t('modBoostersDesc')}</p>
              <div className="switch-row switch-row--compact" title="Désactivé : garde tes boosters bonus et tickets de côté pour les drops d'Éveil">
                <label htmlFor="sw-autoopen-bonus" className="module-card__sublabel">Utiliser les boosters bonus / tickets en réserve</label>
                <input type="checkbox" role="switch" id="sw-autoopen-bonus" className="switch switch--xs" checked={Boolean(settings.autoOpenUseBonusPacks)} onChange={(e) => onUpdateSettings({ autoOpenUseBonusPacks: e.target.checked })} />
              </div>
              <p className="form-hint" style={{ margin: '4px 0 0', fontSize: '11px' }}>Désactivé : garde tes boosters bonus et tickets de côté pour les drops d'Éveil</p>
              <div className="module-card__footer">
                <span className="mono-stat">{recPack ? `${recPack.name} (${recPack.probAtLeastOneNewPct}% nouv.)` : 'Aucun booster prêt'}</span>
                <button type="button" onClick={handleOpenLive} disabled={actingOpen || !canOpen} className="btn btn--xs btn--ghost">
                  {actingOpen ? 'Ouverture…' : (canOpen ? t('openLive') : t('noFreeReady'))}
                </button>
              </div>
            </CollapsibleModuleCard>

            <CollapsibleModuleCard
              id="market" variant="market" kanji="市" kanjiTone="cyan"
              title={t('modMarketTitle')} summary={marketSummary} switchId="sw-automarket"
              checked={Boolean(
                settings.autoMarketEnabled ||
                settings.autoBuyFlipEnabled ||
                settings.autoBuyMissingEnabled ||
                settings.wishlistAutoBuyEnabled ||
                settings.renaissanceFocusEnabled
              )}
              expanded={expandedModule === 'market'}
              onToggleExpand={toggleModule}
              onToggleSwitch={(v) =>
                onUpdateSettings(
                  v
                    ? { autoMarketEnabled: true, autoBuyFlipEnabled: true }
                    : {
                        autoMarketEnabled: false,
                        autoBuyFlipEnabled: false,
                        autoBuyMissingEnabled: false,
                        wishlistAutoBuyEnabled: false,
                        renaissanceFocusEnabled: false
                      }
                )
              }
            >
              <p className="module-card__desc">{t('modMarketDesc')}</p>
              <div className="switch-row switch-row--compact">
                <label htmlFor="sw-autobuy-flip" className="module-card__sublabel">Flips rentables (achat/revente sous la médiane)</label>
                <input
                  type="checkbox"
                  role="switch"
                  id="sw-autobuy-flip"
                  className="switch switch--sm"
                  checked={Boolean(settings.autoMarketEnabled ?? settings.autoBuyFlipEnabled)}
                  onChange={(e) => onUpdateSettings({ autoMarketEnabled: e.target.checked, autoBuyFlipEnabled: e.target.checked })}
                />
              </div>
              <div className="switch-row switch-row--compact">
                <label htmlFor="sw-autobuy-missing" className="module-card__sublabel">Acheter les cartes manquantes</label>
                <input type="checkbox" role="switch" id="sw-autobuy-missing" className="switch switch--sm" checked={Boolean(settings.autoBuyMissingEnabled)} onChange={(e) => onUpdateSettings({ autoBuyMissingEnabled: e.target.checked })} />
              </div>
              <div className="switch-row switch-row--compact">
                <label htmlFor="sw-autobuy-wishlist" className="module-card__sublabel">Acheter ma Liste d&apos;Envies</label>
                <input type="checkbox" role="switch" id="sw-autobuy-wishlist" className="switch switch--sm" checked={Boolean(settings.wishlistAutoBuyEnabled)} onChange={(e) => onUpdateSettings({ wishlistAutoBuyEnabled: e.target.checked })} />
              </div>
              <div className="switch-row switch-row--compact">
                <label htmlFor="sw-autopilot-renaissance" className="module-card__sublabel">
                  Focus Renaissance (auto-achat ciblé) <span className="mono-stat">({(settings.renaissanceTargetRarities || ['C', 'U', 'R']).join(', ')})</span>
                </label>
                <input
                  type="checkbox"
                  role="switch"
                  id="sw-autopilot-renaissance"
                  className="switch switch--sm"
                  checked={Boolean(settings.renaissanceFocusEnabled)}
                  onChange={(e) =>
                    onUpdateSettings({
                      renaissanceFocusEnabled: e.target.checked,
                      ...(e.target.checked && !settings.autoBuyMissingEnabled && !settings.autoMarketEnabled
                        ? { autoBuyMissingEnabled: true }
                        : {})
                    })
                  }
                />
              </div>
              <div className="module-card__footer">
                <span className="mono-stat">{mw?.active ? `Radar actif (20s) · ${radarDeals} deal(s)` : `${dealsCount} deal(s) · ${tradesCount} trade(s)`}</span>
                <button type="button" onClick={handleRunMarketWatch} disabled={actingWatch} className="btn btn--xs btn--ghost">
                  {actingWatch ? 'Scan…' : 'Observer & Acheter'}
                </button>
              </div>
            </CollapsibleModuleCard>

            {/* Micro-Modules: Auto-Missions & Anti-AFK */}
            <div className="module-row-pair">
              <div className="module-card module-card--compact">
                <div className="switch-row">
                  <div className="tile-head tile-head--sm">
                    <span className="kanji-box kanji-box--sm kanji-box--purple" aria-hidden="true">務</span>
                    <label htmlFor="sw-autoclaim" className="module-card__title">{t('modMissionsTitle')}</label>
                  </div>
                  <input type="checkbox" role="switch" id="sw-autoclaim" className="switch switch--sm" checked={settings.autoClaimMissionsEnabled} onChange={(e) => onUpdateSettings({ autoClaimMissionsEnabled: e.target.checked })} />
                </div>
              </div>
              <div className="module-card module-card--compact">
                <div className="switch-row">
                  <div className="tile-head tile-head--sm">
                    <span className="kanji-box kanji-box--sm kanji-box--gold" aria-hidden="true" title="Anti-AFK">
                      <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" /></svg>
                    </span>
                    <label htmlFor="sw-antiafk" className="module-card__title">{t('modAntiAfkTitle')}</label>
                  </div>
                  <input type="checkbox" role="switch" id="sw-antiafk" className="switch switch--sm" checked={settings.antiAfkEnabled} onChange={(e) => onUpdateSettings({ antiAfkEnabled: e.target.checked })} />
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="cockpit-col cockpit-col--aside">
          <div className="card card--roi">
            <div className="card__header">
              <div className="roi-title-wrap">
                <span className="kanji-box kanji-box--gold" aria-hidden="true">益</span>
                <div>
                  <h3 className="card__title">{t('roiTitle')}</h3>
                  <p className="card__subtitle">{t('roiSubtitle')}</p>
                </div>
              </div>
              <button type="button" onClick={onResetRoi} className="btn btn--ghost btn--xs">{t('reset')}</button>
            </div>

            <div className="roi-grid">
              {[
                { cls: 'roi-stat-box--chakra', label: 'Chakra total généré', iconCls: 'roi-icon--gold', icon: <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />, val: `+${new Intl.NumberFormat('fr-FR').format(totalRoiChakra)} ◆` },
                { cls: '', label: 'Ventes marché', iconCls: 'roi-icon--acc', icon: <><line x1="12" y1="19" x2="12" y2="5" /><polyline points="5 12 12 5 19 12" /></>, val: `${stats.cardsSold || 0} vendue(s)`, sub: `+${stats.chakraFromSales || 0} ◆ net` },
                { cls: '', label: 'Recyclage', iconCls: 'roi-icon--ok', icon: <><polyline points="23 4 23 10 17 10" /><polyline points="1 20 1 14 7 14" /><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" /></>, val: `${stats.cardsRecycled || 0} recyclée(s)`, sub: `+${stats.chakraFromRecycle || 0} ◆` },
                { cls: '', label: 'Boosters & Tirages', iconCls: 'roi-icon--purple', icon: <><polyline points="21 8 21 21 3 21 3 8" /><rect x="1" y="3" width="22" height="5" /><line x1="10" y1="12" x2="14" y2="12" /></>, val: `${stats.boostersOpenedCount || 0} ouverts`, sub: `${(stats.mythicsPulledCount || 0) + (stats.legendariesPulledCount || 0)} L/M tirées` }
              ].map((b) => (
                <div key={b.label} className={`roi-stat-box ${b.cls}`}>
                  <div className="roi-stat-box__top">
                    <span className="roi-stat-box__label">{b.label}</span>
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={`roi-stat-box__icon ${b.iconCls}`} aria-hidden="true">{b.icon}</svg>
                  </div>
                  <strong className="roi-stat-box__val">{b.val}</strong>
                  {b.sub && <span className="roi-stat-box__sub">{b.sub}</span>}
                </div>
              ))}
            </div>

            <div className="roi-yield-strip font-mono">
              <span>
                Rendement : <strong>{hourlyRate.toLocaleString('fr-FR')} ◆/h</strong> · Projection 8h :{' '}
                <strong className="roi-yield-strip__proj">~{projected8h.toLocaleString('fr-FR')} ◆</strong>
              </span>
              {sparklineCoords && (
                <svg className="roi-sparkline" viewBox="0 0 240 34" preserveAspectRatio="none" aria-label="Historique de rendement horaire 24h">
                  <defs>
                    <linearGradient id="roiSparkGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#f5c518" stopOpacity="0.32" />
                      <stop offset="100%" stopColor="#f5c518" stopOpacity="0.02" />
                    </linearGradient>
                  </defs>
                  <polygon points={sparklineCoords.area} fill="url(#roiSparkGrad)" />
                  <polyline points={sparklineCoords.polyline} fill="none" stroke="#f5c518" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              )}
            </div>
          </div>

          <BestPullsShowcase pulls={bestPulls} onClear={onClearBestPulls} />
          <AutopilotJournal journal={journal} onClear={onClearJournal} />
        </div>
      </div>
    </section>
  );
};
