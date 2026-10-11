'use client';

import { useEffect, useSyncExternalStore } from 'react';

import { useAccount } from '@/components/use-account';
import { myAvatarOf, refreshMyAvatar, subscribeMyAvatar } from '@/lib/avatar';

/**
 * La photo du joueur connecté (voir avatar.ts) : sa référence, ou `null`
 * pour un invité, un compte sans photo, ou tant qu'elle n'a jamais pu être
 * lue. Relue dans la base à l'ouverture de l'écran qui s'en sert.
 *
 * Pendant le rendu statique et l'hydratation, le compte est « en cours de
 * lecture » : le hook rend `null`, comme le HTML construit à la compilation.
 */
export function useMyAvatar(): string | null {
  const account = useAccount();
  const viewer = account.status === 'signed-in' ? account.id : null;
  const avatar = useSyncExternalStore(
    subscribeMyAvatar,
    () => (viewer === null ? null : (myAvatarOf(viewer) ?? null)),
    () => null,
  );

  useEffect(() => {
    if (viewer !== null) void refreshMyAvatar(viewer).catch(() => undefined);
  }, [viewer]);

  return avatar;
}
