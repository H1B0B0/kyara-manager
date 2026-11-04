# Changelog

Toutes les modifications notables de **Kyara Manager** sont documentées dans ce fichier.

Le format est basé sur [Keep a Changelog](https://keepachangelog.com/fr/1.1.0/), et ce projet adhère au [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.1.0] - 2026-11-04

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
