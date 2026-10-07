import { AppMenu } from '@/components/app-menu';
import { LegalLinks } from '@/components/legal/legal-links';
import { CONTACT_EMAIL, LEGAL_UPDATED } from '@/constants/site';

import styles from './legal.module.css';

/**
 * Gabarit commun des pages légales : un titre, la date du texte, des
 * sections, et les liens vers les deux autres pages.
 *
 * Le texte décrit ce que fait le site pour de bon : un nouveau service appelé
 * par le navigateur, ou une nouvelle donnée enregistrée, se reporte dans
 * /confidentialite (et LEGAL_UPDATED avance).
 */
export function LegalPage({
  title,
  path,
  children,
}: {
  title: string;
  path: string;
  children: React.ReactNode;
}) {
  return (
    <main className="screen">
      <article className={styles.page}>
        <header className="pageHeader">
          <div className={styles.header}>
            <h1 className={styles.title}>{title}</h1>
            <p className={styles.updated}>Mise à jour le {LEGAL_UPDATED}</p>
          </div>
          <AppMenu />
        </header>
        {children}
      </article>
      <LegalLinks current={path} />
    </main>
  );
}

/** Une section titrée. */
export function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className={styles.section}>
      <h2 className={styles.heading}>{title}</h2>
      {children}
    </section>
  );
}

/** L'adresse de contact, cliquable. */
export function ContactEmail() {
  return (
    <a className={styles.inline} href={`mailto:${CONTACT_EMAIL}`}>
      {CONTACT_EMAIL}
    </a>
  );
}

/** Un lien vers un autre site, souligné comme les liens du texte. */
export function External({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <a className={styles.inline} href={href} target="_blank" rel="noopener noreferrer">
      {children}
    </a>
  );
}
