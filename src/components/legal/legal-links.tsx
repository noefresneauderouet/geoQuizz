import Link from 'next/link';

import { LEGAL_PAGES } from '@/constants/site';

import styles from './legal.module.css';

/**
 * Le pied des écrans à onglets : les trois pages légales, en petit.
 *
 * L'accueil doit en porter le lien : l'écran de consentement de Google
 * (« Continuer avec Google ») vérifie que la page d'accueil mène à la
 * politique de confidentialité.
 */
export function LegalLinks({ current }: { current?: string }) {
  return (
    <nav className={styles.links} aria-label="Informations légales">
      {LEGAL_PAGES.map((page) => (
        <Link
          key={page.href}
          href={page.href}
          className={styles.link}
          aria-current={page.href === current ? 'page' : undefined}>
          {page.label}
        </Link>
      ))}
    </nav>
  );
}
