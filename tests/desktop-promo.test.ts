import { describe, expect, it } from 'vitest';
import {
  DESKTOP_BANNER_STORAGE_KEY,
  DESKTOP_RELEASE_URL,
  shouldShowDesktopPromo
} from '../src/sidepanel/components/DesktopPromoBanner';

describe('DesktopPromoBanner', () => {
  it('hides promo banner inside Kyara Manager Desktop and when dismissed by user', () => {
    expect(shouldShowDesktopPromo('kyara-manager-desktop', false)).toBe(false);
    expect(shouldShowDesktopPromo('abcdefgchromeext', true)).toBe(false);
    expect(shouldShowDesktopPromo('abcdefgchromeext', false)).toBe(true);
    expect(DESKTOP_BANNER_STORAGE_KEY).toBe('kmDesktopBannerDismissed');
    expect(DESKTOP_RELEASE_URL).toContain('/releases/tag/desktop-latest');
  });
});
