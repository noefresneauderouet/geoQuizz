import Link from 'next/link';

import { CategoryBackground } from '@/components/category-background';
import type { Category, ModeId } from '@/constants/categories';

import styles from './category-card.module.css';

type Props = {
  category: Category;
  countryCount: number;
  /** Meilleur score sur ce couple catégorie/mode, ou null si jamais jouée. */
  best: number | null;
  total: number;
  mode: ModeId;
  /** La carte « Monde » occupe toute la largeur et sert d'entrée principale. */
  featured?: boolean;
};

/**
 * Une zone de jeu.
 *
 * C'est un lien, pas un bouton : la partie a une adresse
 * (/quiz?category=europe&mode=drapeau), donc elle s'ouvre dans un onglet,
 * se met en favori, et se retrouve dans l'historique.
 */
export function CategoryCard({
  category,
  countryCount,
  best,
  total,
  mode,
  featured = false,
}: Props) {
  return (
    <Link
      href={`/quiz?category=${category.id}&mode=${mode}`}
      className={`${styles.card} ${featured ? styles.featured : styles.tile}`}
      aria-label={`${category.label}, ${countryCount} pays — ${category.tagline}`}>
      <CategoryBackground category={category} className={styles.background}>
        <div className={styles.content}>
          <div className={styles.topRow}>
            <span className={styles.emoji} aria-hidden="true">
              {category.emoji}
            </span>
            {best !== null ? (
              <span className={styles.badge}>
                ★ {best}/{total}
              </span>
            ) : null}
          </div>

          <div className={styles.bottom}>
            <p className={styles.label}>{category.label}</p>
            {featured ? <p className={styles.meta}>{category.tagline}</p> : null}
            <p className={styles.meta}>{countryCount} pays</p>
          </div>
        </div>
      </CategoryBackground>
    </Link>
  );
}
