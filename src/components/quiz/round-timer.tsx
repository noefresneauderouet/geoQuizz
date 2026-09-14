'use client';

import { useEffect, useState } from 'react';

import { formatDuration, readWatch, type Stopwatch } from '@/lib/timer';

import styles from './round-timer.module.css';

/**
 * L'affichage du chronomètre, isolé dans son propre composant.
 *
 * Le tic ne sort pas d'ici : si l'écran de jeu se rafraîchissait à chaque
 * seconde, il redessinerait la carte du monde avec lui. Le temps, lui, vit
 * dans le `Stopwatch` passé en accessoire — ce composant ne fait que le lire.
 */
export function RoundTimer({ watch }: { watch: Stopwatch }) {
  const [ms, setMs] = useState(watch.elapsed);

  useEffect(() => {
    const tick = () => setMs(readWatch(watch, Date.now()));
    tick();
    if (watch.since === null) return;
    // Deux tics par seconde : la seconde affichée ne traîne jamais assez pour
    // se voir, et la page n'est pas réveillée soixante fois pour autant.
    const id = setInterval(tick, 500);
    return () => clearInterval(id);
  }, [watch]);

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
