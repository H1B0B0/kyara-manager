# Security Policy / Politique de Sécurité

## Versions supportées / Supported Versions

Seule la dernière version publiée sur la branche `main` et sur le Chrome Web Store reçoit des correctifs de sécurité.

| Version | Supportée          |
| ------- | ------------------ |
| 1.1.x   | :white_check_mark: |
| < 1.1.0 | :x:                |

## Modèle de sécurité de Kyara Manager

- **Exécution 100 % locale** : Toutes les données de configuration et d'analyse résident dans `chrome.storage.local`.
- **Périmètre d'hôte restreint** : Les permissions réseau (`host_permissions`) et d'injection (`content_scripts`) sont strictement limitées à `https://kyara.games/*`.
- **Absence de code distant** : Conformément aux exigences Manifest V3, aucun code externe n'est téléchargé ou évalué dynamiquement (`eval` interdit).
- **Manipulation DOM sécurisée** : L'interface du panneau latéral échappe systématiquement les chaînes dynamiques ou utilise des nœuds DOM natifs.

## Signaler une vulnérabilité / Reporting a Vulnerability

Si vous identifiez une faille de sécurité (par exemple : injection XSS dans le panneau latéral, fuite de données inter-origines ou contournement des garde-fous d'automatisation) :

1. **Ne publiez pas d'issue publique immédiate** contenant un exploit fonctionnel.
2. Utilisez la fonctionnalité **Report a vulnerability** (Security Advisories privées) du dépôt GitHub :  
   `https://github.com/H1B0B0/kyara-manager/security/advisories/new`
3. Décrivez clairement :
   - Les étapes de reproduction ;
   - Le composant impacté (`content/content.js`, `background/service-worker.js`, `sidepanel/sidepanel.js`, `lib/analytics.js`) ;
   - L'impact potentiel pour l'utilisateur.

Nous accusons réception des signalements sous **72 heures** et publions un correctif dès validation.
