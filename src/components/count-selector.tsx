'use client';

import type { CSSProperties } from 'react';

import { QUESTION_COUNTS, type QuestionCount } from '@/lib/quiz';

import styles from './count-selector.module.css';

type Props = {
  value: QuestionCount;
  onChange: (count: QuestionCount) => void;
  /** Même accent que le sélecteur de mode, juste au-dessus. */
  accent: string;
};

/**
 * Longueur de la partie : 10, 15 ou 20 questions.
 *
 * Un groupe de boutons radio plutôt que des onglets : le choix ne change pas
 * de panneau, il règle la partie qu'on lancera ensuite.
 */
export function CountSelector({ value, onChange, accent }: Props) {
  return (
    <div className={styles.row}>
      <span className={styles.caption} id="count-caption">
        Questions
      </span>
      <div
        className={styles.track}
        role="radiogroup"
        aria-labelledby="count-caption"
        style={{ '--accent': accent } as CSSProperties}>
        {QUESTION_COUNTS.map((count) => {
          const selected = count === value;
          return (
            <button
              key={count}
              type="button"
              role="radio"
              aria-checked={selected}
              onClick={() => onChange(count)}
              className={selected ? `${styles.option} ${styles.active}` : styles.option}>
              {count}
            </button>
          );
        })}
      </div>
    </div>
  );
}
