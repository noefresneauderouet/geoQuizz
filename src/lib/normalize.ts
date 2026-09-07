/**
 * Comparaison tolérante des réponses tapées : insensible à la casse, aux accents,
 * à la ponctuation, aux articles, et à une ou deux fautes de frappe.
 */

/** « Côte d'Ivoire » -> « cote ivoire » */
export function normalize(input: string): string {
  return input
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '') // accents
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ') // apostrophes, tirets, points
    .replace(/\b(le|la|les|l|du|de|des|d|the|of|el)\b/g, ' ') // articles
    .replace(/\s+/g, ' ')
    .trim();
}

/** Distance de Levenshtein bornée : renvoie > max dès qu'on dépasse le seuil. */
export function levenshtein(a: string, b: string, max = 3): number {
  if (a === b) return 0;
  if (Math.abs(a.length - b.length) > max) return max + 1;

  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const curr = [i];
    let rowMin = i;
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      curr[j] = Math.min(curr[j - 1] + 1, prev[j] + 1, prev[j - 1] + cost);
      rowMin = Math.min(rowMin, curr[j]);
    }
    if (rowMin > max) return max + 1;
    prev = curr;
  }
  return prev[b.length];
}

/** Tolérance proportionnelle : 0 faute sous 5 lettres, 1 jusqu'à 9, 2 au-delà. */
function allowedTypos(length: number): number {
  if (length <= 4) return 0;
  if (length <= 9) return 1;
  return 2;
}

export type MatchResult = { correct: boolean; exact: boolean };

/**
 * Le texte saisi correspond-il à l'une des réponses acceptées ?
 * `exact` distingue la réponse parfaite de celle rattrapée par la tolérance,
 * ce qui permet d'afficher « presque ! voici l'orthographe exacte ».
 */
export function matchAnswer(input: string, accepted: readonly string[]): MatchResult {
  const guess = normalize(input);
  if (!guess) return { correct: false, exact: false };

  for (const candidate of accepted) {
    const target = normalize(candidate);
    if (!target) continue;
    if (guess === target) return { correct: true, exact: true };
  }

  for (const candidate of accepted) {
    const target = normalize(candidate);
    if (!target) continue;
    if (levenshtein(guess, target, allowedTypos(target.length)) <= allowedTypos(target.length)) {
      return { correct: true, exact: false };
    }
  }

  return { correct: false, exact: false };
}
