import type { CSSProperties, ReactNode } from 'react';

import type { Category } from '@/constants/categories';

import styles from './category-background.module.css';

type Props = {
  category: Category;
  children?: ReactNode;
  className?: string;
  /** Renforce le voile quand du texte doit rester lisible par-dessus. */
  scrimBoost?: number;
};

/**
 * Fond d'une catégorie : sa photo si elle a été déposée dans
 * public/categories/, sinon son dégradé. Le dégradé reste dessiné sous la
 * photo, ce qui sert aussi de fond pendant le chargement, et de secours si
 * l'image manque.
 *
 * Composant serveur : il ne fait que produire du balisage, donc il part dans
 * le HTML statique et ne coûte rien au bundle client.
 */
export function CategoryBackground({ category, children, className, scrimBoost = 0 }: Props) {
  const layers = {
    '--gradient': `linear-gradient(135deg, ${category.gradient.join(', ')})`,
    '--scrim': category.scrim,
    '--scrim-opacity': String(Math.min(1, 1 + scrimBoost)),
  } as CSSProperties;

  return (
    <div className={className ? `${styles.root} ${className}` : styles.root} style={layers}>
      <div className={styles.gradient} />
      {category.photo ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img className={styles.photo} src={category.photo} alt="" loading="lazy" />
      ) : null}
      <div className={styles.scrim} />
      {children}
    </div>
  );
}
