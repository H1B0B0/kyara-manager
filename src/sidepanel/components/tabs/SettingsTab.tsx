import React, { useRef, useState } from 'react';
import type { KyaraSettings, Language, PricingStrategy, SellMode } from '../../../types/settings';
import { DEFAULT_SETTINGS } from '../../../types/settings';
import { t } from '../../../lib/i18n';

export interface SettingsTabProps {
  settings: KyaraSettings;
  onUpdateSettings: (partial: Partial<KyaraSettings>) => Promise<void>;
  onToast: (msg: string) => void;
}

const BoltIcon: React.FC = () => (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={{ color: 'var(--acc)', marginRight: '6px' }}>
    <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
  </svg>
);

export const SettingsTab: React.FC<SettingsTabProps> = ({ settings, onUpdateSettings, onToast }) => {
  const [form, setForm] = useState<KyaraSettings>(settings);
  const edits = useRef<Partial<KyaraSettings>>({});

  React.useEffect(() => {
    setForm({ ...settings, ...edits.current });
  }, [settings]);

  const handleChange = <K extends keyof KyaraSettings>(key: K, value: KyaraSettings[K]) => {
    edits.current[key] = value;
    setForm((prev) => ({ ...prev, [key]: value }));
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await onUpdateSettings(edits.current);
      edits.current = {};
      onToast(t('toastSettingsSaved'));
    } catch (err: any) { onToast(err.message); }
  };

  const handleResetDefaults = async () => {
    setForm(DEFAULT_SETTINGS);
    edits.current = {};
    try {
      await onUpdateSettings(DEFAULT_SETTINGS);
      onToast(t('toastSettingsReset'));
    } catch (err: any) { onToast(err.message); }
  };

  return (
    <section className="tab-panel is-active">
      <form onSubmit={handleSave} className="settings-form">
        {/* Language */}
        <div className="card card--compact">
          <div className="form-group">
            <label className="form-label">{t('optLangTitle')}</label>
            <p className="form-hint">{t('optLangDesc')}</p>
            <select
              value={form.language}
              onChange={(e) => handleChange('language', e.target.value as Language)}
              className="select"
            >
              <option value="fr">FR — Français</option>
              <option value="en">EN — English</option>
              <option value="es">ES — Español</option>
            </select>
          </div>
        </div>

        {/* Pricing Strategy */}
        <div className="card card--compact">
          <h3 className="card__title">Stratégie de Vente &amp; Anti-Krach</h3>

          <div className="form-group" style={{ marginTop: '8px' }}>
            <label className="form-label">Stratégie de tarification</label>
            <select
              value={form.autoSellStrategy}
              onChange={(e) => handleChange('autoSellStrategy', e.target.value as PricingStrategy)}
              className="select"
            >
              <option value="recent20_median">Médiane des 20 offres live (Recommandé - Anti-krach)</option>
              <option value="recent20_avg">Moyenne des 20 offres live</option>
              <option value="flash">Vente Flash (Lowest - 1 ◆)</option>
              <option value="quick">Rapide standard (Undercut - 1 ◆)</option>
              <option value="balanced">Équilibrée (Médiane 7j)</option>
              <option value="max">Maximiser le prix (Haut de fourchette)</option>
            </select>
          </div>

          <label className="check-row" style={{ marginTop: '8px' }}>
            <input
              type="checkbox"
              checked={form.autoSellCrashProtection}
              onChange={(e) => handleChange('autoSellCrashProtection', e.target.checked)}
            />
            <span>Protection Krach Live (débraye le garde-fou 70% si krach détecté)</span>
          </label>
        </div>

        {/* Sell pace */}
        <div className="card card--compact">
          <h3 className="card__title" style={{ display: 'flex', alignItems: 'center' }}>
            <BoltIcon /> Rythme de vente
          </h3>
          <p className="form-hint">
            Le marché n'a que 10 créneaux : plus une carte reste en vente, moins le stock s'écoule. Le mode adaptatif vend vite les
            cartes bon marché (prix plancher, annonce relancée moins chère toutes les 30 min, recyclage si elle ne part pas) et laisse
            les cartes chères attendre un meilleur prix.
          </p>
          <div className="form-group" style={{ marginTop: '8px' }}>
            <label className="form-label">Mode</label>
            <select
              value={form.autoSellMode}
              onChange={(e) => handleChange('autoSellMode', e.target.value as SellMode)}
              className="select"
            >
              <option value="adaptive">Adaptatif (recommandé)</option>
              <option value="fast">Rapide : tout écouler au plus vite</option>
              <option value="normal">Normal : mes réglages de stratégie</option>
              <option value="patient">Patient : viser le meilleur prix</option>
            </select>
          </div>
          {form.autoSellMode === 'adaptive' && (
            <div style={{ display: 'flex', gap: '8px', marginTop: '8px' }}>
              <div className="form-group" style={{ flex: 1 }}>
                <label className="form-label">Vente rapide sous (◆)</label>
                <input
                  type="number"
                  value={form.autoSellCheapBelow}
                  onChange={(e) => handleChange('autoSellCheapBelow', Number(e.target.value))}
                  min="2"
                  max="500"
                  className="input input--num"
                />
              </div>
              <div className="form-group" style={{ flex: 1 }}>
                <label className="form-label">Vente patiente dès (◆)</label>
                <input
                  type="number"
                  value={form.autoSellPremiumAbove}
                  onChange={(e) => handleChange('autoSellPremiumAbove', Number(e.target.value))}
                  min="3"
                  max="5000"
                  className="input input--num"
                />
              </div>
            </div>
          )}
          <label className="check-row" style={{ marginTop: '8px' }}>
            <input
              type="checkbox"
              checked={form.autoSellRecycleExpired !== false}
              onChange={(e) => handleChange('autoSellRecycleExpired', e.target.checked)}
            />
            <span>Recycler une carte rapide qui ne trouve pas preneur au prix plancher</span>
          </label>
        </div>

        {/* Turbo Liquidity */}
        <div className="card card--compact">
          <h3 className="card__title" style={{ display: 'flex', alignItems: 'center' }}>
            <span className="kanji-box kanji-box--sm kanji-box--acc" style={{ marginRight: '6px' }} aria-hidden="true">速</span>
            Mode Turbo Liquidité
          </h3>
          <p className="form-hint">
            Désengorge les 10 créneaux face aux backlogs de cartes en recyclant immédiatement les cartes lentes ou à faible marge.
          </p>

          <label className="check-row" style={{ marginTop: '8px' }}>
            <input
              type="checkbox"
              checked={form.autoSellTurboLiquidity}
              onChange={(e) => handleChange('autoSellTurboLiquidity', e.target.checked)}
            />
            <span>Activer le mode Turbo Liquidité</span>
          </label>

          <div className="form-group" style={{ marginTop: '8px' }}>
            <label className="form-label">Recyclage direct si gain net de vente ≤ (◆)</label>
            <input
              type="number"
              value={form.autoSellTurboMaxNetProfit}
              onChange={(e) => handleChange('autoSellTurboMaxNetProfit', Number(e.target.value))}
              min="1"
              max="20"
              className="input input--num"
            />
          </div>
        </div>

        {/* Wishlist Auto-Buy */}
        <div className="card card--compact">
          <h3 className="card__title">Mes Envies &amp; Marché</h3>

          <label className="check-row" style={{ marginTop: '8px' }}>
            <input
              type="checkbox"
              checked={form.wishlistAutoBuyEnabled}
              onChange={(e) => handleChange('wishlistAutoBuyEnabled', e.target.checked)}
            />
            <span>Auto-achat des cartes en wishlist dès qu'une offre respecte le budget</span>
          </label>

          <label className="check-row" style={{ marginTop: '8px' }}>
            <input
              type="checkbox"
              checked={form.autoSellVelocityFirst}
              onChange={(e) => handleChange('autoSellVelocityFirst', e.target.checked)}
            />
            <span>Prioriser la vélocité de vente (ne lister que les cartes fluides)</span>
          </label>
        </div>

        {/* Actions */}
        <div style={{ display: 'flex', gap: '8px', marginTop: '16px' }}>
          <button type="submit" className="btn btn--primary" style={{ flex: 1 }}>
            {t('btnSaveSettings')}
          </button>
          <button
            type="button"
            onClick={handleResetDefaults}
            className="btn btn--ghost"
          >
            {t('btnDefaultSettings')}
          </button>
        </div>
      </form>
    </section>
  );
};
