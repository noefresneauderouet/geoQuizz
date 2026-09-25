'use client';

import Link from 'next/link';
import { useState } from 'react';

import { ThemeSelector } from '@/components/theme-selector';
import { useAccount } from '@/components/use-account';
import {
  CATEGORIES,
  MODES,
  REGION_SETS,
  ZONE_MODES,
  type Category,
  type CategoryId,
  type Mode,
  type ModeId,
} from '@/constants/categories';
import { resetProgress, useStats, type ScoreKey, type Stats } from '@/lib/progress';
import { formatDuration, formatSeconds } from '@/lib/timer';

import styles from './progress-report.module.css';

/** Meilleurs scores, taux de réussite, et le choix du thème. */
export function ProgressReport() {
  const stats = useStats();
  const [confirming, setConfirming] = useState(false);

  const accuracy = stats.totalAnswers
    ? Math.round((stats.totalCorrect / stats.totalAnswers) * 100)
    : 0;

  // Le temps par réponse plutôt que le temps total : il ne récompense pas
  // celui qui a simplement joué davantage.
  const pace = stats.totalAnswers ? stats.totalTimeMs / stats.totalAnswers : 0;

  // Les manches n'ont pas toutes la même longueur : on compare le temps par
  // question des manches trouvées en entier, pas leur durée brute.
  const paces = Object.entries(stats.bestTime).flatMap(([key, time]) =>
    time === undefined ? [] : [time / lengthOf(key)],
  );
  const fastest = paces.length > 0 ? Math.min(...paces) : null;

  /*
   * Effacement en deux temps : le bouton demande confirmation dans son propre
   * libellé. `window.confirm` ouvrirait une boîte système qui jure avec le
   * reste, et qui est purement bloquante.
   */
  const reset = () => {
    if (!confirming) {
      setConfirming(true);
      return;
    }
    resetProgress();
    setConfirming(false);
  };

  return (
    <>
      <header>
        <h1 className={styles.brand}>Ma progression</h1>
        <p className={styles.subtitle}>
          {stats.rounds > 0
            ? `${stats.rounds} partie${stats.rounds > 1 ? 's' : ''} jouée${stats.rounds > 1 ? 's' : ''} · ${formatSeconds(pace)} par réponse`
            : 'Aucune partie pour le moment'}
        </p>
      </header>

      <AccountLink />

      <div className={styles.statRow}>
        <Stat value={`${accuracy}%`} label="de réussite" color="var(--green)" />
        <Stat value={String(stats.bestStreak)} label="meilleure série" color="var(--yellow-dark)" />
        <Stat value={String(stats.totalCorrect)} label="bonnes réponses" color="var(--blue)" />
        <Stat
          value={fastest === null ? '—' : formatSeconds(fastest)}
          label="par question, record"
          color="var(--brown-dark)"
        />
      </div>

      <h2 className="sectionTitle">Meilleurs scores</h2>
      <p className={styles.hint}>
        Une ligne par longueur de partie. Tant qu’une manche n’est pas trouvée en entier, on
        affiche le nombre de réponses ; ensuite, seul le chrono compte — c’est lui qui fait le
        classement.
      </p>
      <ScoreTable stats={stats} heading="Zone" categories={CATEGORIES} modes={ZONE_MODES} />

      <h2 className="sectionTitle">États et régions</h2>
      <ScoreTable stats={stats} heading="Pays" categories={REGION_SETS} modes={REGION_MODES} />

      <h2 className="sectionTitle">Thème</h2>
      <p className={styles.hint}>Auto suit le réglage clair ou sombre de ton appareil.</p>
      <ThemeSelector />

      <button type="button" className={styles.reset} onClick={reset}>
        {confirming ? 'Appuie encore pour confirmer' : 'Réinitialiser ma progression'}
      </button>
    </>
  );
}

/** Le compte, qui ne sert qu'au classement : une ligne, qui mène à /compte. */
function AccountLink() {
  const account = useAccount();
  if (account.status === 'loading' || account.status === 'unavailable') return null;
  return (
    <Link href="/compte" className={styles.account}>
      {account.status === 'signed-in' ? (
        <>
          <span>
            Connecté : <strong>{account.username}</strong>
          </span>
          <span className={styles.accountAction}>Mon compte</span>
        </>
      ) : (
        <>
          <span>Crée un compte pour entrer au classement.</span>
          <span className={styles.accountAction}>Se connecter</span>
        </>
      )}
    </Link>
  );
}

const REGION_MODES = MODES.filter((m) => m.id === 'etats');

type ScoreTableProps = {
  stats: Stats;
  /** Titre de la première colonne : « Zone », ou « Pays » pour le mode États. */
  heading: string;
  categories: readonly Category[];
  modes: readonly Mode[];
};

/** Une ligne par catégorie, une colonne par mode, les records dans les cases. */
function ScoreTable({ stats, heading, categories, modes }: ScoreTableProps) {
  return (
    <div className={styles.tableWrap}>
      <table className={styles.table}>
        <thead>
          <tr>
            <th scope="col">{heading}</th>
            {modes.map((m) => (
              <th key={m.id} scope="col">
                {m.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {categories.map((cat) => (
            <tr key={cat.id}>
              <th scope="row">
                {cat.emoji} {cat.label}
              </th>
              {modes.map((m) => {
                const records = recordsOf(stats, cat.id, m.id);
                return (
                  <td key={m.id}>
                    {records.length === 0
                      ? '—'
                      : records.map(({ length, found, time }) => (
                          <span
                            key={length}
                            className={
                              time === undefined
                                ? styles.cellLine
                                : `${styles.cellLine} ${styles.perfect}`
                            }>
                            <span className={styles.cellLength}>{length} q</span>
                            {time === undefined ? `${found}/${length}` : formatDuration(time)}
                          </span>
                        ))}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** « europe:drapeau:15 » -> 15 */
function lengthOf(key: string): number {
  return Number(key.split(':')[2]);
}

/** Les records d'une case du tableau, de la partie la plus courte à la plus longue. */
function recordsOf(stats: Stats, category: CategoryId, mode: ModeId) {
  const prefix = `${category}:${mode}:`;
  return Object.entries(stats.best)
    .filter(([key]) => key.startsWith(prefix))
    .map(([key, found]) => ({
      length: lengthOf(key),
      found: found ?? 0,
      time: stats.bestTime[key as ScoreKey],
    }))
    .sort((a, b) => a.length - b.length);
}

function Stat({ value, label, color }: { value: string; label: string; color: string }) {
  return (
    <div className={styles.stat}>
      <span className={styles.statValue} style={{ color }}>
        {value}
      </span>
      <span className={styles.statLabel}>{label}</span>
    </div>
  );
}
