# Les Barquettes de Laure

Le site est une page statique qui peut etre deposee telle quelle sur GitHub Pages ou Cloudflare Pages.

## Mettre a jour le contenu

Le contenu commercial est lu depuis ce Google Sheet :

https://docs.google.com/spreadsheets/d/1yun-qS8TDI-II8BNatOI5oRrwfWl5Oep5-H1StvEJeE/edit

Modifiez les onglets `Plats`, `Formats et prix`, `Nutrition`, `Formules`, `Créneaux`, `Contenus`, `Textes du site` et `Réglages`. Le site charge les changements au prochain rechargement de page.

La feuille actuelle est deja lisible par le site. Conservez ce parametre d'acces public en lecture seule. Si vous creez une autre feuille, dans Google Sheets ouvrez `Fichier > Partager > Publier sur le Web`, publiez le classeur entier, puis conservez le lien de publication.

Ne stockez pas de donnees personnelles ou de commandes clients dans ce classeur public.

## Publier

Deposez a la racine du depot : `index.html`, `support.js`, `site-data.js` et le dossier `uploads`.

Sur Cloudflare Pages, aucun serveur ni variable secrete n'est necessaire.
