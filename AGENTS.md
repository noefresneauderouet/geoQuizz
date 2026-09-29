# GeoQuizz

Application web installable (PWA). **Next.js 16, App Router, export statique.**
Il n'y a plus ni Expo, ni React Native, ni cible mobile : ne réintroduis pas
`react-native-web` ni de composant `View`/`Text`.

## Ce qui structure le projet

- `output: 'export'` — la construction produit `out/`, des fichiers statiques.
  Rien qui suppose un serveur : pas de route API, pas de `middleware`, pas de
  `revalidate`, pas de `next/image` optimisé.
- Le style passe par des **CSS Modules** et les variables de
  `src/constants/theme.ts`, seule définition de la palette. N'écris pas une
  couleur en dur dans un `.module.css` : utilise `var(--green)`, `var(--sand)`…
- `src/lib/` ne dépend pas de React, sauf `progress.ts` et `pwa.ts`, qui
  exposent des hooks et portent `'use client'`.
- Tout composant qui lit `localStorage` ou l'état du navigateur doit fournir un
  instantané serveur constant à `useSyncExternalStore` : le HTML est produit à
  la compilation, et un écart ferait échouer l'hydratation.

## Le mode États

Une question « États » porte une région (`Question`, src/lib/quiz.ts) et se
joue sur un pays, pas sur une zone : `categoriesFor(mode)` donne la bonne liste,
et `getCategory(id, mode)` refuse un couple qui ne va pas ensemble.

- `src/data/regions.json` et `src/data/region-shapes.json` sont **générés** par
  `npm run generate-regions` : ne les édite pas à la main, corrige
  scripts/generate-regions.mjs.
- src/components/region-map.tsx garde sa dernière projection hors du
  composant : l'écran de jeu le remonte à chaque question.

## Le multijoueur

Les parties à plusieurs (`/salle`) passent par **Supabase Realtime**, appelé
depuis le navigateur : canaux Broadcast + Presence, sans table ni serveur.

- `src/lib/room.ts` porte le protocole (codes, identité, messages, classement)
  et charge `@supabase/realtime-js` par `import()` dynamique : le jeu solo ne
  doit jamais l'embarquer.
- **Presence est limité en fréquence** : au-delà de quelques mises à jour en
  quelques secondes, Supabase ferme le canal du joueur (« Client presence rate
  limit exceeded »). N'y publie que ce qui change deux ou trois fois par
  partie (pseudo, statut, et les réglages pour le seul hôte). Tout ce qui
  bouge en jeu — l'avancée — passe par Broadcast (`progress`).
- On entre par le lien, qui porte les réglages, **ou par le code seul**
  (boîte « Rejoindre une partie », sur l'accueil). Rien ne doit donc supposer
  que l'URL les contient : ils viennent de la Presence de l'hôte, et le
  message `start` les porte de toute façon.
- `src/lib/round.ts` est la mécanique d'une manche, partagée par le solo et le
  multijoueur ; `src/components/quiz/quiz-board.tsx` en est l'écran commun.
- Même quiz pour tous : la graine du lancement passe à `buildRound` via
  `seeded()` (`src/lib/random.ts`). N'y introduis aucun autre `Math.random`.
- Configuration : `NEXT_PUBLIC_SUPABASE_URL` (racine du projet) et
  `NEXT_PUBLIC_SUPABASE_ANON_KEY`, dans `.env.local` et dans Vercel. Sans elles,
  `/salle` affiche « Multijoueur indisponible ».

## Les comptes et le classement

Même projet Supabase, cette fois avec une base : **Auth** (e-mail, mot de
passe, pseudo) et **Postgres**, appelés depuis le navigateur.

- Le schéma est dans `supabase/migrations/` : toute évolution passe par un
  nouveau fichier de migration, jamais par une modification d'un fichier déjà
  appliqué.
- Les clients ne font que lire. Un temps passe par **deux** fonctions :
  `start_round` ouvre la manche (l'écran attend sa réponse avant la première
  question) et `finish_round` la ferme en confrontant le temps annoncé au
  temps écoulé côté base. Ne réintroduis pas d'envoi de temps sans manche
  ouverte : c'était la faille de `submit_scores`, supprimée.
  Une manche qui ne sera pas trouvée en entier (arrêtée, écran quitté) est
  effacée par `cancel_round` ; la base nettoie celles de plus de deux heures.
- Les classements permis sont dans la table `boards`. Une nouvelle zone ou
  une nouvelle longueur de manche demande une migration qui les y ajoute.
- Retirer un tricheur : `select public.ban_player('Pseudo');` dans le SQL
  Editor. Le classement se lit par `get_leaderboard`, en un seul appel.
- `src/lib/supabase.ts` charge `@supabase/auth-js` et `@supabase/postgrest-js`
  par `import()`, comme Realtime : un invité n'en télécharge rien, tant
  qu'aucune session n'est enregistrée sur l'appareil (`hasStoredSession`).
- `src/lib/account.ts` et `src/lib/leaderboard.ts` ne dépendent pas de React ;
  leur hook est dans `src/components/use-account.ts`.
- Une manche jouée hors ligne ne compte pas au classement (elle reste un
  record local), et le dernier classement lu est gardé : le solo ne dépend
  jamais du réseau.
- Le chronomètre lit `clock()` (src/lib/timer.ts, `performance.now()`), jamais
  `Date.now()` : l'heure du système se change à la main.
- Rien dans la page ne doit nommer la réponse de la question affichée. Un
  drapeau passe par `src/lib/flags.ts` et se dessine dans un canvas : pas
  d'`<img>` flagcdn (le code du pays est dans l'adresse), pas d'emoji drapeau
  (ses deux lettres sont ce code).
- `vercel.json` porte les en-têtes de sécurité (CSP). Un nouveau domaine
  appelé par le navigateur doit y être ajouté.

## Le service worker

`scripts/service-worker.js` est un **modèle**. `npm run build` y injecte la
liste des fichiers de `out/` et une empreinte, puis écrit `out/sw.js`.
Après toute modification, lance `npm test` : la suite l'exerce hors navigateur
(installation, activation, navigation hors ligne, cache des drapeaux).

## Vérifications avant de rendre la main

```sh
npm run typecheck && npm run lint && npm run build && npm test
```
