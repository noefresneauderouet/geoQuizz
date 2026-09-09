'use client';

import { useState } from 'react';

import { CategoryCard } from '@/components/category-card';
import { ModeSelector } from '@/components/mode-selector';
import { CATEGORIES, MODES, type CategoryId, type ModeId } from '@/constants/categories';
import { countriesOf } from '@/lib/countries';
import { useStats } from '@/lib/progress';
import { QUESTIONS_PER_ROUND } from '@/lib/quiz';

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
  const stats = useStats();

  const activeMode = MODES.find((m) => m.id === mode) ?? MODES[0];
  const bestOf = (categoryId: CategoryId) => stats.best[`${categoryId}:${mode}`] ?? null;

  return (
    <>
      <header>
        <h1 className={styles.brand}>GeoLearn</h1>
        <p className={styles.subtitle}>
          {activeMode.emoji} Je révise les {activeMode.plural}
        </p>
      </header>

      <ModeSelector value={mode} onChange={setMode} accent={MONDE.accent} />

      <h2 className="sectionTitle">Choisis ta zone</h2>

      <CategoryCard
        featured
        category={MONDE}
        countryCount={countriesOf(MONDE.id).length}
        best={bestOf(MONDE.id)}
        total={QUESTIONS_PER_ROUND}
        mode={mode}
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
            total={QUESTIONS_PER_ROUND}
            mode={mode}
          />
        ))}
      </div>

      <p className={styles.footnote}>
        {QUESTIONS_PER_ROUND} questions par partie · les fautes de frappe sont pardonnées
      </p>
    </>
  );
}
