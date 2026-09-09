'use client';

import { useOnline, useServiceWorker } from '@/lib/pwa';

import styles from './status-pills.module.css';

/**
 * Les deux seuls messages système de l'app, en haut de l'écran.
 *
 * C'est aussi ce composant qui enregistre le service worker : il est monté
 * par le layout racine, donc présent sur toutes les pages, et c'est lui qui
 * a besoin d'en connaître l'état.
 *
 * « Hors ligne » est informatif et non bloquant : les questions sortent de
 * données embarquées, seules les images de drapeaux viennent du réseau. Le
 * dire évite qu'on prenne un emoji de secours pour un bug.
 */
export function StatusPills() {
  const online = useOnline();
  const update = useServiceWorker();

  if (online && !update.ready) return null;

  return (
    <div className={styles.wrapper}>
      {!online ? (
        <p className={`${styles.pill} ${styles.offline}`} role="status">
          Hors ligne · les drapeaux déjà vus restent affichés
        </p>
      ) : null}

      {update.ready ? (
        <div className={`${styles.pill} ${styles.update}`} role="status">
          <span>Nouvelle version disponible</span>
          <button type="button" className={styles.action} onClick={update.apply}>
            Mettre à jour
          </button>
        </div>
      ) : null}
    </div>
  );
}
