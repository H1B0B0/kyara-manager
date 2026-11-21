import { state, loadSettings } from './state';
import { appendJournal } from './journal';
import { runAutomationCycle } from './automation/cycle';
import { toggleCockpitOverlay } from './overlay';
import type { UpdateState } from '../types/updates';

function renderUpdateToast(update: UpdateState | null | undefined): void {
  const toast = document.getElementById('km-update-toast');
  const dot = document.getElementById('km-hud-dot');
  const status = update?.status || 'idle';
  const hasVisibleUpdate =
    status === 'waiting' ||
    status === 'installing' ||
    status === 'updated' ||
    (status === 'available' && Boolean(update?.availableVersion) && update?.dismissedVersion !== update.availableVersion);

  dot?.classList.toggle('has-update', Boolean(hasVisibleUpdate));
  if (!toast) return;

  if (!hasVisibleUpdate) {
    toast.hidden = true;
    toast.classList.remove('km-update-toast--modal');
    delete toast.dataset.status;
    return;
  }

  const versionEl = document.getElementById('km-update-toast-version');
  const titleEl = document.getElementById('km-update-toast-title');
  const descEl = document.getElementById('km-update-toast-desc');
  const progressEl = document.getElementById('km-update-toast-progress') as HTMLProgressElement | null;
  const applyBtn = document.getElementById('km-update-toast-apply') as HTMLButtonElement | null;
  const storeBtn = document.getElementById('km-update-toast-store') as HTMLButtonElement | null;
  const closeBtn = document.getElementById('km-update-toast-close') as HTMLButtonElement | null;
  if (!titleEl || !descEl || !applyBtn || !storeBtn || !closeBtn || !progressEl) return;

  const isCws = update?.cwsInstall !== false;
  const isCwsPending = status === 'available' && Boolean(update?.cwsPending) && isCws;
  const isDevGithubOnly = status === 'available' && update?.cwsInstall === false && Boolean(update?.releaseUrl);
  const cwsUrl =
    update?.cwsUrl ||
    (chrome.runtime?.id ? `https://chromewebstore.google.com/detail/${chrome.runtime.id}` : undefined);
  const badgeVer = status === 'updated' ? update?.currentVersion : update?.availableVersion || update?.currentVersion;

  if (versionEl) {
    versionEl.textContent = badgeVer ? `v${badgeVer}` : '';
    versionEl.hidden = !badgeVer;
  }
  toast.dataset.status = status;
  toast.classList.add('km-update-toast--modal');

  if (status === 'waiting' || status === 'installing') {
    titleEl.textContent = `Kyara Manager se met à jour (v${update?.availableVersion || ''})…`;
    descEl.textContent =
      status === 'waiting'
        ? 'Mise à jour prête sur Chrome Web Store. Fin de l’action en cours avant rechargement automatique…'
        : 'Installation automatique via Chrome Web Store en cours, l’extension va se recharger dans un instant.';
    progressEl.hidden = false;
    applyBtn.hidden = true;
    storeBtn.hidden = true;
    closeBtn.hidden = true;
  } else if (status === 'updated') {
    titleEl.textContent = `Kyara Manager a été mis à jour (v${update?.currentVersion || ''})`;
    descEl.textContent = 'Les dernières optimisations Chrome Web Store sont maintenant actives.';
    progressEl.hidden = true;
    applyBtn.hidden = true;
    storeBtn.hidden = true;
    closeBtn.hidden = false;
    closeBtn.textContent = 'Continuer';
  } else {
    titleEl.textContent = `Nouvelle mise à jour disponible (v${update?.availableVersion || ''})`;
    descEl.textContent = isCwsPending
      ? 'Publication Chrome Web Store en cours de validation/déploiement par Google. L’extension s’installera automatiquement dès disponibilité.'
      : isCws
        ? 'Prête à être installée automatiquement via le Chrome Web Store sans perdre ta session.'
        : 'Nouvelle version détectée sur GitHub (build local sans update_url).';
    progressEl.hidden = true;
    applyBtn.hidden = false;
    applyBtn.textContent = 'Mettre à jour';
    closeBtn.hidden = false;
    closeBtn.textContent = 'Plus tard';
    if (isCws && (isCwsPending || update?.source === 'github') && cwsUrl) {
      storeBtn.hidden = false;
      storeBtn.textContent = 'Chrome Web Store';
      storeBtn.dataset.url = cwsUrl;
    } else if (isDevGithubOnly && update?.releaseUrl) {
      storeBtn.hidden = false;
      storeBtn.textContent = 'Voir sur GitHub';
      storeBtn.dataset.url = update.releaseUrl;
    } else {
      storeBtn.hidden = true;
      delete storeBtn.dataset.url;
    }
  }
  toast.hidden = false;
}

