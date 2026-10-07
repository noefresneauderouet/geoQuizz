import { CategoryBackground } from '@/components/category-background';
import type { Category } from '@/constants/categories';

import styles from './category-card.module.css';

type Props = {
  category: Category;
  /** Ce qu'elle contient : « 196 pays », « 50 États ». */
  meta: string;
  /** Fait partie de la partie qu'on lancera : bordure et coche. */
  selected: boolean;
  onSelect: () => void;
  /** La carte « Monde » occupe toute la largeur et sert d'entrée principale. */
  featured?: boolean;
};

/**
 * Une zone de jeu, à cocher.
 *
 * Ce n'est plus un lien : on peut en choisir plusieurs (src/lib/zones.ts),
 * et c'est le bouton « Jouer », sous les cartes, qui lance la partie. La
 * coche dit ce qui sera joué.
 */
export function CategoryCard({ category, meta, selected, onSelect, featured = false }: Props) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      onClick={onSelect}
      className={[
        styles.card,
        featured ? styles.featured : styles.tile,
        selected ? styles.selected : '',
      ].join(' ')}
      aria-label={`${category.label}, ${meta} — ${category.tagline}`}>
      <CategoryBackground category={category} className={styles.background}>
        <span className={styles.content}>
          <span className={styles.topRow}>
            <span className={styles.emoji} aria-hidden="true">
              {category.emoji}
            </span>
            <span className={styles.check} aria-hidden="true">
              {selected ? '✓' : null}
            </span>
          </span>

          <span className={styles.bottom}>
            <span className={styles.label}>{category.label}</span>
            <span className={styles.meta}>{meta}</span>
          </span>
        </span>
      </CategoryBackground>
    </button>
  );
}
