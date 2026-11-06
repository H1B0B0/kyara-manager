# Kyara Manager

Extension Chrome Manifest V3 pour [kyara.games](https://kyara.games) : panneau de suivi, gestion des doublons, scanner du marché, envies de collection et automatisation des boosters gratuits.

## Fonctionnalités

- Analyse des doublons : prix historiques, profondeur des annonces, estimation du produit net et décision vendre / recycler / conserver.
- Vente et recyclage automatiques avec contrôle des exemplaires disponibles, protections, annonces actives et réserve de collection.
- Scanner de flips après frais, achats de cartes manquantes et liste d'envies avec budget.
- Ouverture live de boosters, recommandations de collection ou de valeur estimée, journal et suivi des tirages.
- Mode simulation bloquant toutes les écritures API.
- Panneau latéral, cockpit plein écran, HUD dans Kyara et état des mises à jour.

Les résultats économiques sont des estimations ; le scanner ne couvre pas l'ensemble du marché. Les actions nécessitent un onglet Kyara connecté.

## Développement

Node 24 recommandé. Les versions prises en charge suivent les dépendances Vite et Vitest : voir `engines.node` dans `package.json`.

```bash
npm ci
npm run check
npm test
npm run build
```

Dans Chrome 116 ou supérieur :

1. Ouvrir `chrome://extensions` et activer le mode développeur.
2. Choisir **Charger l'extension non empaquetée**, puis sélectionner le dossier `dist/`.
3. Ouvrir Kyara et le panneau de l'extension. Utiliser la simulation pour la première vérification.
4. Après un nouveau build, cliquer sur **Recharger** dans `chrome://extensions`.

`npm run dev` lance Vite pour le panneau ; les API Chrome nécessitent un contexte d'extension. Pour un aperçu avec données fictives, exécuter `node scripts/build-preview.mjs` après le build. Il produit `dist/sidepanel/preview.html` et une variante autonome `preview-standalone.html`. Ces aperçus sont effacés par le prochain packaging et ne sont pas livrés au Store.

## Publication

```bash
npm run package:cws
```

Cette commande reconstruit les sources et crée `dist/kyara-manager-cws.zip`. Le build refuse des numéros différents entre `package.json` et `manifest.json`. Le script de cycle `version` synchronise le manifeste lors de `npm version`.

Les commandes `npm run release` et `npm run release:minor` créent respectivement une version patch ou mineure, puis poussent `main` et les tags. La CI vérifie TypeScript, lance les tests et produit l'archive. Les tags `v*` déclenchent la soumission au Chrome Web Store lorsque les secrets de publication sont configurés. Les erreurs de soumission font échouer cette étape.

Une publication GitHub n'est pas une confirmation de disponibilité sur le Store : vérifier l'état de validation et de diffusion dans la console Chrome Web Store.

## Mises à jour

Les installations Store reçoivent les versions que Chrome distribue. Le panneau affiche la version réellement installée et propose une vérification manuelle. Une mise à jour téléchargée attend la fin des opérations de l'extension, affiche son installation, puis recharge l'extension.

Une extension chargée localement se recharge avec le bouton **Recharger** ; elle ne reçoit pas les versions du Store. Pour vérifier immédiatement une nouvelle version Store disponible, utiliser **Mettre à jour** dans `chrome://extensions`, sans désinstaller.

Détails techniques, causes corrigées et recette restant à effectuer : [docs/RELIABILITY.md](docs/RELIABILITY.md).

## Architecture

- `src/background/` : routage, réglages, alarmes et cycle de mise à jour.
- `src/content/` : API Kyara, état de session, disponibilité des cartes, synchronisation et automatismes.
- `src/lib/analytics/` : calculs économiques et recommandations.
- `src/sidepanel/` : interface React et styles.
- `tests/` : calculs et tests de régression des parcours de l'extension.

## Projet

[Changelog](CHANGELOG.md) · [Contribution](CONTRIBUTING.md) · [Confidentialité](PRIVACY.md) · [Licence MIT](LICENSE)
