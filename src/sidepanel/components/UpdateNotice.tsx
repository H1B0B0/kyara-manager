import { useEffect, useId, useRef, useState } from 'react';
import type { UpdateState } from '../../types/updates';
import { sendCommand } from '../hooks/useDashboard';

export interface UpdateNoticeProps {
  alwaysShow?: boolean;
}

function openExternalUrl(url?: string): void {
  if (!url) return;
  if (chrome.tabs?.create) {
    Promise.resolve(chrome.tabs.create({ url })).catch(() => window.open(url, '_blank', 'noopener'));
  } else {
    window.open(url, '_blank', 'noopener');
  }
}

export function UpdateNotice({ alwaysShow = false }: UpdateNoticeProps) {
  const [update, setUpdate] = useState<UpdateState | null>(null);
  const [checking, setChecking] = useState(false);
  const titleId = useId();
  const descId = useId();
  const modalRef = useRef<HTMLDivElement>(null);

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

  const isModalVisible = !alwaysShow && isActionable && !isDismissed;
  const canDismiss = status === 'available' || status === 'updated' || status === 'error';

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

  useEffect(() => {
    if (!isModalVisible) return;
    modalRef.current?.focus();
    if (!canDismiss) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        void handleDismiss();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [isModalVisible, canDismiss, status]);

  if (!alwaysShow && (!isActionable || isDismissed)) {
    return null;
  }

  const versionBadge =
    status === 'updated'
      ? update?.currentVersion || chrome.runtime?.getManifest?.()?.version || ''
      : update?.availableVersion || update?.currentVersion || chrome.runtime?.getManifest?.()?.version || '';

  const isCws = update?.cwsInstall !== false;
  const isCwsPending = status === 'available' && Boolean(update?.cwsPending) && isCws;
  const isDevGithubOnly = update?.cwsInstall === false && Boolean(update?.releaseUrl);
  const cwsStoreUrl =
    update?.cwsUrl ||
    (chrome.runtime?.id ? `https://chromewebstore.google.com/detail/${chrome.runtime.id}` : undefined);

  const titleByStatus: Record<UpdateState['status'], string> = {
    idle: `Kyara Manager v${versionBadge}`,
    checking: 'Vérification Chrome Web Store…',
    available: alwaysShow
      ? `Nouvelle mise à jour disponible — v${update?.availableVersion || versionBadge}`
      : 'Nouvelle mise à jour disponible',
    waiting: 'Kyara Manager se met à jour…',
    installing: 'Kyara Manager se met à jour…',
    updated: `Kyara Manager a été mis à jour (v${update?.currentVersion || versionBadge})`,
    no_update: `Version v${versionBadge} à jour`,
    throttled: 'Vérification déjà effectuée',
    error: 'Échec de vérification de mise à jour'
  };

  const descByStatus: Record<UpdateState['status'], string> = {
    idle: 'Écoute active Chrome Web Store (vérification automatique toutes les 5 à 15 min).',
    checking: 'Interrogation du Chrome Web Store en cours…',
    available: isCwsPending
      ? 'Publication Chrome Web Store en cours de validation/déploiement par Google. L’extension s’installera automatiquement dès disponibilité.'
      : isCws
        ? 'Prête à être installée automatiquement via le Chrome Web Store sans perdre tes réglages ni tes listes.'
        : 'Nouvelle version détectée sur GitHub (build local sans update_url).',
    waiting: `Mise à jour v${update?.availableVersion || versionBadge} prête sur Chrome Web Store. Fin de l’action en cours avant le rechargement automatique…`,
    installing: `Installation automatique de la v${update?.availableVersion || versionBadge} via Chrome Web Store. Le panneau latéral et le pilote vont se recharger dans un instant…`,
    updated: 'Les dernières optimisations Chrome Web Store sont maintenant actives.',
    no_update: 'Tu utilises la dernière version publiée sur le Chrome Web Store.',
    throttled: 'Attends environ 1 minute avant de relancer une vérification Chrome Web Store.',
    error: update?.error || 'Réessaie plus tard.'
  };

  const handleCheck = async () => {
    setChecking(true);
    const result = await sendCommand({
      type: 'km:update-check',
      includeRemote: true,
      bypassThrottle: Boolean(update?.source === 'github' || update?.cwsPending)
    });
    if (!result.ok) {
      setUpdate((prev) => ({
        ...prev,
        status: 'error',
        currentVersion: chrome.runtime?.getManifest?.()?.version || prev?.currentVersion || '2.6.2',
        error: result.error
      }));
    } else if (result.kmUpdate) {
      setUpdate(result.kmUpdate);
    }
    setChecking(false);
  };

  const handleApply = async () => {
    setChecking(true);
    const result = await sendCommand({ type: 'km:update-apply' });
    const nextState = result.kmUpdate;
    if (nextState) setUpdate(nextState);
    if (
      nextState?.cwsInstall === false &&
      !nextState?.cwsPending &&
      nextState?.source === 'github' &&
      nextState?.releaseUrl
    ) {
      openExternalUrl(nextState.releaseUrl);
    }
    setChecking(false);
  };

  if (isModalVisible) {
    const showProgress = status === 'waiting' || status === 'installing';
    const primaryApplyLabel = isCws ? 'Mettre à jour via Chrome Store' : 'Mettre à jour';

    return (
      <div
        className="km-update-modal-backdrop"
        onClick={(event) => {
          if (event.target === event.currentTarget && canDismiss) {
            void handleDismiss();
          }
        }}
      >
        <div
          ref={modalRef}
          className={`km-update-modal km-update-modal--${status}`}
          role="dialog"
          aria-modal="true"
          aria-labelledby={titleId}
          aria-describedby={descId}
          tabIndex={-1}
        >
          <div className="km-update-modal__seal-wrap">
            <span
              className={`kanji-box kanji-box--acc km-update-modal__seal${showProgress ? ' is-pulsing' : ''}`}
              aria-hidden="true"
            >
              新
            </span>
            {versionBadge && <span className="km-update-modal__version">v{versionBadge}</span>}
          </div>

          <div className="km-update-modal__body">
            <h2 id={titleId} className="km-update-modal__title">
              {titleByStatus[status]}
            </h2>
            <p id={descId} className="km-update-modal__desc">
              {descByStatus[status]}
            </p>
            {status === 'available' && update?.notes && (
              <p className="km-update-modal__notes">{update.notes}</p>
            )}
          </div>

          {showProgress && (
            <progress
              className="km-update-progress km-update-progress--modal"
              aria-label="Progression de la mise à jour Chrome Web Store"
            />
          )}

          <div className="km-update-modal__actions">
            {status === 'available' && (
              <button type="button" className="btn btn--primary btn--sm" disabled={busy} onClick={handleApply}>
                {busy ? 'Vérification…' : primaryApplyLabel}
              </button>
            )}
            {status === 'available' && isCws && (isCwsPending || update?.source === 'github') && cwsStoreUrl && (
              <button
                type="button"
                className="btn btn--ghost btn--sm"
                disabled={busy}
                onClick={() => openExternalUrl(cwsStoreUrl)}
              >
                Ouvrir Chrome Web Store
              </button>
            )}
            {status === 'available' && isDevGithubOnly && (
              <button
                type="button"
                className="btn btn--ghost btn--sm"
                disabled={busy}
                onClick={() => openExternalUrl(update?.releaseUrl)}
              >
                Voir sur GitHub
              </button>
            )}
            {status === 'updated' && (
              <button type="button" className="btn btn--primary btn--sm" onClick={handleDismiss}>
                Continuer
              </button>
            )}
            {status === 'error' && (
              <button type="button" className="btn btn--primary btn--sm" disabled={busy} onClick={handleCheck}>
                Réessayer
              </button>
            )}
            {canDismiss && status !== 'updated' && (
              <button
                type="button"
                className="btn btn--ghost btn--sm"
                aria-label="Fermer la notification de mise à jour"
                onClick={handleDismiss}
              >
                {status === 'error' ? 'Fermer' : 'Plus tard'}
              </button>
            )}
          </div>
        </div>
      </div>
    );
  }

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
              {isCws ? 'Mettre à jour via Chrome Store' : 'Mettre à jour'}
            </button>
          )}
          {status === 'available' && (
            <button type="button" className="btn btn--ghost btn--xs" disabled={busy} onClick={handleCheck}>
              {busy ? '…' : 'Vérifier CWS'}
            </button>
          )}
          {status === 'available' && isCws && (isCwsPending || update?.source === 'github') && cwsStoreUrl && (
            <button
              type="button"
              className="btn btn--ghost btn--xs"
              disabled={busy}
              onClick={() => openExternalUrl(cwsStoreUrl)}
            >
              Fiche Chrome Store
            </button>
          )}
          {status === 'available' && isDevGithubOnly && (
            <button
              type="button"
              className="btn btn--ghost btn--xs"
              disabled={busy}
              onClick={() => openExternalUrl(update?.releaseUrl)}
            >
              Voir sur GitHub
            </button>
          )}
          {status !== 'available' && status !== 'waiting' && status !== 'installing' && (
            <button type="button" className="btn btn--ghost btn--xs" disabled={busy} onClick={handleCheck}>
              {busy ? '…' : 'Vérifier CWS'}
            </button>
          )}
        </div>
      </div>
      {(status === 'waiting' || status === 'installing') && (
        <progress className="km-update-progress" aria-label="Progression de la mise à jour" />
      )}
    </div>
  );
}
