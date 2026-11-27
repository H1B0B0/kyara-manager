import React, { useCallback, useEffect, useState } from 'react';
import { Moon, Plus, Trash2, Download, Pause, Play, RefreshCw, Pencil } from 'lucide-react';
import type { AccountMode, DesktopStatePayload, ViewportBounds } from '../shared/types';
import { SilentDashboard } from './SilentDashboard';
import { HybridViewport } from './HybridViewport';

declare global {
  interface Window {
    kyaraDesktop: {
      getState: () => Promise<DesktopStatePayload>;
      createAccount: (name: string) => Promise<any>;
      updateAccount: (id: string, patch: { name?: string; mode?: AccountMode }) => Promise<any>;
      deleteAccount: (id: string) => Promise<boolean>;
      selectAccount: (id: string) => Promise<void>;
      updateConfig: (patch: any) => Promise<any>;
      patchAccountSettings: (accountId: string, patch: Record<string, any>) => Promise<void>;
      sendAccountCommand: (accountId: string, command: Record<string, any>) => Promise<any>;
      reloadAccount: (accountId: string) => Promise<void>;
      pauseAllAccounts: () => Promise<void>;
      resumeAllAccounts: () => Promise<void>;
      setViewportBounds: (bounds: ViewportBounds | null) => Promise<void>;
      checkUpdates: () => Promise<any>;
      installUpdateNow: () => Promise<any>;
      onStateChanged: (cb: (payload: DesktopStatePayload) => void) => () => void;
      onUpdaterChanged: (cb: (status: any) => void) => () => void;
    };
  }
}

