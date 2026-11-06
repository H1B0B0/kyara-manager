import { useState, useEffect, useCallback } from 'react';
import type { WishlistItem } from '../../types/kyara';
import { sendCommand } from './useDashboard';

export function useWishlist() {
  const [wishlist, setWishlist] = useState<WishlistItem[]>([]);

  useEffect(() => {
    chrome.storage.local.get('kmWishlist').then((stored) => {
      if (Array.isArray(stored.kmWishlist)) {
        setWishlist(stored.kmWishlist);
      }
    });

    const listener = (changes: Record<string, chrome.storage.StorageChange>, area: string) => {
      if (area !== 'local' || !changes.kmWishlist?.newValue) return;
      setWishlist(Array.isArray(changes.kmWishlist.newValue) ? changes.kmWishlist.newValue : []);
    };

    chrome.storage.onChanged.addListener(listener);
    return () => chrome.storage.onChanged.removeListener(listener);
  }, []);

  const addWish = useCallback(
    async (item: { characterId: number; name: string; series?: string; rarity?: string; budgetChakra?: number }) => {
      const res = await sendCommand({
        type: 'km:cmd:wishlist-add',
        ...item
      });
      if (res?.wishlist) {
        setWishlist(res.wishlist);
      }
      return res;
    },
    []
  );

  const removeWish = useCallback(async (characterId: number) => {
    const res = await sendCommand({
      type: 'km:cmd:wishlist-remove',
      characterId
    });
    if (res?.wishlist) {
      setWishlist(res.wishlist);
    }
    return res;
  }, []);

  return { wishlist, addWish, removeWish };
}
