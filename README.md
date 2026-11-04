# 操 Kyara Manager — Pilote Automatique Open-Source pour Kyara.games

**Kyara Manager** est une extension Chrome open-source (Manifest V3) qui reprend toute l'analyse économique de **Kyara Helper** (cours 7j/30j, arbitrage `VENDRE` vs `RECYCLER`, détection de bons plans et classement probabiliste des boosters) tout en **automatisant intégralement** la gestion de ton compte et en **pilotant l'application en direct** sur [kyara.games](https://kyara.games).

---

## Nouveautés v1.1.0

1. **札 Ouverture Live des Boosters Conseillés (Pilotage de l'application)**
   - Au lieu d'ouvrir les boosters de façon invisible en arrière-plan, Kyara Manager **pilote directement la page `/ouvrir/<packId>` de Kyara.games** ([`pilotLiveBoosterOpening`](file:///Users/etiennementrel/Documents/perso/kyara-manager/content/content.js#L938-L1029)) :
     - Navigue vers le booster #1 conseillé via le routeur SvelteKit sans recharger la page.
     - Sélectionne automatiquement le multiplicateur optimal (`×1`, `×5`, `×10`).
     - Déclenche l'animation de déchirure du booster, retourne les cartes une par une en direct (`data-step="i:0" -> "i:1"`) avec les effets visuels/sonores de Kyara jusqu'à l'écran récapitulatif `.summary`.
     - Écoute l'événement natif `kyara:pull` pour journaliser les nouveaux personnages et notifier les tirages Légendaires/Mythiques.

2. **操 Connexion Instantanée & Auto-Injection (< 300ms)**
   - Si un onglet `kyara.games` est déjà ouvert au moment où tu charges ou mets à jour l'extension, le Service Worker ([`injectContentScriptIfNeeded`](file:///Users/etiennementrel/Documents/perso/kyara-manager/background/service-worker.js#L28-L42)) injecte automatiquement le script sans même avoir besoin de rafraîchir la page (`F5`).
   - Les requêtes `GET` de synchronisation s'exécutent désormais en parallèle comme le client officiel de Kyara, tandis que la file d'attente anti-rate-limit (`340ms * x-kyara-rush`) est réservée aux écritures (`POST`).

3. **キ Design System Natif Kyara.games**
   - Interface entièrement refondue avec la palette officielle de `kyara.games` (`--bg: #0e0d12`, `--panel: #15141a`, `--raise: #1e1c26`, vermillon `--acc: #ff4d2e`, or Chakra `--gold: #f5c518`, typographies `Unbounded`, `Zen Kaku Gothic New` et `JetBrains Mono`, sceaux Kanji `操 / 集 / 市 / 札 / 設`).
   - Le HUD flottant sur `kyara.games` est positionné en **bas à gauche** afin de ne jamais chevaucher d'autres barres en bas à droite.

4. **売 Auto-Vente, 転 Auto-Recyclage & 市 Flip Marché**
   - **Auto-Vente** : Remplit automatiquement tes 10 emplacements de vente dès qu'une carte est vendue, avec garde-fou anti-bradage à 70% de la médiane 7j.
   - **Auto-Recyclage** : Recycle les surplus non rentables tout en conservant toujours au moins 1 exemplaire pour la collection et en respectant `pinned`, `locked` et `resaleUntil`.
   - **Auto-Achat Flip & Cartes manquantes** : Scanne les annonces sous-cotées et achète automatiquement les flips rentables après déduction de la taxe de vente (5%) et des frais de dépôt (2%, min 1 ◆).

---

## Installation Locale (Mode Développeur)

1. Ouvre Google Chrome sur `chrome://extensions/`.
2. Active le **Mode développeur** (en haut à droite).
3. Clique sur **Charger l'extension non empaquetée** (ou clique sur **Recharger ↻** sur la carte *Kyara Manager* si elle est déjà chargée).
4. Sélectionne le dossier `/Users/etiennementrel/Documents/perso/kyara-manager`.

---

## Scripts de Développement & Packaging Chrome Web Store

```bash
# Vérifier la syntaxe de tous les modules
npm run check

# Lancer la suite de tests unitaires (8 tests)
npm test

# Régénérer les icônes PNG (16x16, 32x32, 48x48, 128x128)
npm run icons

# Générer les images promotionnelles Chrome Web Store (1400x560, 440x280, 1280x800)
npm run promo

# Générer l'archive prête pour le Chrome Web Store (dist/kyara-manager-cws.zip)
npm run package:cws
```

---

## Licence & Confidentialité

- Distribué sous licence [MIT](file:///Users/etiennementrel/Documents/perso/kyara-manager/LICENSE).
- Politique de confidentialité complète : [PRIVACY.md](file:///Users/etiennementrel/Documents/perso/kyara-manager/PRIVACY.md) (100% local, zéro serveur tiers, zéro télémétrie).
- Guide de contribution : [CONTRIBUTING.md](file:///Users/etiennementrel/Documents/perso/kyara-manager/CONTRIBUTING.md).
