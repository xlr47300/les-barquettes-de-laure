# Installation — consolidation des Barquettes de Laure

Base vérifiée : `main`, commit `969130c97b4751fa1077a312b2dd473fa88014fe`.
Ne téléversez pas le ZIP de mission : utilisez uniquement le ZIP FINAL livré.

1. **Sauvegarder** le dépôt actuel et l’ancien Code.gs. Choisir un moment sans saisie en cours ; si les réservations sont ouvertes, les suspendre pendant l’installation avec le commutateur Cloudflare `ORDERS_ENABLED`, puis conserver sa valeur initiale pour la fin. Aucun secret ne change.
2. **Apps Script :** remplacer le contenu de l’unique fichier de code de votre projet par le Code.gs complet fourni. Ne pas ajouter une deuxième copie dans le même projet. Conserver propriétés, identifiants et déploiement existants.
3. Dans l’éditeur Apps Script, sélectionner **`initialiserStabilisationLaure`**, puis Exécuter. Cette initialisation peut être relancée : elle crée uniquement l’onglet technique **OPERATIONS dans le classeur privé** et n’écrit rien dans les anciennes commandes ou les stocks. **Ne pas lancer `setupLaure`.** L’onglet doit rester privé, non trié et non modifié manuellement. La migration n’a pas été exécutée par Codex.
4. Vérifier que la propriété existante **`LAURE_PHOTOS_FOLDER_ID`** désigne le dossier « Photos des plats - Les Barquettes de Laure ». Conserver sa valeur si elle est correcte. Aucun nouveau dossier à créer. Si Drive était déjà autorisé, aucune réautorisation particulière n’est attendue.
5. Apps Script : **Déployer → Gérer les déploiements → crayon → Nouvelle version → Déployer**. Garder le même déploiement, la même URL `/exec`, le même compte d’exécution et les mêmes paramètres d’accès.
6. Extraire le ZIP FINAL et téléverser **son contenu à la racine de GitHub `main`**, en conservant les chemins. Attendre la fin du déploiement automatique Cloudflare Pages. Le ZIP contient seulement les fichiers modifiés/ajoutés : conserver tous les autres fichiers, notamment le logo et les fonctions de sécurité. Les deux copies GitHub de Code.gs sont identiques ; `apps-script/Code.gs` est la source canonique, celle à la racine une copie de compatibilité.
7. Actualiser les navigateurs des deux administrateurs, puis faire les contrôles ci-dessous. Rétablir ensuite la valeur d’ouverture souhaitée. Les anciennes pages privées peuvent recevoir « page ancienne, actualisez » : c’est la protection attendue, pas une perte de données.

## Règles simples pour conserver la fiabilité

- Gérer les stocks et places depuis l’application. Aucun autre Apps Script, déclencheur ou automatisme ne doit écrire simultanément dans ces mêmes cellules. Ne pas renommer les plats, trier les feuilles métier ou déplacer des lignes pendant une opération en cours.
- En cas de « reprise bloquée », ne pas corriger les valeurs au hasard : conserver OPERATIONS et demander une vérification du journal. Les écritures suivantes sont bloquées pour protéger les données.
- Annuler une commande déjà **Retirée** ne restitue **ni stock ni place** ; le paiement n’est pas automatiquement modifié. La confirmation au client reste un appel/SMS envoyé par Laure.

## Contrôles manuels du lendemain — 5 à 10 minutes, sans nouvelle donnée

- **1 min :** sur téléphone, ouvrir le public : plats, photos 4:3, absence de Questions pratiques et de filtre familial, affichage correct du prix « dès ».
- **1 min :** vérifier que les commandes sont désactivées si elles sont fermées et que les heures déjà passées ne sont pas proposées. Ne rien envoyer.
- **2 min :** ouvrir la gestion avec chacun des deux administrateurs ; vérifier le bouton Retraits, les dates/heures, l’historique et une commande existante, sans changer son statut ou son paiement.
- **2 min :** ouvrir une fiche, sélectionner une image de test portrait puis paysage, déplacer le cadrage et le zoom. **Fermer sans enregistrer et sans supprimer** : vérifier uniquement l’aperçu et le confort tactile.
- **1 min :** comparer visuellement un stock et des places avec les valeurs attendues, sans sauvegarde. Ne pas saisir de commande fictive en production.
- **1 min :** vérifier qu’une fenêtre privée non authentifiée n’affiche aucune donnée de gestion. Les essais de panne, doublon et annulation restent dans les tests locaux fournis.

## Marche arrière

Suspendre les nouvelles réservations. Avec le NOUVEAU code encore installé, lancer `etatStabilisationLaure` (diagnostic sans écriture) : `pending` doit être vide. S’il reste une opération, **ne pas revenir à l’ancien backend** : traiter sa reprise avec le nouveau mécanisme ou demander assistance. Ne jamais effacer le journal pour débloquer.

Quand il n’y a plus d’opération en attente : restaurer le code GitHub sauvegardé et l’ancienne version du déploiement Apps Script, puis attendre Cloudflare et actualiser les navigateurs. Conserver OPERATIONS et toutes les données métier. Ne jamais restaurer un ancien stock ou un ancien classeur sur les réservations enregistrées depuis.
