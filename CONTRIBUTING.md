# Guide de Contribution — Kyara Manager

Merci de votre intérêt pour **Kyara Manager** ! Ce document détaille le flux de développement local, l'architecture du projet et les conventions à respecter pour proposer une Pull Request.

---

## 1. Prérequis

- **Google Chrome** (ou tout navigateur Chromium compatible Manifest V3, version 116+)
- **Node.js** `>= 18.0.0` (Node 20 LTS recommandé) pour exécuter les tests unitaires, la vérification syntaxique et le script de packaging Chrome Web Store
- **Python 3** (optionnel, uniquement pour régénérer les icônes PNG via `npm run icons`)

Aucune étape de transpilation (Webpack/Vite) n'est requise : l'extension utilise du JavaScript ES Modules natif directement exécutable par Chrome.

---

## 2. Installation locale (`chrome://extensions`)

1. Clonez le dépôt :
   ```bash
   git clone https://github.com/H1B0B0/kyara-manager.git
   cd kyara-manager
   ```
2. Ouvrez Chrome et accédez à `chrome://extensions`.
3. Activez le **Mode développeur** (en haut à droite).
4. Cliquez sur **Charger l'extension non empaquetée** (*Load unpacked*) et sélectionnez le dossier racine `kyara-manager/`.
5. Connectez-vous sur [https://kyara.games](https://kyara.games) puis ouvrez le panneau latéral **Kyara Manager**.

---

## 3. Structure du projet

```text
kyara-manager/
├── manifest.json              # Configuration Chrome Extension Manifest V3
├── background/
│   └── service-worker.js      # Orchestrateur MV3, file d'actions, alarmes et pont API
├── content/
│   └── content.js             # Pont fetch authentifié + Pilote UI live sur /ouvrir/:id
├── lib/
│   └── analytics.js           # Moteur pur : normalisation, doublons, recyclage, flip, boosters
├── sidepanel/
│   ├── index.html             # Structure du tableau de bord (Side Panel)
│   ├── styles.css             # Design system japonais sombre (--bg: #0e0d12, --acc: #ff4d2e)
│   └── sidepanel.js           # Logique d'interface, graphiques et contrôles temps réel
├── scripts/
│   ├── package-cws.mjs        # Génération de l'archive dist/kyara-manager-cws.zip
│   └── generate-icons.py      # Génération des icônes PNG (16, 32, 48, 128)
└── tests/
    └── analytics.test.js      # Suite de tests unitaires (node:test)
```

---

## 4. Commandes de vérification et de build

Avant toute soumission, assurez-vous que les trois commandes suivantes passent sans erreur :

- **Vérification syntaxique des modules** :
  ```bash
  npm run check
  ```
- **Exécution des tests unitaires** :
  ```bash
  npm test
  ```
- **Empaquetage Chrome Web Store (`dist/kyara-manager-cws.zip`)** :
  ```bash
  npm run package:cws
  ```

---

## 5. Tests en mode Simulation (Dry-Run)

Lorsque vous développez ou modifiez des règles d'automatisation (auto-vente, recyclage, flip marché ou ouverture de boosters) :
1. **Activez toujours le mode `Dry-Run` (Simulation)** dans l'onglet **Automatisation** du Side Panel lors de vos premiers essais.
2. Vérifiez dans le **Journal d'activité** que les cartes ciblées, les prix calculés et les garde-fous (protection shiny, réserve d'exemplaires, budget) correspondent exactement au comportement attendu.
3. Pour le pilote d'ouverture de boosters (`/ouvrir/:id`), testez à la fois le pilotage live avec un onglet `https://kyara.games` ouvert et le repli API si nécessaire.

---

## 6. Directives pour les Pull Requests

1. Créez une branche dédiée depuis `main` (`feat/ma-fonctionnalite` ou `fix/mon-correctif`).
2. Préservez l'architecture **zéro dépendance runtime** et le respect strict de la vie privée (aucun appel réseau hors `https://kyara.games/api/*`).
3. Ajoutez ou mettez à jour les tests unitaires dans `tests/analytics.test.js` pour toute logique métier modifiée dans `lib/analytics.js`.
4. Respectez la palette et les variables CSS du thème Kyara.games dans `sidepanel/styles.css` (`--bg: #0e0d12`, `--acc: #ff4d2e`, typographies *Cinzel*, *Plus Jakarta Sans* et *JetBrains Mono*).
5. Vérifiez que `npm run check && npm test && npm run package:cws` réussit avant d'ouvrir votre Pull Request.
