import React, { useState, useEffect } from 'react';
import type { TabId } from './components/Navigation';
import { Header } from './components/Header';
import { KpiGrid } from './components/KpiGrid';
import { Navigation } from './components/Navigation';
import { Toast } from './components/Toast';
import { AutopilotTab } from './components/tabs/AutopilotTab';
import { DuplicatesTab } from './components/tabs/DuplicatesTab';
import { MarketTab } from './components/tabs/MarketTab';
import { WishlistTab } from './components/tabs/WishlistTab';
import { BoostersTab } from './components/tabs/BoostersTab';
import { SettingsTab } from './components/tabs/SettingsTab';
import { useDashboard } from './hooks/useDashboard';
import { useSettings } from './hooks/useSettings';
import { useJournal, useCumulativeStats } from './hooks/useJournal';
import { useWishlist } from './hooks/useWishlist';
import { useBestPulls } from './hooks/useBestPulls';
import { UpdateNotice } from './components/UpdateNotice';

export const App: React.FC = () => {
  const [activeTab, setActiveTab] = useState<TabId>('autopilot');
  const [visitedTabs, setVisitedTabs] = useState<Set<TabId>>(() => new Set(['autopilot']));
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const { dashboard, pinnedCards, loading, error, refresh, scanDeals, togglePin } = useDashboard();
  const { settings, updateSettings } = useSettings();
  const { journal, clearJournal } = useJournal();
  const { stats, resetRoi } = useCumulativeStats();
  const { wishlist, addWish, removeWish } = useWishlist();
  const { bestPulls, clearBestPulls } = useBestPulls();

  useEffect(() => {
    if (window.location.search.includes('mode=full')) {
      document.documentElement.classList.add('km-mode-full');
    }
  }, []);

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => {
      setToastMessage((current) => (current === msg ? null : current));
    }, 3200);
  };

  const duplicates = dashboard?.duplicates || [];
  const deals = dashboard?.deals || [];
  const trades = dashboard?.trades || [];
  const suggestions = dashboard?.wishlistSuggestions || [];

  return (
    <div className="app-shell">
      <header className="app-header">
        <Header
          dashboard={dashboard}
          loading={loading}
          onRefresh={() => refresh(true)}
        />

        <KpiGrid
          dashboard={dashboard}
          maxListings={settings.autoSellMaxListings || 10}
        />

        <Navigation
          activeTab={activeTab}
          onTabChange={(tab) => { setVisitedTabs((visited) => new Set([...visited, tab])); setActiveTab(tab); }}
          duplicatesCount={duplicates.length}
          dealsCount={deals.length}
          wishlistCount={wishlist.length}
        />
      </header>

      <main className="app-main">
        <UpdateNotice />
        {(error || dashboard?.error) && <div className="connection-notice" role="alert">
          <p>{error || dashboard?.error}</p>
          <button className="btn btn--ghost btn--xs" onClick={() => void chrome.runtime.sendMessage({ type: 'km:open-kyara-tab' })}>Ouvrir Kyara</button>
        </div>}
        {settings.dryRun && <p className="connection-notice" role="status">Mode simulation actif : aucune modification envoyée à Kyara.</p>}
        {visitedTabs.has('autopilot') && (
          <div role="tabpanel" id="km-panel-autopilot" aria-labelledby="km-tab-autopilot" hidden={activeTab !== 'autopilot'}>
            <AutopilotTab
              dashboard={dashboard}
              settings={settings}
              stats={stats}
              journal={journal}
              bestPulls={bestPulls}
              onUpdateSettings={(partial) => { void updateSettings(partial).catch((err) => showToast(err.message)); }}
              onResetRoi={resetRoi}
              onClearJournal={clearJournal}
              onClearBestPulls={clearBestPulls}
              onToast={showToast}
            />
          </div>
        )}

        {visitedTabs.has('duplicates') && (
          <div role="tabpanel" id="km-panel-duplicates" aria-labelledby="km-tab-duplicates" hidden={activeTab !== 'duplicates'}>
            <DuplicatesTab
              duplicates={duplicates}
              stats={dashboard?.collectionStats}
              activeListings={dashboard?.activeListings || []}
              maxSlots={settings.autoSellMaxListings || 10}
              pinnedCards={pinnedCards}
              settings={settings}
              onTogglePin={togglePin}
              onToast={showToast}
              onRefresh={() => refresh(false)}
            />
          </div>
        )}

        {visitedTabs.has('market') && (
          <div role="tabpanel" id="km-panel-market" aria-labelledby="km-tab-market" hidden={activeTab !== 'market'}>
            <MarketTab
              deals={deals}
              trades={trades}
              onToast={showToast}
              onRefresh={() => refresh(true)}
              onScanDeals={scanDeals}
            />
          </div>
        )}

        {visitedTabs.has('wishlist') && (
          <div role="tabpanel" id="km-panel-wishlist" aria-labelledby="km-tab-wishlist" hidden={activeTab !== 'wishlist'}>
            <WishlistTab
              wishlist={wishlist.map((wish) => {
                const matching = deals.filter((deal) => deal.characterId === wish.characterId).sort((a, b) => a.buyPrice - b.buyPrice);
                return { ...wish, lowestMarketPrice: matching[0]?.buyPrice ?? null, bestListingId: matching[0]?.listingId ?? null };
              })}
              suggestions={suggestions}
              duplicates={duplicates}
              deals={deals}
              onAddWish={addWish}
              onRemoveWish={removeWish}
              onToast={showToast}
              onRefresh={() => refresh(false, true)}
            />
          </div>
        )}

        {visitedTabs.has('boosters') && (
          <div role="tabpanel" id="km-panel-boosters" aria-labelledby="km-tab-boosters" hidden={activeTab !== 'boosters'}>
            <BoostersTab
              boosters={dashboard?.boosters}
              onToast={showToast}
              onRefresh={() => refresh(false)}
            />
          </div>
        )}

        {visitedTabs.has('settings') && (
          <div role="tabpanel" id="km-panel-settings" aria-labelledby="km-tab-settings" hidden={activeTab !== 'settings'}>
            <SettingsTab
              settings={settings}
              onUpdateSettings={updateSettings}
              onToast={showToast}
            />
          </div>
        )}
      </main>

      <Toast message={toastMessage} />
    </div>
  );
};
