import React, { useEffect, useMemo, useRef, useState } from 'react';
import type { BuyOrderOpportunity } from '../../../types/kyara';
import type { KyaraSettings } from '../../../types/settings';
import { RarityPill } from '../common/RarityPill';
import { sendCommand } from '../../hooks/useDashboard';

export interface BuyOrdersPanelProps {
  userChakra: number;
  settings: KyaraSettings;
  onUpdateSettings: (partial: Partial<KyaraSettings>) => void;
  onToast: (msg: string) => void;
  onRefresh: () => void;
}

const DISCOUNT_PRESETS = [15, 25, 35];
const SOURCE_LABELS: Record<BuyOrderOpportunity['source'], string> = {
  wishlist: 'Envie', renaissance: 'Renaissance', series: 'Série'
};

const ScanIcon: React.FC = () => (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <polyline points="23 4 23 10 17 10" /><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10" />
  </svg>
);

const ExternalIcon: React.FC = () => (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
    <polyline points="15 3 21 3 21 9" /><line x1="10" y1="14" x2="21" y2="3" />
  </svg>
);

export const BuyOrdersPanel: React.FC<BuyOrdersPanelProps> = ({
  userChakra, settings, onUpdateSettings, onToast, onRefresh
}) => {
  const [opportunities, setOpportunities] = useState<BuyOrderOpportunity[]>([]);
  const [scanning, setScanning] = useState(false);
  const [placingId, setPlacingId] = useState<number | null>(null);
  const [placingBatch, setPlacingBatch] = useState(false);

  const settingsDiscount = settings.buyOrderDiscountPct ?? 25;
  const [discountPct, setDiscountPct] = useState(settingsDiscount);
  const sliderTimerRef = useRef<number | null>(null);
  useEffect(() => { setDiscountPct(settingsDiscount); }, [settingsDiscount]);
  const commitDiscount = (val: number) => {
    if (sliderTimerRef.current) window.clearTimeout(sliderTimerRef.current);
    onUpdateSettings({ buyOrderDiscountPct: val });
  };
  const totalBidCost = useMemo(() => opportunities.reduce((sum, op) => sum + (op.suggestedBid || 0), 0), [opportunities]);

  const handleScan = async () => {
    setScanning(true);
    onToast(`Scan des ordres d'achat (-${discountPct}%)…`);
    try {
      const res = await (sendCommand({ type: 'km:cmd:scan-buy-orders', discountPct } as any) as Promise<any>);
      if (res?.ok) {
        const list = Array.isArray(res.opportunities) ? (res.opportunities as BuyOrderOpportunity[]) : [];
        setOpportunities(list);
        onToast(list.length > 0 ? `${list.length} offre(s) passive(s) prête(s)` : 'Aucune offre passive trouvée sous cette remise.');
      } else onToast(res?.error || 'Impossible de scanner les ordres d’achat');
    } finally { setScanning(false); }
  };

  const handlePlaceSingle = async (op: BuyOrderOpportunity) => {
    setPlacingId(op.characterId);
    try {
      const res = await (sendCommand({
        type: 'km:cmd:place-buy-order', characterId: op.characterId, price: op.suggestedBid, name: op.name
      } as any) as Promise<any>);
      if (res?.ok) {
        setOpportunities((prev) => prev.filter((item) => item.characterId !== op.characterId));
        onToast(`Ordre placé : ${op.name} à ${op.suggestedBid} ◆`);
        onRefresh();
      } else onToast(res?.error || "Erreur lors du placement de l'ordre");
    } finally { setPlacingId(null); }
  };

  const handlePlaceBatch = async () => {
    if (opportunities.length === 0) return;
    setPlacingBatch(true);
    try {
      const res = await (sendCommand({
        type: 'km:cmd:place-batch-buy-orders',
        orders: opportunities.map((op) => ({ characterId: op.characterId, price: op.suggestedBid, name: op.name }))
      } as any) as Promise<any>);
      if (res?.ok) {
        const placedCount = res.result?.placedCount ?? res.placedCount ?? opportunities.length;
        const totalLocked = res.result?.totalLocked ?? res.totalLocked ?? totalBidCost;
        setOpportunities([]);
        onToast(`${placedCount} ordre(s) d'achat placé(s) (${totalLocked} ◆)`);
        onRefresh();
      } else onToast(res?.error || 'Erreur lors du placement groupé');
    } finally { setPlacingBatch(false); }
  };

  return (
    <div className="card card--compact buy-orders-panel">
      <div className="card__header">
        <div className="tile-head tile-head--sm">
          <span className="kanji-box kanji-box--sm kanji-box--purple" aria-hidden="true">註</span>
          <div>
            <h2 className="card__title">Ordres d&apos;Achat Passifs</h2>
            <p className="card__desc">Pose tes offres sous la médiane sans ouvrir chaque fiche /wiki.</p>
          </div>
        </div>
        <span className="mono-badge bo-balance-badge">{new Intl.NumberFormat('fr-FR').format(userChakra)} ◆</span>
      </div>

      <div className="bo-controls">
        <div className="bo-controls__top">
          <div className="capsule-pills bo-pills" role="group" aria-label="Remise cible">
            {DISCOUNT_PRESETS.map((pct) => (
              <button
                key={pct} type="button" onClick={() => onUpdateSettings({ buyOrderDiscountPct: pct })}
                className={`capsule-pill capsule-pill--xs ${discountPct === pct ? 'is-active' : ''}`}
              >
                -{pct}%
              </button>
            ))}
          </div>
          <button type="button" onClick={handleScan} disabled={scanning || placingBatch} className="btn btn--primary btn--sm bo-scan-btn">
            <ScanIcon />
            <span>{scanning ? 'Scan…' : 'Scanner'}</span>
          </button>
        </div>

        <div className="bo-controls__slider-row">
          <span className="bo-slider-label">Remise</span>
          <input
            type="range" min={10} max={60} step={1} value={discountPct}
            onChange={(e) => {
              const v = Number(e.target.value);
              setDiscountPct(v);
              if (sliderTimerRef.current) window.clearTimeout(sliderTimerRef.current);
              sliderTimerRef.current = window.setTimeout(() => onUpdateSettings({ buyOrderDiscountPct: v }), 280);
            }}
            onPointerUp={(e) => commitDiscount(Number((e.target as HTMLInputElement).value))}
            onBlur={(e) => commitDiscount(Number(e.target.value))}
            className="bo-slider" aria-label="Pourcentage de remise personnalisé"
          />
          <span className="bo-discount-val font-mono">-{discountPct}%</span>
        </div>
      </div>

      {opportunities.length === 0 ? (
        <div className="empty-state-box">
          <span className="empty-state-box__icon">註</span>
          <strong className="empty-state-box__title">Aucune offre passive scannée</strong>
          <p className="empty-state-box__text">
            Choisis une remise et clique sur Scanner pour repérer tes cibles Envie, Renaissance et Séries.
          </p>
        </div>
      ) : (
        <>
          <div className="bo-list">
            {opportunities.map((op) => (
              <div key={op.characterId} className="bo-row">
                <div className="bo-row__head">
                  <div className="bo-row__identity">
                    <RarityPill rarity={op.rarity} />
                    <strong className="bo-row__name">{op.name}</strong>
                  </div>
                  <span className={`bo-source-pill bo-source-pill--${op.source}`}>{SOURCE_LABELS[op.source]}</span>
                </div>

                <div className="bo-metrics font-mono">
                  <span>Médiane {op.median7d ?? '—'} ◆</span>
                  <span>Offre max {op.bestExistingBid ?? '—'} ◆</span>
                  <span className="bo-metrics__bid">→ {op.suggestedBid} ◆ (-{op.savingsPct}%)</span>
                </div>

                <div className="bo-actions">
                  <button
                    type="button" className="btn btn--primary btn--xs"
                    disabled={placingId === op.characterId || placingBatch} onClick={() => handlePlaceSingle(op)}
                  >
                    {placingId === op.characterId ? 'Envoi…' : `Placer (${op.suggestedBid} ◆)`}
                  </button>
                  <button
                    type="button" className="btn btn--ghost btn--xs"
                    onClick={() => void chrome.tabs?.create({ url: `https://kyara.games/wiki/${op.characterId}` })}
                    title={`Ouvrir /wiki/${op.characterId}`} aria-label={`Ouvrir la fiche wiki de ${op.name}`}
                  >
                    <ExternalIcon />
                    <span>Wiki</span>
                  </button>
                </div>
              </div>
            ))}
          </div>

          <button
            type="button" className="btn btn--primary btn--sm bo-batch-btn"
            disabled={placingBatch || totalBidCost > userChakra} onClick={handlePlaceBatch}
          >
            {placingBatch ? 'Placement du lot…' : `Placer tout le lot (${opportunities.length} · ${new Intl.NumberFormat('fr-FR').format(totalBidCost)} ◆)`}
          </button>
        </>
      )}
    </div>
  );
};
