# GeoQuizz

Application **web installable** de révision de géographie : une PWA construite
avec **Next.js 16** (App Router, export statique). Le web est la seule cible —
il n'y a pas de version iOS ni Android.

## Principe

Deux onglets, pas plus :

- **Apprendre** — on choisit un mode (Drapeau · Capitale · Pays · États) puis
  une zone (Monde, Afrique, Amérique, Asie, Europe, Océanie) — ou, en mode
  États, un pays (États-Unis, France, Espagne, Chine) —, et on enchaîne
  10 questions.
- **Profil** — meilleurs scores par zone et par mode, taux de réussite, meilleure
  série, et le choix du thème : clair, sombre, ou celui de l'appareil.

Chaque zone a sa couleur et son fond : l'écran de jeu porte le fond de la zone
en cours, donc on sait toujours où on est.

## Les quatre modes

| Mode | Question | Réponse attendue |
| --- | --- | --- |
| Drapeau | un drapeau s'affiche | le nom du pays |
| Capitale | un pays (2 fois sur 3) ou une capitale (1 fois sur 3) | l'autre moitié de la paire |
| Pays | une carte du continent, le pays cherché surligné | le nom du pays |
| États | la carte d'un pays, une de ses régions surlignée | le nom de la région |

Le mode États se joue sur un pays et non sur une zone : les 50 États des
États-Unis, les 13 régions de France métropolitaine, les 17 communautés
autonomes d'Espagne et les 31 provinces, régions autonomes et municipalités de
Chine. L'Alaska, Hawaï et les Canaries sont en encart, les plus petites régions
(Rhode Island, Tianjin…) reçoivent un cercle de repérage, et un bouton zoome
sur celles qui en ont besoin.

Les réponses se tapent au clavier. La comparaison est **tolérante** : insensible
à la casse et aux accents, elle ignore les articles, accepte les variantes
(« USA » pour États-Unis, « Myanmar » pour Birmanie, « La Paz » pour la Bolivie)
et pardonne une à deux fautes de frappe selon la longueur du mot. En mode
États, elle ne pardonne pas une saisie qui nomme exactement une autre région
du pays : Hebei n'est pas une faute de frappe pour Hubei.

## Jouer à plusieurs

Depuis l'accueil, **Créer une partie** ouvre une salle, qui affiche un lien à
partager et un code de cinq caractères. **Rejoindre une partie** demande ce
code dans une boîte de dialogue : c'est ce qui reste quand on se le dicte de
vive voix, ou d'un téléphone à l'autre. Le lien complet fait aussi l'affaire,
collé tel quel.

Le lien porte les réglages de la partie ; le code seul, non — ils arrivent
alors dans la salle d'attente, publiés par l'hôte. Dans les deux cas, on
choisit un pseudo et on attend ; l'hôte lance, et tout le monde reçoit le même
quiz. La partie s'arrête dès que le premier a tout trouvé : on est classé au
nombre de questions trouvées, puis au temps mis pour y arriver.

À la création, l'hôte peut aussi fixer une limite de temps (1, 2, 3 ou
5 minutes). La partie s'arrête alors pour tout le monde à l'échéance, si
personne n'a tout trouvé avant ; le classement suit la même règle.

Sans recréer la salle, l'hôte change ses réglages (mode, nombre de questions,
temps, zone, partie publique ou privée) depuis la salle d'attente, avant la
première partie comme entre deux : **Modifier les réglages**, puis
**Enregistrer**. Les joueurs déjà là voient aussitôt les nouveaux, et le lien
de la salle les porte désormais.

