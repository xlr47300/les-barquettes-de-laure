> Version consolidée : suivre INSTALLATION-STABILISATION.md avant toute installation. Ne pas relancer setupLaure sur une installation existante.

# Les Barquettes de Laure — Site public + Gestion V1

**Version préparée le 30 octobre 2026. Non publiée et non connectée en production.**

Ce projet reprend le site existant et ajoute une gestion privée adaptée au téléphone.
Toutes les références de commandes, les stocks et les paiements sont enregistrés via Google Apps Script dans Google Sheets. **Aucune donnée personnelle ne doit être placée dans le classeur public.**

## 1. Contenu du dépôt

| Emplacement | Usage |
|---|---|
| `index.html`, `support.js`, `site-data.js`, `uploads/` | Site d'origine, conservé et raccordé à l'API |
| `laure-order.js` | Réservation sécurisée, vérification Turnstile, confirmation après enregistrement |
| `gestion/index.html`, `gestion/style.css`, `gestion/app.js` | Espace Laure : accueil, commandes, cuisine, clients, catalogue, retraits |
| `functions/_middleware.js`, `functions/lib/` | Vérification d'identité Cloudflare Access et connexion à Apps Script |
| `functions/api/` | API publique de réservation et API privée de gestion |
| `apps-script/Code.gs` | Moteur Google Sheets, gestion de stock, enregistrement, notifications |
| `_routes.json`, `_headers`, `.gitignore` | Configuration Cloudflare Pages et sécurité |
| `tests/backend.test.cjs` | Tests automatiques du moteur de réservation |

## 2. Architecture

```
GitHub (dépôt existant)
  → Cloudflare Pages
     ├─ /                 site public
     ├─ /api/order        API publique (Turnstile + activation explicite)
     ├─ /gestion/         interface privée (Cloudflare Access)
     └─ /api/admin        API privée (Access JWT vérifié côté serveur)
         → Apps Script (clé partagée stockée sur le serveur)
             ├─ Catalogue Google Sheets existant : PLATS / CRÉNEAUX / FORMULES
             └─ Google Sheets privé créé par setupLaure : COMMANDES / LIGNES / JOURNAL
```

Aucun secret n'est transmis au navigateur ou stocké dans GitHub. Les accès privés échouent de manière sécurisée si les variables Cloudflare Access ne sont pas configurées. Les commandes publiques restent désactivées jusqu'à l'activation explicite de `ORDERS_ENABLED`.

## 3. Installer Google Apps Script

