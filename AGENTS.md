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

## Le service worker

`scripts/service-worker.js` est un **modèle**. `npm run build` y injecte la
liste des fichiers de `out/` et une empreinte, puis écrit `out/sw.js`.
Après toute modification, lance `npm test` : la suite l'exerce hors navigateur
(installation, activation, navigation hors ligne, cache des drapeaux).

## Vérifications avant de rendre la main

```sh
npm run typecheck && npm run lint && npm run build && npm test
```
