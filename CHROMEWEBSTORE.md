# Chrome Web Store Listing — Kyara Manager (v1.1.0)

## Extension Details
- **Name**: Kyara Manager — Pilote Auto, Doublons, Marché & Boosters
- **Short Name**: Kyara Manager
- **Version**: `1.1.0`
- **Summary** (≤132 chars): Pilote automatique pour Kyara.games : auto-vente des doublons, auto-recyclage, achat-revente (flip) et ouverture live de boosters.
- **Category**: Workflow & Planning / Fun (Gaming)
- **Language**: Français (`fr`)
- **Package File**: [`dist/kyara-manager-cws.zip`](file:///Users/etiennementrel/Documents/perso/kyara-manager/dist/kyara-manager-cws.zip) (generated via `npm run package:cws`)

## Single Purpose Statement (Objectif unique)
- **FR** : Kyara Manager fournit aux joueurs du jeu de cartes à collectionner Kyara.games un tableau de bord analytique et des outils d'automatisation pour optimiser leur collection : arbitrage et auto-vente des doublons au prix du marché, auto-recyclage intelligent, scanner d'opportunités d'achat-revente rentables (flips) et recommandation d'ouverture live des boosters gratuits.
- **EN** : This extension provides automated collection management, duplicate selling/recycling, market deal scanning, and live recommended booster opening for a user's Kyara.games trading card game account.

## Permission Justifications (Justifications des autorisations CWS)

| Permission | Justification FR (à copier dans le Dashboard) | Justification EN |
|---|---|---|
| `storage` | L'autorisation 'storage' (chrome.storage.local) permet d'enregistrer localement sur la machine de l'utilisateur ses préférences d'automatisation (stratégie de prix, réserve minimale de Chakra, filtres de rareté pour l'auto-recyclage), le cache des prix du marché pour limiter les requêtes réseau, ainsi que le journal d'activité des transactions récentes. Aucune donnée n'est transmise vers l'extérieur. | Stores user automation preferences (pricing strategy, chakra reserve, auto-recycle rarity filters), cached market prices, and the local activity journal in `chrome.storage.local`. |
| `alarms` | L'autorisation 'alarms' (chrome.alarms) permet au service worker en Manifest V3 d'exécuter un cycle d'arrière-plan périodique (toutes les minutes) pour vérifier l'état des annonces sur le marché, relister les cartes expirées et exécuter les modules d'automatisation configurés par l'utilisateur. Les alarmes sont le mécanisme officiel préconisé par Google pour remplacer les minuteurs non persistants (setInterval). | Runs a periodic 1-minute alarm (`kyara-manager-tick`) so the Manifest V3 service worker can trigger scheduled automation checks reliably without relying on non-persistent timers. |
| `notifications` | L'autorisation 'notifications' (chrome.notifications) permet d'informer l'utilisateur via une notification système native lorsqu'un événement clé survient en arrière-plan : vente confirmée d'une carte sur le marché, achat réussi d'une carte sous-cotée rentable (flip), ou obtention d'une carte de rareté Légendaire ou Mythique lors d'un tirage de booster. | Displays desktop notifications when a listed card is sold on the market, when a profitable market flip is purchased, or when a Legendary/Mythic card is pulled from a booster. |
| `sidePanel` | L'autorisation 'sidePanel' (chrome.sidePanel) permet d'ouvrir le tableau de bord complet de Kyara Manager directement dans le volet latéral natif de Google Chrome, en parallèle du jeu kyara.games. Cela permet à l'utilisateur de surveiller ses gains (ROI), d'ajuster ses paramètres et d'analyser ses doublons sans interrompre sa navigation ni masquer sa partie. | Provides a persistent Chrome Side Panel dashboard (`sidepanel/sidepanel.html`) alongside `kyara.games` to monitor and configure Autopilot modules, duplicates, market flips, and booster recommendations. |
| `scripting` | L'autorisation 'scripting' (chrome.scripting.executeScript) est utilisée au moment de l'installation ou de la mise à jour de l'extension pour injecter immédiatement le script de contenu dans les onglets kyara.games déjà ouverts. Cela garantit une expérience utilisateur fluide en évitant d'obliger l'utilisateur à rafraîchir manuellement ses pages pour activer l'extension. | Automatically injects the content script into an already-open `kyara.games` tab when the extension is installed or updated so the user can connect immediately without refreshing the tab. |
| `host_permissions` (`https://*.kyara.games/*`) | L'accès hôte est strictement limité au domaine officiel du jeu (https://kyara.games/* et https://*.kyara.games/*). Il est nécessaire pour : 1) Injecter le script d'interface et le widget HUD flottant sur les pages du jeu. 2) Interroger les points d'accès de l'API de Kyara (https://kyara.games/api/*) avec la session active de l'utilisateur afin de récupérer l'inventaire des cartes, les prix médians du marché et d'effectuer les opérations d'auto-vente et de recyclage expressément autorisées par l'utilisateur. Aucun autre domaine ni historique de navigation général n'est accédé. | Injects the content script and floating HUD on `kyara.games` and communicates with the first-party `https://kyara.games/api/*` endpoints using the user's existing authenticated session. |

> **Note**: The `"tabs"` permission is intentionally omitted because `host_permissions` on `kyara.games` already grants scoped tab querying and messaging without triggering the "Read your browsing history" warning.

## Privacy Practices & Data Usage Disclosure
- **Remote Code**: No remote code is fetched or executed. All JavaScript and CSS are bundled locally within the extension package.
- **Data Collection**: Kyara Manager does **not** collect, transmit, or sell any personal data or browsing history to third-party servers. See [`PRIVACY.md`](file:///Users/etiennementrel/Documents/perso/kyara-manager/PRIVACY.md) for the full bilingual privacy policy.

---

## Chrome Web Store Storefront Assets (`promo/`)

All assets meet the strict 24-bit RGB (no alpha channel / sans canal alpha) Chrome Web Store requirements and are available in both **PNG 24-bit** and **JPEG 95%** in the [`promo/`](file:///Users/etiennementrel/Documents/perso/kyara-manager/promo/) directory:

| Emplacement CWS | Fichiers Recommandés | Dimensions | Statut Alpha |
|---|---|---|---|
| **Image promotionnelle en haut de la page** (Bannière Hero / Marquee) | `promo/promo-marquee-1400x560.png` ou `.jpg` | `1400 x 560` | `hasAlpha: no` |
| **Petite image promotionnelle** (Grille recherche CWS) | `promo/promo-small-440x280.png` ou `.jpg` | `440 x 280` | `hasAlpha: no` |
| **Capture d'écran #1** (Pilote Automatique & ROI) | `promo/screenshot-1-autopilot.png` ou `.jpg` | `1280 x 800` | `hasAlpha: no` |
| **Capture d'écran #2** (Doublons & Arbitrage) | `promo/screenshot-2-doublons.png` ou `.jpg` | `1280 x 800` | `hasAlpha: no` |
| **Capture d'écran #3** (Scanner Flips & Marché) | `promo/screenshot-3-marche.png` ou `.jpg` | `1280 x 800` | `hasAlpha: no` |
| **Capture d'écran #4** (EV Boosters & Tirage Live) | `promo/screenshot-4-boosters.png` ou `.jpg` | `1280 x 800` | `hasAlpha: no` |
| **Capture d'écran #5** (Sécurité & Sanctuaire Chakra) | `promo/screenshot-5-securite.png` ou `.jpg` | `1280 x 800` | `hasAlpha: no` |

> Pour régénérer toutes les images à tout moment : `npm run promo`.

