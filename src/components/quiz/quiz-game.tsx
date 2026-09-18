'use client';

import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useReducer, useState } from 'react';

import { CategoryBackground } from '@/components/category-background';
import { QuizBoard } from '@/components/quiz/quiz-board';
import {
  getCategory,
  getMode,
  type Category,
  type CategoryId,
  type ModeId,
} from '@/constants/categories';
import { flagEmoji } from '@/lib/countries';
import { vibrateSuccess } from '@/lib/feedback';
import { NO_OUTCOME, recordRound, type RoundOutcome } from '@/lib/progress';
import { buildRound, expectedAnswer, getQuestionCount } from '@/lib/quiz';
import { newGame, reducer, SOLVED_PAUSE_MS, type Game } from '@/lib/round';
import { formatDuration, formatSeconds, readWatch } from '@/lib/timer';

import styles from './quiz-game.module.css';

/** Enregistre la manche telle qu'elle se termine à l'instant `now`. */
function record(
  game: Game,
  category: CategoryId,
  mode: ModeId,
  remaining: number[],
  now: number,
): RoundOutcome {
  return recordRound({
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

  const [game, dispatch] = useReducer(reducer, null, () =>
    newGame(buildRound(category.id, mode.id, count), Date.now()),
  );
  /** Question sur laquelle l'arrêt a été demandé, en attente de confirmation. */
  const [endRequestedAt, setEndRequestedAt] = useState<number | null>(null);
  /** Effet de la manche terminée sur les records, lu par l'écran de fin. */
  const [outcome, setOutcome] = useState<RoundOutcome>(NO_OUTCOME);

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
      if (game.queue.length === 1) setOutcome(record(game, category.id, mode.id, [], now));
      dispatch({ type: 'advance', now });
    }, delay);
    return () => clearTimeout(id);
    // `game` ne bouge pas tant que la réponse est affichée : le champ est figé
    // et tous les gestes sont ignorés. Seule l'arrivée d'une réponse relance.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [game.solved]);

  const replay = () => {
    setEndRequestedAt(null);
    setOutcome(NO_OUTCOME);
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
        outcome={outcome}
        onReplay={replay}
        onBack={() => router.push('/')}
      />
    );
  }

  const index = game.queue[0];

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
    setOutcome(record(game, category.id, mode.id, game.queue, now));
    dispatch({ type: 'end', now });
  };

  return (
    <QuizBoard
      category={category}
      mode={mode}
      game={game}
      dispatch={dispatch}
      // Une question passée finit par revenir : sa demande d'arrêt ne doit
      // pas l'attendre.
      onSkip={() => setEndRequestedAt(null)}
      actions={
        <button
          type="button"
          className={confirmingEnd ? `${styles.giveUp} ${styles.giveUpConfirm}` : styles.giveUp}
          onClick={end}>
          {confirmingEnd ? 'Appuie encore pour terminer' : 'Terminer la partie et voir les réponses'}
        </button>
      }
    />
  );
}

/* -------------------------------- Résultat -------------------------------- */

type SummaryProps = {
  category: Category;
  modeLabel: string;
  game: Game;
  /** Le record d'avant la manche, et s'il vient d'être battu. */
  outcome: RoundOutcome;
  onReplay: () => void;
  onBack: () => void;
};

function Summary({ category, modeLabel, game, outcome, onReplay, onBack }: SummaryProps) {
  const total = game.round.length;
  const score = game.found.length;
  const complete = game.queue.length === 0;
  // Le chronomètre est à l'arrêt depuis la dernière réponse ou l'abandon.
  const durationMs = game.watch.elapsed;
  const comebacks = game.found.filter((i) => game.skipped.includes(i)).length;
  const missed = game.queue.map((i) => game.round[i]);

  const ratio = score / total;
  const { previousBestMs, newRecord } = outcome;
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
          {newRecord && previousBestMs !== undefined ? (
            <div className={styles.newRecord} role="status">
              <p className={styles.newRecordTitle}>
                <span aria-hidden="true">⚡</span> Nouveau record !
              </p>
              <p className={styles.newRecordDetail}>
                {formatSeconds(previousBestMs - durationMs)} de mieux
              </p>
            </div>
          ) : null}
          <span className={styles.summaryMedal} aria-hidden="true">
            {medal}
          </span>
          <h1 className={styles.summaryTitle}>{title}</h1>
          {/* Le temps tient la place d'honneur : c'est lui qui compte au
              classement. Le chrono ne vaut que sur une manche entièrement
              trouvée ; sinon, il reste en grand mais sans le vert. */}
          <div className={styles.summaryTimes}>
            <p
              className={`${styles.summaryDuration} ${complete ? styles.summaryDurationPerfect : ''}`}>
              <span className={styles.summaryDurationIcon} aria-hidden="true">
                ⏱
              </span>{' '}
              {formatDuration(durationMs)}
            </p>
            {/* Le record d'avant la manche, pour comparer d'un coup d'œil.
                Jamais de record ici : la colonne n'apparaît pas. */}
            {previousBestMs !== undefined ? (
              <p className={styles.summaryBest}>
                <span className={styles.summaryBestLabel}>
                  {newRecord ? 'ancien record' : 'record'}
                </span>
                <span className={styles.summaryBestValue}>{formatDuration(previousBestMs)}</span>
              </p>
            ) : null}
          </div>
          <p className={`${styles.summaryFound} ${newRecord ? styles.summaryFoundRecord : ''}`}>
            {score} / {total} trouvées
            <span className={styles.summaryFoundDetail}>
              {' '}
              · {formatSeconds(durationMs / total)} par question
            </span>
          </p>
          <p className={styles.summaryMeta}>
            {category.label} · {modeLabel} · meilleure série : {game.bestStreak}
            {comebacks > 0
              ? ` · ${comebacks} retrouvée${comebacks > 1 ? 's' : ''} après avoir passé`
              : ''}
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
