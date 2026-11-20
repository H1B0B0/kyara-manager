const OVERLAY_ID = 'km-cockpit-overlay';

/** Checks whether the in-page Cockpit Overlay is currently visible. */
export function isCockpitOverlayOpen(): boolean {
  const overlay = document.getElementById(OVERLAY_ID);
  return Boolean(overlay && !overlay.classList.contains('is-hidden'));
}

/** Opens the in-page Cockpit Overlay iframe, creating it lazily on first open. */
export function openCockpitOverlay(): void {
  const existing = document.getElementById(OVERLAY_ID);
  if (existing) {
    existing.classList.remove('is-hidden');
    existing.focus();
    return;
  }

  const overlay = document.createElement('div');
  overlay.id = OVERLAY_ID;
  overlay.className = 'km-overlay-backdrop';
  overlay.setAttribute('role', 'dialog');
  overlay.setAttribute('aria-modal', 'true');
  overlay.setAttribute('aria-label', 'Kyara Manager Cockpit');
  overlay.tabIndex = -1;

  const shell = document.createElement('div');
  shell.className = 'km-overlay-shell';

  const iframe = document.createElement('iframe');
  iframe.className = 'km-overlay-iframe';
  const defaultPath = chrome.runtime.getManifest?.()?.side_panel?.default_path || 'sidepanel/index.html';
  iframe.src = chrome.runtime.getURL(`${defaultPath}?mode=overlay`);
  iframe.title = 'Kyara Manager Cockpit';

  shell.appendChild(iframe);
  overlay.appendChild(shell);

  overlay.addEventListener('click', (event) => {
    if (event.target === overlay) {
      closeCockpitOverlay();
    }
  });

  document.body.appendChild(overlay);
  overlay.focus();
}

/** Hides the in-page Cockpit Overlay without tearing down its iframe state. */
export function closeCockpitOverlay(): void {
  const overlay = document.getElementById(OVERLAY_ID);
  if (overlay) {
    overlay.classList.add('is-hidden');
  }
}

/** Toggles the visibility of the in-page Cockpit Overlay. */
export function toggleCockpitOverlay(): void {
  if (isCockpitOverlayOpen()) {
    closeCockpitOverlay();
  } else {
    openCockpitOverlay();
  }
}

/** Registers global keyboard (Alt+K / Escape) and iframe close-message listeners. */
export function setupOverlayListeners(): () => void {
  const extensionOrigin = new URL(chrome.runtime.getURL('')).origin;

  const onKeyDown = (event: KeyboardEvent) => {
    if (event.altKey && !event.ctrlKey && !event.metaKey && (event.code === 'KeyK' || event.key.toLowerCase() === 'k')) {
      event.preventDefault();
      toggleCockpitOverlay();
      return;
    }
    if (event.key === 'Escape' && isCockpitOverlayOpen()) {
      event.preventDefault();
      closeCockpitOverlay();
    }
  };

  const onMessage = (event: MessageEvent) => {
    if (event.origin === extensionOrigin && event.data?.type === 'km:close-overlay') {
      closeCockpitOverlay();
    }
  };

  window.addEventListener('keydown', onKeyDown);
  window.addEventListener('message', onMessage);

  return () => {
    window.removeEventListener('keydown', onKeyDown);
    window.removeEventListener('message', onMessage);
    document.getElementById(OVERLAY_ID)?.remove();
  };
}
