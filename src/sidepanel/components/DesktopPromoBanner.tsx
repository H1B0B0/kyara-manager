import React, { useEffect, useState } from 'react';

export const DESKTOP_RELEASE_URL = 'https://github.com/H1B0B0/kyara-manager/releases/tag/desktop-latest';
export const DESKTOP_BANNER_STORAGE_KEY = 'kmDesktopBannerDismissed';

export function shouldShowDesktopPromo(runtimeId: string | undefined, dismissed: boolean): boolean {
  if (runtimeId === 'kyara-manager-desktop') return false;
  return !dismissed;
}

function openReleaseUrl(): void {
  if (typeof chrome !== 'undefined' && chrome.tabs?.create) {
    Promise.resolve(chrome.tabs.create({ url: DESKTOP_RELEASE_URL })).catch(() => window.open(DESKTOP_RELEASE_URL, '_blank', 'noopener'));
  } else {
    window.open(DESKTOP_RELEASE_URL, '_blank', 'noopener');
  }
}

export const DesktopPromoBanner: React.FC = () => {
  const runtimeId = typeof chrome !== 'undefined' ? chrome.runtime?.id : undefined;
  const [ready, setReady] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    let active = true;
    if (runtimeId === 'kyara-manager-desktop') {
      setReady(true);
      setDismissed(true);
      return () => { active = false; };
    }
    const storage = typeof chrome !== 'undefined' ? chrome.storage?.local : undefined;
    if (!storage?.get) {
      setReady(true);
      return () => { active = false; };
    }
    void Promise.resolve(storage.get(DESKTOP_BANNER_STORAGE_KEY))
      .then((res: any) => {
        if (!active) return;
        setDismissed(Boolean(res?.[DESKTOP_BANNER_STORAGE_KEY]));
        setReady(true);
      })
      .catch(() => {
        if (active) setReady(true);
      });
    return () => { active = false; };
  }, [runtimeId]);

  if (!ready || !shouldShowDesktopPromo(runtimeId, dismissed)) return null;

  const handleDismiss = () => {
    setDismissed(true);
    const storage = typeof chrome !== 'undefined' ? chrome.storage?.local : undefined;
    if (storage?.set) {
      void Promise.resolve(storage.set({ [DESKTOP_BANNER_STORAGE_KEY]: true })).catch(() => {});
    }
  };

  return (
    <div
      className="connection-notice"
      role="region"
      aria-label="Nouveau Kyara Manager Desktop"
      style={{ gap: '8px', alignItems: 'center' }}
    >
      <p style={{ margin: 0, flex: 1 }}>
        <strong>Nouveau : Kyara Manager Desktop</strong> — mode silencieux multi-comptes sans mise en veille, avec MÀJ auto.
      </p>
      <button type="button" className="btn btn--ghost btn--xs" onClick={openReleaseUrl}>
        Télécharger
      </button>
      <button
        type="button"
        className="btn btn--ghost btn--xs"
        aria-label="Masquer l'annonce Desktop"
        onClick={handleDismiss}
      >
        ×
      </button>
    </div>
  );
};
