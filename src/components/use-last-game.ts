'use client';

import { useSyncExternalStore } from 'react';

import { readLastGame, subscribeLastGame, type LastGame } from '@/lib/last-game';

/**
 * La dernière partie lancée, ou null. L'instantané serveur est constant (null) :
 * l'accueil est rendu à la compilation avec les réglages par défaut, et ceux
 * de l'appareil n'arrivent qu'après l'hydratation.
 */
export function useLastGame(): LastGame | null {
  return useSyncExternalStore(subscribeLastGame, readLastGame, () => null);
}
