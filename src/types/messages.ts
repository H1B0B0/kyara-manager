import type { DashboardState, WishlistItem } from './kyara';
import type { KyaraSettings } from './settings';

export type ExtensionCommand =
  | { type: 'km:cmd:refresh'; forcePrices?: boolean }
  | { type: 'km:cmd:run-cycle' }
  | { type: 'km:cmd:sell-now' }
  | { type: 'km:cmd:recycle-now' }
  | { type: 'km:cmd:bulk-recycle' }
  | { type: 'km:cmd:open-recommended' }
  | { type: 'km:cmd:scan-deals' }
  | { type: 'km:cmd:reset-roi' }
  | { type: 'km:cmd:open-pack'; packId: string; packName: string; count?: number }
  | { type: 'km:cmd:single-sell'; characterId: number; price: number; durationHours?: number }
  | { type: 'km:cmd:single-recycle'; characterId: number; qty?: number; name?: string }
  | { type: 'km:cmd:cancel-listing'; listingId: string; name?: string }
  | { type: 'km:cmd:buy-listing'; listingId: string; price: number; name?: string }
  | { type: 'km:cmd:toggle-pin'; characterId: number }
  | { type: 'km:cmd:wishlist-add'; characterId: number; name: string; series?: string; rarity?: string; budgetChakra?: number }
  | { type: 'km:cmd:wishlist-remove'; characterId: number }
  | { type: 'km:save-settings'; settings: Partial<KyaraSettings> }
  | { type: 'km:open-kyara-tab' }
  | { type: 'km:log'; level?: string; message: string };

export interface CommandResponse {
  ok?: boolean;
  error?: string;
  dashboard?: DashboardState;
  summary?: {
    opened: number;
    recycledCopies: number;
    listed: number;
    bought: number;
  };
  sellRes?: { listedCount: number };
  recRes?: { recycledCopies: number; chakraGained: number };
  recycledCount?: number;
  chakraGained?: number;
  openRes?: { openedCount: number; newCardsCount: number };
  isPinned?: boolean;
  wishlist?: WishlistItem[];
}
