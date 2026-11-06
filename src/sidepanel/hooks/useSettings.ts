import { useState, useEffect, useCallback } from 'react';
import type { KyaraSettings } from '../../types/settings';
import { DEFAULT_SETTINGS, normalizeSettings } from '../../types/settings';
import { setLanguage } from '../../lib/i18n';
import { sendCommand } from './useDashboard';

export function useSettings() {
  const [settings, setSettings] = useState<KyaraSettings>(DEFAULT_SETTINGS);

  useEffect(() => {
    chrome.storage.local.get('settings').then((stored: any) => {
      if (stored.settings) {
        const merged = normalizeSettings(stored.settings);
        if (hydrated) return;
        setSettings(merged);
        if (merged.language) {
          setLanguage(merged.language);
        }
      }
    });

    let hydrated = false;
    const listener = (changes: Record<string, chrome.storage.StorageChange>, area: string) => {
      if (area !== 'local' || !changes.settings?.newValue) return;
      hydrated = true;
      const updated = normalizeSettings(changes.settings.newValue);
      setSettings(updated);
      if (updated.language) {
        setLanguage(updated.language);
      }
    };

    chrome.storage.onChanged.addListener(listener);
    return () => chrome.storage.onChanged.removeListener(listener);
  }, []);

  const updateSettings = useCallback(async (partial: Partial<KyaraSettings>) => {
    const result = await sendCommand({ type: 'km:save-settings', settings: partial });
    if (!result.ok) throw new Error(result.error || 'Enregistrement impossible');
    if (partial.language) {
      setLanguage(partial.language);
    }
  }, []);

  return { settings, updateSettings };
}
