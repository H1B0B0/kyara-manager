import React, { useEffect, useRef } from 'react';
import { ArrowLeft, RefreshCw } from 'lucide-react';
import type { AccountMode, AccountSnapshot, ViewportBounds } from '../shared/types';

interface Props {
  snapshot: AccountSnapshot;
  modalOpen: boolean;
  onChangeMode: (id: string, mode: AccountMode) => void;
  onReload: (id: string) => void;
  onBounds: (bounds: ViewportBounds | null) => void;
}

export const HybridViewport: React.FC<Props> = ({
  snapshot,
  modalOpen,
  onChangeMode,
  onReload,
  onBounds
}) => {
  const hostRef = useRef<HTMLDivElement>(null);
  const { account, settings } = snapshot;

  useEffect(() => {
    const el = hostRef.current;
    if (!el || modalOpen) {
      onBounds(null);
      return;
    }
    const pushBounds = () => {
      const r = el.getBoundingClientRect();
      if (r.width <= 0 || r.height <= 0) {
        onBounds(null);
        return;
      }
      onBounds({ x: r.left, y: r.top, width: r.width, height: r.height });
    };
    pushBounds();
    const obs = new ResizeObserver(pushBounds);
    obs.observe(el);
    window.addEventListener('resize', pushBounds);
    return () => {
      obs.disconnect();
      window.removeEventListener('resize', pushBounds);
      onBounds(null);
    };
  }, [account.id, account.mode, modalOpen, onBounds]);

  return (
    <>
      <div className="hybrid-bar">
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <button className="btn btn--sm" onClick={() => onChangeMode(account.id, 'silent')}>
            <ArrowLeft size={12} /> Retour Silencieux
          </button>
          <button className="btn btn--sm" onClick={() => onReload(account.id)} title="Recharger la page">
            <RefreshCw size={12} />
          </button>
          <b>{account.name}</b>
          <span className={`tag tag--${account.mode}`}>
            {account.mode === 'hybrid' ? 'Hybride (Kyara + Cockpit)' : 'Manuel pur (Autopilot en pause)'}
          </span>
          {account.mode === 'hybrid' && settings.autoBoosterEnabled === false && (
            <span className="tag" style={{ color: '#fde68a' }}>Boosters manuels activés</span>
          )}
        </div>
        <div style={{ display: 'flex', gap: 6 }}>
          <button
            className={`btn btn--sm ${account.mode === 'hybrid' ? 'btn--primary' : ''}`}
            onClick={() => onChangeMode(account.id, 'hybrid')}
          >
            Mode Hybride
          </button>
          <button
            className={`btn btn--sm ${account.mode === 'manual' ? 'btn--primary' : ''}`}
            onClick={() => onChangeMode(account.id, 'manual')}
          >
            Mode Manuel
          </button>
        </div>
      </div>
      <div ref={hostRef} className="viewport-host">
        {modalOpen && (
          <div style={{ padding: 24, color: 'var(--muted)' }}>
            Vue Kyara temporairement masquée pendant la boîte de dialogue…
          </div>
        )}
      </div>
    </>
  );
};
