import { state } from '../state';
import { appendJournal } from '../journal';

export function setupAntiAfkObserver(): () => void {
  let clickingIdle = false;
  let timer: ReturnType<typeof setTimeout>;
  const checkIdleDialog = () => {
    if (!state.currentSettings.masterEnabled || !state.currentSettings.antiAfkEnabled || state.updatePending || !chrome.runtime?.id || clickingIdle) return;
    const dialogs = document.querySelectorAll('[role="dialog"], dialog, .modal, .veil');
    for (const dialog of Array.from(dialogs)) {
      const text = (dialog.textContent || '').toLowerCase();
      if (text.includes('toujours là') || dialog.getAttribute('aria-labelledby') === 'idle-t') {
        const buttons = dialog.querySelectorAll('button');
        for (const btn of Array.from(buttons)) {
          const label = (btn.textContent || '').trim().toLowerCase();
          if (
            label.includes('je suis là') ||
            label === 'oui' ||
            label.includes('présent') ||
            label.includes('continuer')
          ) {
            clickingIdle = true;
            const delay = 1400 + Math.floor(Math.random() * 1800);
            timer = setTimeout(() => {
              if (!state.currentSettings.masterEnabled || !state.currentSettings.antiAfkEnabled || state.updatePending || !chrome.runtime?.id || !btn.isConnected) {
                clickingIdle = false;
                return;
              }
              btn.click();
              clickingIdle = false;
              void appendJournal('info', 'Anti-AFK : présence confirmée automatiquement');
            }, delay);
            return;
          }
        }
      }
    }
  };

  const observer = new MutationObserver(checkIdleDialog);
  if (document.body) {
    observer.observe(document.body, { childList: true, subtree: true });
  }
  return () => { observer.disconnect(); clearTimeout(timer); };
}
