'use client';

import Link from 'next/link';
import { useState } from 'react';

import { AppMenu } from '@/components/app-menu';
import { CategoryCard } from '@/components/category-card';
import { CountSelector } from '@/components/count-selector';
import { ModeSelector } from '@/components/mode-selector';
import { JoinDialog } from '@/components/multi/join-dialog';
import { RandomJoin } from '@/components/multi/random-join';
import { useLastGame } from '@/components/use-last-game';
import {
  CATEGORIES,
  isRegionSet,
  MODES,
  REGION_SETS,
  type Category,
  type CategoryId,
  type ModeId,
  type PlayId,
} from '@/constants/categories';
import { countriesOf } from '@/lib/countries';
import { DEFAULT_QUESTION_COUNT, type QuestionCount } from '@/lib/quiz';
import { regionSet } from '@/lib/regions';
import { isChosen, playCategory, toggleZone } from '@/lib/zones';

import styles from './zone-picker.module.css';

const [MONDE, ...CONTINENTS] = CATEGORIES;

/** « 196 pays », « 50 États », « 13 régions ». */
function sizeLabel(id: CategoryId): string {
  if (!isRegionSet(id)) return `${countriesOf(id).length} pays`;
  const { regions, plural } = regionSet(id);
  return `${regions.length} ${plural}`;
}

/**
 * Le choix d'une partie : un mode, une longueur, une ou plusieurs zones, puis
 * « Jouer ». Les parties à plusieurs viennent ensuite.
 *
 * Composant client, mais rendu à la compilation comme tout le reste : le HTML
 * livré contient déjà les six zones, le mode par défaut et le monde coché.
 * L'interaction et la dernière partie — qui vit dans le stockage local —
 * n'arrivent qu'à l'hydratation, sans que la page ait jamais été vide.
 */
export function ZonePicker() {
  /*
   * Tant qu'on n'a rien touché, l'accueil reprend les réglages de la dernière
   * partie, zones cochées comprises. Ils ne sont connus qu'après
   * l'hydratation (useLastGame) : les garder à part, plutôt que de les
   * recopier dans l'état par un effet, laisse le premier rendu identique au
   * HTML compilé.
   */
  const last = useLastGame();
  const [chosenMode, setMode] = useState<ModeId | null>(null);
  const [chosenCount, setCount] = useState<QuestionCount | null>(null);
  // Les zones des modes Drapeau, Capitale et Pays d'un côté, le pays du mode
  // États de l'autre : chacun retrouve son choix quand on revient à son mode.
  const [chosenZones, setZones] = useState<PlayId | null>(null);
  const [chosenSet, setSet] = useState<PlayId | null>(null);
  const mode = chosenMode ?? last?.mode ?? 'drapeau';
  const count = chosenCount ?? last?.count ?? DEFAULT_QUESTION_COUNT;
  const etats = mode === 'etats';
  const zones = chosenZones ?? (last && last.mode !== 'etats' ? last.category : MONDE.id);
  const set = chosenSet ?? (last?.mode === 'etats' ? last.category : REGION_SETS[0].id);
  const play = etats ? set : zones;

  const activeMode = MODES.find((m) => m.id === mode) ?? MODES[0];
  const choose = (id: CategoryId) => (etats ? setSet(id) : setZones(toggleZone(zones, id)));

  const card = (category: Category<CategoryId>, featured = false) => (
    <CategoryCard
      key={category.id}
      featured={featured}
      category={category}
      meta={sizeLabel(category.id)}
      selected={isChosen(play, category.id)}
      onSelect={() => choose(category.id)}
    />
  );

  return (
    <>
      <header className="pageHeader">
        <AppMenu />
        <span className={styles.logo} aria-hidden="true">
          🌍
        </span>
        <div>
          <h1 className={styles.brand}>GeoQuizz</h1>
          {/* D'un seul tenant : traduit par le navigateur, le texte suit
              encore le mode (voir src/app/layout.tsx). */}
          <p className={styles.subtitle}>{`Je révise les ${activeMode.plural}`}</p>
        </div>
      </header>

      <ModeSelector value={mode} onChange={setMode} accent={MONDE.accent} />
      <CountSelector value={count} onChange={setCount} accent={MONDE.accent} />

      {etats ? (
        <>
          {/* En mode États, on ne choisit plus une zone mais le pays dont on
              cherche les régions, un seul à la fois. */}
          <h2 className="sectionTitle">Choisis ton pays</h2>
          <div className={styles.grid}>{REGION_SETS.map((category) => card(category))}</div>
        </>
      ) : (
        <>
          <h2 className="sectionTitle">Choisis une ou plusieurs zones</h2>

          {card(MONDE, true)}

          {/* Les continents vont deux par deux ; le dernier, s'il reste seul
              (l'Océanie), prend toute la largeur. */}
          <div className={styles.grid}>{CONTINENTS.map((category) => card(category))}</div>
        </>
      )}

      {/* Les cartes ne lancent rien : on peut en cocher plusieurs. Le bouton
          reste à portée de pouce tant qu'on les parcourt (voir `.play`). */}
      <Link
        href={`/quiz?category=${play}&mode=${mode}&count=${count}`}
        className={styles.play}
        aria-label={`Jouer : ${playCategory(play).label}, ${count} questions`}>
        <span aria-hidden="true">▶</span> Jouer
      </Link>

      {/* Les entrées du multijoueur : on ouvre une salle, on rejoint celle
          d'un ami, ou une salle publique au hasard. La création reprend les
          réglages choisis ci-dessus ; ils se changent encore ensuite. */}
      <h2 className="sectionTitle">Parties à plusieurs</h2>
      <div className={styles.multiplayer}>
        <Link
          href={`/salle?mode=${mode}&count=${count}&category=${play}`}
          className={styles.tile}>
          <span className={styles.plus} aria-hidden="true">
            +
          </span>
          Créer une partie
        </Link>
        <JoinDialog className={styles.tile} />
        <RandomJoin className={styles.tile} />
      </div>
    </>
  );
}
