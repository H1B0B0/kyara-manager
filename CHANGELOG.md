# Changelog

Toutes les modifications notables de **Kyara Manager** sont documentées dans ce fichier.

Le format est basé sur [Keep a Changelog](https://keepachangelog.com/fr/1.1.0/), et ce projet adhère au [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.5.0] - 2026-11-10

### Ajouté
- **Rythme de vente** (Autopilote et Réglages) : *Adaptatif* (par défaut), *Rapide*, *Normal* ou *Patient*. En adaptatif, les cartes bon marché (< 12 ◆) sont vendues au prix le plus bas du marché, celles de prix moyen suivent la stratégie choisie, les cartes chères (≥ 60 ◆) visent la médiane 7 j sans dépasser de 5 % l'offre la moins chère. Seuils réglables.
- **Relance dégressive** : une annonce stagnante (30 min en rapide, 3 h en normal, 12 h en patient) est retirée puis relancée au moins 1 ◆ (8 %, 5 % ou 3 %) sous son ancien prix ; au prix plancher, la carte est recyclée si le recyclage est autorisé plutôt que bradée. Aucune annonce déjà au plancher n'est retirée inutilement.
- Bouton **⚡ Écouler** : écoule les doublons en mode rapide pour un passage, sans modifier les réglages.

### Corrigé
- Les cartes dont le verdict était « Recycler » mais dont la rareté n'est pas dans les rarités recyclables restaient bloquées indéfiniment : elles sont désormais mises en vente.
- En mode rapide, les cartes à vente lente ne sont plus mises de côté (« Conserver ») : elles partent au prix plancher.

### Amélioré
- **Parallélisation** : ouverture des boosters, missions, recyclage et vente s'exécutent en même temps et une tâche en échec n'annule plus les autres. L'achat démarre ensuite avec le solde à jour.
- Les lectures du marché des cartes suivantes se font pendant la mise en vente de la carte courante (5 en parallèle) ; la détection des ventes vérifie les annonces disparues en parallèle.
- Un seul registre de cartes (2 requêtes) remplace 2 requêtes par carte : recyclage et vente réservent leurs exemplaires de façon atomique et ne peuvent plus dépenser deux fois la même copie.
- File d'écriture prioritaire : annonces, retraits et ouvertures de boosters passent devant un recyclage de masse ; écart entre écritures ramené de 340 à 300 ms (toujours adaptatif via `x-kyara-rush`).
- Un cycle s'arrête dès que l'autopilote est désactivé ou qu'une mise à jour est en attente.

## [1.4.2] - 2026-11-06

### Corrigé
- Version du manifeste synchronisée lors de `npm version`, version réelle affichée dans le panneau, reconstruction systématique avant packaging.
- Mise à jour affichée dans le panneau, vérification manuelle et application automatique après la fin des opérations en cours.
- Réinjection avec nettoyage des anciens écouteurs et timers ; rechargement des onglets provenant des versions anciennes sans nettoyage disponible.
- Verrouillage des opérations entre onglets d'une même origine ; aucune répétition d'une transaction après perte de sa réponse ou réponse HTTP 503.
- Mode simulation bloquant toutes les écritures API, y compris les anciens chemins de recyclage Turbo et le booster quotidien.
- Synchronisation des réglages historiques et de ceux du panneau ; les interrupteurs boosters, missions, marché et envies sont effectivement pris en compte.
- Vente et recyclage vérifiés sur la collection et les annonces réelles, protections et nombre d'exemplaires conservés compris.
- Retrait des recyclages aveugles d'annonces stagnantes ; les cartes libérées sont réévaluées.
- Comptabilisation des ventes uniquement sur confirmation serveur, sans double comptage entre onglets ; journal et compteurs sérialisés.
- Ouvertures non confirmées exclues des statistiques, suppression des doublons de tirages et du script inline incompatible avec certaines CSP.
- Conservation de l'état des onglets, réglages enregistrés avant confirmation, erreurs de connexion visibles et navigation au clavier.
- Envies limitées aux cartes sélectionnées dans le catalogue, budget validé et autorisation d'achat automatique transmise par carte.
- CI sur Node 24, compatible avec les dépendances installées ; les erreurs de publication ne sont plus masquées.

### Validation
- 62 tests automatisés couvrant calculs, API, opérations concurrentes, réglages, routage, mises à jour et sécurité des automatismes.
- Vérification TypeScript avec détection des imports et paramètres inutilisés ; build et archive Chrome Web Store vérifiés.
- Voir [la note de fiabilisation](docs/RELIABILITY.md) pour les limites et les scénarios de recette Chrome.

## [1.4.0] - 2026-11-06

### Added
- **Refonte intégrale React 19 + TypeScript** : Remplacement complet du frontend HTML/JS par une application React 19 typée, fluide et modulaire avec Vite.
- **Nouvel onglet « Mes Envies » (Wishlist)** : Liste personnalisée des cartes ciblées pour compléter ses collections avec budget maximum et option d'auto-achat automatique sous réserve de Chakra disponible.
- **Filtres de vente avancés « Médiane / Moyenne des 20 dernières ventes »** : Nouvelle stratégie de fixation des prix basée sur la profondeur réelle du marché en direct, permettant d'éviter les offres hors marché en période de forte baisse ou de krach (ex: Fairy Tail).
- **Tableau de chasse « Butin Autopilot — Meilleurs Tirages »** : Galerie visuelle récapitulant instantanément les personnages les plus rares (Mythiques, Légendaires, Épiques) tirés lors des sessions en pilote automatique.
- **Architecture modulaire stricte** : Décomposition complète du content script et des feuilles de style en micro-modules indépendants et maintenables (< 500 lignes).

### Changed
- Amélioration de la vélocité de rotation des 10 créneaux du marché et gestion des annonces stagnantes (> 2h).
- Pédagogie décisionnelle enrichie avec explications claires des calculs de rentabilité et probabilités de vente.
- Suppression de tous les fichiers legacy et optimisation de la taille du package Chrome Web Store.

## [1.3.0] - 2026-11-05
- Améliorations de performance, gestion du Turbo Recyclage et garde-fou Pitié Mythique.

### Added
- **Pilote UI Live d'ouverture de boosters (`/ouvrir/:id`)** : Navigation automatique de l'onglet actif `kyara.games` vers `/ouvrir/:id`, déclenchement visuel du bouton d'ouverture (« Ouvrir le booster »), clic automatique sur « Tout révéler » pendant la révélation des cartes et synchronisation des tirages réels dans le journal.
- **Synchronisation instantanée de session & auto-injection du script de contenu** : Détection immédiate de la connexion sur `https://kyara.games` avec ré-injection automatique de `content/content.js` sur les onglets déjà ouverts sans nécessiter de rechargement manuel.
- **Script de packaging Chrome Web Store (`npm run package:cws`)** : Génération automatisée et reproductible de l'archive `dist/kyara-manager-cws.zip` prête pour la publication sur le Chrome Web Store.

### Changed
- **Refonte graphique complète aux couleurs de Kyara.games** : Adoption du design system sombre d'inspiration japonaise fidèle au site officiel (`--bg: #0e0d12`, `--acc: #ff4d2e`, surfaces `--s1: #16141d` / `--s2: #1d1b26`, typographies *Cinzel*, *Plus Jakarta Sans* et *JetBrains Mono*, et badges de rareté officiels `R`, `SR`, `SSR`, `UR`, `SP`).

## [1.0.0] - 2026-10-15

### Added
- **Tableau de bord analytique complet (Side Panel MV3)** : Vue d'ensemble du solde Kyara, valeur estimée de la collection, répartition par rareté et historique des ventes/achats.
- **Moteur d'automatisation avec mode Simulation (Dry-Run)** :
  - Auto-vente intelligente des doublons selon le prix plancher du marché et les seuils de rareté.
  - Auto-recyclage des cartes surnuméraires à faible valeur.
  - Scanner d'opportunités de Flip Marché avec calcul du profit net après taxe de 5 %.
  - Planificateur d'ouverture de boosters avec garde-fous de budget et arrêt sur rareté cible.
- **Suite de tests unitaires (`tests/analytics.test.js`)** couvrant l'intégralité des calculs analytiques et des règles d'automatisation.
