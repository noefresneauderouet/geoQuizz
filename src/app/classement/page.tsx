import type { Metadata } from 'next';
import { Suspense } from 'react';

import { LeaderboardScreen } from '@/components/leaderboard/leaderboard-screen';

export const metadata: Metadata = {
  title: 'Classement',
};

/**
 * Le classement peut s'ouvrir sur une zone précise, depuis l'écran de fin
 * (/classement?category=europe&mode=drapeau&length=10) : les paramètres de
 * l'URL imposent une frontière Suspense, comme pour /quiz.
 */
export default function ClassementPage() {
  return (
    <main className="screen">
      <Suspense fallback={null}>
        <LeaderboardScreen />
      </Suspense>
    </main>
  );
}
