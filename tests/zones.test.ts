/**
 * Plusieurs zones à la fois (src/lib/zones.ts) : comment un mélange de
 * continents s'écrit, se relit, se coche à l'accueil, et ce qu'il fait jouer.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { CATEGORIES, type PlayId } from '@/constants/categories';
import { COUNTRIES, countriesOf } from '@/lib/countries';
import { buildRound, poolSize } from '@/lib/quiz';
import { seeded } from '@/lib/random';
import {
  isChosen,
  isMix,
  mixesIn,
  mixOf,
  parsePlay,
  playCategory,
  toggleZone,
  zonesOf,
} from '@/lib/zones';

describe('mixOf : un mélange de continents', () => {
  it('s’écrit dans l’ordre de l’accueil, sans doublon', () => {
    assert.equal(mixOf(['europe', 'afrique']), 'afrique,europe');
    assert.equal(mixOf(['asie', 'asie', 'oceanie']), 'asie,oceanie');
  });

  it('redonne la zone quand il n’y a qu’un continent', () => {
    assert.equal(mixOf(['europe']), 'europe');
  });

  it('revient au monde sans aucun continent, ou avec les cinq', () => {
    assert.equal(mixOf([]), 'monde');
    assert.equal(mixOf(['afrique', 'amerique', 'asie', 'europe', 'oceanie']), 'monde');
  });
});

describe('parsePlay : ce qu’on joue, lu dans l’adresse', () => {
  it('lit une zone, un pays du mode États, ou un mélange', () => {
    assert.equal(parsePlay('europe', 'drapeau'), 'europe');
    assert.equal(parsePlay('france', 'etats'), 'france');
    assert.equal(parsePlay('afrique,europe', 'capitale'), 'afrique,europe');
    assert.equal(parsePlay('afrique,europe'), 'afrique,europe');
  });

  it('remet un mélange dans l’ordre', () => {
    assert.equal(parsePlay('europe,afrique', 'drapeau'), 'afrique,europe');
    assert.equal(parsePlay('oceanie,afrique,amerique,asie,europe', 'pays'), 'monde');
  });

  it('retombe comme une zone inconnue sur ce qui ne se lit pas', () => {
    assert.equal(parsePlay('afrique,atlantide', 'drapeau'), 'monde');
    assert.equal(parsePlay('monde,europe', 'drapeau'), 'monde');
    assert.equal(parsePlay('france,espagne', 'drapeau'), 'monde');
    assert.equal(parsePlay(null, 'drapeau'), 'monde');
  });

  it('ne mélange rien en mode États', () => {
    assert.equal(parsePlay('afrique,europe', 'etats'), 'etats-unis');
    assert.equal(parsePlay('france,espagne', 'etats'), 'etats-unis');
  });
});

describe('toggleZone : un appui sur une carte de l’accueil', () => {
  it('passe du monde à un continent', () => {
    assert.equal(toggleZone('monde', 'afrique'), 'afrique');
  });

  it('ajoute un continent aux autres, ou l’en retire', () => {
    assert.equal(toggleZone('afrique', 'europe'), 'afrique,europe');
    assert.equal(toggleZone('afrique,europe', 'asie'), 'afrique,asie,europe');
    assert.equal(toggleZone('afrique,europe', 'afrique'), 'europe');
  });

  it('revient au monde quand on décoche le dernier continent', () => {
    assert.equal(toggleZone('europe', 'europe'), 'monde');
  });

  it('choisit le monde quand on coche le cinquième continent', () => {
    assert.equal(toggleZone('afrique,amerique,asie,europe', 'oceanie'), 'monde');
  });

  it('prend le monde, ou un pays du mode États, seul', () => {
    assert.equal(toggleZone('afrique,europe', 'monde'), 'monde');
    assert.equal(toggleZone('etats-unis', 'france'), 'france');
  });

  it('dit quelles cartes sont cochées', () => {
    assert.equal(isChosen('afrique,europe', 'europe'), true);
    assert.equal(isChosen('afrique,europe', 'asie'), false);
    assert.equal(isChosen('afrique,europe', 'monde'), false);
    assert.equal(isChosen('monde', 'monde'), true);
  });
});

describe('la manche d’un mélange', () => {
  const mix: PlayId = 'afrique,europe';

  it('tire dans les pays de tous ses continents', () => {
    const both = countriesOf('afrique').length + countriesOf('europe').length;
    assert.equal(poolSize(mix, 'drapeau'), both);
    const round = buildRound(mix, 'capitale', 20, seeded(42));
    assert.equal(round.length, 20);
    for (const q of round) assert.ok(['afrique', 'europe'].includes(q.country.continent));
    assert.equal(new Set(round.map((q) => q.country.code)).size, 20);
  });

  it('est la même pour tous avec la même graine', () => {
    const codes = (seed: number) =>
      buildRound(mix, 'drapeau', 15, seeded(seed)).map((q) => q.country.code);
    assert.deepEqual(codes(7), codes(7));
  });

  it('n’offre rien en mode États', () => {
    assert.equal(poolSize(mix, 'etats'), 0);
  });

  it('les cinq continents réunis font bien le monde entier', () => {
    const all = CATEGORIES.slice(1).reduce((sum, c) => sum + countriesOf(c.id).length, 0);
    assert.equal(all, COUNTRIES.length);
  });
});

describe('playCategory : l’allure d’un mélange', () => {
  it('met bout à bout les noms et les emojis de ses continents', () => {
    const category = playCategory('afrique,europe');
    assert.equal(category.id, 'afrique,europe');
    assert.equal(category.label, 'Afrique + Europe');
    assert.equal(category.emoji, '🦁🏰');
  });

  it('prend la photo et la carte du monde', () => {
    const [world] = CATEGORIES;
    const category = playCategory('asie,oceanie');
    assert.equal(category.photo, world.photo);
    assert.deepEqual(category.map, world.map);
  });

  it('laisse une zone seule telle quelle', () => {
    assert.equal(playCategory('europe'), CATEGORIES.find((c) => c.id === 'europe'));
  });

  it('se reconnaît', () => {
    assert.equal(isMix('afrique,europe'), true);
    assert.equal(isMix('europe'), false);
    assert.deepEqual(zonesOf('afrique,europe'), ['afrique', 'europe']);
    assert.deepEqual(zonesOf('monde'), ['monde']);
  });
});

describe('mixesIn : les mélanges des records', () => {
  it('relève chaque mélange une fois, dans l’ordre de l’accueil', () => {
    const keys = [
      'europe:drapeau:10',
      'asie,europe:pays:15',
      'afrique,europe:drapeau:10',
      'afrique,europe:capitale:20',
      'afrique,asie,europe:drapeau:10',
      'europe,afrique:drapeau:10',
      'monde:drapeau:10',
    ];
    assert.deepEqual(mixesIn(keys), ['afrique,asie,europe', 'afrique,europe', 'asie,europe']);
  });
});
