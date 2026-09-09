import styles from './feedback-banner.module.css';

type Props = {
  correct: boolean;
  /** Vrai quand la réponse a été rattrapée par la tolérance orthographique. */
  approximate: boolean;
  answer: string;
  /** Contexte utile : « capitale du Pérou », « Pérou · capitale : Lima »… */
  detail?: string;
};

/**
 * La correction.
 *
 * `role="status"` la fait annoncer par les lecteurs d'écran sans voler le
 * focus : la couleur et l'icône ne suffiraient pas à transmettre le résultat.
 */
export function FeedbackBanner({ correct, approximate, answer, detail }: Props) {
  const title = correct ? (approximate ? 'Presque ! On te l’accorde' : 'Bravo !') : 'Raté';

  return (
    <div className={`${styles.banner} ${correct ? styles.ok : styles.ko}`} role="status">
      <span className={styles.icon} aria-hidden="true">
        {correct ? '✅' : '❌'}
      </span>
      <div>
        <p className={styles.title}>{title}</p>
        <p className={styles.answer}>{answer}</p>
        {detail ? <p className={styles.detail}>{detail}</p> : null}
      </div>
    </div>
  );
}
