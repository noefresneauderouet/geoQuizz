'use client';

import { useInstallPrompt } from '@/lib/pwa';

import styles from './install-banner.module.css';

/**
 * Invitation à installer GeoQuizz.
 *
 * Elle ne paraît que si le navigateur accepte réellement l'installation, et
 * disparaît définitivement dès qu'on la refuse : une bannière qui revient à
 * chaque visite se fait fermer sans être lue.
 *
 * Sur iOS, aucune API n'existe — Safari réserve le geste à son menu
 * « Partager ». On décrit alors la manœuvre plutôt que d'afficher un bouton
 * qui ne pourrait rien faire.
 */
export function InstallBanner() {
  const { canPrompt, needsManualSteps, install, dismiss } = useInstallPrompt();

  if (!canPrompt && !needsManualSteps) return null;

  return (
    <aside className={styles.wrapper}>
      <div className={styles.card}>
        {/* Décorative : le texte à côté dit déjà tout. */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img className={styles.icon} src="/icons/icon-192.png" alt="" width={44} height={44} />

        <div className={styles.text}>
          <p className={styles.title}>Installer GeoQuizz</p>
          <p className={styles.subtitle}>
            {needsManualSteps
              ? 'Appuie sur Partager, puis « Sur l’écran d’accueil ».'
              : 'Plein écran, sur ton écran d’accueil, et jouable sans réseau.'}
          </p>
        </div>

        <div className={styles.actions}>
          {canPrompt ? (
            <button type="button" className={styles.primary} onClick={install}>
              Installer
            </button>
          ) : null}
          <button
            type="button"
            className={styles.secondary}
            onClick={dismiss}
            aria-label="Masquer la proposition d’installation">
            {canPrompt ? 'Plus tard' : 'Compris'}
          </button>
        </div>
      </div>
    </aside>
  );
}
