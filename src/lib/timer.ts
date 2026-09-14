/**
 * Le chronomètre d'une manche.
 *
 * Ce qui est mesuré n'est pas le temps passé devant l'écran, mais celui passé
 * à chercher : l'horloge se met en pause dès qu'on lit la correction et
 * repart à la question suivante. Deux parties restent ainsi comparables même
 * si l'une a été interrompue — c'est ce chiffre qui portera le classement.
 *
 * Il n'y a pas d'horloge interne ici : un chronomètre est une valeur
 * immuable, qu'on lit en lui donnant l'instant courant. L'affichage peut donc
 * se rafraîchir aussi souvent qu'il le veut sans jamais toucher à l'état.
 */

export type Stopwatch = {
  /** Millisecondes accumulées par les segments déjà terminés. */
  elapsed: number;
  /** Début du segment en cours, ou `null` quand le chronomètre est en pause. */
  since: number | null;
};

export const IDLE_WATCH: Stopwatch = { elapsed: 0, since: null };

/** Relance le chronomètre. Sans effet s'il tourne déjà. */
export function startWatch(watch: Stopwatch, now: number): Stopwatch {
  return watch.since === null ? { elapsed: watch.elapsed, since: now } : watch;
}

/** Fige le temps accumulé. Sans effet s'il est déjà en pause. */
export function pauseWatch(watch: Stopwatch, now: number): Stopwatch {
  return watch.since === null ? watch : { elapsed: readWatch(watch, now), since: null };
}

export function readWatch(watch: Stopwatch, now: number): number {
  // L'horloge système peut reculer (mise à l'heure, changement manuel) : un
  // segment ne compte jamais négativement.
  return watch.since === null ? watch.elapsed : watch.elapsed + Math.max(0, now - watch.since);
}

/** `m:ss` — 0:07, 1:42, 12:03. Au-delà d'une heure, on continue en minutes. */
export function formatDuration(ms: number): string {
  const total = Math.max(0, Math.round(ms / 1000));
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`;
}

/** Une durée courte, au dixième : « 4,2 s ». */
export function formatSeconds(ms: number): string {
  return `${(Math.max(0, ms) / 1000).toFixed(1).replace('.', ',')} s`;
}
