'use client';

import { useSyncExternalStore } from 'react';

import { getAccount, LOADING, subscribeAccount, type Account } from '@/lib/account';

/**
 * Le compte du joueur. Pendant le rendu statique et l'hydratation, il est
 * toujours « en cours de lecture » : la session vit dans le stockage local,
 * que le HTML construit à la compilation ne connaît pas.
 */
export function useAccount(): Account {
  return useSyncExternalStore(subscribeAccount, getAccount, () => LOADING);
}
