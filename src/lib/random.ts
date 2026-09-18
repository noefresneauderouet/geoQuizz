/**
 * Hasard reproductible.
 *
 * Une partie à plusieurs doit tirer la même manche sur chaque appareil sans
 * qu'on s'échange la liste des questions : les joueurs partagent une graine,
 * et chacun en déroule la même suite de nombres. Le générateur est
 * *mulberry32* — rapide, sans dépendance, largement suffisant pour mélanger
 * quelques centaines de pays.
 */

/** Une source de nombres dans [0, 1), à la manière de `Math.random`. */
export type Random = () => number;

/** Une graine tirée au hasard, à transmettre aux autres joueurs. */
export function newSeed(): number {
  return Math.floor(Math.random() * 2 ** 32);
}

export function seeded(seed: number): Random {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 2 ** 32;
  };
}
