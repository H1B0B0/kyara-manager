import type { Language } from '../../types/settings';
import { fr } from './fr';
import { en } from './en';
import { es } from './es';

export const TRANSLATIONS: Record<'fr' | 'en' | 'es', Record<string, any>> = {
  fr,
  en,
  es
};

let currentLang: 'fr' | 'en' | 'es' = 'fr';

export function setLanguage(lang: Language): void {
  if (lang === 'auto') {
    const nav = (typeof navigator !== 'undefined' && navigator.language ? navigator.language.slice(0, 2) : 'fr').toLowerCase();
    currentLang = nav === 'en' ? 'en' : nav === 'es' ? 'es' : 'fr';
  } else {
    currentLang = lang;
  }
}

export function getLanguage(): 'fr' | 'en' | 'es' {
  return currentLang;
}

export function t(key: string, params?: Record<string, string | number>, lang?: Language): string {
  const l = lang || currentLang;
  const dict = TRANSLATIONS[l] || TRANSLATIONS.fr;
  let val: any = dict;
  if (key.includes('.')) {
    for (const part of key.split('.')) {
      val = val?.[part];
    }
  } else {
    val = dict[key] ?? TRANSLATIONS.fr[key];
  }
  let text = typeof val === 'string' ? val : key;
  if (params) {
    for (const [k, v] of Object.entries(params)) {
      text = text.replace(new RegExp(`\\{${k}\\}`, 'g'), String(v));
    }
  }
  return text;
}
