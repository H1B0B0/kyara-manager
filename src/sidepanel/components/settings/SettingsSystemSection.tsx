import React from 'react';
import type { KyaraSettings } from '../../../types/settings';
import { UpdateNotice } from '../UpdateNotice';

export interface SettingsSystemSectionProps {
  form: KyaraSettings;
  fileInputRef: React.RefObject<HTMLInputElement | null>;
  onChange: <K extends keyof KyaraSettings>(key: K, value: KyaraSettings[K]) => void;
  onExportBackup: () => void;
  onImportBackup: (e: React.ChangeEvent<HTMLInputElement>) => void;
}

export const SettingsSystemSection: React.FC<SettingsSystemSectionProps> = ({
  form,
  fileInputRef,
  onChange,
  onExportBackup,
  onImportBackup
}) => (
  <>
    <div className="card card--compact">
      <h3 className="card__title">Simulation, Alertes &amp; Cadence</h3>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginTop: '8px' }}>
        <label className="check-row">
          <input
            type="checkbox"
            checked={Boolean(form.dryRun)}
            onChange={(e) => onChange('dryRun', e.target.checked)}
          />
          <span>Mode Simulation (aucune vente, aucun achat ni recyclage réel envoyé à Kyara)</span>
        </label>

        <label className="check-row">
          <input
            type="checkbox"
            checked={form.notificationsEnabled !== false}
            onChange={(e) => onChange('notificationsEnabled', e.target.checked)}
          />
          <span>Notifications bureau (snipes marché, ventes confirmées, tirages L/M)</span>
        </label>

        <div className="field-row">
          <label htmlFor="km-set-loop" className="form-label">Intervalle du cycle auto (sec)</label>
          <input
            id="km-set-loop"
            type="number"
            min={30}
            max={3600}
            value={form.loopIntervalSec ?? 60}
            onChange={(e) => onChange('loopIntervalSec', Number(e.target.value))}
            className="input input--num"
          />
        </div>
      </div>
    </div>

    <fieldset className="settings-group">
      <legend className="settings-group__legend">Sauvegarde &amp; Profil (JSON)</legend>
      <p className="form-hint" style={{ margin: 0 }}>
        Exportez ou restaurez vos réglages, votre wishlist et vos cartes protégées.
      </p>
      <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
        <button type="button" onClick={onExportBackup} className="btn btn--ghost" style={{ flex: 1 }}>
          Exporter la config
        </button>
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          className="btn btn--ghost"
          style={{ flex: 1 }}
        >
          Importer un fichier
        </button>
        <input
          ref={fileInputRef}
          type="file"
          accept="application/json"
          style={{ display: 'none' }}
          aria-label="Importer un fichier de configuration JSON"
          onChange={onImportBackup}
        />
      </div>
    </fieldset>

    <fieldset className="settings-group">
      <legend className="settings-group__legend">Système &amp; Mises à jour</legend>
      <UpdateNotice alwaysShow />
    </fieldset>
  </>
);
