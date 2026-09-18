# GeoLearn

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

## Le service worker

`scripts/service-worker.js` est un **modèle**. `npm run build` y injecte la
liste des fichiers de `out/` et une empreinte, puis écrit `out/sw.js`.
Après toute modification, lance `npm test` : la suite l'exerce hors navigateur
(installation, activation, navigation hors ligne, cache des drapeaux).

## Vérifications avant de rendre la main

```sh
npm run typecheck && npm run lint && npm run build && npm test
```
