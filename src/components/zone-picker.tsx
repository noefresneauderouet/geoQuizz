'use client';

import Link from 'next/link';
import { useState } from 'react';

import { CategoryCard } from '@/components/category-card';
import { CountSelector } from '@/components/count-selector';
import { ModeSelector } from '@/components/mode-selector';
import { JoinDialog } from '@/components/multi/join-dialog';
import { CATEGORIES, MODES, type CategoryId, type ModeId } from '@/constants/categories';
import { countriesOf } from '@/lib/countries';
import { scoreKey, useStats } from '@/lib/progress';
import { DEFAULT_QUESTION_COUNT, type QuestionCount } from '@/lib/quiz';

import styles from './zone-picker.module.css';

const [MONDE, ...CONTINENTS] = CATEGORIES;

/**
 * Le choix d'une partie : un mode, puis une zone.
 *
 * Composant client, mais rendu à la compilation comme tout le reste : le HTML
 * livré contient déjà les six zones et le mode par défaut. L'interaction et
 * les meilleurs scores — qui vivent dans le stockage local — n'arrivent qu'à
 * l'hydratation, sans que la page ait jamais été vide.
 */
export function ZonePicker() {
  const [mode, setMode] = useState<ModeId>('drapeau');
  const [count, setCount] = useState<QuestionCount>(DEFAULT_QUESTION_COUNT);
  const stats = useStats();

  const activeMode = MODES.find((m) => m.id === mode) ?? MODES[0];
  // Une zone plus petite que la longueur choisie se joue en entier : c'est
  // cette longueur réelle qui porte le record.
  const lengthOf = (categoryId: CategoryId) => Math.min(count, countriesOf(categoryId).length);
  const bestOf = (categoryId: CategoryId) =>
    stats.best[scoreKey(categoryId, mode, lengthOf(categoryId))] ?? null;

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

      <h2 className="sectionTitle">Choisis ta zone</h2>

      <CategoryCard
        featured
        category={MONDE}
        countryCount={countriesOf(MONDE.id).length}
        best={bestOf(MONDE.id)}
        total={lengthOf(MONDE.id)}
        mode={mode}
        count={count}
      />

      {/* Les continents vont deux par deux ; une grille garde la même largeur
          de carte même si la dernière ligne est incomplète. */}
      <div className={styles.grid}>
        {CONTINENTS.map((category) => (
          <CategoryCard
            key={category.id}
            category={category}
            countryCount={countriesOf(category.id).length}
            best={bestOf(category.id)}
            total={lengthOf(category.id)}
            mode={mode}
            count={count}
          />
        ))}
      </div>

    </>
  );
}
