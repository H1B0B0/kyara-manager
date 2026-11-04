# Politique de Confidentialité / Privacy Policy — Kyara Manager

*Dernière mise à jour / Last updated : 2026-11-04*

---

## 🇫🇷 Version Française

### 1. Principe fondamental : 100 % Local & Zéro Collecte
**Kyara Manager** est une extension navigateur open-source fonctionnant intégralement en local sur votre appareil. L'extension **ne collecte, ne stocke sur des serveurs tiers, ne vend et ne transmet aucune donnée personnelle ou donnée de navigation** à l'équipe de développement ou à quelque tiers que ce soit.

### 2. Stockage des données (`chrome.storage.local`)
Toutes les données utilisées pour le fonctionnement de l'extension sont conservées exclusivement en local dans votre navigateur via l'API `chrome.storage.local` :
- **Configuration et règles d'automatisation** (filtres de rareté, seuils de prix, mode Dry-Run, cadence d'ouverture).
- **Cache analytique temporaire** (inventaire synchronisé, historique des transactions et statistiques de session).
- **Journal d'activité local** (limité aux dernières actions effectuées par l'extension).

Vous pouvez effacer l'intégralité de ces données à tout moment en supprimant l'extension ou en vidant les données locales depuis le panneau latéral.

### 3. Communications réseau et Authentification
- **Domaine unique autorisé (`https://kyara.games/*`)** : Kyara Manager communique uniquement et directement avec l'API officielle `https://kyara.games/api/*`.
- **Session existante** : L'extension utilise la session authentifiée déjà active dans votre navigateur sur `kyara.games`. Aucun mot de passe, identifiant ou jeton d'authentification n'est extrait ni envoyé vers un serveur externe.
- **Zéro télémétrie / Zéro analytique tiers** : L'extension n'intègre aucun script de suivi (pas de Google Analytics, Sentry, Mixpanel ou serveur intermédiaire).

### 4. Justification des permissions Chrome Web Store
- `storage` : Sauvegarde locale de vos préférences, règles d'automatisation et statistiques de collection dans `chrome.storage.local`.
- `sidePanel` : Affichage du tableau de bord analytique et des contrôles dans le panneau latéral natif de Chrome.
- `alarms` : Exécution périodique optionnelle des cycles d'automatisation lorsque l'option est activée par l'utilisateur.
- `tabs` & `scripting` : Synchronisation avec l'onglet `https://kyara.games/*` ouvert et pilotage de l'interface d'ouverture de boosters (`/ouvrir/:id`) à la demande de l'utilisateur.
- `host_permissions` (`https://kyara.games/*`) : Requêtes directes vers `https://kyara.games/api/*` pour lire l'inventaire et exécuter les actions commandées par l'utilisateur.

### 5. Contact & Code source
Le code source complet est public et auditable sur GitHub : [https://github.com/H1B0B0/kyara-manager](https://github.com/H1B0B0/kyara-manager). Pour toute question relative à la confidentialité, ouvrez une issue sur le dépôt GitHub.

---

## 🇬🇧 English Version

### 1. Core Principle: 100% Local & Zero Data Collection
**Kyara Manager** is an open-source browser extension that operates strictly locally on your device. The extension **does not collect, store on external servers, sell, or transmit any personal data or browsing activity** to the developers or any third party.

### 2. Local Data Storage (`chrome.storage.local`)
All data required by the extension is stored exclusively inside your browser using `chrome.storage.local`:
- **User configuration and automation rules** (rarity filters, price thresholds, Dry-Run toggle, booster pacing).
- **Local analytics cache** (synced collection snapshot, transaction history, and session metrics).
- **Local activity logs** (bounded history of actions performed by the extension).

You can permanently delete all stored data at any time by uninstalling the extension or clearing the local state from the side panel.

### 3. Network Communication & Authentication
- **Single Authorized Origin (`https://kyara.games/*`)**: Kyara Manager communicates exclusively and directly with `https://kyara.games/api/*`.
- **Existing Browser Session**: The extension relies on your existing authenticated session on `kyara.games`. Credentials, cookies, or session tokens are never exported or transmitted to any external server.
- **Zero Telemetry / Zero Analytics**: No third-party tracking, telemetry, crash reporting, or external analytics SDKs are included.

### 4. Chrome Web Store Permissions Justification
- `storage`: Persists user settings, automation thresholds, and collection analytics locally via `chrome.storage.local`.
- `sidePanel`: Renders the Kyara Manager dashboard inside Chrome's native Side Panel.
- `alarms`: Triggers optional periodic background checks when explicitly enabled by the user.
- `tabs` & `scripting`: Connects to active `https://kyara.games/*` tabs and drives the live booster opening UI (`/ouvrir/:id`) when initiated by the user.
- `host_permissions` (`https://kyara.games/*`): Communicates directly with `https://kyara.games/api/*` to fetch inventory data and execute user-configured actions.

### 5. Contact & Open-Source Transparency
The full source code is publicly available for inspection at [https://github.com/H1B0B0/kyara-manager](https://github.com/H1B0B0/kyara-manager). If you have any questions regarding privacy, please open an issue on the GitHub repository.
