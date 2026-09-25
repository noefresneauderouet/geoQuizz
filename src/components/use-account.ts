'use client';

import { useEffect, useSyncExternalStore } from 'react';

import { getAccount, LOADING, subscribeAccount, type Account } from '@/lib/account';
import { startLeaderboardSync } from '@/lib/leaderboard';
import { readStats } from '@/lib/progress';

/**
 * Le compte du joueur. Pendant le rendu statique et l'hydratation, il est
 * toujours « en cours de lecture » : la session vit dans le stockage local,
 * que le HTML construit à la compilation ne connaît pas.
 */
export function useAccount(): Account {
  return useSyncExternalStore(subscribeAccount, getAccount, () => LOADING);
}

/**
 * Posé une fois dans le layout : renvoie au classement les temps restés en
 * attente (partie finie hors ligne), à l'ouverture et au retour du réseau.
 * Un invité ne charge rien.
 */
export function LeaderboardSync() {
  useEffect(() => startLeaderboardSync(readStats), []);
  return null;
}
