'use client';

import { useSyncExternalStore } from 'react';

/**
 * Mise en page téléphone : écran étroit, ou couché. C'est la requête de
 * answer-input.module.css, qui y range ses boutons à droite du champ : les
 * deux doivent changer ensemble.
 */
const PHONE_QUERY = '(max-width: 699px), (max-height: 500px)';

function subscribe(onChange: () => void) {
  const list = window.matchMedia(PHONE_QUERY);
  list.addEventListener('change', onChange);
  return () => list.removeEventListener('change', onChange);
}

/** Faux au rendu serveur et pendant l'hydratation : l'instantané serveur est constant. */
export function usePhoneLayout(): boolean {
  return useSyncExternalStore(
    subscribe,
    () => window.matchMedia(PHONE_QUERY).matches,
    () => false,
  );
}
