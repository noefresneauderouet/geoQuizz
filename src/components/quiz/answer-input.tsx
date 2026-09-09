'use client';

import type { CSSProperties, Ref } from 'react';

import styles from './answer-input.module.css';

type Props = {
  value: string;
  onChange: (text: string) => void;
  onSubmit: () => void;
  /** Étiquette du champ : « Pays » ou « Capitale ». */
  label: string;
  accent: string;
  /** Verrouillé pendant l'affichage de la correction. */
  locked: boolean;
  ref?: Ref<HTMLInputElement>;
};

/**
 * Champ de réponse.
 *
 * C'est un vrai `<form>` : la touche Entrée valide sans code, et les claviers
 * mobiles affichent « OK » plutôt qu'un retour à la ligne. `autoComplete` et
 * la correction automatique sont coupés — le navigateur proposerait les
 * réponses précédentes, ce qui reviendrait à souffler.
 */
export function AnswerInput({ value, onChange, onSubmit, label, accent, locked, ref }: Props) {
  const canSubmit = value.trim().length > 0 && !locked;

  return (
    <form
      className={styles.wrapper}
      style={{ '--accent': accent } as CSSProperties}
      onSubmit={(event) => {
        event.preventDefault();
        if (canSubmit) onSubmit();
      }}>
      <div className={locked ? `${styles.field} ${styles.locked}` : styles.field}>
        <label className={styles.label} htmlFor="answer">
          {label}
        </label>
        <input
          id="answer"
          ref={ref}
          className={styles.input}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          disabled={locked}
          placeholder="Écris ta réponse…"
          autoComplete="off"
          autoCorrect="off"
          autoCapitalize="words"
          spellCheck={false}
          enterKeyHint="done"
        />
      </div>

      <button type="submit" className={styles.button} disabled={!canSubmit}>
        Valider
      </button>
    </form>
  );
}
