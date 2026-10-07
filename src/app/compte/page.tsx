import type { Metadata } from 'next';

import { AccountScreen } from '@/components/account/account-screen';
import { AppMenu } from '@/components/app-menu';
import { LegalLinks } from '@/components/legal/legal-links';

export const metadata: Metadata = {
  title: 'Mon compte',
};

export default function ComptePage() {
  return (
    <main className="screen">
      {/* Le compte tient dans une carte qui porte son propre titre : l'en-tête
          ne garde que le menu. */}
      <header className="pageHeader">
        <AppMenu />
      </header>
      <AccountScreen />
      <LegalLinks />
    </main>
  );
}
