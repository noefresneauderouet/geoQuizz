import Link from 'next/link';

import { CategoryBackground } from '@/components/category-background';
import type { Category, ModeId } from '@/constants/categories';
import type { QuestionCount } from '@/lib/quiz';

import styles from './category-card.module.css';

type Props = {
  category: Category;
  /** Ce qu'elle contient : « 196 pays », « 50 États ». */
  meta: string;
  /** Meilleur score sur ce couple catégorie/mode, ou null si jamais jouée. */
  best: number | null;
  total: number;
  mode: ModeId;
  count: QuestionCount;
  /** Zone de la dernière partie, dans ce mode : elle porte une pastille. */
  last?: boolean;
  /** La carte « Monde » occupe toute la largeur et sert d'entrée principale. */
  featured?: boolean;
};

/**
 * Une zone de jeu.
 *
 * C'est un lien, pas un bouton : la partie a une adresse
 * (/quiz?category=europe&mode=drapeau&count=15), donc elle s'ouvre dans un onglet,
 * se met en favori, et se retrouve dans l'historique.
 */
export function CategoryCard({
  category,
  meta,
  best,
  total,
  mode,
  count,
  last = false,
  featured = false,
}: Props) {
  return (
    <Link
      href={`/quiz?category=${category.id}&mode=${mode}&count=${count}`}
      className={`${styles.card} ${featured ? styles.featured : styles.tile}`}
      aria-label={`${category.label}, ${meta} — ${category.tagline}${last ? ' (dernière partie)' : ''}`}>
      <CategoryBackground category={category} className={styles.background}>
        <div className={styles.content}>
          <div className={styles.topRow}>
            <span className={styles.emoji} aria-hidden="true">
              {category.emoji}
            </span>
            {last ? <span className={styles.badge}>Dernière partie</span> : null}
          </div>

          <div className={styles.bottom}>
            <p className={styles.label}>{category.label}</p>
            {featured ? <p className={styles.meta}>{category.tagline}</p> : null}
            <p className={styles.meta}>{meta}</p>
          </div>
        </div>
      </CategoryBackground>
    </Link>
  );
}
