/**
 * La mécanique d'une manche (src/lib/round.ts), commune au solo et au
 * multijoueur : trouver, passer, s'arrêter, et le chronomètre.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import type { Question } from '@/lib/quiz';
import { newGame, reducer, type Action, type Game } from '@/lib/round';
import { readWatch } from '@/lib/timer';

import { countryQuestion } from './helpers';

/** Allemagne, France, Japon : une manche de trois drapeaux. */
const ROUND: Question[] = [countryQuestion('DE'), countryQuestion('FR'), countryQuestion('JP')];

const play = (game: Game, ...actions: Action[]) => actions.reduce(reducer, game);

/** Tape la réponse et l'envoie avec Entrée. */
const answer = (text: string, now: number): Action[] => [
  { type: 'type', text, now },
  { type: 'submit', now },
];

const current = (game: Game) => game.round[game.queue[0]]?.country.code;

describe('une nouvelle manche', () => {
  it('commence à la première question, chronomètre lancé', () => {
    const game = newGame(ROUND, 1000);
    assert.deepEqual(game.queue, [0, 1, 2]);
    assert.equal(current(game), 'DE');
    assert.deepEqual(game.found, []);
    assert.equal(game.over, false);
    assert.equal(readWatch(game.watch, 4000), 3000);
  });
});

describe('trouver une réponse', () => {
  it('suffit de la taper : la question est trouvée sans Entrée', () => {
    const game = play(newGame(ROUND, 0), { type: 'type', text: 'Allemagne', now: 5000 });
    assert.deepEqual(game.solved, { approximate: false });
    assert.deepEqual(game.found, [0]);
    assert.equal(game.streak, 1);
    assert.equal(game.lastFoundMs, 5000);
  });

  it('ne valide pas un mot en cours d’écriture', () => {
    const game = play(newGame(ROUND, 0), { type: 'type', text: 'Allem', now: 1000 });
    assert.equal(game.solved, null);
    assert.equal(game.input, 'Allem');
  });

  it('accepte une faute de frappe à l’appui sur Entrée, en le signalant', () => {
    const game = play(newGame(ROUND, 0), ...answer('Allemagme', 2000));
    assert.deepEqual(game.solved, { approximate: true });
    assert.deepEqual(game.found, [0]);
  });

  it('compte les appuis sur Entrée sans succès', () => {
    const game = play(newGame(ROUND, 0), ...answer('Autriche', 1000), { type: 'submit', now: 2000 });
    assert.equal(game.solved, null);
    assert.equal(game.nudge, 2);
    assert.deepEqual(game.found, []);
  });

  it('ignore la saisie pendant que la réponse s’affiche', () => {
    const solved = play(newGame(ROUND, 0), { type: 'type', text: 'Allemagne', now: 1000 });
    assert.equal(play(solved, { type: 'type', text: 'x', now: 1100 }), solved);
    assert.equal(play(solved, { type: 'submit', now: 1100 }), solved);
  });

  it('passe à la question suivante, champ vidé', () => {
    const game = play(
      newGame(ROUND, 0),
      { type: 'type', text: 'Allemagne', now: 1000 },
      { type: 'advance', now: 1400 },
    );
    assert.equal(current(game), 'FR');
    assert.equal(game.input, '');
    assert.equal(game.solved, null);
    assert.equal(game.nudge, 0);
  });

  it('ne compte pas le temps passé à lire la correction', () => {
    const game = play(
      newGame(ROUND, 0),
      { type: 'type', text: 'Allemagne', now: 5000 }, // 5 s de recherche
      { type: 'advance', now: 6600 }, // 1,6 s de correction
      { type: 'type', text: 'France', now: 8600 }, // 2 s de recherche
    );
    assert.equal(game.lastFoundMs, 7000);
    assert.equal(readWatch(game.watch, 20_000), 7000);
  });

  it('termine la manche quand tout est trouvé', () => {
    const game = play(
      newGame(ROUND, 0),
      { type: 'type', text: 'Allemagne', now: 1000 },
      { type: 'advance', now: 1400 },
      { type: 'type', text: 'France', now: 2000 },
      { type: 'advance', now: 2400 },
      { type: 'type', text: 'Japon', now: 3000 },
      { type: 'advance', now: 3400 },
    );
    assert.equal(game.over, true);
    assert.deepEqual(game.queue, []);
    assert.deepEqual(game.found, [0, 1, 2]);
    assert.equal(game.bestStreak, 3);
  });

  it('n’avance pas tant que rien n’est trouvé', () => {
    const game = newGame(ROUND, 0);
    assert.equal(play(game, { type: 'advance', now: 1000 }), game);
  });
});

