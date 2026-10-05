'use client';

import { useEffect, useSyncExternalStore } from 'react';

import { useAccount } from '@/components/use-account';
import { myBestsOf, refreshMyBests, subscribeMyBests, type MyBests } from '@/lib/leaderboard';

/**
 * Les records du joueur au classement (voir leaderboard.ts) : `null` pour un
 * invité, ou tant qu'ils n'ont jamais pu être lus. L'écran qui s'en sert les
 * relit à l'ouverture.
 *
 * Pendant le rendu statique et l'hydratation, le compte est « en cours de
 * lecture » : le hook rend `null`, comme le HTML construit à la compilation.
 */
export function useMyBests(): MyBests | null {
  const account = useAccount();
  const viewer = account.status === 'signed-in' ? account.id : null;
  const bests = useSyncExternalStore(
    subscribeMyBests,
    () => (viewer === null ? null : myBestsOf(viewer)),
    () => null,
  );

  useEffect(() => {
    if (viewer !== null) void refreshMyBests(viewer).catch(() => undefined);
  }, [viewer]);

  return bests;
}
