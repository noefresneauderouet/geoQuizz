'use client';

import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useReducer, useRef, useState } from 'react';

import { CategoryBackground } from '@/components/category-background';
import { QuizBoard } from '@/components/quiz/quiz-board';
import { useFlagEmoji } from '@/components/use-flag-emoji';
import { useInBrowser } from '@/components/use-in-browser';
import { useMyBests } from '@/components/use-my-bests';
import {
  getCategory,
  getMode,
  isRegionSet,
  type Category,
  type CategoryId,
  type ModeId,
} from '@/constants/categories';
import { flagEmoji } from '@/lib/countries';
import { vibrateSuccess } from '@/lib/feedback';
import {
  cancelRankedRound,
  finishRankedRound,
  startRankedRound,
  type MyBests,
  type RankedRound,
  type Ranking,
} from '@/lib/leaderboard';
import { saveLastGame } from '@/lib/last-game';
import { NO_OUTCOME, recordRound, scoreKey, type RoundOutcome } from '@/lib/progress';
import { buildRound, expectedAnswer, getQuestionCount, poolSize, questionKey } from '@/lib/quiz';
import { newGame, reducer, SOLVED_PAUSE_MS, type Game } from '@/lib/round';
import { hasStoredSession } from '@/lib/supabase';
import { clock, formatDuration, formatSeconds, readWatch } from '@/lib/timer';

import styles from './quiz-game.module.css';

/** Le record auquel l'écran de fin compare la manche. */
type Outcome = RoundOutcome & {
  /**
   * Comparée au record du classement, comme sur le profil : la manche n'en
   * bat un que si la base l'a retenue, ce que dira `Ranking`.
   */
  online: boolean;
};

const NO_RESULT: Outcome = { ...NO_OUTCOME, online: false };

/**
 * Enregistre la manche telle qu'elle se termine à l'instant `now`, et ferme
 * la manche classée : elle compte si elle est trouvée en entier, sinon elle
 * est effacée. La réponse du classement arrive plus tard, par `onRanking`.
 *
 * Connecté, `online` porte les records du classement, lus avant que la base
 * ne remplace celui-ci ; sans eux, la manche se compare au record de
 * l'appareil.
 */
function record(
  game: Game,
  category: CategoryId,
  mode: ModeId,
  now: number,
  ranked: RankedRound | null,
  online: MyBests | null,
  onRanking: (ranking: Ranking) => void,
): Outcome {
  const score = game.found.length;
  const total = game.round.length;
  const durationMs = readWatch(game.watch, now);
  if (score === total) {
    void finishRankedRound(ranked, durationMs).then(onRanking);
  } else {
    cancelRankedRound(ranked);
  }
  const local = recordRound({
    category,
    mode,
    score,
    total,
    durationMs,
    bestStreak: game.bestStreak,
  });
  if (online === null) return { ...local, online: false };
  return {
    previousBestMs: online[scoreKey(category, mode, total)],
    newRecord: false,
    online: true,
  };
}

/* ---------------------------------- Écran --------------------------------- */

/**
 * La manche n'existe que dans le navigateur : le tirage est aléatoire, et le
 * chronomètre doit partir à l'ouverture, pas à la compilation.
 *
 * En développement, Next rend aussi cet écran côté serveur, avec les vrais
 * paramètres de l'URL : il y tirait une autre manche que le navigateur, et
 * l'hydratation laissait à l'écran le drapeau du serveur, qui n'était pas
 * celui à trouver. Rien n'est donc tiré avant l'hydratation, comme pour
 * /salle.
 */
export function QuizGame() {
  const inBrowser = useInBrowser();
  return inBrowser ? <QuizRound /> : <p className={styles.loading}>Préparation de la partie…</p>;
}

/**
 * Une manche de 10, 15 ou 20 questions.
 *
 * La zone, le mode et la longueur viennent de l'URL
 * (/quiz?category=europe&mode=drapeau&count=15), ce qui rend une partie
 * partageable et permet les raccourcis du manifeste.
 */
