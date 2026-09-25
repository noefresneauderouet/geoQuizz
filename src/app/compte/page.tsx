import type { Metadata } from 'next';

import { AccountScreen } from '@/components/account/account-screen';

export const metadata: Metadata = {
  title: 'Mon compte',
};

export default function ComptePage() {
  return (
    <main className="screen">
      <AccountScreen />
    </main>
  );
}
