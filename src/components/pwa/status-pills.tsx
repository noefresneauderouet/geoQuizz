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
 * données embarquées, et les drapeaux sont téléchargés à l'installation du
 * service worker. Le dire rassure : l'app reste utilisable.
 */
export function StatusPills() {
  const online = useOnline();
  const update = useServiceWorker();

  if (online && !update.ready) return null;

  return (
    <div className={styles.wrapper}>
      {!online ? (
        <p className={`${styles.pill} ${styles.offline}`} role="status">
          Hors ligne · tout reste jouable
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
