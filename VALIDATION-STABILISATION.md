# Validation — consolidation finale

Référence : dépôt `xlr47300/les-barquettes-de-laure`, branche `main`, SHA **969130c97b4751fa1077a312b2dd473fa88014fe**. Les 21 fichiers texte ont été récupérés depuis GitHub et vérifiés contre leurs SHA de blobs. Les pièces jointes sont des références fusionnées, pas la base du projet.

## Corrigé

- **Commandes et annulations :** plan d’écritures enregistré dans un nouveau journal privé OPERATIONS avant de modifier le stock. Reprise des opérations inachevées sous le même verrou, avant la lecture privée ou les mutations suivantes. Réécriture de valeurs cibles contrôlées, jamais addition répétée à l’aveugle. Création de commande également couverte ; doublons résolus après reprise. Valeur inattendue = blocage protecteur.
- **Commandes retirées :** annulation sans restitution physique et sans retour à un statut préparatoire. Répéter une annulation terminée n’ajoute rien.
- **Stocks/places/prix/publication/fiches :** seuls les champs changés sont envoyés ; comparaison avec leurs valeurs initiales sous verrou. Refus explicite d’une sauvegarde périmée. Un nouveau prix ne réécrit pas un ancien stock. Les stocks restent communs à tous les retraits et séparés par format.
- **Reprises de demandes :** clés stables privées/publiques, conservées en mémoire et dans la session si disponible. Seules une empreinte et une clé y sont conservées, pas les coordonnées client. Après succès public : récapitulatif des lignes/prix/total enregistrés par le serveur, panier vidé ; nouvelle demande explicite en quittant la confirmation.
- **Photos :** fusion explicite du cadre 4:3, zoom/position et conservation intégrale avec marges par défaut. JPEG 1200×900, limite compatible avec le serveur. Aperçu, cartes et fiche publique utilisent le même cadre, sans nouvelle découpe. Contrôles durant l’enregistrement et isolation des préparations devenues obsolètes.
- **Drive :** dossier existant conservé ; reprise d’un téléversement avec le même identifiant sans création répétée. Lien Sheets validé avant nettoyage. Vérification de toutes les colonnes photo principales/secondaires avant corbeille, uniquement dans le dossier géré. Remplacement/suppression périmés refusés. Pas de partage de dossier ni de fichier client.
- **Finition :** Retraits mobile, fuseau Paris, heures passées exclues et désactivation à l’écoulement du temps, respect de la configuration d’ouverture, filtre individuel et duo, prix « dès », textes de maquette visibles retirés. Questions pratiques reste masqué ; formules et format 4 restent dans les données sans nouvelle offre commerciale.
- **Sécurité :** authentification des deux administrateurs, vérification JWT, origine, secret de liaison, Turnstile, routes et limites API conservés sans modification de leurs fichiers. Les deux Code.gs sont strictement identiques.

## Tests locaux réussis

| Suite | Vérifications |
|---|---|
| backend | Création, calcul en centimes, décrément, surstock refusé, doublon, notification simulée, saisie manuelle et annulation normale |
| stabilisation | **56 scénarios d’interruption avant/après chaque écriture de plage et flush du parcours simulé**, puis quatre reprises ; une seule commande/restitution. Conflits stock/prix/places, deux sauvegardes concurrentes logiques, commande retirée, ancien historique, migration répétée, blocage sur valeur extérieure inattendue, stock global sur deux dates et individuel/duo |
| photos | Réponse perdue après lien enregistré, reprise sans doublon de fichier, remplacement, conflit de version, référence secondaire et fichier externe protégé ; Canvas simulé portrait/paysage, zoom et repositionnement |
| public | Clés stables après réessai/rechargement, session sans coordonnées, commandes fermées, CSV et créneaux passés, montant et lignes serveur sur la confirmation, panier vidé |
| Access | Jetons signés des deux administrateurs, tiers refusé, audience incorrecte et jeton invalide, configuration de commandes fermée |

Syntaxe de tous les JS/GS et de la logique HTML contrôlée ; chemins et intégrité ZIP contrôlés. Les tests inclus n’appellent aucun service réel. Les messages d’erreur attendus de certains cas négatifs sont normaux.

## Limites à valider, sans fausse garantie

1. **Sheets n’est pas une base transactionnelle.** La reprise est démontrée dans le modèle où l’application est l’unique écrivain des stocks/places et où une écriture de plage est appliquée ou non. Une réponse perdue après écriture est couverte. Des valeurs étrangères ambiguës, interventions manuelles, suppressions, tris ou autres scripts peuvent empêcher une reprise sûre : dans le doute le système bloque. Ce mécanisme ne certifie pas le comportement de Google lors d’une panne de service extrême.
2. **Autres scripts inconnus :** avant ouverture, inventorier les scripts liés au classeur catalogue et au classeur privé : sources de tous les fichiers `.gs`, liste des déclencheurs installables/horaires et fonctions appelées, autres Web Apps ou automatisations écrivant dans PLATS, CRÉNEAUX, COMMANDES, LIGNES ou JOURNAL. Demander leurs exports et paramètres de déclenchement, jamais leurs secrets. Sans cet inventaire, l’absence d’interférence ne peut pas être confirmée.
3. **Notification :** pas de SMS automatique ni de confirmation client automatique. Si une commande est reprise après interruption, l’e-mail à Laure peut manquer ; la liste privée des demandes à confirmer reste la référence. Une notification n’est pas une preuve de transaction.
4. **Téléphones/Google :** pas de test de bout en bout sur iPhone/Android ni sur les permissions/quotas réels Drive/Apps Script. Le Canvas est simulé, pas un navigateur réel. Les formats HEIC dépendent du décodage de l’appareil ; message utile si non pris en charge. Les anciens JPEG ne sont pas réencodés automatiquement. Pour refaire leur cadrage, sélectionner à nouveau l’original.
5. **Brouillons :** le classeur catalogue partagé reste lisible publiquement, y compris certaines données masquées ; les photos diffusées ont des liens publics, même en brouillon. Pour des brouillons confidentiels, il faudrait privatiser leur stockage et publier uniquement une sélection validée ; cette refonte n’est pas imposée ici. Les fichiers clients et le journal OPERATIONS restent dans le classeur privé.
6. **Fichiers photo incertains :** un fichier créé dont la liaison n’a jamais abouti est conservé et réutilisable au réessai. Il peut rester orphelin si l’utilisateur abandonne ; aucune purge agressive ne risque une suppression injustifiée. Le nettoyage ne connaît pas les références en dehors des colonnes photo du catalogue.
7. **Exploitation :** les fenêtres déjà ouvertes peuvent afficher un stock/prix ancien ; le serveur contrôle la réservation et les sauvegardes. Un changement de configuration Cloudflare nécessite une actualisation côté public. OPERATIONS grandit avec l’activité ; aucun historique n’est purgé automatiquement. Les bibliothèques du moteur public restent chargées depuis leur CDN existant.
8. **Contenu métier :** identité légale, contact, conservation, allergènes, moyens de paiement et confidentialité doivent être validés avec les vraies informations de Laure. Rien n’a été inventé ni validé réglementairement.

**Aucun accès au site public, aucune commande réelle, aucun changement de dépôt ou service de production, aucune suppression réelle.** L’initialisation et le déploiement restent à effectuer par l’utilisateur suivant le guide. Aucun développement de menus hebdomadaires, de formules, de laboratoire ou de paiement en ligne.
