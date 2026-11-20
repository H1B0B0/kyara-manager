import { state, loadSettings } from './state';
import { appendJournal } from './journal';
import { runAutomationCycle } from './automation/cycle';
import { toggleCockpitOverlay } from './overlay';

export function mountFloatingHud(): void {
  const old = document.getElementById('km-floating-hud');
  if (old) old.remove();

  const hud = document.createElement('aside');
  hud.id = 'km-floating-hud';
  hud.className = 'km-hud';
  hud.setAttribute('aria-label', 'Kyara Manager Autopilot');

  let isCollapsed = false;
  try {
    isCollapsed = localStorage.getItem('km_hud_collapsed') === '1';
  } catch {}
  if (isCollapsed) hud.classList.add('is-collapsed');

  const seal = document.createElement('button');
  seal.type = 'button';
  seal.className = 'km-hud__seal';
  seal.id = 'km-hud-dot';
  seal.textContent = '操';
  seal.title = 'Kyara Manager (clique pour réduire/agrandir)';
  seal.addEventListener('click', () => {
    hud.classList.toggle('is-collapsed');
    try {
      localStorage.setItem('km_hud_collapsed', hud.classList.contains('is-collapsed') ? '1' : '0');
    } catch {}
  });

  const info = document.createElement('div');
  info.className = 'km-hud__info';

  const title = document.createElement('strong');
  title.className = 'km-hud__title';
  title.textContent = 'KYARA MANAGER';

  const meta = document.createElement('span');
  meta.className = 'km-hud__meta';
  meta.id = 'km-hud-meta';
  meta.textContent = 'Synchronisation…';

  info.append(title, meta);

  const toggleBtn = document.createElement('button');
  toggleBtn.type = 'button';
  toggleBtn.className = 'km-hud__btn km-hud__btn--toggle';
  toggleBtn.id = 'km-hud-toggle';
  toggleBtn.textContent = 'AUTO OFF';
  toggleBtn.addEventListener('click', async () => {
    await loadSettings();
    const next = !state.currentSettings.masterEnabled;
    state.currentSettings.masterEnabled = next;
    const saved = await chrome.runtime.sendMessage({ type: 'km:save-settings', settings: { masterEnabled: next } });
    if (!saved?.ok) {
      await loadSettings();
      updateFloatingHud();
      setHudStatusText(saved?.error || 'Enregistrement impossible');
      return;
    }
    updateFloatingHud();
    if (next) {
      await appendJournal('info', 'Pilote automatique activé');
      void runAutomationCycle({ manual: true });
    } else {
      await appendJournal('info', 'Pilote automatique en pause');
    }
  });

  const cycleBtn = document.createElement('button');
  cycleBtn.type = 'button';
  cycleBtn.className = 'km-hud__btn km-hud__btn--cycle';
  cycleBtn.id = 'km-hud-cycle';
  cycleBtn.textContent = 'Cycle';
  cycleBtn.title = 'Lancer un cycle complet maintenant';
  cycleBtn.addEventListener('click', async () => {
    if (cycleBtn.disabled) return;
    cycleBtn.disabled = true;
    cycleBtn.textContent = 'Cycle…';
    try {
      const res = await runAutomationCycle({ manual: true });
      if (res?.dashboard) updateFloatingHud(res.dashboard);
    } finally {
      cycleBtn.disabled = false;
      cycleBtn.textContent = 'Cycle';
    }
  });

  const openBtn = document.createElement('button');
  openBtn.type = 'button';
  openBtn.className = 'km-hud__btn km-hud__btn--primary';
  openBtn.textContent = 'Cockpit';
  openBtn.title = 'Ouvrir le Cockpit Overlay (Alt+K)';
  openBtn.addEventListener('click', () => {
    toggleCockpitOverlay();
  });

  const sidepanelBtn = document.createElement('button');
  sidepanelBtn.type = 'button';
  sidepanelBtn.className = 'km-hud__btn km-hud__btn--icon';
  sidepanelBtn.title = 'Ouvrir le panneau latéral Chrome';
  sidepanelBtn.textContent = '◫';
  sidepanelBtn.addEventListener('click', () => {
    chrome.runtime.sendMessage({ type: 'km:open-sidepanel' }).catch(() => {});
  });

  const collapseBtn = document.createElement('button');
  collapseBtn.type = 'button';
  collapseBtn.className = 'km-hud__btn km-hud__btn--icon';
  collapseBtn.title = 'Réduire le widget';
  collapseBtn.textContent = '−';
  collapseBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    hud.classList.add('is-collapsed');
    try {
      localStorage.setItem('km_hud_collapsed', '1');
    } catch {}
  });

  hud.append(seal, info, toggleBtn, cycleBtn, openBtn, sidepanelBtn, collapseBtn);
  document.body.appendChild(hud);
}

export function setHudStatusText(text: string): void {
  const meta = document.getElementById('km-hud-meta');
  if (meta) meta.textContent = text;
}

export function updateFloatingHud(dashboard: any = null): void {
  const dot = document.getElementById('km-hud-dot');
  const meta = document.getElementById('km-hud-meta');
  const toggleBtn = document.getElementById('km-hud-toggle');
  if (!dot || !meta || !toggleBtn) return;

  const on = Boolean(state.currentSettings.masterEnabled);
  dot.classList.toggle('is-on', on);
  toggleBtn.textContent = on ? 'AUTO ON' : 'AUTO OFF';
  toggleBtn.classList.toggle('is-on', on);

  if (dashboard && dashboard.authenticated && dashboard.me) {
    const listingsCount = dashboard.activeListings?.length ?? 0;
    const maxSlots = state.currentSettings.autoSellMaxListings ?? 10;
    const freePacks = dashboard.me.freePacks ?? 0;
    const chakra = new Intl.NumberFormat('fr-FR').format(dashboard.me.chakra ?? 0);
    let telemetry = '';
    if (dashboard.me.goldenIn !== undefined && dashboard.me.goldenIn !== null && dashboard.me.goldenIn <= 1) {
      telemetry = ' · 金 DORÉ';
    } else if (state.currentSettings.renaissanceFocusEnabled && dashboard.renaissance) {
      telemetry = ` · 転 ${Math.round(dashboard.renaissance.overallPct)}%`;
    }
    meta.textContent = `${dashboard.me.pseudo} · ${chakra} ◆ · ${freePacks}/10 札 · ${listingsCount}/${maxSlots} 市${telemetry}`;
  } else if (dashboard && !dashboard.authenticated) {
    meta.textContent = 'Non connecté';
  }
}
