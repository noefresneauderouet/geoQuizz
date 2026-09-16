'use client';

import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useReducer, useRef, useState } from 'react';

import { CategoryBackground } from '@/components/category-background';
import { AnswerInput } from '@/components/quiz/answer-input';
import { FeedbackBanner } from '@/components/quiz/feedback-banner';
import { FlagView } from '@/components/quiz/flag-view';
import { RoundTimer } from '@/components/quiz/round-timer';
import { WorldMap } from '@/components/world-map';
import {
  getCategory,
  getMode,
  type Category,
  type CategoryId,
  type ModeId,
} from '@/constants/categories';
import { flagEmoji } from '@/lib/countries';
import { vibrateSuccess } from '@/lib/feedback';
import { recordRound } from '@/lib/progress';
import {
  answerLabel,
  buildRound,
  checkAnswer,
  expectedAnswer,
  getQuestionCount,
  isSolvedWhileTyping,
  questionPrompt,
  type Question,
} from '@/lib/quiz';
import {
  formatDuration,
  formatSeconds,
  IDLE_WATCH,
  pauseWatch,
  readWatch,
  startWatch,
  type Stopwatch,
} from '@/lib/timer';

import styles from './quiz-game.module.css';

/* ---------------------------------- État ---------------------------------- */

/**
 * Il n'y a pas de mauvaise réponse : une question est trouvée, ou passée.
 * Passer la renvoie en fin de file ; la manche se termine quand la file est
 * vide. Tout l'état tient dans un réducteur, parce que chaque geste touche
 * plusieurs morceaux à la fois — la file, la série, le chronomètre.
 */
type Game = {
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
  zoomed: boolean;
  watch: Stopwatch;
  over: boolean;
};

type Action =
  | { type: 'type'; text: string; now: number }
  | { type: 'submit'; now: number }
  | { type: 'advance'; now: number }
  | { type: 'skip' }
  | { type: 'end'; now: number }
  | { type: 'zoom' }
  | { type: 'restart'; round: Question[]; now: number };

/** Temps d'affichage d'une réponse trouvée ; plus long quand l'orthographe était approximative. */
const SOLVED_PAUSE_MS = { exact: 400, approximate: 1600 };

function newGame(round: Question[], now: number): Game {
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
    zoomed: false,
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
    // La carte revient en vue d'ensemble : on voit où se situe vraiment le pays.
    zoomed: false,
    // Le temps de lecture de la réponse n'est pas du temps de jeu.
    watch: pauseWatch(game.watch, now),
  };
}

function reducer(game: Game, action: Action): Game {
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
        zoomed: false,
      };
    }

    case 'end':
      if (game.over) return game;
      return { ...game, solved: null, over: true, watch: pauseWatch(game.watch, action.now) };

    case 'zoom':
      return { ...game, zoomed: !game.zoomed };

    case 'restart':
      return newGame(action.round, action.now);
  }
}

/** Enregistre la manche telle qu'elle se termine à l'instant `now`. */
function record(game: Game, category: CategoryId, mode: ModeId, remaining: number[], now: number) {
  recordRound({
    category,
    mode,
    score: game.found.length,
    total: game.round.length,
    durationMs: readWatch(game.watch, now),
    bestStreak: game.bestStreak,
    missed: remaining.map((i) => game.round[i].country.code),
    solved: game.found.map((i) => game.round[i].country.code),
  });
}

/* ---------------------------------- Écran --------------------------------- */

/**
 * Une manche de 10, 15 ou 20 questions.
 *
 * La zone, le mode et la longueur viennent de l'URL
 * (/quiz?category=europe&mode=drapeau&count=15), ce qui rend une partie
 * partageable et permet les raccourcis du manifeste. `useSearchParams` n'a de
 * valeur que dans le navigateur : cet écran est donc rendu côté client, ce
 * qui tombe bien — le tirage est aléatoire, et le chronomètre doit partir à
 * l'ouverture, pas à la compilation.
 */