export function mountFloatingHud(): void {
  document.getElementById('km-floating-hud')?.remove();
  document.getElementById('km-update-toast')?.remove();

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

  const titleRow = document.createElement('div');
  titleRow.className = 'km-hud__title-row';

  const title = document.createElement('strong');
  title.className = 'km-hud__title';
  title.textContent = 'KYARA MANAGER';

  const pill = document.createElement('span');
  pill.className = 'km-hud__status-pill';
  pill.id = 'km-hud-pill';
  pill.textContent = 'PAUSE';

  titleRow.append(title, pill);

  const meta = document.createElement('span');
  meta.className = 'km-hud__meta';
  meta.id = 'km-hud-meta';
  meta.textContent = 'Synchronisation…';

  info.append(titleRow, meta);

  const sep = document.createElement('span');
  sep.className = 'km-hud__sep';
  sep.setAttribute('aria-hidden', 'true');

  const actions = document.createElement('div');
  actions.className = 'km-hud__actions';

  const toggleBtn = document.createElement('button');
  toggleBtn.type = 'button';
  toggleBtn.className = 'km-hud__btn km-hud__btn--toggle';
  toggleBtn.id = 'km-hud-toggle';
  toggleBtn.textContent = 'Auto Off';
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
    cycleBtn.textContent = '…';
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
  collapseBtn.title = 'Réduire au logo';
  collapseBtn.textContent = '−';
  collapseBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    hud.classList.add('is-collapsed');
    try {
      localStorage.setItem('km_hud_collapsed', '1');
    } catch {}
  });

  actions.append(toggleBtn, cycleBtn, openBtn, sidepanelBtn, collapseBtn);
  hud.append(seal, info, sep, actions);
  document.body.appendChild(hud);

  const toast = document.createElement('div');
  toast.id = 'km-update-toast';
  toast.className = 'km-update-toast';
  toast.hidden = true;

  const toastCard = document.createElement('div');
  toastCard.className = 'km-update-toast__card';
  toastCard.setAttribute('role', 'dialog');
  toastCard.setAttribute('aria-modal', 'true');
  toastCard.setAttribute('aria-labelledby', 'km-update-toast-title');
  toastCard.setAttribute('aria-describedby', 'km-update-toast-desc');

  const toastSealWrap = document.createElement('div');
  toastSealWrap.className = 'km-update-toast__seal-wrap';
  const toastSeal = document.createElement('span');
  toastSeal.className = 'km-update-toast__seal';
  toastSeal.setAttribute('aria-hidden', 'true');
  toastSeal.textContent = '新';
  const toastVersion = document.createElement('span');
  toastVersion.id = 'km-update-toast-version';
  toastVersion.className = 'km-update-toast__version';
  toastSealWrap.append(toastSeal, toastVersion);

  const toastCopy = document.createElement('div');
  toastCopy.className = 'km-update-toast__copy';
  const toastTitle = document.createElement('strong');
  toastTitle.id = 'km-update-toast-title';
  toastTitle.className = 'km-update-toast__title';
  const toastDesc = document.createElement('span');
  toastDesc.id = 'km-update-toast-desc';
  toastDesc.className = 'km-update-toast__desc';
  toastCopy.append(toastTitle, toastDesc);

  const toastProgress = document.createElement('progress');
  toastProgress.id = 'km-update-toast-progress';
  toastProgress.className = 'km-update-toast__progress';
  toastProgress.setAttribute('aria-label', 'Progression de la mise à jour Chrome Web Store');
  toastProgress.hidden = true;

  const toastActions = document.createElement('div');
  toastActions.className = 'km-update-toast__actions';
  const toastApply = document.createElement('button');
  toastApply.type = 'button';
  toastApply.id = 'km-update-toast-apply';
  toastApply.className = 'km-hud__btn km-hud__btn--primary';
  toastApply.textContent = 'Mettre à jour';
  toastApply.addEventListener('click', async () => {
    toastApply.disabled = true;
    try {
      const res = await chrome.runtime.sendMessage({ type: 'km:update-apply' }).catch(() => null);
      const upd = res?.kmUpdate as UpdateState | undefined;
      if (upd) renderUpdateToast(upd);
      if (upd?.cwsInstall === false && !upd?.cwsPending && upd?.source === 'github' && upd?.releaseUrl) {
        window.open(upd.releaseUrl, '_blank', 'noopener');
      }
    } finally {
      toastApply.disabled = false;
    }
  });
  const toastStore = document.createElement('button');
  toastStore.type = 'button';
  toastStore.id = 'km-update-toast-store';
  toastStore.className = 'km-hud__btn';
  toastStore.textContent = 'Chrome Web Store';
  toastStore.hidden = true;
  toastStore.addEventListener('click', () => {
    const targetUrl = toastStore.dataset.url;
    if (targetUrl) window.open(targetUrl, '_blank', 'noopener');
  });
  const toastClose = document.createElement('button');
  toastClose.type = 'button';
  toastClose.id = 'km-update-toast-close';
  toastClose.className = 'km-hud__btn';
  toastClose.textContent = 'Plus tard';
  const dismissToast = () => {
    if (toast.dataset.status === 'installing' || toast.dataset.status === 'waiting') return;
    toast.hidden = true;
    toast.classList.remove('km-update-toast--modal');
    void chrome.runtime.sendMessage({ type: 'km:update-dismiss' }).catch(() => {});
  };
  toastClose.addEventListener('click', dismissToast);
  toast.addEventListener('click', (event) => {
    if (event.target === toast) dismissToast();
  });
  toastActions.append(toastApply, toastStore, toastClose);
  toastCard.append(toastSealWrap, toastCopy, toastProgress, toastActions);
  toast.append(toastCard);
  document.body.appendChild(toast);

  void chrome.storage?.local?.get('kmUpdate').then(({ kmUpdate }) => {
    renderUpdateToast(kmUpdate as UpdateState | undefined);
  }).catch(() => {});
  chrome.storage?.onChanged?.addListener((changes, area) => {
    if (area === 'local' && changes.kmUpdate) {
      renderUpdateToast(changes.kmUpdate.newValue as UpdateState | undefined);
    }
  });
}

