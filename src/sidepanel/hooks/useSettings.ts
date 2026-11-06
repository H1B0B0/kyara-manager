import { useState, useEffect, useCallback } from 'react';
import type { KyaraSettings } from '../../types/settings';
import { DEFAULT_SETTINGS } from '../../types/settings';
import { setLanguage } from '../../lib/i18n';
import { sendCommand } from './useDashboard';

export function useSettings() {
  const [settings, setSettings] = useState<KyaraSettings>(DEFAULT_SETTINGS);

  useEffect(() => {
    chrome.storage.local.get('settings').then((stored: any) => {
      if (stored.settings) {
        const merged = { ...DEFAULT_SETTINGS, ...(stored.settings as KyaraSettings) };
        setSettings(merged);
        if (merged.language) {
          setLanguage(merged.language);
        }
      }
    });

    const listener = (changes: Record<string, chrome.storage.StorageChange>, area: string) => {
      if (area !== 'local' || !changes.settings?.newValue) return;
      const updated = { ...DEFAULT_SETTINGS, ...(changes.settings.newValue as KyaraSettings) };
      setSettings(updated);
      if (updated.language) {
        setLanguage(updated.language);
      }
    };

    chrome.storage.onChanged.addListener(listener);
    return () => chrome.storage.onChanged.removeListener(listener);
  }, []);

  const updateSettings = useCallback(async (partial: Partial<KyaraSettings>) => {
    const updated = { ...settings, ...partial };
    setSettings(updated);
    await chrome.storage.local.set({ settings: updated });
    await sendCommand({ type: 'km:save-settings', settings: partial });
    if (partial.language) {
      setLanguage(partial.language);
    }
  }, [settings]);

  return { settings, updateSettings };
}
