import type { Metadata } from 'next';

import { AccountScreen } from '@/components/account/account-screen';
import { LegalLinks } from '@/components/legal/legal-links';

export const metadata: Metadata = {
  title: 'Mon compte',
};

export default function ComptePage() {
  return (
    <main className="screen">
      <AccountScreen />
      <LegalLinks />
    </main>
  );
}