export function setHudStatusText(text: string): void {
  const meta = document.getElementById('km-hud-meta');
  if (meta) meta.textContent = text;
}

export function updateFloatingHud(dashboard: any = null): void {
  const dot = document.getElementById('km-hud-dot');
  const meta = document.getElementById('km-hud-meta');
  const pill = document.getElementById('km-hud-pill');
  const toggleBtn = document.getElementById('km-hud-toggle');
  if (!dot || !meta || !toggleBtn) return;

  const on = Boolean(state.currentSettings.masterEnabled);
  dot.classList.toggle('is-on', on);
  if (pill) {
    pill.textContent = on ? 'ACTIF' : 'PAUSE';
    pill.classList.toggle('is-on', on);
  }
  toggleBtn.textContent = on ? 'Auto On' : 'Auto Off';
  toggleBtn.classList.toggle('is-on', on);

  if (dashboard && dashboard.authenticated && dashboard.me) {
    const listingsCount = dashboard.activeListings?.length ?? 0;
    const maxSlots = state.currentSettings.autoSellMaxListings ?? 10;
    const freePacks = dashboard.me.freePacks ?? 0;
    const chakra = new Intl.NumberFormat('fr-FR').format(dashboard.me.chakra ?? 0);
    let telemetry = '';
    if (dashboard.me.goldenIn !== undefined && dashboard.me.goldenIn !== null && dashboard.me.goldenIn <= 1) {
      telemetry = ' · 金 Doré';
    } else if (state.currentSettings.renaissanceFocusEnabled && dashboard.renaissance) {
      telemetry = ` · 転 ${Math.round(dashboard.renaissance.overallPct)}%`;
    }
    meta.textContent = `${dashboard.me.pseudo} · ${chakra} ◆ · ${freePacks}/10 札 · ${listingsCount}/${maxSlots} 市${telemetry}`;
  } else if (dashboard && !dashboard.authenticated) {
    meta.textContent = 'Non connecté';
  }
}