describe('passer une question', () => {
  it('la renvoie en fin de file et remet la série à zéro', () => {
    const game = play(
      newGame(ROUND, 0),
      { type: 'type', text: 'Allemagne', now: 1000 },
      { type: 'advance', now: 1400 },
      { type: 'type', text: 'Fran', now: 2000 },
      { type: 'skip' },
    );
    assert.deepEqual(game.queue, [2, 1]);
    assert.equal(current(game), 'JP');
    assert.deepEqual(game.skipped, [1]);
    assert.equal(game.streak, 0);
    assert.equal(game.bestStreak, 1);
    assert.equal(game.input, '');
  });

  it('ne compte une question passée qu’une fois', () => {
    const game = play(newGame(ROUND, 0), { type: 'skip' }, { type: 'skip' }, { type: 'skip' });
    assert.deepEqual(game.queue, [0, 1, 2]);
    assert.deepEqual(game.skipped, [0, 1, 2]);
    assert.deepEqual(play(game, { type: 'skip' }).skipped, [0, 1, 2]);
  });

  it('est impossible sur la dernière question', () => {
    const last = play(
      newGame(ROUND, 0),
      { type: 'type', text: 'Allemagne', now: 1000 },
      { type: 'advance', now: 1400 },
      { type: 'type', text: 'France', now: 2000 },
      { type: 'advance', now: 2400 },
    );
    assert.equal(play(last, { type: 'skip' }), last);
  });

  it('est impossible pendant que la réponse s’affiche', () => {
    const solved = play(newGame(ROUND, 0), { type: 'type', text: 'Allemagne', now: 1000 });
    assert.equal(play(solved, { type: 'skip' }), solved);
  });
});

describe('arrêter la manche', () => {
  it('fige le chronomètre et refuse toute réponse', () => {
    const ended = play(newGame(ROUND, 0), { type: 'end', now: 9000 });
    assert.equal(ended.over, true);
    assert.equal(readWatch(ended.watch, 50_000), 9000);
    assert.equal(play(ended, { type: 'type', text: 'Allemagne', now: 9500 }), ended);
    assert.equal(play(ended, { type: 'end', now: 9900 }), ended);
  });

  it('repart de zéro avec une nouvelle manche', () => {
    const ended = play(newGame(ROUND, 0), { type: 'end', now: 9000 });
    const again = play(ended, { type: 'restart', round: ROUND.slice(0, 2), now: 10_000 });
    assert.equal(again.over, false);
    assert.deepEqual(again.queue, [0, 1]);
    assert.equal(readWatch(again.watch, 10_500), 500);
  });
});

describe('le zoom de la carte', () => {
  it('bascule, puis revient à la vue de départ à la question suivante', () => {
    const zoomed = play(newGame(ROUND, 0), { type: 'zoom' });
    assert.equal(zoomed.zoomToggled, true);
    assert.equal(play(zoomed, { type: 'zoom' }).zoomToggled, false);
    assert.equal(play(zoomed, { type: 'skip' }).zoomToggled, false);
    assert.equal(play(zoomed, { type: 'type', text: 'Allemagne', now: 1000 }).zoomToggled, false);
  });
});
