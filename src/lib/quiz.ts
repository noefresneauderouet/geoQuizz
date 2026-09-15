import type { CategoryId, ModeId } from '@/constants/categories';
import { countriesOf, type Country } from '@/lib/countries';
import { matchAnswer, type MatchResult } from '@/lib/normalize';

export type Question = {
  country: Country;
  mode: ModeId;
};

/** Longueurs de partie proposées à l'accueil. */
export const QUESTION_COUNTS = [10, 15, 20] as const;
export type QuestionCount = (typeof QUESTION_COUNTS)[number];
export const DEFAULT_QUESTION_COUNT: QuestionCount = 10;

/** Lit la longueur dans l'URL ; toute valeur inconnue retombe sur 10. */
export function getQuestionCount(value: string | null | undefined): QuestionCount {
  return QUESTION_COUNTS.find((count) => String(count) === value) ?? DEFAULT_QUESTION_COUNT;
}

function shuffle<T>(items: readonly T[]): T[] {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

/**
 * Tire une manche. Une zone plus petite que la longueur demandée — l'Océanie
 * compte 14 pays — est jouée en entier : la manche est alors plus courte, et
 * c'est sa longueur réelle qui sert de clé aux records (voir progress.ts).
 */
export function buildRound(category: CategoryId, mode: ModeId, count: number): Question[] {
  // Tous les pays sont jouables dans tous les modes, y compris sur la carte :
  // ceux qui sont trop petits pour se voir reçoivent un cercle de repérage.
  return shuffle(countriesOf(category))
    .slice(0, count)
    .map((country) => ({ country, mode }));
}

/** La consigne exacte de la question courante. */
export function questionPrompt(q: Question): string {
  if (q.mode === 'drapeau') return 'À quel pays appartient ce drapeau ?';
  if (q.mode === 'pays') return 'Quel est le pays surligné ?';
  return 'Quelle est la capitale de ce pays ?';
}

/** Ce qu'on attend dans le champ de saisie. */
export function answerLabel(q: Question): string {
  return q.mode === 'capitale' ? 'Capitale' : 'Pays';
}

/** La bonne réponse, telle qu'on l'affiche à l'utilisateur. */
export function expectedAnswer(q: Question): string {
  return q.mode === 'capitale' ? q.country.capital : q.country.name;
}

function acceptedAnswers(q: Question): string[] {
  return q.mode === 'capitale'
    ? [q.country.capital, ...q.country.capitalAliases]
    : [q.country.name, ...q.country.nameAliases];
}

/** Vérification complète, fautes de frappe tolérées : la touche Entrée. */
export function checkAnswer(q: Question, input: string): MatchResult {
  return matchAnswer(input, acceptedAnswers(q));
}

/**
 * Vérification à chaque frappe : seule la réponse exacte — casse, accents et
 * articles mis à part — est acceptée d'elle-même.
 *
 * La tolérance aux fautes reste réservée à Entrée. Appliquée en direct, elle
 * validerait des mots encore en cours d'écriture, dès qu'ils passent à une
 * lettre de la bonne réponse.
 */
export function isSolvedWhileTyping(q: Question, input: string): boolean {
  return matchAnswer(input, acceptedAnswers(q)).exact;
}