export const App: React.FC = () => {
  const [data, setData] = useState<DesktopStatePayload | null>(null);
  const [showAddModal, setShowAddModal] = useState(false);
  const [newAccName, setNewAccName] = useState('');
  const [renamingAcc, setRenamingAcc] = useState<{ id: string; name: string } | null>(null);

  useEffect(() => {
    const api = window.kyaraDesktop;
    if (!api) return;
    void api.getState().then(setData);
    const unsubState = api.onStateChanged(setData);
    const unsubUpd = api.onUpdaterChanged((updater) => {
      setData((prev) => (prev ? { ...prev, updater } : prev));
    });
    return () => {
      unsubState();
      unsubUpd();
    };
  }, []);

  const setBounds = useCallback((b: ViewportBounds | null) => {
    void window.kyaraDesktop?.setViewportBounds(b);
  }, []);

  if (!data) {
    return <div className="desktop-shell" style={{ padding: 24 }}>Chargement de Kyara Manager Desktop…</div>;
  }

  const selected =
    data.accounts.find((a) => a.account.id === data.config.selectedAccountId) || data.accounts[0];
  const updater = data.updater;
  const activeCount = data.accounts.filter((a) => a.settings?.masterEnabled && a.account.mode !== 'manual').length;

  const handleAddAccount = async (e: React.FormEvent) => {
    e.preventDefault();
    const label = newAccName.trim() || `Compte ${data.accounts.length + 1}`;
    await window.kyaraDesktop.createAccount(label);
    setNewAccName('');
    setShowAddModal(false);
  };

  return (
    <div className="desktop-shell">
      <header className="topbar">
        <div className="topbar__brand">
          <span>Kyara Manager Desktop</span>
          <span className="topbar__badge">v{data.appVersion}</span>
          <span className="pill">{activeCount}/{data.accounts.length} actif(s)</span>
        </div>

        <div className="topbar__controls">
          <button
            className={`pill ${data.config.preventSleep ? 'pill--ok' : ''}`}
            onClick={() => void window.kyaraDesktop.updateConfig({ preventSleep: !data.config.preventSleep })}
            title="Empêche macOS / Windows de mettre l'app en veille pendant la nuit"
          >
            <Moon size={13} /> Anti-Veille Nuit : {data.config.preventSleep ? 'ON' : 'OFF'}
          </button>

          <button className="btn btn--sm" onClick={() => void window.kyaraDesktop.resumeAllAccounts()}>
            <Play size={12} /> Tout activer
          </button>
          <button className="btn btn--sm" onClick={() => void window.kyaraDesktop.pauseAllAccounts()}>
            <Pause size={12} /> Tout pauser
          </button>

          {updater.status === 'downloaded' || updater.status === 'waiting' ? (
            <button
              className="pill pill--warn"
              onClick={() => void window.kyaraDesktop.installUpdateNow()}
              title={updater.message}
            >
              <Download size={13} /> MÀJ v{updater.availableVersion} prête
            </button>
          ) : (
            <button
              className="pill"
              onClick={() => void window.kyaraDesktop.checkUpdates()}
              title={updater.message || 'Vérifier les mises à jour automatiques sur GitHub Releases'}
            >
              <RefreshCw size={12} />
              {updater.status === 'downloading'
                ? `MÀJ ${updater.progressPct ?? 0}%`
                : updater.status === 'checking'
                  ? 'Vérification…'
                  : 'MÀJ Auto'}
            </button>
          )}
        </div>
      </header>

      <div className="workspace">
        <aside className="rail">
          <div className="rail__head">
            <span>Comptes ({data.accounts.length})</span>
            <button className="btn btn--sm btn--primary" onClick={() => setShowAddModal(true)}>
              <Plus size={12} /> Ajouter
            </button>
          </div>

          <div className="rail__list">
            {data.accounts.map((snap) => {
              const { account, settings, dashboard } = snap;
              const isSel = selected?.account.id === account.id;
              return (
                <div
                  key={account.id}
                  role="button"
                  tabIndex={0}
                  className={`acc-item ${isSel ? 'is-selected' : ''}`}
                  onClick={() => void window.kyaraDesktop.selectAccount(account.id)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') void window.kyaraDesktop.selectAccount(account.id);
                  }}
                >
                  <div className="acc-item__row">
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 0 }}>
                      <span className={`status-dot ${snap.needsLogin ? 'login' : settings.masterEnabled ? 'on' : ''}`} />
                      <span className="acc-item__name">{account.name}</span>
                    </div>
                    <div style={{ display: 'flex', gap: 4 }}>
                      <button
                        className="btn btn--sm"
                        title="Renommer ce compte"
                        onClick={(e) => {
                          e.stopPropagation();
                          setRenamingAcc({ id: account.id, name: account.name });
                        }}
                      >
                        <Pencil size={11} />
                      </button>
                      {data.accounts.length > 1 && (
                        <button
                          className="btn btn--sm btn--danger"
                          title="Supprimer ce compte"
                          onClick={(e) => {
                            e.stopPropagation();
                            void window.kyaraDesktop.deleteAccount(account.id);
                          }}
                        >
                          <Trash2 size={11} />
                        </button>
                      )}
                    </div>
                  </div>
                  <div className="acc-item__meta">
                    <span className={`tag tag--${account.mode}`}>
                      {account.mode === 'silent' ? 'Silencieux' : account.mode === 'hybrid' ? 'Hybride' : 'Manuel'}
                    </span>
                    <span>{snap.needsLogin ? 'À connecter' : dashboard?.me?.chakra !== undefined ? `${dashboard.me.chakra} ◆` : 'Chargement…'}</span>
                  </div>
                </div>
              );
            })}
          </div>
        </aside>

        <main className="main-area">
          {selected && selected.account.mode !== 'silent' ? (
            <HybridViewport
              snapshot={selected}
              modalOpen={showAddModal || Boolean(renamingAcc)}
              onChangeMode={(id, mode) => void window.kyaraDesktop.updateAccount(id, { mode })}
              onReload={(id) => void window.kyaraDesktop.reloadAccount(id)}
              onBounds={setBounds}
            />
          ) : (
            <SilentDashboard
              accounts={data.accounts}
              selectedAccountId={selected?.account.id || null}
              onSelectAccount={(id) => void window.kyaraDesktop.selectAccount(id)}
              onChangeMode={(id, mode) => void window.kyaraDesktop.updateAccount(id, { mode })}
              onPatchSettings={(id, patch) => void window.kyaraDesktop.patchAccountSettings(id, patch)}
              onSendCommand={(id, cmd) => void window.kyaraDesktop.sendAccountCommand(id, cmd)}
            />
          )}
        </main>
      </div>

      {showAddModal && (
        <div className="modal-backdrop" onClick={() => setShowAddModal(false)}>
          <form className="modal-card" onSubmit={(e) => void handleAddAccount(e)} onClick={(e) => e.stopPropagation()}>
            <h3 style={{ margin: 0 }}>Nouveau compte Kyara</h3>
            <p style={{ margin: 0, color: 'var(--muted)', fontSize: 12 }}>
              Chaque compte dispose de sa session persistante totalement isolée et de ses propres réglages.
            </p>
            <input
              className="input"
              autoFocus
              placeholder={`Ex. Compte ${data.accounts.length + 1}`}
              value={newAccName}
              onChange={(e) => setNewAccName(e.target.value)}
            />
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
              <button type="button" className="btn" onClick={() => setShowAddModal(false)}>Annuler</button>
              <button type="submit" className="btn btn--primary">Créer le compte</button>
            </div>
          </form>
        </div>
      )}
      {renamingAcc && (
        <div className="modal-backdrop" onClick={() => setRenamingAcc(null)}>
          <form
            className="modal-card"
            onSubmit={(e) => {
              e.preventDefault();
              if (renamingAcc.name.trim()) {
                void window.kyaraDesktop.updateAccount(renamingAcc.id, { name: renamingAcc.name.trim() });
              }
              setRenamingAcc(null);
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <h3 style={{ margin: 0 }}>Renommer le compte</h3>
            <input
              className="input"
              autoFocus
              value={renamingAcc.name}
              onChange={(e) => setRenamingAcc({ ...renamingAcc, name: e.target.value })}
            />
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
              <button type="button" className="btn" onClick={() => setRenamingAcc(null)}>Annuler</button>
              <button type="submit" className="btn btn--primary">Enregistrer</button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
};