Il faut internet, et un projet [Supabase](https://supabase.com) (gratuit) :

1. Crée le projet, puis relève dans *Project Settings → API* l'URL du projet
   (`https://<projet>.supabase.co`, sans `/rest/v1`) et la clé `anon`.
2. Mets-les dans `.env.local` pour le développement, et dans les variables
   d'environnement de Vercel pour la production :

   ```sh
   NEXT_PUBLIC_SUPABASE_URL=https://<projet>.supabase.co
   NEXT_PUBLIC_SUPABASE_ANON_KEY=<clé anon>
   ```

Aucune table à créer pour les salles : elles ne vivent que le temps de la
partie. Un projet gratuit resté sept jours sans activité est mis en pause ; on
le réactive depuis le tableau de bord de Supabase.

## Comptes et classement

L'onglet **Classement** montre, pour chaque zone, mode et longueur de manche,
le meilleur temps de chaque joueur sur une manche trouvée en entier. On joue
sans compte ; en créer un (pseudo, e-mail, mot de passe, ou un compte Google
suivi du choix d'un pseudo, depuis le profil ou l'écran de fin) sert
seulement à y apparaître. À la première connexion sur un appareil, les
records déjà faits dessus rejoignent le classement.

Même projet Supabase que les salles, avec en plus une base :

1. Dans le *SQL Editor* du projet, exécute un à un, dans l'ordre, les fichiers
   de `supabase/migrations/` (ou `supabase db push` avec la CLI). Le premier
   crée les tables `profiles` et `scores`, leurs règles d'accès et les
   fonctions du classement ; les suivants le complètent.
2. Dans *Authentication → Sign In / Providers*, garde *Email* et *Confirm
   email* activés : chaque inscription attend un clic dans un e-mail.
   L'envoi intégré de Supabase est très limité (quelques e-mails par heure) :
   branche un SMTP (Resend, Brevo…) dans *Authentication → Emails → SMTP
   Settings* avant d'ouvrir à de vrais joueurs.
3. Dans *Authentication → URL Configuration*, mets l'adresse de production en
   *Site URL* et ajoute `https://<ton-domaine>/compte` aux *Redirect URLs*.
4. Pour « Continuer avec Google » (après la migration
   `20261005180000_connexion_google.sql`) : dans la
   [Google Cloud Console](https://console.cloud.google.com), *Google Auth
   Platform*, renseigne l'écran de consentement (application externe, publiée,
   domaines `<ton-domaine>` et `<projet>.supabase.co`), puis crée un client
   OAuth *Application Web* : origine `https://<ton-domaine>`, URI de
   redirection `https://<projet>.supabase.co/auth/v1/callback`. Colle son ID
   et son secret dans *Authentication → Sign In / Providers → Google*.
   Sans cela, le bouton mène à une page d'erreur de Supabase.
5. Les photos de profil (migration `20261011090000_photos_de_profil.sql`)
   n'ont rien d'autre à régler : la migration crée elle-même le seau
   `avatars` de *Storage* et ses règles d'accès.

Connecté, chacun peut choisir une **photo de profil** sur l'écran Profil
(PNG, JPEG ou WebP, 250 Ko au plus). Le navigateur la recadre au carré et en
tire deux images, 256 px pour le profil et 96 px pour le classement et les
salles : le fichier d'origine ne part jamais.

Si Supabase ne répond pas, le jeu solo continue : un temps fait pendant la
panne attend sur l'appareil et part au retour du réseau, et le dernier
classement lu reste affiché.

## Mettre tes propres photos de fond

Les pays du mode États s'affichent pour l'instant avec un dégradé. Pour
passer aux photos :

1. Dépose tes images dans `public/categories/` : `etats-unis.jpg`,
   `france.jpg`, `espagne.jpg`, `chine.jpg` (les six zones ont déjà la leur)
2. Remplace `null` par le chemin de l'image dans `PHOTOS`, en haut de
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

**Les 196 pays sont jouables dans les trois modes, sans exception.** Sur la
carte, celui qui mesure moins de 16 px reçoit un cercle de repérage — une
vingtaine au zoom (Monaco, Vatican, Malte, Maldives…) et environ la moitié en
vue continentale. Tuvalu, absent même du fond 1:50m, est repéré à partir de ses
coordonnées : l'anneau est alors sa seule représentation.

Les drapeaux viennent de flagcdn.com. Le service worker les télécharge tous à
son installation. En jeu, ils sont dessinés dans un `<canvas>`, après avoir été
chargés tous les 196 ensemble : ni l'adresse d'une image ni le réseau ne
donnent la réponse (voir [src/lib/flags.ts](src/lib/flags.ts)). Si l'un d'eux
manque, un message le dit et la question suivante le retente.

### Les régions du mode États

`src/data/regions.json` (noms, variantes acceptées, capitales) et
`src/data/region-shapes.json` (contours) sont **générés** :

```sh
npm run generate-regions
```

Les contours viennent de **Natural Earth 1:10m** (divisions administratives de
premier niveau), téléchargé une fois (40 Mo) dans le dossier temporaire du
système. Natural Earth découpe la France en départements et l'Espagne en
provinces : le script les fusionne en régions et en communautés autonomes,
écarte les îlots, simplifie et quantifie les tracés — 240 ko pour les quatre
pays. Les noms français, les variantes et les capitales sont listés en clair
dans [scripts/generate-regions.mjs](scripts/generate-regions.mjs).

Hors jeu : le district de Columbia, les régions d'outre-mer, Ceuta et Melilla,
Hong Kong et Macao (et Taïwan, distinct dans Natural Earth). Ils restent
dessinés quand ils tombent dans le cadre, sans être une réponse attendue.

Ajouter un pays demande trois choses : son entrée dans `SETS`
([scripts/generate-regions.mjs](scripts/generate-regions.mjs)), sa catégorie
dans `REGION_SETS` ([src/constants/categories.ts](src/constants/categories.ts))
et sa projection dans `LAYOUTS` ([src/components/region-map.tsx](src/components/region-map.tsx)).

## L'installer

Sur **Chrome / Edge** (ordinateur et Android), une icône d'installation apparaît
dans la barre d'adresse, et l'app propose elle-même la bannière « Installer
GeoQuizz ». Sur **Safari iOS**, il n'existe aucune API : le geste est
_Partager › Sur l'écran d'accueil_, et c'est ce que la bannière explique.

Refusée une fois, la bannière ne revient plus.

Une fois installée, GeoQuizz s'ouvre dans sa propre fenêtre, sans barre
d'adresse, et **fonctionne entièrement hors ligne** : les 196 pays, leurs
capitales et les deux fonds de carte sont embarqués dans le bundle, précaché au
premier lancement.

Seuls les **drapeaux** viennent du réseau (flagcdn.com). Les 196 sont
téléchargés dès l'installation du service worker, y compris ceux qu'on ne
croisera peut-être jamais, soit environ 0,6 Mo en plus. Une mise à jour ne
retélécharge que ceux qui manquent. Si flagcdn est injoignable à ce moment-là,
l'installation aboutit quand même : chaque drapeau manquant est récupéré à la
première partie de drapeaux en ligne.

Les **photos de fond** des catégories (`public/categories/`) suivent le même
régime : téléchargées à l'installation dans un cache qui survit aux mises à
jour, reprises à la première vue si elles ont manqué (le dégradé de la
catégorie les remplace d'ici là). Une photo remplacée sous le même nom est
récupérée à la vue suivante, sans nouvelle version.

### Mises à jour

Une nouvelle version s'installe en arrière-plan mais **n'écrase rien** : elle
attend qu'on appuie sur « Mettre à jour », dans le bandeau en haut de l'écran.
Sans cela, un déploiement rechargerait la page au milieu d'une question.

## Développement

```sh
npm run dev        # http://localhost:3000
npm run lint
npm run typecheck
npm run test:unit  # tests unitaires, sans construire
```

## Les tests

Les tests unitaires sont dans [tests/](tests/), un fichier par partie du jeu :
la correction des réponses, le tirage d'une manche, le chronomètre, les
données des pays, les salles à plusieurs, les records, le compte et le
classement. Ils tournent avec le lanceur intégré à Node (`node --test`) : il
n'y a aucun outil de test à installer.

```sh
npm run test:unit                                   # tous
npm run test:unit -- --test-name-pattern="salle"    # ceux dont le nom contient « salle »
```

Node ne sait pas lire src/ tel quel (TypeScript, imports `@/`, fichiers JSON) :
[scripts/test-loader.mjs](scripts/test-loader.mjs) le lui apprend. Il remplace
aussi les clients Supabase par les faux de [tests/fakes/](tests/fakes/) : un
test ne touche jamais au réseau, et le faux Realtime fait jouer l'hôte et ses
invités dans le même processus.

Ne sont pas couverts : les écrans React (ce qui s'affiche, les clics), le
dessin des cartes et des drapeaux, et les fonctions SQL de
[supabase/migrations/](supabase/migrations/), qui vérifient les temps du
classement dans la base.

## Construire et déployer

```sh
npm run build    # export statique + service worker -> out/
npm test         # tests unitaires, puis out/sw.js exercé hors navigateur
npm run serve    # sert out/ sur http://localhost:8080
npm run preview  # build + serve
```

`npm run build` enchaîne deux étapes :

1. `next build` produit `out/` — l'app est configurée en `output: 'export'`,
   donc il n'y a **aucun serveur Node à faire tourner** ;
2. [scripts/build-sw.mjs](scripts/build-sw.mjs) assemble `out/sw.js` à partir
   de [scripts/service-worker.js](scripts/service-worker.js), en y injectant la
   liste des fichiers produits et une empreinte de leur contenu.

L'empreinte étant calculée sur le contenu, reconstruire sans rien changer ne
déclenche aucune mise à jour chez les utilisateurs.

`out/` se dépose tel quel sur n'importe quel hébergeur statique. Deux réglages
comptent, que [scripts/serve.mjs](scripts/serve.mjs) reproduit en local :

- `/profil` doit servir `profil.html` (URL sans extension) ;
- `sw.js` et les pages HTML ne doivent **pas** être mis en cache par le
  navigateur (`Cache-Control: no-cache`), sinon une nouvelle version ne serait
  jamais vue. Tout ce qui est sous `/_next/static/` porte au contraire une
  empreinte dans son nom et peut être figé pour un an.

Le service worker doit être servi en **HTTPS ou sur localhost** : ouvrir
`out/index.html` depuis le disque ne permet ni l'installation ni le hors-ligne.

## Les icônes

Elles ne sont pas dessinées à la main : [scripts/generate-icons.mjs](scripts/generate-icons.mjs)
projette le fond de carte de l'app en orthographique et le rend dans la palette
du thème, du favicon 32 px à l'icône 512 px, `maskable` comprise.

```sh
npm run generate-icons   # -> public/icons/
```

Changer une couleur dans [src/constants/theme.ts](src/constants/theme.ts) puis
relancer suffit à régénérer une famille cohérente.

## Ce qui est rendu à la compilation, et ce qui ne l'est pas

L'accueil et le profil sortent de la construction **avec leur contenu** : les
six zones, le sélecteur de mode, le tableau des scores sont dans le HTML, donc
visibles avant même que le JavaScript ne s'exécute. Les meilleurs scores, eux,
vivent dans le stockage local : le HTML les montre à zéro et les vraies valeurs
apparaissent à l'hydratation. C'est voulu — c'est aussi pourquoi
[src/lib/progress.ts](src/lib/progress.ts) fournit un instantané serveur
constant, sans quoi React signalerait un écart.

L'écran de jeu fait exception. Il lit la zone et le mode dans l'URL, qui
n'existe qu'à la visite, et tire ses dix questions au hasard : le figer à la
compilation donnerait la même partie à tout le monde. Il est donc rendu côté
client, derrière une frontière `Suspense` — c'est le « Préparation de la
partie… » que contient [out/quiz.html](src/app/quiz/page.tsx).

## La barre d'onglets pendant une partie

Elle disparaît. Chaque route se démonte quand on la quitte, donc changer
d'onglet au milieu d'une manche l'effacerait. Un quiz est un écran plein, dont
on sort par sa propre croix.
