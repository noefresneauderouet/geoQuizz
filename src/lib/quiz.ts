import type { CategoryId, ModeId } from '@/constants/categories';
import { countriesOf, type Country } from '@/lib/countries';
import { matchAnswer, type MatchResult } from '@/lib/normalize';

export type Question = {
  country: Country;
  mode: ModeId;
  /** En mode capitale, on demande une fois sur trois le pays à partir de la capitale. */
  reversed: boolean;
};

export const QUESTIONS_PER_ROUND = 10;

function shuffle<T>(items: readonly T[]): T[] {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

export function buildRound(category: CategoryId, mode: ModeId): Question[] {
  // Tous les pays sont jouables dans tous les modes, y compris sur la carte :
  // ceux qui sont trop petits pour se voir reçoivent un cercle de repérage.
  return shuffle(countriesOf(category))
    .slice(0, QUESTIONS_PER_ROUND)
    .map((country) => ({
      country,
      mode,
      reversed: mode === 'capitale' && Math.random() < 0.34,
    }));
}

/** La consigne exacte de la question courante. */
export function questionPrompt(q: Question): string {
  if (q.mode === 'drapeau') return 'À quel pays appartient ce drapeau ?';
  if (q.mode === 'pays') return 'Quel est le pays surligné ?';
  return q.reversed
    ? `${q.country.capital} est la capitale de quel pays ?`
    : `Quelle est la capitale de ce pays ?`;
}

/** Ce qu'on attend dans le champ de saisie. */
export function answerLabel(q: Question): string {
  return q.mode === 'capitale' && !q.reversed ? 'Capitale' : 'Pays';
}

/** La bonne réponse, telle qu'on l'affiche à l'utilisateur. */
export function expectedAnswer(q: Question): string {
  return q.mode === 'capitale' && !q.reversed ? q.country.capital : q.country.name;
}

function acceptedAnswers(q: Question): string[] {
  return q.mode === 'capitale' && !q.reversed
    ? [q.country.capital, ...q.country.capitalAliases]
    : [q.country.name, ...q.country.nameAliases];
}

export function checkAnswer(q: Question, input: string): MatchResult {
  return matchAnswer(input, acceptedAnswers(q));
}
