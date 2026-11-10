import React from 'react';
import type { DashboardState } from '../../types/kyara';
import { t } from '../../lib/i18n';

export interface HeaderProps {
  dashboard: DashboardState | null;
  loading: boolean;
  onRefresh: () => void;
}

export const Header: React.FC<HeaderProps> = ({ dashboard, loading, onRefresh }) => {
  const me = dashboard?.me;
  const stats = dashboard?.collectionStats;

  const statusText =
    dashboard?.authenticated && me
      ? t('accountStatusConnected', {
          pseudo: me.pseudo || 'Joueur',
          owned: stats?.uniqueOwned ?? 0,
          total: stats?.catalogSize ?? 0,
          pct: stats?.completionPct ?? 0
        })
      : t('accountStatusDefault');

  const openFullscreen = () => {
    const manifest = chrome.runtime?.getManifest?.();
    const defaultPath = manifest?.side_panel?.default_path || 'sidepanel/index.html';
    chrome.tabs.create({ url: chrome.runtime.getURL(`${defaultPath}?mode=full`) });
  };

  return (
    <div className="app-header__inner">
      <div className="brand-row">
        <div className="brand">
          <span className="brand__seal" aria-hidden="true">キ</span>
          <div className="brand__text">
            <div className="brand__title-row">
              <h1 className="brand__title">KYARA MANAGER</h1>
              <span className="brand__version">v{chrome.runtime.getManifest().version}</span>
            </div>
            <p className="brand__subtitle">{statusText}</p>
          </div>
        </div>

        <div className="header-actions">
          <button
            type="button"
            onClick={openFullscreen}
            className="icon-btn icon-btn--square"
            aria-label="Ouvrir en plein écran"
            title="Ouvrir le cockpit plein écran dans un onglet dédié"
          >
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7" />
            </svg>
          </button>

          <button
            type="button"
            onClick={onRefresh}
            disabled={loading}
            className="icon-btn"
            title="Rafraîchir les données et cours (Sync)"
          >
            <svg
              width="13"
              height="13"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.2"
              strokeLinecap="round"
              strokeLinejoin="round"
              className={loading ? 'spin' : ''}
              aria-hidden="true"
            >
              <path d="M21 12a9 9 0 0 0-9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
              <path d="M3 3v5h5" />
              <path d="M3 12a9 9 0 0 0 9 9 9.75 9.75 0 0 0 6.74-2.74L21 16" />
              <path d="M16 16h5v5" />
            </svg>
            <span className="icon-btn__text">{loading ? '…' : 'Sync'}</span>
          </button>
        </div>
      </div>
    </div>
  );
};
