'use client';

import type { CSSProperties, Ref } from 'react';

import styles from './answer-input.module.css';

type Props = {
  value: string;
  onChange: (text: string) => void;
  /** Entrée ou « Valider » : vérification avec tolérance aux fautes. */
  onSubmit: () => void;
  onSkip: () => void;
  /** Faux quand il ne reste qu'une question : il n'y a rien vers quoi passer. */
  canSkip: boolean;
  /** Label du champ : « Pays » ou « Capitale ». */
  label: string;
  accent: string;
  /** Réponse trouvée : le champ se fige le temps de la célébrer. */
  solved: boolean;
  /** Incrémenté à chaque Entrée infructueuse ; rejoue la secousse. */
  nudge: number;
  ref?: Ref<HTMLInputElement>;
};

/**
 * Champ de réponse.
 *
 * La réponse exacte est reconnue pendant la frappe, sans rien valider ;
 * Entrée ne sert qu'à faire accepter une réponse avec une faute de frappe.
 * Une tentative infructueuse ne coûte rien : le champ tremble, sans aucun message.
 *
 * Pendant la célébration, le champ passe en lecture seule plutôt qu'en
 * désactivé : un champ désactivé perd le focus, et le clavier mobile se
 * refermerait entre deux questions.
 *
 * `autoComplete` et la correction automatique sont coupés — le navigateur
 * proposerait les réponses précédentes, ce qui reviendrait à souffler.
 * Safari iOS passe outre `autoComplete="off"` : il lit le libellé, prend
 * « Pays » pour un champ d'adresse et propose celle du propriétaire
 * au-dessus du clavier. Il laisse tranquille un champ dont le nom contient
 * « search » : d'où ce nom.
 */
export function AnswerInput({
  value,
  onChange,
  onSubmit,
  onSkip,
  canSkip,
  label,
  accent,
  solved,
  nudge,
  ref,
}: Props) {
  const canSubmit = value.trim().length > 0 && !solved;

  // Deux classes identiques en alternance : changer de nom d'animation est le
  // seul moyen de la rejouer sans remonter l'élément, donc sans perdre le focus.
  const shake = nudge === 0 ? '' : nudge % 2 ? styles.shakeA : styles.shakeB;
  const fieldClass = [styles.field, solved ? styles.solved : '', shake].filter(Boolean).join(' ');

  return (
    <form
      className={styles.wrapper}
      style={{ '--accent': accent } as CSSProperties}
      onSubmit={(event) => {
        event.preventDefault();
        if (canSubmit) onSubmit();
      }}>
      <div className={fieldClass}>
        <label className={styles.label} htmlFor="answer">
          {solved ? 'Trouvé !' : label}
        </label>
        <input
          id="answer"
          name="answer-search"
          ref={ref}
          className={styles.input}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          readOnly={solved}
          placeholder="Ta réponse…"
          autoComplete="off"
          autoCorrect="off"
          autoCapitalize="words"
          spellCheck={false}
          enterKeyHint="done"
          autoFocus
        />
      </div>

      {/* Sur téléphone, les boutons ne montrent que leur icône : le libellé
          reste lu par les lecteurs d'écran. */}
      <div className={styles.actions}>
        <button
          type="button"
          className={styles.skip}
          onClick={onSkip}
          disabled={!canSkip || solved}>
          <Icon path="m6 17 5-5-5-5M13 17l5-5-5-5" />
          <span className={styles.buttonLabel}>Passer</span>
        </button>
        <button type="submit" className={styles.button} disabled={!canSubmit}>
          <Icon path="M20 6 9 17l-5-5" />
          <span className={styles.buttonLabel}>Valider</span>
        </button>
      </div>
    </form>
  );
}

function Icon({ path }: { path: string }) {
  return (
    <svg className={styles.icon} viewBox="0 0 24 24" aria-hidden="true">
      <path
        d={path}
        fill="none"
        stroke="currentColor"
        strokeWidth="3"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
