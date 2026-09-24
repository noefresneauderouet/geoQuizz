/**
 * La mécanique d'une manche, sans React : trouver, passer, s'arrêter, et le
 * chronomètre qui ne compte que le temps de recherche.
 *
 * Le jeu solo et le jeu à plusieurs la partagent : seules changent la façon
 * dont la manche est tirée et ce qui se passe à la fin.
 */
import { checkAnswer, isSolvedWhileTyping, type Question } from '@/lib/quiz';
import { IDLE_WATCH, pauseWatch, readWatch, startWatch, type Stopwatch } from '@/lib/timer';

/**
 * Il n'y a pas de mauvaise réponse : une question est trouvée, ou passée.
 * Passer la renvoie en fin de file ; la manche se termine quand la file est
 * vide. Tout l'état tient dans un réducteur, parce que chaque geste touche
 * plusieurs morceaux à la fois — la file, la série, le chronomètre.
 */
export type Game = {
  round: Question[];
  /** Indices dans `round` restant à trouver ; la question affichée est la première. */
  queue: number[];
  found: number[];
  /** Questions passées au moins une fois. */
  skipped: number[];
  input: string;
  /** Réponse trouvée, affichée un court instant avant d'enchaîner. */
  solved: { approximate: boolean } | null;
  /** Nombre d'appuis sur Entrée sans succès pour cette question. */
  nudge: number;
  streak: number;
  bestStreak: number;
  /** Temps de recherche au moment de la dernière réponse trouvée : départage les joueurs à plusieurs. */
  lastFoundMs: number;
  /**
   * Le joueur a basculé la carte hors de sa vue de départ, qui dépend de
   * l'écran : vue d'ensemble sur grand écran, zoom sur téléphone (voir
   * quiz-board.tsx). Chaque question repart de la vue de départ.
   */
  zoomToggled: boolean;
  watch: Stopwatch;
  over: boolean;
};

export type Action =
  | { type: 'type'; text: string; now: number }
  | { type: 'submit'; now: number }
  | { type: 'advance'; now: number }
  | { type: 'skip' }
  | { type: 'end'; now: number }
  | { type: 'zoom' }
  | { type: 'restart'; round: Question[]; now: number };

/** Temps d'affichage d'une réponse trouvée ; plus long quand l'orthographe était approximative. */
export const SOLVED_PAUSE_MS = { exact: 400, approximate: 1600 };

export function newGame(round: Question[], now: number): Game {
  return {
    round,
    queue: round.map((_, i) => i),
    found: [],
    skipped: [],
    input: '',
    solved: null,
    nudge: 0,
    streak: 0,
    bestStreak: 0,
    lastFoundMs: 0,
    zoomToggled: false,
    watch: startWatch(IDLE_WATCH, now),
    over: false,
  };
}

function solve(game: Game, approximate: boolean, now: number): Game {
  const streak = game.streak + 1;
  return {
    ...game,
    solved: { approximate },
    found: [...game.found, game.queue[0]],
    streak,
    bestStreak: Math.max(game.bestStreak, streak),
    lastFoundMs: readWatch(game.watch, now),
    // La question suivante repart de la vue de départ. Celle-ci, trouvée,
    // passe en vue d'ensemble quel que soit l'écran : c'est quiz-board.tsx
    // qui l'impose, pour qu'on voie où se situe vraiment le pays.
    zoomToggled: false,
    // Le temps de lecture de la réponse n'est pas du temps de jeu.
    watch: pauseWatch(game.watch, now),
  };
}

export function reducer(game: Game, action: Action): Game {
  const current = game.round[game.queue[0]];

  switch (action.type) {
    case 'type':
      if (game.solved || game.over || !current) return game;
      return isSolvedWhileTyping(current, action.text)
        ? solve({ ...game, input: action.text }, false, action.now)
        : { ...game, input: action.text };

    case 'submit': {
      if (game.solved || game.over || !current) return game;
      const result = checkAnswer(current, game.input);
      return result.correct
        ? solve(game, !result.exact, action.now)
        : { ...game, nudge: game.nudge + 1 };
    }

    case 'advance': {
      if (!game.solved) return game;
      const queue = game.queue.slice(1);
      if (queue.length === 0) return { ...game, queue, solved: null, over: true };
      return {
        ...game,
        queue,
        input: '',
        solved: null,
        nudge: 0,
        watch: startWatch(game.watch, action.now),
      };
    }

    case 'skip': {
      if (game.solved || game.queue.length < 2) return game;
      const [first, ...rest] = game.queue;
      return {
        ...game,
        queue: [...rest, first],
        skipped: game.skipped.includes(first) ? game.skipped : [...game.skipped, first],
        streak: 0,
        input: '',
        nudge: 0,
        zoomToggled: false,
      };
    }

    case 'end':
      if (game.over) return game;
      return { ...game, solved: null, over: true, watch: pauseWatch(game.watch, action.now) };

    case 'zoom':
      return { ...game, zoomToggled: !game.zoomToggled };

    case 'restart':
      return newGame(action.round, action.now);
  }
}
