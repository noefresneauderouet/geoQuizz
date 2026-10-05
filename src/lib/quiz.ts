import { isRegionSet, type CategoryId, type ModeId, type RegionSetId } from '@/constants/categories';
import { COUNTRIES, countriesOf, type Country } from '@/lib/countries';
import { matchAnswer, type MatchResult } from '@/lib/normalize';
import type { Random } from '@/lib/random';
import { regionSet, type Region } from '@/lib/regions';

/**
 * Une question porte toujours un pays. En mode « États », c'est celui de la
 * région cherchée : son drapeau et son nom servent à la correction.
 */
export type Question =
  | { mode: Exclude<ModeId, 'etats'>; country: Country }
  | { mode: 'etats'; country: Country; set: RegionSetId; region: Region };

/** Longueurs de partie proposées à l'accueil. */
export const QUESTION_COUNTS = [10, 15, 20] as const;
export type QuestionCount = (typeof QUESTION_COUNTS)[number];
export const DEFAULT_QUESTION_COUNT: QuestionCount = 10;

/** Lit la longueur dans l'URL ; toute valeur inconnue retombe sur 10. */
export function getQuestionCount(value: string | null | undefined): QuestionCount {
  return QUESTION_COUNTS.find((count) => String(count) === value) ?? DEFAULT_QUESTION_COUNT;
}

function shuffle<T>(items: readonly T[], random: Random): T[] {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

/**
 * Toutes les questions qu'une catégorie offre dans un mode : ses pays, ou les
 * régions du pays en mode « États ». Un couple qui ne va pas ensemble — une
 * zone en mode États — n'en offre aucune.
 */
function questionsOf(category: CategoryId, mode: ModeId): Question[] {
  if (mode === 'etats') {
    if (!isRegionSet(category)) return [];
    const { country, regions } = regionSet(category);
    return regions.map((region) => ({ mode, country, set: category, region }));
  }
  if (isRegionSet(category)) return [];
  // Tous les pays sont jouables dans tous les modes, y compris sur la carte :
  // ceux qui sont trop petits pour se voir reçoivent un cercle de repérage.
  return countriesOf(category).map((country) => ({ mode, country }));
}

/** Nombre de questions différentes : une manche ne peut pas être plus longue. */
export function poolSize(category: CategoryId, mode: ModeId): number {
  return questionsOf(category, mode).length;
}

/**
 * Tire une manche. Une zone plus petite que la longueur demandée — l'Océanie
 * compte 14 pays, la France 13 régions — est jouée en entier : la manche est
 * alors plus courte, et c'est sa longueur réelle qui sert de clé aux records
 * (voir progress.ts).
 *
 * `random` n'est fourni qu'à plusieurs : une même graine (src/lib/random.ts)
 * donne alors la même manche sur chaque appareil.
 */
export function buildRound(
  category: CategoryId,
  mode: ModeId,
  count: number,
  random: Random = Math.random,
): Question[] {
  return shuffle(questionsOf(category, mode), random).slice(0, count);
}

/** Identifie une question dans sa manche : plusieurs régions partagent un pays. */
export function questionKey(q: Question): string {
  return q.mode === 'etats' ? q.region.code : q.country.code;
}

/** La consigne exacte de la question courante. */
export function questionPrompt(q: Question): string {
  if (q.mode === 'etats') return regionSet(q.set).prompt;
  if (q.mode === 'drapeau') return 'À quel pays appartient ce drapeau ?';
  if (q.mode === 'pays') return 'Quel est le pays surligné ?';
  return 'Quelle est la capitale de ce pays ?';
}

/** Ce qu'on attend dans le champ de saisie. */
export function answerLabel(q: Question): string {
  if (q.mode === 'etats') return regionSet(q.set).label;
  return q.mode === 'capitale' ? 'Capitale' : 'Pays';
}

/** La bonne réponse, telle qu'on l'affiche à l'utilisateur. */
export function expectedAnswer(q: Question): string {
  if (q.mode === 'etats') return q.region.name;
  return q.mode === 'capitale' ? q.country.capital : q.country.name;
}

/** Ce que la correction ajoute sous la réponse. */
export function answerDetail(q: Question): string {
  if (q.mode === 'etats') {
    const { capitalLabel } = regionSet(q.set);
    return q.region.capital
      ? `${q.country.name} · ${capitalLabel} : ${q.region.capital}`
      : q.country.name;
  }
  if (q.mode === 'capitale') return `capitale de ${q.country.name}`;
  return `${q.country.name} · capitale : ${q.country.capital}`;
}

function acceptedAnswers(q: Question): string[] {
  if (q.mode === 'etats') return [q.region.name, ...q.region.nameAliases];
  return q.mode === 'capitale'
    ? [q.country.capital, ...q.country.capitalAliases]
    : [q.country.name, ...q.country.nameAliases];
}

/** Les réponses des autres questions du même genre : d'autres régions, d'autres pays. */
function rivalAnswers(q: Question): string[][] {
  if (q.mode === 'etats') {
    const others = regionSet(q.set).regions.filter((r) => r.code !== q.region.code);
    return others.map((r) => [r.name, ...r.nameAliases]);
  }
  const others = COUNTRIES.filter((c) => c.code !== q.country.code);
  return q.mode === 'capitale'
    ? others.map((c) => [c.capital, ...c.capitalAliases])
    : others.map((c) => [c.name, ...c.nameAliases]);
}

/** Vérification complète, fautes de frappe tolérées : la touche Entrée. */
export function checkAnswer(q: Question, input: string): MatchResult {
  const result = matchAnswer(input, acceptedAnswers(q));
  if (result.exact || !result.correct) return result;

  // Hubei et Hebei, Irlande et Islande, Chile et Chine ne diffèrent que d'une
  // lettre : la tolérance aux fautes prendrait l'un pour l'autre. Une saisie
  // qui nomme exactement une autre région, un autre pays ou une autre capitale
  // n'est donc pas une faute de frappe, c'est une erreur.
  const namesAnother = rivalAnswers(q).some((answers) => matchAnswer(input, answers).exact);
  return namesAnother ? { correct: false, exact: false } : result;
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
