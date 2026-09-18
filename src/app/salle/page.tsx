import type { Metadata } from 'next';
import { Suspense } from 'react';

import { RoomScreen } from '@/components/multi/room-screen';

export const metadata: Metadata = {
  title: 'Partie à plusieurs',
};

/**
 * La salle lit son code dans l'URL et le pseudo dans le stockage local : elle
 * n'existe qu'au moment de la visite. La page exportée ne contient que le
 * repli ; l'écran prend sa place à l'ouverture, comme pour /quiz.
 */
export default function SallePage() {
  return (
    <Suspense fallback={<Loading />}>
      <RoomScreen />
    </Suspense>
  );
}

function Loading() {
  return (
    <main
      style={{
        minHeight: '100dvh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        color: 'var(--ink-soft)',
        fontWeight: 600,
      }}>
      Ouverture de la salle…
    </main>
  );
}
