import type { Metadata } from 'next';

import { ProgressReport } from '@/components/progress-report';

export const metadata: Metadata = {
  /* Le layout complète en « … — GeoLearn ». */
  title: 'Ma progression',
};

export default function ProfilPage() {
  return (
    <main className="screen">
      <ProgressReport />
    </main>
  );
}
