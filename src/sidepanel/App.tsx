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

export const App: React.FC = () => {
  const [activeTab, setActiveTab] = useState<TabId>('autopilot');
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const { dashboard, pinnedCards, loading, refresh, togglePin } = useDashboard();
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
          onTabChange={setActiveTab}
          duplicatesCount={duplicates.length}
          dealsCount={deals.length}
          wishlistCount={wishlist.length}
        />
      </header>

      <main className="app-main">
        {activeTab === 'autopilot' && (
          <AutopilotTab
            dashboard={dashboard}
            settings={settings}
            stats={stats}
            journal={journal}
            bestPulls={bestPulls}
            onUpdateSettings={updateSettings}
            onResetRoi={resetRoi}
            onClearJournal={clearJournal}
            onClearBestPulls={clearBestPulls}
            onToast={showToast}
          />
        )}

        {activeTab === 'duplicates' && (
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
        )}

        {activeTab === 'market' && (
          <MarketTab
            deals={deals}
            trades={trades}
            onToast={showToast}
            onRefresh={() => refresh(true)}
          />
        )}

        {activeTab === 'wishlist' && (
          <WishlistTab
            wishlist={wishlist}
            suggestions={suggestions}
            duplicates={duplicates}
            deals={deals}
            onAddWish={addWish}
            onRemoveWish={removeWish}
            onToast={showToast}
            onRefresh={() => refresh(false)}
          />
        )}

        {activeTab === 'boosters' && (
          <BoostersTab
            boosters={dashboard?.boosters}
            onToast={showToast}
            onRefresh={() => refresh(false)}
          />
        )}

        {activeTab === 'settings' && (
          <SettingsTab
            settings={settings}
            onUpdateSettings={updateSettings}
            onToast={showToast}
          />
        )}
      </main>

      <Toast message={toastMessage} />
    </div>
  );
};
