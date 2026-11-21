import { useEffect, useState } from 'react';
import type { UpdateState } from '../../types/updates';
import { sendCommand } from '../hooks/useDashboard';

export interface UpdateNoticeProps {
  alwaysShow?: boolean;
}

export function UpdateNotice({ alwaysShow = false }: UpdateNoticeProps) {
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
    chrome.storage?.onChanged?.addListener(listener);
    void chrome.storage?.local?.get('kmUpdate').then(({ kmUpdate }) => {
      if (active && !changed) setUpdate((kmUpdate as UpdateState) || null);
    });
    return () => {
      active = false;
      chrome.storage?.onChanged?.removeListener(listener);
    };
  }, []);

  const status = update?.status || 'idle';
  const busy = checking || status === 'checking' || status === 'waiting' || status === 'installing';
  const isActionable =
    status === 'available' ||
    status === 'waiting' ||
    status === 'installing' ||
    status === 'updated' ||
    status === 'error';
  const isDismissed =
    status === 'available' &&
    Boolean(update?.availableVersion) &&
    update?.dismissedVersion === update?.availableVersion;

  if (!alwaysShow && (!isActionable || isDismissed)) {
    return null;
  }

  const versionBadge = update?.availableVersion || update?.currentVersion || chrome.runtime?.getManifest?.()?.version || '';

  const titleByStatus: Record<UpdateState['status'], string> = {
    idle: `Kyara Manager v${versionBadge}`,
    checking: 'Recherche de mise à jour…',
    available: `Nouvelle mise à jour disponible — v${update?.availableVersion}`,
    waiting: `Kyara Manager se met à jour — v${update?.availableVersion}`,
    installing: `Installation de la v${update?.availableVersion}…`,
    updated: `Kyara Manager mis à jour (v${update?.currentVersion})`,
    no_update: `Version v${versionBadge} à jour`,
    throttled: 'Vérification déjà effectuée',
    error: 'Échec de vérification de mise à jour'
  };

  const descByStatus: Record<UpdateState['status'], string> = {
    idle: 'Écoute active toutes les 15 min (Chrome Web Store & GitHub).',
    checking: 'Interrogation du Chrome Web Store et des releases…',
    available:
      update?.source === 'github'
        ? 'Nouvelle version publiée. Vérifie le store ou télécharge le package.'
        : 'Prête à être installée sans perdre tes réglages ni tes listes.',
    waiting: 'Une action automatique est en cours. Rechargement dès qu’elle se termine…',
    installing: 'Le panneau latéral et le pilote vont se recharger dans un instant.',
    updated: 'Les dernières optimisations sont maintenant actives.',
    no_update: 'Tu utilises la dernière version publiée.',
    throttled: 'Attends environ 1 minute avant de relancer une vérification manuelle.',
    error: update?.error || 'Réessaie plus tard.'
  };

  const handleCheck = async () => {
    setChecking(true);
    const result = await sendCommand({ type: 'km:update-check', includeRemote: true });
    if (!result.ok) {
      setUpdate({
        status: 'error',
        currentVersion: chrome.runtime?.getManifest?.()?.version || '2.3.5',
        error: result.error
      });
    }
    setChecking(false);
  };

  const handleApply = async () => {
    setChecking(true);
    const result = await sendCommand({ type: 'km:update-apply' });
    const nextState = (result as any)?.kmUpdate as UpdateState | undefined;
    if (nextState?.source === 'github' && nextState?.releaseUrl) {
      window.open(nextState.releaseUrl, '_blank', 'noopener');
    }
    setChecking(false);
  };

  const handleDismiss = async () => {
    await sendCommand({ type: 'km:update-dismiss' });
    setUpdate((prev) =>
      prev
        ? {
            ...prev,
            status: prev.status === 'updated' || prev.status === 'error' ? 'idle' : prev.status,
            dismissedVersion: prev.availableVersion
          }
        : prev
    );
  };

  return (
    <div
      className={`km-update-banner km-update-banner--${status}`}
      role="status"
      aria-live="polite"
    >
      <div className="km-update-banner__head">
        <span className="kanji-box kanji-box--acc km-update-banner__seal" aria-hidden="true">
          新
        </span>
        <div className="km-update-banner__copy">
          <strong className="km-update-banner__title">{titleByStatus[status]}</strong>
          <span className="km-update-banner__desc">{descByStatus[status]}</span>
        </div>
        <div className="km-update-banner__actions">
          {status === 'available' && (
            <button type="button" className="btn btn--primary btn--xs" disabled={busy} onClick={handleApply}>
              {update?.source === 'github' && update?.releaseUrl ? 'Voir / Installer' : 'Mettre à jour'}
            </button>
          )}
          {alwaysShow && status !== 'available' && status !== 'waiting' && status !== 'installing' && (
            <button type="button" className="btn btn--ghost btn--xs" disabled={busy} onClick={handleCheck}>
              {busy ? '…' : 'Vérifier'}
            </button>
          )}
          {!alwaysShow && (status === 'available' || status === 'updated' || status === 'error') && (
            <button
              type="button"
              className="btn btn--ghost btn--xs"
              aria-label="Fermer la notification de mise à jour"
              onClick={handleDismiss}
            >
              Plus tard
            </button>
          )}
        </div>
      </div>
      {(status === 'waiting' || status === 'installing') && (
        <div className="km-update-banner__progress" aria-hidden="true">
          <div className="km-update-banner__progress-bar" />
        </div>
      )}
    </div>
  );
}
