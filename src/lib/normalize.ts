/**
 * Comparaison tolérante des réponses tapées : insensible à la casse, aux accents,
 * à la ponctuation, aux espaces, aux articles, au mot « îles », à l'abréviation
 * « St », et à une ou deux fautes de frappe.
 */

/** Accents, casse et ponctuation : « Côte d'Ivoire » -> « cote d ivoire ». */
function simplify(input: string): string {
  return input
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '') // accents
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' '); // apostrophes, tirets, points
}

/**
 * Colle les mots : « coree du nord » -> « coreedunord ». « Saint » devient
 * « st » des deux côtés, pour que « St Vincent » vaille « Saint-Vincent ».
 */
function compact(text: string): string {
  return text.replace(/\s+/g, '').replace(/saint/g, 'st');
}

/** « Côte d'Ivoire » -> « coteivoire », « Îles Marshall » -> « marshall » */
export function normalize(input: string): string {
  return compact(
    simplify(input)
      .replace(/\b(le|la|les|l|du|de|des|d|the|of|el)\b/g, ' ') // articles
      .replace(/\b(iles?)\b/g, ' '), // « Îles Marshall » se trouve avec « Marshall »
  );
}

/**
 * Les formes comparées d'un texte : sans les articles, et avec.
 *
 * Les articles ne se repèrent qu'entre deux espaces. Tapés collés
 * — « coreedunord » —, ils restent dans la saisie : on garde donc aussi la
 * forme qui les conserve, pour que « coreedunord » vaille « Corée du Nord ».
 */
function forms(input: string): string[] {
  return [...new Set([normalize(input), compact(simplify(input))])].filter(Boolean);
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
  const guesses = forms(input);
  if (!normalize(input)) return { correct: false, exact: false };

  const targets = accepted.flatMap(forms);

  if (targets.some((target) => guesses.includes(target))) {
    return { correct: true, exact: true };
  }

  for (const target of targets) {
    const max = allowedTypos(target.length);
    if (guesses.some((guess) => levenshtein(guess, target, max) <= max)) {
      return { correct: true, exact: false };
    }
  }

  return { correct: false, exact: false };
}
