/**
 * Retour haptique.
 *
 * L'API Vibration est absente sur iOS et sur ordinateur : l'appel y est sans
 * effet, ce qui convient — la vibration confirme une réponse déjà annoncée à
 * l'écran, elle ne porte jamais l'information seule.
 */

function vibrate(pattern: number | number[]): void {
  try {
    navigator.vibrate?.(pattern);
  } catch {
    // Certains navigateurs refusent la vibration hors geste utilisateur.
  }
}

/** Deux impulsions courtes et nettes : bonne réponse. */
export function vibrateSuccess(): void {
  vibrate([12, 40, 12]);
}

/** Une impulsion longue et sourde : réponse manquée. */
export function vibrateError(): void {
  vibrate(90);
}
