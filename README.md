# GeoLearn

Application de révision de géographie (Expo SDK 57, expo-router).

## Principe

Deux onglets, pas plus :

- **Apprendre** — on choisit un mode (Drapeau · Capitale · Pays) puis une zone
  (Monde, Afrique, Amérique, Asie, Europe, Océanie), et on enchaîne 10 questions.
- **Profil** — meilleurs scores par zone et par mode, taux de réussite, meilleure
  série, et la liste des pays ratés à revoir.

Chaque zone a sa couleur et son fond : l'écran de jeu porte le fond de la zone
en cours, donc on sait toujours où on est.

## Les trois modes

| Mode | Question | Réponse attendue |
| --- | --- | --- |
| Drapeau | un drapeau s'affiche | le nom du pays |
| Capitale | un pays (2 fois sur 3) ou une capitale (1 fois sur 3) | l'autre moitié de la paire |
| Pays | une carte du continent, le pays cherché surligné | le nom du pays |

Les réponses se tapent au clavier. La comparaison est **tolérante** : insensible
à la casse et aux accents, elle ignore les articles, accepte les variantes
(« USA » pour États-Unis, « Myanmar » pour Birmanie, « La Paz » pour la Bolivie)
et pardonne une à deux fautes de frappe selon la longueur du mot.

## Mettre tes propres photos de fond

Les six zones s'affichent pour l'instant avec un dégradé de la palette. Pour
passer aux photos :

1. Dépose tes images dans `assets/images/categories/` :
   `monde.jpg`, `afrique.jpg`, `amerique.jpg`, `asie.jpg`, `europe.jpg`, `oceanie.jpg`
2. Dé-commente la ligne correspondante dans `PHOTOS`, en haut de
   [src/constants/categories.ts](src/constants/categories.ts).

Le dégradé reste dessiné sous la photo : il sert de fond pendant le chargement,
et de secours si une image manque. Rien d'autre à changer.

## Données

`src/data/countries.json` contient les 193 États membres de l'ONU plus le
Vatican, avec nom et capitale en français, code ISO, continent, et les réponses
alternatives acceptées. Le fichier est **généré** :

```sh
npm run generate-countries
```

Le script part du paquet `world-countries` et applique les corrections
françaises (Pékin, Le Caire, Oulan-Bator…) listées en clair dans
[scripts/generate-countries.mjs](scripts/generate-countries.mjs). C'est là qu'il
faut ajouter un alias ou corriger une capitale.

### Le fond de carte

Les frontières viennent de **Natural Earth v4.1.0**, redistribué en TopoJSON par
le paquet [`world-atlas`](https://github.com/topojson/world-atlas) (domaine
public), projeté à la volée avec `d3-geo`. Tout est embarqué : aucune requête
réseau.

Deux résolutions sont chargées et choisies selon l'échelle : le **1:50m** dès
qu'on zoome (frontières fidèles), le **1:110m** en vue continentale (dix fois
plus léger, et visuellement identique à cette échelle). Sans cette bascule, une
vue de l'Amérique atteignait 1,4 Mo de tracés SVG, affichés en double pendant le
fondu.

Il n'existe pas de jeu de frontières « officiel » universel — plusieurs tracés
sont contestés et tout jeu de données prend position. Natural Earth adopte les
tracés de fait et traite en entités distinctes le Sahara occidental, la
Palestine, Taïwan, ainsi que le Kosovo, le Somaliland, Chypre du Nord et le
glacier de Siachen (ces quatre-là sans code ISO). Ils sont donc **dessinés sur
la carte sans jamais être une réponse attendue**. La référence la plus proche
d'un statut officiel est l'*UN Clear Map* du
[UN Geospatial](https://geoportal.un.org), qui hachure explicitement les zones
disputées — mais sa licence n'est pas libre et demande une autorisation.

**Les 194 pays sont jouables dans les trois modes, sans exception.** Sur la
carte, celui qui mesure moins de 16 px reçoit un cercle de repérage — une
vingtaine au zoom (Monaco, Vatican, Malte, Maldives…) et environ la moitié en
vue continentale. Tuvalu, absent même du fond 1:50m, est repéré à partir de ses
coordonnées : l'anneau est alors sa seule représentation.

Les drapeaux sont chargés depuis flagcdn.com et mis en cache sur disque par
`expo-image`. Sans réseau à la toute première vue, l'emoji drapeau prend le
relais.

## Développement

```sh
npm start        # serveur de développement
npm run android  # ou npm run ios / npm run web
npm run lint
npx tsc --noEmit
```
