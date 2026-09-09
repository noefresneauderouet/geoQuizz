'use client';

import { useState } from 'react';

import { CATEGORIES, MODES } from '@/constants/categories';
import { countryByCode, flagEmoji } from '@/lib/countries';
import { resetProgress, useStats } from '@/lib/progress';
import { QUESTIONS_PER_ROUND } from '@/lib/quiz';

import styles from './progress-report.module.css';

/** Meilleurs scores, taux de réussite, et les pays à revoir. */
export function ProgressReport() {
  const stats = useStats();
  const [confirming, setConfirming] = useState(false);

  const accuracy = stats.totalAnswers
    ? Math.round((stats.totalCorrect / stats.totalAnswers) * 100)
    : 0;

  const toReview = stats.toReview
    .map((code) => countryByCode(code))
    .filter((c): c is NonNullable<typeof c> => Boolean(c));

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
            ? `${stats.rounds} partie${stats.rounds > 1 ? 's' : ''} jouée${stats.rounds > 1 ? 's' : ''}`
            : 'Aucune partie pour le moment'}
        </p>
      </header>

      <div className={styles.statRow}>
        <Stat value={`${accuracy}%`} label="de réussite" color="var(--green)" />
        <Stat value={String(stats.bestStreak)} label="meilleure série" color="var(--yellow-dark)" />
        <Stat value={String(stats.totalCorrect)} label="bonnes réponses" color="var(--blue)" />
      </div>

      <h2 className="sectionTitle">Meilleurs scores</h2>
      <div className={styles.tableWrap}>
        <table className={styles.table}>
          <thead>
            <tr>
              <th scope="col">Zone</th>
              {MODES.map((m) => (
                <th key={m.id} scope="col">
                  {m.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {CATEGORIES.map((cat) => (
              <tr key={cat.id}>
                <th scope="row">
                  {cat.emoji} {cat.label}
                </th>
                {MODES.map((m) => {
                  const best = stats.best[`${cat.id}:${m.id}`];
                  return (
                    <td
                      key={m.id}
                      className={best === QUESTIONS_PER_ROUND ? styles.perfect : undefined}>
                      {best === undefined ? '—' : `${best}/${QUESTIONS_PER_ROUND}`}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <h2 className="sectionTitle">À revoir</h2>
      {toReview.length === 0 ? (
        <p className={styles.empty}>
          Rien à revoir. Les pays que tu rates atterrissent ici jusqu’à ce que tu les retrouves.
        </p>
      ) : (
        <ul className={styles.chips}>
          {toReview.map((c) => (
            <li key={c.code} className={styles.chip}>
              <span aria-hidden="true">{flagEmoji(c.code)}</span>
              {c.name}
            </li>
          ))}
        </ul>
      )}

      <button type="button" className={styles.reset} onClick={reset}>
        {confirming ? 'Appuie encore pour confirmer' : 'Réinitialiser ma progression'}
      </button>
    </>
  );
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
