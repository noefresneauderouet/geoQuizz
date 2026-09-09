'use client';

import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useCallback, useRef, useState } from 'react';

import { CategoryBackground } from '@/components/category-background';
import { AnswerInput } from '@/components/quiz/answer-input';
import { FeedbackBanner } from '@/components/quiz/feedback-banner';
import { FlagView } from '@/components/quiz/flag-view';
import { WorldMap } from '@/components/world-map';
import { getCategory, getMode, type Category } from '@/constants/categories';
import { flagEmoji } from '@/lib/countries';
import { vibrateError, vibrateSuccess } from '@/lib/feedback';
import { recordRound } from '@/lib/progress';
import {
  answerLabel,
  buildRound,
  checkAnswer,
  expectedAnswer,
  questionPrompt,
  QUESTIONS_PER_ROUND,
} from '@/lib/quiz';

import styles from './quiz-game.module.css';

type Phase = { kind: 'typing' } | { kind: 'answered'; correct: boolean; approximate: boolean };

/**
 * Une manche de dix questions.
 *
 * La zone et le mode viennent de l'URL (/quiz?category=europe&mode=drapeau),
 * ce qui rend une partie partageable et permet les raccourcis du manifeste.
 * `useSearchParams` n'a de valeur que dans le navigateur : cet écran est donc
 * rendu côté client, ce qui tombe bien — le tirage des questions est
 * aléatoire, et un tirage figé à la compilation serait le même pour tout le
 * monde à chaque partie.
 */
