/**
 * Stockage clé/valeur synchrone, adossé à localStorage.
 *
 * La progression tient en quelques centaines d'octets : ni IndexedDB ni
 * SQLite/WASM ne se justifient, et localStorage a le mérite d'être
 * synchrone — le store de src/lib/progress.ts lit son instantané sans
 * passer par une promesse.
 *
 * Le quota et le mode privé sont les deux cas d'échec ; ils sont avalés,
 * l'app reste jouable sans conserver les scores.
 *
 * Les clés commencent par `geolearn.`, l'ancien nom du jeu, et le gardent :
 * en changer ferait perdre à chaque joueur sa progression et ses réglages.
 */
export function getItem(key: string): string | null {
  try {
    return globalThis.localStorage?.getItem(key) ?? null;
  } catch {
    return null;
  }
}

export function setItem(key: string, value: string): void {
  try {
    globalThis.localStorage?.setItem(key, value);
  } catch {
    // mode privé ou stockage plein
  }
}
