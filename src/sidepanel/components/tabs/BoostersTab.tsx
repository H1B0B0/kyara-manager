import React, { useState } from 'react';
import type { BoosterRecommendations, BoosterPack } from '../../../types/kyara';
import { t } from '../../../lib/i18n';
import { sendCommand } from '../../hooks/useDashboard';

export interface BoostersTabProps {
  boosters?: BoosterRecommendations;
  onToast: (msg: string) => void;
  onRefresh: () => void;
}

export const BoostersTab: React.FC<BoostersTabProps> = ({ boosters, onToast, onRefresh }) => {
  const [openingId, setOpeningId] = useState<string | null>(null);

  const recNew = boosters?.recommendedNew;
  const recEv = boosters?.recommendedEv;
  const isPityNear = boosters?.isPityNear;
  const pityTarget = boosters?.recommendedPity?.name || recNew?.name || 'Booster avec le plus de Mythiques';

  const handleOpenPack = async (pack: BoosterPack, count = 1) => {
    setOpeningId(pack.packId);
    onToast(`Ouverture live de ${pack.name} ×${count}…`);
    const res = await sendCommand({
      type: 'km:cmd:open-pack',
      packId: pack.packId,
      packName: pack.name,
      count
    });
    setOpeningId(null);
    if (res?.ok) {
      onToast(`Booster ${pack.name} ouvert en live !`);
      onRefresh();
    } else {
      onToast(res?.error || "Erreur d'ouverture");
    }
  };

  return (
    <section className="tab-panel is-active">
      {/* Pity Sniper Alert */}
      {isPityNear && (
        <div className="pity-banner">
          <div className="pity-banner__icon">
            <span className="kanji-box kanji-box--gold" aria-hidden="true">神</span>
          </div>
          <div className="pity-banner__content">
            <strong className="pity-banner__title">Pitié Mythique imminente !</strong>
            <p className="pity-banner__desc">
              Cible prioritaire optimisée : <strong>{pityTarget}</strong>. Ouvre ce booster pour maximiser tes chances de nouveau Mythique !
            </p>
          </div>
        </div>
      )}

      {/* Recommended New Pack Card */}
      {recNew && (
        <div className="card card--featured">
          <div className="card__header">
            <div>
              <span className="badge badge--gold">★ RECOMMANDÉ NOUVEAUX</span>
              <h3 className="card__title" style={{ marginTop: '4px' }}>
                {recNew.name} · {recNew.completionPct}% ({recNew.totalMissing} manquants)
              </h3>
              <p className="card__desc">
                P(≥1 nouv.) : {recNew.probAtLeastOneNewPct}% · Espérance : ~{recNew.expectedNewCards} nouv./booster
              </p>
            </div>
          </div>

          {/* 3px Booster Completion Progress Bar */}
          <div className="booster-progress-track">
            <div className="booster-progress-bar" style={{ width: `${Math.min(100, recNew.completionPct)}%` }} />
          </div>

          <div style={{ display: 'flex', gap: '8px', marginTop: '12px' }}>
            <button
              type="button"
              onClick={() => handleOpenPack(recNew, 1)}
              disabled={openingId === recNew.packId || !recNew.canOpenNow}
              className="btn btn--primary btn--sm"
            >
              {recNew.canOpenNow ? t('openRec1Btn') : t('rechargeNotice')}
            </button>
            {recNew.canOpenNow && recNew.openableFreeCount > 1 && (
              <button
                type="button"
                onClick={() => handleOpenPack(recNew, Math.min(10, recNew.openableFreeCount))}
                disabled={openingId === recNew.packId}
                className="btn btn--ghost btn--sm"
              >
                {t('openRecMaxBtn', { n: Math.min(10, recNew.openableFreeCount) })}
              </button>
            )}
          </div>
        </div>
      )}

      {/* Recommended EV Card */}
      {recEv && (
        <div className="card card--sub" style={{ marginTop: '12px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <span className="kanji-box kanji-box--sm kanji-box--gold" aria-hidden="true">金</span>
            <span className="badge">RECOMMANDÉ CHAKRA</span>
          </div>
          <h3 className="card__title" style={{ marginTop: '6px' }}>
            {recEv.name} · EV ~{recEv.expectedChakraValue} ◆ / booster
          </h3>
          <p className="card__desc">
            Manquants : {recEv.totalMissing} · P(≥1 nouv.) : {recEv.probAtLeastOneNewPct}%
          </p>
          {/* 3px Booster Completion Progress Bar */}
          <div className="booster-progress-track">
            <div className="booster-progress-bar" style={{ width: `${Math.min(100, recEv.completionPct)}%` }} />
          </div>
        </div>
      )}

      {/* All Packs Table */}
      <div className="card card--sub" style={{ marginTop: '16px' }}>
        <div className="card__header">
          <h3 className="card__title">{t('allPacksTitle')}</h3>
          <span className="mono-badge">{(boosters?.all || []).length}</span>
        </div>
        <div className="table-wrapper">
          {(!boosters?.all || boosters.all.length === 0) ? (
            <div className="empty-state-box">
              <span className="empty-state-box__icon">札</span>
              <p className="empty-state-box__text">Aucun booster disponible pour le moment.</p>
            </div>
          ) : (
            <table className="data-table data-table--boosters">
              <thead>
                <tr>
                  <th>{t('thPack')}</th>
                  <th className="num">{t('thCompletion')}</th>
                  <th className="num">{t('thProbNew')}</th>
                  <th className="num">{t('thExpectedNew')}</th>
                  <th className="num">{t('thExpectedChakra')}</th>
                  <th>{t('thLive')}</th>
                </tr>
              </thead>
              <tbody>
                {boosters.all.map((p, idx) => {
                  const isTop = idx === 0 && p.totalMissing > 0;
                  return (
                    <tr key={p.packId}>
                      <td>
                        <strong>{isTop ? '★ ' : ''}{p.name}</strong>
                        <span className="sub-meta">Prêts: {p.openableFreeCount}</span>
                        <div className="booster-progress-track">
                          <div className="booster-progress-bar" style={{ width: `${Math.min(100, p.completionPct)}%` }} />
                        </div>
                      </td>
                      <td className="num">
                        <strong>{p.completionPct}%</strong>
                        <span className="sub-meta">{p.totalMissing} / {p.totalPool}</span>
                      </td>
                      <td className="num"><strong>{p.probAtLeastOneNewPct}%</strong></td>
                      <td className="num">{p.expectedNewCards}</td>
                      <td className="num">{p.expectedChakraValue} ◆</td>
                      <td>
                        <button
                          type="button"
                          onClick={() => handleOpenPack(p, 1)}
                          disabled={!p.canOpenNow || openingId === p.packId}
                          className="btn btn--primary btn--xs"
                        >
                          Ouvrir
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </section>
  );
};
