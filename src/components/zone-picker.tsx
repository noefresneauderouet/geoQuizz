'use client';

import Link from 'next/link';
import { useState } from 'react';

import { CategoryCard } from '@/components/category-card';
import { CountSelector } from '@/components/count-selector';
import { ModeSelector } from '@/components/mode-selector';
import { JoinDialog } from '@/components/multi/join-dialog';
import { useLastGame } from '@/components/use-last-game';
import {
  CATEGORIES,
  isRegionSet,
  MODES,
  REGION_SETS,
  type Category,
  type CategoryId,
  type ModeId,
} from '@/constants/categories';
import { countriesOf } from '@/lib/countries';
import { scoreKey, useStats } from '@/lib/progress';
import { DEFAULT_QUESTION_COUNT, poolSize, type QuestionCount } from '@/lib/quiz';
import { regionSet } from '@/lib/regions';

import styles from './zone-picker.module.css';

const [MONDE, ...CONTINENTS] = CATEGORIES;

/** « 196 pays », « 50 États », « 13 régions ». */
function sizeLabel(id: CategoryId): string {
  if (!isRegionSet(id)) return `${countriesOf(id).length} pays`;
  const { regions, plural } = regionSet(id);
  return `${regions.length} ${plural}`;
}

/**
 * Le choix d'une partie : un mode, puis une zone.
 *
 * Composant client, mais rendu à la compilation comme tout le reste : le HTML
 * livré contient déjà les six zones et le mode par défaut. L'interaction et
 * les meilleurs scores — qui vivent dans le stockage local — n'arrivent qu'à
 * l'hydratation, sans que la page ait jamais été vide.
 */
export function ZonePicker() {
  /*
   * Tant qu'on n'a rien touché, l'accueil reprend les réglages de la dernière
   * partie. Ils ne sont connus qu'après l'hydratation (useLastGame) : les
   * garder à part, plutôt que de les recopier dans l'état par un effet,
   * laisse le premier rendu identique au HTML compilé.
   */
  const last = useLastGame();
  const [chosenMode, setMode] = useState<ModeId | null>(null);
  const [chosenCount, setCount] = useState<QuestionCount | null>(null);
  const mode = chosenMode ?? last?.mode ?? 'drapeau';
  const count = chosenCount ?? last?.count ?? DEFAULT_QUESTION_COUNT;
  const stats = useStats();

  const activeMode = MODES.find((m) => m.id === mode) ?? MODES[0];
  // Une zone plus petite que la longueur choisie se joue en entier : c'est
  // cette longueur réelle qui porte le record.
  const lengthOf = (categoryId: CategoryId) => Math.min(count, poolSize(categoryId, mode));
  const bestOf = (categoryId: CategoryId) =>
    stats.best[scoreKey(categoryId, mode, lengthOf(categoryId))] ?? null;

  const card = (category: Category, featured = false) => (
    <CategoryCard
      key={category.id}
      featured={featured}
      category={category}
      meta={sizeLabel(category.id)}
      best={bestOf(category.id)}
      total={lengthOf(category.id)}
      mode={mode}
      count={count}
      last={last?.mode === mode && last.category === category.id}
    />
  );

  return (
    <>
      <header>
        <h1 className={styles.brand}>GeoLearn</h1>
        <p className={styles.subtitle}>
          {activeMode.emoji} Je révise les {activeMode.plural}
        </p>
      </header>

      <ModeSelector value={mode} onChange={setMode} accent={MONDE.accent} />
      <CountSelector value={count} onChange={setCount} accent={MONDE.accent} />

      {/* Les deux entrées du multijoueur : on ouvre une salle, ou on rejoint
          celle d'un ami. La création reprend le mode et la longueur choisis
          ci-dessus ; la zone se choisit ensuite. */}
      <div className={styles.multiplayer}>
        <Link href={`/salle?mode=${mode}&count=${count}`} className={styles.challenge}>
          <span aria-hidden="true">👥</span> Créer une partie
        </Link>
        <JoinDialog />
      </div>

      {mode === 'etats' ? (
        <>
          {/* En mode États, on ne choisit plus une zone mais le pays dont on
              cherche les régions. */}
          <h2 className="sectionTitle">Choisis ton pays</h2>
          <div className={styles.grid}>{REGION_SETS.map((category) => card(category))}</div>
        </>
      ) : (
        <>
          <h2 className="sectionTitle">Choisis ta zone</h2>

          {card(MONDE, true)}

          {/* Les continents vont deux par deux ; une grille garde la même largeur
              de carte même si la dernière ligne est incomplète. */}
          <div className={styles.grid}>{CONTINENTS.map((category) => card(category))}</div>
        </>
      )}
    </>
  );
}
