'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useRef, type MouseEvent } from 'react';

import { ThemeSelector } from '@/components/theme-selector';

import styles from './app-menu.module.css';

const LINKS = [
  { href: '/', label: 'Jouer', emoji: '🎮' },
  { href: '/classement', label: 'Classement', emoji: '🏆' },
  { href: '/profil', label: 'Profil', emoji: '👤' },
] as const;

/**
 * Le menu, en haut à gauche de chaque écran : on apprend, on se compare aux
 * autres, on regarde sa progression, et on choisit le thème.
 *
 * Chaque écran le pose dans son en-tête (classe globale `pageHeader`). Une
 * partie, solo ou en salle, n'en a pas : c'est un écran plein, dont on sort
 * par sa propre croix ; changer d'écran au milieu d'une question ferait
 * perdre la manche.
 *
 * `<dialog>` plutôt qu'un panneau maison, comme « Rejoindre une partie » : le
 * navigateur se charge du fond assombri, de la fermeture par Échap et du
 * piège à focus, et le HTML exporté le contient déjà, masqué.
 */
export function AppMenu() {
  const pathname = usePathname();
  const dialog = useRef<HTMLDialogElement>(null);
  const close = () => dialog.current?.close();

  /* Le panneau n'occupe qu'une bande de l'écran : un clic qui atteint la
     boîte elle-même tombe sur le fond, donc à côté. */
  const clickOutside = (event: MouseEvent<HTMLDialogElement>) => {
    if (event.target === dialog.current) close();
  };

  return (
    <>
      <button
        type="button"
        className={styles.trigger}
        aria-label="Menu"
        aria-haspopup="dialog"
        onClick={() => dialog.current?.showModal()}>
        <svg className={styles.icon} viewBox="0 0 24 24" aria-hidden="true">
          <path d="M4 6.5h16M4 12h16M4 17.5h16" />
        </svg>
      </button>

      <dialog
        ref={dialog}
        className={styles.panel}
        onClick={clickOutside}
        aria-labelledby="app-menu-title">
        <div className={styles.content}>
          <div className={styles.head}>
            <p className={styles.brand} id="app-menu-title">
              <span aria-hidden="true">🌍</span> GeoQuizz
            </p>
            <button
              type="button"
              className={styles.close}
              aria-label="Fermer le menu"
              onClick={close}>
              ✕
            </button>
          </div>

          <nav aria-label="Navigation principale">
            <ul className={styles.links}>
              {LINKS.map((link) => {
                const active = pathname === link.href;
                return (
                  <li key={link.href}>
                    {/* Le lien de l'écran ouvert ne mène nulle part : il
                        referme le menu, comme les autres. */}
                    <Link
                      href={link.href}
                      onClick={close}
                      className={active ? `${styles.link} ${styles.linkActive}` : styles.link}
                      aria-current={active ? 'page' : undefined}>
                      <span aria-hidden="true">{link.emoji}</span>
                      {link.label}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </nav>

          <h2 className="sectionTitle">Thème</h2>
          <div className={styles.theme}>
            <ThemeSelector />
          </div>
          <p className={styles.hint}>Auto suit le réglage clair ou sombre de ton appareil.</p>
        </div>
      </dialog>
    </>
  );
}