function QuizRound() {
  const params = useSearchParams();
  const mode = getMode(params.get('mode') ?? undefined);
  const category = getCategory(params.get('category') ?? undefined, mode.id);
  const count = getQuestionCount(params.get('count'));
  const router = useRouter();

  const [game, dispatch] = useReducer(reducer, null, () =>
    newGame(buildRound(category.id, mode.id, count), clock()),
  );
  /*
   * Connecté, la manche s'ouvre d'abord côté serveur (voir leaderboard.ts) :
   * la première question n'apparaît, et le chrono ne part, qu'une fois la
   * réponse arrivée. Un invité n'attend rien.
   */
  const [preparing, setPreparing] = useState(() => hasStoredSession());
  const ranked = useRef<RankedRound | null>(null);
  /** Connecté, les records du classement, relus pendant la partie. */
  const online = useMyBests();
  /** L'écran est quitté : une manche qui s'ouvre après ne sert plus. */
  const left = useRef(false);
  const length = Math.min(count, poolSize(category.id, mode.id));

  /** Ouvre la manche classée, puis lance le chrono sur une manche neuve. */
  const open = (isCancelled: () => boolean) => {
    void startRankedRound({ category: category.id, mode: mode.id, length }).then((round) => {
      if (isCancelled()) {
        cancelRankedRound(round);
        return;
      }
      ranked.current = round;
      dispatch({ type: 'restart', round: buildRound(category.id, mode.id, count), now: clock() });
      setPreparing(false);
    });
  };

  // L'accueil reprendra ces réglages au retour (src/lib/last-game.ts).
  useEffect(() => {
    saveLastGame({ category: category.id, mode: mode.id, count });
  }, [category.id, mode.id, count]);

  // Une fois, à l'ouverture : les réglages viennent de l'URL et ne changent pas.
  useEffect(() => {
    if (!preparing) return;
    let cancelled = false;
    open(() => cancelled);
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Quitter l'écran en pleine partie efface la manche classée encore ouverte.
  useEffect(() => {
    left.current = false;
    return () => {
      left.current = true;
      cancelRankedRound(ranked.current);
      ranked.current = null;
    };
  }, []);

  /** Question sur laquelle l'arrêt a été demandé, en attente de confirmation. */
  const [endRequestedAt, setEndRequestedAt] = useState<number | null>(null);
  /** Effet de la manche terminée sur les records, lu par l'écran de fin. */
  const [outcome, setOutcome] = useState<Outcome>(NO_RESULT);
  /** Place au classement en ligne, une fois la réponse du serveur arrivée. */
  const [ranking, setRanking] = useState<Ranking | null>(null);

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
      const now = clock();
      // Dernière question trouvée : la manche est complète, et le chronomètre
      // est en pause depuis la réponse.
      if (game.queue.length === 1) {
        setOutcome(record(game, category.id, mode.id, now, ranked.current, online, setRanking));
        ranked.current = null;
      }
      dispatch({ type: 'advance', now });
    }, delay);
    return () => clearTimeout(id);
    // `game` ne bouge pas tant que la réponse est affichée : le champ est figé
    // et tous les gestes sont ignorés. Seule l'arrivée d'une réponse relance.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [game.solved]);

  const replay = () => {
    setEndRequestedAt(null);
    setOutcome(NO_RESULT);
    setRanking(null);
    ranked.current = null;
    if (hasStoredSession() && length > 0) {
      setPreparing(true);
      open(() => left.current);
    } else {
      dispatch({ type: 'restart', round: buildRound(category.id, mode.id, count), now: clock() });
    }
  };

  if (preparing) {
    return (
      <CategoryBackground category={category} className={styles.screen}>
        <p className={styles.loading}>Préparation de la partie…</p>
      </CategoryBackground>
    );
  }

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
        ranking={ranking}
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
    const now = clock();
    setOutcome(record(game, category.id, mode.id, now, ranked.current, online, setRanking));
    ranked.current = null;
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
          {confirmingEnd
            ? 'Appuie encore pour terminer'
            : 'Terminer la partie et voir les réponses'}
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
  outcome: Outcome;
  /** `null` tant que le classement n'a pas répondu, ou si la manche n'y va pas. */
  ranking: Ranking | null;
  onReplay: () => void;
  onBack: () => void;
};

