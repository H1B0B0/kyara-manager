# Fiabilisation 1.4.2

## Périmètre validé

Les tests utilisent des réponses Kyara et des API Chrome simulées. Ils vérifient les règles de décision, le routage des commandes et les effets envoyés à l'API. Aucun achat, recyclage ou tirage réel n'a été effectué pour cette validation.

Les vérifications TypeScript, les tests et le packaging passent. Le rendu visuel dans un navigateur et la migration entre deux versions installées depuis le Chrome Web Store restent à vérifier : l'environnement de travail bloque le serveur local et l'ouverture de fichiers locaux dans le navigateur de test.

## Causes identifiées

| Défaut | Conséquence | Correction |
| --- | --- | --- |
| `npm version` ne modifiait pas le manifeste | Un nouveau tag pouvait produire une archive portant encore l'ancien numéro Chrome | Synchronisation au changement de version et refus du build si les numéros diffèrent |
| En-tête codé en dur à `v1.4` | Impossible de voir la version réellement installée | Lecture de `runtime.getManifest().version` |
| Ancien marqueur d'injection conservé avec le HUD | Nouveau bundle ignoré dans une page déjà ouverte | Nettoyage du runtime précédent ; migration par rechargement des pages anciennes |
| Réessai d'une commande dans un autre onglet | Une réponse perdue pouvait répéter une transaction déjà exécutée | Ping et injection avant la commande ; une seule livraison de la transaction |
| Verrou de cycle limité à chaque script | Deux onglets ou une commande manuelle pouvaient agir simultanément | Web Lock couvrant la lecture, les contrôles et les écritures pour une même origine ; cadence auto partagée |
| Réglages historiques reliés par `||` | Un interrupteur désactivé pouvait rester fonctionnel | Normalisation des alias et réglages du panneau canoniques |
| Recyclage Turbo et booster quotidien hors contrôle de simulation | Écritures réelles possibles en simulation | Garde global sur toutes les écritures et simulation avant pilotage UI |
| Annonce disparue assimilée à une vente | Gains fictifs après une annulation ou une erreur réseau | Confirmation explicite `status: sold`, déduplication persistante des ventes |
| Collection ou annonces indisponibles remplacées par des tableaux vides | Décisions et statistiques construites sur des données manquantes | Échec explicite, conservation du dernier tableau valide |
| Vente réévaluée avec un champ `qty` absent des doublons | Décision incohérente avec le nombre réel d'exemplaires | Nouvelle lecture de la collection et des protections |
| Seuil de hausse dérivé d'un booléen | Conservation déclenchée dès une hausse d'environ 1 % | Seuil explicite de 20 % |

## Organisation

- `src/background/service-worker.ts` route une commande vers un seul onglet et sérialise les modifications partielles des réglages.
- `src/background/updates.ts` gère les états de mise à jour. Chaque onglet suspend les nouvelles opérations avant de répondre ; une opération en cours se termine, puis l'alarme réessaie l'installation.
- `src/content/operations.ts` protège les opérations complètes avec Web Locks. Le verrou est partagé par les onglets de la même origine, pas entre profils Chrome ou sous-domaines différents.
- `src/content/safety.ts` relit collection, annonces et cartes protégées avant vente ou recyclage. Les contrôles de disponibilité échouent si ces données sont incomplètes.
- `src/content/api.ts` bloque les écritures en simulation et celles d'un runtime supprimé. Les requêtes ont un délai maximal ; les écritures ambiguës après une erreur 503 ne sont pas rejouées.
- `src/content/snapshot.ts` mutualise les rafraîchissements simultanés dans un onglet. Une demande plus complète attend le rafraîchissement en cours avant de recommencer avec les options nécessaires.
- `src/content/page-hook.ts` est un fichier déclaré dans le monde MAIN. Il capture les réponses d'ouverture réussies sans injecter du JavaScript inline.

## Mise à jour Chrome

Chrome vérifie périodiquement les mises à jour ; une publication n'est pas distribuée instantanément à tous les utilisateurs. Un panneau d'extension ouvert peut retarder l'installation jusqu'au rechargement de l'extension. La nouvelle version écoute l'événement de téléchargement, attend les opérations en cours, affiche l'installation puis appelle `runtime.reload()`.

