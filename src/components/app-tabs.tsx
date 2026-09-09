'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

import styles from './app-tabs.module.css';

const TABS = [
  { href: '/', label: 'Apprendre' },
  { href: '/profil', label: 'Profil' },
] as const;

/**
 * Deux onglets, pas plus : on apprend, ou on regarde sa progression.
 *
 * La barre s'efface pendant une partie. Un quiz est un écran plein, dont on
 * sort par sa propre croix ; laisser les onglets par-dessus invitait à
 * changer d'écran au milieu d'une question — et à perdre la manche, puisque
 * chaque route se démonte en la quittant.
 */
export function AppTabs() {
  const pathname = usePathname();
  if (pathname.startsWith('/quiz')) return null;

  return (
    <nav className={styles.bar} aria-label="Navigation principale">
      <div className={styles.inner}>
        <span className={styles.brand}>GeoLearn</span>
        {TABS.map((tab) => {
          const active = pathname === tab.href;
          return (
            <Link
              key={tab.href}
              href={tab.href}
              className={active ? `${styles.tab} ${styles.tabActive}` : styles.tab}
              aria-current={active ? 'page' : undefined}>
              {tab.label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
