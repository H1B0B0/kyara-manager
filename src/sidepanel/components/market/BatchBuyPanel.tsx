import React, { useEffect, useMemo, useState } from 'react';
import type { BatchMissingPreview, Rarity } from '../../../types/kyara';
import type { KyaraSettings } from '../../../types/settings';
import { RarityPill } from '../common/RarityPill';
import { sendCommand } from '../../hooks/useDashboard';

export interface BatchBuyPanelProps {
  userChakra: number;
  settings: KyaraSettings;
  initialRarity?: Rarity | 'RENAISSANCE';
  initialQty?: number;
  onToast: (msg: string) => void;
  onRefresh: () => void;
}

const DEFAULT_MAX_PRICES: Record<Rarity, number> = { C: 3, U: 4, R: 6, E: 18, L: 90, M: 500 };

const RARITY_OPTIONS: Array<{ value: Rarity | 'RENAISSANCE'; label: string }> = [
  { value: 'RENAISSANCE', label: 'Focus' }, { value: 'C', label: 'C' }, { value: 'U', label: 'U' },
  { value: 'R', label: 'R' }, { value: 'E', label: 'E' }, { value: 'L', label: 'L' }
];

const QTY_PRESETS = [10, 25, 50, 100];

const getDefaultMaxPrice = (target: Rarity | 'RENAISSANCE', settings: KyaraSettings): number => {
  const map = settings.batchBuyDefaultMaxPrice || {};
  if (target === 'RENAISSANCE') {
    const focus = settings.renaissanceTargetRarities || ['C', 'U', 'R'];
    const prices = focus.map((r) => map[r] ?? DEFAULT_MAX_PRICES[r]);
    return prices.length > 0 ? Math.max(...prices) : 6;
  }
  return map[target] ?? DEFAULT_MAX_PRICES[target];
};

const SearchIcon: React.FC = () => (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
  </svg>
);

const BagIcon: React.FC = () => (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M6 2L3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z" />
    <line x1="3" y1="6" x2="21" y2="6" /><path d="M16 10a4 4 0 0 1-8 0" />
  </svg>
);

