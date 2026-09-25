'use client';

import { useEffect, useState } from 'react';

import { clock, formatDuration, readWatch, type Stopwatch } from '@/lib/timer';

import styles from './round-timer.module.css';

/** Sous ce seuil, le compte à rebours passe en alerte. */
const URGENT_MS = 10_000;

type Props = {
  watch: Stopwatch;
  /**
   * Fin de la partie (horodatage), quand elle a une limite de temps : on
   * affiche alors le temps restant plutôt que le temps écoulé.
   */
  deadline?: number | null;
};

/**
 * L'affichage du chronomètre, isolé dans son propre composant.
 *
 * Le tic ne sort pas d'ici : si l'écran de jeu se rafraîchissait à chaque
 * seconde, il redessinerait la carte du monde avec lui. Le temps, lui, vit
 * dans le `Stopwatch` passé en accessoire — ce composant ne fait que le lire.
 */
export function RoundTimer({ watch, deadline = null }: Props) {
  const read = () => (deadline === null ? readWatch(watch, clock()) : deadline - Date.now());
  const [ms, setMs] = useState(read);

  useEffect(() => {
    const tick = () => setMs(read());
    tick();
    // Un compte à rebours tourne même pendant l'affichage d'une réponse : la
    // limite est la même pour tous, pauses comprises.
    if (deadline === null && watch.since === null) return;
    // Deux tics par seconde : la seconde affichée ne traîne jamais assez pour
    // se voir, et la page n'est pas réveillée soixante fois pour autant.
    const id = setInterval(tick, 500);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [watch, deadline]);

  if (deadline !== null) {
    // Arrondi au-dessus : « 0:00 » ne s'affiche qu'une fois le temps écoulé.
    const left = Math.max(0, Math.ceil(ms / 1000) * 1000);
    return (
      <p className={left <= URGENT_MS ? `${styles.timer} ${styles.urgent}` : styles.timer}>
        <span aria-hidden="true">⏳</span>
        <span className={styles.value} aria-label={`Temps restant : ${formatDuration(left)}`}>
          {formatDuration(left)}
        </span>
      </p>
    );
  }

  return (
    <p className={styles.timer}>
      <span aria-hidden="true">⏱</span>
      {/* Le temps change sans arrêt : le faire annoncer noierait le reste. */}
      <span className={styles.value} aria-label={`Temps écoulé : ${formatDuration(ms)}`}>
        {formatDuration(ms)}
      </span>
    </p>
  );
}
