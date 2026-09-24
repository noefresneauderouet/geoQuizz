'use client';

import { useSyncExternalStore } from 'react';

const noSubscription = () => () => {};

/**
 * Vrai dans le navigateur une fois l'hydratation faite, faux au rendu serveur
 * et pendant l'hydratation : l'instantané serveur est constant, donc les
 * deux rendus coïncident.
 *
 * Pour les écrans qui n'existent qu'au navigateur — stockage local, tirage
 * aléatoire. En développement, Next les rend aussi côté serveur, avec les
 * vrais paramètres de l'URL : ils affichent un repli tant que c'est faux,
 * sinon les deux rendus divergeraient.
 */
export function useInBrowser(): boolean {
  return useSyncExternalStore(
    noSubscription,
    () => true,
    () => false,
  );
}