export const BatchBuyPanel: React.FC<BatchBuyPanelProps> = ({
  userChakra, settings, initialRarity, initialQty, onToast, onRefresh
}) => {
  const [rarity, setRarity] = useState<Rarity | 'RENAISSANCE'>(initialRarity || 'RENAISSANCE');
  const [qty, setQty] = useState<number>(initialQty || 25);
  const [maxUnitPrice, setMaxUnitPrice] = useState<number>(() => getDefaultMaxPrice(initialRarity || 'RENAISSANCE', settings));
  const [maxTotalBudget, setMaxTotalBudget] = useState<string>('');
  const [preview, setPreview] = useState<BatchMissingPreview | null>(null);
  const [previewing, setPreviewing] = useState(false);
  const [buying, setBuying] = useState(false);

  useEffect(() => {
    if (initialRarity) {
      setRarity(initialRarity);
      setMaxUnitPrice(getDefaultMaxPrice(initialRarity, settings));
      setPreview(null);
    }
    if (initialQty !== undefined) {
      setQty(Math.max(1, Math.min(150, initialQty)));
      setPreview(null);
    }
  }, [initialRarity, initialQty]);

  const minReserve = settings.autoBuyMinChakraReserve ?? settings.autoMarketReserveChakra ?? 200;
  const spendable = Math.max(0, userChakra - minReserve);

  const parsedBudget = useMemo(() => {
    const num = Number(maxTotalBudget.trim());
    return maxTotalBudget.trim() && Number.isFinite(num) && num > 0 ? Math.floor(num) : undefined;
  }, [maxTotalBudget]);

  const handleSelectRarity = (next: Rarity | 'RENAISSANCE') => {
    setRarity(next);
    setMaxUnitPrice(getDefaultMaxPrice(next, settings));
    setPreview(null);
  };

  const handlePreview = async () => {
    setPreviewing(true);
    try {
      const res = await (sendCommand({ type: 'km:cmd:preview-batch-buy', rarity, maxUnitPrice, qty, maxTotalBudget: parsedBudget } as any) as Promise<any>);
      if (res?.ok && res.preview) {
        setPreview(res.preview as BatchMissingPreview);
        if (res.preview.totalFound === 0) onToast('Aucune carte manquante trouvée sous ce prix max.');
      } else onToast(res?.error || 'Erreur lors de la prévisualisation du lot');
    } finally { setPreviewing(false); }
  };

  const handleExecute = async () => {
    setBuying(true);
    onToast('Exécution de l’achat par lot en cours…');
    try {
      const res = await (sendCommand({
        type: 'km:cmd:execute-batch-buy', rarity, maxUnitPrice, qty, maxTotalBudget: parsedBudget,
        listingIds: preview?.items.map((item) => item.listingId)
      } as any) as Promise<any>);
      if (res?.ok) {
        onToast(`Lot acheté : ${res.boughtCount ?? preview?.items.length ?? 0} carte(s) manquante(s) pour ${res.totalSpent ?? preview?.totalCost ?? 0} ◆`);
        setPreview(null);
        onRefresh();
      } else onToast(res?.error || "Erreur lors de l'achat par lot");
    } finally { setBuying(false); }
  };

  const canBuy = !buying && !previewing && (preview ? preview.items.length > 0 : qty > 0);

  return (
    <div className="card card--compact batch-buy-panel">
      <div className="card__header">
        <div className="tile-head">
          <span className="kanji-box kanji-box--gold" aria-hidden="true">買</span>
          <div>
            <h2 className="card__title">Achat par Lot (Manquantes)</h2>
            <p className="card__desc">Achète uniquement des cartes que tu ne possèdes pas (0 doublon).</p>
          </div>
        </div>
      </div>

      <div className="batch-section">
        <span className="batch-label">Rareté cible</span>
        <div className="capsule-pills batch-pills">
          {RARITY_OPTIONS.map((opt) => (
            <button key={opt.value} type="button" onClick={() => handleSelectRarity(opt.value)} className={`capsule-pill ${rarity === opt.value ? 'is-active' : ''}`}>
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      <div className="batch-section">
        <div className="batch-qty-row">
          <span className="batch-label">Quantité</span>
          <div className="batch-qty-controls">
            <div className="capsule-pills batch-pills batch-pills--inline">
              {QTY_PRESETS.map((preset) => (
                <button key={preset} type="button" onClick={() => { setQty(preset); setPreview(null); }} className={`capsule-pill ${qty === preset ? 'is-active' : ''}`}>
                  {preset}
                </button>
              ))}
            </div>
            <input
              type="number" min={1} max={150} value={qty}
              onChange={(e) => { setQty(Math.max(1, Math.min(150, Number(e.target.value) || 1))); setPreview(null); }}
              className="input input--num batch-qty-input" aria-label="Quantité personnalisée"
            />
          </div>
        </div>
      </div>

      <div className="batch-inputs-row">
        <label className="batch-field">
          <span className="batch-label">Prix max / carte (◆)</span>
          <input
            type="number" min={1} max={5000} value={maxUnitPrice}
            onChange={(e) => { setMaxUnitPrice(Math.max(1, Number(e.target.value) || 1)); setPreview(null); }}
            className="input input--num batch-field__input"
          />
        </label>
        <label className="batch-field">
          <span className="batch-label">Budget max (◆, optionnel)</span>
          <input
            type="number" min={1} max={999999} placeholder="Illimité" value={maxTotalBudget}
            onChange={(e) => { setMaxTotalBudget(e.target.value); setPreview(null); }}
            className="input input--num batch-field__input"
          />
        </label>
      </div>

      <div className="batch-budget-info font-mono">
        Solde : <strong>{userChakra} ◆</strong> · Réserve protégée : {minReserve} ◆ · Disponible :{' '}
        <strong className={spendable > 0 ? 'text-gain' : ''}>{spendable} ◆</strong>
      </div>

      <div className="batch-actions">
        <button type="button" onClick={handlePreview} disabled={previewing || buying} className="btn btn--ghost btn--sm">
          <SearchIcon />
          <span>{previewing ? 'Recherche…' : 'Prévisualiser le lot'}</span>
        </button>
        <button type="button" onClick={handleExecute} disabled={!canBuy} className="btn btn--primary btn--sm">
          <BagIcon />
          <span>{buying ? 'Achat…' : preview ? `Acheter (${preview.items.length} · ${preview.totalCost} ◆)` : `Acheter (×${qty})`}</span>
        </button>
      </div>

      {preview && (
        <div className="batch-preview-box">
          <div className="batch-preview-summary font-mono">
            <span>{preview.totalFound} trouvée(s)</span>
            <span>Total : <strong>{preview.totalCost} ◆</strong></span>
            <span>Moy. : {preview.avgPrice} ◆/carte</span>
          </div>
          {preview.items.length === 0 ? (
            <p className="batch-preview-empty">Aucune carte manquante disponible dans ces critères.</p>
          ) : (
            <div className="batch-preview-list">
              {preview.items.map((item) => (
                <div key={item.listingId} className="batch-preview-row">
                  <div className="batch-preview-row__main">
                    <RarityPill rarity={item.rarity} />
                    <div className="batch-preview-row__text">
                      <strong className="batch-preview-row__name">{item.name}</strong>
                      <span className="batch-preview-row__series">{item.series}</span>
                    </div>
                  </div>
                  <span className="batch-preview-row__price font-mono">{item.price} ◆</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
};