Le bouton « Vérifier » appelle `runtime.requestUpdateCheck()` à la demande, avec un délai local minimal entre vérifications. Le statut `throttled` de Chrome reste visible. Aucune interrogation périodique agressive du Store n'est ajoutée.

Les clients 1.4.1 doivent recevoir cette nouvelle version avant de bénéficier de ces correctifs. Pour un test immédiat d'une version Store déjà disponible : `chrome://extensions` → Mode développeur → Mettre à jour. Une extension chargée localement se recharge avec le bouton Recharger ; elle n'est pas remplacée par les publications du Store.

Référence : [cycle de mise à jour Chrome](https://developer.chrome.com/docs/extensions/develop/concepts/extensions-update-lifecycle).

## Vente rapide et parallélisation

- Le marché n'offre que 10 créneaux : le débit de vente dépend du temps passé par chaque annonce. Le profil de vente (rapide / normal / patient) est choisi par carte et fixe prix, délai de stagnation, pas de baisse et recyclage de repli (`src/lib/analytics/sell-profile.ts`).
- Les tâches indépendantes (boosters, missions, recyclage + vente) tournent en parallèle ; elles ne partagent que le registre de cartes (`src/content/safety.ts`), dont les réservations sont synchrones : deux tâches ne peuvent pas dépenser le même exemplaire. L'achat attend la fin pour partir d'un solde à jour.
- Toutes les écritures passent par une seule file espacée (300 ms + `x-kyara-rush`). Le parallélisme ne contourne donc pas la limite du serveur : il supprime les attentes inutiles (lectures répétées, étapes enchaînées sans dépendance).
- Un 429 est rejoué ; un 503 sur une écriture ne l'est jamais (la transaction a pu aboutir).

## Recette restante dans Chrome

1. Avec ~100 doublons : lancer « ⚡ Écouler » et vérifier dans le journal les mises en vente au prix plancher, les relances moins chères après 30 min et le recyclage des cartes sans preneur. Vérifier qu'aucune annonce n'est retirée alors qu'elle est déjà au prix plancher.


2. Charger `dist/` après le build, ouvrir Kyara et vérifier le HUD, les six onglets, les erreurs de connexion et les largeurs de panneau 320, 400 et 600 px.
3. Activer la simulation et vérifier dans les requêtes réseau qu'aucune écriture ne part lors d'un cycle, du recyclage Turbo, du pack quotidien ou d'une action manuelle.
4. Désactiver boosters, missions et marché ; vérifier leur état après fermeture du panneau puis redémarrage de Chrome.
5. Ouvrir deux onglets Kyara de même origine ; déclencher un cycle et une action manuelle simultanément. Une seule opération doit agir.
6. Protéger une carte, garder plusieurs exemplaires et comparer l'interface aux quantités réelles après une vente ou un recyclage autorisé.
7. Tester une ouverture native avec une réponse `cards` puis une réponse groupée `results`. Le jeu peut modifier ses sélecteurs DOM ; en cas d'interface ambiguë avant le clic, le repli API conserve `maxChakra: 0`. Après un clic non confirmé, aucune deuxième ouverture n'est tentée automatiquement.
8. Installer une version Store suivante avec le panneau ouvert, puis pendant une opération. Vérifier l'attente, l'installation, la reprise des onglets existants et la conservation des réglages.

## Limites à conserver en tête

Les prix, probabilités et gains prévisionnels restent des estimations. Le scanner examine les pages récentes et les moins chères, sans couvrir tout le marché. Les sélecteurs de l'ouverture live et la forme des réponses Kyara restent dépendants du site ; les tests simulés ne remplacent pas une recette sur sa version réelle.

Les statistiques précédemment faussées ne sont pas réécrites automatiquement : les événements historiques disponibles ne suffisent pas à reconstituer les ventes réelles. Le bouton de remise à zéro permet de repartir d'une période mesurée avec les nouvelles règles.
