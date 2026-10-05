/**
 * Le tirage d'une manche et ce qu'affiche une question : src/lib/quiz.ts,
 * et le choix des zones et des modes (src/constants/categories.ts).
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  categoriesFor,
  CATEGORIES,
  getCategory,
  getMode,
  isRegionSet,
  REGION_SETS,
} from '@/constants/categories';
import { COUNTRIES } from '@/lib/countries';
import {
  answerDetail,
  answerLabel,
  buildRound,
  expectedAnswer,
  getQuestionCount,
  poolSize,
  questionKey,
  questionPrompt,
} from '@/lib/quiz';
import { seeded } from '@/lib/random';

import { countryQuestion, regionQuestion } from './helpers';

describe('getQuestionCount : la longueur lue dans l’adresse', () => {
  it('garde 10, 15 ou 20', () => {
    assert.equal(getQuestionCount('10'), 10);
    assert.equal(getQuestionCount('15'), 15);
    assert.equal(getQuestionCount('20'), 20);
  });

  it('ramène toute autre valeur à 10', () => {
    assert.equal(getQuestionCount('7'), 10);
    assert.equal(getQuestionCount('abc'), 10);
    assert.equal(getQuestionCount(''), 10);
    assert.equal(getQuestionCount(null), 10);
    assert.equal(getQuestionCount(undefined), 10);
  });
});

describe('poolSize : le nombre de questions différentes', () => {
  it('compte les pays d’une zone', () => {
    assert.equal(poolSize('monde', 'drapeau'), COUNTRIES.length);
    assert.equal(poolSize('oceanie', 'capitale'), 14);
  });

  it('compte les régions d’un pays en mode États', () => {
    assert.equal(poolSize('france', 'etats'), 13);
    assert.equal(poolSize('etats-unis', 'etats'), 50);
  });

  it('ne propose rien pour un couple qui ne va pas ensemble', () => {
    assert.equal(poolSize('europe', 'etats'), 0);
    assert.equal(poolSize('france', 'drapeau'), 0);
  });
});

describe('buildRound : le tirage d’une manche', () => {
  it('tire le nombre de questions demandé, toutes différentes', () => {
    const round = buildRound('monde', 'drapeau', 20);
    assert.equal(round.length, 20);
    assert.equal(new Set(round.map(questionKey)).size, 20);
  });

  it('ne tire que des pays de la zone, dans le mode choisi', () => {
    const round = buildRound('europe', 'capitale', 15);
    assert.ok(round.every((q) => q.country.continent === 'europe'));
    assert.ok(round.every((q) => q.mode === 'capitale'));
  });

  it('joue une petite zone en entier quand elle compte moins de questions', () => {
    assert.equal(buildRound('oceanie', 'pays', 20).length, 14);
    assert.equal(buildRound('france', 'etats', 20).length, 13);
  });

  it('pose des régions du pays en mode États', () => {
    const round = buildRound('espagne', 'etats', 10);
    assert.equal(round.length, 10);
    for (const q of round) {
      assert.equal(q.mode, 'etats');
      assert.equal(q.country.code, 'ES');
      if (q.mode === 'etats') assert.ok(q.region.code.startsWith('ES-'));
    }
  });

  it('rend une manche vide pour un couple qui ne va pas ensemble', () => {
    assert.deepEqual(buildRound('asie', 'etats', 10), []);
  });

  it('tire la même manche avec la même graine (multijoueur)', () => {
    const a = buildRound('monde', 'pays', 20, seeded(1234)).map(questionKey);
    const b = buildRound('monde', 'pays', 20, seeded(1234)).map(questionKey);
    const c = buildRound('monde', 'pays', 20, seeded(4321)).map(questionKey);
    assert.deepEqual(a, b);
    assert.notDeepEqual(a, c);
  });

  it('n’appelle pas Math.random quand une graine est fournie', (t) => {
    t.mock.method(Math, 'random', () => {
      throw new Error('Math.random appelé');
    });
    assert.doesNotThrow(() => buildRound('afrique', 'drapeau', 10, seeded(7)));
  });
});

describe('ce qu’affiche une question', () => {
  it('donne la consigne de chaque mode', () => {
    assert.equal(questionPrompt(countryQuestion('FR', 'drapeau')), 'À quel pays appartient ce drapeau ?');
    assert.equal(questionPrompt(countryQuestion('FR', 'pays')), 'Quel est le pays surligné ?');
    assert.equal(questionPrompt(countryQuestion('FR', 'capitale')), 'Quelle est la capitale de ce pays ?');
    assert.equal(questionPrompt(regionQuestion('etats-unis', 'US-AL')), 'Quel est l\'État surligné ?');
  });

  it('nomme le champ de réponse', () => {
    assert.equal(answerLabel(countryQuestion('FR', 'drapeau')), 'Pays');
    assert.equal(answerLabel(countryQuestion('FR', 'capitale')), 'Capitale');
    assert.equal(answerLabel(regionQuestion('france', 'FR-ARA')), 'Région');
  });

  it('donne la bonne réponse et son complément', () => {
    const paris = countryQuestion('FR', 'capitale');
    assert.equal(expectedAnswer(paris), 'Paris');
    assert.equal(answerDetail(paris), 'capitale de France');

    const flag = countryQuestion('FR', 'drapeau');
    assert.equal(expectedAnswer(flag), 'France');
    assert.equal(answerDetail(flag), 'France · capitale : Paris');

    const region = regionQuestion('france', 'FR-ARA');
    assert.equal(expectedAnswer(region), 'Auvergne-Rhône-Alpes');
    assert.equal(answerDetail(region), 'France · chef-lieu : Lyon');

    // Une municipalité chinoise est sa propre capitale.
    assert.equal(answerDetail(regionQuestion('chine', 'CN-BJ')), 'Chine');
  });

  it('identifie une région par son code, pas par son pays', () => {
    assert.equal(questionKey(countryQuestion('FR')), 'FR');
    assert.equal(questionKey(regionQuestion('france', 'FR-ARA')), 'FR-ARA');
  });
});

describe('zones et modes', () => {
  it('ramène un mode inconnu sur Drapeau', () => {
    assert.equal(getMode('capitale').id, 'capitale');
    assert.equal(getMode('nimporte').id, 'drapeau');
    assert.equal(getMode(undefined).id, 'drapeau');
  });

  it('accorde la zone au mode', () => {
    assert.equal(getCategory('europe', 'drapeau').id, 'europe');
    // Un lien « France » en mode Drapeau retombe sur le monde…
    assert.equal(getCategory('france', 'drapeau').id, 'monde');
    // … et un lien « Europe » en mode États sur le premier pays.
    assert.equal(getCategory('europe', 'etats').id, REGION_SETS[0].id);
    assert.equal(getCategory('france').id, 'france');
  });

  it('propose les pays en mode États, les zones sinon', () => {
    assert.equal(categoriesFor('etats'), REGION_SETS);
    assert.equal(categoriesFor('pays'), CATEGORIES);
    assert.equal(isRegionSet('chine'), true);
    assert.equal(isRegionSet('asie'), false);
  });
});
