import React, { useRef, useState } from 'react';
import type { KyaraSettings, Language, PricingStrategy } from '../../../types/settings';
import { DEFAULT_SETTINGS } from '../../../types/settings';
import { t } from '../../../lib/i18n';

export interface SettingsTabProps {
  settings: KyaraSettings;
  onUpdateSettings: (partial: Partial<KyaraSettings>) => Promise<void>;
  onToast: (msg: string) => void;
}

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
              <option value="fr">Français 🇫🇷</option>
              <option value="en">English 🇬🇧</option>
              <option value="es">Español 🇪🇸</option>
            </select>
          </div>
        </div>

        {/* Pricing Strategy */}
        <div className="card card--compact">
          <h3 className="card__title">Stratégie de Vente & Anti-Krach</h3>

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

        {/* Turbo Liquidity */}
        <div className="card card--compact">
          <h3 className="card__title">⚡ Mode Turbo Liquidité</h3>
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
          <h3 className="card__title">Mes Envies & Marché</h3>

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
