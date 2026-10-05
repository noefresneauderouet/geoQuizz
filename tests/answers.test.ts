/**
 * La correction des réponses tapées : src/lib/normalize.ts et checkAnswer
 * (src/lib/quiz.ts).
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { levenshtein, matchAnswer, normalize } from '@/lib/normalize';
import { checkAnswer, isSolvedWhileTyping } from '@/lib/quiz';

import { countryQuestion, regionQuestion } from './helpers';

const exact = { correct: true, exact: true };
const approximate = { correct: true, exact: false };
const wrong = { correct: false, exact: false };

describe('normalize : ce qui ne compte pas dans une réponse', () => {
  it('ignore la casse, les accents et la ponctuation', () => {
    assert.equal(normalize('PÉROU'), normalize('perou'));
    assert.equal(normalize('Côte d’Ivoire'), normalize("cote d'ivoire"));
    assert.equal(normalize('Guinée-Bissau'), normalize('guinee bissau'));
  });

  it('ignore les articles, en français comme en anglais', () => {
    assert.equal(normalize('Corée du Nord'), 'coreenord');
    assert.equal(normalize('The Gambia'), normalize('Gambia'));
    assert.equal(normalize('La Valette'), normalize('Valette'));
  });

  it('ignore le mot « îles »', () => {
    assert.equal(normalize('Îles Marshall'), normalize('Marshall'));
  });

  it('écrit « Saint » et « St » de la même façon', () => {
    assert.equal(normalize('Saint-Vincent'), normalize('St Vincent'));
    assert.equal(normalize('St. Lucia'), normalize('Saint Lucia'));
  });

  it('rend une chaîne vide pour une saisie sans contenu', () => {
    assert.equal(normalize(''), '');
    assert.equal(normalize('  - , '), '');
    assert.equal(normalize('le la les'), '');
  });
});

describe('levenshtein : le nombre de fautes de frappe', () => {
  it('compte les lettres changées, ajoutées ou oubliées', () => {
    assert.equal(levenshtein('chine', 'chine'), 0);
    assert.equal(levenshtein('chine', 'chile'), 1);
    assert.equal(levenshtein('chine', 'chin'), 1);
    assert.equal(levenshtein('chine', 'cchine'), 1);
    assert.equal(levenshtein('kitten', 'sitting'), 3);
  });

  it('s’arrête dès que le plafond est dépassé', () => {
    assert.equal(levenshtein('a', 'abcdefgh', 3), 4);
    assert.equal(levenshtein('abcdef', 'uvwxyz', 2), 3);
  });
});

describe('matchAnswer : réponse exacte, rattrapée ou fausse', () => {
  it('reconnaît la réponse exacte et ses variantes', () => {
    assert.deepEqual(matchAnswer('allemagne', ['Allemagne']), exact);
    assert.deepEqual(matchAnswer('Germany', ['Allemagne', 'Germany']), exact);
  });

  it('accepte les articles collés au nom', () => {
    assert.deepEqual(matchAnswer('coreedunord', ['Corée du Nord']), exact);
  });

  it('ne pardonne aucune faute sous cinq lettres', () => {
    assert.deepEqual(matchAnswer('Omen', ['Oman']), wrong);
    assert.deepEqual(matchAnswer('Lime', ['Lima']), wrong);
  });

  it('pardonne une faute de cinq à neuf lettres, deux au-delà', () => {
    assert.deepEqual(matchAnswer('Tokio', ['Tokyo']), approximate);
    assert.deepEqual(matchAnswer('Allemagme', ['Allemagne']), approximate);
    assert.deepEqual(matchAnswer('Alemagme', ['Allemagne']), wrong);
    assert.deepEqual(matchAnswer('Azerbaidjen', ['Azerbaïdjan']), approximate);
    assert.deepEqual(matchAnswer('Azerbeidjen', ['Azerbaïdjan']), approximate);
    assert.deepEqual(matchAnswer('Azorbeidjon', ['Azerbaïdjan']), wrong);
  });

  it('refuse une saisie vide', () => {
    assert.deepEqual(matchAnswer('', ['Oman']), wrong);
    assert.deepEqual(matchAnswer('   ', ['Oman']), wrong);
  });
});

describe('checkAnswer : la touche Entrée', () => {
  it('accepte le nom du pays, ses alias et son nom anglais', () => {
    assert.deepEqual(checkAnswer(countryQuestion('DE'), 'Allemagne'), exact);
    assert.deepEqual(checkAnswer(countryQuestion('DE'), 'Germany'), exact);
    assert.deepEqual(checkAnswer(countryQuestion('GB'), 'Angleterre'), exact);
    assert.deepEqual(checkAnswer(countryQuestion('US'), 'USA'), exact);
    assert.deepEqual(checkAnswer(countryQuestion('CI'), 'Ivory Coast'), exact);
  });

  it('attend la capitale en mode Capitale, et accepte ses autres noms', () => {
    const china = countryQuestion('CN', 'capitale');
    assert.deepEqual(checkAnswer(china, 'Pékin'), exact);
    assert.deepEqual(checkAnswer(china, 'Beijing'), exact);
    assert.deepEqual(checkAnswer(china, 'Chine'), wrong);
    assert.deepEqual(checkAnswer(countryQuestion('BO', 'capitale'), 'La Paz'), exact);
  });

  it('rattrape une faute de frappe', () => {
    assert.deepEqual(checkAnswer(countryQuestion('DE'), 'Allemagme'), approximate);
  });

  it('ne prend jamais un autre pays pour une faute de frappe', () => {
    // Une seule lettre d'écart, mais ce sont deux pays.
    assert.deepEqual(checkAnswer(countryQuestion('IE'), 'Islande'), wrong);
    assert.deepEqual(checkAnswer(countryQuestion('IS'), 'Irlande'), wrong);
    assert.deepEqual(checkAnswer(countryQuestion('CL'), 'Chine'), wrong);
    assert.deepEqual(checkAnswer(countryQuestion('CN'), 'Chile'), wrong);
  });

  it('distingue les deux Congo', () => {
    assert.deepEqual(checkAnswer(countryQuestion('CG'), 'Congo'), exact);
    assert.deepEqual(checkAnswer(countryQuestion('CD'), 'RDC'), exact);
    assert.deepEqual(checkAnswer(countryQuestion('CD'), 'Congo'), wrong);
  });

  it('en mode États, ne prend pas une région voisine pour une faute', () => {
    const hubei = regionQuestion('chine', 'CN-HB');
    assert.deepEqual(checkAnswer(hubei, 'Hubei'), exact);
    assert.deepEqual(checkAnswer(hubei, 'Hebei'), wrong);
    assert.deepEqual(checkAnswer(hubei, 'Hubej'), approximate);
    assert.deepEqual(checkAnswer(regionQuestion('chine', 'CN-BJ'), 'Beijing'), exact);
  });

  it('refuse une réponse fausse ou vide', () => {
    assert.deepEqual(checkAnswer(countryQuestion('FR'), 'Espagne'), wrong);
    assert.deepEqual(checkAnswer(countryQuestion('FR'), ''), wrong);
  });
});

describe('isSolvedWhileTyping : la réponse trouvée sans appuyer sur Entrée', () => {
  it('valide la réponse exacte dès la dernière lettre', () => {
    assert.equal(isSolvedWhileTyping(countryQuestion('DE'), 'allemagne'), true);
    assert.equal(isSolvedWhileTyping(countryQuestion('US'), 'Etats Unis'), true);
  });

  it('ne valide ni un mot en cours d’écriture, ni une faute', () => {
    assert.equal(isSolvedWhileTyping(countryQuestion('DE'), 'Allemagn'), false);
    assert.equal(isSolvedWhileTyping(countryQuestion('DE'), 'Allemagme'), false);
  });
});