export function QuizGame() {
  const params = useSearchParams();
  const category = getCategory(params.get('category') ?? undefined);
  const mode = getMode(params.get('mode') ?? undefined);
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);

  const [round, setRound] = useState(() => buildRound(category.id, mode.id));
  const [index, setIndex] = useState(0);
  const [input, setInput] = useState('');
  const [phase, setPhase] = useState<Phase>({ kind: 'typing' });
  const [zoomed, setZoomed] = useState(false);
  const [score, setScore] = useState(0);
  const [streak, setStreak] = useState(0);
  const [bestStreak, setBestStreak] = useState(0);
  const [missed, setMissed] = useState<string[]>([]);
  const [solved, setSolved] = useState<string[]>([]);
  const [finished, setFinished] = useState(false);

  const question = round[index];

  const restart = useCallback(() => {
    setRound(buildRound(category.id, mode.id));
    setIndex(0);
    setInput('');
    setPhase({ kind: 'typing' });
    setZoomed(false);
    setScore(0);
    setStreak(0);
    setBestStreak(0);
    setMissed([]);
    setSolved([]);
    setFinished(false);
  }, [category.id, mode.id]);

  const validate = useCallback(() => {
    if (phase.kind !== 'typing' || !question) return;
    const result = checkAnswer(question, input);

    if (result.correct) {
      const nextStreak = streak + 1;
      setScore((s) => s + 1);
      setStreak(nextStreak);
      setBestStreak((b) => Math.max(b, nextStreak));
      setSolved((s) => [...s, question.country.code]);
      vibrateSuccess();
    } else {
      setStreak(0);
      setMissed((m) => [...m, question.country.code]);
      vibrateError();
    }

    // La carte revient en vue d'ensemble : on voit où se situe vraiment le pays.
    if (question.mode === 'pays') setZoomed(false);
    setPhase({ kind: 'answered', correct: result.correct, approximate: !result.exact });
  }, [input, phase.kind, question, streak]);

  const next = useCallback(() => {
    if (phase.kind !== 'answered') return;

    if (index + 1 >= round.length) {
      recordRound({
        category: category.id,
        mode: mode.id,
        score,
        total: round.length,
        bestStreak,
        missed,
        solved,
      });
      setFinished(true);
      return;
    }

    setIndex((i) => i + 1);
    setInput('');
    setZoomed(false);
    setPhase({ kind: 'typing' });
    inputRef.current?.focus();
  }, [bestStreak, category.id, index, missed, mode.id, phase.kind, round.length, score, solved]);

  if (finished) {
    return (
      <Summary
        category={category}
        modeLabel={mode.label}
        score={score}
        total={round.length}
        bestStreak={bestStreak}
        onReplay={restart}
        onBack={() => router.push('/')}
      />
    );
  }

  if (!question) {
    return (
      <CategoryBackground category={category} className={styles.screen}>
        <div className={styles.centered}>
          <p className={styles.emptyText}>
            Pas assez de pays dessinables sur la carte pour cette zone.
          </p>
          <Link href="/" className={styles.ghost}>
            Retour
          </Link>
        </div>
      </CategoryBackground>
    );
  }

  const answered = phase.kind === 'answered';
  const progress = (index + (answered ? 1 : 0)) / round.length;

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
              {mode.emoji} {mode.label} · {index + 1}/{round.length}
            </p>
          </div>
          <p className={styles.scorePill}>{score}</p>
        </header>

        <div
          className={styles.progressTrack}
          role="progressbar"
          aria-valuenow={index + (answered ? 1 : 0)}
          aria-valuemin={0}
          aria-valuemax={round.length}>
          <div className={styles.progressFill} style={{ width: `${progress * 100}%` }} />
        </div>

        <div className={styles.scroll}>
          {/* `key` remonte la carte à chaque question : c'est ce qui rejoue
              l'animation d'entrée et vide l'état du drapeau. */}
          <section key={index} className={styles.card}>
            <h1 className={styles.prompt}>{questionPrompt(question)}</h1>

            {question.mode === 'drapeau' ? <FlagView code={question.country.code} /> : null}

            {question.mode === 'pays' ? (
              <div className={styles.mapBlock}>
                <WorldMap
                  country={question.country}
                  category={category}
                  zoomed={zoomed}
                  scope={category.id === 'monde' ? 'monde' : 'continent'}
                  height={280}
                />
                <button
                  type="button"
                  className={styles.zoomButton}
                  onClick={() => setZoomed((z) => !z)}>
                  {zoomed ? "Vue d'ensemble" : 'Zoomer sur le pays'}
                </button>
              </div>
            ) : null}

            {question.mode === 'capitale' ? (
              <p className={styles.countryChip}>
                <span className={styles.chipIcon} aria-hidden="true">
                  {question.reversed ? '📍' : flagEmoji(question.country.code)}
                </span>
                <span className={styles.countryName}>
                  {question.reversed ? question.country.capital : question.country.name}
                </span>
              </p>
            ) : null}
          </section>

          {answered ? (
            <FeedbackBanner
              correct={phase.correct}
              approximate={phase.approximate}
              answer={expectedAnswer(question)}
              detail={
                question.mode === 'capitale' && !question.reversed
                  ? `capitale de ${question.country.name}`
                  : `${question.country.name} · capitale : ${question.country.capital}`
              }
            />
          ) : null}
        </div>

        <footer className={styles.footer}>
          {answered ? (
            <button
              type="button"
              className={styles.nextButton}
              style={{ backgroundColor: category.accent }}
              onClick={next}
              autoFocus>
              {index + 1 >= round.length ? 'Voir mon résultat' : 'Question suivante'}
            </button>
          ) : (
            <AnswerInput
              ref={inputRef}
              value={input}
              onChange={setInput}
              onSubmit={validate}
              label={answerLabel(question)}
              accent={category.accent}
              locked={false}
            />
          )}
        </footer>
      </div>
    </CategoryBackground>
  );
}

/* -------------------------------- Résultat -------------------------------- */

type SummaryProps = {
  category: Category;
  modeLabel: string;
  score: number;
  total: number;
  bestStreak: number;
  onReplay: () => void;
  onBack: () => void;
};

function Summary({
  category,
  modeLabel,
  score,
  total,
  bestStreak,
  onReplay,
  onBack,
}: SummaryProps) {
  const ratio = score / total;
  const title =
    ratio === 1
      ? 'Parfait !'
      : ratio >= 0.7
        ? 'Bien joué !'
        : ratio >= 0.4
          ? 'Pas mal'
          : 'À retravailler';
  const medal = ratio === 1 ? '🏆' : ratio >= 0.7 ? '🎉' : ratio >= 0.4 ? '👍' : '📚';

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
            {category.label} · {modeLabel} · meilleure série : {bestStreak}
          </p>

          <button
            type="button"
            className={`${styles.nextButton} ${styles.summaryButton}`}
            style={{ backgroundColor: category.accent }}
            onClick={onReplay}>
            Rejouer {QUESTIONS_PER_ROUND} questions
          </button>
          <button type="button" className={styles.ghost} onClick={onBack}>
            Changer de zone
          </button>
        </div>
      </div>
    </CategoryBackground>
  );
}