function Summary({ category, modeLabel, game, outcome, ranking, onReplay, onBack }: SummaryProps) {
  const total = game.round.length;
  const score = game.found.length;
  const complete = game.queue.length === 0;
  // Le chronomètre est à l'arrêt depuis la dernière réponse ou l'abandon.
  const durationMs = game.watch.elapsed;
  const comebacks = game.found.filter((i) => game.skipped.includes(i)).length;
  const missed = game.queue.map((i) => game.round[i]);
  const flags = useFlagEmoji();

  const ratio = score / total;
  const { previousBestMs } = outcome;
  // Comparée au classement, la manche ne bat le record que si la base l'a
  // retenue, et c'est le temps qu'elle garde qui sert d'écart.
  const saved = ranking?.status === 'saved' ? ranking : null;
  const newRecord = outcome.online
    ? saved !== null && saved.improved && previousBestMs !== undefined
    : outcome.newRecord;
  const recordMs = outcome.online && saved !== null ? saved.bestMs : durationMs;
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
                {formatSeconds(previousBestMs - recordMs)} de mieux
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
          {complete ? (
            <RankingLine
              ranking={ranking}
              href={boardHref(category.id, game.round)}
              // Comparée au classement, la manche affiche déjà ce record à
              // côté du chrono.
              showBest={!outcome.online}
            />
          ) : (
            <p className={styles.summaryMeta}>
              Seule une manche trouvée en entier laisse un temps au classement.
            </p>
          )}

          {missed.length > 0 ? (
            <div className={styles.missed}>
              <h2 className={styles.missedTitle}>Les réponses qui manquaient</h2>
              <ul className={styles.missedList}>
                {missed.map((q) => (
                  <li key={questionKey(q)} className={styles.missedChip}>
                    {/* Des régions d'un même pays porteraient toutes le même drapeau. */}
                    {!flags || q.mode === 'etats' ? null : (
                      <span aria-hidden="true">{flagEmoji(q.country.code)}</span>
                    )}
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
            {isRegionSet(category.id) ? 'Changer de pays' : 'Changer de zone'}
          </button>
        </div>
      </div>
    </CategoryBackground>
  );
}

/** Le classement de la manche qu'on vient de jouer. */
function boardHref(category: CategoryId, round: Game['round']): string {
  return `/classement?category=${category}&mode=${round[0].mode}&length=${round.length}`;
}

type RankingLineProps = {
  ranking: Ranking | null;
  href: string;
  /** Rappeler le record du classement quand la manche ne le bat pas. */
  showBest: boolean;
};

/** Sous le chrono d'une manche complète : où elle place le joueur. */
function RankingLine({ ranking, href, showBest }: RankingLineProps) {
  if (ranking === null) {
    return <p className={styles.summaryMeta}>Envoi au classement…</p>;
  }
  if (ranking.status === 'guest') {
    return (
      <p className={styles.summaryMeta}>
        <Link href="/compte" className={styles.rankingLink}>
          Connecte-toi
        </Link>{' '}
        pour entrer au{' '}
        <Link href={href} className={styles.rankingLink}>
          classement
        </Link>
        .
      </p>
    );
  }
  if (ranking.status === 'offline') {
    return (
      <p className={styles.summaryMeta}>
        Pas de réseau pendant la manche : elle ne compte pas au classement.
      </p>
    );
  }
  if (ranking.status === 'rejected') {
    return (
      <p className={styles.summaryMeta}>
        Ce temps n’a pas pu être vérifié : il ne compte pas au classement.
      </p>
    );
  }
  return (
    <p className={styles.ranking}>
      <span aria-hidden="true">🏅</span> {ranking.rank === 1 ? '1er' : `${ranking.rank}e`} au
      classement
      {ranking.improved || !showBest
        ? ''
        : ` · ton record : ${formatDuration(ranking.bestMs)}`} ·{' '}
      <Link href={href} className={styles.rankingLink}>
        Voir
      </Link>
    </p>
  );
}
