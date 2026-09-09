import type { Metadata } from 'next';
import { Suspense } from 'react';

import { QuizGame } from '@/components/quiz/quiz-game';

export const metadata: Metadata = {
  title: 'Partie en cours',
};

/**
 * `QuizGame` lit la zone et le mode dans l'URL. Un composant qui consulte les
 * paramètres de requête ne peut pas être figé à la compilation — ils
 * n'existent qu'au moment de la visite — d'où la frontière Suspense : la page
 * exportée contient ce repli, et le jeu prend sa place à l'ouverture.
 */
export default function QuizPage() {
  return (
    <Suspense fallback={<Loading />}>
      <QuizGame />
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
      Préparation de la partie…
    </main>
  );
}