1. Utiliser le **compte Google de Laure** ou un compte dédié à son activité, avec les droits d'édition sur le classeur catalogue.
2. Dans [script.google.com](https://script.google.com), créer un projet Apps Script autonome, nommé `Barquettes de Laure - Backend`.
3. Copier **tout** le contenu de `apps-script/Code.gs` dans le fichier `Code.gs` du projet. Ne pas déposer `Code.gs` dans un répertoire public accessible comme une API.
4. Dans **Paramètres du projet → Propriétés du script**, définir :

| Propriété | Valeur |
|---|---|
| `CATALOG_SPREADSHEET_ID` | `1yun-qS8TDI-II8BNatOI5oRrwfWl5Oep5-H1StvEJeE` (classeur déjà référencé dans le site) |
| `API_SHARED_SECRET` | Chaîne aléatoire d'au moins **32 caractères**. Générer par exemple avec `openssl rand -hex 32`. |
| `NOTIFY_EMAIL` | Adresse réelle sur laquelle Laure souhaite recevoir les notifications. Facultative pour les tests. |

5. Sélectionner et exécuter **une seule fois** `setupLaure()`, puis accepter les autorisations Google requises. Cette fonction vérifie le catalogue, crée ou réutilise un fichier **Gestion privée**, puis configure les onglets `COMMANDES`, `LIGNES` et `JOURNAL`. Son URL apparaît dans le journal d'exécution.
6. Vérifier que la propriété `PRIVATE_SPREADSHEET_ID` a été créée automatiquement dans les propriétés du script. Ne jamais publier ce fichier sur le Web ni le partager en lecture publique.
7. Choisir **Déployer → Nouveau déploiement → Application Web**. Sélectionner **Exécuter en tant que moi** et **Qui a accès : Tout le monde** pour permettre uniquement aux fonctions Cloudflare de contacter ce script. **Le secret partagé est obligatoire : l'URL seule ne donne aucun accès aux commandes.**
8. Copier l'URL du déploiement qui se termine par `/exec`.

Si le script est modifié plus tard, déployer une **nouvelle version** dans le déploiement existant ; enregistrer le code ne suffit pas pour actualiser la Web App.

## 4. Préparer Cloudflare Pages

1. Conserver le dépôt GitHub existant `xlr47300/les-barquettes-de-laure`. **Faire d'abord une branche de test**, puis examiner les modifications avant de les fusionner vers `main` (la branche `main` peut être connectée à la publication automatique).
2. Copier les fichiers et dossiers de cette version à la racine du dépôt, en conservant l'image d'origine et les autres fichiers existants.
3. Dans le projet Cloudflare Pages connecté au dépôt : **framework : aucun**, **commande de build : vide**, **répertoire de sortie : `.`**. Le dossier `functions/` doit être présent à la racine du dépôt.
4. Dans **Settings → Variables and Secrets**, configurer les valeurs suivantes pour le bon environnement (production ou preview) :

| Variable | Type | Valeur |
|---|---|---|
| `APPS_SCRIPT_URL` | Secret | URL Apps Script `/exec` |
| `API_SHARED_SECRET` | Secret | **La même valeur** que dans les propriétés Apps Script |
| `ACCESS_TEAM_DOMAIN` | Variable | Nom du domaine de l'équipe, par ex. `mon-equipe.cloudflareaccess.com` |
| `ACCESS_AUD` | Variable | AUD exact de l'application Cloudflare Access |
| `ADMIN_EMAILS` | Variable | Adresses autorisées séparées par des virgules |
| `TURNSTILE_SITE_KEY` | Variable | Clé publique Turnstile configurée pour le domaine du site |
| `TURNSTILE_SECRET` | Secret | Clé secrète du même widget Turnstile |
| `ORDERS_ENABLED` | Variable | `false` pendant l'installation et les essais ; `true` après validation |

5. Redéployer le site après modification des variables. Aucune de ces valeurs ne doit apparaître dans les fichiers GitHub.

## 5. Protéger l'espace Laure (obligatoire)

1. Dans Cloudflare **Zero Trust → Access → Applications**, créer une **application Self-hosted**.
2. Configurer les destinations de l'application pour le domaine public utilisé avec les chemins `/gestion` (et ses sous-chemins) **et** `/api/admin`, avec le **même AUD**. Vérifier la couverture de `/gestion/`.
3. Créer une politique **Allow** limitée aux adresses de `ADMIN_EMAILS` ; identification par code e-mail ou fournisseur d'identité.
4. Récupérer dans Access le **Application Audience (AUD) Tag** et le domaine de l'équipe. Reporter ces deux valeurs dans Cloudflare Pages.
5. Laisser l'option **Cookie Path Attribute désactivée**, afin que le navigateur puisse transmettre le cookie d'application de `/gestion/` à `/api/admin` sur le même domaine. Un middleware Pages effectue en plus la **vérification cryptographique du JWT**, de l'émetteur, de l'AUD, de sa durée de validité et de l'e-mail.
6. Tester en navigation privée : **un utilisateur non autorisé ne doit pouvoir accéder ni à `/gestion/`, ni à `/api/admin`**. Tester aussi la protection sur les éventuels domaines de preview Pages.

Sans cette configuration, l'espace privé affiche volontairement un refus d'accès ; ce n'est pas un dysfonctionnement.

## 6. Activer les réservations publiques

Créer un widget **Cloudflare Turnstile**, ajouter le domaine Pages ou le domaine personnalisé effectivement utilisé, et reporter ses deux clés dans les variables Cloudflare. Avant l'ouverture des commandes, vérifier :

1. Le Google Sheets du catalogue est accessible en lecture par le site. S'il ne répond pas, le site empêche la prise de commande au lieu d'afficher des plats fictifs.
2. Créer un créneau futur avec au moins une place disponible ; vérifier la liste des plats et les stocks dans `PLATS`.
3. Réaliser une **commande de test** avec une adresse et un téléphone fictifs : vérifier la référence créée, la ligne `COMMANDES`, les lignes `LIGNES`, la décrémentation du stock et d'une place du créneau.
4. Vérifier la notification e-mail à Laure et l'apparition de la commande dans son espace privé. **La notification peut échouer sans annuler la commande : le fichier privé reste la référence.**
5. Vérifier le changement de statut, le règlement et une annulation (stock et place rétablis), le refus du surstock, et deux réservations simultanées de la dernière portion.
6. Tester la consultation sur téléphone, puis fixer `ORDERS_ENABLED=true` et redéployer.

**Important :** une demande de réservation est enregistrée avec le statut `À confirmer`. Elle n'est pas présentée comme une commande définitivement acceptée ; Laure continue de la confirmer directement au client. Aucun SMS automatique, encaissement en ligne ou e-mail de confirmation client n'est implémenté.

## 7. Utilisation par Laure

- **Accueil** : retraits du jour, demandes à confirmer, portions à traiter, règlements enregistrés.
- **Commandes** : recherche par nom, téléphone, plat ou référence, filtres par date/statut, suivi de préparation et règlement.
- **Cuisine** : synthèse des portions restant à préparer par date de retrait, dont celles encore à confirmer.
- **Clients** : carnet construit automatiquement depuis les commandes, avec recherche.
- **Catalogue** : stocks, prix et visibilité des formats ; création d'une **fiche brouillon** et modification des textes, ingrédients, allergènes, conditions de conservation et photos depuis l'espace privé. La mise en ligne nécessite une vérification préalable des informations techniques.
- **Retraits** : créneaux, places restantes, ouverture/fermeture et création de créneaux.
- **+ Commande** : saisie manuelle des commandes reçues par téléphone, SMS ou en direct.

Pour ajouter l'application à son téléphone : ouvrir `/gestion/` dans Safari/Chrome après connexion, puis utiliser **Ajouter à l'écran d'accueil**. C'est un raccourci Web, pas une application native publiée dans un store.

## 8. Limites et points à vérifier avant ouverture commerciale

- **Vérification réelle nécessaire :** le code a passé des tests automatisés du moteur sur un simulateur Google Sheets, mais pas une campagne de tests de bout en bout avec les comptes Google et Cloudflare de Laure. Ne pas annoncer le service en production tant que les étapes 5 et 6 ne sont pas validées.
- **Mentions légales et RGPD :** vérifier et publier des informations exactes sur l'éditeur, ses coordonnées et les traitements de données (finalité, base juridique, conservation, droits, destinataires). Le site ne dispose pas encore d'une politique de confidentialité définitivement complétée. Définir les durées d'archivage/suppression des données client.
- **Alimentaire :** valider avec Laure les ingrédients, allergènes, conditions de conservation, DLC et pratiques de traçabilité avant de vendre les produits. Le logiciel ne calcule ni ne justifie automatiquement une DLC.
- **Formules commerciales :** volontairement **masquées** dans cette V1 tant que la composition et la consommation de stock des plats inclus ne sont pas modélisées.
- **Newsletter :** formulaire précédent neutralisé : aucun abonnement fictif n'est enregistré.
- **Production :** le cumul par date est celui des retraits, pas un calendrier détaillé de fabrication ou des lots. La gestion des lots/étiquettes et des coûts de revient vient après.
- **Stock :** les réservations bloquent les quantités dès la demande, même non confirmée ; l'annulation libère le stock. L'annulation est irréversible dans cette V1 pour éviter un stock négatif.
- **Identifiants des plats :** ils sont encore dérivés du nom. **Ne pas renommer dans Google Sheets un plat qui a des commandes en cours**, sinon leur rapprochement avec les stocks peut échouer lors d'une annulation.
- **Google Sheets :** il n'offre pas de transaction ACID entre plusieurs fichiers ; l'API effectue un verrouillage `LockService` et une compensation au mieux en cas d'erreur, mais une panne sévère peut nécessiter une réconciliation manuelle.
- **Saisie manuelle :** une commande peut avoir plusieurs plats, mais la conservation suit par défaut l'état publié dans la fiche. Pas encore de tarifs personnalisés ou remises.
- **Prix / règlements :** l'application ne remplace pas la comptabilité, ni les factures ni le logiciel de caisse si des obligations s'appliquent.
- **Montée en charge :** cette architecture convient à un volume modeste. En cas d'activité importante, migrer l'enregistrement de commandes vers une base transactionnelle (p. ex. Cloudflare D1) et conserver Google Sheets pour la consultation/export.

## 9. Tests et restauration

Exécuter localement :

```bash
node tests/backend.test.cjs
```

Pour revenir en arrière, restaurer le **commit précédent** de GitHub/Cloudflare Pages. **Ne pas supprimer** le Google Sheets privé : les commandes déjà prises doivent rester disponibles. Ne pas restaurer aveuglément les stocks d'un ancien fichier de catalogue après des réservations.

Les fichiers fournis ne sont pas déployés automatiquement par cette livraison.


## Consolidation locale (base main 969130c97b4751fa1077a312b2dd473fa88014fe)

Voir INSTALLATION-STABILISATION.md et VALIDATION-STABILISATION.md.
Avant de publier ce backend : lancer UNE FOIS `initialiserStabilisationLaure()`
dans l’éditeur Apps Script. Cette initialisation idempotente ajoute uniquement
OPERATIONS dans le classeur PRIVÉ. Ne pas relancer setupLaure, ne pas effacer
le journal et ne pas modifier les stocks directement dans Sheets ou par un autre script.
La source canonique est apps-script/Code.gs ; Code.gs à la racine est sa copie
identique de compatibilité. Un seul de ces codes doit être installé dans Apps Script.
Une commande déjà Retirée peut être annulée sans aucune restitution de stock/place.
Le passage à Confirmée n’envoie pas de SMS : Laure contacte elle-même le client.

Tests exclusivement locaux :
```
node tests/backend.test.cjs
node tests/access.test.mjs
node tests/stabilisation.test.cjs
node tests/photos.test.cjs
node tests/public.test.cjs
```