export function QuizGame() {
  const params = useSearchParams();
  const category = getCategory(params.get('category') ?? undefined);
  const mode = getMode(params.get('mode') ?? undefined);
  const count = getQuestionCount(params.get('count'));
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);

  const [game, dispatch] = useReducer(reducer, null, () =>
    newGame(buildRound(category.id, mode.id, count), Date.now()),
  );
  /** Question sur laquelle l'arrêt a été demandé, en attente de confirmation. */
  const [endRequestedAt, setEndRequestedAt] = useState<number | null>(null);

  /*
   * Une réponse trouvée reste affichée un instant, puis la question suivante
   * arrive d'elle-même. La minuterie est un système extérieur à React : c'est
   * le rôle d'un effet, et son nettoyage l'annule si l'on quitte l'écran
   * entre-temps.
   */
  useEffect(() => {
    if (!game.solved) return;
    vibrateSuccess();
    const delay = SOLVED_PAUSE_MS.exact;
    const id = setTimeout(() => {
      const now = Date.now();
      // Dernière question trouvée : la manche est complète, et le chronomètre
      // est en pause depuis la réponse.
      if (game.queue.length === 1) record(game, category.id, mode.id, [], now);
      dispatch({ type: 'advance', now });
    }, delay);
    return () => clearTimeout(id);
    // `game` ne bouge pas tant que la réponse est affichée : le champ est figé
    // et tous les gestes sont ignorés. Seule l'arrivée d'une réponse relance.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [game.solved]);

  const replay = () => {
    setEndRequestedAt(null);
    dispatch({ type: 'restart', round: buildRound(category.id, mode.id, count), now: Date.now() });
  };

  if (game.round.length === 0) {
    return (
      <CategoryBackground category={category} className={styles.screen}>
        <div className={styles.centered}>
          <p className={styles.emptyText}>Pas assez de pays pour cette zone.</p>
          <Link href="/" className={styles.ghost}>
            Retour
          </Link>
        </div>
      </CategoryBackground>
    );
  }

  if (game.over) {
    return (
      <Summary
        category={category}
        modeLabel={mode.label}
        game={game}
        onReplay={replay}
        onBack={() => router.push('/')}
      />
    );
  }

  const index = game.queue[0];
  const question = game.round[index];
  const total = game.round.length;
  const alreadySkipped = game.skipped.includes(index);

  /*
   * On peut s'arrêter à tout moment, en deux appuis : le bouton demande
   * confirmation dans son propre libellé, comme la remise à zéro du profil.
   * Une manche de 20 questions ne se perd pas sur un geste malheureux. La
   * confirmation est attachée à la question : passer ou trouver l'annule.
   */
  const confirmingEnd = endRequestedAt === index;
  const end = () => {
    if (!confirmingEnd) {
      setEndRequestedAt(index);
      return;
    }
    const now = Date.now();
    record(game, category.id, mode.id, game.queue, now);
    dispatch({ type: 'end', now });
  };

  return (
    <CategoryBackground category={category} className={styles.screen}>
      <div className={styles.frame}>
        <header className={styles.topBar}>
          <Link href="/" className={styles.close} aria-label="Quitter la partie">
            ✕
          </Link>
          <div className={styles.topLabels}>
            <p className={styles.topTitle}>
              {category.emoji} {category.label}
            </p>
            <p className={styles.topSub}>
              {mode.emoji} {mode.label} · {game.queue.length} restante
              {game.queue.length > 1 ? 's' : ''}
            </p>
          </div>
          <RoundTimer watch={game.watch} />
          <p className={styles.scorePill} aria-label={`${game.found.length} trouvées sur ${total}`}>
            {game.found.length}/{total}
          </p>
        </header>

        <div
          className={styles.progressTrack}
          role="progressbar"
          aria-valuenow={game.found.length}
          aria-valuemin={0}
          aria-valuemax={total}>
          <div
            className={styles.progressFill}
            style={{ width: `${(game.found.length / total) * 100}%` }}
          />
        </div>

        <div className={styles.scroll}>
          {/* `key` remonte la carte à chaque question : c'est ce qui rejoue
              l'animation d'entrée et vide l'état du drapeau. */}
          <section key={index} className={styles.card}>
            {alreadySkipped ? <p className={styles.skippedBadge}>↩ Question passée</p> : null}
            <h1 className={styles.prompt}>{questionPrompt(question)}</h1>

            {question.mode === 'drapeau' ? <FlagView code={question.country.code} /> : null}

            {question.mode === 'pays' ? (
              <div className={styles.mapBlock}>
                <WorldMap
                  country={question.country}
                  category={category}
                  zoomed={game.zoomed}
                  scope={category.id === 'monde' ? 'monde' : 'continent'}
                />
                <button
                  type="button"
                  className={styles.zoomButton}
                  onClick={() => dispatch({ type: 'zoom' })}>
                  {game.zoomed ? "Vue d'ensemble" : 'Zoomer sur le pays'}
                </button>
              </div>
            ) : null}

            {question.mode === 'capitale' ? (
              <p className={styles.countryChip}>
                <span className={styles.chipIcon} aria-hidden="true">
                  {flagEmoji(question.country.code)}
                </span>
                <span className={styles.countryName}>{question.country.name}</span>
              </p>
            ) : null}
          </section>

          {game.solved ? (
            <FeedbackBanner
              correct
              approximate={game.solved.approximate}
              answer={expectedAnswer(question)}
              detail={
                question.mode === 'capitale'
                  ? `capitale de ${question.country.name}`
                  : `${question.country.name} · capitale : ${question.country.capital}`
              }
            />
          ) : null}

          {game.solved ? null : (
            <button
              type="button"
              className={confirmingEnd ? `${styles.giveUp} ${styles.giveUpConfirm}` : styles.giveUp}
              onClick={end}>
              {confirmingEnd
                ? 'Appuie encore pour terminer'
                : 'Terminer la partie et voir les réponses'}
            </button>
          )}
        </div>

        <footer className={styles.footer}>
          <AnswerInput
            ref={inputRef}
            value={game.input}
            onChange={(text) => dispatch({ type: 'type', text, now: Date.now() })}
            onSubmit={() => dispatch({ type: 'submit', now: Date.now() })}
            onSkip={() => {
              // Une question passée finit par revenir : sa demande d'arrêt ne
              // doit pas l'attendre.
              setEndRequestedAt(null);
              dispatch({ type: 'skip' });
              // Le clic a pris le focus : on le rend au champ pour que le
              // clavier mobile reste ouvert.
              inputRef.current?.focus();
            }}
            canSkip={game.queue.length > 1}
            label={answerLabel(question)}
            accent={category.accent}
            solved={game.solved !== null}
            nudge={game.nudge}
          />
        </footer>
      </div>
    </CategoryBackground>
  );
}

/* -------------------------------- Résultat -------------------------------- */

type SummaryProps = {
  category: Category;
  modeLabel: string;
  game: Game;
  onReplay: () => void;
  onBack: () => void;
};

function Summary({ category, modeLabel, game, onReplay, onBack }: SummaryProps) {
  const total = game.round.length;
  const score = game.found.length;
  const complete = game.queue.length === 0;
  // Le chronomètre est à l'arrêt depuis la dernière réponse ou l'abandon.
  const durationMs = game.watch.elapsed;
  const comebacks = game.found.filter((i) => game.skipped.includes(i)).length;
  const missed = game.queue.map((i) => game.round[i]);

  const ratio = score / total;
  const [medal, title] = complete
    ? comebacks === 0
      ? ['🏆', 'Parfait !']
      : ['🎉', 'Tout trouvé !']
    : ratio >= 0.7
      ? ['👍', 'Bien joué']
      : ['📚', 'À retravailler'];

  return (
    <CategoryBackground category={category} className={styles.screen}>
      <div className={styles.centered}>
        <div className={styles.summaryCard}>
          <span className={styles.summaryMedal} aria-hidden="true">
            {medal}
          </span>
          <h1 className={styles.summaryTitle}>{title}</h1>
          <p className={styles.summaryScore}>
            {score}
            <span className={styles.summaryScoreTotal}> / {total}</span>
          </p>
          <p className={styles.summaryMeta}>
            {category.label} · {modeLabel} · meilleure série : {game.bestStreak}
            {comebacks > 0
              ? ` · ${comebacks} retrouvée${comebacks > 1 ? 's' : ''} après avoir passé`
              : ''}
          </p>
          {/* Le chrono ne vaut que sur une manche entièrement trouvée : il n'y
              a alors plus que lui à comparer. */}
          <p className={`${styles.summaryTime} ${complete ? styles.summaryTimePerfect : ''}`}>
            <span aria-hidden="true">⏱</span> {formatDuration(durationMs)}
            <span className={styles.summaryTimeDetail}>
              {' '}
              · {formatSeconds(durationMs / total)} par question
            </span>
          </p>
          <p className={styles.summaryMeta}>
            {complete
              ? 'Tout trouvé : c’est ce temps qui compte au classement.'
              : 'Seule une manche trouvée en entier laisse un temps au classement.'}
          </p>

          {missed.length > 0 ? (
            <div className={styles.missed}>
              <h2 className={styles.missedTitle}>Les réponses qui manquaient</h2>
              <ul className={styles.missedList}>
                {missed.map((q) => (
                  <li key={q.country.code} className={styles.missedChip}>
                    <span aria-hidden="true">{flagEmoji(q.country.code)}</span>
                    {expectedAnswer(q)}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          <button
            type="button"
            className={`${styles.nextButton} ${styles.summaryButton}`}
            style={{ backgroundColor: category.accent }}
            onClick={onReplay}>
            Rejouer {total} questions
          </button>
          <button type="button" className={styles.ghost} onClick={onBack}>
            Changer de zone
          </button>
        </div>
      </div>
    </CategoryBackground>
  );
}
