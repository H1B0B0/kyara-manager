import { useEffect, useState } from 'react';
import type { UpdateState } from '../../types/updates';
import { sendCommand } from '../hooks/useDashboard';

export function UpdateNotice() {
  const [update, setUpdate] = useState<UpdateState | null>(null);
  const [checking, setChecking] = useState(false);
  useEffect(() => {
    let active = true;
    let changed = false;
    const listener = (changes: Record<string, chrome.storage.StorageChange>, area: string) => {
      if (area === 'local' && changes.kmUpdate) {
        changed = true;
        setUpdate((changes.kmUpdate.newValue as UpdateState) || null);
      }
    };
    chrome.storage.onChanged.addListener(listener);
    void chrome.storage.local.get('kmUpdate').then(({ kmUpdate }) => {
      if (active && !changed) setUpdate((kmUpdate as UpdateState) || null);
    });
    return () => { active = false; chrome.storage.onChanged.removeListener(listener); };
  }, []);
  const busy = checking || ['waiting', 'installing'].includes(update?.status);
  const message: Record<UpdateState['status'], string> = {
    idle: 'Mises à jour automatiques via Chrome.',
    checking: 'Recherche sur le Chrome Web Store…',
    available: `Mise à jour v${update?.availableVersion} disponible.`,
    waiting: `Mise à jour v${update?.availableVersion} prête. Fin de l’action en cours…`,
    installing: `Installation de la v${update?.availableVersion}… Le panneau va se recharger.`,
    updated: `Mise à jour terminée : v${update?.currentVersion}.`,
    no_update: 'Aucune nouvelle version proposée par Chrome.',
    throttled: 'Vérification trop récente. Réessaie dans quelques minutes.',
    error: `Vérification impossible : ${update?.error || 'réessaie plus tard'}`
  };
  return <div className="update-notice" role="status" aria-live="polite">
    <span>{message[update?.status || 'idle']}</span>
    <button className="btn btn--ghost btn--xs" disabled={busy}
      onClick={async () => {
        setChecking(true);
        const result = await sendCommand({ type: 'km:update-check' });
        if (!result.ok) setUpdate({ status: 'error', currentVersion: chrome.runtime.getManifest().version, error: result.error });
        setChecking(false);
      }}>Vérifier</button>
  </div>;
}
