'use client';

import Link from 'next/link';
import { useEffect, useRef, type ActionDispatch, type ReactNode } from 'react';

import { CategoryBackground } from '@/components/category-background';
import { AnswerInput } from '@/components/quiz/answer-input';
import { FeedbackBanner } from '@/components/quiz/feedback-banner';
import { FlagView } from '@/components/quiz/flag-view';
import { RoundTimer } from '@/components/quiz/round-timer';
import { WorldMap } from '@/components/world-map';
import type { Category, Mode } from '@/constants/categories';
import { flagEmoji } from '@/lib/countries';
import { answerLabel, expectedAnswer, questionPrompt } from '@/lib/quiz';
import type { Action, Game } from '@/lib/round';
import { followVisibleViewport } from '@/lib/viewport';

import styles from './quiz-game.module.css';

type QuizBoardProps = {
  category: Category;
  mode: Mode;
  game: Game;
  dispatch: ActionDispatch<[action: Action]>;
  /** Sous la barre de progression : l'avancée des adversaires, à plusieurs. */
  status?: ReactNode;
  /** Sous la question, tant qu'aucune réponse n'est affichée : « Terminer », en solo. */
  actions?: ReactNode;
  /** Fin de la partie quand elle est limitée dans le temps : l'en-tête affiche le temps restant. */
  deadline?: number | null;
  /** Appelé après chaque question passée. */
  onSkip?: () => void;
};

/**
 * L'écran d'une question en cours, commun au jeu solo et au jeu à plusieurs.
 *
 * Il ne décide de rien : il affiche l'état de la manche (src/lib/round.ts) et
 * lui transmet les gestes. Ce qui diffère d'un jeu à l'autre — s'arrêter,
 * voir les adversaires — arrive par `status` et `actions`.
 */
export function QuizBoard({
  category,
  mode,
  game,
  dispatch,
  status,
  actions,
  deadline,
  onSkip,
}: QuizBoardProps) {
  const inputRef = useRef<HTMLInputElement>(null);

  // Clavier ouvert, l'écran de jeu se loge au-dessus de lui (voir `.playing`).
  useEffect(() => followVisibleViewport(), []);

  const index = game.queue[0];
  const question = game.round[index];
  const total = game.round.length;
  const alreadySkipped = game.skipped.includes(index);

  return (
    <CategoryBackground category={category} className={`${styles.screen} ${styles.playing}`}>
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
          <RoundTimer watch={game.watch} deadline={deadline} />
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

        {status}

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
          ) : (
            actions
          )}
        </div>

        <footer className={styles.footer}>
          <AnswerInput
            ref={inputRef}
            value={game.input}
            onChange={(text) => dispatch({ type: 'type', text, now: Date.now() })}
            onSubmit={() => dispatch({ type: 'submit', now: Date.now() })}
            onSkip={() => {
              onSkip?.();
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
