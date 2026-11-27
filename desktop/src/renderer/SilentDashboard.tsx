import React, { useMemo, useState } from 'react';
import { Coins, Sparkles, Package, Gamepad2, ExternalLink, RefreshCw, ShieldAlert } from 'lucide-react';
import type { AccountMode, AccountSnapshot } from '../shared/types';

interface Props {
  accounts: AccountSnapshot[];
  selectedAccountId: string | null;
  onSelectAccount: (id: string) => void;
  onChangeMode: (id: string, mode: AccountMode) => void;
  onPatchSettings: (id: string, patch: Record<string, any>) => void;
  onSendCommand: (id: string, command: Record<string, any>) => void;
}

type RarityFilter = 'ALL' | 'M' | 'L' | 'E';

const rarRank: Record<string, number> = { M: 6, L: 5, E: 4, R: 3, U: 2, C: 1 };

export const SilentDashboard: React.FC<Props> = ({
  accounts,
  selectedAccountId,
  onSelectAccount,
  onChangeMode,
  onPatchSettings,
  onSendCommand
}) => {
  const [scope, setScope] = useState<'all' | 'selected'>('all');
  const [rarityFilter, setRarityFilter] = useState<RarityFilter>('ALL');

  const scoped = useMemo(() => {
    if (scope === 'selected' && selectedAccountId) {
      return accounts.filter((a) => a.account.id === selectedAccountId);
    }
    return accounts;
  }, [accounts, scope, selectedAccountId]);

  const totals = useMemo(() => {
    let chakra = 0;
    let generated = 0;
    let sold = 0;
    let boosters = 0;
    let tickets = 0;
    for (const s of scoped) {
      chakra += Number(s.dashboard?.me?.chakra || 0);
      const stats = s.cumulativeStats || s.dashboard?.cumulativeStats || {};
      generated += Number(stats.chakraFromSales || 0) + Number(stats.chakraFromRecycle || 0);
      sold += Number(stats.cardsSold || 0);
      boosters += Number(s.dashboard?.me?.freeBoosters || 0);
      tickets += Number(s.dashboard?.arcade?.balance || 0);
    }
    return { chakra, generated, sold, boosters, tickets };
  }, [scoped]);

  const bestPulls = useMemo(() => {
    const merged: Array<any & { accountName: string }> = [];
    for (const s of scoped) {
      const pulls = s.bestPulls.length ? s.bestPulls : s.dashboard?.bestPulls || [];
      for (const p of pulls) {
        merged.push({ ...p, accountName: s.account.name });
      }
    }
    return merged
      .filter((p) => rarityFilter === 'ALL' || p.rarity === rarityFilter)
      .sort((a, b) => (rarRank[b.rarity] || 0) - (rarRank[a.rarity] || 0) || Number(b.pulledAt || 0) - Number(a.pulledAt || 0))
      .slice(0, 30);
  }, [scoped, rarityFilter]);

  const journal = useMemo(() => {
    const rows: Array<any & { accountName: string }> = [];
    for (const s of scoped) {
      for (const entry of s.journal || []) {
        rows.push({ ...entry, accountName: s.account.name });
      }
    }
    return rows.sort((a, b) => Number(b.ts || 0) - Number(a.ts || 0)).slice(0, 35);
  }, [scoped]);

  return (
    <div className="silent-scroll">
      <div className="panel__head">
        <div style={{ display: 'flex', gap: 6 }}>
          <button
            className={`pill ${scope === 'all' ? 'pill--acc' : ''}`}
            onClick={() => setScope('all')}
          >
            Tous les comptes ({accounts.length})
          </button>
          <button
            className={`pill ${scope === 'selected' ? 'pill--acc' : ''}`}
            onClick={() => setScope('selected')}
          >
            Compte sélectionné uniquement
          </button>
        </div>
      </div>

      <div className="kpi-grid">
        <div className="kpi-card">
          <span className="kpi-card__label"><Coins size={12} /> Chakra total</span>
          <span className="kpi-card__value" style={{ color: 'var(--gold)' }}>{totals.chakra.toLocaleString('fr-FR')} ◆</span>
          <span className="kpi-card__sub">Soldes cumulés en direct</span>
        </div>
        <div className="kpi-card">
          <span className="kpi-card__label"><Sparkles size={12} /> Chakra générés (ROI)</span>
          <span className="kpi-card__value" style={{ color: 'var(--green)' }}>+{totals.generated.toLocaleString('fr-FR')} ◆</span>
          <span className="kpi-card__sub">{totals.sold} carte(s) vendue(s)</span>
        </div>
        <div className="kpi-card">
          <span className="kpi-card__label"><Package size={12} /> Boosters gratuits prêts</span>
          <span className="kpi-card__value" style={{ color: 'var(--cyan)' }}>{totals.boosters}</span>
          <span className="kpi-card__sub">Désactivable par compte ci-dessous</span>
        </div>
        <div className="kpi-card">
          <span className="kpi-card__label"><Gamepad2 size={12} /> Tickets Salle de Jeux</span>
          <span className="kpi-card__value" style={{ color: 'var(--purple)' }}>{totals.tickets}</span>
          <span className="kpi-card__sub">Farm silencieux sans mise en veille</span>
        </div>
      </div>

      <section className="panel">
        <div className="panel__head">
          <h2 className="panel__title">Pilotes multi-comptes (Mode Silencieux)</h2>
          <span style={{ fontSize: 11, color: 'var(--muted)' }}>
            Chaque compte a sa session isolée + ses réglages indépendants (ex. couper Boosters Auto pour ouvrir à la main).
          </span>
        </div>
        <div className="accounts-grid">
          {accounts.map((snap) => {
            const { account, settings, dashboard } = snap;
            const me = dashboard?.me || {};
            const arcade = dashboard?.arcade || {};
            const stats = snap.cumulativeStats || {};
            const gen = Number(stats.chakraFromSales || 0) + Number(stats.chakraFromRecycle || 0);
            const isSelected = account.id === selectedAccountId;

            return (
              <div
                key={account.id}
                className="acc-card"
                style={{ borderColor: isSelected ? 'rgba(255,77,46,0.45)' : undefined }}
                onClick={() => onSelectAccount(account.id)}
              >
                <div className="acc-item__row">
                  <div style={{ display: 'flex', alignItems: 'center', gap: 7, minWidth: 0 }}>
                    <span className={`status-dot ${snap.needsLogin ? 'login' : settings.masterEnabled ? 'on' : ''}`} />
                    <span className="acc-item__name">{account.name}</span>
                    {me.username && <span className="tag">{me.username}</span>}
                  </div>
                  <div style={{ display: 'flex', gap: 4 }}>
                    <button
                      className="btn btn--sm"
                      title="Actualiser le snapshot"
                      onClick={(e) => {
                        e.stopPropagation();
                        onSendCommand(account.id, { type: 'km:cmd:refresh' });
                      }}
                    >
                      <RefreshCw size={11} />
                    </button>
                    <button
                      className="btn btn--sm btn--primary"
                      onClick={(e) => {
                        e.stopPropagation();
                        onSelectAccount(account.id);
                        onChangeMode(account.id, 'hybrid');
                      }}
                    >
                      <ExternalLink size={11} /> {snap.needsLogin ? 'Se connecter' : 'Hybride'}
                    </button>
                    <button
                      className="btn btn--sm"
                      onClick={(e) => {
                        e.stopPropagation();
                        onSelectAccount(account.id);
                        onChangeMode(account.id, 'manual');
                      }}
                    >
                      Manuel
                    </button>
                  </div>
                </div>

                {snap.needsLogin && (
                  <div className="pill pill--warn" style={{ justifyContent: 'space-between' }}>
                    <span><ShieldAlert size={12} /> Session Kyara non connectée</span>
                    <button
                      className="btn btn--sm btn--primary"
                      onClick={(e) => {
                        e.stopPropagation();
                        onSelectAccount(account.id);
                        onChangeMode(account.id, 'hybrid');
                      }}
                    >
                      Ouvrir la connexion
                    </button>
                  </div>
                )}

                <div className="acc-card__stats">
                  <div className="stat-mini">Chakra<b>{me.chakra ?? '—'} ◆</b></div>
                  <div className="stat-mini">Généré<b>+{gen} ◆</b></div>
                  <div className="stat-mini">Boosters<b>{me.freeBoosters ?? '—'} / {me.goldenCounter ?? '—'}✦</b></div>
                  <div className="stat-mini">Tickets<b>{arcade.today ?? 0}/{arcade.dayCap ?? 60}</b></div>
                </div>

                <div className="toggles-grid" onClick={(e) => e.stopPropagation()}>
                  {[
                    { key: 'masterEnabled', label: 'Autopilot', val: Boolean(settings.masterEnabled) },
                    { key: 'autoBoosterEnabled', label: 'Boosters Auto', val: Boolean(settings.autoBoosterEnabled ?? true) },
                    { key: 'autoSellEnabled', label: 'Vente Auto', val: Boolean(settings.autoSellEnabled ?? true) },
                    { key: 'autoMarketEnabled', label: 'Achats Flips', val: Boolean(settings.autoMarketEnabled) },
                    { key: 'autoGamesEnabled', label: 'Salle de Jeux', val: Boolean(settings.autoGamesEnabled ?? true) },
                    { key: 'dryRun', label: 'Simulation (Dry-Run)', val: Boolean(settings.dryRun) }
                  ].map((item) => (
                    <button
                      key={item.key}
                      className={`toggle-btn ${item.val ? 'is-on' : ''}`}
                      onClick={() => onPatchSettings(account.id, { [item.key]: !item.val })}
                    >
                      <span>{item.label}</span>
                      <b>{item.val ? 'ON' : 'OFF'}</b>
                    </button>
                  ))}
                </div>

                <div className="acc-item__meta" onClick={(e) => e.stopPropagation()}>
                  <span>{snap.gamesTabOpen ? '🎮 Salle de Jeux active en arrière-plan' : 'Salle en veille'}</span>
                  <button
                    className="btn btn--sm"
                    onClick={() => onSendCommand(account.id, { type: 'km:cmd:run-games-farm', manual: true })}
                  >
                    Farmer la Salle
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </section>

      <div className="split-2">
        <section className="panel">
          <div className="panel__head">
            <h2 className="panel__title"><Sparkles size={14} color="#f5c518" /> Meilleurs Drops (Butin)</h2>
            <div style={{ display: 'flex', gap: 4 }}>
              {(['ALL', 'M', 'L', 'E'] as RarityFilter[]).map((r) => (
                <button
                  key={r}
                  className={`btn btn--sm ${rarityFilter === r ? 'btn--primary' : ''}`}
                  onClick={() => setRarityFilter(r)}
                >
                  {r === 'ALL' ? 'Tous' : r}
                </button>
              ))}
            </div>
          </div>
          {bestPulls.length === 0 ? (
            <div style={{ color: 'var(--muted)', padding: '16px 0' }}>Aucun drop enregistré pour le moment.</div>
          ) : (
            <div className="pulls-grid">
              {bestPulls.map((p, idx) => (
                <div key={`${p.characterId}-${p.pulledAt}-${idx}`} className="pull-card">
                  {p.image ? <img src={p.image} alt={p.name} /> : <div style={{ width: 38, height: 52, borderRadius: 6, background: '#262335' }} />}
                  <div className="pull-card__info">
                    <div className="pull-card__name">{p.name}</div>
                    <div className="pull-card__sub">
                      <span className={`tag tag--${p.rarity}`}>{p.rarity}</span> · {p.accountName}
                    </div>
                    <div className="pull-card__sub">
                      {p.medianPrice ? `${p.medianPrice} ◆` : 'Prix N/A'} · {p.packName || 'Booster'}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>

        <section className="panel">
          <div className="panel__head">
            <h2 className="panel__title">Journal live multi-comptes</h2>
          </div>
          {journal.length === 0 ? (
            <div style={{ color: 'var(--muted)', padding: '16px 0' }}>En attente d'événements…</div>
          ) : (
            <div className="journal-list">
              {journal.map((entry, idx) => (
                <div key={`${entry.ts}-${idx}`} className="journal-row">
                  <span><b style={{ color: 'var(--gold)' }}>[{entry.accountName}]</b> {entry.message}</span>
                  <span style={{ color: 'var(--muted)', flexShrink: 0 }}>
                    {entry.ts ? new Date(entry.ts).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }) : ''}
                  </span>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  );
};
