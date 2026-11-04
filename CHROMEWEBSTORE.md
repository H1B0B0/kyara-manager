# Chrome Web Store Listing — Kyara Manager (v1.1.0)

## Extension Details
- **Name**: Kyara Manager — Pilote Auto, Doublons, Marché & Boosters
- **Short Name**: Kyara Manager
- **Version**: `1.1.0`
- **Summary** (≤132 chars): Pilote automatique pour Kyara.games : auto-vente des doublons, auto-recyclage, achat-revente (flip) et ouverture live de boosters.
- **Category**: Workflow & Planning / Fun (Gaming)
- **Language**: Français (`fr`)
- **Package File**: [`dist/kyara-manager-cws.zip`](file:///Users/etiennementrel/Documents/perso/kyara-manager/dist/kyara-manager-cws.zip) (generated via `npm run package:cws`)

## Single Purpose Statement
This extension provides automated collection management, duplicate selling/recycling, market deal scanning, and live recommended booster opening for a user's Kyara.games trading card game account.

## Permission Justifications (Minimal MV3 Footprint)

| Permission | Justification |
|---|---|
| `storage` | Stores user automation preferences (pricing strategy, chakra reserve, auto-recycle rarity filters), cached market prices, and the local activity journal in `chrome.storage.local`. |
| `alarms` | Runs a periodic 1-minute alarm (`kyara-manager-tick`) so the Manifest V3 service worker can trigger scheduled automation checks reliably without relying on non-persistent timers. |
| `notifications` | Displays desktop notifications when a listed card is sold on the market, when a profitable market flip is purchased, or when a Legendary/Mythic card is pulled from a booster. |
| `sidePanel` | Provides a persistent Chrome Side Panel dashboard (`sidepanel/sidepanel.html`) alongside `kyara.games` to monitor and configure Autopilot modules, duplicates, market flips, and booster recommendations. |
| `scripting` | Automatically injects the content script into an already-open `kyara.games` tab when the extension is installed or updated so the user can connect immediately without refreshing the tab. |
| `host_permissions` (`https://kyara.games/*`, `https://*.kyara.games/*`) | Injects the content script and floating HUD on `kyara.games` and communicates with the first-party `https://kyara.games/api/*` endpoints using the user's existing authenticated session. |

> **Note**: The `"tabs"` permission is intentionally omitted because `host_permissions` on `kyara.games` already grants scoped tab querying and messaging without triggering the "Read your browsing history" warning.

## Privacy Practices & Data Usage Disclosure
- **Remote Code**: No remote code is fetched or executed. All JavaScript and CSS are bundled locally within the extension package.
- **Data Collection**: Kyara Manager does **not** collect, transmit, or sell any personal data or browsing history to third-party servers. See [`PRIVACY.md`](file:///Users/etiennementrel/Documents/perso/kyara-manager/PRIVACY.md) for the full bilingual privacy policy.
