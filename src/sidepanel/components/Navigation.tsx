import React, { useRef } from 'react';
import { t } from '../../lib/i18n';

export type TabId = 'autopilot' | 'duplicates' | 'market' | 'wishlist' | 'boosters' | 'settings';

export interface NavigationProps {
  activeTab: TabId;
  onTabChange: (tab: TabId) => void;
  duplicatesCount: number;
  dealsCount: number;
  wishlistCount: number;
}

export const Navigation: React.FC<NavigationProps> = ({
  activeTab,
  onTabChange,
  duplicatesCount,
  dealsCount,
  wishlistCount
}) => {
  const navRef = useRef<HTMLElement>(null);

  const tabs: Array<{ id: TabId; glyph: string; labelKey: string; badge?: number }> = [
    { id: 'autopilot', glyph: '操', labelKey: 'tabAutopilot' },
    { id: 'duplicates', glyph: '集', labelKey: 'tabDuplicates', badge: duplicatesCount },
    { id: 'market', glyph: '市', labelKey: 'tabMarket', badge: dealsCount },
    { id: 'wishlist', glyph: '★', labelKey: 'tabWishlist', badge: wishlistCount },
    { id: 'boosters', glyph: '札', labelKey: 'tabBoosters' },
    { id: 'settings', glyph: '設', labelKey: 'tabSettings' }
  ];

  const handleWheel = (e: React.WheelEvent) => {
    if (navRef.current && e.deltaY !== 0) {
      navRef.current.scrollLeft += e.deltaY;
    }
  };

  return (
    <nav ref={navRef} onWheel={handleWheel} className="tab-nav" role="tablist" aria-label="Sections de Kyara Manager">
      {tabs.map((tab) => {
        const isActive = activeTab === tab.id;
        return (
          <button
            key={tab.id}
            type="button"
            role="tab"
            aria-selected={isActive}
            className={`tab-btn ${isActive ? 'is-active' : ''}`}
            onClick={() => onTabChange(tab.id)}
          >
            <span className="k-glyph" aria-hidden="true">{tab.glyph}</span>
            <span className="tab-label">{t(tab.labelKey)}</span>
            {tab.badge !== undefined && tab.badge > 0 && (
              <span className="tab-badge">{tab.badge}</span>
            )}
          </button>
        );
      })}
    </nav>
  );
};
